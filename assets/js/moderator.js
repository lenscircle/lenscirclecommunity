
/* =========================================================
   LENS CIRCLE — MODERATOR MODULE
   File: assets/js/moderator.js

   PURPOSE
   Moderator operational workspace.

   EXPECTED SUPABASE RPC CONTRACTS
   - has_staff_role
   - get_my_access_context
   - moderator_get_assignments
   - moderator_update_assignment
   - moderator_get_submissions
   - moderator_review_submission
   - moderator_get_reports
   - moderator_update_report
   - moderator_escalate_report
   - moderator_get_activities
   - moderator_get_members

   SECURITY
   - Backend derives moderator identity using auth.uid().
   - Backend checks active staff status.
   - Backend enforces department and assignment scope.
   - Moderators cannot appoint or remove staff.
   - Review actions must record the authenticated reviewer.
   - All sensitive actions must be audited.
   ========================================================= */

(function (window, document) {
  "use strict";

  const LC = window.LensCircle = window.LensCircle || {};
  const Moderator = {};

  const state = {
    authorised: false,
    loading: false,
    userId: null,
    departments: [],
    assignments: [],
    submissions: [],
    reports: [],
    activities: [],
    members: [],
    filters: {
      submissions: "all",
      reports: "all",
      assignments: "all"
    }
  };

  const VALID_TASK_STATUSES = [
    "pending",
    "in_progress",
    "completed",
    "blocked"
  ];

  const VALID_REVIEW_ACTIONS = [
    "approve",
    "reject",
    "request_changes",
    "flag"
  ];

  const VALID_REPORT_STATUSES = [
    "open",
    "under_review",
    "resolved",
    "dismissed"
  ];

  /* ---------------------------------------------------------
     HELPERS
  --------------------------------------------------------- */

  function clean(value, maxLength) {
    return String(value == null ? "" : value)
      .trim()
      .slice(0, maxLength || 500);
  }

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function getClient() {
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
      return;
    }

    console.info("[Lens Circle Moderator]", message);
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

  function setLoading(button, loading) {
    if (!button) return;

    button.disabled = Boolean(loading);
    button.setAttribute(
      "aria-busy",
      String(Boolean(loading))
    );
  }

  /* ---------------------------------------------------------
     CENTRAL RPC
  --------------------------------------------------------- */

  Moderator.rpc = async function (
    functionName,
    params
  ) {
    if (!state.authorised) {
      throw new Error(
        "Moderator access has not been verified."
      );
    }

    const db = getClient();

    const { data, error } = await db.rpc(
      functionName,
      params || {}
    );

    if (error) {
      console.error(
        "[Lens Circle Moderator RPC]",
        functionName,
        error
      );

      throw error;
    }

    return data;
  };

  /* ---------------------------------------------------------
     ACCESS VERIFICATION
  --------------------------------------------------------- */

  Moderator.verifyAccess = async function () {
    const db = getClient();

    const {
      data: sessionData,
      error: sessionError
    } = await db.auth.getSession();

    if (sessionError) throw sessionError;

    const session =
      sessionData && sessionData.session;

    if (!session) {
      state.authorised = false;
      return false;
    }

    const { data: roleData, error: roleError } =
      await db.rpc(
        "has_staff_role",
        {
          required_role: "moderator"
        }
      );

    if (roleError || roleData !== true) {
      state.authorised = false;

      throw new Error(
        "Moderator access is not authorised."
      );
    }

    const { data: contextData, error: contextError } =
      await db.rpc("get_my_access_context");

    if (contextError) throw contextError;

    const context = Array.isArray(contextData)
      ? contextData[0]
      : contextData;

    if (
      clean(context && context.role).toLowerCase() !==
      "moderator"
    ) {
      state.authorised = false;

      throw new Error(
        "Invalid Moderator access context."
      );
    }

    state.userId = session.user.id;

    state.departments = safeArray(
      context.departments
    ).map(function (department) {
      return clean(department, 50).toLowerCase();
    });

    state.authorised = true;

    return true;
  };

  /* ---------------------------------------------------------
     ASSIGNMENTS
  --------------------------------------------------------- */

  Moderator.getAssignments = async function (status) {
    const selectedStatus = clean(
      status || state.filters.assignments,
      30
    );

    const data = await Moderator.rpc(
      "moderator_get_assignments",
      {
        p_status: selectedStatus === "all"
          ? null
          : selectedStatus
      }
    );

    state.assignments = safeArray(data);

    Moderator.renderAssignments(state.assignments);

    return state.assignments;
  };

  Moderator.updateAssignment = async function (
    assignmentId,
    status,
    note
  ) {
    const id = clean(assignmentId, 100);
    const nextStatus = clean(status, 30).toLowerCase();

    if (!id) {
      throw new Error("Assignment ID is required.");
    }

    if (!VALID_TASK_STATUSES.includes(nextStatus)) {
      throw new Error("Invalid assignment status.");
    }

    const result = await Moderator.rpc(
      "moderator_update_assignment",
      {
        p_assignment_id: id,
        p_status: nextStatus,
        p_note: clean(note, 1000) || null
      }
    );

    notify("Assignment status updated.", "success");

    await Moderator.getAssignments(
      state.filters.assignments
    );

    return result;
  };

  Moderator.renderAssignments = function (records) {
    const container = document.querySelector(
      "[data-moderator-assignments]"
    );

    if (!container) return;

    container.replaceChildren();

    if (!records.length) {
      const empty = document.createElement("p");
      empty.textContent =
        "You currently have no assigned tasks.";
      container.appendChild(empty);
      return;
    }

    records.forEach(function (record) {
      const card = document.createElement("article");
      card.className = "moderator-assignment-card";

      const heading = document.createElement("h3");
      heading.textContent = clean(record.title, 200);

      const description = document.createElement("p");
      description.textContent =
        clean(record.description, 1000);

      const deadline = document.createElement("p");
      deadline.textContent =
        "Deadline: " + formatDate(record.due_date);

      const status = document.createElement("p");
      status.textContent =
        "Status: " + clean(record.status, 30);

      const select = document.createElement("select");

      VALID_TASK_STATUSES.forEach(function (value) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value.replace(/_/g, " ");
        option.selected = value === record.status;
        select.appendChild(option);
      });

      const update = document.createElement("button");
      update.type = "button";
      update.textContent = "Update task";

      update.addEventListener("click", async function () {
        setLoading(update, true);

        try {
          await Moderator.updateAssignment(
            record.id,
            select.value
          );
        } catch (error) {
          notify(error.message, "error");
        } finally {
          setLoading(update, false);
        }
      });

      card.append(
        heading,
        description,
        deadline,
        status,
        select,
        update
      );

      container.appendChild(card);
    });
  };

  /* ---------------------------------------------------------
     SUBMISSIONS
  --------------------------------------------------------- */

  Moderator.getSubmissions = async function (status) {
    const selectedStatus = clean(
      status || state.filters.submissions,
      30
    );

    const data = await Moderator.rpc(
      "moderator_get_submissions",
      {
        p_status: selectedStatus === "all"
          ? null
          : selectedStatus
      }
    );

    state.submissions = safeArray(data);

    Moderator.renderSubmissions(state.submissions);

    return state.submissions;
  };

  Moderator.reviewSubmission = async function (
    submissionId,
    action,
    note
  ) {
    const id = clean(submissionId, 100);
    const decision = clean(action, 30).toLowerCase();

    if (!id) {
      throw new Error("Submission ID is required.");
    }

    if (!VALID_REVIEW_ACTIONS.includes(decision)) {
      throw new Error("Invalid review action.");
    }

    if (
      ["reject", "request_changes", "flag"].includes(decision) &&
      !clean(note, 500)
    ) {
      throw new Error(
        "A reason or review note is required."
      );
    }

    if (!window.confirm(
      "Confirm this submission review action?"
    )) {
      return false;
    }

    /*
     * Do not send reviewer_id.
     * The database must derive the reviewer using auth.uid().
     */
    await Moderator.rpc(
      "moderator_review_submission",
      {
        p_submission_id: id,
        p_action: decision,
        p_note: clean(note, 1000) || null
      }
    );

    notify("Submission review recorded.", "success");

    await Moderator.getSubmissions(
      state.filters.submissions
    );

    return true;
  };

  Moderator.renderSubmissions = function (records) {
    const container = document.querySelector(
      "[data-moderator-submissions]"
    );

    if (!container) return;

    container.replaceChildren();

    if (!records.length) {
      const empty = document.createElement("p");
      empty.textContent =
        "There are no submissions awaiting your review.";
      container.appendChild(empty);
      return;
    }

    records.forEach(function (record) {
      const card = document.createElement("article");
      card.className = "moderator-submission-card";

      const title = document.createElement("h3");
      title.textContent = clean(record.title, 200);

      const creator = document.createElement("p");
      creator.textContent =
        "Creator: " +
        clean(record.creator_name, 150);

      const category = document.createElement("p");
      category.textContent =
        "Category: " + clean(record.category, 100);

      const status = document.createElement("p");
      status.textContent =
        "Status: " + clean(record.status, 50);

      const note = document.createElement("textarea");
      note.placeholder = "Review note or reason";
      note.maxLength = 1000;

      const actions = document.createElement("div");
      actions.className = "moderator-review-actions";

      [
        ["Approve", "approve"],
        ["Reject", "reject"],
        ["Request changes", "request_changes"],
        ["Flag", "flag"]
      ].forEach(function (entry) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = entry[0];

        button.addEventListener("click", async function () {
          setLoading(button, true);

          try {
            await Moderator.reviewSubmission(
              record.id,
              entry[1],
              note.value
            );
          } catch (error) {
            notify(error.message, "error");
          } finally {
            setLoading(button, false);
          }
        });

        actions.appendChild(button);
      });

      card.append(
        title,
        creator,
        category,
        status,
        note,
        actions
      );

      container.appendChild(card);
    });
  };

  /* ---------------------------------------------------------
     COMMUNITY REPORTS
  --------------------------------------------------------- */

  Moderator.getReports = async function (status) {
    const selectedStatus = clean(
      status || state.filters.reports,
      30
    );

    const data = await Moderator.rpc(
      "moderator_get_reports",
      {
        p_status: selectedStatus === "all"
          ? null
          : selectedStatus
      }
    );

    state.reports = safeArray(data);

    Moderator.renderReports(state.reports);

    return state.reports;
  };

  Moderator.updateReport = async function (
    reportId,
    status,
    note
  ) {
    const id = clean(reportId, 100);
    const nextStatus = clean(status, 30).toLowerCase();

    if (!id) {
      throw new Error("Report ID is required.");
    }

    if (!VALID_REPORT_STATUSES.includes(nextStatus)) {
      throw new Error("Invalid report status.");
    }

    await Moderator.rpc(
      "moderator_update_report",
      {
        p_report_id: id,
        p_status: nextStatus,
        p_note: clean(note, 1000) || null
      }
    );

    notify("Report updated.", "success");

    await Moderator.getReports(
      state.filters.reports
    );

    return true;
  };

  Moderator.escalateReport = async function (
    reportId,
    reason
  ) {
    const id = clean(reportId, 100);
    const explanation = clean(reason, 1000);

    if (!id || !explanation) {
      throw new Error(
        "Report ID and escalation reason are required."
      );
    }

    if (!window.confirm(
      "Escalate this report to the department Director?"
    )) {
      return false;
    }

    await Moderator.rpc(
      "moderator_escalate_report",
      {
        p_report_id: id,
        p_reason: explanation
      }
    );

    notify("Report escalated to the Director.", "success");

    await Moderator.getReports(
      state.filters.reports
    );

    return true;
  };

  Moderator.renderReports = function (records) {
    const container = document.querySelector(
      "[data-moderator-reports]"
    );

    if (!container) return;

    container.replaceChildren();

    if (!records.length) {
      const empty = document.createElement("p");
      empty.textContent = "No community reports found.";
      container.appendChild(empty);
      return;
    }

    records.forEach(function (record) {
      const card = document.createElement("article");
      card.className = "moderator-report-card";

      const title = document.createElement("h3");
      title.textContent =
        clean(record.subject || record.category, 200);

      const description = document.createElement("p");
      description.textContent =
        clean(record.description, 1000);

      const status = document.createElement("p");
      status.textContent =
        "Status: " + clean(record.status, 30);

      const note = document.createElement("textarea");
      note.placeholder = "Internal handling note";
      note.maxLength = 1000;

      const actions = document.createElement("div");

      [
        ["Under review", "under_review"],
        ["Resolve", "resolved"],
        ["Dismiss", "dismissed"]
      ].forEach(function (entry) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = entry[0];

        button.addEventListener("click", function () {
          Moderator.updateReport(
            record.id,
            entry[1],
            note.value
          ).catch(function (error) {
            notify(error.message, "error");
          });
        });

        actions.appendChild(button);
      });

      const escalate = document.createElement("button");
      escalate.type = "button";
      escalate.textContent = "Escalate to Director";

      escalate.addEventListener("click", function () {
        const reason = window.prompt(
          "Enter the escalation reason:"
        );

        if (!reason || !reason.trim()) return;

        Moderator.escalateReport(
          record.id,
          reason
        ).catch(function (error) {
          notify(error.message, "error");
        });
      });

      actions.appendChild(escalate);

      card.append(
        title,
        description,
        status,
        note,
        actions
      );

      container.appendChild(card);
    });
  };

  /* ---------------------------------------------------------
     ACTIVITIES
  --------------------------------------------------------- */

  Moderator.getActivities = async function () {
    const data = await Moderator.rpc(
      "moderator_get_activities"
    );

    state.activities = safeArray(data);

    Moderator.renderSimpleList(
      "[data-moderator-activities]",
      state.activities,
      "No activities are assigned to you."
    );

    return state.activities;
  };

  /* ---------------------------------------------------------
     AUTHORISED MEMBER DIRECTORY
  --------------------------------------------------------- */

  Moderator.getMembers = async function (search) {
    const data = await Moderator.rpc(
      "moderator_get_members",
      {
        p_search: clean(search, 150) || null
      }
    );

    state.members = safeArray(data);

    Moderator.renderMembers(state.members);

    return state.members;
  };

  Moderator.renderMembers = function (records) {
    const container = document.querySelector(
      "[data-moderator-members]"
    );

    if (!container) return;

    container.replaceChildren();

    if (!records.length) {
      const empty = document.createElement("p");
      empty.textContent = "No authorised member records found.";
      container.appendChild(empty);
      return;
    }

    records.forEach(function (record) {
      const card = document.createElement("article");

      const name = document.createElement("h3");
      name.textContent =
        clean(record.full_name, 150) || "Member";

      const username = document.createElement("p");
      username.textContent =
        record.username
          ? "@" + clean(record.username, 50)
          : "";

      card.append(name, username);
      container.appendChild(card);
    });
  };

  /* ---------------------------------------------------------
     SIMPLE LIST RENDERING
  --------------------------------------------------------- */

  Moderator.renderSimpleList = function (
    selector,
    records,
    emptyMessage
  ) {
    const container = document.querySelector(selector);

    if (!container) return;

    container.replaceChildren();

    if (!records.length) {
      const empty = document.createElement("p");
      empty.textContent = emptyMessage;
      container.appendChild(empty);
      return;
    }

    records.forEach(function (record) {
      const item = document.createElement("article");

      const heading = document.createElement("h3");
      heading.textContent =
        clean(record.title || record.name, 200);

      const description = document.createElement("p");
      description.textContent =
        clean(record.description || record.status, 500);

      item.append(heading, description);
      container.appendChild(item);
    });
  };

  /* ---------------------------------------------------------
     DASHBOARD INITIALISATION
  --------------------------------------------------------- */

  Moderator.init = async function () {
    if (state.loading) return false;

    state.loading = true;

    try {
      const allowed = await Moderator.verifyAccess