
/* =========================================================
   LENS CIRCLE — DASHBOARD MODULE
   File: assets/js/dashboard.js

   FEATURES
   - Shared dashboard navigation.
   - Mobile sidebar controls.
   - Active navigation highlighting.
   - Dashboard tab switching.
   - Dashboard search.
   - User information display.
   - Date and greeting display.
   - Statistic rendering.
   - Empty-state rendering.
   - Accessible menu controls.

   SECURITY
   - Does not grant roles or permissions.
   - Does not replace Supabase authentication guards.
   - All privileged data must be authorised by backend RLS/RPC.
   ========================================================= */

(function (window, document) {
  "use strict";

  const LC = window.LensCircle = window.LensCircle || {};
  const Dashboard = {};

  const config = {
    sidebarSelector: "[data-dashboard-sidebar]",
    overlaySelector: "[data-dashboard-overlay]",
    menuButtonSelector: "[data-dashboard-menu]",
    closeButtonSelector: "[data-dashboard-close]",
    navSelector: "[data-dashboard-nav]",
    tabSelector: "[data-dashboard-tab]",
    panelSelector: "[data-dashboard-panel]"
  };

  /* ---------------------------------------------------------
     HELPERS
  --------------------------------------------------------- */

  function select(selector, parent) {
    return (parent || document).querySelector(selector);
  }

  function selectAll(selector, parent) {
    return Array.from(
      (parent || document).querySelectorAll(selector)
    );
  }

  function text(element, value) {
    if (!element) return;

    element.textContent =
      value === null || value === undefined
        ? ""
        : String(value);
  }

  function currentPath() {
    return window.location.pathname
      .replace(/\/+$/, "")
      .split("/")
      .pop()
      .toLowerCase();
  }

  function safeNumber(value) {
    const number = Number(value);

    return Number.isFinite(number)
      ? number
      : 0;
  }

  /* ---------------------------------------------------------
     MOBILE SIDEBAR
  --------------------------------------------------------- */

  Dashboard.openSidebar = function () {
    const sidebar = select(config.sidebarSelector);
    const overlay = select(config.overlaySelector);
    const button = select(config.menuButtonSelector);

    if (!sidebar) return;

    sidebar.classList.add("is-open");
    sidebar.setAttribute("aria-hidden", "false");

    if (overlay) {
      overlay.classList.add("is-visible");
      overlay.hidden = false;
    }

    if (button) {
      button.setAttribute("aria-expanded", "true");
    }

    document.body.classList.add("dashboard-menu-open");
  };

  Dashboard.closeSidebar = function () {
    const sidebar = select(config.sidebarSelector);
    const overlay = select(config.overlaySelector);
    const button = select(config.menuButtonSelector);

    if (sidebar) {
      sidebar.classList.remove("is-open");
      sidebar.setAttribute("aria-hidden", "true");
    }

    if (overlay) {
      overlay.classList.remove("is-visible");
      overlay.hidden = true;
    }

    if (button) {
      button.setAttribute("aria-expanded", "false");
    }

    document.body.classList.remove("dashboard-menu-open");
  };

  Dashboard.toggleSidebar = function () {
    const sidebar = select(config.sidebarSelector);

    if (!sidebar) return;

    if (sidebar.classList.contains("is-open")) {
      Dashboard.closeSidebar();
    } else {
      Dashboard.openSidebar();
    }
  };

  Dashboard.initSidebar = function () {
    const menuButton = select(config.menuButtonSelector);
    const closeButton = select(config.closeButtonSelector);
    const overlay = select(config.overlaySelector);

    if (menuButton) {
      menuButton.addEventListener("click", function () {
        Dashboard.toggleSidebar();
      });
    }

    if (closeButton) {
      closeButton.addEventListener("click", function () {
        Dashboard.closeSidebar();
      });
    }

    if (overlay) {
      overlay.addEventListener("click", function () {
        Dashboard.closeSidebar();
      });
    }

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        Dashboard.closeSidebar();
      }
    });

    window.addEventListener("resize", function () {
      if (window.innerWidth >= 1024) {
        Dashboard.closeSidebar();
      }
    });
  };

  /* ---------------------------------------------------------
     ACTIVE NAVIGATION
  --------------------------------------------------------- */

  Dashboard.setActiveNavigation = function () {
    const current = currentPath();

    selectAll(
      config.navSelector + " a"
    ).forEach(function (link) {
      const href = link.getAttribute("href");

      if (!href) return;

      const destination = href
        .split("?")[0]
        .replace(/\/+$/, "")
        .split("/")
        .pop()
        .toLowerCase();

      const active =
        destination === current ||
        (current === "" && destination === "index.html");

      link.classList.toggle("is-active", active);

      if (active) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    });
  };

  /* ---------------------------------------------------------
     DATE AND GREETING
  --------------------------------------------------------- */

  Dashboard.renderDate = function () {
    const dateElement = select("[data-dashboard-date]");

    if (!dateElement) return;

    const now = new Date();

    dateElement.textContent = new Intl.DateTimeFormat(
      undefined,
      {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric"
      }
    ).format(now);
  };

  Dashboard.getGreeting = function () {
    const hour = new Date().getHours();

    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";

    return "Good evening";
  };

  Dashboard.renderGreeting = function () {
    const greeting = select("[data-dashboard-greeting]");

    if (!greeting) return;

    greeting.textContent = Dashboard.getGreeting();
  };

  /* ---------------------------------------------------------
     USER INFORMATION
  --------------------------------------------------------- */

  Dashboard.renderUser = function (user, profile) {
    if (!user) return;

    const details = profile || {};
    const metadata = user.user_metadata || {};

    const name =
      details.full_name ||
      details.display_name ||
      metadata.full_name ||
      metadata.name ||
      "Lens Circle Member";

    const email = user.email || "";
    const initials = name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part.charAt(0).toUpperCase())
      .join("");

    selectAll("[data-user-name]").forEach(function (element) {
      text(element, name);
    });

    selectAll("[data-user-email]").forEach(function (element) {
      text(element, email);
    });

    selectAll("[data-user-initials]").forEach(function (element) {
      text(element, initials || "LC");
    });

    selectAll("[data-user-avatar]").forEach(function (element) {
      const avatar =
        details.avatar_url ||
        metadata.avatar_url ||
        "";

      if (avatar && element.tagName === "IMG") {
        element.src = avatar;
        element.alt = name + " profile photograph";
      }
    });
  };

  /* ---------------------------------------------------------
     STATISTICS
  --------------------------------------------------------- */

  Dashboard.renderStats = function (stats) {
    if (!stats || typeof stats !== "object") return;

    Object.keys(stats).forEach(function (key) {
      const value = stats[key];

      selectAll(
        '[data-stat="' + key + '"]'
      ).forEach(function (element) {
        if (
          value === null ||
          value === undefined
        ) {
          text(element, "—");
          return;
        }

        if (typeof value === "number") {
          text(
            element,
            new Intl.NumberFormat().format(value)
          );
        } else {
          text(element, value);
        }
      });
    });
  };

  Dashboard.clearStats = function () {
    selectAll("[data-stat]").forEach(function (element) {
      text(element, "—");
    });
  };

  /* ---------------------------------------------------------
     DASHBOARD TABS
  --------------------------------------------------------- */

  Dashboard.activateTab = function (tabId) {
    const tabs = selectAll(config.tabSelector);
    const panels = selectAll(config.panelSelector);

    const exists = tabs.some(function (tab) {
      return tab.dataset.dashboardTab === tabId;
    });

    if (!exists) return false;

    tabs.forEach(function (tab) {
      const active = tab.dataset.dashboardTab === tabId;

      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", String(active));
      tab.setAttribute("tabindex", active ? "0" : "-1");
    });

    panels.forEach(function (panel) {
      const active =
        panel.dataset.dashboardPanel === tabId;

      panel.hidden = !active;
      panel.classList.toggle("is-active", active);
    });

    return true;
  };

  Dashboard.initTabs = function () {
    selectAll(config.tabSelector).forEach(function (tab) {
      tab.addEventListener("click", function () {
        Dashboard.activateTab(
          tab.dataset.dashboardTab
        );
      });

      tab.addEventListener("keydown", function (event) {
        if (
          event.key !== "ArrowRight" &&
          event.key !== "ArrowLeft"
        ) {
          return;
        }

        const tabs = selectAll(config.tabSelector);
        const index = tabs.indexOf(tab);

        const nextIndex = event.key === "ArrowRight"
          ? (index + 1) % tabs.length
          : (index - 1 + tabs.length) % tabs.length;

        const nextTab = tabs[nextIndex];

        if (nextTab) {
          nextTab.focus();

          Dashboard.activateTab(
            nextTab.dataset.dashboardTab
          );
        }
      });
    });

    const firstActive = select(
      config.tabSelector + ".is-active"
    );

    if (firstActive) {
      Dashboard.activateTab(
        firstActive.dataset.dashboardTab
      );
    }
  };

  /* ---------------------------------------------------------
     DASHBOARD SEARCH
  --------------------------------------------------------- */

  Dashboard.search = function (query, items) {
    const term = String(query || "")
      .trim()
      .toLowerCase();

    if (!Array.isArray(items)) return [];

    if (!term) return items.slice();

    return items.filter(function (item) {
      const content = [
        item.title,
        item.name,
        item.description,
        item.category,
        item.status
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return content.includes(term);
    });
  };

  Dashboard.initSearch = function () {
    selectAll("[data-dashboard-search]").forEach(function (input) {
      const targetSelector = input.dataset.target;

      if (!targetSelector) return;

      const container = select(targetSelector);

      if (!container) return;

      input.addEventListener("input", function () {
        const query = input.value.trim().toLowerCase();

        selectAll("[data-search-item]", container).forEach(
          function (item) {
            const content = item.textContent.toLowerCase();

            item.hidden = !content.includes(query);
          }
        );
      });
    });
  };

  /* ---------------------------------------------------------
     EMPTY STATES
  --------------------------------------------------------- */

  Dashboard.renderEmptyState = function (
    target,
    options
  ) {
    const container = getTarget(target);

    if (!container) return;

    const settings = options || {};

    const title = settings.title ||
      "Nothing to display yet";

    const description = settings.description ||
      "New information will appear here when available.";

    const icon = settings.icon || "○";

    container.replaceChildren();

    const wrapper = document.createElement("div");
    wrapper.className = "dashboard-empty-state";

    const iconElement = document.createElement("div");
    iconElement.className = "dashboard-empty-icon";
    iconElement.setAttribute("aria-hidden", "true");
    iconElement.textContent = icon;

    const heading = document.createElement("h3");
    heading.textContent = title;

    const paragraph = document.createElement("p");
    paragraph.textContent = description;

    wrapper.append(
      iconElement,
      heading,
      paragraph
    );

    container.appendChild(wrapper);
  };

  function getTarget(target) {
    return typeof target === "string"
      ? select(target)
      : target;
  }

  /* ---------------------------------------------------------
     DATA REFRESH
  --------------------------------------------------------- */

  Dashboard.refresh = async function (loader) {
    if (typeof loader !== "function") {
      throw new Error("A dashboard data loader is required.");
    }

    const refreshButtons = selectAll(
      "[data-dashboard-refresh]"
    );

    refreshButtons.forEach(function (button) {
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
    });

    try {
      const data = await loader();

      if (data && data.stats) {
        Dashboard.renderStats(data.stats);
      }

      if (data && data.user) {
        Dashboard.renderUser(
          data.user,
          data.profile
        );
      }

      return data;
    } finally {
      refreshButtons.forEach(function (button) {
        button.disabled = false;
        button.removeAttribute("aria-busy");
      });
    }
  };

  /* ---------------------------------------------------------
     CLICK ACTIONS
  --------------------------------------------------------- */

  Dashboard.initActions = function () {
    document.addEventListener("click", function (event) {
      const close = event.target.closest(
        "[data-dashboard-close-menu]"
      );

      if (close) {
        Dashboard.closeSidebar();
      }

      const refresh = event.target.closest(
        "[data-dashboard-refresh]"
      );

      if (refresh) {
        const callback = Dashboard.refreshHandler;

        if (typeof callback === "function") {
          callback();
        }
      }
    });
  };

  /* ---------------------------------------------------------
     INITIALISATION
  --------------------------------------------------------- */

  Dashboard.init = function () {
    Dashboard.initSidebar();
    Dashboard.setActiveNavigation();
    Dashboard.renderDate();
    Dashboard.renderGreeting();
    Dashboard.initTabs();
    Dashboard.initSearch();
    Dashboard.initActions();

    return true;
  };

  /* ---------------------------------------------------------
     EXPORT
  --------------------------------------------------------- */

  Dashboard.refreshHandler = null;

  LC.dashboard = Dashboard;
  window.LensCircleDashboard = Dashboard;

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      Dashboard.init
    );
  } else {
    Dashboard.init();
  }

})(window, document);
