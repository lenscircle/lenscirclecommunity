
/* =========================================================
   LENS CIRCLE — PARTNERSHIPS MODULE
   File: assets/js/partnerships.js

   FEATURES
   - Display published partnership opportunities.
   - Submit partnership enquiries.
   - Retrieve a user's own enquiries.
   - Retrieve enquiries for authorised staff.
   - View enquiry details.
   - Update enquiry status.
   - Add internal follow-up notes.
   - Create and update partner records.
   - Publish and archive partnership opportunities.
   - Render partnership cards and enquiry records.

   REQUIRED DATABASE RPC CONTRACTS
   get_published_partnership_opportunities()
   submit_partnership_enquiry(
     p_organisation,
     p_contact_name,
     p_email,
     p_website,
     p_category,
     p_message
   )
   get_my_partnership_enquiries()
   get_partnership_enquiries()
   get_partnership_enquiry_details(p_enquiry_id)
   update_partnership_enquiry_status(
     p_enquiry_id,
     p_status
   )
   add_partnership_internal_note(
     p_enquiry_id,
     p_note
   )
   create_partnership(
     p_name,
     p_category,
     p_description,
     p_website,
     p_contact_email
   )
   update_partnership(
     p_partnership_id,
     p_name,
     p_category,
     p_description,
     p_website,
     p_contact_email,
     p_status
   )
   publish_partnership(p_partnership_id)
   archive_partnership(p_partnership_id)

   SECURITY
   - Public users may submit enquiries only.
   - Users may retrieve only their own enquiries.
   - Staff access must be role-authorised.
   - Admin controls partner records and publication.
   - Never trust a browser-supplied staff or creator ID.
   - Database must derive the acting user from auth.uid().
   - Internal notes must never be visible to public users.
   - Validate all inputs again inside PostgreSQL.
   ========================================================= */

