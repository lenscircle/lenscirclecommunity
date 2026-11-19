
/* =========================================================
   LENS CIRCLE — CHALLENGES MODULE
   File: assets/js/challenges.js

   FEATURES
   - Weekly challenges
   - Monthly photography themes
   - Challenge discovery
   - Challenge details
   - Member participation
   - Photograph submissions
   - Submission withdrawal
   - Participation history
   - Challenge results
   - Staff challenge management

   EXPECTED SUPABASE RPC CONTRACTS
   - get_published_challenges
   - get_challenge_details
   - get_my_challenge_participation
   - submit_challenge_entry
   - withdraw_challenge_entry
   - get_challenge_results
   - create_photography_challenge
   - update_photography_challenge
   - publish_photography_challenge
   - close_photography_challenge

   STORAGE
   Bucket: challenge-entries

   SECURITY
   - Members can submit only their own entries.
   - Challenge deadlines are enforced by the database.
   - Duplicate entries follow server-side challenge rules.
   - Staff management requires authorised department access.
   - Never trust client-supplied user or reviewer IDs.
   ========================================================= */

(function (window, document) {
  "use strict";

  const LC = window.LensCircle = window.LensCircle || {};
  const Challenges = {};

  const CONFIG = {
    bucket: "challenge-entries",
    maxImageSize: 10 * 1024 * 1024,
    allowedTypes: [
      "image/jpeg",
      "image/png",
      "image/webp"
    ],
    pageSize: 12
  };

  const CATEGORIES = [
    "nature",
    "wildlife",
    "portrait",
    "street",
    "architecture",
    "landscape",
    "macro",
    "monochrome",
    "creative",
    "documentary",
    "abstract",
    "other"
  ];

  const TYPES = [
    "weekly",
    "monthly"
  ];

  const state = {
    user: null,
    authenticated: false,
    challenges: [],
    selectedChallenge: null,
    myParticipation: [],
    results: [],
    page: 0,
    hasMore: true,
    loading: false,
    search: "",
    category: "all",
    type: "all"
  };

  /* ---------------------------------------------------------
     HELPERS
  --------------------------------------------------------- */

  function clean(value, maxLength) {
    return String(value == null ? "" : value)
      .trim()
      .slice(0, maxLength || 500);
  }

  function array(value) {
    return Array.isArray(value) ? value : [];
  }

  function db() {
    if (LC.db) return LC.db;

    if (
      LC.supabase &&
      typeof LC.supabase.rpc === "function"
    ) {
      return LC.supabase;
    }

    throw new Error("Supabase client is unavailable.");
  }

  function notify(message, type) {
    if (
      LC.forms &&
      typeof LC.forms.notify === "function"
    ) {
      LC.forms.notify(message, type || "info");
    } else {
      console.info("[Lens Circle Challenges]", message);
    }
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);

    if (className) node.className = className;

    if (text !== undefined) {
      node.textContent = clean(text, 3000);
    }

    return node;
  }

  function formatDate(value) {
    if (!value) return "To be announced";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "To be announced";
    }

    return date.toLocaleDateString(undefined, {
      day: "numeric",
      month: "long",
      year: "numeric"
    });
  }

  function formatTime(value) {
    if (!value) return "";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "";

    return date.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit"
    });
  }

  function setLoading(button, loading) {
    if (!button) return;

    button.disabled = Boolean(loading);
    button.setAttribute(
      "aria-busy",
      String(Boolean(loading))
    );
  }

  function makeId() {
    if (
      window.crypto &&
      typeof window.crypto.randomUUID === "function"
    ) {
      return window.crypto.randomUUID();
    }

    throw new Error("Secure ID generation is unavailable.");
  }

  /* ---------------------------------------------------------
     AUTHENTICATION
  --------------------------------------------------------- */

  Challenges.refreshAuth = async function () {
    const { data, error } = await db()
      .auth.getSession();

    if (error) throw error;

    const session = data && data.session;

    state.authenticated = Boolean(session);
    state.user = session ? session.user : null;

    return state.authenticated;
  };

  Challenges.requireMember = async function () {
    const authenticated =
      await Challenges.refreshAuth();

    if (!authenticated) {
      window.location.assign(
        "/member/login.html"
      );

      return false;
    }

    return true;
  };

  /* ---------------------------------------------------------
     RPC
  --------------------------------------------------------- */

  Challenges.rpc = async function (name, params) {
    const { data, error } = await db().rpc(
      name,
      params || {}
    );

    if (error) {
      console.error(
        "[Challenges RPC]",
        name,
        error
      );

      throw error;
    }

    return data;
  };

  /* ---------------------------------------------------------
     CHALLENGE DISCOVERY
  --------------------------------------------------------- */

  Challenges.getChallenges = async function (options) {
    if (state.loading || !state.hasMore) {
      return state.challenges;
    }

    const settings = options || {};

    if (settings.reset) {
      state.page = 0;
      state.hasMore = true;
      state.challenges = [];
    }

    state.loading = true;

    try {
      const data = await Challenges.rpc(
        "get_published_challenges",
        {
          p_search: state.search || null,
          p_category:
            state.category === "all"
              ? null
              : state.category,
          p_type:
            state.type === "all"
              ? null
              : state.type,
          p_page: state.page,
          p_page_size: CONFIG.pageSize
        }
      );

      const records = array(data);

      if (settings.reset) {
        state.challenges = records;
      } else {
        state.challenges =
          state.challenges.concat(records);
      }

      state.hasMore =
        records.length === CONFIG.pageSize;

      if (records.length) state.page += 1;

      Challenges.renderChallenges(
        state.challenges
      );

      return state.challenges;

    } finally {
      state.loading = false;
    }
  };

  Challenges.search = function (query) {
    state.search = clean(query, 150);

    return Challenges.getChallenges({
      reset: true
    });
  };

  Challenges.filterCategory = function (category) {
    const value = clean(
      category,
      40
    ).toLowerCase();

    if (
      value !== "all" &&
      !CATEGORIES.includes(value)
    ) {
      throw new Error("Invalid challenge category.");
    }

    state.category = value;

    return Challenges.getChallenges({
      reset: true
    });
  };

  Challenges.filterType = function (type) {
    const value = clean(
      type,
      30
    ).toLowerCase();

    if (
      value !== "all" &&
      !TYPES.includes(value)
    ) {
      throw new Error("Invalid challenge type.");
    }

    state.type = value;

    return Challenges.getChallenges({
      reset: true
    });
  };

  /* ---------------------------------------------------------
     CHALLENGE DETAILS
  --------------------------------------------------------- */

  Challenges.getDetails = async function (challengeId) {
    const id = clean(challengeId, 100);

    if (!id) {
      throw new Error("Challenge ID is required.");
    }

    const data = await Challenges.rpc(
      "get_challenge_details",
      {
        p_challenge_id: id
      }
    );

    state.selectedChallenge = Array.isArray(data)
      ? data[0] || null
      : data;

    Challenges.renderDetails(
      state.selectedChallenge
    );

    return state.selectedChallenge;
  };

  Challenges.renderDetails = function (challenge) {
    const container = document.querySelector(
      "[data-challenge-details]"
    );

    if (!container) return;

    container.replaceChildren();

    if (!challenge) {
      container.appendChild(
        el(
          "p",
          "challenge-empty",
          "Challenge not found."
        )
      );

      return;
    }

    const title = el(
      "h1",
      "challenge-detail-title",
      challenge.title
    );

    const description = el(
      "p",
      "challenge-detail-description",
      challenge.description
    );

    const type = el(
      "span",
      "challenge-detail-type",
      challenge.type
    );

    const category = el(
      "span",
      "challenge-detail-category",
      challenge.category
    );

    const start = el(
      "p",
      "challenge-detail-start",
      "Starts: " + formatDate(challenge.starts_at)
    );

    const deadline = el(
      "p",
      "challenge-detail-deadline",
      "Submission deadline: " +
      formatDate(challenge.submission_deadline)
    );

    const rules = el(
      "p",
      "challenge-detail-rules",
      challenge.rules || "See the published guidelines."
    );

    container.append(
      type,
      category,
      title,
      description,
      start,
      deadline,
      rules
    );
  };

  /* ---------------------------------------------------------
     IMAGE UPLOAD
  --------------------------------------------------------- */

  Challenges.validateImage = function (file) {
    if (!file) {
      throw new Error("Select a photograph first.");
    }

    if (!CONFIG.allowedTypes.includes(file.type)) {
      throw new Error(
        "Use JPEG, PNG or WebP format."
      );
    }

    if (file.size > CONFIG.maxImageSize) {
      throw new Error(
        "Maximum photograph size is 10 MB."
      );
    }

    return true;
  };

  Challenges.uploadImage = async function (file) {
    if (!state.user) {
      throw new Error("Please sign in first.");
    }

    Challenges.validateImage(file);

    const extensions = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp"
    };

    const path =
      state.user.id +
      "/" +
      makeId() +
      "." +
      extensions[file.type];

    const { data, error } = await db()
      .storage
      .from(CONFIG.bucket)
      .upload(path, file, {
        cacheControl: "3600",
        contentType: file.type,
        upsert: false
      });

    if (error) throw error;

    return data.path;
  };

  /* ---------------------------------------------------------
     SUBMIT CHALLENGE ENTRY
  --------------------------------------------------------- */

  Challenges.submitEntry = async function (payload) {
    const allowed = await Challenges.requireMember();

    if (!allowed) return false;

    const challengeId = clean(
      payload.challenge_id,
      100
    );

    const title = clean(payload.title, 120);
    const caption = clean(payload.caption, 1000);

    if (!challengeId) {
      throw new Error("Select a challenge.");
    }

    if (!title) {
      throw new Error("Photograph title is required.");
    }

    if (!payload.file) {
      throw new Error("Select a photograph.");
    }

    const uploadedPath =
      await Challenges.uploadImage(payload.file);

    const result = await Challenges.rpc(
      "submit_challenge_entry",
      {
        p_challenge_id: challengeId,
        p_title: title,
        p_caption: caption || null,
        p_image_path: uploadedPath
      }
    );

    notify(
      "Your challenge entry has been submitted.",
      "success"
    );

    await Challenges.getMyParticipation();

    return result;
  };

  /* ---------------------------------------------------------
     WITHDRAW ENTRY
  --------------------------------------------------------- */

  Challenges.withdrawEntry = async function (entryId) {
    const id = clean(entryId, 100);

    if (!id) {
      throw new Error("Entry ID is required.");
    }

    if (!window.confirm(
      "Withdraw this challenge entry?"
    )) {
      return false;
    }

    await Challenges.rpc(
      "withdraw_challenge_entry",
      {
        p_entry_id: id
      }
    );

    notify("Your entry has been withdrawn.", "success");

    await Challenges.getMyParticipation();

    return true;
  };

  /* ---------------------------------------------------------
     MEMBER PARTICIPATION
  --------------------------------------------------------- */

  Challenges.getMyParticipation = async function () {
    const allowed = await Challenges.requireMember();

    if (!allowed) return [];

    const data = await Challenges.rpc(
      "get_my_challenge_participation"
    );

    state.myParticipation = array(data);

    Challenges.renderParticipation(
      state.myParticipation
    );

    return state.myParticipation;
  };

  Challenges.renderParticipation = function (records) {
    const container = document.querySelector(
      "[data-my-challenge-entries]"
    );

    if (!container) return;

    container.replaceChildren();

    if (!records.length) {
      container.appendChild(
        el(
          "p",
          "challenge-empty",
          "Your challenge entries will appear here."
        )
      );

      return;
    }

    records.forEach(function (entry) {
      const card = el(
        "article",
        "challenge-entry-card"
      );

      const title = el(
        "h3",
        "challenge-entry-title",
        entry.title
      );

      const challenge = el(
        "p",
        "challenge-entry-name",
        entry.challenge_title
      );

      const status = el(
        "span",
        "challenge-entry-status",
        entry.status
      );

      const date = el(
        "small",
        "challenge-entry-date",
        formatDate(entry.created_at)
      );

      card.append(title, challenge, status, date);

      if (
        entry.status === "pending" &&
        entry.can_withdraw !== false
      ) {
        const button = el(
          "button",
          "challenge-withdraw",
          "Withdraw entry"
        );

        button.type = "button";

        button.addEventListener("click", function () {
          Challenges.withdrawEntry(entry.id)
            .catch(function (error) {
              notify(error.message, "error");
            });
        });

        card.appendChild(button);
      }

      container.appendChild(card);
    });
  };

  /* ---------------------------------------------------------
     RESULTS
  --------------------------------------------------------- */

  Challenges.getResults = async function (challengeId) {
    const id = clean(challengeId, 100);

    if (!id) {
      throw new Error("Challenge ID is required.");
    }

    const data = await Challenges.rpc(
      "get_challenge_results",
      {
        p_challenge_id: id
      }
    );

    state.results = array(data);

    Challenges.renderResults(state.results);

    return state.results;
  };

  Challenges.renderResults = function (records) {
    const container = document.querySelector(
      "[data-challenge-results]"
    );

    if (!container) return;

    container.replaceChildren();

    if (!records.length) {
      container.appendChild(
        el(
          "p",
          "challenge-empty",
          "Results have not been published yet."
        )
      );

      return;
    }

    records.forEach(function (result, index) {
      const card = el(
        "article",
        "challenge-result-card"
      );

      const rank = el(
        "span",
        "challenge-result-rank",
        result.rank
          ? "Rank " + result.rank
          : "Featured photograph"
      );

      const title = el(
        "h3",
        "challenge-result-title",
        result.title
      );

      const creator = el(
        "p",
        "challenge-result-creator",
        result.creator_name
      );

      const recognition = el(
        "p",
        "challenge-result-recognition",
        result.award || result.recognition || ""
      );

      card.append(rank, title, creator, recognition);

      container.appendChild(card);
    });
  };

  /* ---------------------------------------------------------
     STAFF MANAGEMENT
  --------------------------------------------------------- */

  Challenges.create = async function (payload) {
    const title = clean(payload.title, 150);
    const description = clean(
      payload.description,
      5000
    );

    const type = clean(
      payload.type,
      30
    ).toLowerCase();

    const category = clean(
      payload.category,
      40
    ).toLowerCase();

    if (!title || !description) {
      throw new Error(
        "Challenge title and description are required."
      );
    }

    if (!TYPES.includes(type)) {
      throw new Error("Select weekly or monthly.");
    }

    if (!CATEGORIES.includes(category)) {
      throw new Error("Select a valid category.");
    }

    const payloadData = {
      title,
      description,
      type,
      category,
      starts_at: payload.starts_at,
      submission_deadline: payload.submission_deadline,
      rules: clean(payload.rules, 3000),
      max_entries: payload.max_entries
        ? Number(payload.max_entries)
        : null,
      voting_enabled: Boolean(payload.voting_enabled)
    };

    const result = await Challenges.rpc(
      "create_photography_challenge",
      {
        p_challenge: payloadData
      }
    );

    notify("Challenge created successfully.", "success");

    return result;
  };

  Challenges.update = async function (
    challengeId,
    payload
  ) {
    const id = clean(challengeId, 100);

    if (!id) {
      throw new Error("Challenge ID is required.");
    }

    const result = await Challenges.rpc(
      "update_photography_challenge",
      {
        p_challenge_id: id,
        p_challenge: payload
      }
    );

    notify("Challenge updated successfully.", "success");

    return result;
  };

  Challenges.publish = async function (challengeId) {
    const id = clean(challengeId, 100);

    if (!id) {
      throw new Error("Challenge ID is required.");
    }

    if (!window.confirm(
      "Publish this photography challenge?"
    )) {
      return false;
    }

    await Challenges.rpc(
      "publish_photography_challenge",
      {
        p_challenge_id: id
      }
    );

    notify("Challenge published.", "success");

    return true;
  };

  Challenges.close = async function (challengeId) {
    const id = clean(challengeId, 100);

    if (!id) {
      throw new Error("Challenge ID is required.");
    }

    if (!window.confirm(
      "Close this challenge?"
    )) {
      return false;
    }

    await Challenges.rpc(
      "close_photography_challenge",
      {
        p_challenge_id: id
      }
    );

    notify("Challenge closed.", "success");

    return true;
  };

  /* ---------------------------------------------------------
     CHALLENGE CARDS
  --------------------------------------------------------- */

  Challenges.renderChallenges = function (records) {
    const container = document.querySelector(
      "[data-challenges-list]"
    );

    if (!container) return;

    container.replaceChildren();

    if (!records.length) {
      container.appendChild(
        el(
          "p",
          "challenge-empty",
          "No challenges are available right now."
        )
      );

      return;
    }

    records.forEach(function (challenge) {
      const card = el(
        "article",
        "challenge-card"
      );

      const type = el(
        "span",
        "challenge-type",
        challenge.type
      );

      const category = el(
        "span",
        "challenge-category",
        challenge.category
      );

      const title = el(
        "h3",
        "challenge-title",
        challenge.title
      );

      const description = el(
        "p",
        "ch