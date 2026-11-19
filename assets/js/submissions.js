
/* =====================================================
   LENS CIRCLE
   Photography Submission Management
   File: assets/js/submissions.js

   Dependencies:
   - supabase-client.js
   - auth.js
   - storage.js
   - helpers.js (optional)

   Database:
   - public.photos
   - public.submit_photo_entry(...)

   Storage:
   - pod-submissions-private

   Supported activities:
   - Photo of the Day
   - Weekly Challenge
   - Monthly Theme
   - Photography Battle

   Database RLS and protected RPCs enforce security.
   ===================================================== */

(function () {
  "use strict";

  // 1. DEPENDENCY CHECK
  if (
    !window.LensCircle ||
    !window.LensCircle.configured ||
    !window.LensCircleAuth ||
    !window.LensCircleStorage
  ) {
    console.error(
      "Lens Circle Submissions: Dependencies missing."
    );
    return;
  }

  const db = window.LensCircle.db;
  const Storage = window.LensCircleStorage;

  const Submissions =
    window.LensCircleSubmissions = {};

  // 2. SUBMISSION TYPES
  const TYPES = Object.freeze({
    photo_of_the_day: {
      label: "Photo of the Day"
    },
    weekly_challenge: {
      label: "Weekly Challenge"
    },
    monthly_theme: {
      label: "Monthly Theme"
    },
    photography_battle: {
      label: "Photography Battle"
    }
  });

  const VALID_STATUSES = Object.freeze([
    "pending",
    "approved",
    "rejected"
  ]);

  const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  // 3. PUBLIC CONFIGURATION
  Submissions.types = TYPES;
  Submissions.statuses = VALID_STATUSES;

  Submissions.getTypes = function () {
    return Object.entries(TYPES).map(
      ([id, config]) => ({
        id: id,
        label: config.label
      })
    );
  };

  Submissions.isValidType = function (type) {
    return Object.prototype.hasOwnProperty.call(
      TYPES,
      type
    );
  };

  Submissions.isValidStatus = function (status) {
    return VALID_STATUSES.includes(status);
  };

  Submissions.getTypeLabel = function (type) {
    return TYPES[type]?.label ||
      "Photography Submission";
  };

  Submissions.getStatusLabel = function (status) {
    const labels = {
      pending: "Awaiting Review",
      approved: "Approved",
      rejected: "Not Selected"
    };

    return labels[status] || "Unknown Status";
  };

  // 4. CURRENT USER
  async function getCurrentUser() {
    const user =
      await window.LensCircleAuth.getUser();

    if (!user || !user.id) {
      throw new Error(
        "Please sign in before submitting photographs."
      );
    }

    return user;
  }

  // 5. VALIDATE SUBMISSION DETAILS
  Submissions.validate = function (details) {
    if (!details || typeof details !== "object") {
      throw new Error(
        "Submission details are required."
      );
    }

    if (!Submissions.isValidType(details.type)) {
      throw new Error(
        "Invalid photography activity."
      );
    }

    if (
      typeof details.title !== "string" ||
      details.title.trim().length < 2 ||
      details.title.trim().length > 120
    ) {
      throw new Error(
        "Title must contain 2–120 characters."
      );
    }

    if (
      typeof details.photographer !== "string" ||
      details.photographer.trim().length < 1 ||
      details.photographer.trim().length > 80
    ) {
      throw new Error(
        "Photographer name must contain 1–80 characters."
      );
    }

    if (
      details.activityId &&
      (
        typeof details.activityId !== "string" ||
        !UUID_PATTERN.test(details.activityId)
      )
    ) {
      throw new Error(
        "Activity ID must be a valid UUID."
      );
    }

    if (
      details.caption != null &&
      (
        typeof details.caption !== "string" ||
        details.caption.length > 1000
      )
    ) {
      throw new Error(
        "Caption cannot exceed 1000 characters."
      );
    }

    if (
      details.description != null &&
      (
        typeof details.description !== "string" ||
        details.description.length > 2000
      )
    ) {
      throw new Error(
        "Description cannot exceed 2000 characters."
      );
    }

    if (
      details.category != null &&
      (
        typeof details.category !== "string" ||
        details.category.length > 80
      )
    ) {
      throw new Error(
        "Category cannot exceed 80 characters."
      );
    }

    if (!details.file) {
      throw new Error(
        "Please select a photograph."
      );
    }

    Storage.validateImage(details.file, {
      maxSize: 10 * 1024 * 1024
    });

    return true;
  };

  // 6. SUBMIT PHOTOGRAPH
  Submissions.submit = async function (details) {
    Submissions.validate(details);

    await getCurrentUser();

    let uploadedFile = null;

    try {
      // Upload into the authenticated member's
      // private storage folder.
      uploadedFile =
        await Storage.uploadSubmission(details.file);

      if (
        uploadedFile.bucket !==
        Storage.buckets.submissions
      ) {
        throw new Error(
          "Photograph was not uploaded to the private submissions bucket."
        );
      }

      // Create the database record through the
      // protected server-side submission function.
      const { data, error } = await db.rpc(
        "submit_photo_entry",
        {
          p_photographer:
            details.photographer.trim(),

          p_title:
            details.title.trim(),

          p_image_path:
            uploadedFile.path,

          p_submission_type:
            details.type,

          p_activity_id:
            details.activityId || null,

          p_caption:
            (details.caption || "").trim() || null,

          p_description:
            (details.description || "").trim() || null,

          p_category:
            (details.category || "").trim() || null
        }
      );

      if (error) {
        throw error;
      }

      return {
        success: true,
        photoId: data,
        status: "pending",
        message:
          "Your photograph has been submitted for review.",
        uploadedFile: uploadedFile
      };

    } catch (error) {
      console.error(
        "Lens Circle submission failed:",
        error
      );

      /*
        Do not automatically delete the uploaded object
        here. The existing deletion policy requires a
        matching pending/rejected database record.
        A failed RPC may leave an orphaned upload.
        A controlled cleanup process will handle it.
      */

      throw error;
    }
  };

  // 7. GET MY SUBMISSIONS
  Submissions.getMine = async function (options) {
    options = options || {};

    const user = await getCurrentUser();

    if (
      options.type &&
      !Submissions.isValidType(options.type)
    ) {
      throw new Error(
        "Invalid submission type filter."
      );
    }

    if (
      options.status &&
      !Submissions.isValidStatus(options.status)
    ) {
      throw new Error(
        "Invalid submission status filter."
      );
    }

    const limit = Math.min(
      Math.max(Number(options.limit) || 50, 1),
      100
    );

    const offset = Math.max(
      Number(options.offset) || 0,
      0
    );

    let query = db
      .from("photos")
      .select(
        [
          "id",
          "photographer",
          "title",
          "image_path",
          "storage_bucket",
          "votes",
          "status",
          "description",
          "category",
          "submission_type",
          "activity_id",
          "caption",
          "rejection_reason",
          "created_at",
          "reviewed_at"
        ].join(",")
      )
      .eq("user_id", user.id)
      .order("created_at", {
        ascending: false
      })
      .range(offset, offset + limit - 1);

    if (options.type) {
      query = query.eq(
        "submission_type",
        options.type
      );
    }

    if (options.status) {
      query = query.eq(
        "status",
        options.status
      );
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    const submissions = data || [];

    // Private submissions need short-lived signed URLs.
    const enriched = await Promise.all(
      submissions.map(async function (photo) {
        const result = Object.assign({}, photo);

        try {
          if (
            photo.storage_bucket ===
            Storage.buckets.submissions
          ) {
            result.image_url =
              await Storage.getSignedUrl(
                photo.storage_bucket,
                photo.image_path,
                3600
              );

          } else {
            result.image_url =
              Storage.getPublicUrl(
                photo.storage_bucket || "pod-photos",
                photo.image_path
              );
          }
        } catch (error) {
          console.warn(
            "Could not create image URL for photo:",
            photo.id,
            error
          );

          result.image_url = null;
        }

        return result;
      })
    );

    return enriched;
  };

  // 8. GET ONE SUBMISSION
  Submissions.getById = async function (photoId) {
    const user = await getCurrentUser();

    if (
      photoId === null ||
      photoId === undefined ||
      !/^\d+$/.test(String(photoId))
    ) {
      throw new Error(
        "Invalid photograph identifier."
      );
    }

    const { data, error } = await db
      .from("photos")
      .select(
        "id, photographer, title, image_path, storage_bucket, votes, status, description, category, submission_type, activity_id, caption, rejection_reason, created_at, reviewed_at"
      )
      .eq("id", Number(photoId))
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      throw new Error(
        "Submission not found or access denied."
      );
    }

    if (
      data.storage_bucket ===
      Storage.buckets.submissions
    ) {
      data.image_url =
        await Storage.getSignedUrl(
          data.storage_bucket,
          data.image_path,
          3600
        );
    } else {
      data.image_url =
        Storage.getPublicUrl(
          data.storage_bucket || "pod-photos",
          data.image_path
        );
    }

    return data;
  };

  // 9. STATUS LABELS
  Submissions.getStatusClass = function (status) {
    return "lc-status-" +
      (
        Submissions.isValidStatus(status)
          ? status
          : "pending"
      );
  };

  // 10. FORMAT SUBMISSION DATE
  Submissions.formatDate = function (value) {
    if (window.LensCircleHelpers) {
      return window.LensCircleHelpers.formatIST(value);
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "—";
    }

    return new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      dateStyle: "medium",
      timeStyle: "short"
    }).format(date);
  };

  // 11. RENDER SUBMISSION HISTORY
  Submissions.renderMine = function (
    container,
    submissions
  ) {
    if (typeof container === "string") {
      container =
        document.querySelector(container);
    }

    if (!container) {
      throw new Error(
        "Submission container was not found."
      );
    }

    container.replaceChildren();

    if (
      !Array.isArray(submissions) ||
      submissions.length === 0
    ) {
      const empty =
        document.createElement("div");

      empty.className = "lc-empty-state";

      const heading =
        document.createElement("h3");

      heading.textContent = "No submissions yet";

      const message =
        document.createElement("p");

      message.textContent =
        "Your photography submissions will appear here.";

      empty.append(heading, message);
      container.appendChild(empty);

      return;
    }

    submissions.forEach(function (submission) {
      const card =
        document.createElement("article");

      card.className = "lc-submission-card";

      const image =
        document.createElement("img");

      image.className = "lc-submission-image";
      image.alt = submission.title || "Submitted photograph";
      image.loading = "lazy";

      if (submission.image_url) {
        image.src = submission.image_url;
      }

      const title =
        document.createElement("h3");

      title.textContent =
        submission.title || "Untitled photograph";

      const photographer =
        document.createElement("p");

      photographer.textContent =
        "By " + (submission.photographer || "Unknown");

      const type =
        document.createElement("p");

      type.textContent =
        Submissions.getTypeLabel(
          submission.submission_type
        );

      const status =
        document.createElement("span");

      status.className =
        "lc-submission-status " +
        Submissions.getStatusClass(
          submission.status
        );

      status.textContent =
        Submissions.getStatusLabel(
          submission.status
        );

      const date =
        document.createElement("time");

      date.dateTime =
        submission.created_at || "";

      date.textContent =
        Submissions.formatDate(
          submission.created_at
        );

      card.append(
        image,
        title,
        photographer,
        type,
        status,
        date
      );

      if (
        submission.status === "rejected" &&
        submission.rejection_reason
      ) {
        const reason =
          document.createElement("p");

        reason.className = "lc-rejection-reason";
        reason.textContent =
          "Review note: " +
          submission.rejection_reason;

        card.appendChild(reason);
      }

      container.appendChild(card);
    });
  };

  // 12. LOAD SUBMISSION HISTORY
  Submissions.loadMine = async function (
    container,
    options
  ) {
    try {
      if (
        window.LensCircleHelpers &&
        typeof window.LensCircleHelpers.showLoading ===
          "function"
      ) {
        window.LensCircleHelpers.showLoading(
          container,
          "Loading your submissions…"
        );
      }

      const submissions =
        await Submissions.getMine(options);

      Submissions.renderMine(
        container,
        submissions
      );

      return submissions;

    } catch (error) {
      console.error(error);

      if (
        window.LensCircleHelpers &&
        typeof window.LensCircleHelpers.showError ===
          "function"
      ) {
        window.LensCircleHelpers.showError(
          container,
          "Unable to load your submissions. Please try again."
        );
      }

      throw error;
    }
  };

  // 13. LOCAL IMAGE PREVIEW
  Submissions.createPreview = function (file) {
    return Storage.createPreview(file);
  };

  Submissions.revokePreview = function (url) {
    Storage.revokePreview(url);
  };

  // 14. EXPOSE MODULE
  console.info(
    "Lens Circle: Photography submission utilities loaded."
  );

})();
