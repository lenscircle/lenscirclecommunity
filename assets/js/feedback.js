
/* =========================================================
   LENS CIRCLE — FEEDBACK MODULE
   File: assets/js/feedback.js

   FEATURES
   - Submit feedback
   - Bug reports
   - Feature requests
   - General suggestions
   - Complaints
   - Support requests
   - Member feedback history
   - Staff feedback management
   - Feedback status updates

   EXPECTED SUPABASE RPC CONTRACTS
   - submit_lens_circle_feedback
   - get_my_feedback
   - get_feedback_details
   - get_staff_feedback
   - update_feedback_status
   - add_feedback_response
   - get_feedback_statistics

   SECURITY
   - Members can access only their own feedback.
   - Staff access must be department-scoped.
   - Admin has platform-wide access.
   - Status changes and responses must be audited.
   - Never trust browser-supplied user IDs or staff roles.
   ========================================================= */

(function (window, document) {
  "use strict";

  const LC = window.LensCircle =
    window.LensCircle || {};

  const Feedback = {};

  const CONFIG = {
    maxSubjectLength: 150,
    maxMessageLength: 5000,
    pageSize: 20,
    categories: [
      "general",
      "bug_report",
      "feature_request",
      "competition",
      "community",
      "account",
      "complaint",
      "other"
    ],
    priorities: [
      "low",
      "normal",
      "high"
    ],
    statuses: [
      "open",
      "under_review",
      "in_progress",
      "resolved",
      "closed"
    ]
  };

  const state = {
    user: null,
    authenticated: false,
    submissions: [],
    selectedFeedback: null,
    staffRecords: [],
    page: 0,
    hasMore: true,
    loading: false
  };

  /* ---------------------------------------------------------
     HELPERS
  --------------------------------------------------------- */

  function db() {
    if (LC.db) return LC.db;

    if (LC.supabase) return LC.supabase;

    throw new Error("Supabase client is unavailable.");
  }

  function clean(value, maxLength) {
    return String(value == null ? "" : value)
      .trim()
      .slice(0, maxLength || 500);
  }

  function list(value) {
    return Array.isArray(value) ? value : [];
  }

  function node(tag, className, content) {
    const element = document.createElement(tag);

    if (className) element.className = className;

    if (content !== undefined) {
      element.textContent = clean(content, 3000);
    }

    return element;
  }

  function notify(message, type) {
    if (
      LC.forms &&
      typeof LC.forms.notify === "function"
    ) {
      LC.forms.notify(message, type || "info");
    } else {
      console.info("[Lens Circle Feedback]", message);
    }
  }

  function formatDate(value) {
    if (!value) return "—";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "—";

    return date.toLocaleString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  }

  function validCategory(value) {
    return CONFIG.categories.includes(
      clean(value, 40).toLowerCase()
    );
  }

  function validPriority(value) {
    return CONFIG.priorities.includes(
      clean(value, 20).toLowerCase()
    );
  }

  function validStatus(value) {
    return CONFIG.statuses.includes(
      clean(value, 30).toLowerCase()
    );
  }

  /* ---------------------------------------------------------
     RPC
  --------------------------------------------------------- */

  Feedback.rpc = async function (name, params) {
    const { data, error } = await db().rpc(
      name,
      params || {}
    );

    if (error) {
      console.error("[Feedback RPC]", name, error);
      throw error;
    }

    return data;
  };

  /* ---------------------------------------------------------
     AUTHENTICATION
  --------------------------------------------------------- */

  Feedback.refreshAuth = async function () {
    const { data, error } = await db()
      .auth.getSession();

    if (error) throw error;

    const session = data && data.session;

    state.authenticated = Boolean(session);
    state.user = session ? session.user : null;

    return state.authenticated;
  };

  Feedback.requireMember = async function () {
    const authenticated =
      await Feedback.refreshAuth();

    if (!authenticated) {
      window.location.assign(
        "/member/login.html"
      );

      return false;
    }

    return true;
  };

  /* ---------------------------------------------------------
     SUBMIT FEEDBACK
  --------------------------------------------------------- */

  Feedback.submit = async function (payload) {
    const allowed = await Feedback.requireMember();

    if (!allowed) return false;

    const subject = clean(
      payload.subject,
      CONFIG.maxSubjectLength
    );

    const message = clean(
      payload.message,
      CONFIG.maxMessageLength
    );

    const category = clean(
      payload.category,
      40
    ).toLowerCase();

    const priority = clean(
      payload.priority || "normal",
      20
    ).toLowerCase();

    if (!subject) {
      throw new Error("Enter a subject.");
    }

    if (message.length < 10) {
      throw new Error(
        "Please provide at least 10 characters."
      );
    }

    if (!validCategory(category)) {
      throw new Error("Select a valid category.");
    }

    if (!validPriority(priority)) {
      throw new Error("Select a valid priority.");
    }

    const result = await Feedback.rpc(
      "submit_lens_circle_feedback",
      {
        p_subject: subject,
        p_message: message,
        p_category: category,
        p_priority: priority
      }
    );

    notify(
      "Thank you. Your feedback has been submitted.",
      "success"
    );

    await Feedback.getMine();

    return result;
  };

  /* ---------------------------------------------------------
     MEMBER FEEDBACK HISTORY
  --------------------------------------------------------- */

  Feedback.getMine = async function () {
    const allowed = await Feedback.requireMember();

    if (!allowed) return [];

    const data = await Feedback.rpc(
      "get_my_feedback"
    );

    state.submissions = list(data);

    Feedback.renderMine(state.submissions);

    return state.submissions;
  };

  Feedback.renderMine = function (records) {
    const container = document.querySelector(
      "[data-my-feedback]"
    );

    if (!container) return;

    container.replaceChildren();

    if (!records.length) {
      container.appendChild(
        node(
          "p",
          "feedback-empty",
          "You haven't submitted any feedback yet."
        )
      );

      return;
    }

    records.forEach(function (record) {
      const card = node(
        "article",
        "feedback-card"
      );

      const title = node(
        "h3",
        "feedback-title",
        record.subject
      );

      const category = node(
        "span",
        "feedback-category",
        record.category
      );

      const status = node(
        "span",
        "feedback-status",
        record.status
      );

      const date = node(
        "small",
        "feedback-date",
        formatDate(record.created_at)
      );

      const button = node(
        "button",
        "feedback-details-button",
        "View details"
      );

      button.type = "button";

      button.addEventListener("click", function () {
        Feedback.getDetails(record.id)
          .catch(function (error) {
            notify(error.message, "error");
          });
      });

      card.append(
        title,
        category,
        status,
        date,
        button
      );

      container.appendChild(card);
    });
  };

  /* ---------------------------------------------------------
     FEEDBACK DETAILS
  --------------------------------------------------------- */

  Feedback.getDetails = async function (feedbackId) {
    const id = clean(feedbackId, 100);

    if (!id) {
      throw new Error("Feedback ID is required.");
    }

    const data = await Feedback.rpc(
      "get_feedback_details",
      {
        p_feedback_id: id
      }
    );

    state.selectedFeedback = Array.isArray(data)
      ? data[0] || null
      : data;

    Feedback.renderDetails(
      state.selectedFeedback
    );

    return state.selectedFeedback;
  };

  Feedback.renderDetails = function (record) {
    const container = document.querySelector(
      "[data-feedback-details]"
    );

    if (!container) return;

    container.replaceChildren();

    if (!record) {
      container.appendChild(
        node(
          "p",
          "feedback-empty",
          "Feedback not found."
        )
      );

      return;
    }

    container.append(
      node("h2", "feedback-detail-title", record.subject),
      node("p", "feedback-detail-category", record.category),
      node("p", "feedback-detail-message", record.message),
      node("p", "feedback-detail-status", "Status: " + record.status),
      node("small", "feedback-detail-date", formatDate(record.created_at))
    );

    const responses = list(record.responses);

    if (responses.length) {
      const heading = node(
        "h3",
        "feedback-response-heading",
        "Responses"
      );

      container.appendChild(heading);

      responses.forEach(function (response) {
        const item = node(
          "article",
          "feedback-response"
        );

        item.append(
          node(
            "p",
            "feedback-response-message",
            response.message
          ),
          node(
            "small",
            "feedback-response-date",
            formatDate(response.created_at)
          )
        );

        container.appendChild(item);
      });
    }
  };

  /* ---------------------------------------------------------
     STAFF FEEDBACK LIST
  --------------------------------------------------------- */

  Feedback.getStaffRecords = async function (options) {
    const settings = options || {};

    if (state.loading || !state.hasMore) {
      return state.staffRecords;
    }

    if (settings.reset) {
      state.page = 0;
      state.hasMore = true;
      state.staffRecords = [];
    }

    state.loading = true;

    try {
      const data = await Feedback.rpc(
        "get_staff_feedback",
        {
          p_status: settings.status || null,
          p_category: settings.category || null,
          p_search: settings.search || null,
          p_page: state.page,
          p_page_size: CONFIG.pageSize
        }
      );

      const records = list(data);

      state.staffRecords = settings.reset
        ? records
        : state.staffRecords.concat(records);

      state.hasMore =
        records.length === CONFIG.pageSize;

      if (records.length) state.page += 1;

      Feedback.renderStaffRecords(
        state.staffRecords
      );

      return state.staffRecords;

    } finally {
      state.loading = false;
    }
  };

  Feedback.renderStaffRecords = function (records) {
    const container = document.querySelector(
      "[data-staff-feedback]"
    );

    if (!container) return;

    container.replaceChildren();

    if (!records.length) {
      container.appendChild(
        node(
          "p",
          "feedback-empty",
          "No feedback records found."
        )
      );

      return;
    }

    records.forEach(function (record) {
      const card = node(
        "article",
        "staff-feedback-card"
      );

      card.append(
        node("h3", "feedback-title", record.subject),
        node("p", "feedback-category", record.category),
        node("p", "feedback-member", record.member_name),
        node("span", "feedback-priority", record.priority),
        node("span", "feedback-status", record.status),
        node("small", "feedback-date", formatDate(record.created_at))
      );

      const button = node(
        "button",
        "feedback-details-button",
        "Manage feedback"
      );

      button.type = "button";

      button.addEventListener("click", function () {
        Feedback.getDetails(record.id)
          .catch(function (error) {
            notify(error.message, "error");
          });
      });

      card.appendChild(button);

      container.appendChild(card);
    });
  };

  /* ---------------------------------------------------------
     UPDATE STATUS
  --------------------------------------------------------- */

  Feedback.updateStatus = async function (
    feedbackId,
    status
  ) {
    const id = clean(feedbackId, 100);

    const newStatus = clean(
      status,
      30
    ).toLowerCase();

    if (!id) {
      throw new Error("Feedback ID is required.");
    }

    if (!validStatus(newStatus)) {
      throw new Error("Invalid feedback status.");
    }

    await Feedback.rpc(
      "update_feedback_status",
      {
        p_feedback_id: id,
        p_status: newStatus
      }
    );

    notify("Feedback status updated.", "success");

    return Feedback.getStaffRecords({
      reset: true
    });
  };

  /* ---------------------------------------------------------
     STAFF RESPONSE
  --------------------------------------------------------- */

  Feedback.respond = async function (
    feedbackId,
    message
  ) {
    const id = clean(feedbackId, 100);
    const text = clean(message, 3000);

    if (!id) {
      throw new Error("Feedback ID is required.");
    }

    if (text.length < 2) {
      throw new Error("Enter a response.");
    }

    const result = await Feedback.rpc(
      "add_feedback_response",
      {
        p_feedback_id: id,
        p_message: text
      }
    );

    notify("Response added successfully.", "success");

    await Feedback.getDetails(id);

    return result;
  };

  /* ---------------------------------------------------------
     STATISTICS
  --------------------------------------------------------- */

  Feedback.getStatistics = async function () {
    const data = await Feedback.rpc(
      "get_feedback_statistics"
    );

    const stats = Array.isArray(data)
      ? data[0] || {}
      : data || {};

    Feedback.renderStatistics(stats);

    return stats;
  };

  Feedback.renderStatistics = function (stats) {
    const container = document.querySelector(
      "[data-feedback-statistics]"
    );

    if (!container) return;

    container.replaceChildren();

    const metrics = [
      ["Total", stats.total],
      ["Open", stats.open],
      ["Under review", stats.under_review],
      ["In progress", stats.in_progress],
      ["Resolved", stats.resolved],
      ["Closed", stats.closed]
    ];

    metrics.forEach(function (metric) {
      const item = node(
        "div",
        "feedback-stat"
      );

      item.append(
        node("span", "feedback-stat-label", metric[0]),
        node(
          "strong",
          "feedback-stat-value",
          String(Number(metric[1]) || 0)
        )
      );

      container.appendChild(item);
    });
  };

  /* ---------------------------------------------------------
     SUBMISSION FORM
  --------------------------------------------------------- */

  Feedback.bindSubmissionForm = function () {
    const form = document.querySelector(
      "[data-feedback-form]"
    );

    if (!form || form.dataset.bound) return;

    form.dataset.bound = "true";

    form.addEventListener("submit", async function (event) {
      event.preventDefault();

      const formData = new FormData(form);

      const payload = {
        subject: formData.get("subject"),
        message: formData.get("message"),
        category: formData.get("category"),
        priority: formData.get("priority") || "normal"
      };

      const button = form.querySelector(
        '[type="submit"]'
      );

      if (button) button.disabled = true;

      try {
        await Feedback.submit(payload);
        form.reset();
      } catch (error) {
        notify(error.message, "error");
      } finally {
        if (button) button.disabled = false;
      }
    });
  };

  /* ---------------------------------------------------------
     STAFF RESPONSE FORM
  --------------------------------------------------------- */

  Feedback.bindResponseForm = function () {
    const form = document.querySelector(
      "[data-feedback-response-form]"
    );

    if (!form || form.dataset.bound) return;

    form.dataset.bound = "true";

    form.addEventListener("submit", async function (event) {
      event.preventDefault();

      const formData = new FormData(form);

      const feedbackId = formData.get("feedback_id");
      const message = formData.get("message");

      const button = form.querySelector(
        '[type="submit"]'
      );

      if (button) button.disabled = true;

      try {
        await Feedback.respond(feedbackId, message);
        form.reset();
      } catch (error) {
        notify(error.message, "error");
      } finally {
        if (button) button.disabled = false;
      }
    });
  };

  /* ---------------------------------------------------------
     INITIALISATION
  --------------------------------------------------------- */

  Feedback.init = async function (options) {
    const settings = options || {};

    await Feedback.refreshAuth();

    if (settings.requireMember) {
      const allowed = await Feedback.requireMember();

      if (!allowed) return false;
    }

    if (settings.staff) {
      await Feedback.getStaffRecords({
        reset: true
      });

      Feedback.bindResponseForm();

      if (settings.statistics) {
        await Feedback.getStatistics();
      }
    } else {
      Feedback.bindSubmissionForm();

      if (settings.history) {
        await Feedback.getMine();
      }
    }

    return true;
  };

  /* ---------------------------------------------------------
     EXPORT
  --------------------------------------------------------- */

  Feedback.getState = function () {
    return {
      authenticated: state.authenticated,
      memberRecords: state.submissions.length,
      staffRecords: state.staffRecords.length,
      selectedFeedback: state.selectedFeedback
    };
  };

  LC.feedback = Feedback;
  window.LensCircleFeedback = Feedback;

})(window, document);
