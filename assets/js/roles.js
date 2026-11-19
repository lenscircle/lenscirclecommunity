
/* =====================================================
   LENS CIRCLE
   Organisation Roles & Department Permissions
   File: assets/js/roles.js

   Dependencies:
   - supabase-client.js
   - auth.js

   SECURITY:
   This file is a frontend permission helper only.
   Never use it as the sole security mechanism.
   ===================================================== */

(function () {
  "use strict";

  // ----------------------------------------------------
  // 1. DEPENDENCY CHECK
  // ----------------------------------------------------

  if (
    !window.LensCircle ||
    !window.LensCircle.configured ||
    !window.LensCircleAuth
  ) {
    console.error(
      "Lens Circle Roles: Required dependencies missing."
    );
    return;
  }

  const db = window.LensCircle.db;

  const Roles = window.LensCircleRoles = {};

  // ----------------------------------------------------
  // 2. ORGANISATION HIERARCHY
  // ----------------------------------------------------

  const ROLE_DEFINITIONS = Object.freeze({
    admin: {
      label: "Administrator",
      level: 4,
      description: "Platform-wide administration",
      dashboard: "../admin/dashboard.html"
    },

    director: {
      label: "Director",
      level: 3,
      description: "Assigned department leadership",
      dashboard: "../director/dashboard.html"
    },

    moderator: {
      label: "Moderator",
      level: 2,
      description: "Community operations",
      dashboard: "../moderator/dashboard.html"
    },

    member: {
      label: "Member",
      level: 1,
      description: "Community participation",
      dashboard: "../member/dashboard.html"
    }
  });

  // ----------------------------------------------------
  // 3. DEPARTMENT DEFINITIONS
  // ----------------------------------------------------

  const DEPARTMENTS = Object.freeze({
    competition: {
      label: "Competition",
      directorRole: "director"
    },

    community: {
      label: "Community",
      directorRole: "director"
    },

    activities: {
      label: "Activities",
      directorRole: "director"
    },

    editorial: {
      label: "Editorial",
      directorRole: "director"
    },

    outreach: {
      label: "Outreach",
      directorRole: "director"
    }
  });

  // ----------------------------------------------------
  // 4. ROLE INFORMATION
  // ----------------------------------------------------

  Roles.getDefinition = function (role) {
    return ROLE_DEFINITIONS[role] || null;
  };

  Roles.getLabel = function (role) {
    return ROLE_DEFINITIONS[role]?.label || "Unknown";
  };

  Roles.getDepartments = function () {
    return Object.entries(DEPARTMENTS).map(
      function (entry) {
        return {
          id: entry[0],
          label: entry[1].label
        };
      }
    );
  };

  Roles.isValidRole = function (role) {
    return Object.prototype.hasOwnProperty.call(
      ROLE_DEFINITIONS,
      role
    );
  };

  Roles.isValidDepartment = function (department) {
    return Object.prototype.hasOwnProperty.call(
      DEPARTMENTS,
      department
    );
  };

  // ----------------------------------------------------
  // 5. GET VERIFIED ROLE
  // ----------------------------------------------------

  /*
    This checks exact role membership.
    Higher-level roles do not automatically inherit
    access to lower-level portals.
  */

  Roles.hasRole = async function (role) {
    if (!Roles.isValidRole(role)) {
      return false;
    }

    if (role === "member") {
      try {
        return await window.LensCircleAuth
          .isAuthenticated();
      } catch (error) {
        return false;
      }
    }

    try {
      return await window.LensCircleAuth.hasRole(role);
    } catch (error) {
      console.error(error);
      return false;
    }
  };

  // ----------------------------------------------------
  // 6. GET CURRENT DIRECTOR DEPARTMENTS
  // ----------------------------------------------------

  Roles.getMyDepartments = async function () {
    const authorised =
      await window.LensCircleAuth.hasRole("director");

    if (!authorised) {
      throw new Error(
        "Director authorisation required."
      );
    }

    const { data, error } = await db.rpc(
      "get_my_director_departments"
    );

    if (error) {
      console.error(
        "Unable to retrieve assigned departments:",
        error
      );

      throw error;
    }

    if (!Array.isArray(data)) {
      return [];
    }

    return data.filter(function (department) {
      return Roles.isValidDepartment(department);
    });
  };

  // ----------------------------------------------------
  // 7. CHECK DIRECTOR DEPARTMENT ACCESS
  // ----------------------------------------------------

  Roles.hasDepartmentAccess = async function (
    department
  ) {
    if (!Roles.isValidDepartment(department)) {
      return false;
    }

    try {
      const departments =
        await Roles.getMyDepartments();

      return departments.includes(department);
    } catch (error) {
      return false;
    }
  };

  // ----------------------------------------------------
  // 8. CHECK CURRENT USER'S PORTAL
  // ----------------------------------------------------

  Roles.getCurrentPortal = async function () {
    const user =
      await window.LensCircleAuth.getUser();

    if (!user) {
      return null;
    }

    const staffRoles = [
      "admin",
      "director",
      "moderator"
    ];

    for (const role of staffRoles) {
      if (await Roles.hasRole(role)) {
        return {
          role: role,
          label: Roles.getLabel(role),
          dashboard:
            ROLE_DEFINITIONS[role].dashboard
        };
      }
    }

    return {
      role: "member",
      label: Roles.getLabel("member"),
      dashboard:
        ROLE_DEFINITIONS.member.dashboard
    };
  };

  // ----------------------------------------------------
  // 9. DEPARTMENT DISPLAY HELPERS
  // ----------------------------------------------------

  Roles.getDepartmentLabel = function (department) {
    return DEPARTMENTS[department]?.label || "Unknown";
  };

  Roles.formatDepartments = function (departments) {
    if (!Array.isArray(departments)) {
      return [];
    }

    return departments
      .filter(Roles.isValidDepartment)
      .map(function (department) {
        return {
          id: department,
          label: Roles.getDepartmentLabel(department)
        };
      });
  };

  // ----------------------------------------------------
  // 10. DISPLAY ACCESSIBLE DEPARTMENT ELEMENTS
  // ----------------------------------------------------

  Roles.applyDepartmentVisibility = async function () {
    const elements = Array.from(
      document.querySelectorAll(
        "[data-lc-department]"
      )
    );

    if (!elements.length) {
      return;
    }

    let departments = [];

    try {
      departments = await Roles.getMyDepartments();
    } catch (error) {
      console.error(error);
    }

    elements.forEach(function (element) {
      const department =
        element.dataset.lcDepartment;

      element.hidden =
        !departments.includes(department);
    });
  };

  // ----------------------------------------------------
  // 11. ROLE-BASED UI VISIBILITY
  // ----------------------------------------------------

  Roles.applyRoleVisibility = async function () {
    const elements = Array.from(
      document.querySelectorAll("[data-lc-role]")
    );

    if (!elements.length) {
      return;
    }

    const roles = [
      "admin",
      "director",
      "moderator",
      "member"
    ];

    const authorisedRoles = [];

    for (const role of roles) {
      if (await Roles.hasRole(role)) {
        authorisedRoles.push(role);
      }
    }

    elements.forEach(function (element) {
      const requiredRoles =
        element.dataset.lcRole
          .split(",")
          .map(function (role) {
            return role.trim();
          });

      element.hidden = !requiredRoles.some(
        function (role) {
          return authorisedRoles.includes(role);
        }
      );
    });
  };

  // ----------------------------------------------------
  // 12. FRONTEND ROLE CONSTANTS
  // ----------------------------------------------------

  Roles.roles = ROLE_DEFINITIONS;
  Roles.departments = DEPARTMENTS;

  // ----------------------------------------------------
  // 13. INITIALISATION
  // ----------------------------------------------------

  console.info(
    "Lens Circle: Organisation role utilities loaded."
  );

})();
