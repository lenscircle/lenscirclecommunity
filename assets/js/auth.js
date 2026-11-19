
/* =====================================================
   LENS CIRCLE
   Central Authentication & Portal Access Control
   File: assets/js/auth.js

   Depends on:
   assets/js/supabase-client.js

   IMPORTANT:
   This frontend layer improves navigation and access
   handling. Database RLS and protected RPC functions
   remain the actual security boundary.
   ===================================================== */

(function () {
  "use strict";

  // ----------------------------------------------------
  // 1. DEPENDENCY CHECK
  // ----------------------------------------------------

  if (!window.LensCircle || !window.LensCircle.configured) {
    console.error(
      "Lens Circle Auth: Supabase client is unavailable."
    );
    return;
  }

  const db = window.LensCircle.db;

  const Auth = window.LensCircleAuth = {};

  // ----------------------------------------------------
  // 2. PORTAL CONFIGURATION
  // ----------------------------------------------------

  const PORTALS = Object.freeze({
    member: {
      role: null,
      login: "../member/login.html",
      dashboard: "../member/dashboard.html"
    },

    moderator: {
      role: "moderator",
      login: "login.html",
      dashboard: "dashboard.html"
    },

    director: {
      role: "director",
      login: "login.html",
      dashboard: "dashboard.html"
    },

    admin: {
      role: "admin",
      login: "login.html",
      dashboard: "dashboard.html"
    }
  });

  // ----------------------------------------------------
  // 3. URL HELPERS
  // ----------------------------------------------------

  function resolvePath(path) {
    return new URL(
      path,
      window.location.href
    ).href;
  }

  function redirect(path) {
    window.location.replace(resolvePath(path));
  }

  // ----------------------------------------------------
  // 4. GET CURRENT SESSION
  // ----------------------------------------------------

  Auth.getSession = async function () {
    const { data, error } = await db.auth.getSession();

    if (error) {
      throw error;
    }

    return data.session;
  };

  // ----------------------------------------------------
  // 5. GET VERIFIED USER
  // ----------------------------------------------------

  Auth.getUser = async function () {
    const { data, error } = await db.auth.getUser();

    if (error) {
      throw error;
    }

    return data.user;
  };

  // ----------------------------------------------------
  // 6. CHECK STAFF ROLE
  // ----------------------------------------------------

  Auth.hasRole = async function (role) {
    const allowedRoles = [
      "admin",
      "director",
      "moderator"
    ];

    if (!allowedRoles.includes(role)) {
      throw new Error("Invalid role.");
    }

    const session = await Auth.getSession();

    if (!session) {
      return false;
    }

    const { data, error } = await db.rpc(
      "has_staff_role",
      {
        required_role: role
      }
    );

    if (error) {
      console.error(
        "Lens Circle role verification failed:",
        error
      );

      return false;
    }

    return data === true;
  };

  // ----------------------------------------------------
  // 7. MEMBER ACCESS GUARD
  // ----------------------------------------------------

  Auth.requireMember = async function (options) {
    options = options || {};

    const loginPath =
      options.loginPath || "../member/login.html";

    try {
      const session = await Auth.getSession();

      if (!session) {
        redirect(loginPath);
        return null;
      }

      const user = await Auth.getUser();

      if (!user) {
        redirect(loginPath);
        return null;
      }

      return {
        session: session,
        user: user
      };

    } catch (error) {
      console.error(
        "Member authentication error:",
        error
      );

      redirect(loginPath);
      return null;
    }
  };

  // ----------------------------------------------------
  // 8. STAFF ACCESS GUARD
  // ----------------------------------------------------

  Auth.requireStaff = async function (role, options) {
    options = options || {};

    const config = PORTALS[role];

    if (!config || !config.role) {
      console.error("Invalid staff portal role.");
      return null;
    }

    const loginPath =
      options.loginPath || config.login;

    try {
      const session = await Auth.getSession();

      if (!session) {
        redirect(loginPath);
        return null;
      }

      const user = await Auth.getUser();

      if (!user) {
        redirect(loginPath);
        return null;
      }

      const authorised = await Auth.hasRole(role);

      if (!authorised) {
        await db.auth.signOut();
        redirect(loginPath);
        return null;
      }

      return {
        session: session,
        user: user,
        role: role
      };

    } catch (error) {
      console.error(
        "Staff authentication failed:",
        error
      );

      try {
        await db.auth.signOut();
      } catch (signOutError) {
        console.error(
          "Sign-out failed:",
          signOutError
        );
      }

      redirect(loginPath);
      return null;
    }
  };

  // ----------------------------------------------------
  // 9. DIRECTOR DEPARTMENT INFORMATION
  // ----------------------------------------------------

  /*
    Department assignments must come from a protected
    database function, not user-editable metadata.

    Planned RPC:
      get_my_director_departments

    Expected response:
      ["competition", "community"]

    Implement this RPC in Supabase before using it.
  */

  Auth.getDirectorDepartments = async function () {
    const authorised = await Auth.hasRole("director");

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
        "Unable to retrieve Director departments:",
        error
      );

      throw error;
    }

    return Array.isArray(data) ? data : [];
  };

  // ----------------------------------------------------
  // 10. DEPARTMENT PERMISSION CHECK
  // ----------------------------------------------------

  Auth.hasDepartmentAccess = async function (
    department
  ) {
    if (!department) {
      return false;
    }

    try {
      const departments =
        await Auth.getDirectorDepartments();

      return departments.includes(department);

    } catch (error) {
      console.error(
        "Department access verification failed:",
        error
      );

      return false;
    }
  };

  // ----------------------------------------------------
  // 11. PORTAL LOGOUT
  // ----------------------------------------------------

  Auth.signOut = async function (redirectPath) {
    const { error } = await db.auth.signOut();

    if (error) {
      throw error;
    }

    if (redirectPath) {
      redirect(redirectPath);
    }
  };

  // ----------------------------------------------------
  // 12. AUTHENTICATION STATE LISTENER
  // ----------------------------------------------------

  Auth.onAuthStateChange = function (callback) {
    return db.auth.onAuthStateChange(
      function (event, session) {
        if (typeof callback === "function") {
          callback(event, session);
        }
      }
    );
  };

  // ----------------------------------------------------
  // 13. CURRENT USER DISPLAY INFORMATION
  // ----------------------------------------------------

  Auth.getDisplayName = function (user) {
    if (!user) {
      return "Member";
    }

    return (
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.email?.split("@")[0] ||
      "Member"
    );
  };

  Auth.getInitials = function (user) {
    const name = Auth.getDisplayName(user);

    return name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map(function (part) {
        return part.charAt(0).toUpperCase();
      })
      .join("");
  };

  // ----------------------------------------------------
  // 14. LOGIN REDIRECTION
  // ----------------------------------------------------

  Auth.redirectToDashboard = function (role) {
    const config = PORTALS[role];

    if (!config) {
      throw new Error("Unknown portal.");
    }

    redirect(config.dashboard);
  };

  // ----------------------------------------------------
  // 15. PUBLIC API
  // ----------------------------------------------------

  Object.freeze(Auth);

  console.info(
    "Lens Circle: Authentication utilities loaded."
  );

})();
