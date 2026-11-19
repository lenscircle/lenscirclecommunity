
/* =========================================================
   LENS CIRCLE — PARTNERSHIPS MODULE
   File: assets/js/partners.js

   FEATURES
   - Partnership applications
   - Brand sponsorship enquiries
   - Organisation collaborations
   - Workshop partnerships
   - Exhibition partnerships
   - Creator collaborations
   - Application tracking
   - Staff application management
   - Partnership status updates
   - Internal staff notes

   EXPECTED SUPABASE RPC CONTRACTS
   - submit_lens_circle_partnership
   - get_my_partnership_applications
   - get_partnership_application_details
   - get_staff_partnership_applications
   - update_partnership_application_status
   - add_partnership_internal_note
   - get_partnership_statistics
   - get_public_partnerships

   SECURITY
   - Applicants can access only their own applications.
   - Internal notes must never be publicly accessible.
   - Staff permissions must be verified server-side.
   - Partnership approval and rejection must be audited.
   ========================================================= */

(function (window, document) {
  "use strict";

  const LC = window.LensCircle =
    window.LensCircle || {};

  const Partners = {};

  const CONFIG = {
    maxOrganisationLength: 180,
    maxNameLength: 120,
    maxEmailLength: 254,
    maxSubjectLength: 180,
    maxMessageLength: 5000,
    pageSize: 20,

    types: [
      "brand_sponsorship",
      "organisation",
      "workshop",
      "exhibition",
      "creator_collaboration",
      "media",
      "community",
      "other"
    ],

    statuses: [
      "submitted",
      "under_review",
      "shortlisted",
      "approved",
      "rejected",
      "on_hold",
      "completed"
    ]
  };

  const state = {
    applications: [],
    staffApplications: [],
    publicPartners: [],
    selectedApplication: null,
    statistics: null,
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
      console.info("[Lens Circle Partners]", message);
    }
  }

  function validEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      clean(email, CONFIG.maxEmailLength)
    );
  }

  function validType(type) {
    return CONFIG.types.includes(
      clean(type, 50).toLowerCase()
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

  Partners.rpc = async function (name, params) {
    const { data, error } = await db().rpc(
      name,
      params || {}
    );

    if (error) {
      console.error("[Partners RPC]", name, error);
      throw error;
    }

    return data;
  };

  /* ---------------------------------------------------------
     AUTHENTICATION
  --------------------------------------------------------- */

  Partners.requireMember = async function () {
    const { data, error } = await db()
      .auth.getSession();

    if (error) throw error;

    if (!data.session) {
      window.location.assign(
        "/member/login.html"
      );

      return false;
    }

    return true;
  };

  /* ---------------------------------------------------------
     SUBMIT PARTNERSHIP APPLICATION
  --------------------------------------------------------- */

  Partners.submit = async function (payload) {
    const allowed = await Partners.requireMember();

    if (!allowed) return false;

    const organisation = clean(
      payload.organisation,
      CONFIG.maxOrganisationLength
    );

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

    const type = clean(
      payload.type,
      50
    ).toLowerCase();

    if (organisation.length < 2) {
      throw new Error(
        "Enter your organisation or brand name."
      );
    }

    if (name.length < 2) {
      throw new Error("Enter your name.");
    }

    if (!validEmail(email)) {
      throw new Error("Enter a valid email address.");
    }

    if (!validType(type)) {
      throw new Error("Select a valid partnership type.");
    }

    if (subject.length < 3) {
      throw new Error("Enter an application subject.");
    }

    if (message.length < 20) {
      throw new Error(
        "Please describe your proposal in at least 20 characters."
      );
    }

    if (payload.consent !== true) {
      throw new Error(
        "Please agree to the privacy notice."
      );
    }

    const result = await Partners.rpc(
      "submit_lens_circle_partnership",
      {
        p_organisation: organisation,
        p_name: name,
        p_email: email,
        p_type: type,
        p_subject: subject,
        p_message: message,
        p_website: clean(payload.website, 300) || null,
        p_consent: true
      }
    );

    notify(
      "Your partnership application has been submitted.",
      "success"
    );

    await Partners.getMine();

    return result;
  };

  /* ---------------------------------------------------------
     MEMBER APPLICATION HISTORY
  --------------------------------------------------------- */

  Partners.getMine = async function () {
    const allowed = await Partners.requireMember();

    if (!allowed) return [];

    const data = await Partners.rpc(
      "get_my_partnership_applications"
    );

    state.applications = list(data);

    Partners.renderMine(state.applications);

    return state.applications;
  };

  Partners.renderMine = function (records) {
    const container = document.querySelector(
      "[data-my-partnerships]"
    );

    if (!container) return;

    container.replaceChildren();

    if (!records.length) {
      container.appendChild(
        element(
          "p",
          "partnership-empty",
          "You have not submitted any partnership applications."
        )
      );

      return;
    }

    records.forEach(function (application) {
      const card = element(
        "article",
        "partnership-card"
      );

      card.append(
        element(
          "h3",
          "partnership-title",
          application.subject
        ),
        element(
          "p",
          "partnership-organisation",
          application.organisation
        ),
        element(
          "span",
          "partnership-type",
          application.type
        ),
        element(
          "span",
          "partnership-status",
          application.status
        ),
        element(
          "small",
          "partnership-date",
          formatDate(application.created_at)
        )
      );

      const button = element(
        "button",
        "partnership-details-button",
        "View application"
      );

      button.type = "button";

      button.addEventListener("click", function () {
        Partners.getDetails(application.id)
          .catch(function (error) {
            notify(error.message, "error");
          });
      });

      card.appendChild(button);
      container.appendChild(card);
    });
  };

  /* ---------------------------------------------------------
     APPLICATION DETAILS
  --------------------------------------------------------- */

  Partners.getDetails = async function (applicationId) {
    const id = clean(applicationId, 100);

    if (!id) {
      throw new Error("Application ID is required.");
    }

    const data = await Partners.rpc(
      "get_partnership_application_details",
      {
        p_application_id: id
      }
    );

    state.selectedApplication = Array.isArray(data)
      ? data[0] || null
      : data;

    Partners.renderDetails(state.selectedApplication);

    return state.selectedApplication;
  };

  Partners.renderDetails = function (application) {
    const container = document.querySelector(
      "[data-partnership-details]"
    );

    if (!container) return;

    container.replaceChildren();

    if (!application) {
      container.appendChild(
        element(
          "p",
          "partnership-empty",
          "Application not found."
        )
      );

      return;
    }

    container.append(
      element(
        "h2",
        "partnership-detail-title",
        application.subject
      ),
      element(
        "p",
        "partnership-detail-organisation",
        application.organisation
      ),
      element(
        "p",
        "partnership-detail-type",
        application.type
      ),
      element(
        "p",
        "partnership-detail-message",
        application.message
      ),
      element(
        "p",
        "partnership-detail-status",
        "Status: " + application.status
      ),
      element(
        "small",
        "partnership-detail-date",
        formatDate(application.created_at)
      )
    );

    if (application.public_website) {
      try {
        const url = new URL(application.public_website);

        if (url.protocol === "https:") {
          const link = element(
            "a",
            "partnership-website",
            "Organisation website"
          );

          link.href = url.href;
          link.target = "_blank";
          link.rel = "noopener noreferrer";

          container.appendChild(link);
        }
      } catch (_) {
        // Ignore invalid website URLs.
      }
    }
  };

  /* ---------------------------------------------------------
     STAFF APPLICATION LIST
  --------------------------------------------------------- */

  Partners.getStaffApplications = async function (options) {
    const settings = options || {};

    if (state.loading || !state.hasMore) {
      return state.staffApplications;
    }

    if (settings.reset) {
      state.page = 0;
      state.hasMore = true;
      state.staffApplications = [];
    }

    state.loading = true;

    try {
      const data = await Partners.rpc(
        "get_staff_partnership_applications",
        {
          p_status: settings.status || null,
          p_type: settings.type || null,
          p_search: settings.search || null,
          p_page: state.page,
          p_page_size: CONFIG.pageSize
        }
      );

      const records = list(data);

      state.staffApplications = settings.reset
        ? records
        : state.staffApplications.concat(records);

      state.hasMore =
        records.length === CONFIG.pageSize;

      if (records.length) state.page += 1;

      Partners.renderStaffApplications(
        state.staffApplications
      );

      return state.staffApplications;

    } finally {
      state.loading = false;
    }
  };

  Partners.renderStaffApplications = function (records) {
    const container = document.querySelector(
      "[data-staff-partnerships]"
    );

    if (!container) return;

    container.replaceChildren();

    if (!records.length) {
      container.appendChild(
        element(
          "p",
          "partnership-empty",
          "No partnership applications found."
        )
      );

      return;
    }

    records.forEach(function (application) {
      const card = element(
        "article",
        "staff-partnership-card"
      );

      card.append(
        element(
          "h3",
          "partnership-title",
          application.subject
        ),
        element(
          "p",
          "partnership-organisation",
          application.organisation
        ),
        element(
          "p",
          "partnership-contact",
          application.name
        ),
        element(
          "p",
          "partnership-email",
          application.email
        ),
        element(
          "span",
          "partnership-type",
          application.type
        ),
        element(
          "span",
          "partnership-status",
          application.status
        ),
        element(
          "small",
          "partnership-date",
          formatDate(application.created_at)
        )
      );

      const button = element(
        "button",
        "partnership-manage-button",
        "Manage application"
      );

      button.type = "button";

      button.addEventListener("click", function () {
        Partners.getDetails(application.id)
          .catch(function (error) {
            notify(error.message, "error");
          });
      });

      card.appendChild(button);
      container.appendChild(card);
    });
  };

  /* ---------------------------------------------------------
     UPDATE APPLICATION STATUS
  --------------------------------------------------------- */

  Partners.updateStatus = async function (
    applicationId,
    status
  ) {
    const id = clean(applicationId, 100);

    const newStatus = clean(
      status,
      40
    ).toLowerCase();

    if (!id) {
      throw new Error("Application ID is required.");
    }

    if (!validStatus(newStatus)) {
      throw new Error("Invalid application status.");
    }

    await Partners.rpc(
      "update_partnership_application_status",
      {
        p_application_id: id,
        p_status: newStatus
      }
    );

    notify("Application status updated.", "success");

    return Partners.getStaffApplications({
      reset: true
    });
  };

  /* ---------------------------------------------------------
     INTERNAL STAFF NOTES
  --------------------------------------------------------- */

  Partners.addInternalNote = async function (
    applicationId,
    note
  ) {
    const id = clean(applicationId, 100);
    const message = clean(note, 2000);

    if (!id) {
      throw new Error("Application ID is required.");
    }

    if (message.length < 2) {
      throw new Error("Enter an internal note.");
    }

    const result = await Partners.rpc(
      "add_partnership_internal_note",
      {
        p_application_id: id,
        p_note: message
      }
    );

    notify("Internal note added.", "success");

    return result;
  };

  /* ---------------------------------------------------------
     PUBLIC PARTNERS
  --------------------------------------------------------- */

  Partners.getPublicPartners = async function () {
    const data = await Partners.rpc(
      "get_public_partnerships"
    );

    state.publicPartners = list(data);

    Partners.renderPublicPartners(
      state.publicPartners
    );

    return state.publicPartners;
  };

  Partners.renderPublicPartners = function (records) {
    const container = document.querySelector(
      "[data-public-partners]"
    );

    if (!container) return;

    container.replaceChildren();

    if (!records.length) {
      container.appendChild(
        element(
          "p",
          "partnership-empty",
          "Our partner network will be introduced here."
        )
      );

      return;
    }

    records.forEach(function (partner) {
      const card = element(
        "article",
        "public-partner-card"
      );

      card.append(
        element(
          "h3",
          "public-partner-name",
          partner.name
        ),
        element(
          "p",
          "public-partner-description",
          partner.description
        )
      );

      if (partner.website) {
        try {
          const url = new URL(partner.website);

          if (url.protocol === "https:") {
            const link = element(
              "a",
              "public-partner-link",
              "Visit website"
            );

            link.href = url.href;
            link.target = "_blank";
            link.rel = "noopener noreferrer";

            card.appendChild(link);
          }
        } catch (_) {
          // Ignore invalid website URLs.
        }
      }

      container.appendChild(card);
    });
  };

  /* ---------------------------------------------------------
     STATISTICS
  --------------------------------------------------------- */

  Partners.getStatistics = async function () {
    const data = await Partners.rpc(
      "get_partnership_statistics"
    );

    state.statistics = Array.isArray(data)
      ? data[0] || {}
      : data || {};

    Partners.renderStatistics(state.statistics);

    return state.statistics;
  };

  Partners.renderStatistics = function (stats) {
    const container = document.querySelector(
      "[data-partnership-statistics]"
    );

    if (!container) return;

    container.replaceChildren();

    const metrics = [
      ["Total applications", stats.total],
      ["Under review", stats.under_review],
      ["Shortlisted", stats.shortlisted],
      ["Approved", stats.approved],
      ["Rejected", stats.rejected],
      ["Completed", stats.completed]
    ];

    metrics.forEach(function (metric) {
      const card = element(
        "div",
        "partnership-stat"
      );

      card.append(
        element(
          "span",
          "partnership-stat-label",
          metric[0]
        ),
        element(
          "strong",
          "partnership-stat-value",
          String(Number(metric[1]) || 0)
        )
      );

      container.appendChild(card);
    });
  };

  /* ---------------------------------------------------------
     APPLICATION FORM
  --------------------------------------------------------- */

  Partners.bindForm = function () {
    const form = document.querySelector(
      "[data-partnership-form]"
    );

    if (!form || form.dataset.bound) return;

    form.dataset.bound = "true";

    form.addEventListener("submit", async function (event) {
      event.preventDefault();

      const formData = new FormData(form);

      const payload = {
        organisation: formData.get("organisation"),
        name: formData.get("name"),
        email: formData.get("email"),
        type: formData.get("type"),
        subject: formData.get("subject"),
        message: formData.get("message"),
        website: formData.get("website"),
        consent: formData.get("consent") === "on"
      };

      const button = form.querySelector(
        '[type="submit"]'
      );

      if (button) button.disabled = true;

      try {
        await Partners.submit(payload);
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

  Partners.bindStatusForm = function () {
    const form = document.querySelector(
      "[data-partnership-status-form]"
    );

    if (!form || form.dataset.bound) return;

    form.dataset.bound = "true";

