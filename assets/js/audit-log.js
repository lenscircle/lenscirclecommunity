
/* =========================================================
   LENS CIRCLE — AUDIT LOG MODULE
   File: assets/js/audit-log.js

   PURPOSE
   Administrative and departmental audit-log interface.

   EXPECTED BACKEND RPCs
   - get_platform_audit_logs
   - get_department_audit_logs
   - get_my_audit_logs

   These RPCs must:
   - Derive the caller from auth.uid().
   - Verify the caller's active role.
   - Enforce department-level access.
   - Return only authorised records.
   - Never trust role, actor ID or department
     supplied by the browser.
     
   SECURITY
   - Audit records must be immutable to ordinary users.
   - Inserts should happen through trusted database functions.
   - No direct browser-side audit-log insertion.
   - No service-role key in frontend code.
   ========================================================= */

(function (window, document) {
  "use strict";

  const LC = window.LensCircle = window.LensCircle || {};
  const AuditLog = {};

  const DEFAULTS = {
    pageSize: 25,
    maxPageSize: 100,
    platformRpc: "get_platform_audit_logs",
    departmentRpc: "get_department_audit_logs",
    personalRpc: "get_my_audit_logs"
  };

  const state = {
    records: [],
    filtered: [],
    page: 1,
    pageSize: DEFAULTS.pageSize,
    total: 0,
    mode: "personal",
    loading: false,
    filters: {
      search: "",
      action: "",
      from: "",
      to: ""
    },
    lastError: null
  };

  /* ---------------------------------------------------------
     HELPERS
  --------------------------------------------------------- */

  function getClient() {
    if (LC.db) return LC.db;

    if (
      LC.supabase &&
      typeof LC.supabase.from === "function"
    ) {
      return LC.supabase;
    }

    throw new Error("Supabase client is not configured.");
  }

  function clean(value, maxLength) {
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

  function element(selector, parent) {
    return (parent || document).querySelector(selector);
  }

  function elements(selector, parent) {
    return Array.from(
      (parent || document).querySelectorAll(selector)
    );
  }

  function formatDate(value) {
    if (!value) return "—";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "—";
    }

    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(date);
  }

  function normaliseRecord(record) {
    const item = record || {};

    return {
      id: clean(item.id, 100),
      created_at: item.created_at || null,
      actor_id: clean(item.actor_id, 100),
      actor_name: clean(item.actor_name, 150),
      actor_role: clean(item.actor_role, 50),
      action: clean(item.action, 150),
      category: clean(item.category, 100),
      target_type: clean(item.target_type, 100),
      target_id: clean(item.target_id, 100),
      target_name: clean(item.target_name, 200),
      department: clean(item.department, 100),
      description: clean(item.description, 2000),
      outcome: clean(item.outcome, 100),
      metadata: item.metadata &&
        typeof item.metadata === "object"
          ? item.metadata
          : {}
    };
  }

  function setText(selector, value) {
    elements(selector).forEach(function (node) {
      node.textContent =
        value === null || value === undefined
          ? ""
          : String(value);
    });
  }

  function notify(message, type) {
    if (
      LC.main &&
      typeof LC.main.notify === "function"
    ) {
      LC.main.notify(message, type || "info");
      return;
    }

    if (
      LC.forms &&
      typeof LC.forms.notify === "function"
    ) {
      LC.forms.notify(message, type || "info");
      return;
    }

    console.info("[Lens Circle Audit Log]", message);
  }

  function setLoading(loading) {
    state.loading = Boolean(loading);

    elements("[data-audit-refresh]").forEach(function (button) {
      button.disabled = state.loading;
      button.setAttribute(
        "aria-busy",
        String(state.loading)
      );
    });

    elements("[data-audit-loading]").forEach(function (node) {
      node.hidden = !state.loading;
    });
  }

  /* ---------------------------------------------------------
     RPC CONFIGURATION
  --------------------------------------------------------- */

  AuditLog.configure = function (options) {
    const settings = options || {};

    if (settings.pageSize) {
      state.pageSize = Math.min(
        DEFAULTS.maxPageSize,
        Math.max(1, Number(settings.pageSize))
      );
    }

    if (settings.mode) {
      const allowedModes = [
        "personal",
        "department",
        "platform"
      ];

      if (!allowedModes.includes(settings.mode)) {
        throw new Error("Unsupported audit-log mode.");
      }

      state.mode = settings.mode;
    }

    return AuditLog;
  };

  /* ---------------------------------------------------------
     FETCH AUDIT LOGS
  --------------------------------------------------------- */

  AuditLog.fetch = async function (options) {
    const settings = options || {};

    if (state.loading) return state.records;

    const mode = settings.mode || state.mode;

    const rpcMap = {
      personal: DEFAULTS.personalRpc,
      department: DEFAULTS.departmentRpc,
      platform: DEFAULTS.platformRpc
    };

    if (!rpcMap[mode]) {
      throw new Error("Invalid audit-log access mode.");
    }

    setLoading(true);
    state.lastError = null;

    try {
      const db = getClient();

      const page = Math.max(
        1,
        Number(settings.page || state.page)
      );

      const pageSize = Math.min(
        DEFAULTS.maxPageSize,
        Math.max(
          1,
          Number(settings.pageSize || state.pageSize)
        )
      );

      /*
       * RPC parameter names must match the SQL functions.
       * The backend must determine access from auth.uid().
       */
      const { data, error } = await db.rpc(
        rpcMap[mode],
        {
          p_page: page,
          p_page_size: pageSize,
          p_search: clean(state.filters.search, 150) || null,
          p_action: clean(state.filters.action, 100) || null,
          p_from: state.filters.from || null,
          p_to: state.filters.to || null
        }
      );

      if (error) throw error;

      const response = Array.isArray(data)
        ? data
        : data && Array.isArray(data.records)
          ? data.records
          : [];

      state.records = response.map(normaliseRecord);

      state.total = Array.isArray(data)
        ? state.records.length
        : Number(data && data.total) || state.records.length;

      state.page = page;
      state.pageSize = pageSize;
      state.mode = mode;

      AuditLog.render();

      return state.records;
    } catch (error) {
      state.lastError = error;

      console.error(
        "[Lens Circle Audit Log] Fetch failed:",
        error
      );

      AuditLog.renderError(
        "Unable to load audit records. Check your permissions or try again."
      );

      throw error;
    } finally {
      setLoading(false);
    }
  };

  /* ---------------------------------------------------------
     LOCAL FILTERING
  --------------------------------------------------------- */

  AuditLog.filter = function (filters) {
    const settings = filters || {};

    state.filters = {
      search: clean(
        settings.search !== undefined
          ? settings.search
          : state.filters.search,
        150
      ),
      action: clean(
        settings.action !== undefined
          ? settings.action
          : state.filters.action,
        100
      ),
      from: clean(
        settings.from !== undefined
          ? settings.from
          : state.filters.from,
        30
      ),
      to: clean(
        settings.to !== undefined
          ? settings.to
          : state.filters.to,
        30
      )
    };

    const search = state.filters.search.toLowerCase();

    state.filtered = state.records.filter(function (record) {
      const searchable = [
        record.actor_name,
        record.actor_role,
        record.action,
        record.category,
        record.target_name,
        record.target_type,
        record.department,
        record.description,
        record.outcome
      ].join(" ").toLowerCase();

      const matchesSearch =
        !search || searchable.includes(search);

      const matchesAction =
        !state.filters.action ||
        record.action === state.filters.action;

      const timestamp = record.created_at
        ? new Date(record.created_at).getTime()
        : 0;

      const from = state.filters.from
        ? new Date(
            state.filters.from + "T00:00:00"
          ).getTime()
        : null;

      const to = state.filters.to
        ? new Date(
            state.filters.to + "T23:59:59"
          ).getTime()
        : null;

      const matchesFrom =
        from === null || timestamp >= from;

      const matchesTo =
        to === null || timestamp <= to;

      return (
        matchesSearch &&
        matchesAction &&
        matchesFrom &&
        matchesTo
      );
    });

    state.page = 1;

    AuditLog.render();

    return state.filtered;
  };

  /* ---------------------------------------------------------
     EVENT LABELS
  --------------------------------------------------------- */

  AuditLog.getActionLabel = function (action) {
    const labels = {
      member_registered: "Member registered",
      member_suspended: "Member suspended",
      member_reinstated: "Member reinstated",
      moderator_appointed: "Moderator appointed",
      moderator_removed: "Moderator removed",
      director_appointed: "Director appointed",
      director_removed: "Director removed",
      department_assigned: "Department assigned",
      assignment_created: "Assignment created",
      assignment_updated: "Assignment updated",
      competition_created: "Competition created",
      competition_updated: "Competition updated",
      competition_published: "Competition published",
      competition_closed: "Competition closed",
      submission_reviewed: "Submission reviewed",
      exhibition_published: "Exhibition published",
      story_published: "Story published",
      report_escalated: "Report escalated",
      settings_updated: "Settings updated",
      account_access_changed: "Account access changed"
    };

    return labels[action] || clean(action, 150) || "Activity";
  };

  /* ---------------------------------------------------------
     EVENT BADGES
  --------------------------------------------------------- */

  AuditLog.getOutcomeClass = function (outcome) {
    const value = String(outcome || "").toLowerCase();

    if (
      value === "success" ||
      value === "completed" ||
      value === "approved"
    ) {
      return "audit-status-success";
    }

    if (
      value === "failed" ||
      value === "rejected" ||
      value === "denied"
    ) {
      return "audit-status-danger";
    }

    if (
      value === "pending" ||
      value === "review"
    ) {
      return "audit-status-pending";
    }

    return "audit-status-neutral";
  };

  /* ---------------------------------------------------------
     RENDER TABLE
  --------------------------------------------------------- */

  AuditLog.render = function () {
    const container = element("[data-audit-list]");

    if (!container) return;

    const records = state.filtered.length
      ? state.filtered
      : state.filters.search ||
        state.filters.action ||
        state.filters.from ||
        state.filters.to
          ? []
          : state.records;

    container.replaceChildren();

    if (!records.length) {
      AuditLog.renderEmpty(container);
      AuditLog.renderPagination();
      return;
    }

    records.forEach(function (record) {
      const row = document.createElement("div");

      row.className = "audit-log-row";
      row.dataset.auditId = record.id;

      const date = document.createElement("time");
      date.className = "audit-log-date";
      date.textContent = formatDate(record.created_at);

      const actor = document.createElement("div");
      actor.className = "audit-log-actor";

      const actorName = document.createElement("strong");
      actorName.textContent =
        record.actor_name || "System";

      const actorRole = document.createElement("span");
      actorRole.textContent = record.actor_role || "—";

      actor.append(actorName, actorRole);

      const action = document.createElement("div");
      action.className = "audit-log-action";

      const actionName = document.createElement("strong");
      actionName.textContent =
        AuditLog.getActionLabel(record.action);

      const description = document.createElement("span");
      description.textContent =
        record.description || record.target_name || "—";

      action.append(actionName, description);

      const department = document.createElement("span");
      department.className = "audit-log-department";
      department.textContent = record.department || "—";

      const outcome = document.createElement("span");
      outcome.className =
        "audit-log-status " +
        AuditLog.getOutcomeClass(record.outcome);

      outcome.textContent = record.outcome || "Recorded";

      const details = document.createElement("button");
      details.type = "button";
      details.className = "audit-log-details";
      details.textContent = "View details";
      details.setAttribute(
        "aria-label",
        "View audit record details"
      );

      details.addEventListener("click", function () {
        AuditLog.showDetails(record.id);
      });

      row.append(
        date,
        actor,
        action,
        department,
        outcome,
        details
      );

      container.appendChild(row);
    });

    AuditLog.renderPagination();
  };

  /* ---------------------------------------------------------
     EMPTY STATE
  --------------------------------------------------------- */

  AuditLog.renderEmpty = function (container) {
    const wrapper = document.createElement("div");
    wrapper.className = "audit-log-empty";

    const heading = document.createElement("h3");
    heading.textContent = "No audit records found";

    const description = document.createElement("p");
    description.textContent =
      "Records will appear here when relevant platform activity is recorded.";

    wrapper.append(heading, description);
    container.appendChild(wrapper);
  };

  /* ---------------------------------------------------------
     ERROR STATE
  --------------------------------------------------------- */

  AuditLog.renderError = function (message) {
    const container = element("[data-audit-list]");

    if (!container) return;

    container.replaceChildren();

    const error = document.createElement("p");
    error.className = "audit-log-error";
    error.setAttribute("role", "alert");
    error.textContent = clean(message, 500);

    container.appendChild(error);
  };

  /* ---------------------------------------------------------
     PAGINATION
  --------------------------------------------------------- */

  AuditLog.renderPagination = function () {
    const container = element("[data-audit-pagination]");

    if (!container) return;

    container.replaceChildren();

    const pages = Math.max(
      1,
      Math.ceil(state.total / state.pageSize)
    );

    const previous = document.createElement("button");
    previous.type = "button";
    previous.textContent = "Previous";
    previous.disabled = state.page <= 1;

    previous.addEventListener("click", function () {
      if (state.page > 1) {
        state.page--;
        AuditLog.fetch({ page: state.page });
      }
    });

    const indicator = document.createElement("span");
    indicator.textContent =
      "Page " + state.page + " of " + pages;

    const next = document.createElement("button");
    next.type = "button";
    next.textContent = "Next";
    next.disabled = state.page >= pages;

    next.addEventListener("click", function () {
      if (state.page < pages) {
        state.page++;
        AuditLog.fetch({ page: state.page });
      }
    });

    container.append(previous, indicator, next);
  };

  /* ---------------------------------------------------------
     RECORD DETAILS
  --------------------------------------------------------- */

  AuditLog.showDetails = function (id) {
    const record = state.records.find(function (item) {
      return item.id === id;
    });

    if (!record) {
      notify("Audit record not found.", "error");
      return null;
    }

    const modal = element("[data-audit-details]");

    if (!modal) {
      notify(
        AuditLog.getActionLabel(record.action) +
        " — " +
        formatDate(record.created_at),
        "info"
      );

      return record;
    }

    modal.replaceChildren();

    const heading = document.createElement("h2");
    heading.textContent = "Audit record details";

    const fields = [
      ["Event", AuditLog.getActionLabel(record.action)],
      ["Date", formatDate(record.created_at)],
      ["Actor", record.actor_name || "System"],
      ["Actor role", record.actor_role || "—"],
      ["Target", record.target_name || "—"],
      ["Target type", record.target_type || "—"],
      ["Department", record.department || "—"],
      ["Outcome", record.outcome || "Recorded"],
      ["Description", record.description || "—"]
    ];

    const list = document.createElement("dl");

    fields.forEach(function (entry) {
      const term = document.createElement("dt");
      term.textContent = entry[0];

      const value = document.createElement("dd");
      value.textContent = entry[1];

      list.append(term, value);
    });

    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "Close";
    close.addEventListener("click", function () {
      modal.hidden = true;
    });

    modal.append(heading, list, close);
    modal.hidden = false;

    return record;
  };

  /* ---------------------------------------------------------
     CSV EXPORT
  --------------------------------------------------------- */

  AuditLog.exportCSV = function () {
    const records = state.filtered.length ||
      state.filters.search ||
      state.filters.action ||
      state.filters.from ||
      state.filters.to
        ? state.filtered
        : state.records;

    if (!records.length) {
      notify("There are no records to export.", "info");
      return false;
    }

    const columns = [
      "created_at",
      "actor_name",
      "actor_role",
      "action",
      "category",
      "target_type",
      "target_name",
      "department",
      "outcome",
      "description"
    ];

    function csvCell(value) {
      let textValue = String(
        value == null ? "" : value
      );

      // Reduce spreadsheet formula injection risk.
      if (/^[\s]*[=+\-@]/.test(textValue)) {
        textValue = "'" + textValue;
      }

      return '"' +
        textValue.replace(/"/g, '""') +
        '"';
    }

    const rows = [
      columns.join(","),
      ...records.map(function (record) {
        return columns.map(function (column) {
          return csvCell(record[column]);
        }).join(",");
      })
    ];

    const blob = new Blob(
      ["\uFEFF" + rows.join("\r\n")],
      { type: "text/csv;charset=utf-8;" }
    );

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download =
      "lens-circle-audit-log-" +
      new Date().toISOStrin