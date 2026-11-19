
/* =====================================================
   LENS CIRCLE
   Supabase Storage Utilities
   File: assets/js/storage.js

   Dependencies:
   - Supabase JS SDK v2
   - assets/js/supabase-client.js
   - assets/js/auth.js

   Photography storage:
   - pod-submissions-private: private new submissions
   - pod-photos: public approved photographs

   Never use the service-role key in browser code.
   ===================================================== */

(function () {
  "use strict";

  // 1. DEPENDENCY CHECK
  if (
    !window.LensCircle ||
    !window.LensCircle.configured ||
    !window.LensCircleAuth
  ) {
    console.error(
      "Lens Circle Storage: Required dependencies missing."
    );
    return;
  }

  const db = window.LensCircle.db;
  const Storage = window.LensCircleStorage = {};

  // 2. STORAGE CONFIGURATION
  const BUCKETS = Object.freeze({
    profiles: "profile-images",
    submissions: "pod-submissions-private",
    podPhotos: "pod-photos",
    competitions: "competition-entries",
    exhibitions: "exhibition-images"
  });

  const MAX_FILE_SIZE = 10 * 1024 * 1024;

  const ALLOWED_TYPES = Object.freeze([
    "image/jpeg",
    "image/png",
    "image/webp"
  ]);

  // 3. FILE VALIDATION
  Storage.validateImage = function (file, options) {
    options = options || {};

    if (!file) {
      throw new Error("Please select an image.");
    }

    const allowedTypes =
      options.allowedTypes || ALLOWED_TYPES;

    const maxSize =
      options.maxSize || MAX_FILE_SIZE;

    if (!allowedTypes.includes(file.type)) {
      throw new Error(
        "Only JPG, PNG and WebP images are supported."
      );
    }

    if (!Number.isFinite(file.size) || file.size <= 0) {
      throw new Error("The selected image is empty.");
    }

    if (file.size > maxSize) {
      throw new Error(
        "Image exceeds the permitted file size."
      );
    }

    return true;
  };

  // 4. SAFE FILE NAME
  Storage.createFileName = function (file) {
    const extensionMap = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp"
    };

    const extension = extensionMap[file.type];

    if (!extension) {
      throw new Error("Unsupported image format.");
    }

    return crypto.randomUUID() + "." + extension;
  };

  // 5. AUTHENTICATED USER
  async function getUserId() {
    const user =
      await window.LensCircleAuth.getUser();

    if (!user || !user.id) {
      throw new Error(
        "Please sign in before uploading images."
      );
    }

    return user.id;
  }

  // 6. VALIDATE BUCKET
  function validateBucket(bucket) {
    if (!Object.values(BUCKETS).includes(bucket)) {
      throw new Error("Invalid storage bucket.");
    }
  }

  // 7. VALIDATE FOLDER
  function validateFolder(folder) {
    if (
      typeof folder !== "string" ||
      !folder ||
      folder.startsWith("/") ||
      folder.endsWith("/") ||
      folder.includes("..") ||
      !/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(folder)
    ) {
      throw new Error("Invalid storage folder.");
    }

    return folder;
  }

  // 8. GENERIC IMAGE UPLOAD
  Storage.uploadImage = async function (
    bucket,
    file,
    options
  ) {
    options = options || {};

    validateBucket(bucket);
    Storage.validateImage(file, options);

    const userId = await getUserId();

    // Private POD uploads must always belong to
    // the authenticated user's own top-level folder.
    let folder;

    if (bucket === BUCKETS.submissions) {
      folder = userId;
    } else {
      folder = options.folder || userId;
      validateFolder(folder);
    }

    const fileName = Storage.createFileName(file);
    const filePath = folder + "/" + fileName;

    const { data, error } = await db.storage
      .from(bucket)
      .upload(filePath, file, {
        cacheControl: "3600",
        contentType: file.type,
        upsert: false
      });

    if (error) {
      throw error;
    }

    return {
      bucket: bucket,
      path: data.path,
      fileName: fileName,
      size: file.size,
      contentType: file.type
    };
  };

  // 9. PROFILE IMAGE UPLOAD
  Storage.uploadProfileImage = async function (file) {
    const userId = await getUserId();

    return Storage.uploadImage(
      BUCKETS.profiles,
      file,
      {
        folder: userId,
        maxSize: 5 * 1024 * 1024
      }
    );
  };

  // 10. PRIVATE PHOTOGRAPHY SUBMISSION
  Storage.uploadSubmission = async function (file) {
    return Storage.uploadImage(
      BUCKETS.submissions,
      file,
      {
        maxSize: MAX_FILE_SIZE
      }
    );
  };

  // 11. COMPETITION ENTRY UPLOAD
  Storage.uploadCompetitionEntry = async function (
    competitionId,
    file
  ) {
    const userId = await getUserId();

    if (
      typeof competitionId !== "string" ||
      !/^[a-zA-Z0-9_-]+$/.test(competitionId)
    ) {
      throw new Error(
        "Invalid competition identifier."
      );
    }

    return Storage.uploadImage(
      BUCKETS.competitions,
      file,
      {
        folder: competitionId + "/" + userId
      }
    );
  };

  // 12. EXHIBITION IMAGE UPLOAD
  Storage.uploadExhibitionImage = async function (
    exhibitionId,
    file
  ) {
    const userId = await getUserId();

    const authorised =
      await window.LensCircleAuth.hasRole("admin");

    if (!authorised) {
      throw new Error(
        "Admin authorisation is required for exhibition uploads."
      );
    }

    if (
      typeof exhibitionId !== "string" ||
      !/^[a-zA-Z0-9_-]+$/.test(exhibitionId)
    ) {
      throw new Error(
        "Invalid exhibition identifier."
      );
    }

    return Storage.uploadImage(
      BUCKETS.exhibitions,
      file,
      {
        folder: exhibitionId + "/" + userId
      }
    );
  };

  // 13. GET PUBLIC IMAGE URL
  Storage.getPublicUrl = function (
    bucket,
    filePath
  ) {
    validateBucket(bucket);

    if (bucket === BUCKETS.submissions) {
      throw new Error(
        "Private submissions cannot use public URLs. Use getSignedUrl."
      );
    }

    if (
      typeof filePath !== "string" ||
      !filePath.trim()
    ) {
      throw new Error("Invalid image path.");
    }

    const { data } = db.storage
      .from(bucket)
      .getPublicUrl(filePath);

    return data.publicUrl;
  };

  // 14. GET SIGNED IMAGE URL
  Storage.getSignedUrl = async function (
    bucket,
    filePath,
    expiresIn
  ) {
    validateBucket(bucket);

    if (
      typeof filePath !== "string" ||
      !filePath.trim()
    ) {
      throw new Error("Invalid image path.");
    }

    const duration = Number(expiresIn) || 3600;

    if (
      !Number.isInteger(duration) ||
      duration < 1 ||
      duration > 86400
    ) {
      throw new Error(
        "Signed URL duration must be between 1 and 86400 seconds."
      );
    }

    const { data, error } = await db.storage
      .from(bucket)
      .createSignedUrl(filePath, duration);

    if (error) {
      throw error;
    }

    return data.signedUrl;
  };

  // 15. DELETE OWN IMAGE
  Storage.deleteOwnImage = async function (
    bucket,
    filePath
  ) {
    validateBucket(bucket);

    if (
      typeof filePath !== "string" ||
      !filePath.trim()
    ) {
      throw new Error("Invalid image path.");
    }

    const userId = await getUserId();

    // Private POD and profile files use userId as
    // their first folder.
    if (
      bucket === BUCKETS.submissions ||
      bucket === BUCKETS.profiles
    ) {
      if (!filePath.startsWith(userId + "/")) {
        throw new Error(
          "You can only request deletion of your own files."
        );
      }
    } else if (bucket === BUCKETS.competitions) {
      const parts = filePath.split("/");

      if (parts.length < 2 || parts[1] !== userId) {
        throw new Error(
          "You can only request deletion of your own competition files."
        );
      }
    } else {
      throw new Error(
        "Deletion from this bucket requires an authorised workflow."
      );
    }

    const { data, error } = await db.storage
      .from(bucket)
      .remove([filePath]);

    if (error) {
      throw error;
    }

    return data;
  };

  // 16. LOCAL IMAGE PREVIEW
  Storage.createPreview = function (file) {
    Storage.validateImage(file);

    return URL.createObjectURL(file);
  };

  Storage.revokePreview = function (previewUrl) {
    if (
      typeof previewUrl === "string" &&
      previewUrl.startsWith("blob:")
    ) {
      URL.revokeObjectURL(previewUrl);
    }
  };

  // 17. EXPOSE CONFIGURATION
  Storage.buckets = BUCKETS;

  console.info(
    "Lens Circle: Storage utilities loaded."
  );

})();
