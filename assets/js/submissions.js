
/* =====================================================
   LENS CIRCLE
   Photography Submission Management
   File: assets/js/submissions.js

   Dependencies:
   - supabase-client.js
   - auth.js
   - storage.js
   - helpers.js

   REQUIRED SUPABASE RPC FUNCTIONS:

   1. submit_photography_entry
      Creates a submission after validating activity,
      ownership, deadlines and image permissions.

   2. withdraw_photography_entry
      Withdraws an eligible submission owned by caller.

   3. review_photography_entry
      Authorised staff review and moderation action.

   4. get_my_photography_submissions
      Returns submissions belonging to auth.uid().

   IMPORTANT:
   Database functions and RLS must enforce all
   permissions. Browser-side checks are not security.
   ===================================================== */

(function () {
  "use strict";

  // ----------------------------------------------------
  // 1. DEPENDENCY CHECK
  // ----------------------------------------------------

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

  // ----------------------------------------------------
  // 2. SUBMISSION TYPES
  // ----------------------------------------------------

  const TYPES = Object.freeze({
    photo_of_the_day: {
      label: "Photo of the Day",
      bucket: "photo-submissions"
    },

    weekly_challenge: {
      label: "Weekly Challenge",
      bucket: "photo-submissions"
    },

    photography_battle: {
      label: "Photography Battle",
      bucket: "photo-submissions"
    },

    monthly_theme: {
      label: "Monthly Theme",
      bucket: "photo-submissions"
    },

    competition: {
      label: "Competition",
      bucket: "competition-entries"
    },

    exhibition: {
      label: "Exhibition",
      bucket: "exhibition-images"
    }
  });

  const VALID_STATUSES = [
    "pending",
    "under_review",
    "approved",
    "rejected",
    "withdrawn"
  ];

  // ----------------------------------------------------
  // 3. VALIDATE SUBMISSION TYPE
  // ----------------------------------------------------

  Submissions.getTypes = function () {
    return Object.entries(TYPES).map(
      function (entry) {
        return {
          id: entry[0],
          label: entry[1].label
        };
      }
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

  // ----------------------------------------------------
  // 4. GET CURRENT USER
  // ----------------------------------------------------

  async function getCurrentUser() {
    const user =
      await window.LensCircleAuth.getUser();

    if (!user) {
      throw new Error(
        "Please sign in before submitting photographs."
      );
    }

    return user;
  }

  // ----------------------------------------------------
  // 5. VALIDATE SUBMISSION DETAILS
  // ----------------------------------------------------

  Submissions.validate = function (details) {
    if (!details || typeof details !== "object") {
      throw new Error("Submission details are required.");
    }

    if (!Submissions.isValidType(details.type)) {
      throw new Error("Invalid submission category.");
    }

    if (
      typeof details.activityId !== "string" ||
      !/^[a-zA-Z0-9_-]+$/.test(details.activityId)
    ) {
      throw new Error("Invalid activity identifier.");
    }

    if (
      typeof details.title !== "string" ||
      details.title.trim().length < 2 ||
      details.title.trim().length > 120
    ) {
      throw new Error(
        "Title must contain between 2 and 120 characters."
      );
    }

    if (
      details.caption &&
      (
        typeof details.caption !== "string" ||
        details.caption.length > 1000
      )
    ) {
      throw new Error(
        "Caption cannot exceed 1000 characters."
      );
    }

    if (!details.file) {
      throw new Error("Please select a photograph.");
    }

    Storage.validateImage(details.file, {
      maxSize: 10 * 1024 * 1024
    });

    return true;
  };

  // ----------------------------------------------------
  // 6. SUBMIT PHOTOGRAPH
  // ----------------------------------------------------

  Submissions.submit = async function (details) {
    Submissions.validate(details);

    const user = await getCurrentUser();

    const typeConfig = TYPES[details.type];

    let uploadedFile = null;

    try {
      // Upload photograph to the appropriate bucket.
      if (details.type === "competition") {
        uploadedFile =
          await Storage.uploadCompetitionEntry(
            details.activityId,
            details.file
          );

      } else if (details.type === "exhibition") {
        uploadedFile =
          await Storage.uploadExhibitionImage(
            details.activityId,
            details.file
          );

      } else {
        uploadedFile =
          await Storage.uploadImage(
            typeConfig.bucket,
            details.file,
            {
              folder: user.id
            }
          );
      }

      // Submit the record through a protected RPC.
      const { data, error } = await db.rpc(
        "submit_photography_entry",
        {
          p_activity_id: details.activityId,
          p_submission_type: details.type,
          p_title: details.title.trim(),
          p_caption: (details.caption || "").trim(),
          p_storage_bucket: uploadedFile.bucket,
          p_storage_path: uploadedFile.path
        }
      );

      if (error) {
        throw error;
      }

      return {
        success: true,
        submission: data,
        uploadedFile: uploadedFile
      };

    } catch (error) {
      /*
        If record creation fails after upload, the
        file may remain in storage.

        A trusted cleanup process should remove orphaned
        uploads after verifying no submission references
        the object. Do not attempt unrestricted deletion.
      */

      console.error(
        "Submission failed:",
        error
      );

      throw error;
    }
  };

  // ----------------------------------------------------
  // 7. GET MY SUBMISSIONS
  // ----------------------------------------------------

  Submissions.getMine = async function (options) {
    options = options || {};

    await getCurrentUser();

    const { data, error } = await db.rpc(
      "get_my_photography_submissions",
      {
        p_submission_type: options.type || null,
        p_status: options.status || null,
        p_limit: Math.min(
          Math.max(Number(options.limit) || 50, 1),
          100
        ),
        p_offset: Math.max(
          Number(options.offset) || 0,
          0
        )
      }
    );

    if (error) {
      throw error;
    }

    return Array.isArray(data) ? data : [];
  };

  // ----------------------------------------------------
  // 8. GET SUBMISSION STATUS
  // ----------------------------------------------------

  Submissions.getStatusLabel = function (status) {
    const labels = {
      pending: "Awaiting Review",
      under_review: "Under Review",
      approved: "Approved",
      rejected: "Not Selected",
      withdrawn: "Withdrawn"
    };

    return labels[status] || "Unknown Status";
  };

  // ----------------------------------------------------
  // 9. WITHDRAW OWN SUBMISSION
  // ----------------------------------------------------

  Submissions.withdraw = async function (
    submissionId
  ) {
    await getCurrentUser();

    if (
      typeof submissionId !== "string" ||
      !/^[a-zA-Z0-9_-]+$/.test(submissionId)
    ) {
      throw new Error("Invalid submission identifier.");
    }

    const { data, error } = await db.rpc(
      "withdraw_photography_entry",
      {
        p_submission_id: submissionId
      }
    );

    if (error) {
      throw error;
    }

    return data;
  };

  // ----------------------------------------------------
  // 10. STAFF REVIEW
  // ----------------------------------------------------

  /*
    Staff actions must be checked again inside the
    database function.

    A Moderator may only review entries within their
    assigned operational permissions.

    Directors may supervise only their assigned
    departments.

    Admin has platform-wide authority.
  */

  Submissions.review = async function (
    submissionId,
    decision,
    notes
  ) {
    const user = await getCurrentUser();

    const validDecisions = [
      "approve",
      "reject",
      "request_changes"
    ];

    if (!validDecisions.includes(decision)) {
      throw new Error("Invalid review decision.");
    }

    if (
      typeof submissionId !== "string" ||
      !/^[a-zA-Z0-9_-]+$/.test(submissionId)
    ) {
      throw new Error("Invalid submission identifier.");
    }

    if (
      notes &&
      (
        typeof notes !== "string" ||
        notes.length > 2000
      )
    ) {
      throw new Error("Review notes are too long.");
    }

    const authorisedRoles = [
      "admin",
      "director",
      "moderator"
    ];

    let authorised = false;

    for (const role of authorisedRoles) {
      if (
        await window.LensCircleAuth.hasRole(role)
      ) {
        authorised = true;
        break;
      }
    }

    if (!authorised) {
      throw new Error(
        "Authorised staff access is required."
      );
    }

    const { data, error } = await db.rpc(
      "review_photography_entry",
      {
        p_submission_id: submissionId,
        p_decision: decision,
        p_notes: (notes || "").trim(),
        p_reviewer_id: user.id
      }
    );

    if (error) {
      throw error;
    }

    return data;
  };

  // ----------------------------------------------------
  // 11. SUBMISSION TYPE LABEL
  // ----------------------------------------------------

  Submissions.getTypeLabel = function (type) {
    return TYPES[type]?.label || "Photography Submission";
  };

  // ----------------------------------------------------
  // 12. FORMAT SUBMISSION DATE
  // ----------------------------------------------------

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
      dateStyle: "medium"
    }).format(date);
  };

  // ----------------------------------------------------
  // 13. RENDER SUBMISSION HISTORY
  // ----------------------------------------------------

  Submissions.renderMine = function (
    container,
    submissions
  ) {
    if (typeof container === "string") {
      container = document.querySelector(container);
    }

    if (!container) {
      throw new Error(
        "Submission container was not found."
      );
    }

    container.replaceChildren();

    if (!submissions || !submissions.length) {
      const empty = document.createElement("div");

      empty.className = "lc-empty-state";

      const heading = document.createElement("h3");
      heading.textContent = "No submissions yet";

      const message = document.createElement("p");
      message.textContent =
        "Your photography submissions will appear here.";

      empty.appendChild(heading);
      empty.appendChild(message);

      container.appendChild(empty);

      return;
    }

    submissions.forEach(function (submission) {
      const card = document.createElement("article");

      card.className = "lc-submission-card";

      const title = document.createElement("h3");
      title.textContent =
        submission.title || "Untitled photograph";

      const type = document.createElement("p");
      type.textContent =
        Submissions.getTypeLabel(
          submission.submission_type
        );

      const status = document.createElement("span");
      status.className =
        "lc-submission-status lc-status-" +
        (
          Submissions.isValidStatus(submission.status)
            ? submission.status
            : "pending"
        );

      status.textContent =
        Submissions.getStatusLabel(submission.status);

      const date = document.createElement("time");
      date.textContent =
        Submissions.formatDate(submission.created_at);

      card.appendChild(title);
      card.appendChild(type);
      card.appendChild(status);
      card.appendChild(date);

      container.appendChild(card);
    });
  };

  // ----------------------------------------------------
  // 14. LOAD SUBMISSION HISTORY
  // ----------------------------------------------------

  Submissions.loadMine = async function (
    container,
    options
  ) {
    try {
      if (window.LensCircleHelpers) {
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

      if (window.LensCircleHelpers) {
        window.LensCircleHelpers.showError(
          container,
          "Unable to load your submissions. Please try again."
        );
      }

      throw error;
    }
  };

  // ----------------------------------------------------
  // 15. EXPOSE CONFIGURATION
  // ----------------------------------------------------

  Submissions.types = TYPES;
  Submissions.statuses = VALID_STATUSES;

  console.info(
    "Lens Circle: Submission utilities loaded."
  );

})();
