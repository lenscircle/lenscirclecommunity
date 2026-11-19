
/* =========================================================
   LENS CIRCLE — NOTIFICATION CENTRE
   File: assets/js/notifications-center.js

   DEPENDS ON
   - assets/js/supabase-client.js
   - assets/js/notifications.js

   OPTIONAL
   - assets/js/notifications-ui.js

   EXPECTED NOTIFICATION MODULE METHODS
   - getMine()
   - getUnreadCount()
   - markAsRead(id)
   - markAllAsRead()
   - deleteNotification(id)
   - subscribe(callback)

   SECURITY
   - The backend must restrict notifications to recipients.
   - Notification creation must use trusted backend functions.
   - Never trust browser-supplied recipient IDs.
   ========================================================= */

(function (window, document) {
  "use strict";

  const LC = window.LensCircle = window.LensCircle || {};
  const Center = {};

  const state = {
    notifications: [],
    filter: "all",
    unreadOnly: false,
    loading: false,
    subscription: null,
    initialised: false
  };

  const categories = {
    competition: "Competitions",
    activity: "Activities",
    submission: "Submissions",
    community: "Community",
    assignment: "Assignments",
    report: "Reports",
    account: "Account",
    system: "System",
    general: "General"
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

  function clean(value, maxLength) {
    return String(value == null ? "" : value)
      .trim()
      .slice(0, maxLength || 500);
  }

  function formatDate(value) {
    if (!value) return "";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "";
    }

    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(date);
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

    console.info("[Lens Circle Notifications]", message);
  }

  function getNotificationModule() {
    if (!LC.notifications) {
      throw new Error(
        "Load assets/js/notifications.js before notifications-center.js."
      );
    }

    return LC.notifications;
  }

  function normalise(item) {
    const notification = item || {};

    return {
      id: clean(notification.id, 120),
      title: clean(notification.title, 200),
      message: clean(
        notification.message || notification.body,
        1500
      ),
      category: clean(
        notification.category || notification.type,
        50
      ).toLowerCase() || "general",
      created_at: notification.created_at || null,
      is_read: Boolean(
        notification.is_read || notification.read_at
      ),
      action_url: clean(
        notification.action_url || notification.url,
        1000
      )
    };
  }

  function safeInternalURL(value) {
    if (!value) return "";

    try {
      const url = new URL(value, window.location.origin);

      if (url.origin !== window.location.origin) {
        return "";
      }

      if (
        url.protocol !== "https:" &&
        url.protocol !== "http:"
      ) {
        return "";
      }

      return url.href;
    } catch (_) {
      return "";
    }
  }

  function categoryLabel(category) {
    return categories[category] || "General";
  }

  /* ---------------------------------------------------------
     LOAD NOTIFICATIONS
  --------------------------------------------------------- */

  Center.load = async function () {
    if (state.loading) return state.notifications;

    state.loading = true;
    Center.setLoading(true);

    try {
      const module = getNotificationModule();

      if (typeof module.getMine !== "function") {
        throw new Error(
          "notifications.getMine() is not available."
        );
      }

      const result = await module.getMine();

      const list = Array.isArray(result)
        ? result
        : result && Array.isArray(result.data)
          ? result.data
          : [];

      state.notifications = list.map(normalise);

      Center.render();
      Center.renderUnreadCount();

      return state.notifications;
    } catch (error) {
      console.error(
        "[Lens Circle Notifications] Load failed:",
        error
      );

      Center.renderError(
        "Unable to load notifications. Please try again."
      );

      throw error;
    } finally {
      state.loading = false;
      Center.setLoading(false);
    }
  };

  /* ---------------------------------------------------------
     UNREAD COUNT
  --------------------------------------------------------- */

  Center.getUnreadCount = function () {
    return state.notifications.filter(function (item) {
      return !item.is_read;
    }).length;
  };

  Center.renderUnreadCount = function () {
    const count = Center.getUnreadCount();

    selectAll("[data-notification-count]").forEach(
      function (element) {
        element.textContent =
          count > 99 ? "99+" : String(count);

        element.hidden = count === 0;
      }
    );

    selectAll("[data-notification-unread]").forEach(
      function (element) {
        element.textContent = String(count);
      }
    );

    selectAll("[data-notification-indicator]").forEach(
      function (element) {
        element.hidden = count === 0;
      }
    );
  };

  /* ---------------------------------------------------------
     FILTERS
  --------------------------------------------------------- */

  Center.setFilter = function (filter) {
    const allowed = [
      "all",
      "unread",
      "competition",
      "activity",
      "submission",
      "community",
      "assignment",
      "report",
      "account",
      "system"
    ];

    if (!allowed.includes(filter)) {
      filter = "all";
    }

    state.filter = filter;
    state.unreadOnly = filter === "unread";

    Center.render();
  };

  Center.getVisibleNotifications = function () {
    return state.notifications.filter(function (item) {
      if (state.filter === "unread") {
        return !item.is_read;
      }

      if (state.filter === "all") {
        return true;
      }

      return item.category === state.filter;
    });
  };

  /* ---------------------------------------------------------
     RENDER NOTIFICATION LIST
  --------------------------------------------------------- */

  Center.render = function () {
    const container = select("[data-notification-list]");

    if (!container) {
      Center.renderUnreadCount();
      return;
    }

    container.replaceChildren();

    const notifications =
      Center.getVisibleNotifications();

    if (!notifications.length) {
      Center.renderEmpty(container);
      Center.renderUnreadCount();
      return;
    }

    notifications.forEach(function (item) {
      const card = document.createElement("article");

      card.className = "notification-item";

      if (!item.is_read) {
        card.classList.add("is-unread");
      }

      card.dataset.notificationId = item.id;

      const heading = document.createElement("h3");
      heading.textContent =
        item.title || "New notification";

      const message = document.createElement("p");
      message.textContent = item.message;

      const meta = document.createElement("div");
      meta.className = "notification-meta";

      const category = document.createElement("span");
      category.textContent =
        categoryLabel(item.category);

      const date = document.createElement("time");
      date.textContent = formatDate(item.created_at);

      meta.append(category, date);

      const actions = document.createElement("div");
      actions.className = "notification-actions";

      if (!item.is_read) {
        const markRead = document.createElement("button");
        markRead.type = "button";
        markRead.textContent = "Mark as read";

        markRead.addEventListener("click", function () {
          Center.markAsRead(item.id).catch(function () {});
        });

        actions.appendChild(markRead);
      }

      const destination = safeInternalURL(item.action_url);

      if (destination) {
        const open = document.createElement("a");
        open.href = destination;
        open.textContent = "Open";

        open.addEventListener("click", function () {
          if (!item.is_read) {
            Center.markAsRead(item.id).catch(function () {});
          }
        });

        actions.appendChild(open);
      }

      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "Delete";

      remove.addEventListener("click", function () {
        Center.delete(item.id).catch(function () {});
      });

      actions.appendChild(remove);

      card.append(
        heading,
        message,
        meta,
        actions
      );

      container.appendChild(card);
    });

    Center.renderUnreadCount();
  };

  /* ---------------------------------------------------------
     EMPTY STATE
  --------------------------------------------------------- */

  Center.renderEmpty = function (container) {
    const wrapper = document.createElement("div");
    wrapper.className = "notification-empty";

    const heading = document.createElement("h3");
    heading.textContent = "You're all caught up";

    const message = document.createElement("p");
    message.textContent =
      "New notifications will appear here.";

    wrapper.append(heading, message);
    container.appendChild(wrapper);
  };

  /* ---------------------------------------------------------
     ERROR STATE
  --------------------------------------------------------- */

  Center.renderError = function (message) {
    const container = select("[data-notification-list]");

    if (!container) return;

    container.replaceChildren();

    const error = document.createElement("p");
    error.className = "notification-error";
    error.setAttribute("role", "alert");
    error.textContent = clean(message, 500);

    container.appendChild(error);
  };

  /* ---------------------------------------------------------
     LOADING STATE
  --------------------------------------------------------- */

  Center.setLoading = function (loading) {
    selectAll("[data-notification-loading]").forEach(
      function (element) {
        element.hidden = !loading;
      }
    );

    selectAll("[data-notification-refresh]").forEach(
      function (button) {
        button.disabled = Boolean(loading);
        button.setAttribute(
          "aria-busy",
          String(Boolean(loading))
        );
      }
    );
  };

  /* ---------------------------------------------------------
     MARK INDIVIDUAL NOTIFICATION AS READ
  --------------------------------------------------------- */

  Center.markAsRead = async function (id) {
    const item = state.notifications.find(function (notification) {
      return notification.id === id;
    });

    if (!item || item.is_read) return false;

    const module = getNotificationModule();

    if (typeof module.markAsRead !== "function") {
      throw new Error(
        "notifications.markAsRead() is not available."
      );
    }

    await module.markAsRead(id);

    item.is_read = true;

    Center.render();
    Center.renderUnreadCount();

    return true;
  };

  /* ---------------------------------------------------------
     MARK ALL AS READ
  --------------------------------------------------------- */

  Center.markAllAsRead = async function () {
    const unread = Center.getUnreadCount();

    if (!unread) return true;

    const module = getNotificationModule();

    if (typeof module.markAllAsRead !== "function") {
      throw new Error(
        "notifications.markAllAsRead() is not available."
      );
    }

    await module.markAllAsRead();

    state.notifications.forEach(function (item) {
      item.is_read = true;
    });

    Center.render();
    Center.renderUnreadCount();

    notify("All notifications marked as read.", "success");

    return true;
  };

  /* ---------------------------------------------------------
     DELETE NOTIFICATION
  --------------------------------------------------------- */

  Center.delete = async function (id) {
    const module = getNotificationModule();

    if (typeof module.deleteNotification !== "function") {
      throw new Error(
        "notifications.deleteNotification() is not available."
      );
    }

    await module.deleteNotification(id);

    state.notifications = state.notifications.filter(
      function (item) {
        return item.id !== id;
      }
    );

    Center.render();
    Center.renderUnreadCount();

    notify("Notification deleted.", "success");

    return true;
  };

  /* ---------------------------------------------------------
     REALTIME SUBSCRIPTION
  --------------------------------------------------------- */

  Center.subscribe = function () {
    const module = getNotificationModule();

    if (typeof module.subscribe !== "function") {
      return false;
    }

    if (state.subscription) {
      return true;
    }

    state.subscription = module.subscribe(function () {
      Center.load().catch(function () {});
    });

    return true;
  };

  Center.unsubscribe = function () {
    if (!state.subscription) return;

    if (typeof state.subscription.unsubscribe === "function") {
      state.subscription.unsubscribe();
    } else if (typeof state.subscription === "function") {
      state.subscription();
    }

    state.subscription = null;
  };

  /* ---------------------------------------------------------
     DROPDOWN
  --------------------------------------------------------- */

  Center.open = function () {
    const panel = select("[data-notification-panel]");
    const button = select("[data-notification-toggle]");

    if (!panel) return;

    panel.hidden = false;
    panel.classList.add("is-open");

    if (button) {
      button.setAttribute("aria-expanded", "true");
    }

    Center.load().catch(function () {});
  };

  Center.close = function () {
    const panel = select("[data-notification-panel]");
    const button = select("[data-notification-toggle]");

    if (!panel) return;

    panel.hidden = true;
    panel.classList.remove("is-open");

    if (button) {
      button.setAttribute("aria-expanded", "false");
    }
  };

  Center.toggle = function () {
    const panel = select("[data-notification-panel]");

    if (!panel || panel.hidden) {
      Center.open();
    } else {
      Center.close();
    }
  };

  /* ---------------------------------------------------------
     EVENT LISTENERS
  --------------------------------------------------------- */

  Center.initEvents = function () {
    document.addEventListener("click", function (event) {
      const toggle = event.target.closest(
        "[data-notification-toggle]"
      );

      if (toggle) {
        Center.toggle();
        return;
      }

      const close = event.target.closest(
        "[data-notification-close]"
      );

      if (close) {
        Center.close();
        return;
      }

      const markAll = event.target.closest(
        "[data-notification-mark-all]"
      );

      if (markAll) {
        Center.markAllAsRead().catch(function (error) {
          console.error(error);
        });

        return;
      }

      const refresh = event.target.closest(
        "[data-notification-refresh]"
      );

      if (refresh) {
        Center.load().catch(function () {});
        return;
      }

      const filter = event.target.closest(
        "[data-notification-filter]"
      );

      if (filter) {
        Center.setFilter(
          filter.dataset.notificationFilter
        );
      }
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        Center.close();
      }
    });
  };

  /* ---------------------------------------------------------
     INITIALISATION
  --------------------------------------------------------- */

  Center.init = function (options) {
    if (state.initialised) return Center;

    state.initialised = true;

    const settings = options || {};

    Center.initEvents();

    if (settings.autoLoad !== false) {
      Center.load().catch(function () {});
    }

    if (settings.realtime !== false) {
      try {
        Center.subscribe();
      } catch (error) {
        console.warn(
          "[Lens Circle Notifications] Realtime unavailable:",
          error
        );
      }
    }

    return Center;
  };

  /* ---------------------------------------------------------
     PUBLIC STATE
  --------------------------------------------------------- */

  Center.getState = function () {
    return {
      loading: state.loading,
      filter: state.filter,
      total: state.notifications.length,
      unread: Center.getUnreadCount()
    };
  };

  /* ---------------------------------------------------------
     EXPORT
  --------------------------------------------------------- */

  LC.notificationCenter = Center;
  window.LensCircleNotificationCenter = Center;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      Center.init();
    });
  } else {
    Center.init();
  }

})(window, document);
