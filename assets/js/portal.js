
/* =========================================================
   LENS CIRCLE — PORTAL CONTROLLER
   File: assets/js/portal.js

   PURPOSE
   Shared portal interface and page controller.

   SUPPORTED PORTALS
   - member
   - moderator
   - director
   - admin

   SECURITY
   This module controls the frontend experience only.
   All permissions must be enforced by Supabase RLS/RPC.
   ========================================================= */

(function (window, document) {
  "use strict";

  const LC = window.LensCircle = window.LensCircle || {};
  const Portal = {};

  const state = {
    initialised: false,
    role: null,
    user: null,
    sidebarOpen: false,
    currentPage: null
  };

  const PORTALS = {
    member: {
      label: "Member",
      login: "../member/login.html",
      dashboard: "../member/dashboard.html",
      module: "member"
    },

    moderator: {
      label: "Moderator",
      login: "../moderator/login.html",
      dashboard: "../moderator/dashboard.html",
      module: "moderator"
    },

    director: {
      label: "Director",
      login: "../director/login.html",
      dashboard: "../director/dashboard.html",
      module: "director"
    },

    admin: {
      label: "Admin",
      login: "../admin/login.html",
      dashboard: "../admin/dashboard.html",
      module: "admin"
    }
  };

  /* ---------------------------------------------------------
     HELPERS
  --------------------------------------------------------- */

  function clean(value, maxLength) {
    return String(value == null ? "" : value)
      .trim()
      .slice(0, maxLength || 200);
  }

  function currentPortal() {
    const bodyRole = document.body.dataset.portal;
    const metaRole = document.querySelector(
      'meta[name="lens-circle-portal"]'
    );

    return clean(
      bodyRole ||
      (metaRole && metaRole.content) ||
      "",
      30
    ).toLowerCase();
  }

  function getClient() {
    if (LC.db) return LC.db;

    if (
      LC.supabase &&
      typeof LC.supabase.auth === "object"
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
    } else {
      console.info("[Lens Circle Portal]", message);
    }
  }

  function navigate(path) {
    window.location.assign(path);
  }

  function setText(selector, value) {
    const node = document.querySelector(selector);

    if (node) {
      node.textContent = clean(value, 250);
    }
  }

  /* ---------------------------------------------------------
     ROLE DETECTION
  --------------------------------------------------------- */

  Portal.getRole = function () {
    return state.role;
  };

  Portal.getPortalConfig = function () {
    return PORTALS[state.role] || null;
  };

  Portal.getCurrentUser = function () {
    return state.user;
  };

  /* ---------------------------------------------------------
     AUTHENTICATION
  --------------------------------------------------------- */

  Portal.getSession = async function () {
    const { data, error } = await getClient()
      .auth.getSession();

    if (error) throw error;

    return data && data.session
      ? data.session
      : null;
  };

  Portal.verifyRole = async function (role) {
    const selectedRole = clean(role, 30).toLowerCase();

    if (!Object.prototype.hasOwnProperty.call(
      PORTALS,
      selectedRole
    )) {
      throw new Error("Unknown portal role.");
    }

    const session = await Portal.getSession();

    if (!session) {
      navigate(PORTALS[selectedRole].login);
      return false;
    }

    let authorised = false;

    if (selectedRole === "member") {
      const { data, error } = await getClient()
        .rpc("get_my_member_context");

      if (error) throw error;

      const context = Array.isArray(data) ? data[0] : data;

      authorised = Boolean(
        context &&
        clean(context.role).toLowerCase() === "member"
      );

    } else {
      const { data, error } = await getClient()
        .rpc("has_staff_role", {
          required_role: selectedRole
        });

      if (error) throw error;

      authorised = data === true;
    }

    if (!authorised) {
      await getClient().auth.signOut();

      notify(
        "You are not authorised to access this portal.",
        "error"
      );

      navigate(PORTALS[selectedRole].login);

      return false;
    }

    state.role = selectedRole;
    state.user = session.user;

    return true;
  };

  /* ---------------------------------------------------------
     PORTAL INITIALISATION
  --------------------------------------------------------- */

  Portal.init = async function (options) {
    const settings = options || {};
    const role = clean(
      settings.role || currentPortal(),
      30
    ).toLowerCase();

    if (!PORTALS[role]) {
      throw new Error(
        "Add data-portal to the page body or specify a valid portal role."
      );
    }

    const allowed = await Portal.verifyRole(role);

    if (!allowed) return false;

    state.currentPage =
      clean(settings.page || document.title, 100);

    Portal.bindNavigation();
    Portal.bindSidebar();
    Portal.bindLogout();
    Portal.bindSearch();
    Portal.bindTabs();
    Portal.updateUserDetails();
    Portal.updateDate();
    Portal.updateActiveNavigation();

    state.initialised = true;

    document.documentElement.dataset.portalReady = "true";

    return true;
  };

  /* ---------------------------------------------------------
     USER DETAILS
  --------------------------------------------------------- */

  Portal.updateUserDetails = function () {
    if (!state.user) return;

    const metadata = state.user.user_metadata || {};

    const displayName =
      metadata.full_name ||
      metadata.name ||
      state.user.email ||
      "Member";

    setText("[data-portal-user-name]", displayName);
    setText("[data-portal-user-email]", state.user.email);
    setText("[data-portal-user-role]", state.role);

    const avatar = document.querySelector(
      "[data-portal-avatar]"
    );

    if (avatar) {
      const initial = clean(displayName, 1).toUpperCase();
      avatar.textContent = initial || "L";
    }
  };

  /* ---------------------------------------------------------
     DATE AND GREETING
  --------------------------------------------------------- */

  Portal.updateDate = function () {
    const now = new Date();

    setText(
      "[data-portal-date]",
      now.toLocaleDateString(undefined, {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric"
      })
    );

    let greeting = "Welcome";

    const hour = now.getHours();

    if (hour < 12) {
      greeting = "Good morning";
    } else if (hour < 17) {
      greeting = "Good afternoon";
    } else {
      greeting = "Good evening";
    }

    setText("[data-portal-greeting]", greeting);
  };

  /* ---------------------------------------------------------
     SIDEBAR
  --------------------------------------------------------- */

  Portal.openSidebar = function () {
    state.sidebarOpen = true;

    document.body.classList.add("sidebar-open");

    const sidebar = document.querySelector(
      "[data-portal-sidebar]"
    );

    if (sidebar) {
      sidebar.setAttribute("aria-hidden", "false");
    }
  };

  Portal.closeSidebar = function () {
    state.sidebarOpen = false;

    document.body.classList.remove("sidebar-open");

    const sidebar = document.querySelector(
      "[data-portal-sidebar]"
    );

    if (sidebar) {
      sidebar.setAttribute("aria-hidden", "true");
    }
  };

  Portal.bindSidebar = function () {
    const openButton = document.querySelector(
      "[data-sidebar-open]"
    );

    const closeButton = document.querySelector(
      "[data-sidebar-close]"
    );

    const overlay = document.querySelector(
      "[data-sidebar-overlay]"
    );

    if (openButton && !openButton.dataset.bound) {
      openButton.dataset.bound = "true";

      openButton.addEventListener(
        "click",
        Portal.openSidebar
      );
    }

    if (closeButton && !closeButton.dataset.bound) {
      closeButton.dataset.bound = "true";

      closeButton.addEventListener(
        "click",
        Portal.closeSidebar
      );
    }

    if (overlay && !overlay.dataset.bound) {
      overlay.dataset.bound = "true";

      overlay.addEventListener(
        "click",
        Portal.closeSidebar
      );
    }

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        Portal.closeSidebar();
      }
    });
  };

  /* ---------------------------------------------------------
     NAVIGATION
  --------------------------------------------------------- */

  Portal.updateActiveNavigation = function () {
    const currentPath = window.location.pathname;

    document.querySelectorAll(
      "[data-portal-nav] a"
    ).forEach(function (link) {
      const href = link.getAttribute("href");

      if (!href) return;

      const target = new URL(href, window.location.href);

      const active =
        target.pathname === currentPath;

      if (active) {
        link.classList.add("active");
        link.setAttribute("aria-current", "page");
      } else {
        link.classList.remove("active");
        link.removeAttribute("aria-current");
      }
    });
  };

  Portal.bindNavigation = function () {
    document.querySelectorAll(
      "[data-portal-nav] a"
    ).forEach(function (link) {
      if (link.dataset.portalBound) return;

      link.dataset.portalBound = "true";

      link.addEventListener("click", function () {
        Portal.closeSidebar();
      });
    });
  };

  /* ---------------------------------------------------------
     LOGOUT
  --------------------------------------------------------- */

  Portal.logout = async function () {
    const confirmed = window.confirm(
      "Are you sure you want to sign out?"
    );

    if (!confirmed) return false;

    const { error } = await getClient().auth.signOut();

    if (error) throw error;

    state.user = null;
    state.role = null;
    state.initialised = false;

    const config = PORTALS[currentPortal()];

    navigate(
      config ? config.login : "../member/login.html"
    );

    return true;
  };

  Portal.bindLogout = function () {
    document.querySelectorAll(
      "[data-portal-logout]"
    ).forEach(function (button) {
      if (button.dataset.bound) return;

      button.dataset.bound = "true";

      button.addEventListener("click", function () {
        Portal.logout().catch(function (error) {
          notify(error.message, "error");
        });
      });
    });
  };

  /* ---------------------------------------------------------
     SEARCH
  --------------------------------------------------------- */

  Portal.bindSearch = function () {
    const input = document.querySelector(
      "[data-portal-search]"
    );

    if (!input || input.dataset.bound) return;

    input.dataset.bound = "true";

    input.addEventListener("input", function () {
      const query = clean(input.value, 150)
        .toLowerCase();

      document.querySelectorAll(
        "[data-searchable]"
      ).forEach(function (item) {
        const content = (
          item.textContent || ""
        ).toLowerCase();

        item.hidden = !content.includes(query);
      });
    });
  };

  /* ---------------------------------------------------------
     TABS
  --------------------------------------------------------- */

  Portal.bindTabs = function () {
    const buttons = document.querySelectorAll(
      "[data-portal-tab]"
    );

    buttons.forEach(function (button) {
      if (button.dataset.bound) return;

      button.dataset.bound = "true";

      button.addEventListener("click", function () {
        const selected = button.dataset.portalTab;

        buttons.forEach(function (tab) {
          const active = tab === button;

          tab.classList.toggle("active", active);
          tab.setAttribute(
            "aria-selected",
            String(active)
          );
        });

        document.querySelectorAll(
          "[data-portal-panel]"
        ).forEach(function (panel) {
          panel.hidden =
            panel.dataset.portalPanel !== selected;
        });
      });
    });
  };

  /* ---------------------------------------------------------
     NOTIFICATION BADGE
  --------------------------------------------------------- */

  Portal.setNotificationCount = function (count) {
    const value = Math.max(
      0,
      Number(count) || 0
    );

    document.querySelectorAll(
      "[data-portal-notification-count]"
    ).forEach(function (node) {
      node.textContent = String(value);
      node.hidden = value === 0;
    });
  };

  /* ---------------------------------------------------------
     CONFIRMATION
  --------------------------------------------------------- */

  Portal.confirm = function (message) {
    return window.confirm(
      clean(message, 500) ||
      "Are you sure you want to continue?"
    );
  };

  /* ---------------------------------------------------------
     PAGE REFRESH
  --------------------------------------------------------- */

  Portal.refresh = function () {
    window.location.reload();
  };

  /* ---------------------------------------------------------
     ROLE-AWARE INTERFACE
  --------------------------------------------------------- */

  Portal.applyRoleVisibility = function () {
    if (!state.role) return;

    document.querySelectorAll(
      "[data-visible-to]"
    ).forEach(function (node) {
      const allowed = clean(
        node.dataset.visibleTo,
        200
      )
        .split(",")
        .map(function (value) {
          return value.trim().toLowerCase();
        });

      node.hidden = !allowed.includes(state.role);
    });
  };

  /* ---------------------------------------------------------
     EXPORT
  --------------------------------------------------------- */

  LC.portal = Portal;
  window.LensCirclePortal = Portal;

})(window, document);
