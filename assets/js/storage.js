
/* =====================================================
   LENS CIRCLE
   Supabase Storage Utilities
   File: assets/js/storage.js

   Dependencies:
   1. Supabase JS SDK v2
   2. assets/js/supabase-client.js
   3. assets/js/auth.js

   Storage buckets to create in Supabase:
   - profile-images
   - photo-submissions
   - competition-entries
   - exhibition-images

   IMPORTANT:
   Storage policies must enforce access permissions.
   Never use the service-role key in browser code.
   ===================================================== */

(function () {
  "use strict";

  // ----------------------------------------------------
  // 1. DEPENDENCY CHECK
  // ----------------------------------------------------

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

  // ----------------------------------------------------
  // 2. STORAGE CONFIGURATION
  // ----------------------------------------------------

  const BUCKETS = Object.freeze({
    profiles: "profile-images",
    submissions: "photo-submissions",
    competitions: "competition-entries",
    exhibitions: "exhibition-images"
  });

  const MAX_FILE_SIZE = 10 * 1024 * 1024;

  const ALLOWED_TYPES = [
    "image/jpeg",
    "image/png",
    "image/webp"
  ];

  // ----------------------------------------------------
  // 3. FILE VALIDATION
  // ----------------------------------------------------

  Storage.validateImage = function (
    file,
    options
  ) {
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

    if (file.size > maxSize) {
      throw new Error(
        "Image exceeds the permitted file size."
      );
    }

    if (file.size <= 0) {
      throw new Error("The selected image is empty.");
    }

    return true;
  };

  // ----------------------------------------------------
  // 4. GENERATE SAFE FILE NAME
  // ----------------------------------------------------

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

    return (
      crypto.randomUUID() +
      "." +
      extension
    );
  };

  // ----------------------------------------------------
  // 5. GET AUTHENTICATED USER
  // ----------------------------------------------------

  async function getUserId() {
    const user =
      await window.LensCircleAuth.getUser();

    if (!user) {
      throw new Error(
        "Please sign in before uploading images."
      );
    }

    return user.id;
  }

  // ----------------------------------------------------
  // 6. UPLOAD IMAGE
  // ----------------------------------------------------

  Storage.uploadImage = async function (
    bucket,
    file,
    options
  ) {
    options = options || {};

    const validBuckets = Object.values(BUCKETS);

    if (!validBuckets.includes(bucket)) {
      throw new Error("Invalid storage bucket.");
    }

    Storage.validateImage(file, options);

    const userId = await getUserId();

    const fileName = Storage.createFileName(file);

    const folder = options.folder || userId;

    // Prevent path traversal and unexpected characters.
    if (
      typeof folder !== "string" ||
      !/^[a-zA-Z0-9_-]+$/.test(folder)
    ) {
      throw new Error("Invalid storage folder.");
    }

    const filePath =
      folder + "/" + fileName;

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

  // ----------------------------------------------------
  // 7. PROFILE IMAGE UPLOAD
  // ----------------------------------------------------

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

  // ----------------------------------------------------
  // 8. PHOTOGRAPHY SUBMISSION UPLOAD
  // ----------------------------------------------------

  Storage.uploadSubmission = async function (file) {
    const userId = await getUserId();

    return Storage.uploadImage(
      BUCKETS.submissions,
      file,
      {
        folder: userId
      }
    );
  };

  // ----------------------------------------------------
  // 9. COMPETITION ENTRY UPLOAD
  // ----------------------------------------------------

  Storage.uploadCompetitionEntry = async function (
    competitionId,
    file
  ) {
    const userId = await getUserId();

    if (
      typeof competitionId !== "string" ||
      !/^[a-zA-Z0-9_-]+$/.test(competitionId)
    ) {
      throw new Error("Invalid competition identifier.");
    }

    return Storage.uploadImage(
      BUCKETS.competitions,
      file,
      {
        folder: competitionId + "/" + userId
      }
    );
  };

  // ----------------------------------------------------
  // 10. EXHIBITION IMAGE UPLOAD
  // ----------------------------------------------------

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
      throw new Error("Invalid exhibition identifier.");
    }

    return Storage.uploadImage(
      BUCKETS.exhibitions,
      file,
      {
        folder: exhibitionId + "/" + userId
      }
    );
  };

  // ----------------------------------------------------
  // 11. GET PUBLIC IMAGE URL
  // ----------------------------------------------------

  Storage.getPublicUrl = function (
    bucket,
    filePath
  ) {
    const validBuckets = Object.values(BUCKETS);

    if (!validBuckets.includes(bucket)) {
      throw new Error("Invalid storage bucket.");
    }

    const { data } = db.storage
      .from(bucket)
      .getPublicUrl(filePath);

    return data.publicUrl;
  };

  // ----------------------------------------------------
  // 12. GET SIGNED IMAGE URL
  // ----------------------------------------------------

  Storage.getSignedUrl = async function (
    bucket,
    filePath,
    expiresIn
  ) {
    const validBuckets = Object.values(BUCKETS);

    if (!validBuckets.includes(bucket)) {
      throw new Error("Invalid storage bucket.");
    }

    const { data, error } = await db.storage
      .from(bucket)
      .createSignedUrl(
        filePath,
        expiresIn || 3600
      );

    if (error) {
      throw error;
    }

    return data.signedUrl;
  };

  // ----------------------------------------------------
  // 13. DELETE OWN IMAGE
  // ----------------------------------------------------

  Storage.deleteOwnImage = async function (
    bucket,
    filePath
  ) {
    const validBuckets = Object.values(BUCKETS);

    if (!validBuckets.includes(bucket)) {
      throw new Error("Invalid storage bucket.");
    }

    const userId = await getUserId();

    if (
      typeof filePath !== "string" ||
      !filePath.startsWith(userId + "/")
    ) {
      throw new Error(
        "You can only request deletion of your own files."
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

  // ----------------------------------------------------
  // 14. CREATE LOCAL IMAGE PREVIEW
  // ----------------------------------------------------

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

  // ----------------------------------------------------
  // 15. EXPOSE BUCKET NAMES
  // ----------------------------------------------------

  Storage.buckets = BUCKETS;

  console.info(
    "Lens Circle: Storage utilities loaded."
  );

})();
