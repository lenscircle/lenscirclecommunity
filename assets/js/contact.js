
/* =========================================================
   LENS CIRCLE — CONTACT MODULE
   File: assets/js/contact.js

   FEATURES
   - Public contact form
   - General enquiries
   - Partnership enquiries
   - Editorial and press enquiries
   - Competition enquiries
   - Technical support
   - Member enquiry history
   - Staff enquiry management
   - Enquiry status tracking
   - Staff responses

   EXPECTED SUPABASE RPC CONTRACTS
   - submit_lens_circle_contact
   - get_my_contact_requests
   - get_contact_request_details
   - get_staff_contact_requests
   - update_contact_request_status
   - respond_to_contact_request
   - get_contact_request_statistics

   SECURITY
   - Public submissions must be rate-limited.
   - Email validation and spam protection are required.
   - Members can access only their own requests.
   - Staff access must be permission-checked server-side.
   - Never trust browser-supplied user IDs or staff roles.
   ========================================================= */

(function (window, document) {
  "use strict";

  const LC = window.LensCircle =
    window.LensCircle || {};

  const Contact = {};

  const CONFIG = {
    maxNameLength: 120,
    maxEmailLength: 254,
    maxSubjectLength: 180,
    maxMessageLength: 5000,
    pageSize: 20,

    categories: [
      "general",
      "membership",
      "competition",
      "partnership",
      "editorial",
      "press",
      "technical",
      "privacy",
      "other"
    ],

    statuses: [
      "open",
      "under_review",
      "in_progress",
      "awaiting_response",
      "resolved",
      "closed"
    ]
  };

  const state = {
    user: null,
    authenticated: false,
    requests: [],
    staffRequests: [],
    selectedRequest: null,
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

  function element(tag, className, content) {
    const node = document.createElement(tag);

    if (className) node.className = className;

    if (content !== undefined) {
      node.textContent = clean(content, 5000);
    }

    return node;
  }

  function notify(message, type) {
    if (
      LC.forms &&
      typeof LC.forms.notify === "function"
    ) {
      LC.forms.notify(message, type || "info");
    } else {
      console.info("[Lens Circle Contact]", message);
    }
  }

  function validEmail(email) {
    const value = clean(
      email,
      CONFIG.maxEmailLength
    );

    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  function validCategory(category) {
    return CONFIG.categories.includes(
      clean(category, 40).toLowerCase()
    );
  }

  function validStatus(status) {
    return CONFIG.statuses.includes(
      clean(status, 40).toLowerCase()
    );
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

  /* ---------------------------------------------------------
     RPC
  --------------------------------------------------------- */

  Contact.rpc = async function (name, params) {
    const { data, error } = await db().rpc(
      name,
      params || {}
    );

    if (error) {
      console.error("[Contact RPC]", name, error);
      throw error;
    }

    return data;
  };

  /* ---------------------------------------------------------
     AUTHENTICATION
  --------------------------------------------------------- */

  Contact.refreshAuth = async function () {
    const { data, error } = await db()
      .auth.getSession();

    if (error) throw error;

    const session = data && data.session;

    state.authenticated = Boolean(session);
    state.user = session ? session.user : null;

    return state.authenticated;
  };

  Contact.requireMember = async function () {
    const authenticated =
      await Contact.refreshAuth();

    if (!authenticated) {
      window.location.assign(
        "/member/login.html"
      );

      return false;
    }

    return true;
  };

  /* ---------------------------------------------------------
     SUBMIT CONTACT REQUEST
  --------------------------------------------------------- */

  Contact.submit = async function (payload) {
    const name = clean(
      payload.name,
      CONFIG.maxNameLength
    );

    const email = clean(
      payload.email,
      CONFIG.maxEmailLength
    ).toLowerCase();

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

    if (name.length < 2) {
      throw new Error("Enter your name.");
    }

    if (!validEmail(email)) {
      throw new Error("Enter a valid email address.");
    }

    if (subject.length < 3) {
      throw new Error("Enter a subject.");
    }

    if (message.length < 10) {
      throw new Error(
        "Please provide at least 10 characters."
      );
    }

    if (!validCategory(category)) {
      throw new Error("Select a valid enquiry category.");
    }

    if (payload.consent !== true) {
      throw new Error(
        "Please agree to the privacy notice."
      );
    }

    const result = await Contact.rpc(
      "submit_lens_circle_contact",
      {
        p_name: name,
        p_email: email,
        p_subject: subject,
        p_message: message,
        p_category: category,
        p_consent: true
      }
    );

    notify(
      "Your enquiry has been submitted successfully.",
      "success"
    );

    return result;
  };

  /* ---------------------------------------------------------
     MEMBER REQUEST HISTORY
  --------------------------------------------------------- */

  Contact.getMine = async function () {
    const allowed = await Contact.requireMember();

    if (!allowed) return [];

    const data = await Contact.rpc(
      "get_my_contact_requests"
    );

    state.requests = list(data);

    Contact.renderMine(state.requests);

    return state.requests;
  };

  Contact.renderMine = function (records) {
    const container = document.querySelector(
      "[data-my-contact-requests]"
    );

    if (!container) return;

    container.replaceChildren();

    if (!records.length) {
      container.appendChild(
        element(
          "p",
          "contact-empty",
          "You have not submitted any enquiries yet."
        )
      );

      return;
    }

    records.forEach(function (request) {
      const card = element(
        "article",
        "contact-request-card"
      );

      card.append(
        element(
          "h3",
          "contact-request-title",
          request.subject
        ),
        element(
          "span",
          "contact-request-category",
          request.category
        ),
        element(
          "span",
          "contact-request-status",
          request.status
        ),
        element(
          "small",
          "contact-request-date",
          formatDate(request.created_at)
        )
      );

      const button = element(
        "button",
        "contact-request-details-button",
        "View request"
      );

      button.type = "button";

      button.addEventListener("click", function () {
        Contact.getDetails(request.id)
          .catch(function (error) {
            notify(error.message, "error");
          });
      });

      card.appendChild(button);
      container.appendChild(card);
    });
  };

  /* ---------------------------------------------------------
     REQUEST DETAILS
  --------------------------------------------------------- */

  Contact.getDetails = async function (requestId) {
    const id = clean(requestId, 100);

    if (!id) {
      throw new Error("Request ID is required.");
    }

    const data = await Contact.rpc(
      "get_contact_request_details",
      {
        p_request_id: id
      }
    );

    state.selectedRequest = Array.isArray(data)
      ? data[0] || null
      : data;

    Contact.renderDetails(state.selectedRequest);

    return state.selectedRequest;
  };

  Contact.renderDetails = function (request) {
    const container = document.querySelector(
      "[data-contact-request-details]"
    );

    if (!container) return;

    container.replaceChildren();

    if (!request) {
      container.appendChild(
        element(
          "p",
          "contact-empty",
          "Contact request not found."
        )
      );

      return;
    }

    container.append(
      element(
        "h2",
        "contact-detail-title",
        request.subject
      ),
      element(
        "p",
        "contact-detail-category",
        "Category: " + request.category
      ),
      element(
        "p",
        "contact-detail-message",
        request.message
      ),
      element(
        "p",
        "contact-detail-status",
        "Status: " + request.status
      ),
      element(
        "small",
        "contact-detail-date",
        formatDate(request.created_at)
      )
    );

    const responses = list(request.responses);

    if (responses.length) {
      container.appendChild(
        element(
          "h3",
          "contact-responses-heading",
          "Responses"
        )
      );

      responses.forEach(function (response) {
        const card = element(
          "article",
          "contact-response-card"
        );

        card.append(
          element(
            "p",
            "contact-response-message",
            response.message
          ),
          element(
            "small",
            "contact-response-date",
            formatDate(response.created_at)
          )
        );

        container.appendChild(card);
      });
    }
  };

  /* ---------------------------------------------------------
     STAFF REQUEST LIST
  --------------------------------------------------------- */

  Contact.getStaffRequests = async function (options) {
    const settings = options || {};

    if (state.loading || !state.hasMore) {
      return state.staffRequests;
    }

    if (settings.reset) {
      state.page = 0;
      state.hasMore = true;
      state.staffRequests = [];
    }

    state.loading = true;

    try {
      const data = await Contact.rpc(
        "get_staff_contact_requests",
        {
          p_status: settings.status || null,
          p_category: settings.category || null,
          p_search: settings.search || null,
          p_page: state.page,
          p_page_size: CONFIG.pageSize
        }
      );

      const records = list(data);

      state.staffRequests = settings.reset
        ? records
        : state.staffRequests.concat(records);

      state.hasMore =
        records.length === CONFIG.pageSize;

      if (records.length) state.page += 1;

      Contact.renderStaffRequests(
        state.staffRequests
      );

      return state.staffRequests;

    } finally {
      state.loading = false;
    }
  };

  Contact.renderStaffRequests = function (records) {
    const container = document.querySelector(
      "[data-staff-contact-requests]"
    );

    if (!container) return;

    container.replaceChildren();

    if (!records.length) {
      container.appendChild(
        element(
          "p",
          "contact-empty",
          "No enquiries found."
        )
      );

      return;
    }

    records.forEach(function (request) {
      const card = element(
        "article",
        "staff-contact-request-card"
      );

      card.append(
        element(
          "h3",
          "contact-request-title",
          request.subject
        ),
        element(
          "p",
          "contact-request-name",
          request.name
        ),
        element(
          "p",
          "contact-request-email",
          request.email
        ),
        element(
          "span",
          "contact-request-category",
          request.category
        ),
        element(
          "span",
          "contact-request-status",
          request.status
        ),
        element(
          "small",
          "contact-request-date",
          formatDate(request.created_at)
        )
      );

      const button = element(
        "button",
        "contact-request-manage",
        "Manage enquiry"
      );

      button.type = "button";

      button.addEventListener("click", function () {
        Contact.getDetails(request.id)
          .catch(function (error) {
            notify(error.message, "error");
          });
      });

      card.appendChild(button);
      container.appendChild(card);
    });
  };

  /* ---------------------------------------------------------
     UPDATE REQUEST STATUS
  --------------------------------------------------------- */

  Contact.updateStatus = async function (
    requestId,
    status
  ) {
    const id = clean(requestId, 100);

    const newStatus = clean(
      status,
      40
    ).toLowerCase();

    if (!id) {
      throw new Error("Request ID is required.");
    }

    if (!validStatus(newStatus)) {
      throw new Error("Invalid request status.");
    }

    await Contact.rpc(
      "update_contact_request_status",
      {
        p_request_id: id,
        p_status: newStatus
      }
    );

    notify("Enquiry status updated.", "success");

    return Contact.getStaffRequests({
      reset: true
    });
  };

  /* ---------------------------------------------------------
     STAFF RESPONSE
  --------------------------------------------------------- */

  Contact.respond = async function (
    requestId,
    message
  ) {
    const id = clean(requestId, 100);
    const response = clean(message, 3000);

    if (!id) {
      throw new Error("Request ID is required.");
    }

    if (response.length < 2) {
      throw new Error("Enter a response.");
    }

    const result = await Contact.rpc(
      "respond_to_contact_request",
      {
        p_request_id: id,
        p_message: response
      }
    );

    notify("Response submitted successfully.", "success");

    await Contact.getDetails(id);

    return result;
  };

  /* ---------------------------------------------------------
     STATISTICS
  --------------------------------------------------------- */

  Contact.getStatistics = async function () {
    const data = await Contact.rpc(
      "get_contact_request_statistics"
    );

    const stats = Array.isArray(data)
      ? data[0] || {}
      : data || {};

    Contact.renderStatistics(stats);

    return stats;
  };

  Contact.renderStatistics = function (stats) {
    const container = document.querySelector(
      "[data-contact-statistics]"
    );

    if (!container) return;

    container.replaceChildren();

    const metrics = [
      ["Total enquiries", stats.total],
      ["Open", stats.open],
      ["Under review", stats.under_review],
      ["In progress", stats.in_progress],
      ["Resolved", stats.resolved],
      ["Closed", stats.closed]
    ];

    metrics.forEach(function (metric) {
      const card = element(
        "div",
        "contact-stat"
      );

      card.append(
        element(
          "span",
          "contact-stat-label",
          metric[0]
        ),
        element(
          "strong",
          "contact-stat-value",
          String(Number(metric[1]) || 0)
        )
      );

      container.appendChild(card);
    });
  };

  /* ---------------------------------------------------------
     PUBLIC CONTACT FORM
  --------------------------------------------------------- */

  Contact.bindForm = function () {
    const form = document.querySelector(
      "[data-contact-form]"
    );

    if (!form || form.dataset.bound) return;

    form.dataset.bound = "true";

    form.addEventListener("submit", async function (event) {
      event.preventDefault();

      const formData = new FormData(form);

      const payload = {
        name: formData.get("name"),
        email: formData.get("email"),
        subject: formData.get("subject"),
        message: formData.get("message"),
        category: formData.get("category"),
        consent: formData.get("consent") === "on"
      };

      const button = form.querySelector(
        '[type="submit"]'
      );

      if (button) button.disabled = true;

      try {
        await Contact.submit(payload);
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

  Contact.bindResponseForm = function () {
    const form = document.querySelector(
      "[data-contact-response-form]"
    );

    if (!form || form.dataset.bound) return;

    form.dataset.bound = "true";

    form.addEventListener("submit", async function (event) {
      event.preventDefault();

      const formData = new FormData(form);

      const requestId = formData.get("request_id");
      const message = formData.get("message");

      const button = form.querySelector(
        '[type="submit"]'
      );

      if (button) button.disabled = true;

      try {
        await Contact.respond(requestId, message);
        form.reset();
      } catch (error) {
        notify(error.message, "error");
      } finally {
        if (button) button.disabled = false;
      }
    });
  };

  /* ---------------------------------------------------------
     STAFF STATUS FORM
  --------------------------------------------------------- */

  Contact.bindStatusForm = function () {
    const form = document.querySelector(
      "[data-contact-status-form]"
    );

    if (!form || form.dataset.bound) return;

    form.dataset.bound = "true";

    form.addEventListener("submit", async function (event) {
      event.preventDefault();

      const formData = new FormData(form);

      try {
        await Contact.updateStatus(
          formData.get("request_id"),
          formData.get("status")
        );
      } catch (error) {
        notify(error.message, "error");
      }
    });
  };

  /* ---------------------------------------------------------
     INITIALISATION
  --------------------------------------------------------- */

  Contact.init = async function (options) {
    const settings = options || {};

    if (settings.member) {
      const allowed = await Contact.requireMember();

      if (!allowed) return false;

      await Contact.getMine();
    }

    if (settings.publicForm) {
      Contact.bindForm();
    }

    if (settings.staff) {
      await Contact.getStaffRequests({
        reset: true
      });

      Contact.bindResponseForm();
      Contact.bindStatusForm();

      if (settings.statistics) {
        await Contact.getStatistics();
      }
    }

    return true;
  };

  /* ---------------------------------------------------------
     PUBLIC STATE
  --------------------------------------------------------- */

  Contact.getState = function () {
    return {
      authenticated: state.authenticated,
      memberRequests: state.requests.length,
      staffRequests: state.staffRequests.length,
      selectedRequest: state.selectedRequest,
      hasMore: state.hasMore
    };
  };

  /* ---------------------------------------------------------
     EXPORT
  --------------------------