(function (window, document) {
  "use strict";

  const LC = window.LensCircle = window.LensCircle || {};
  const Partnerships = {};

  const RPC = Object.freeze({
    OPPORTUNITIES: "get_published_partnership_opportunities",
    SUBMIT_ENQUIRY: "submit_partnership_enquiry",
    MY_ENQUIRIES: "get_my_partnership_enquiries",
    ALL_ENQUIRIES: "get_partnership_enquiries",
    ENQUIRY_DETAILS: "get_partnership_enquiry_details",
    UPDATE_STATUS: "update_partnership_enquiry_status",
    ADD_NOTE: "add_partnership_internal_note",
    CREATE: "create_partnership",
    UPDATE: "update_partnership",
    PUBLISH: "publish_partnership",
    ARCHIVE: "archive_partnership"
  });

  const CATEGORIES = Object.freeze([
    "brand",
    "photography",
    "education",
    "technology",
    "media",
    "events",
    "exhibition",
    "community",
    "other"
  ]);

  const ENQUIRY_STATUSES = Object.freeze([
    "new",
    "reviewing",
    "contacted",
    "negotiation",
    "approved",
    "declined",
    "closed"
  ]);

  const PARTNERSHIP_STATUSES = Object.freeze([
    "draft",
    "published",
    "active",
    "paused",
    "archived"
  ]);

  const state = {
    opportunities: [],
    enquiries: [],
    currentEnquiry: null,
    partnerships: [],
    filters: {
      search: "",
      status: "all",
      category: "all"
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
    const result = await getClient().auth.getUser();

    if (result.error) throw result.error;

    return result.data && result.data.user
      ? result.data.user
      : null;
  }

  async function requireUser() {
    const user = await getCurrentUser();

    if (!user) {
      throw new Error("Please sign in to continue.");
    }

    return user;
  }

  async function callRPC(name, params) {
    const result = await getClient().rpc(name, params || {});

    if (result.error) {
      console.error("[Lens Circle Partnerships]", name, result.error);

      throw new Error(
        result.error.message || "The partnership request failed."
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

  function normaliseCategory(value) {
    const category = cleanText(value, 40).toLowerCase();

    return CATEGORIES.includes(category) ? category : "other";
  }

  function normaliseEnquiryStatus(value) {
    const status = cleanText(value, 40).toLowerCase();

    return ENQUIRY_STATUSES.includes(status) ? status : "new";
  }

  function normalisePartnershipStatus(value) {
    const status = cleanText(value, 40).toLowerCase();

    return PARTNERSHIP_STATUSES.includes(status)
      ? status
      : "draft";
  }

  function safeWebsite(value) {
    const website = cleanText(value, 1000);

    if (!website) return "";

    try {
      const url = new URL(
        website.startsWith("http") ? website : "https://" + website
      );

      if (url.protocol !== "https:" && url.protocol !== "http:") {
        return "";
      }

      return url.href;
    } catch (_) {
      return "";
    }
  }

  function validEmail(value) {
    const email = cleanText(value, 254).toLowerCase();

    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function unwrapRows(data, key) {
    if (Array.isArray(data)) return data;

    if (data && key && Array.isArray(data[key])) {
      return data[key];
    }

    if (data && typeof data === "object") {
      return [data];
    }

    return [];
  }

  function validateUUID(value, label) {
    const id = cleanText(value, 100);

    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
    ) {
      throw new Error("A valid " + label + " ID is required.");
    }

    return id;
  }

  function formatDate(value) {
    if (!value) return "Not available";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "Date unavailable";
    }

    return new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric"
    }).format(date);
  }

  /* ---------------------------------------------------------
     DATA NORMALISATION
  --------------------------------------------------------- */

  function normaliseOpportunity(row) {
    const item = row || {};

    return {
      id: cleanText(item.id || item.opportunity_id, 100),
      title: cleanText(item.title, 180),
      category: normaliseCategory(item.category),
      description: cleanText(item.description, 5000),
      benefits: cleanText(item.benefits, 3000),
      image_url: safeWebsite(item.image_url),
      status: cleanText(item.status, 40),
      created_at: item.created_at || null
    };
  }

  function normaliseEnquiry(row) {
    const item = row || {};

    return {
      id: cleanText(item.id || item.enquiry_id, 100),
      organisation: cleanText(item.organisation, 180),
      contact_name: cleanText(item.contact_name, 120),
      email: cleanText(item.email, 254),
      website: safeWebsite(item.website),
      category: normaliseCategory(item.category),
      message: cleanText(item.message, 5000),
      status: normaliseEnquiryStatus(item.status),
      created_at: item.created_at || null,
      updated_at: item.updated_at || null,
      internal_notes: Array.isArray(item.internal_notes)
        ? item.internal_notes
        : []
    };
  }

  function normalisePartnership(row) {
    const item = row || {};

    return {
      id: cleanText(item.id || item.partnership_id, 100),
      name: cleanText(item.name, 180),
      category: normaliseCategory(item.category),
      description: cleanText(item.description, 5000),
      website: safeWebsite(item.website),
      contact_email: cleanText(item.contact_email, 254),
      status: normalisePartnershipStatus(item.status),
      created_at: item.created_at || null
    };
  }

  /* ---------------------------------------------------------
     PUBLIC OPPORTUNITIES
  --------------------------------------------------------- */

  Partnerships.getOpportunities = async function () {
    const data = await callRPC(RPC.OPPORTUNITIES);

    state.opportunities = unwrapRows(
      data,
      "opportunities"
    ).map(normaliseOpportunity);

    return state.opportunities;
  };

  /* ---------------------------------------------------------
     PUBLIC ENQUIRY SUBMISSION
  --------------------------------------------------------- */

  /**
   * Public enquiry submission.
   *
   * A user account is not required if the database allows
   * anonymous enquiries. For anonymous submissions, the RPC
   * must be explicitly granted to anon and must validate all
   * submitted data.
   *
   * Never accept status, assigned staff ID, creator ID or
   * internal notes from the public form.
   */
  Partnerships.submitEnquiry = async function (input) {
    const values = input || {};

    const organisation = cleanText(values.organisation, 180);
    const contactName = cleanText(values.contactName, 120);
    const email = cleanText(values.email, 254).toLowerCase();
    const website = safeWebsite(values.website);
    const category = normaliseCategory(values.category);
    const message = cleanText(values.message, 5000);

    if (organisation.length < 2) {
      throw new Error("Enter your organisation or brand name.");
    }

    if (contactName.length < 2) {
      throw new Error("Enter your contact name.");
    }

    if (!validEmail(email)) {
      throw new Error("Enter a valid email address.");
    }

    if (message.length < 20) {
      throw new Error(
        "Please provide a little more detail about your proposal."
      );
    }

    return callRPC(RPC.SUBMIT_ENQUIRY, {
      p_organisation: organisation,
      p_contact_name: contactName,
      p_email: email,
      p_website: website || null,
      p_category: category,
      p_message: message
    });
  };

  /* ---------------------------------------------------------
     ENQUIRY RETRIEVAL
  --------------------------------------------------------- */

  Partnerships.getMyEnquiries = async function () {
    await requireUser();

    const data = await callRPC(RPC.MY_ENQUIRIES);

    state.enquiries = unwrapRows(data, "enquiries")
      .map(normaliseEnquiry);

    return state.enquiries;
  };

  /**
   * Staff enquiry retrieval.
   * The database must check the current user's exact role.
   * The frontend does not grant staff permissions.
   */
  Partnerships.getAllEnquiries = async function () {
    await requireUser();

    const data = await callRPC(RPC.ALL_ENQUIRIES);

    state.enquiries = unwrapRows(data, "enquiries")
      .map(normaliseEnquiry);

    return state.enquiries;
  };

  Partnerships.getEnquiryDetails = async function (enquiryId) {
    await requireUser();

    const id = validateUUID(enquiryId, "enquiry");

    const data = await callRPC(RPC.ENQUIRY_DETAILS, {
      p_enquiry_id: id
    });

    const row = Array.isArray(data) ? data[0] : data;

    if (!row) throw new Error("Enquiry not found.");

    state.currentEnquiry = normaliseEnquiry(row);

    return state.currentEnquiry;
  };

  /* ---------------------------------------------------------
     STAFF: ENQUIRY MANAGEMENT
  --------------------------------------------------------- */

  Partnerships.updateEnquiryStatus = async function (
    enquiryId,
    status
  ) {
    await requireUser();

    const id = validateUUID(enquiryId, "enquiry");
    const nextStatus = cleanText(status, 40).toLowerCase();

    if (!ENQUIRY_STATUSES.includes(nextStatus)) {
      throw new Error("Select a valid enquiry status.");
    }

    return callRPC(RPC.UPDATE_STATUS, {
      p_enquiry_id: id,
      p_status: nextStatus
    });
  };

  /**
   * Internal notes are available only to authorised staff.
   * The RPC must never expose notes to public/member queries.
   */
  Partnerships.addInternalNote = async function (
    enquiryId,
    note
  ) {
    await requireUser();

    const id = validateUUID(enquiryId, "enquiry");
    const text = cleanText(note, 3000);

    if (text.length < 2) {
      throw new Error("Enter an internal note.");
    }

    return callRPC(RPC.ADD_NOTE, {
      p_enquiry_id: id,
      p_note: text
    });
  };

  /* ---------------------------------------------------------
     ADMIN: PARTNERSHIP RECORDS
  --------------------------------------------------------- */

  Partnerships.create = async function (input) {
    await requireUser();

    const values = input || {};

    const name = cleanText(values.name, 180);
    const category = normaliseCategory(values.category);
    const description = cleanText(values.description, 5000);
    const website = safeWebsite(values.website);
    const contactEmail = cleanText(
      values.contactEmail,
      254
    ).toLowerCase();

    if (name.length < 2) {
      throw new Error("Enter a partner organisation name.");
    }

    if (contactEmail && !validEmail(contactEmail)) {
      throw new Error("Enter a valid contact email.");
    }

    return callRPC(RPC.CREATE, {
      p_name: name,
      p_category: category,
      p_description: description,
      p_website: website || null,
      p_contact_email: contactEmail || null
    });
  };

  Partnerships.update = async function (
    partnershipId,
    input
  ) {
    await requireUser();

    const id = validateUUID(partnershipId, "partnership");
    const values = input || {};

    const name = cleanText(values.name, 180);
    const category = normaliseCategory(values.category);
    const description = cleanText(values.description, 5000);
    const website = safeWebsite(values.website);
    const contactEmail = cleanText(
      values.contactEmail,
      254
    ).toLowerCase();
    const status = cleanText(values.status, 40).toLowerCase();

    if (name.length < 2) {
      throw new Error("Enter a partner organisation name.");
    }

    if (contactEmail && !validEmail(contactEmail)) {
      throw new Error("Enter a valid contact email.");
    }

    if (
      status &&
      !PARTNERSHIP_STATUSES.includes(status)
    ) {
      throw new Error("Select a valid partnership status.");
    }

    return callRPC(RPC.UPDATE, {
      p_partnership_id: id,
      p_name: name,
      p_category: category,
      p_description: description,
      p_website: website || null,
      p_contact_email: contactEmail || null,
      p_status: status || null
    });
  };

  Partnerships.publish = async function (partnershipId) {
    await requireUser();

    const id = validateUUID(partnershipId, "partnership");

    return callRPC(RPC.PUBLISH, {
      p_partnership_id: id
    });
  };

  Partnerships.archive = async function (partnershipId) {
    await requireUser();

    const id = validateUUID(partnershipId, "partnership");

    return callRPC(RPC.ARCHIVE, {
      p_partnership_id: id
    });
  };

  /* ---------------------------------------------------------
     FILTERING
  --------------------------------------------------------- */

  Partnerships.setFilters = function (filters) {
    const values = filters || {};

    if (values.search !== undefined) {
      state.filters.search = cleanText(values.search, 120)
        .toLowerCase();
    }

    if (values.status !== undefined) {
      const status = cleanText(values.status, 40).toLowerCase();

      state.filters.status =
        status === "all" || ENQUIRY_STATUSES.includes(status)
          ? status
          : "all";
    }

    if (values.category !== undefined) {
      const category = cleanText(values.category, 40).toLowerCase();

      state.filters.category =
        category === "all" || CATEGORIES.includes(category)
          ? category
          : "all";
    }

    return Partnerships.getFilteredEnquiries();
  };

  Partnerships.getFilteredEnquiries = function () {
    return state.enquiries.filter(function (item) {
      const filters = state.filters;

      if (
        filters.status !== "all" &&
        item.status !== filters.status
      ) {
        return false;
      }

      if (
        filters.category !== "all" &&
        item.category !== filters.category
      ) {
        return false;
      }

      if (filters.search) {
        const searchable = [
          item.organisation,
          item.contact_name,
          item.email,
          item.message,
          item.category
        ].join(" ").toLowerCase();

        if (!searchable.includes(filters.search)) return false;
      }

      return true;
    });
  };

  /* ---------------------------------------------------------
     RENDERING
  --------------------------------------------------------- */

  function categoryLabel(value) {
    const labels = {
      brand: "Brand partnership",
      photography: "Photography",
      education: "Education",
      technology: "Technology",
      media: "Media",
      events: "Events",
      exhibition: "Exhibition",
      community: "Community",
      other: "Other"
    };

    return labels[normaliseCategory(value)];
  }

  function statusLabel(value) {
    const labels = {
      new: "New",
      reviewing: "Under review",
      contacted: "Contacted",
      negotiation: "In discussion",
      approved: "Approved",
      declined: "Declined",
      closed: "Closed"
    };

    return labels[normaliseEnquiryStatus(value)];
  }

  Partnerships.renderOpportunityCard = function (opportunity) {
    const item = normaliseOpportunity(opportunity);

    return `
      <article class="partnership-opportunity-card"
        data-opportunity-id="${escapeHTML(item.id)}">

        <span class="partnership-category">
          ${escapeHTML(categoryLabel(item.category))}
        </span>

        <h3>${escapeHTML(item.title)}</h3>

        <p>${escapeHTML(item.description)}</p>

        ${
          item.benefits
            ? `<div class="partnership-benefits">
                ${escapeHTML(item.benefits)}
              </div>`
            : ""
        }

        <a href="contact.html?subject=partnership"
           class="btn btn-secondary">
          Discuss an opportunity
        </a>
      </article>
    `;
  };

  Partnerships.renderOpportunities = function (container) {
    const target =
      typeof container === "string"
        ? document.querySelector(container)
        : container;

    if (!target) {
      throw new Error("Opportunity container was not found.");
    }

    if (!state.opportunities.length) {
      target.innerHTML = `
        <div class="partnership-empty-state">
          <h3>Partnership opportunities are being developed</h3>
          <p>Contact Lens Circle to discuss a collaboration.</p>
        </div>
      `;
      return;
    }

    target.innerHTML = state.opportunities
      .map(Partnerships.renderOpportunityCard)
      .join("");
  };

  Partnerships.renderEnquiryCard = function (enquiry) {
    const item = normaliseEnquiry(enquiry);

    return `
      <article class="partnership-enquiry-card"
        data-enquiry-id="${escapeHTML(item.id)}">

        <div class="partnership-enquiry-heading">
          <div>
            <h3>${escapeHTML(item.organisation)}</h3>
            <p>${escapeHTML(item.contact_name)}</p>
          </div>

          <span class="partnership-enquiry-status status-${escapeHTML(item.status)}">
            ${escapeHTML(statusLabel(item.status))}
          </span>
        </div>

        <div class="partnership-enquiry-meta">
          <span>${escapeHTML(item.email)}</span>
          <span>${escapeHTML(categoryL