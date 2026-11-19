
/* =========================================================
   LENS CIRCLE — PERMISSIONS MODULE
   File: assets/js/permissions.js

   PURPOSE
   Central frontend permission definitions and checks.

   IMPORTANT SECURITY RULE
   This module controls UI visibility and provides a convenient
   permission interface. It is NOT an authorisation boundary.

   Supabase PostgreSQL RLS and protected RPC functions must
   independently enforce every permission.

   NEVER:
   - Trust a role supplied by a form or URL.
   - Allow members to assign their own roles.
   - Allow Directors to manage other departments.
   - Allow Moderators to appoint staff.
   - Put a service-role key in browser code.
   ========================================================= */

(function (window, document) {
  "use strict";

  const LC = window.LensCircle = window.LensCircle || {};
  const Permissions = {};

  /* ---------------------------------------------------------
     ROLE DEFINITIONS
  --------------------------------------------------------- */

  const ROLES = Object.freeze({
    ADMIN: "admin",
    DIRECTOR: "director",
    MODERATOR: "moderator",
    MEMBER: "member"
  });

  const ROLE_LEVEL = Object.freeze({
    admin: 4,
    director: 3,
    moderator: 2,
    member: 1
  });

  /* ---------------------------------------------------------
     DEPARTMENT DEFINITIONS
  --------------------------------------------------------- */

  const DEPARTMENTS = Object.freeze({
    COMPETITION: "competition",
    COMMUNITY: "community",
    ACTIVITIES: "activities",
    EDITORIAL: "editorial",
    OUTREACH: "outreach"
  });

  const DEPARTMENT_LABELS = Object.freeze({
    competition: "Competition",
    community: "Community",
    activities: "Activities",
    editorial: "Editorial",
    outreach: "Outreach"
  });

  /* ---------------------------------------------------------
     PERMISSION DEFINITIONS
  --------------------------------------------------------- */

  const PERMISSIONS = Object.freeze({

    /* Member permissions */
    VIEW_PUBLIC_CONTENT: "view_public_content",
    MANAGE_OWN_PROFILE: "manage_own_profile",
    SUBMIT_PHOTOGRAPHS: "submit_photographs",
    ENTER_COMPETITIONS: "enter_competitions",
    PARTICIPATE_IN_ACTIVITIES: "participate_in_activities",
    MANAGE_OWN_BOOKMARKS: "manage_own_bookmarks",
    MANAGE_OWN_SETTINGS: "manage_own_settings",
    VIEW_OWN_NOTIFICATIONS: "view_own_notifications",

    /* Moderator permissions */
    REVIEW_SUBMISSIONS: "review_submissions",
    HANDLE_COMMUNITY_REPORTS: "handle_community_reports",
    MODERATE_COMMUNITY: "moderate_community",
    MANAGE_ASSIGNED_ACTIVITIES: "manage_assigned_activities",
    UPDATE_ASSIGNED_TASKS: "update_assigned_tasks",
    VIEW_ASSIGNED_MEMBERS: "view_assigned_members",

    /* Director permissions */
    MANAGE_DEPARTMENT_TEAM: "manage_department_team",
    APPOINT_DEPARTMENT_MODERATORS: "appoint_department_moderators",
    REMOVE_DEPARTMENT_MODERATORS: "remove_department_moderators",
    CREATE_DEPARTMENT_TASKS: "create_department_tasks",
    ASSIGN_DEPARTMENT_TASKS: "assign_department_tasks",
    VIEW_DEPARTMENT_REPORTS: "view_department_reports",
    VIEW_DEPARTMENT_ANALYTICS: "view_department_analytics",
    OVERSEE_DEPARTMENT_OPERATIONS: "oversee_department_operations",

    /* Admin permissions */
    MANAGE_ALL_MEMBERS: "manage_all_members",
    MANAGE_ALL_MODERATORS: "manage_all_moderators",
    MANAGE_ALL_DIRECTORS: "manage_all_directors",
    ASSIGN_DIRECTOR_DEPARTMENTS: "assign_director_departments",
    MANAGE_ALL_DEPARTMENTS: "manage_all_departments",
    MANAGE_PLATFORM_SETTINGS: "manage_platform_settings",
    VIEW_PLATFORM_ANALYTICS: "view_platform_analytics",
    VIEW_PLATFORM_AUDIT_LOG: "view_platform_audit_log",
    MANAGE_SECURITY_SETTINGS: "manage_security_settings",
    MANAGE_PARTNERSHIPS: "manage_partnerships",
    MANAGE_PLATFORM_CONTENT: "manage_platform_content"
  });

  /* ---------------------------------------------------------
     ROLE PERMISSION MAP
  --------------------------------------------------------- */

  const ROLE_PERMISSIONS = Object.freeze({

    member: [
      PERMISSIONS.VIEW_PUBLIC_CONTENT,
      PERMISSIONS.MANAGE_OWN_PROFILE,
      PERMISSIONS.SUBMIT_PHOTOGRAPHS,
      PERMISSIONS.ENTER_COMPETITIONS,
      PERMISSIONS.PARTICIPATE_IN_ACTIVITIES,
      PERMISSIONS.MANAGE_OWN_BOOKMARKS,
      PERMISSIONS.MANAGE_OWN_SETTINGS,
      PERMISSIONS.VIEW_OWN_NOTIFICATIONS
    ],

    moderator: [
      PERMISSIONS.VIEW_PUBLIC_CONTENT,
      PERMISSIONS.MANAGE_OWN_PROFILE,
      PERMISSIONS.SUBMIT_PHOTOGRAPHS,
      PERMISSIONS.ENTER_COMPETITIONS,
      PERMISSIONS.PARTICIPATE_IN_ACTIVITIES,
      PERMISSIONS.MANAGE_OWN_BOOKMARKS,
      PERMISSIONS.MANAGE_OWN_SETTINGS,
      PERMISSIONS.VIEW_OWN_NOTIFICATIONS,
      PERMISSIONS.REVIEW_SUBMISSIONS,
      PERMISSIONS.HANDLE_COMMUNITY_REPORTS,
      PERMISSIONS.MODERATE_COMMUNITY,
      PERMISSIONS.MANAGE_ASSIGNED_ACTIVITIES,
      PERMISSIONS.UPDATE_ASSIGNED_TASKS,
      PERMISSIONS.VIEW_ASSIGNED_MEMBERS
    ],

    director: [
      PERMISSIONS.VIEW_PUBLIC_CONTENT,
      PERMISSIONS.MANAGE_OWN_PROFILE,
      PERMISSIONS.SUBMIT_PHOTOGRAPHS,
      PERMISSIONS.ENTER_COMPETITIONS,
      PERMISSIONS.PARTICIPATE_IN_ACTIVITIES,
      PERMISSIONS.MANAGE_OWN_BOOKMARKS,
      PERMISSIONS.MANAGE_OWN_SETTINGS,
      PERMISSIONS.VIEW_OWN_NOTIFICATIONS,
      PERMISSIONS.REVIEW_SUBMISSIONS,
      PERMISSIONS.HANDLE_COMMUNITY_REPORTS,
      PERMISSIONS.MODERATE_COMMUNITY,
      PERMISSIONS.MANAGE_ASSIGNED_ACTIVITIES,
      PERMISSIONS.UPDATE_ASSIGNED_TASKS,
      PERMISSIONS.VIEW_ASSIGNED_MEMBERS,
      PERMISSIONS.MANAGE_DEPARTMENT_TEAM,
      PERMISSIONS.APPOINT_DEPARTMENT_MODERATORS,
      PERMISSIONS.REMOVE_DEPARTMENT_MODERATORS,
      PERMISSIONS.CREATE_DEPARTMENT_TASKS,
      PERMISSIONS.ASSIGN_DEPARTMENT_TASKS,
      PERMISSIONS.VIEW_DEPARTMENT_REPORTS,
      PERMISSIONS.VIEW_DEPARTMENT_ANALYTICS,
      PERMISSIONS.OVERSEE_DEPARTMENT_OPERATIONS
    ],

    admin: Object.values(PERMISSIONS)
  });

  /* ---------------------------------------------------------
     CURRENT SESSION STATE
  --------------------------------------------------------- */

  const state = {
    userId: null,
    role: null,
    departments: [],
    loaded: false,
    loading: false
  };

  /* ---------------------------------------------------------
     BASIC HELPERS
  --------------------------------------------------------- */

  function clean(value) {
    return String(value == null ? "" : value)
      .trim()
      .toLowerCase();
  }

  function unique(values) {
    return Array.from(new Set(values));
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

  function isValidRole(role) {
    return Object.prototype.hasOwnProperty.call(
      ROLE_LEVEL,
      role
    );
  }

  function isValidDepartment(department) {
    return Object.values(DEPARTMENTS).includes(
      clean(department)
    );
  }

  /* ---------------------------------------------------------
     LOAD TRUSTED SESSION ROLE
  --------------------------------------------------------- */

  Permissions.load = async function (forceRefresh) {
    if (state.loading) return Permissions.getState();

    if (state.loaded && !forceRefresh) {
      return Permissions.getState();
    }

    state.loading = true;

    try {
      const db = getClient();

      const {
        data: sessionData,
        error: sessionError
      } = await db.auth.getSession();

      if (sessionError) throw sessionError;

      const session =
        sessionData && sessionData.session;

      if (!session || !session.user) {
        Permissions.reset();

        return Permissions.getState();
      }

      state.userId = session.user.id;

      /*
       * This RPC must derive the caller from auth.uid().
       * It must return the role from protected database records.
       * It must not accept a browser-supplied user ID or role.
       */
      const { data, error } = await db.rpc(
        "get_my_access_context"
      );

      if (error) throw error;

      const context = Array.isArray(data)
        ? data[0]
        : data;

      const role = clean(context && context.role);

      if (!isValidRole(role)) {
        throw new Error(
          "No valid authorised platform role was returned."
        );
      }

      const departments = Array.isArray(
        context.departments
      )
        ? context.departments
            .map(clean)
            .filter(isValidDepartment)
        : [];

      state.role = role;
      state.departments = unique(departments);
      state.loaded = true;

      Permissions.applyVisibility();

      return Permissions.getState();

    } catch (error) {
      console.error(
        "[Lens Circle Permissions]",
        error
      );

      /*
       * Fail closed: an unavailable role context never
       * becomes an unrestricted access grant.
       */
      Permissions.reset();

      throw error;

    } finally {
      state.loading = false;
    }
  };

  /* ---------------------------------------------------------
     RESET SESSION CONTEXT
  --------------------------------------------------------- */

  Permissions.reset = function () {
    state.userId = null;
    state.role = null;
    state.departments = [];
    state.loaded = false;

    Permissions.applyVisibility();
  };

  /* ---------------------------------------------------------
     ROLE CHECKS
  --------------------------------------------------------- */

  Permissions.getRole = function () {
    return state.role;
  };

  Permissions.hasRole = function (role) {
    return (
      state.loaded &&
      state.role === clean(role)
    );
  };

  Permissions.hasMinimumRole = function (role) {
    if (!state.loaded || !isValidRole(clean(role))) {
      return false;
    }

    return (
      ROLE_LEVEL[state.role] >=
      ROLE_LEVEL[clean(role)]
    );
  };

  Permissions.isAdmin = function () {
    return Permissions.hasRole(ROLES.ADMIN);
  };

  Permissions.isDirector = function () {
    return Permissions.hasRole(ROLES.DIRECTOR);
  };

  Permissions.isModerator = function () {
    return Permissions.hasRole(ROLES.MODERATOR);
  };

  Permissions.isMember = function () {
    return Permissions.hasRole(ROLES.MEMBER);
  };

  /* ---------------------------------------------------------
     DEPARTMENT ACCESS
  --------------------------------------------------------- */

  Permissions.getDepartments = function () {
    return state.departments.slice();
  };

  Permissions.hasDepartment = function (department) {
    if (!state.loaded) return false;

    if (state.role === ROLES.ADMIN) {
      return true;
    }

    return state.departments.includes(
      clean(department)
    );
  };

  Permissions.canAccessDepartment = function (department) {
    return (
      state.loaded &&
      isValidDepartment(department) &&
      (
        state.role === ROLES.ADMIN ||
        (
          state.role === ROLES.DIRECTOR &&
          state.departments.includes(clean(department))
        )
      )
    );
  };

  /* ---------------------------------------------------------
     PERMISSION CHECKS
  --------------------------------------------------------- */

  Permissions.can = function (
    permission,
    department
  ) {
    if (!state.loaded) return false;

    const requested = clean(permission);

    const rolePermissions =
      ROLE_PERMISSIONS[state.role] || [];

    if (!rolePermissions.includes(requested)) {
      return false;
    }

    /*
     * Department-specific operations require an
     * authorised department for Directors.
     */
    if (
      department &&
      state.role === ROLES.DIRECTOR
    ) {
      return Permissions.hasDepartment(department);
    }

    return true;
  };

  Permissions.canAny = function (permissions) {
    if (!Array.isArray(permissions)) return false;

    return permissions.some(function (permission) {
      return Permissions.can(permission);
    });
  };

  Permissions.canAll = function (permissions) {
    if (!Array.isArray(permissions)) return false;

    return permissions.every(function (permission) {
      return Permissions.can(permission);
    });
  };

  /* ---------------------------------------------------------
     STAFF MANAGEMENT RULES
  --------------------------------------------------------- */

  Permissions.canAppointModerator = function (
    department
  ) {
    if (!state.loaded) return false;

    if (state.role === ROLES.ADMIN) {
      return isValidDepartment(department);
    }

    if (state.role !== ROLES.DIRECTOR) {
      return false;
    }

    return (
      Permissions.can(
        PERMISSIONS.APPOINT_DEPARTMENT_MODERATORS,
        department
      )
    );
  };

  Permissions.canRemoveModerator = function (
    department
  ) {
    if (!state.loaded) return false;

    if (state.role === ROLES.ADMIN) {
      return isValidDepartment(department);
    }

    if (state.role !== ROLES.DIRECTOR) {
      return false;
    }

    return (
      Permissions.can(
        PERMISSIONS.REMOVE_DEPARTMENT_MODERATORS,
        department
      )
    );
  };

  Permissions.canManageDirector = function () {
    return Permissions.isAdmin();
  };

  Permissions.canAssignDirectorDepartment = function () {
    return Permissions.isAdmin();
  };

  Permissions.canManagePlatformSettings = function () {
    return Permissions.isAdmin();
  };

  Permissions.canManageModeratorGlobally = function () {
    return Permissions.isAdmin();
  };

  Permissions.canManageAnotherDepartment = function () {
    return false;
  };

  /* ---------------------------------------------------------
     UI VISIBILITY
  --------------------------------------------------------- */

  Permissions.applyVisibility = function () {
    document.querySelectorAll(
      "[data-permission]"
    ).forEach(function (element) {
      const permission =
        element.dataset.permission;

      const department =
        element.dataset.department || null;

      const allowed = Permissions.can(
        permission,
        department
      );

      element.hidden = !allowed;
      element.setAttribute(
        "aria-hidden",
        String(!allowed)
      );
    });

    document.querySelectorAll(
      "[data-role-only]"
    ).forEach(function (element) {
      const allowedRoles =
        element.dataset.roleOnly
          .split(",")
          .map(clean);

      const allowed =
        state.loaded &&
        allowedRoles.includes(state.role);

      element.hidden = !allowed;
      element.setAttribute(
        "aria-hidden",
        String(!allowed)
      );
    });

    document.querySelectorAll(
      "[data-department-only]"
    ).forEach(function (element) {
      const department =
        element.dataset.departmentOnly;

      const allowed =
        state.loaded &&
        Permissions.hasDepartment(department);

      element.hidden = !allowed;
      element.setAttribute(
        "aria-hidden",
        String(!allowed)
      );
    });
  };

  /* ---------------------------------------------------------
     ROLE / DEPARTMENT LABELS
  --------------------------------------------------------- */

  Permissions.getRoleLabel = function (role) {
    const labels = {
      admin: "Administrator",
      director: "Director",
      moderator: "Moderator",
      member: "Member"
    };

    return labels[clean(role)] || "Unknown role";
  };

  Permissions.getDepartmentLabel = function (
    department
  ) {
    return (
      DEPARTMENT_LABELS[clean(department)] ||
      "Unknown department"
    );
  };

  Permissions.getDepartmentOptions = function () {
    return Object.values(DEPARTMENTS).map(
      function (department) {
        return {
          value: department,
          label: DEPARTMENT_LABELS[department]
        };
      }
    );
  };

  /* ---------------------------------------------------------
     STATE
  --------------------------------------------------------- */

  Permissions.getState = function () {
    return {
      userId: state.userId,
      role: state.role,
      roleLabel: Permissions.getRoleLabel(state.role),
      departments: state.departments.slice(),
      loaded: state.loaded,
      loading: state.loading
    };
  };

  /* ---------------------------------------------------------
     CONSTANTS
  --------------------------------------------------------- */

  Permissions.ROLES = ROLES;
  Permissions.DEPARTMENTS = DEPARTMENTS;
  Permissions.PERMISSIONS = PERMISSIONS;

  /* ---------------------------------------------------------
     EXPORT
  --------------------------------------------------------- */

  LC.permissions = Permissions;
  window.LensCirclePermissions = Permissions;

})(window, document);
