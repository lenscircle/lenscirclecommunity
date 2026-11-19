
/* =========================================================
   LENS CIRCLE — EXHIBITIONS MODULE
   File: assets/js/exhibitions.js

   FEATURES
   - Retrieve published exhibitions.
   - Retrieve exhibition details.
   - Retrieve member's own exhibition submissions.
   - Submit photographs to open exhibitions.
   - Withdraw eligible submissions.
   - Retrieve submissions for authorised curators.
   - Review, approve, reject and feature submissions.
   - Publish, update and archive exhibitions.
   - Render exhibition cards and submission cards.
   - Search and filter exhibitions.

   REQUIRED DATABASE RPC CONTRACTS
   get_published_exhibitions()
   get_exhibition_details(p_exhibition_id)
   get_my_exhibition_submissions()
   submit_exhibition_entry(
     p_exhibition_id,
     p_title,
     p_caption,
     p_image_path
   )
   withdraw_exhibition_entry(p_entry_id)
   get_exhibition_entries_for_review(p_exhibition_id)
   review_exhibition_entry(
     p_entry_id,
     p_decision,
     p_review_note
   )
   set_exhibition_entry_featured(p_entry_id, p_featured)
   create_exhibition(
     p_title,
     p_slug,
     p_description,
     p_cover_image,
     p_submission_deadline,
     p_opening_date,
     p_closing_date
   )
   update_exhibition(
     p_exhibition_id,
     p_title,
     p_description,
     p_cover_image,
     p_submission_deadline,
     p_opening_date,
     p_closing_date,
     p_status
   )
   publish_exhibition(p_exhibition_id)
   archive_exhibition(p_exhibition_id)

   SECURITY REQUIREMENTS
   - Database derives the acting user from auth.uid().
   - Never accept a creator ID or reviewer ID from the browser.
   - Members can submit only to open exhibitions.
   - Members can withdraw only their own eligible entries.
   - Review access must be department/role authorised.
   - Only authorised staff may publish or archive exhibitions.
   - Storage policies must verify image ownership.
   - Do not expose Supabase service-role keys in this file.

   These RPCs and database policies must be created before
   this module can perform real database operations.
   ========================================================= */

