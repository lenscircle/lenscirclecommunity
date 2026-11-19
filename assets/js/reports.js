
/**
 * LENS CIRCLE — COMMUNITY REPORTS MODULE
 * File: assets/js/reports.js
 *
 * Features:
 * - Submit community reports
 * - Report photographs, comments, profiles and activities
 * - Retrieve reports assigned to authorised staff
 * - Retrieve report details
 * - Update report status
 * - Add moderation notes
 * - Escalate reports
 *
 * REQUIRED SUPABASE RPC FUNCTIONS:
 *
 * submit_community_report(
 *   p_target_type,
 *   p_target_id,
 *   p_reason,
 *   p_description
 * )
 *
 * get_my_community_reports()
 *
 * get_assigned_community_reports(
 *   p_status,
 *   p_limit,
 *   p_offset
 * )
 *
 * get_community_report_details(p_report_id)
 *
 * update_community_report(
 *   p_report_id,
 *   p_status,
 *   p_resolution
 * )
 *
 * add_community_report_note(
 *   p_report_id,
 *   p_note
 * )
 *
 * escalate_community_report(
 *   p_report_id,
 *   p_reason
 * )
 *
 * SECURITY:
 * - Report submitter identity must come from auth.uid().
 * - Staff access must be checked inside database functions.
 * - Directors must only access reports in their assigned departments.
 * - Moderators must only access reports within their permitted scope.
 * - Report notes and evidence must have strict access controls.
 * - Never expose a reporter's identity unnecessarily.
 */

