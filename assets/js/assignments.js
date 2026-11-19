
/* =========================================================
   LENS CIRCLE — ASSIGNMENTS MODULE
   File: assets/js/assignments.js

   Supports:
   - Moderator: view own assignments and update task status.
   - Director: view department assignments.
   - Director: create assignments for authorised moderators.
   - Director: update and reassign department tasks.
   - Admin: access depends on explicit database permissions.

   SECURITY:
   - Never trust a browser-supplied assigned_by or creator ID.
   - Supabase RPCs must derive the acting user from auth.uid().
   - Directors must only manage their own assigned departments.
   - Moderators must only access tasks assigned to them.
   - All permissions and department boundaries must be
     enforced by PostgreSQL functions and RLS.

   REQUIRED DATABASE RPC CONTRACTS:
   get_my_assignments()
   get_department_assignments(p_department_id)
   get_assignment_details(p_assignment_id)
   create_assignment(
     p_title, p_description, p_department_id,
     p_assigned_to, p_priority, p_due_at
   )
   update_assignment_status(p_assignment_id, p_status)
   reassign_assignment(p_assignment_id, p_new_assignee_id)

   These RPCs and the assignments table must be created
   before this module can retrieve or save real assignments.
   ========================================================= */

(function (window, document) {
  "use strict";

  const LC = window.LensCircle = window.LensCircle || {};

  const Assignments = {};

  const RPC = Object.freeze({
    MY: "get_my_assignments",
    DEPARTMENT: "get_department_assignments",
    DETAILS: "get_assignment_details",
    CREATE: "create_assignment",
    UPDATE_STATUS: "update_assignment_status",
    REASSIGN: "reassign_assignment"
  });

  const STATUSES = Object.freeze([
    "assigned",
    "accepted",
    "in_progress",
    "under_review",
    "completed",
    "cancelled"
  ]);

  const PRIORITIES = Object.freeze([
    "low",
    "normal",
    "high",
    "urgent"
  ]);

  const DEPARTMENTS = Object.freeze([
    "competition",
    "community",
    "activities",
    "editorial",
    "outreach"
  ]);

  const STATUS_LABELS = Object.freeze({
    assigned: "Assigned",
    accepted: "Accepted",
    in_progress: "In progress",
    under_review: "Under review",
    completed: "Completed",
    cancelled: "Cancelled"
  });

  const PRIORITY_LABELS = Object.freeze({
    low: "Low",
    normal: "Normal",
    high: "High",
    urgent: "Urgent"
  });

  const state = {
    assignments: [],
    currentAssignment: null,
    filters: {
      status: "all",
      priority: "all",
      search: ""
    }
  };

  /* ---------------------------------------------------------
     CORE HELPERS
  --------------------------------------------------------- */

  function getClient() {
    const client = LC.db || LC.supabase;

    if (!client || typeof client.rpc !== "function") {
      throw new Error(
        "Supabase client is unavailable. Check supabase-client.js."
      );
    }

    return client;
  }

  async function getCurrentUser() {
    const client = getClient();
    const result = await client.auth.getUser();

    if (result.error) throw result.error;

    if (!result.data || !result.data.user) {
      throw new Error("Please sign in to continue.");
    }

    return result.data.user;
  }

  function cleanText(value, maxLength) {
    return String(value == null ? "" : value)
      .trim()
      .slice(0, maxLength || 500);
  }

  function normaliseId(value) {
    return cleanText(value, 100);
  }

  function escapeHTML(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function normaliseStatus(value) {
    const status = cleanText(value, 40).toLowerCase();
    return STATUSES.includes(status) ? status : "assigned";
  }

  function normalisePriority(value) {
    const priority = cleanText(value, 20).toLowerCase();
    return PRIORITIES.includes(priority) ? priority : "normal";
  }

  function normaliseDepartment(value) {
    const department = cleanText(value, 40).toLowerCase();
    return DEPARTMENTS.includes(department) ? department : "";
  }

  function formatDate(value) {
    if (!value) return "No deadline";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "Date unavailable";

    return new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit"
    }).format(date);
  }

  function isOverdue(assignment) {
    if (!assignment || !assignment.due_at) return false;

    if (
      assignment.status === "completed" ||
      assignment.status === "cancelled"
    ) {
      return false;
    }

    const deadline = new Date(assignment.due_at).getTime();

    return Number.isFinite(deadline) && deadline < Date.now();
  }

  function normaliseAssignment(row) {
    const item = row || {};

    return {
      id: normaliseId(item.id || item.assignment_id),
      title: cleanText(item.title, 180),
      description: cleanText(item.description, 5000),
      department_id: normaliseId(item.department_id),
      department: normaliseDepartment(
        item.department || item.department_slug
      ),
      assigned_to: normaliseId(item.assigned_to),
      assignee_name: cleanText(
        item.assignee_name || item.assignee_full_name,
        120
      ),
      assigned_by_name: cleanText(
        item.assigned_by_name || item.creator_name,
        120
      ),
      status: normaliseStatus(item.status),
      priority: normalisePriority(item.priority),
      due_at: item.due_at || null,
      created_at: item.created_at || null,
      updated_at: item.updated_at || null
    };
  }

  function unwrapRows(data) {
    if (Array.isArray(data)) return data;

    if (data && Array.isArray(data.assignments)) {
      return data.assignments;
    }

    if (data && typeof data === "object") {
      return [data];
    }

    return [];
  }

  async function callRPC(name, params) {
    const client = getClient();
    const result = await client.rpc(name, params || {});

    if (result.error) {
      console.error("[Lens Circle Assignments]", name, result.error);
      throw new Error(
        result.error.message || "The assignment request failed."
      );
    }

    return result.data;
  }

  function validateTitle(title) {
    const value = cleanText(title, 180);

    if (value.length < 3) {
      throw new Error("Enter a task title with at least 3 characters.");
    }

    return value;
  }

  function validateDueDate(value) {
    if (!value) return null;

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      throw new Error("Enter a valid deadline.");
    }

    return date.toISOString();
  }

  function ensureAllowedStatus(status) {
    const value = cleanText(status, 40).toLowerCase();

    if (!STATUSES.includes(value)) {
      throw new Error("Invalid assignment status.");
    }

    return value;
  }

  function ensureAllowedPriority(priority) {
    const value = cleanText(priority, 20).toLowerCase();

    if (!PRIORITIES.includes(value)) {
      throw new Error("Invalid task priority.");
    }

    return value;
  }

  /* ---------------------------------------------------------
     RETRIEVE ASSIGNMENTS
  --------------------------------------------------------- */

  /**
   * Retrieve tasks assigned to the currently authenticated user.
   * The database function must use auth.uid() and must not accept
   * a user ID supplied by the browser.
   */
  Assignments.getMyAssignments = async function () {
    await getCurrentUser();

    const data = await callRPC(RPC.MY);

    state.assignments = unwrapRows(data).map(normaliseAssignment);

    return state.assignments;
  };

  /**
   * Retrieve tasks for a department.
   *
   * The database must verify that the caller is an active Director
   * assigned to this department, or another explicitly authorised
   * staff role. A department ID is not proof of permission.
   */
  Assignments.getDepartmentAssignments = async function (departmentId) {
    await getCurrentUser();

    const id = normaliseId(departmentId);

    if (!id) {
      throw new Error("A valid department ID is required.");
    }

    const data = await callRPC(RPC.DEPARTMENT, {
      p_department_id: id
    });

    state.assignments = unwrapRows(data).map(normaliseAssignment);

    return state.assignments;
  };

  /**
   * Retrieve one task.
   * The database must check that the current user is its assignee,
   * its authorised department Director, or an authorised Admin.
   */
  Assignments.getAssignmentDetails = async function (assignmentId) {
    await getCurrentUser();

    const id = normaliseId(assignmentId);

    if (!id) throw new Error("Assignment ID is required.");

    const data = await callRPC(RPC.DETAILS, {
      p_assignment_id: id
    });

    const row = Array.isArray(data) ? data[0] : data;

    if (!row) throw new Error("Assignment not found.");

    state.currentAssignment = normaliseAssignment(row);

    return state.currentAssignment;
  };

  /* ---------------------------------------------------------
     DIRECTOR: CREATE TASK
  --------------------------------------------------------- */

  /**
   * Create a task and assign it to a Moderator.
   *
   * Input:
   * {
   *   title,
   *   description,
   *   departmentId,
   *   assigneeId,
   *   priority,
   *   dueAt
   * }
   *
   * Important:
   * - No assigned_by field is accepted.
   * - The database derives the Director from auth.uid().
   * - The database verifies the Director's department.
   * - The database verifies the target Moderator belongs to
   *   the same department.
   */
  Assignments.createAssignment = async function (input) {
    await getCurrentUser();

    const values = input || {};

    const title = validateTitle(values.title);
    const description = cleanText(values.description, 5000);
    const departmentId = normaliseId(values.departmentId);
    const assigneeId = normaliseId(values.assigneeId);
    const priority = ensureAllowedPriority(
      values.priority || "normal"
    );
    const dueAt = validateDueDate(values.dueAt);

    if (!departmentId) {
      throw new Error("Select a department.");
    }

    if (!assigneeId) {
      throw new Error("Select a Moderator to assign this task to.");
    }

    const data = await callRPC(RPC.CREATE, {
      p_title: title,
      p_description: description,
      p_department_id: departmentId,
      p_assigned_to: assigneeId,
      p_priority: priority,
      p_due_at: dueAt
    });

    return data;
  };

  /* ---------------------------------------------------------
     UPDATE TASK STATUS
  --------------------------------------------------------- */

  /**
   * Update task status.
   *
   * Moderators should normally be allowed to update only their
   * own tasks and only through permitted status transitions.
   * Directors may have additional authority within their
   * assigned departments.
   *
   * The database must enforce the transition rules.
   */
  Assignments.updateAssignmentStatus = async function (
    assignmentId,
    status
  ) {
    await getCurrentUser();

    const id = normaliseId(assignmentId);

    if (!id) throw new Error("Assignment ID is required.");

    const nextStatus = ensureAllowedStatus(status);

    const data = await callRPC(RPC.UPDATE_STATUS, {
      p_assignment_id: id,
      p_status: nextStatus
    });

    return data;
  };

  /* ---------------------------------------------------------
     DIRECTOR: REASSIGN TASK
  --------------------------------------------------------- */

  /**
   * Reassign a task to another Moderator.
   *
   * The database must verify:
   * 1. Caller is an active Director or explicitly authorised Admin.
   * 2. Director owns the task's department.
   * 3. New assignee is an active Moderator.
   * 4. New assignee belongs to the same department.
   * 5. The task is eligible for reassignment.
   *
   * No acting-user ID is accepted from the browser.
   */
  Assignments.reassignAssignment = async function (
    assignmentId,
    newAssigneeId
  ) {
    await getCurrentUser();

    const id = normaliseId(assignmentId);
    const assigneeId = normaliseId(newAssigneeId);

    if (!id) throw new Error("Assignment ID is required.");
    if (!assigneeId) throw new Error("Select a new assignee.");

    const data = await callRPC(RPC.REASSIGN, {
      p_assignment_id: id,
      p_new_assignee_id: assigneeId
    });

    return data;
  };

  /* ---------------------------------------------------------
     FILTERING
  --------------------------------------------------------- */

  Assignments.setFilters = function (filters) {
    const values = filters || {};

    if (values.status !== undefined) {
      const status = cleanText(values.status, 40).toLowerCase();

      state.filters.status =
        status === "all" || STATUSES.includes(status)
          ? status
          : "all";
    }

    if (values.priority !== undefined) {
      const priority = cleanText(values.priority, 20).toLowerCase();

      state.filters.priority =
        priority === "all" || PRIORITIES.includes(priority)
          ? priority
          : "all";
    }

    if (values.search !== undefined) {
      state.filters.search = cleanText(values.search, 120)
        .toLowerCase();
    }

    return Assignments.getFilteredAssignments();
  };

  Assignments.getFilteredAssignments = function () {
    const filters = state.filters;

    return state.assignments.filter(function (item) {
      if (
        filters.status !== "all" &&
        item.status !== filters.status
      ) {
        return false;
      }

      if (
        filters.priority !== "all" &&
        item.priority !== filters.priority
      ) {
        return false;
      }

      if (filters.search) {
        const searchable = [
          item.title,
          item.description,
          item.assignee_name,
          item.department,
          item.status
        ].join(" ").toLowerCase();

        if (!searchable.includes(filters.search)) return false;
      }

      return true;
    });
  };

  /* ---------------------------------------------------------
     RENDERING
  --------------------------------------------------------- */

  function statusBadge(status) {
    const safeStatus = normaliseStatus(status);
    const label = STATUS_LABELS[safeStatus];

    return (
      '<span class="assignment-status assignment-status-' +
      escapeHTML(safeStatus) +
      '">' +
      escapeHTML(label) +
      "</span>"
    );
  }

  function priorityBadge(priority) {
    const safePriority = normalisePriority(priority);
    const label = PRIORITY_LABELS[safePriority];

    return (
      '<span class="assignment-priority assignment-priority-' +
      escapeHTML(safePriority) +
      '">' +
      escapeHTML(label) +
      "</span>"
    );
  }

  Assignments.renderCard = function (assignment) {
    const item = normaliseAssignment(assignment);

    const overdue = isOverdue(item);
    const deadlineLabel = overdue
      ? "Overdue · " + formatDate(item.due_at)
      : formatDate(item.due_at);

    return `
      <article class="assignment-card"
        data-assignment-id="${escapeHTML(item.id)}">

        <div class="assignment-card-top">
          <div class="assignment-badges">
            ${statusBadge(item.status)}
            ${priorityBadge(item.priority)}
          </div>

          ${
            overdue
              ? '<span class="assignment-overdue">Overdue</span>'
              : ""
          }
        </div>

        <h3 class="assignment-title">
          ${escapeHTML(item.title || "Untitled task")}
        </h3>

        ${
          item.description
            ? `<p class="assignment-description">
                ${escapeHTML(item.description)}
              </p>`
            : ""
        }

        <div class="assignment-meta">
          ${
            item.department
              ? `<span>Department: ${escapeHTML(item.department)}</span>`
              : ""
          }

          ${
            item.assignee_name
              ? `<span>Assigned to: ${escapeHTML(item.assignee_name)}</span>`
              : ""
          }

          <span>Deadline: ${escapeHTML(deadlineLabel)}</span>
        </div>

        <button
          type="button"
          class="btn btn-secondary assignment-view-button"
          data-assignment-view="${escapeHTML(item.id)}">
          View task
        </button>
      </article>
    `;
  };

  /**
   * Render cards into a container.
   * The caller can provide an empty-state message.
   */
  Assignments.renderList = function (container, options) {
    const target =
      typeof container === "string"
        ? document.querySelector(container)
        : container;

    if (!target) {
      throw new Error("Assignment list container was not found.");
    }

    const settings = options || {};
    const items = Assignments.getFilteredAssignments();

    if (!items.length) {
      target.innerHTML = `
        <div class="assignment-empty-state">
          <h3>${escapeHTML(
            settings.emptyTitle || "No assignments found"
          )}</h3>
          <p>${escapeHTML(
            settings.emptyMessage ||
            "Tasks will appear here when they are available."
          )}</p>
        </div>
      `;

      return;
    }

    target.innerHTML = items
      .map(Assignments.renderCard)
      .join("");
  };

  /* ---------------------------------------------------------
     FORM HANDLING
  --------------------------------------------------------- */

  /**
   * Read a Director's create-assignment form.
   *
   * Expected field names:
   * title, description, department_id, assigned_to,
   * priority, due_at
   *
   * The browser must not include assigned_by or role fields.
   */
  Assignments.createFromForm = async function (form) {
    const target =
      typeof form === "string"
        ? document.querySelector(form)
        : form;

    if (!target || !target.elements) {
      throw new Error("Assignment form was not found.");
    }

    const fields = target.elements;

    const result = await Assignments.createAssignment({
      title: fields.title ? fields.title.value : "",
      description: fields.description
        ? fields.description.value
        : "",
      departmentId: fields.department_id
        ? fields.department_id.value
        : "",
      assigneeId: fields.assigned_to
        ? fields.assigned_to.value
        : "",
      priority: fields.priority
        ? fields.priority.value
        : "normal",
      dueAt: fields.due_at
        ? fields.due_at.value
        : ""
    });

    target.reset();

    return result;
  };

  /* ---------------------------------------------------------
     EVENT DELEGATION
  --------------------------------------------------------- */

  Assignments.bindList = function (container, onView) {
    const target =
      typeof container === "string"
        ? document.querySelector(container)
        : container;

    if (!target) {
      throw new Error("Assignment list container was not found.");
    }

    target.addEventListener("click", function (event) {
      const button = event.target.closest("[data-assignment-view]");

      if (!button || !target.contains(button)) return;

      const id = button.getAttribute("data-assignment-view");

      if (typeof onView === "function") {
        onView(id);
      } else {
        Assignments.getAssignmentDetails(id).catch(function (error) {
          console.error(error);
        });
      }
    });
  };

  /* ---------------------------------------------------------
     SUMMARY
  --------------------------------------------------------- */

  Assignments.getSummary = function (items) {
    const list = Array.isArray(items)
      ? items.map(no