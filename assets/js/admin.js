
/* =========================================================
   LENS CIRCLE — ADMIN MODULE
   File: assets/js/admin.js

   PURPOSE
   Central Admin portal operations.

   EXPECTED BACKEND RPC CONTRACTS
   - admin_get_overview
   - admin_get_members
   - admin_update_member_status
   - admin_get_staff
   - admin_appoint_director
   - admin_remove_director
   - admin_assign_director_departments
   - admin_appoint_moderator
   - admin_remove_moderator
   - admin_reassign_moderator
   - admin_get_platform_settings
   - admin_update_platform_setting
   - admin_get_platform_activity

   IMPORTANT
   These RPC functions must be created in Supabase.
   Their names and parameters must match this module.

   SECURITY
   - Every operation requires backend Admin verification.
   - The backend must derive the actor from auth.uid().
   - Never trust browser-provided actor IDs or roles.
   - Never expose the Supabase service-role key.
   - Every administrative mutation must be audited.
   ========================================================= */

(function (window, document) {
  "use strict";

  const LC = window.LensCircle = window.LensCircle || {};
  const Admin = {};

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

  const MEMBER_STATUSES = Object.freeze([
    "active",
    "suspended",
    "pending"
  ]);

  const state = {
    authorised: false,
    initialising: false,
    overview: null,
    members: [],
    staff: [],
    settings: [],
    activity: [],
    currentMemberPage: 1,
    memberPageSize: 25,
    memberFilters: {
      search: "",
      status: "",
      role: ""
    }
  };

  /* ---------------------------------------------------------
     HELPERS
  --------------------------------------------------------- */

  function clean(value, maxLength) {
    return String(value == null ? "" : value)
      .trim()
      .slice(0, maxLength || 500);
  }

  function validDepartment(department) {
    return DEPARTMENTS.includes(
      clean(department).toLowerCase()
    );
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

    console.info("[Lens Circle Admin]", message);
  }

  function escapeHTML(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function safeObject(value) {
    return value && typeof value === "object"
      ? value
      : {};
  }

  function setLoading(element, loading) {
    if (!element) return;

    element.disabled = Boolean(loading);
    element.setAttribute(
      "aria-busy",
      String(Boolean(loading))
    );
  }

  function renderError(container, message) {
    if (!container) return;

    container.replaceChildren();

    const error = document.createElement("p");
    error.className = "admin-error";
    error.setAttribute("role", "alert");
    error.textContent = clean(message, 500);

    container.appendChild(error);
  }

  /* ---------------------------------------------------------
     CENTRAL RPC EXECUTION
  --------------------------------------------------------- */

  Admin.rpc = async function (functionName, params) {
    if (!state.authorised) {
      throw new Error(
        "Admin access has not been verified."
      );
    }

    const db = getClient();

    const { data, error } = await db.rpc(
      functionName,
      params || {}
    );

    if (error) {
      console.error(
        "[Lens Circle Admin RPC]",
        functionName,
        error
      );

      throw error;
    }

    return data;
  };

  /* ---------------------------------------------------------
     ADMIN ACCESS VERIFICATION
  --------------------------------------------------------- */

  Admin.verifyAccess = async function () {
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

    const { data, error } = await db.rpc(
      "has_staff_role",
      {
        required_role: "admin"
      }
    );

    if (error || data !== true) {
      state.authorised = false;

      throw new Error(
        "You are not authorised to access Admin operations."
      );
    }

    state.authorised = true;

    return true;
  };

  /* ---------------------------------------------------------
     ADMIN OVERVIEW
  --------------------------------------------------------- */

  Admin.getOverview = async function () {
    const data = await Admin.rpc(
      "admin_get_overview"
    );

    state.overview = safeObject(
      Array.isArray(data) ? data[0] : data
    );

    Admin.renderOverview(state.overview);

    return state.overview;
  };

  Admin.renderOverview = function (overview) {
    const data = safeObject(overview);

    const fields = [
      "total_members",
      "active_members",
      "suspended_members",
      "total_directors",
      "total_moderators",
      "active_competitions",
      "pending_submissions",
      "published_exhibitions",
      "unresolved_reports"
    ];

    fields.forEach(function (field) {
      const value = data[field];

      document.querySelectorAll(
        '[data-admin-stat="' + field + '"]'
      ).forEach(function (element) {
        element.textContent =
          value === undefined || value === null
            ? "—"
            : new Intl.NumberFormat().format(
                Number(value) || 0
              );
      });
    });
  };

  /* ---------------------------------------------------------
     MEMBER MANAGEMENT
  --------------------------------------------------------- */

  Admin.getMembers = async function (options) {
    const settings = options || {};

    const page = Math.max(
      1,
      Number(settings.page || state.currentMemberPage)
    );

    const pageSize = Math.min(
      100,
      Math.max(
        1,
        Number(settings.pageSize || state.memberPageSize)
      )
    );

    const result = await Admin.rpc(
      "admin_get_members",
      {
        p_page: page,
        p_page_size: pageSize,
        p_search: clean(
          settings.search !== undefined
            ? settings.search
            : state.memberFilters.search,
          150
        ) || null,
        p_status: clean(
          settings.status !== undefined
            ? settings.status
            : state.memberFilters.status,
          30
        ) || null,
        p_role: clean(
          settings.role !== undefined
            ? settings.role
            : state.memberFilters.role,
          30
        ) || null
      }
    );

    const records = Array.isArray(result)
      ? result
      : safeArray(result && result.records);

    state.members = records;
    state.currentMemberPage = page;
    state.memberPageSize = pageSize;

    Admin.renderMembers(records);

    return {
      records,
      total: Number(result && result.total) || records.length,
      page,
      pageSize
    };
  };

  Admin.renderMembers = function (members) {
    const container = document.querySelector(
      "[data-admin-members]"
    );

    if (!container) return;

    container.replaceChildren();

    if (!members.length) {
      const empty = document.createElement("p");
      empty.textContent = "No members found.";
      container.appendChild(empty);
      return;
    }

    members.forEach(function (member) {
      const row = document.createElement("article");
      row.className = "admin-member-row";

      const name = document.createElement("strong");
      name.textContent =
        clean(member.full_name, 150) || "Unnamed member";

      const email = document.createElement("span");
      email.textContent =
        clean(member.email, 200);

      const status = document.createElement("span");
      status.textContent =
        clean(member.status, 30) || "Unknown";

      const role = document.createElement("span");
      role.textContent =
        clean(member.role, 30) || "Member";

      const action = document.createElement("button");
      action.type = "button";
      action.textContent =
        member.status === "suspended"
          ? "Reinstate"
          : "Suspend";

      action.addEventListener("click", function () {
        const nextStatus =
          member.status === "suspended"
            ? "active"
            : "suspended";

        Admin.updateMemberStatus(
          member.id,
          nextStatus
        ).catch(function (error) {
          notify(error.message, "error");
        });
      });

      row.append(
        name,
        email,
        role,
        status,
        action
      );

      container.appendChild(row);
    });
  };

  Admin.updateMemberStatus = async function (
    memberId,
    status,
    reason
  ) {
    const id = clean(memberId, 100);
    const nextStatus = clean(status).toLowerCase();

    if (!id) {
      throw new Error("Member ID is required.");
    }

    if (!MEMBER_STATUSES.includes(nextStatus)) {
      throw new Error("Invalid member status.");
    }

    if (
      nextStatus === "suspended" &&
      !clean(reason, 500)
    ) {
      throw new Error(
        "Provide a reason before suspending an account."
      );
    }

    const confirmed = window.confirm(
      "Change this member's status to " +
      nextStatus +
      "?"
    );

    if (!confirmed) return false;

    await Admin.rpc(
      "admin_update_member_status",
      {
        p_member_id: id,
        p_status: nextStatus,
        p_reason: clean(reason, 500) || null
      }
    );

    notify("Member status updated.", "success");

    await Admin.getMembers();

    return true;
  };

  /* ---------------------------------------------------------
     STAFF DIRECTORY
  --------------------------------------------------------- */

  Admin.getStaff = async function () {
    const data = await Admin.rpc(
      "admin_get_staff"
    );

    state.staff = safeArray(data);

    Admin.renderStaff(state.staff);

    return state.staff;
  };

  Admin.renderStaff = function (staff) {
    const container = document.querySelector(
      "[data-admin-staff]"
    );

    if (!container) return;

    container.replaceChildren();

    if (!staff.length) {
      const empty = document.createElement("p");
      empty.textContent = "No staff records available.";
      container.appendChild(empty);
      return;
    }

    staff.forEach(function (person) {
      const card = document.createElement("article");
      card.className = "admin-staff-card";

      const name = document.createElement("h3");
      name.textContent =
        clean(person.full_name, 150) || "Unnamed staff member";

      const role = document.createElement("p");
      role.textContent =
        clean(person.role, 40);

      const departments = document.createElement("p");
      const departmentNames = safeArray(
        person.departments
      ).map(function (department) {
        return DEPARTMENT_LABELS[department] ||
          clean(department, 50);
      });

      departments.textContent =
        departmentNames.join(", ") || "No department assigned";

      card.append(name, role, departments);
      container.appendChild(card);
    });
  };

  /* ---------------------------------------------------------
     DIRECTOR APPOINTMENT
  --------------------------------------------------------- */

  Admin.appointDirector = async function (userId, departments) {
    const id = clean(userId, 100);

    if (!id) {
      throw new Error("A user ID is required.");
    }

    const assignedDepartments =
      Array.isArray(departments)
        ? Array.from(new Set(
            departments.map(function (item) {
              return clean(item).toLowerCase();
            })
          ))
        : [];

    if (!assignedDepartments.length) {
      throw new Error(
        "Assign at least one department."
      );
    }

    if (
      !assignedDepartments.every(validDepartment)
    ) {
      throw new Error(
        "One or more departments are invalid."
      );
    }

    if (!window.confirm(
      "Appoint this user as a Director?"
    )) {
      return false;
    }

    await Admin.rpc(
      "admin_appoint_director",
      {
        p_user_id: id,
        p_departments: assignedDepartments
      }
    );

    notify("Director appointed successfully.", "success");

    await Admin.getStaff();

    return true;
  };

  Admin.removeDirector = async function (
    userId,
    reason
  ) {
    const id = clean(userId, 100);

    if (!id) {
      throw new Error("A user ID is required.");
    }

    if (!clean(reason, 500)) {
      throw new Error(
        "A reason is required for this action."
      );
    }

    if (!window.confirm(
      "Remove this Director's platform leadership access?"
    )) {
      return false;
    }

    await Admin.rpc(
      "admin_remove_director",
      {
        p_user_id: id,
        p_reason: clean(reason, 500)
      }
    );

    notify("Director access removed.", "success");

    await Admin.getStaff();

    return true;
  };

  Admin.assignDirectorDepartments = async function (
    userId,
    departments
  ) {
    const id = clean(userId, 100);

    const assignedDepartments =
      Array.isArray(departments)
        ? Array.from(new Set(
            departments.map(function (item) {
              return clean(item).toLowerCase();
            })
          ))
        : [];

    if (!id || !assignedDepartments.length) {
      throw new Error(
        "Director and department selections are required."
      );
    }

    if (
      !assignedDepartments.every(validDepartment)
    ) {
      throw new Error("Invalid department selection.");
    }

    if (!window.confirm(
      "Update this Director's department assignments?"
    )) {
      return false;
    }

    await Admin.rpc(
      "admin_assign_director_departments",
      {
        p_user_id: id,
        p_departments: assignedDepartments
      }
    );

    notify("Department assignments updated.", "success");

    await Admin.getStaff();

    return true;
  };

  /* ---------------------------------------------------------
     MODERATOR APPOINTMENT
  --------------------------------------------------------- */

  Admin.appointModerator = async function (
    userId,
    department
  ) {
    const id = clean(userId, 100);
    const selectedDepartment =
      clean(department).toLowerCase();

    if (!id || !validDepartment(selectedDepartment)) {
      throw new Error(
        "A valid user and department are required."
      );
    }

    if (!window.confirm(
      "Appoint this user as a department Moderator?"
    )) {
      return false;
    }

    await Admin.rpc(
      "admin_appoint_moderator",
      {
        p_user_id: id,
        p_department: selectedDepartment
      }
    );

    notify("Moderator appointed successfully.", "success");

    await Admin.getStaff();

    return true;
  };

  Admin.removeModerator = async function (
    userId,
    reason
  ) {
    const id = clean(userId, 100);

    if (!id || !clean(reason, 500)) {
      throw new Error(
        "User ID and removal reason are required."
      );
    }

    if (!window.confirm(
      "Remove this Moderator's staff access?"
    )) {
      return false;
    }

    await Admin.rpc(
      "admin_remove_moderator",
      {
        p_user_id: id,
        p_reason: clean(reason, 500)
      }
    );

    notify("Moderator access removed.", "success");

    await Admin.getStaff();

    return true;
  };

  Admin.reassignModerator = async function (
    userId,
    department
  ) {
    const id = clean(userId, 100);
    const selectedDepartment =
      clean(department).toLowerCase();

    if (!id || !validDepartment(selectedDepartment)) {
      throw new Error(
        "A valid user and department are required."
      );
    }

    if (!window.confirm(
      "Reassign this Moderator to another department?"
    )) {
      return false;
    }

    await Admin.rpc(
      "admin_reassign_moderator",
      {
        p_user_id: id,
        p_department: selectedDepartment
      }
    );

    notify("Moderator reassigned.", "success");

    await Admin.getStaff();

    return true;
  };

  /* ---------------------------------------------------------
     PLATFORM SETTINGS
  --------------------------------------------------------- */

  Admin.getSettings = async function () {
    const data = await Admin.rpc(
      "admin_get_platform_settings"
    );

    state.settings = safeArray(data);

    Admin.renderSettings(state.settings);

    return state.settings;
  };

  Admin.renderSettings = function (settings) {
    const container = document.querySelector(
      "[data-admin-settings]"
    );

    if (!container) return;

    container.replaceChildren();

    if (!settings.length) {
      const empty = document.createElement("p");
      empty.textContent = "No platform settings available.";
      container.appendChild(empty);
      return;
    }

    settings.forEach(function (setting) {
      const row = document.createElement("div");
      row.className = "admin-setting-row";

      const label = document.createElement("strong");
      label.textContent =
        clean(setting.label || setting.key, 150);

      const value = document.createElement("span");

      const displayValue =
        typeof setting.value === "object"
          ? JSON.stringify(setting.value)
          : String(setting.value ?? "");

      value.textContent = displayValue;

      row.append(label, value);
      container.appendChild(row);
    });
  };

  Admin.updateSetting = async function (
    key,
    value,
    reason
  ) {
    const settingKey = clean(key, 100);

    if (!settingKey) {
      throw new Error("Setting key is required.");
    }

    if (!clean(reason, 500)) {
      throw new Error(
        "Provide a reason for changing this setting."
      );
    }

    if (!window.confirm(
      "Save this platform setting?"
    )) {
      return false;
    }

    await Admin.rpc(
      "admin_update_platform_setting",
      {
        p_key: settingKey,
        p_value: value,
        p_reason: clean(reason, 500)
      }
    );

    notify("Platform setting updated.", "success");

    await Admin.getSettings();

    return true;
  };

  /* ---------------------------------------------------------
     PLATFORM ACTIVITY
  --------------------------------------------------------- */

  Admin.getPlatformActivity = async function (limit) {
    const safeLimit = Math.min(
      100,
      Math.max(1, Number(limit) || 25)
    );

    const data = await Admin.rpc(
      "admin_get_platform_activity",
      {
        p_limit: safeLimit
      }
    );

    state.activity = safeArray(data);

    Admin.renderPlatformActivity(state.activity);

    return state.activity;
  };

  Admin.renderPlatformActivity = function (records) {
    const container = document.querySelector(
      "[data-admin-activity]"
    );

    if (!container) return;

    container.replaceChildren();

    if (!records.length) {
      const empty = document.createElement("p");
      empty.textContent = "No recent activity.";
      container.appendChild(empty);
      