(function () {
  "use strict";

  const CONFIG = {
    rpc: {
      submit: "submit_community_report",
      mine: "get_my_community_reports",
      assigned: "get_assigned_community_reports",
      details: "get_community_report_details",
      update: "update_community_report",
      addNote: "add_community_report_note",
      escalate: "escalate_community_report"
    },

    targetTypes: {
      photograph: "Photograph",
      profile: "Member Profile",
      comment: "Comment",
      activity: "Community Activity",
      competition: "Competition",
      story: "Editorial Story",
      other: "Other"
    },

    reasons: {
      harassment: "Harassment or Bullying",
      inappropriate: "Inappropriate Content",
      spam: "Spam or Misleading Content",
      impersonation: "Impersonation",
      copyright: "Copyright or Image Rights",
      privacy: "Privacy Violation",
      fraud: "Fraud or Scam",
      other: "Other Concern"
    },

    statuses: {
      submitted: "Submitted",
      under_review: "Under Review",
      awaiting_information: "Awaiting Information",
      escalated: "Escalated",
      resolved: "Resolved",
      dismissed: "Dismissed"
    },

    maximumDescriptionLength: 3000,
    maximumNoteLength: 2000
  };

  const state = {
    reports: [],
    currentReport: null,
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

  function normaliseReport(record) {
    if (!record || typeof record !== "object") {
      return null;
    }

    return {
      id: record.id || record.report_id || "",
      targetType: record.target_type || "other",
      targetId: record.target_id || "",
      reason: record.reason || "other",
      description: record.description || "",
      status: record.status || "submitted",
      resolution: record.resolution || "",
      createdAt: record.created_at || null,
      updatedAt: record.updated_at || null,
      department: record.department || "",
      assignedTo: record.assigned_to || null
    };
  }

  function formatDate(value) {
    if (!value) return "Not available";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "Not available";
    }

    return new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit"
    }).format(date);
  }

  function validateReport(payload) {
    if (!payload || typeof payload !== "object") {
      throw new Error("Report information is required.");
    }

    if (!Object.hasOwn(CONFIG.targetTypes, payload.targetType)) {
      throw new Error("Invalid report target.");
    }

    if (!Object.hasOwn(CONFIG.reasons, payload.reason)) {
      throw new Error("Please choose a valid report reason.");
    }

    const description = String(
      payload.description || ""
    ).trim();

    if (description.length < 10) {
      throw new Error(
        "Please provide at least 10 characters describing the concern."
      );
    }

    if (
      description.length >
      CONFIG.maximumDescriptionLength
    ) {
      throw new Error(
        "Your report description is too long."
      );
    }

    if (
      !payload.targetId ||
      typeof payload.targetId !== "string"
    ) {
      throw new Error("A valid target ID is required.");
    }

    return {
      targetType: payload.targetType,
      targetId: payload.targetId,
      reason: payload.reason,
      description
    };
  }

  async function submit(payload) {
    const report = validateReport(payload);

    const { data, error } = await client().rpc(
      CONFIG.rpc.submit,
      {
        p_target_type: report.targetType,
        p_target_id: report.targetId,
        p_reason: report.reason,
        p_description: report.description
      }
    );

    if (error) throw error;

    return {
      success: true,
      data
    };
  }

  async function getMine() {
    state.loading = true;

    try {
      const { data, error } = await client().rpc(
        CONFIG.rpc.mine
      );

      if (error) throw error;

      state.reports = Array.isArray(data)
        ? data.map(normaliseReport).filter(Boolean)
        : [];

      return {
        success: true,
        data: state.reports
      };

    } finally {
      state.loading = false;
    }
  }

  async function getAssigned(options = {}) {
    state.loading = true;

    try {
      const { data, error } = await client().rpc(
        CONFIG.rpc.assigned,
        {
          p_status: options.status || null,
          p_limit: Math.min(
            Math.max(Number(options.limit) || 30, 1),
            100
          ),
          p_offset: Math.max(
            Number(options.offset) || 0,
            0
          )
        }
      );

      if (error) throw error;

      state.reports = Array.isArray(data)
        ? data.map(normaliseReport).filter(Boolean)
        : [];

      return {
        success: true,
        data: state.reports
      };

    } finally {
      state.loading = false;
    }
  }

  async function getDetails(reportId) {
    if (!reportId) {
      throw new Error("Report ID is required.");
    }

    const { data, error } = await client().rpc(
      CONFIG.rpc.details,
      {
        p_report_id: reportId
      }
    );

    if (error) throw error;

    const record = Array.isArray(data)
      ? data[0]
      : data;

    if (!record) {
      throw new Error("Report not found.");
    }

    state.currentReport = normaliseReport(record);

    return {
      success: true,
      data: state.currentReport
    };
  }

  async function updateStatus(reportId, status, resolution = "") {
    if (!reportId) {
      throw new Error("Report ID is required.");
    }

    if (!Object.hasOwn(CONFIG.statuses, status)) {
      throw new Error("Invalid report status.");
    }

    const { data, error } = await client().rpc(
      CONFIG.rpc.update,
      {
        p_report_id: reportId,
        p_status: status,
        p_resolution: String(resolution || "").trim()
      }
    );

    if (error) throw error;

    return {
      success: true,
      data
    };
  }

  async function addNote(reportId, note) {
    const value = String(note || "").trim();

    if (!reportId || !value) {
      throw new Error("Report ID and note are required.");
    }

    if (value.length > CONFIG.maximumNoteLength) {
      throw new Error("Moderation note is too long.");
    }

    const { data, error } = await client().rpc(
      CONFIG.rpc.addNote,
      {
        p_report_id: reportId,
        p_note: value
      }
    );

    if (error) throw error;

    return {
      success: true,
      data
    };
  }

  async function escalate(reportId, reason) {
    const value = String(reason || "").trim();

    if (!reportId || value.length < 10) {
      throw new Error(
        "Provide a report ID and a clear escalation reason."
      );
    }

    const { data, error } = await client().rpc(
      CONFIG.rpc.escalate,
      {
        p_report_id: reportId,
        p_reason: value
      }
    );

    if (error) throw error;

    return {
      success: true,
      data
    };
  }

  function renderStatus(status) {
    return `
      <span class="lc-report-status lc-report-status--${escapeHTML(status)}">
        ${escapeHTML(CONFIG.statuses[status] || status)}
      </span>
    `;
  }

  function renderCard(record) {
    const report = normaliseReport(record);

    if (!report) return "";

    return `
      <article class="lc-report-card"
        data-report-id="${escapeHTML(report.id)}">

        <div class="lc-report-card__header">
          <span class="lc-report-reason">
            ${escapeHTML(CONFIG.reasons[report.reason] || report.reason)}
          </span>

          ${renderStatus(report.status)}
        </div>

        <p class="lc-report-target">
          ${escapeHTML(CONFIG.targetTypes[report.targetType] || report.targetType)}
        </p>

        <p class="lc-report-description">
          ${escapeHTML(report.description)}
        </p>

        <div class="lc-report-card__footer">
          <span>${escapeHTML(formatDate(report.createdAt))}</span>

          <button
            type="button"
            data-report-action="view"
            data-id="${escapeHTML(report.id)}">
            View report
          </button>
        </div>

      </article>
    `;
  }

  function renderList(container, reports = state.reports) {
    if (!container) return;

    if (!reports.length) {
      container.innerHTML = `
        <div class="lc-report-empty">
          <h3>No reports found</h3>
          <p>There are no reports to display.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = reports
      .map(renderCard)
      .join("");
  }

  function renderDetails(container, report) {
    if (!container || !report) return;

    container.innerHTML = `
      <article class="lc-report-detail">

        <header>
          <span>
            ${escapeHTML(CONFIG.reasons[report.reason] || report.reason)}
          </span>

          ${renderStatus(report.status)}
        </header>

        <h2>Report details</h2>

        <p>
          <strong>Report ID:</strong>
          ${escapeHTML(report.id)}
        </p>

        <p>
          <strong>Reported content:</strong>
          ${escapeHTML(CONFIG.targetTypes[report.targetType] || report.targetType)}
        </p>

        <p>
          <strong>Submitted:</strong>
          ${escapeHTML(formatDate(report.createdAt))}
        </p>

        <div class="lc-report-detail__description">
          ${escapeHTML(report.description)}
        </div>

        ${
          report.resolution
            ? `<section>
                <h3>Resolution</h3>
                <p>${escapeHTML(report.resolution)}</p>
              </section>`
            : ""
        }

      </article>
    `;
  }

  function bind(container = document) {
    container.addEventListener("click", async event => {
      const button = event.target.closest(
        "[data-report-action]"
      );

      if (!button) return;

      const action = button.dataset.reportAction;
      const reportId = button.dataset.id;

      if (action !== "view") return;

      try {
        const result = await getDetails(reportId);

        window.dispatchEvent(
          new CustomEvent("lenscircle:report-view", {
            detail: result.data
          })
        );

      } catch (error) {
        console.error("Report retrieval failed:", error);

        window.dispatchEvent(
          new CustomEvent("lenscircle:report-error", {
            detail: {
              message: error.message || "Unable to open report."
            }
          })
        );
      }
    });
  }

  function bindSubmit(form, options = {}) {
    if (!form) return;

    form.addEventListener("submit", async event => {
      event.preventDefault();

      const button = form.querySelector(
        '[type="submit"]'
      );

      if (button) button.disabled = true;

      try {
        const payload = {
          targetType: form.elements.namedItem("target_type")?.value,
          targetId: form.elements.namedItem("target_id")?.value,
          reason: form.elements.namedItem("reason")?.value,
          description: form.elements.namedItem("description")?.value
        };

        const result = await submit(payload);

        if (options.onSuccess) {
          options.onSuccess(result.data);
        } else {
          window.alert(
            "Your report has been submitted for review."
          );
        }

        form.reset();

      } catch (error) {
        console.error("Report submission failed:", error);

        if (options.onError) {
          options.onError(error);
        } else {
          window.alert(error.message || "Unable to submit report.");
        }

      } finally {
        if (button) button.disabled = false;
      }
    });
  }

  window.LensCircleReports = {
    config: CONFIG,
    state,
    submit,
    getMine,
    getAssigned,
    getDetails,
    updateStatus,
    addNote,
    escalate,
    renderCard,
    renderList,
    renderDetails,
    bind,
    bindSubmit,
    formatDate
  };

})();
