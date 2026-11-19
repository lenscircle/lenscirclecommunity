
/* =========================================================
   LENS CIRCLE — DIRECTOR MODULE
   File: assets/js/director.js

   PURPOSE
   Department-specific Director operations.

   EXPECTED SUPABASE RPC CONTRACTS
   - get_my_access_context
   - director_get_team
   - director_appoint_moderator
   - director_remove_moderator
   - director_get_assignments
   - director_create_assignment
   - director_update_assignment
   - director_reassign_assignment
   - director_get_activities
   - director_get_competitions
   - director_get_reports
   - director_get_analytics

   SECURITY
   - Backend must derive the Director from auth.uid().
   - Department access must be verified in SQL.
   - Target Moderator department must be checked in SQL.
   - Directors cannot modify other Directors or Admins.
   - Every staff change must be audited.
   - No service-role key in frontend.
   ========================================================= */

(function (window, document) {
  "use strict";

  const LC = window.LensCircle = window.LensCircle || {};
  const Director = {};

  const DEPARTMENTS = Object.freeze([
    "competition",
    "community",
    "activities",
    "editorial",
    "outreach"
  ]);

  const DEPARTMENT_LABELS = Object.freeze({
    competition: "Competition",
    community: "Community",
    activities: "Activities",
    editorial: "Editorial",
    outreach: "Outreach"
  });

  const state = {
    authorised: false,
    loading: false,
    userId: null,
    departments: [],
    activeDepartment: null,
    team: [],
    assignments: [],
    activities: [],
    competitions: [],
    reports: [],
    analytics: null
  };

  /* ---------------------------------------------------------
     HELPERS
  --------------------------------------------------------- */

  function clean(value, maxLength) {
    return String(value == null ? "" : value)
      .trim()
      .slice(0, maxLength || 500);
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

    console.info("[Lens Circle Director]", message);
  }

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function departmentIsValid(value) {
    return DEPARTMENTS.includes(
      clean(value).toLowerCase()
    );
  }

  function requireDepartment(department) {
    const selected = clean(department).toLowerCase();

    if (!state.authorised) {
      throw new Error("Director access is not verified.");
    }

    if (!departmentIsValid(selected)) {
      throw new Error("Invalid department.");
    }

    if (!state.departments.includes(selected)) {
      throw new Error(
        "You do not have access to this department."
      );
    }

    return selected;
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

  /* ---------------------------------------------------------
     CENTRAL RPC
  --------------------------------------------------------- */

  Director.rpc = async function (
    functionName,
    params
  ) {
    if (!state.authorised) {
      throw new Error(
        "Director permissions have not been verified."
      );
    }

    const db = getClient();

    const { data, error } = await db.rpc(
      functionName,
      params || {}
    );

    if (error) {
      console.error(
        "[Lens Circle Director RPC]",
        functionName,
        error
      );

      throw error;
    }

    return data;
  };

  /* ---------------------------------------------------------
     VERIFY DIRECTOR ACCESS
  --------------------------------------------------------- */

  Director.verifyAccess = async function () {
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
          required_role: "director"
        }
      );

    if (roleError || roleData !== true) {
      state.authorised = false;

      throw new Error(
        "Director access is not authorised."
      );
    }

    const { data: contextData, error: contextError } =
      await db.rpc("get_my_access_context");

    if (contextError) throw contextError;

    const context = Array.isArray(contextData)
      ? contextData[0]
      : contextData;

    const role = clean(context && context.role)
      .toLowerCase();

    if (role !== "director") {
      state.authorised = false;

      throw new Error(
        "Invalid Director access context."
      );
    }

    state.userId = session.user.id;

    state.departments = Array.from(
      new Set(
        safeArray(context.departments)
          .map(item => clean(item).toLowerCase())
          .filter(departmentIsValid)
      )
    );

    state.authorised = true;

    if (
      state.activeDepartment &&
      !state.departments.includes(state.activeDepartment)
    ) {
      state.activeDepartment = null;
    }

    if (!state.activeDepartment) {
      state.activeDepartment =
        state.departments[0] || null;
    }

    Director.renderDepartments();

    return true;
  };

  /* ---------------------------------------------------------
     DEPARTMENT CONTEXT
  --------------------------------------------------------- */

  Director.getDepartments = function () {
    return state.departments.map(function (department) {
      return {
        value: department,
        label: DEPARTMENT_LABELS[department]
      };
    });
  };

  Director.setActiveDepartment = function (department) {
    const selected = requireDepartment(department);

    state.activeDepartment = selected;

    Director.renderDepartments();

    document.dispatchEvent(
      new CustomEvent("lenscircle:department-changed", {
        detail: {
          department: selected
        }
      })
    );

    return selected;
  };

  Director.getActiveDepartment = function () {
    return state.activeDepartment;
  };

  Director.renderDepartments = function () {
    const container = document.querySelector(
      "[data-director-departments]"
    );

    if (container) {
      container.replaceChildren();

      if (!state.departments.length) {
        const empty = document.createElement("p");
        empty.textContent =
          "No departments have been assigned to this account.";
        container.appendChild(empty);
      }

      state.departments.forEach(function (department) {
        const button = document.createElement("button");

        button.type = "button";
        button.textContent =
          DEPARTMENT_LABELS[department];

        button.className =
          state.activeDepartment === department
            ? "is-active"
            : "";

        button.setAttribute(
          "aria-pressed",
          String(
            state.activeDepartment === department
          )
        );

        button.addEventListener("click", function () {
          Director.setActiveDepartment(department);
          Director.loadDepartmentData().catch(console.error);
        });

        container.appendChild(button);
      });
    }

    document.querySelectorAll(
      "[data-director-active-department]"
    ).forEach(function (element) {
      element.textContent = state.activeDepartment
        ? DEPARTMENT_LABELS[state.activeDepartment]
        : "No department selected";
    });
  };

  /* ---------------------------------------------------------
     TEAM MANAGEMENT
  --------------------------------------------------------- */

  Director.getTeam = async function (department) {
    const selected = requireDepartment(
      department || state.activeDepartment
    );

    const data = await Director.rpc(
      "director_get_team",
      {
        p_department: selected
      }
    );

    state.team = safeArray(data);

    Director.renderTeam(state.team);

    return state.team;
  };

  Director.renderTeam = function (members) {
    const container = document.querySelector(
      "[data-director-team]"
    );

    if (!container) return;

    container.replaceChildren();

    if (!members.length) {
      const empty = document.createElement("p");
      empty.textContent =
        "No Moderators are assigned to this department yet.";
      container.appendChild(empty);
      return;
    }

    members.forEach(function (member) {
      const card = document.createElement("article");
      card.className = "director-team-card";

      const name = document.createElement("h3");
      name.textContent =
        clean(member.full_name, 150) || "Unnamed Moderator";

      const status = document.createElement("p");
      status.textContent =
        "Status: " + clean(member.status, 30);

      const department = document.createElement("p");
      department.textContent =
        "Department: " +
        (DEPARTMENT_LABELS[state.activeDepartment] || "—");

      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "Remove Moderator";

      remove.addEventListener("click", function () {
        const reason = window.prompt(
          "Enter a reason for removing this Moderator:"
        );

        if (!reason || !reason.trim()) return;

        Director.removeModerator(
          member.id,
          state.activeDepartment,
          reason
        ).catch(function (error) {
          notify(error.message, "error");
        });
      });

      card.append(name, status, department, remove);

      container.appendChild(card);
    });
  };

  Director.appointModerator = async function (
    userId,
    department
  ) {
    const selected = requireDepartment(department);

    const id = clean(userId, 100);

    if (!id) {
      throw new Error("A valid user ID is required.");
    }

    if (!window.confirm(
      "Appoint this user as a Moderator in " +
      DEPARTMENT_LABELS[selected] +
      "?"
    )) {
      return false;
    }

    await Director.rpc(
      "director_appoint_moderator",
      {
        p_user_id: id,
        p_department: selected
      }
    );

    notify("Moderator appointed successfully.", "success");

    await Director.getTeam(selected);

    return true;
  };

  Director.removeModerator = async function (
    userId,
    department,
    reason
  ) {
    const selected = requireDepartment(department);

    const id = clean(userId, 100);
    const explanation = clean(reason, 500);

    if (!id || !explanation) {
      throw new Error(
        "User ID and removal reason are required."
      );
    }

    if (!window.confirm(
      "Remove this Moderator from your department?"
    )) {
      return false;
    }

    await Director.rpc(
      "director_remove_moderator",
      {
        p_user_id: id,
        p_department: selected,
        p_reason: explanation
      }
    );

    notify("Moderator removed from department.", "success");

    await Director.getTeam(selected);

    return true;
  };

  /* ---------------------------------------------------------
     ASSIGNMENT MANAGEMENT
  --------------------------------------------------------- */

  Director.getAssignments = async function (department) {
    const selected = requireDepartment(
      department || state.activeDepartment
    );

    const data = await Director.rpc(
      "director_get_assignments",
      {
        p_department: selected
      }
    );

    state.assignments = safeArray(data);

    Director.renderAssignments(state.assignments);

    return state.assignments;
  };

  Director.createAssignment = async function (payload) {
    const values = payload || {};

    const department = requireDepartment(
      values.department || state.activeDepartment
    );

    const title = clean(values.title, 200);
    const description = clean(values.description, 2000);
    const assignee = clean(values.assignee_id, 100);
    const dueDate = clean(values.due_date, 30);
    const priority = clean(values.priority, 20).toLowerCase();

    if (!title || !description || !assignee || !dueDate) {
      throw new Error(
        "Complete all required assignment fields."
      );
    }

    if (
      !["low", "medium", "high", "urgent"].includes(priority)
    ) {
      throw new Error("Invalid assignment priority.");
    }

    const due = new Date(dueDate + "T23:59:59");

    if (Number.isNaN(due.getTime())) {
      throw new Error("Invalid assignment deadline.");
    }

    const data = await Director.rpc(
      "director_create_assignment",
      {
        p_department: department,
        p_title: title,
        p_description: description,
        p_assignee_id: assignee,
        p_due_date: dueDate,
        p_priority: priority
      }
    );

    notify("Department assignment created.", "success");

    await Director.getAssignments(department);

    return data;
  };

  Director.updateAssignment = async function (
    assignmentId,
    updates,
    department
  ) {
    const selected = requireDepartment(
      department || state.activeDepartment
    );

    const id = clean(assignmentId, 100);

    if (!id) {
      throw new Error("Assignment ID is required.");
    }

    const values = updates || {};

    const allowed = {};

    if (values.title !== undefined) {
      allowed.title = clean(values.title, 200);
    }

    if (values.description !== undefined) {
      allowed.description = clean(
        values.description,
        2000
      );
    }

    if (values.priority !== undefined) {
      const priority = clean(
        values.priority
      ).toLowerCase();

      if (
        !["low", "medium", "high", "urgent"].includes(priority)
      ) {
        throw new Error("Invalid priority.");
      }

      allowed.priority = priority;
    }

    if (values.status !== undefined) {
      const status = clean(
        values.status
      ).toLowerCase();

      if (
        !["pending", "in_progress", "completed", "cancelled"].includes(status)
      ) {
        throw new Error("Invalid assignment status.");
      }

      allowed.status = status;
    }

    if (!Object.keys(allowed).length) {
      throw new Error("No valid changes supplied.");
    }

    await Director.rpc(
      "director_update_assignment",
      {
        p_assignment_id: id,
        p_department: selected,
        p_updates: allowed
      }
    );

    notify("Assignment updated.", "success");

    await Director.getAssignments(selected);

    return true;
  };

  Director.reassignAssignment = async function (
    assignmentId,
    newAssigneeId,
    department
  ) {
    const selected = requireDepartment(
      department || state.activeDepartment
    );

    const id = clean(assignmentId, 100);
    const assignee = clean(newAssigneeId, 100);

    if (!id || !assignee) {
      throw new Error(
        "Assignment and Moderator IDs are required."
      );
    }

    await Director.rpc(
      "director_reassign_assignment",
      {
        p_assignment_id: id,
        p_assignee_id: assignee,
        p_department: selected
      }
    );

    notify("Assignment reassigned.", "success");

    await Director.getAssignments(selected);

    return true;
  };

  Director.renderAssignments = function (assignments) {
    const container = document.querySelector(
      "[data-director-assignments]"
    );

    if (!container) return;

    container.replaceChildren();

    if (!assignments.length) {
      const empty = document.createElement("p");
      empty.textContent =
        "No assignments have been created for this department.";
      container.appendChild(empty);
      return;
    }

    assignments.forEach(function (assignment) {
      const card = document.createElement("article");
      card.className = "director-assignment-card";

      const title = document.createElement("h3");
      title.textContent = clean(assignment.title, 200);

      const description = document.createElement("p");
      description.textContent =
        clean(assignment.description, 1000);

      const status = document.createElement("span");
      status.textContent =
        clean(assignment.status, 40);

      const deadline = document.createElement("time");
      deadline.textContent =
        "Due: " + formatDate(assignment.due_date);

      card.append(title, description, status, deadline);
      container.appendChild(card);
    });
  };

  /* ---------------------------------------------------------
     ACTIVITIES
  --------------------------------------------------------- */

  Director.getActivities = async function (department) {
    const selected = requireDepartment(
      department || state.activeDepartment
    );

    const data = await Director.rpc(
      "director_get_activities",
      {
        p_department: selected
      }
    );

    state.activities = safeArray(data);

    Director.renderSimpleList(
      "[data-director-activities]",
      state.activities,
      "No activities available."
    );

    return state.activities;
  };

  /* ---------------------------------------------------------
     COMPETITIONS
  --------------------------------------------------------- */

  Director.getCompetitions = async function (department) {
    const selected = requireDepartment(
      department || state.activeDepartment
    );

    const data = await Director.rpc(
      "director_get_competitions",
      {
        p_department: selected
      }
    );

    state.competitions = safeArray(data);

    Director.renderSimpleList(
      "[data-director-competitions]",
      state.competitions,
      "No competitions available."
    );

    return state.competitions;
  };

  /* ---------------------------------------------------------
     REPORTS
  --------------------------------------------------------- */

  Director.getReports = async function (department) {
    const selected = requireDepartment(
      department || state.activeDepartment
    );

    const data = await Director.rpc(
      "director_get_reports",
      {
        p_department: selected
      }
    );

    state.reports = safeArray(data);

    Director.renderSimpleList(
      "[data-director-reports]",
      state.reports,
      "No department reports available."
    );

    return state.reports;
  };

  /* ---------------------------------------------------------
     ANALYTICS
  --------------------------------------------------------- */

  Director.getAnalytics = async function (department) {
    const selected = requireDepartment(
      department || state.activeDepartment
    );

    const data = await Director.rpc(
      "director_get_analytics",
      {
        p_department: selected
      }
    );

    state.analytics = data || {};

    Director.renderAnalytics(state.analytics);

    return state.analytics;
  };

  Director.renderAnalytics = function (analytics) {
    const data = analytics || {};

    Object.keys(data).forEach(function (key) {
      document.querySelectorAll(
        '[data-director-stat="' + key + '"]'
      ).forEach(function (element) {
        const value = data[key];

        element.textContent =
          value === null || value === undefined
            ? "—"
            : String(value);
      });
    });
  };

  /* ---------------------------------------------------------
     GENERAL LIST RENDERING
  --------------------------------------------------------- */

  Director.renderSimpleList = function (
    se