(function (window, document) {
  "use strict";

  const LC = window.LensCircle = window.LensCircle || {};
  const Exhibitions = {};

  const RPC = Object.freeze({
    LIST: "get_published_exhibitions",
    DETAILS: "get_exhibition_details",
    MY_ENTRIES: "get_my_exhibition_submissions",
    SUBMIT: "submit_exhibition_entry",
    WITHDRAW: "withdraw_exhibition_entry",
    REVIEW_LIST: "get_exhibition_entries_for_review",
    REVIEW: "review_exhibition_entry",
    FEATURE: "set_exhibition_entry_featured",
    CREATE: "create_exhibition",
    UPDATE: "update_exhibition",
    PUBLISH: "publish_exhibition",
    ARCHIVE: "archive_exhibition"
  });

  const EXHIBITION_STATUSES = Object.freeze([
    "draft",
    "open",
    "published",
    "closed",
    "archived"
  ]);

  const ENTRY_STATUSES = Object.freeze([
    "submitted",
    "under_review",
    "approved",
    "rejected",
    "withdrawn"
  ]);

  const REVIEW_DECISIONS = Object.freeze([
    "approved",
    "rejected",
    "under_review"
  ]);

  const IMAGE_BUCKET = "exhibition-entries";

  const ALLOWED_IMAGE_TYPES = Object.freeze([
    "image/jpeg",
    "image/png",
    "image/webp"
  ]);

  const MAX_IMAGE_SIZE = 12 * 1024 * 1024;

  const state = {
    exhibitions: [],
    currentExhibition: null,
    myEntries: [],
    reviewEntries: [],
    filters: {
      search: "",
      status: "all"
    }
  };

  /* ---------------------------------------------------------
     CORE HELPERS
  --------------------------------------------------------- */

  function getClient() {
    const client = LC.db || LC.supabase;

    if (!client || typeof client.rpc !== "function") {
      throw new Error(
        "Supabase client unavailable. Check supabase-client.js."
      );
    }

    return client;
  }

  async function getCurrentUser() {
    const client = getClient();
    const result = await client.auth.getUser();

    if (result.error) throw result.error;

    if (!result.data || !result.data.user) {
      throw new Error("Please sign in to continue.");
    }

    return result.data.user;
  }

  async function callRPC(name, params) {
    const result = await getClient().rpc(name, params || {});

    if (result.error) {
      console.error("[Lens Circle Exhibitions]", name, result.error);

      throw new Error(
        result.error.message || "The exhibition request failed."
      );
    }

    return result.data;
  }

  function cleanText(value, maxLength) {
    return String(value == null ? "" : value)
      .trim()
      .slice(0, maxLength || 500);
  }

  function escapeHTML(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function safeImageURL(value) {
    const url = cleanText(value, 2000);

    if (!url) return "";

    try {
      const parsed = new URL(url, window.location.origin);

      if (
        parsed.protocol !== "https:" &&
        parsed.origin !== window.location.origin
      ) {
        return "";
      }

      if (
        parsed.protocol !== "https:" &&
        parsed.protocol !== "http:"
      ) {
        return "";
      }

      return parsed.href;
    } catch (_) {
      return "";
    }
  }

  function normaliseStatus(value) {
    const status = cleanText(value, 30).toLowerCase();

    return EXHIBITION_STATUSES.includes(status)
      ? status
      : "draft";
  }

  function normaliseEntryStatus(value) {
    const status = cleanText(value, 30).toLowerCase();

    return ENTRY_STATUSES.includes(status)
      ? status
      : "submitted";
  }

  function normaliseExhibition(row) {
    const item = row || {};

    return {
      id: cleanText(item.id || item.exhibition_id, 100),
      title: cleanText(item.title, 180),
      slug: cleanText(item.slug, 180),
      description: cleanText(item.description, 10000),
      cover_image: safeImageURL(
        item.cover_image || item.cover_image_url
      ),
      status: normaliseStatus(item.status),
      submission_deadline: item.submission_deadline || null,
      opening_date: item.opening_date || null,
      closing_date: item.closing_date || null,
      entry_count: Number(item.entry_count) || 0,
      featured_count: Number(item.featured_count) || 0,
      created_at: item.created_at || null
    };
  }

  function normaliseEntry(row) {
    const item = row || {};

    return {
      id: cleanText(item.id || item.entry_id, 100),
      exhibition_id: cleanText(item.exhibition_id, 100),
      title: cleanText(item.title, 180),
      caption: cleanText(item.caption, 3000),
      image_url: safeImageURL(
        item.image_url || item.signed_image_url
      ),
      image_path: cleanText(item.image_path, 1000),
      status: normaliseEntryStatus(item.status),
      review_note: cleanText(item.review_note, 2000),
      photographer_name: cleanText(
        item.photographer_name || item.member_name,
        120
      ),
      exhibition_title: cleanText(item.exhibition_title, 180),
      is_featured: item.is_featured === true,
      submitted_at: item.submitted_at || item.created_at || null
    };
  }

  function unwrapRows(data) {
    if (Array.isArray(data)) return data;

    if (data && Array.isArray(data.exhibitions)) {
      return data.exhibitions;
    }

    if (data && Array.isArray(data.entries)) {
      return data.entries;
    }

    if (data && typeof data === "object") {
      return [data];
    }

    return [];
  }

  function formatDate(value) {
    if (!value) return "To be announced";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "Date unavailable";
    }

    return new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "long",
      year: "numeric"
    }).format(date);
  }

  function isDeadlinePassed(value) {
    if (!value) return false;

    const timestamp = new Date(value).getTime();

    return Number.isFinite(timestamp) && timestamp < Date.now();
  }

  function makeSlug(value) {
    return cleanText(value, 180)
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 180);
  }

  function validateUUID(value, label) {
    const id = cleanText(value, 100);

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      throw new Error("A valid " + label + " ID is required.");
    }

    return id;
  }

  function validateImage(file) {
    if (!file) {
      throw new Error("Choose a photograph to upload.");
    }

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      throw new Error("Use a JPG, PNG or WebP image.");
    }

    if (file.size > MAX_IMAGE_SIZE) {
      throw new Error("The image must be smaller than 12 MB.");
    }

    return file;
  }

  function createSafeFileName(file) {
    const extensionMap = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp"
    };

    const extension = extensionMap[file.type];

    if (!extension) {
      throw new Error("Unsupported image format.");
    }

    const randomPart =
      window.crypto && window.crypto.randomUUID
        ? window.crypto.randomUUID()
        : String(Date.now()) + "-" + Math.random().toString(36).slice(2);

    return randomPart + "." + extension;
  }

  /* ---------------------------------------------------------
     STORAGE
  --------------------------------------------------------- */

  /**
   * Upload an exhibition photograph.
   *
   * Storage path:
   * userId/exhibitionId/random-filename.ext
   *
   * The storage bucket should be private.
   * RLS must verify auth.uid() matches the first path segment.
   * Database submission RPC must independently verify ownership
   * of the uploaded object before accepting the entry.
   */
  Exhibitions.uploadEntryImage = async function (
    exhibitionId,
    file
  ) {
    const user = await getCurrentUser();

    const validExhibitionId = validateUUID(
      exhibitionId,
      "exhibition"
    );

    validateImage(file);

    const path = [
      user.id,
      validExhibitionId,
      createSafeFileName(file)
    ].join("/");

    const client = getClient();

    const result = await client.storage
      .from(IMAGE_BUCKET)
      .upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type
      });

    if (result.error) throw result.error;

    return {
      path: result.data.path,
      bucket: IMAGE_BUCKET
    };
  };

  /**
   * Generate a temporary signed URL for a private image.
   * Only call this after the relevant record has been authorised.
   */
  Exhibitions.getEntryImageURL = async function (
    imagePath,
    expiresIn
  ) {
    const path = cleanText(imagePath, 1000);

    if (!path || path.startsWith("/") || path.includes("..")) {
      throw new Error("Invalid image path.");
    }

    const seconds = Math.min(
      Math.max(Number(expiresIn) || 600, 60),
      3600
    );

    const result = await getClient().storage
      .from(IMAGE_BUCKET)
      .createSignedUrl(path, seconds);

    if (result.error) throw result.error;

    return result.data.signedUrl;
  };

  /* ---------------------------------------------------------
     PUBLIC EXHIBITIONS
  --------------------------------------------------------- */

  Exhibitions.getPublished = async function () {
    const data = await callRPC(RPC.LIST);

    state.exhibitions = unwrapRows(data)
      .map(normaliseExhibition);

    return state.exhibitions;
  };

  Exhibitions.getDetails = async function (exhibitionId) {
    const id = validateUUID(exhibitionId, "exhibition");

    const data = await callRPC(RPC.DETAILS, {
      p_exhibition_id: id
    });

    const row = Array.isArray(data) ? data[0] : data;

    if (!row) throw new Error("Exhibition not found.");

    state.currentExhibition = normaliseExhibition(row);

    return state.currentExhibition;
  };

  /* ---------------------------------------------------------
     MEMBER SUBMISSIONS
  --------------------------------------------------------- */

  Exhibitions.getMySubmissions = async function () {
    await getCurrentUser();

    const data = await callRPC(RPC.MY_ENTRIES);

    state.myEntries = unwrapRows(data).map(normaliseEntry);

    return state.myEntries;
  };

  /**
   * Submit a photograph to an exhibition.
   *
   * The image is uploaded first. The database then validates:
   * - The exhibition is accepting entries.
   * - The deadline has not passed.
   * - The authenticated user owns the image path.
   * - The member has not exceeded entry limits.
   * - The entry belongs to the requested exhibition.
   *
   * If the database rejects the submission after upload,
   * the uploaded object may need cleanup. A scheduled cleanup
   * process should remove abandoned objects securely.
   */
  Exhibitions.submitEntry = async function (input) {
    await getCurrentUser();

    const values = input || {};

    const exhibitionId = validateUUID(
      values.exhibitionId,
      "exhibition"
    );

    const title = cleanText(values.title, 180);
    const caption = cleanText(values.caption, 3000);

    if (title.length < 3) {
      throw new Error("Enter a title of at least 3 characters.");
    }

    const file = values.file;

    validateImage(file);

    const upload = await Exhibitions.uploadEntryImage(
      exhibitionId,
      file
    );

    const data = await callRPC(RPC.SUBMIT, {
      p_exhibition_id: exhibitionId,
      p_title: title,
      p_caption: caption,
      p_image_path: upload.path
    });

    return data;
  };

  Exhibitions.withdrawEntry = async function (entryId) {
    await getCurrentUser();

    const id = validateUUID(entryId, "entry");

    return callRPC(RPC.WITHDRAW, {
      p_entry_id: id
    });
  };

  /* ---------------------------------------------------------
     STAFF: REVIEW WORKSPACE
  --------------------------------------------------------- */

  /**
   * Retrieve entries for review.
   *
   * The RPC must check the caller's role and department scope.
   * Do not rely on a hidden staff-only page as protection.
   */
  Exhibitions.getEntriesForReview = async function (
    exhibitionId
  ) {
    await getCurrentUser();

    const id = validateUUID(exhibitionId, "exhibition");

    const data = await callRPC(RPC.REVIEW_LIST, {
      p_exhibition_id: id
    });

    state.reviewEntries = unwrapRows(data).map(normaliseEntry);

    return state.reviewEntries;
  };

  /**
   * Review an exhibition entry.
   *
   * Reviewer identity must be derived from auth.uid() inside
   * the database. No reviewer ID is accepted from this client.
   */
  Exhibitions.reviewEntry = async function (
    entryId,
    decision,
    reviewNote
  ) {
    await getCurrentUser();

    const id = validateUUID(entryId, "entry");
    const result = cleanText(decision, 30).toLowerCase();

    if (!REVIEW_DECISIONS.includes(result)) {
      throw new Error("Choose a valid review decision.");
    }

    const note = cleanText(reviewNote, 2000);

    return callRPC(RPC.REVIEW, {
      p_entry_id: id,
      p_decision: result,
      p_review_note: note
    });
  };

  Exhibitions.setFeatured = async function (
    entryId,
    featured
  ) {
    await getCurrentUser();

    const id = validateUUID(entryId, "entry");

    return callRPC(RPC.FEATURE, {
      p_entry_id: id,
      p_featured: featured === true
    });
  };

  /* ---------------------------------------------------------
     STAFF: EXHIBITION MANAGEMENT
  --------------------------------------------------------- */

  Exhibitions.create = async function (input) {
    await getCurrentUser();

    const values = input || {};
    const title = cleanText(values.title, 180);

    if (title.length < 3) {
      throw new Error("Enter an exhibition title.");
    }

    const slug = makeSlug(values.slug || title);

    if (!slug) {
      throw new Error("Enter a valid exhibition URL slug.");
    }

    const description = cleanText(values.description, 10000);
    const coverImage = cleanText(values.coverImage, 2000);

    const submissionDeadline = values.submissionDeadline
      ? new Date(values.submissionDeadline).toISOString()
      : null;

    const openingDate = values.openingDate
      ? new Date(values.openingDate).toISOString()
      : null;

    const closingDate = values.closingDate
      ? new Date(values.closingDate).toISOString()
      : null;

    for (const date of [
      submissionDeadline,
      openingDate,
      closingDate
    ]) {
      if (date && Number.isNaN(new Date(date).getTime())) {
        throw new Error("One of the exhibition dates is invalid.");
      }
    }

    if (
      openingDate &&
      closingDate &&
      new Date(closingDate) <= new Date(openingDate)
    ) {
      throw new Error("Closing date must be after opening date.");
    }

    return callRPC(RPC.CREATE, {
      p_title: title,
      p_slug: slug,
      p_description: description,
      p_cover_image: coverImage || null,
      p_submission_deadline: submissionDeadline,
      p_opening_date: openingDate,
      p_closing_date: closingDate
    });
  };

  Exhibitions.update = async function (
    exhibitionId,
    input
  ) {
    await getCurrentUser();

    const id = validateUUID(exhibitionId, "exhibition");
    const values = input || {};

    const title = cleanText(values.title, 180);

    if (title.length < 3) {
      throw new Error("Enter an exhibition title.");
    }

    const description = cleanText(values.description, 10000);
    const coverImage = cleanText(values.coverImage, 2000);
    const status = cleanText(values.status, 30).toLowerCase();

    if (
      status &&
      !EXHIBITION_STATUSES.includes(status)
    ) {
      throw new Error("Invalid exhibition status.");
    }

    function parseOptionalDate(value) {
      if (!value) return null;

      const date = new Date(value);

      if (Number.isNaN(date.getTime())) {
        throw new Error("Enter a valid exhibition date.");
      }

      return date.toISOString();
    }

    const submissionDeadline = parseOptionalDate(
      values.submissionDeadline
    );

    const openingDate = parseOptionalDate(values.openingDate);
    const closingDate = parseOptionalDate(values.closingDate);

    if (
      openingDate &&
      closingDate &&
      new Date(closingDate) <= new Date(openingDate)
    ) {
      throw new Error("Closing date must be after opening date.");
    }

    return callRPC(RPC.UPDATE, {
      p_exhibition_id: id,
      p_title: title,
      p_description: description,
      p_cover_image: coverImage || null,
      p_submission_deadline: submissionDeadline,
      p_opening_date: openingDate,
      p_closing_date: closingDate,
      p_status: status || null
    });
  };

  Exhibitions.publish = async function (exhibitionId) {
    await getCurrentUser();

    const id = validateUUID(exhibitionId, "exhibition");

    return callRPC(RPC.PUBLISH, {
      p_exhibition_id: id
    });
  };

  Exhibitions.archive = async function (exhibitionId) {
    await getCurrentUser();

    const id = validateUUID(exhibitionId, "exhibition");

    return callRPC(RPC.ARCHIVE, {
      p_exhibition_id: id
    });
  };

  /* ---------------------------------------------------------
     FILTERING
  --------------------------------------------------------- */

  Exhibitions.setFilters = function (filters) {
    const values = filters || {};

    if (values.search !== undefined) {
      state.filters.search = cleanText(values.search, 120)
        .toLowerCase();
    }

    if (values.status !== undefined) {
      const status = cleanText(values.status, 30).toLowerCase();

      state.filters.status =
        status === "all" || EXH