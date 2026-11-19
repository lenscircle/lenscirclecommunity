
/**
 * LENS CIRCLE — ACTIVITIES MODULE
 * File: assets/js/activities.js
 *
 * Features:
 * - Retrieve published community activities
 * - Retrieve activity details
 * - Register for activities
 * - Withdraw from activities
 * - Retrieve activity participants
 * - Create and update activities (authorised staff only)
 * - Render activity cards and details
 *
 * REQUIRED SUPABASE RPC FUNCTIONS:
 *
 * get_published_activities()
 * get_activity_details(p_activity_id)
 * register_for_activity(p_activity_id)
 * withdraw_from_activity(p_activity_id)
 * get_activity_participants(p_activity_id)
 * create_activity(p_title, p_description, p_activity_type,
 *   p_start_at, p_end_at, p_submission_deadline, p_status)
 * update_activity(p_activity_id, p_title, p_description,
 *   p_activity_type, p_start_at, p_end_at, p_submission_deadline, p_status)
 *
 * SECURITY:
 * - All permissions must be enforced by database functions and RLS.
 * - User identity must be derived from auth.uid().
 * - Never trust client-supplied role, department or owner IDs.
 * - Photo submissions must use the dedicated submissions module.
 */

(function () {
  "use strict";

  const CONFIG = {
    rpc: {
      list: "get_published_activities",
      details: "get_activity_details",
      register: "register_for_activity",
      withdraw: "withdraw_from_activity",
      participants: "get_activity_participants",
      create: "create_activity",
      update: "update_activity"
    },

    types: {
      photo_of_the_day: "Photo of the Day",
      weekly_challenge: "Weekly Challenge",
      photography_battle: "Photography Battle",
      monthly_theme: "Monthly Theme",
      community_exhibition: "Community Exhibition",
      special_event: "Special Event"
    },

    statuses: {
      draft: "Draft",
      upcoming: "Upcoming",
      open: "Open for Participation",
      active: "Active",
      judging: "Judging",
      completed: "Completed",
      cancelled: "Cancelled"
    },

    timezone: "Asia/Kolkata"
  };

  const state = {
    activities: [],
    currentActivity: null,
    participants: [],
    loading: false
  };

  function client() {
    if (window.LensCircle?.db) {
      return window.LensCircle.db;
    }

    if (window.supabaseClient) {
      return window.supabaseClient;
    }

    throw new Error(
      "Lens Circle Supabase client is unavailable."
    );
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(
      /[&<>"']/g,
      character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      })[character]
    );
  }

  function normaliseActivity(record) {
    if (!record || typeof record !== "object") {
      return null;
    }

    return {
      id: record.id || record.activity_id || "",
      title: record.title || "Untitled Activity",
      description: record.description || "",
      type: record.activity_type || record.type || "special_event",
      status: record.status || "upcoming",
      startAt: record.start_at || null,
      endAt: record.end_at || null,
      submissionDeadline: record.submission_deadline || null,
      coverImage: record.cover_image_url || "",
      location: record.location || "",
      participantCount: Number(record.participant_count || 0),
      createdAt: record.created_at || null
    };
  }

  function formatDate(value) {
    if (!value) return "To be announced";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "To be announced";
    }

    return new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: CONFIG.timezone
    }).format(date);
  }

  function formatDateTime(value) {
    if (!value) return "To be announced";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "To be announced";
    }

    return new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: CONFIG.timezone,
      timeZoneName: "short"
    }).format(date);
  }

  function getStatusLabel(status) {
    return CONFIG.statuses[status] || status || "Upcoming";
  }

  function getTypeLabel(type) {
    return CONFIG.types[type] || type || "Community Activity";
  }

  function renderCard(record) {
    const item = normaliseActivity(record);

    if (!item) return "";

    const image = item.coverImage
      ? `
        <img
          src="${escapeHTML(item.coverImage)}"
          alt="${escapeHTML(item.title)}"
          loading="lazy"
        >
      `
      : `
        <div class="lc-activity-placeholder">
          <span>Lens Circle</span>
        </div>
      `;

    return `
      <article class="lc-activity-card"
        data-activity-id="${escapeHTML(item.id)}">

        <div class="lc-activity-card__visual">
          ${image}

          <span class="lc-activity-card__status
            lc-activity-status--${escapeHTML(item.status)}">
            ${escapeHTML(getStatusLabel(item.status))}
          </span>
        </div>

        <div class="lc-activity-card__body">

          <p class="lc-activity-type">
            ${escapeHTML(getTypeLabel(item.type))}
          </p>

          <h3>${escapeHTML(item.title)}</h3>

          <p class="lc-activity-description">
            ${escapeHTML(item.description)}
          </p>

          <div class="lc-activity-meta">
            <span>
              <strong>Starts</strong>
              ${escapeHTML(formatDate(item.startAt))}
            </span>

            <span>
              <strong>Participants</strong>
              ${escapeHTML(item.participantCount)}
            </span>
          </div>

          <button
            type="button"
            class="lc-button lc-button--dark"
            data-activity-action="view"
            data-activity-id="${escapeHTML(item.id)}"
            ${item.id ? "" : "disabled"}>
            Explore Activity
          </button>

        </div>
      </article>
    `;
  }

  function renderList(container, activities) {
    if (!container) return;

    if (!activities.length) {
      container.innerHTML = `
        <div class="lc-activity-empty">
          <h3>Something exciting is coming</h3>
          <p>
            New activities and community experiences
            will be announced here.
          </p>
        </div>
      `;

      return;
    }

    container.innerHTML = activities
      .map(renderCard)
      .join("");
  }

  async function getPublished() {
    state.loading = true;

    try {
      const { data, error } = await client().rpc(
        CONFIG.rpc.list
      );

      if (error) throw error;

      state.activities = Array.isArray(data)
        ? data.map(normaliseActivity).filter(Boolean)
        : [];

      return {
        success: true,
        data: state.activities
      };

    } catch (error) {
      console.error("Activity retrieval failed:", error);

      return {
        success: false,
        data: [],
        error: error.message || "Unable to load activities."
      };

    } finally {
      state.loading = false;
    }
  }

  async function loadInto(selector) {
    const container = typeof selector === "string"
      ? document.querySelector(selector)
      : selector;

    if (!container) {
      return {
        success: false,
        error: "Activity container not found."
      };
    }

    container.innerHTML = `
      <div class="lc-activity-loading">
        Loading community activities...
      </div>
    `;

    const result = await getPublished();

    if (!result.success) {
      container.innerHTML = `
        <div class="lc-activity-error">
          <p>Activities could not be loaded.</p>
          <button type="button"
            class="lc-button lc-button--outline"
            data-activity-action="reload">
            Try again
          </button>
        </div>
      `;

      return result;
    }

    renderList(container, result.data);

    return result;
  }

  async function getDetails(activityId) {
    if (!activityId) {
      throw new Error("Activity ID is required.");
    }

    const { data, error } = await client().rpc(
      CONFIG.rpc.details,
      {
        p_activity_id: activityId
      }
    );

    if (error) throw error;

    const record = Array.isArray(data)
      ? data[0]
      : data;

    if (!record) {
      throw new Error("Activity not found.");
    }

    state.currentActivity = normaliseActivity(record);

    return {
      success: true,
      data: state.currentActivity,
      raw: record
    };
  }

  async function register(activityId) {
    if (!activityId) {
      throw new Error("Activity ID is required.");
    }

    const { data, error } = await client().rpc(
      CONFIG.rpc.register,
      {
        p_activity_id: activityId
      }
    );

    if (error) throw error;

    return {
      success: true,
      data
    };
  }

  async function withdraw(activityId) {
    if (!activityId) {
      throw new Error("Activity ID is required.");
    }

    const confirmed = window.confirm(
      "Are you sure you want to withdraw from this activity?"
    );

    if (!confirmed) {
      return {
        success: false,
        cancelled: true
      };
    }

    const { data, error } = await client().rpc(
      CONFIG.rpc.withdraw,
      {
        p_activity_id: activityId
      }
    );

    if (error) throw error;

    return {
      success: true,
      data
    };
  }

  async function getParticipants(activityId) {
    if (!activityId) {
      throw new Error("Activity ID is required.");
    }

    const { data, error } = await client().rpc(
      CONFIG.rpc.participants,
      {
        p_activity_id: activityId
      }
    );

    if (error) throw error;

    state.participants = Array.isArray(data)
      ? data
      : [];

    return {
      success: true,
      data: state.participants
    };
  }

  async function create(payload) {
    if (!payload?.title || !payload?.type) {
      throw new Error(
        "Activity title and type are required."
      );
    }

    if (!Object.hasOwn(CONFIG.types, payload.type)) {
      throw new Error("Invalid activity type.");
    }

    const { data, error } = await client().rpc(
      CONFIG.rpc.create,
      {
        p_title: payload.title.trim(),
        p_description: payload.description || "",
        p_activity_type: payload.type,
        p_start_at: payload.startAt || null,
        p_end_at: payload.endAt || null,
        p_submission_deadline: payload.submissionDeadline || null,
        p_status: payload.status || "draft"
      }
    );

    if (error) throw error;

    return {
      success: true,
      data
    };
  }

  async function update(activityId, payload) {
    if (!activityId) {
      throw new Error("Activity ID is required.");
    }

    if (!payload?.title || !payload?.type) {
      throw new Error(
        "Activity title and type are required."
      );
    }

    if (!Object.hasOwn(CONFIG.types, payload.type)) {
      throw new Error("Invalid activity type.");
    }

    const { data, error } = await client().rpc(
      CONFIG.rpc.update,
      {
        p_activity_id: activityId,
        p_title: payload.title.trim(),
        p_description: payload.description || "",
        p_activity_type: payload.type,
        p_start_at: payload.startAt || null,
        p_end_at: payload.endAt || null,
        p_submission_deadline: payload.submissionDeadline || null,
        p_status: payload.status || "draft"
      }
    );

    if (error) throw error;

    return {
      success: true,
      data
    };
  }

  function filter(activities, options = {}) {
    let result = [...activities];

    if (options.type && options.type !== "all") {
      result = result.filter(item =>
        item.type === options.type
      );
    }

    if (options.status && options.status !== "all") {
      result = result.filter(item =>
        item.status === options.status
      );
    }

    if (options.search) {
      const term = options.search.toLowerCase();

      result = result.filter(item =>
        item.title.toLowerCase().includes(term) ||
        item.description.toLowerCase().includes(term) ||
        item.type.toLowerCase().includes(term)
      );
    }

    return result;
  }

  function renderParticipants(container, participants) {
    if (!container) return;

    if (!participants.length) {
      container.innerHTML = `
        <p>No participants are currently listed.</p>
      `;
      return;
    }

    container.innerHTML = participants.map(person => `
      <div class="lc-activity-participant">
        <span>${escapeHTML(person.full_name || "Member")}</span>
      </div>
    `).join("");
  }

  function bind(container = document) {
    container.addEventListener("click", async event => {
      const button = event.target.closest(
        "[data-activity-action]"
      );

      if (!button) return;

      const action = button.dataset.activityAction;
      const activityId = button.dataset.activityId;

      try {
        if (action === "view") {
          window.dispatchEvent(
            new CustomEvent("lenscircle:activity-view", {
              detail: { activityId }
            })
          );
        }

        if (action === "reload") {
          const target = button.closest(
            "[data-activity-list]"
          );

          if (target) await loadInto(target);
        }

      } catch (error) {
        console.error("Activity action failed:", error);

        window.dispatchEvent(
          new CustomEvent("lenscircle:activity-error", {
            detail: {
              message: error.message || "Something went wrong."
            }
          })
        );
      }
    });
  }

  window.LensCircleActivities = {
    config: CONFIG,
    state,
    getPublished,
    loadInto,
    getDetails,
    register,
    withdraw,
    getParticipants,
    create,
    update,
    renderCard,
    renderList,
    renderParticipants,
    filter,
    bind,
    formatDate,
    formatDateTime
  };

})();
