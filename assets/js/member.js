
/* =========================================================
   LENS CIRCLE — MEMBER MODULE
   File: assets/js/member.js

   PURPOSE
   Central member portal functionality.

   EXPECTED SUPABASE RPC CONTRACTS
   - get_my_member_context
   - get_my_member_dashboard
   - get_my_photography_submissions
   - submit_photography_entry
   - withdraw_photography_entry
   - get_published_competitions
   - get_my_competition_entries
   - get_published_activities
   - get_my_activity_registrations
   - register_for_activity
   - withdraw_from_activity
   - get_my_bookmarks
   - add_bookmark
   - remove_bookmark
   - get_my_notifications
   - mark_notification_read
   - update_my_member_profile

   SECURITY
   - Members cannot assign their own roles.
   - Private member data must remain protected by RLS.
   - Backend derives identity using auth.uid().
   - No service-role key belongs in frontend code.
   ========================================================= */

(function (window, document) {
  "use strict";

  const LC = window.LensCircle = window.LensCircle || {};
  const Member = {};

  const state = {
    authorised: false,
    loading: false,
    user: null,
    profile: null,
    dashboard: null,
    submissions: [],
    competitions: [],
    competitionEntries: [],
    activities: [],
    registrations: [],
    bookmarks: [],
    notifications: []
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
      console.info("[Lens Circle Member]", message);
    }
  }

  function formatDate(value) {
    if (!value) return "—";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "—";

    return date.toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric"
    });
  }

  function element(selector) {
    return document.querySelector(selector);
  }

  function renderEmpty(selector, message) {
    const container = element(selector);

    if (!container) return;

    container.replaceChildren();

    const paragraph = document.createElement("p");
    paragraph.textContent = message;

    container.appendChild(paragraph);
  }

  function renderRecords(selector, records, emptyMessage) {
    const container = element(selector);

    if (!container) return;

    container.replaceChildren();

    if (!records.length) {
      renderEmpty(selector, emptyMessage);
      return;
    }

    records.forEach(function (record) {
      const card = document.createElement("article");

      const heading = document.createElement("h3");
      heading.textContent = clean(
        record.title || record.name || record.full_name,
        200
      );

      const description = document.createElement("p");
      description.textContent = clean(
        record.description || record.status || record.category,
        500
      );

      card.append(heading, description);
      container.appendChild(card);
    });
  }

  /* ---------------------------------------------------------
     AUTHENTICATION
  --------------------------------------------------------- */

  Member.verifyAccess = async function () {
    const client = db();

    const {
      data: sessionData,
      error: sessionError
    } = await client.auth.getSession();

    if (sessionError) throw sessionError;

    const session =
      sessionData && sessionData.session;

    if (!session) {
      state.authorised = false;
      return false;
    }

    const {
      data: contextData,
      error: contextError
    } = await client.rpc("get_my_member_context");

    if (contextError) throw contextError;

    const context = Array.isArray(contextData)
      ? contextData[0]
      : contextData;

    if (
      !context ||
      clean(context.role).toLowerCase() !== "member"
    ) {
      state.authorised = false;

      throw new Error(
        "This account does not have Member portal access."
      );
    }

    state.user = session.user;
    state.profile = context.profile || null;
    state.authorised = true;

    return true;
  };

  Member.requireAccess = async function () {
    const allowed = await Member.verifyAccess();

    if (!allowed) {
      window.location.replace("login.html");
      return false;
    }

    return true;
  };

  /* ---------------------------------------------------------
     CENTRAL RPC
  --------------------------------------------------------- */

  Member.rpc = async function (name, params) {
    if (!state.authorised) {
      throw new Error("Member access is not verified.");
    }

    const { data, error } = await db().rpc(
      name,
      params || {}
    );

    if (error) {
      console.error("[Member RPC]", name, error);
      throw error;
    }

    return data;
  };

  /* ---------------------------------------------------------
     DASHBOARD
  --------------------------------------------------------- */

  Member.getDashboard = async function () {
    const data = await Member.rpc(
      "get_my_member_dashboard"
    );

    state.dashboard = Array.isArray(data)
      ? data[0] || {}
      : data || {};

    Member.renderDashboard(state.dashboard);

    return state.dashboard;
  };

  Member.renderDashboard = function (data) {
    const mappings = {
      "[data-member-submission-count]":
        data.submission_count,
      "[data-member-competition-count]":
        data.competition_count,
      "[data-member-activity-count]":
        data.activity_count,
      "[data-member-bookmark-count]":
        data.bookmark_count,
      "[data-member-unread-count]":
        data.unread_notification_count
    };

    Object.entries(mappings).forEach(function (entry) {
      const node = element(entry[0]);

      if (node) {
        node.textContent =
          entry[1] == null ? "0" : String(entry[1]);
      }
    });

    const greeting = element("[data-member-greeting]");

    if (greeting) {
      greeting.textContent =
        "Welcome, " +
        clean(
          state.profile && state.profile.full_name ||
          state.user && state.user.user_metadata &&
          state.user.user_metadata.full_name ||
          "Photographer",
          100
        );
    }
  };

  /* ---------------------------------------------------------
     PROFILE
  --------------------------------------------------------- */

  Member.getProfile = async function () {
    const { data, error } = await db()
      .from("profiles")
      .select(
        "id, full_name, username, bio, location, website, avatar_url, photography_interests, is_public"
      )
      .eq("id", state.user.id)
      .maybeSingle();

    if (error) throw error;

    state.profile = data || {};

    Member.renderProfile(state.profile);

    return state.profile;
  };

  Member.updateProfile = async function (payload) {
    const allowed = {
      full_name: clean(payload.full_name, 100),
      username: clean(payload.username, 30)
        .toLowerCase()
        .replace(/^@/, ""),
      bio: clean(payload.bio, 500),
      location: clean(payload.location, 100),
      website: clean(payload.website, 300),
      photography_interests: array(
        payload.photography_interests
      ).map(function (item) {
        return clean(item, 60);
      }),
      is_public: Boolean(payload.is_public)
    };

    if (!allowed.full_name) {
      throw new Error("Your name is required.");
    }

    if (
      allowed.username &&
      !/^[a-z0-9._]{3,30}$/.test(allowed.username)
    ) {
      throw new Error("Please enter a valid username.");
    }

    const result = await Member.rpc(
      "update_my_member_profile",
      {
        p_profile: allowed
      }
    );

    await Member.getProfile();

    notify("Your profile has been updated.", "success");

    return result;
  };

  Member.renderProfile = function (profile) {
    const fields = {
      full_name: profile.full_name,
      username: profile.username,
      bio: profile.bio,
      location: profile.location,
      website: profile.website
    };

    Object.entries(fields).forEach(function (entry) {
      const field = element(
        '[name="' + entry[0] + '"]'
      );

      if (field) field.value = entry[1] || "";
    });

    const visibility = element('[name="is_public"]');

    if (visibility) {
      visibility.checked = profile.is_public !== false;
    }
  };

  /* ---------------------------------------------------------
     SUBMISSIONS
  --------------------------------------------------------- */

  Member.getSubmissions = async function () {
    const data = await Member.rpc(
      "get_my_photography_submissions"
    );

    state.submissions = array(data);

    Member.renderSubmissions(state.submissions);

    return state.submissions;
  };

  Member.submitPhotography = async function (payload) {
    const title = clean(payload.title, 120);
    const caption = clean(payload.caption, 1000);
    const activityType = clean(
      payload.activity_type,
      40
    );

    if (!title) {
      throw new Error("A photograph title is required.");
    }

    if (!payload.file) {
      throw new Error("Please select a photograph.");
    }

    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp"
    ];

    if (!allowedTypes.includes(payload.file.type)) {
      throw new Error(
        "Only JPEG, PNG and WebP images are accepted."
      );
    }

    if (payload.file.size > 10 * 1024 * 1024) {
      throw new Error(
        "The maximum photograph size is 10 MB."
      );
    }

    if (!LC.submissions ||
        typeof LC.submissions.submit !== "function") {
      throw new Error(
        "The submission service is not configured."
      );
    }

    const result = await LC.submissions.submit({
      title: title,
      caption: caption,
      type: activityType,
      file: payload.file,
      activity_id: payload.activity_id || null,
      competition_id: payload.competition_id || null
    });

    await Member.getSubmissions();

    notify("Your photograph has been submitted.", "success");

    return result;
  };

  Member.withdrawSubmission = async function (submissionId) {
    if (!window.confirm(
      "Are you sure you want to withdraw this submission?"
    )) {
      return false;
    }

    const result = await Member.rpc(
      "withdraw_photography_entry",
      {
        p_submission_id: clean(submissionId, 100)
      }
    );

    await Member.getSubmissions();

    notify("Submission withdrawn.", "success");

    return result;
  };

  Member.renderSubmissions = function (records) {
    const container = element(
      "[data-member-submissions]"
    );

    if (!container) return;

    container.replaceChildren();

    if (!records.length) {
      renderEmpty(
        "[data-member-submissions]",
        "Your photography submissions will appear here."
      );
      return;
    }

    records.forEach(function (record) {
      const card = document.createElement("article");

      const title = document.createElement("h3");
      title.textContent = clean(record.title, 150);

      const status = document.createElement("p");
      status.textContent =
        "Status: " + clean(record.status, 40);

      const date = document.createElement("p");
      date.textContent =
        "Submitted: " + formatDate(record.created_at);

      card.append(title, status, date);

      if (record.status === "pending") {
        const withdraw = document.createElement("button");
        withdraw.type = "button";
        withdraw.textContent = "Withdraw";

        withdraw.addEventListener("click", function () {
          Member.withdrawSubmission(record.id)
            .catch(function (error) {
              notify(error.message, "error");
            });
        });

        card.appendChild(withdraw);
      }

      container.appendChild(card);
    });
  };

  /* ---------------------------------------------------------
     COMPETITIONS
  --------------------------------------------------------- */

  Member.getCompetitions = async function () {
    const data = await Member.rpc(
      "get_published_competitions"
    );

    state.competitions = array(data);

    renderRecords(
      "[data-member-competitions]",
      state.competitions,
      "There are currently no published competitions."
    );

    return state.competitions;
  };

  Member.getCompetitionEntries = async function () {
    const data = await Member.rpc(
      "get_my_competition_entries"
    );

    state.competitionEntries = array(data);

    renderRecords(
      "[data-member-competition-entries]",
      state.competitionEntries,
      "You have not entered any competitions yet."
    );

    return state.competitionEntries;
  };

  /* ---------------------------------------------------------
     ACTIVITIES
  --------------------------------------------------------- */

  Member.getActivities = async function () {
    const data = await Member.rpc(
      "get_published_activities"
    );

    state.activities = array(data);

    renderRecords(
      "[data-member-activities]",
      state.activities,
      "No activities are currently available."
    );

    return state.activities;
  };

  Member.getRegistrations = async function () {
    const data = await Member.rpc(
      "get_my_activity_registrations"
    );

    state.registrations = array(data);

    renderRecords(
      "[data-member-registrations]",
      state.registrations,
      "You have not registered for any activities yet."
    );

    return state.registrations;
  };

  Member.registerForActivity = async function (activityId) {
    const id = clean(activityId, 100);

    if (!id) {
      throw new Error("Activity ID is required.");
    }

    const result = await Member.rpc(
      "register_for_activity",
      {
        p_activity_id: id
      }
    );

    await Member.getRegistrations();

    notify("Activity registration successful.", "success");

    return result;
  };

  Member.withdrawFromActivity = async function (activityId) {
    if (!window.confirm(
      "Withdraw from this activity?"
    )) {
      return false;
    }

    const result = await Member.rpc(
      "withdraw_from_activity",
      {
        p_activity_id: clean(activityId, 100)
      }
    );

    await Member.getRegistrations();

    notify("Activity registration withdrawn.", "success");

    return result;
  };

  /* ---------------------------------------------------------
     BOOKMARKS
  --------------------------------------------------------- */

  Member.getBookmarks = async function () {
    const data = await Member.rpc(
      "get_my_bookmarks"
    );

    state.bookmarks = array(data);

    renderRecords(
      "[data-member-bookmarks]",
      state.bookmarks,
      "Your saved photographs and stories will appear here."
    );

    return state.bookmarks;
  };

  Member.addBookmark = async function (
    targetType,
    targetId
  ) {
    const allowedTypes = [
      "photograph",
      "profile",
      "competition",
      "activity",
      "story",
      "exhibition"
    ];

    const type = clean(targetType, 30).toLowerCase();
    const id = clean(targetId, 100);

    if (!allowedTypes.includes(type) || !id) {
      throw new Error("Invalid bookmark details.");
    }

    const result = await Member.rpc(
      "add_bookmark",
      {
        p_target_type: type,
        p_target_id: id
      }
    );

    await Member.getBookmarks();

    notify("Added to your bookmarks.", "success");

    return result;
  };

  Member.removeBookmark = async function (bookmarkId) {
    const result = await Member.rpc(
      "remove_bookmark",
      {
        p_bookmark_id: clean(bookmarkId, 100)
      }
    );

    await Member.getBookmarks();

    notify("Bookmark removed.", "success");

    return result;
  };

  /* ---------------------------------------------------------
     NOTIFICATIONS
  --------------------------------------------------------- */

  Member.getNotifications = async function () {
    const data = await Member.rpc(
      "get_my_notifications"
    );

    state.notifications = array(data);

    Member.renderNotifications(state.notifications);

    return state.notifications;
  };

  Member.markNotificationRead = async function (
    notificationId
  ) {
    const result = await Member.rpc(
      "mark_notification_read",
      {
        p_notification_id: clean(notificationId, 100)
      }
    );

    await Member.getNotifications();

    return result;
  };

  Member.renderNotifications = function (records) {
    const container = element(
      "[data-member-notifications]"
    );

    if (!container) return;

    container.replaceChildren();

    if (!records.length) {
      renderEmpty(
        "[data-member-notifications]",
        "You are all caught up. No notifications yet."
      );
      return;
    }

    records.forEach(function (record) {
      const card = document.createElement("article");

      const title = document.createElement("h3");
      title.textContent = clean(record.title, 150);

      const message = document.createElement("p");
      message.textContent = clean(record.message, 500);

      const date = document.createElement("small");
      date.textContent = formatDate(record.created_at);

      card.append(title, message, date);

      if (!record.is_read) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = "Mark as read";

        button.addEventListener("click", function () {
          Member.markNotificationRead(record.id)
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
     ACCOUNT
  --------------------------------------------------------- */

  Member.changePassword = async function (password) {
    const value = String(password || "");

    if (value.length < 10) {
      throw new Error(
        "Use a password with at least 10 characters."
      );
    }

    const { error } = await db().auth.updateUser({
      password: value
    });

    if (error) throw error;

    notify("Password updated successfully.", "success");

    return true;
  };

  Member.requestEmailChange = async function (email) {
    const value = clean(email, 254);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      throw new Error("Enter a valid email address.");
    }

    const { error } = await db().auth.updateUser({
      email: value
    });

    if (error) throw error;

    notify(
      "Check your email to confirm the address change.",
      "success"
    );

    return true;
  };

  Member.signOut = async function () {
    const { error } = await db().auth.signOut();

    if (error) throw error;

    state.authorised = false;
    state.user = null;

    window.location.replace("login.html");
  };

  /* ---------------------------------------------------------
     PROFILE FORM BINDING
  --------------------------------------------------------- */

  Member.bindProfileForm = function () {
    const form = element("[data-member-profile-form]");

    if (!form || form.dataset.bound === "true") return;

    form.dataset.bound = "true";

    form.addEventListener("submit", async function (ev