
/* =========================================================
   LENS CIRCLE — NOTIFICATIONS UI
   File: assets/js/notifications-ui.js

   PURPOSE
   Presentation layer for the existing notifications.js module.

   FEATURES
   - Notification dropdown.
   - Unread notification badge.
   - Notification list.
   - Mark individual notification as read.
   - Mark all notifications as read.
   - Delete notification.
   - Realtime refresh.
   - Empty and loading states.
   - Notification navigation.
   - Accessible dropdown controls.

   DEPENDENCY
   assets/js/notifications.js

   EXPECTED DATA MODULE METHODS
   LC.notifications.getMine()
   LC.notifications.getUnreadCount()
   LC.notifications.markAsRead(id)
   LC.notifications.markAllAsRead()
   LC.notifications.deleteNotification(id)
   LC.notifications.subscribe(callback)

   Adapt the API adapter below if your notifications.js
   exposes different method names.

   SECURITY
   - This file does not access notification tables directly.
   - The notifications.js module and Supabase RLS must restrict
     records to their intended recipient.
   - Only trusted backend functions may create system alerts.
   ========================================================= */

(function (window, document) {
  "use strict";

  const LC = window.LensCircle = window.LensCircle || {};
  const NotificationUI = {};

  const state = {
    notifications: [],
    unreadCount: 0,
    isOpen: false,
    isLoading: false,
    subscription: null,
    container: null,
    badge: null,
    list: null,
    countLabel: null,
    emptyMessage: "You're all caught up."
  };

  /* ---------------------------------------------------------
     DATA MODULE ADAPTER
  --------------------------------------------------------- */

  function getModule() {
    const module = LC.notifications;

    if (!module) {
      throw new Error(
        "notifications.js must be loaded before notifications-ui.js."
      );
    }

    return module;
  }

  function callModule(method, ...args) {
    const module = getModule();

    if (typeof module[method] !== "function") {
      throw new Error(
        "Notification data method is missing: " + method
      );
    }

    return module[method](...args);
  }

  const API = {
    getMine() {
      return callModule("getMine");
    },

    getUnreadCount() {
      return callModule("getUnreadCount");
    },

    markAsRead(id) {
      return callModule("markAsRead", id);
    },

    markAllAsRead() {
      return callModule("markAllAsRead");
    },

    deleteNotification(id) {
      return callModule("deleteNotification", id);
    },

    subscribe(callback) {
      const module = getModule();

      if (typeof module.subscribe !== "function") {
        return null;
      }

      return module.subscribe(callback);
    }
  };

  /* ---------------------------------------------------------
     HELPERS
  --------------------------------------------------------- */

  function cleanText(value, maxLength) {
    return String(value == null ? "" : value)
      .trim()
      .slice(0, maxLength || 500);
  }

  function escapeHTML(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function normaliseNotification(row) {
    const item = row || {};

    return {
      id: cleanText(item.id || item.notification_id, 100),
      title: cleanText(item.title, 180),
      message: cleanText(
        item.message || item.body || item.content,
        1000
      ),
      type: cleanText(item.type || "general", 40),
      is_read: item.is_read === true,
      created_at: item.created_at || null,
      action_url: safeInternalURL(item.action_url || item.url),
      actor_name: cleanText(item.actor_name, 120)
    };
  }

  function safeInternalURL(value) {
    const path = cleanText(value, 1000);

    if (!path) return "";

    try {
      const url = new URL(path, window.location.origin);

      if (url.origin !== window.location.origin) {
        return "";
      }

      return url.href;
    } catch (_) {
      return "";
    }
  }

  function formatTime(value) {
    if (!value) return "Recently";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "Recently";

    const difference = Date.now() - date.getTime();
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;

    if (difference < minute) return "Just now";
    if (difference < hour) {
      return Math.floor(difference / minute) + " min ago";
    }
    if (difference < day) {
      return Math.floor(difference / hour) + " hr ago";
    }
    if (difference < 7 * day) {
      return Math.floor(difference / day) + " days ago";
    }

    return new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric"
    }).format(date);
  }

  function notificationIcon(type) {
    const icons = {
      submission: "📷",
      competition: "🏆",
      activity: "🎯",
      exhibition: "🖼️",
      assignment: "📋",
      report: "🚩",
      member: "👤",
      editorial: "📰",
      system: "⚙️",
      general: "🔔"
    };

    return icons[type] || icons.general;
  }

  /* ---------------------------------------------------------
     LOAD NOTIFICATIONS
  --------------------------------------------------------- */

  NotificationUI.load = async function () {
    if (state.isLoading) return state.notifications;

    state.isLoading = true;
    NotificationUI.renderLoading();

    try {
      const [rows, count] = await Promise.all([
        API.getMine(),
        API.getUnreadCount()
      ]);

      state.notifications = Array.isArray(rows)
        ? rows.map(normaliseNotification)
        : [];

      state.unreadCount = Math.max(
        0,
        Number(count) || 0
      );

      NotificationUI.render();
      NotificationUI.renderBadge();

      return state.notifications;
    } finally {
      state.isLoading = false;
    }
  };

  /* ---------------------------------------------------------
     BADGE
  --------------------------------------------------------- */

  NotificationUI.renderBadge = function () {
    if (!state.badge) {
      state.badge = document.querySelector(
        "[data-notification-badge]"
      );
    }

    if (!state.badge) return;

    const count = state.unreadCount;

    state.badge.textContent = count > 99
      ? "99+"
      : String(count);

    state.badge.hidden = count <= 0;

    state.badge.setAttribute(
      "aria-label",
      count + " unread notifications"
    );
  };

  /* ---------------------------------------------------------
     LOADING AND EMPTY STATES
  --------------------------------------------------------- */

  NotificationUI.renderLoading = function () {
    const target = state.list || document.querySelector(
      "[data-notification-list]"
    );

    if (!target) return;

    target.innerHTML = `
      <div class="notification-loading">
        Loading notifications...
      </div>
    `;
  };

  NotificationUI.renderEmpty = function () {
    const target = state.list || document.querySelector(
      "[data-notification-list]"
    );

    if (!target) return;

    target.innerHTML = `
      <div class="notification-empty">
        <span class="notification-empty-icon">🔔</span>
        <h3>You're all caught up</h3>
        <p>${escapeHTML(state.emptyMessage)}</p>
      </div>
    `;
  };

  /* ---------------------------------------------------------
     NOTIFICATION CARD
  --------------------------------------------------------- */

  NotificationUI.renderItem = function (notification) {
    const item = normaliseNotification(notification);

    const readClass = item.is_read
      ? "notification-read"
      : "notification-unread";

    const action = item.action_url
      ? `<a class="notification-open-link"
           href="${escapeHTML(item.action_url)}">
           Open
         </a>`
      : "";

    return `
      <article
        class="notification-item ${readClass}"
        data-notification-id="${escapeHTML(item.id)}">

        <div class="notification-item-icon">
          ${notificationIcon(item.type)}
        </div>

        <div class="notification-item-content">
          <h4>${escapeHTML(item.title || "Notification")}</h4>

          <p>${escapeHTML(item.message)}</p>

          <time>
            ${escapeHTML(formatTime(item.created_at))}
          </time>

          <div class="notification-item-actions">
            ${
              !item.is_read
                ? `<button
                    type="button"
                    data-notification-read="${escapeHTML(item.id)}">
                    Mark as read
                  </button>`
                : ""
            }

            ${action}

            <button
              type="button"
              data-notification-delete="${escapeHTML(item.id)}">
              Delete
            </button>
          </div>
        </div>

        ${
          !item.is_read
            ? '<span class="notification-unread-dot"></span>'
            : ""
        }
      </article>
    `;
  };

  /* ---------------------------------------------------------
     RENDER LIST
  --------------------------------------------------------- */

  NotificationUI.render = function () {
    state.list = state.list || document.querySelector(
      "[data-notification-list]"
    );

    if (!state.list) return;

    if (!state.notifications.length) {
      NotificationUI.renderEmpty();
      return;
    }

    state.list.innerHTML = state.notifications
      .map(NotificationUI.renderItem)
      .join("");

    NotificationUI.renderBadge();
  };

  /* ---------------------------------------------------------
     MARK ONE AS READ
  --------------------------------------------------------- */

  NotificationUI.markAsRead = async function (id) {
    const notificationId = cleanText(id, 100);

    if (!notificationId) {
      throw new Error("Notification ID is required.");
    }

    await API.markAsRead(notificationId);

    state.notifications = state.notifications.map(item => {
      if (item.id !== notificationId) return item;

      return Object.assign({}, item, {
        is_read: true
      });
    });

    state.unreadCount = state.notifications.filter(
      item => !item.is_read
    ).length;

    NotificationUI.render();
    NotificationUI.renderBadge();

    return true;
  };

  /* ---------------------------------------------------------
     MARK ALL AS READ
  --------------------------------------------------------- */

  NotificationUI.markAllAsRead = async function () {
    await API.markAllAsRead();

    state.notifications = state.notifications.map(item =>
      Object.assign({}, item, {
        is_read: true
      })
    );

    state.unreadCount = 0;

    NotificationUI.render();
    NotificationUI.renderBadge();

    return true;
  };

  /* ---------------------------------------------------------
     DELETE NOTIFICATION
  --------------------------------------------------------- */

  NotificationUI.deleteNotification = async function (id) {
    const notificationId = cleanText(id, 100);

    if (!notificationId) {
      throw new Error("Notification ID is required.");
    }

    const existing = state.notifications.find(
      item => item.id === notificationId
    );

    await API.deleteNotification(notificationId);

    state.notifications = state.notifications.filter(
      item => item.id !== notificationId
    );

    if (existing && !existing.is_read) {
      state.unreadCount = Math.max(
        0,
        state.unreadCount - 1
      );
    }

    NotificationUI.render();
    NotificationUI.renderBadge();

    return true;
  };

  /* ---------------------------------------------------------
     OPEN / CLOSE DROPDOWN
  --------------------------------------------------------- */

  NotificationUI.open = async function () {
    state.isOpen = true;

    if (state.container) {
      state.container.hidden = false;
      state.container.setAttribute("aria-hidden", "false");
    }

    await NotificationUI.load();
  };

  NotificationUI.close = function () {
    state.isOpen = false;

    if (state.container) {
      state.container.hidden = true;
      state.container.setAttribute("aria-hidden", "true");
    }
  };

  NotificationUI.toggle = function () {
    if (state.isOpen) {
      NotificationUI.close();
      return;
    }

    NotificationUI.open().catch(console.error);
  };

  /* ---------------------------------------------------------
     EVENT DELEGATION
  --------------------------------------------------------- */

  function bindEvents() {
    document.addEventListener("click", function (event) {
      const toggle = event.target.closest(
        "[data-notification-toggle]"
      );

      if (toggle) {
        event.preventDefault();
        NotificationUI.toggle();
        return;
      }

      const readButton = event.target.closest(
        "[data-notification-read]"
      );

      if (readButton) {
        event.preventDefault();

        NotificationUI.markAsRead(
          readButton.getAttribute("data-notification-read")
        ).catch(console.error);

        return;
      }

      const deleteButton = event.target.closest(
        "[data-notification-delete]"
      );

      if (deleteButton) {
        event.preventDefault();

        NotificationUI.deleteNotification(
          deleteButton.getAttribute("data-notification-delete")
        ).catch(console.error);

        return;
      }

      const markAllButton = event.target.closest(
        "[data-notification-mark-all]"
      );

      if (markAllButton) {
        event.preventDefault();

        NotificationUI.markAllAsRead()
          .catch(console.error);

        return;
      }

      if (
        state.isOpen &&
        state.container &&
        !state.container.contains(event.target) &&
        !event.target.closest("[data-notification-toggle]")
      ) {
        NotificationUI.close();
      }
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && state.isOpen) {
        NotificationUI.close();
      }
    });
  }

  /* ---------------------------------------------------------
     REALTIME
  --------------------------------------------------------- */

  NotificationUI.subscribe = function () {
    if (state.subscription) return state.subscription;

    state.subscription = API.subscribe(function () {
      NotificationUI.load().catch(console.error);
    });

    return state.subscription;
  };

  NotificationUI.unsubscribe = function () {
    if (!state.subscription) return;

    if (typeof state.subscription.unsubscribe === "function") {
      state.subscription.unsubscribe();
    } else if (typeof state.subscription === "function") {
      state.subscription();
    }

    state.subscription = null;
  };

  /* ---------------------------------------------------------
     INITIALISE
  --------------------------------------------------------- */

  NotificationUI.init = function (options) {
    const settings = options || {};

    state.container = document.querySelector(
      settings.container || "[data-notification-panel]"
    );

    state.badge = document.querySelector(
      settings.badge || "[data-notification-badge]"
    );

    state.list = document.querySelector(
      settings.list || "[data-notification-list]"
    );

    if (settings.emptyMessage) {
      state.emptyMessage = cleanText(
        settings.emptyMessage,
        200
      );
    }

    if (!state.container || !state.list) {
      console.warn(
        "Notification UI elements not found. Add the required data attributes."
      );
      return false;
    }

    state.container.hidden = true;
    state.container.setAttribute("aria-hidden", "true");

    bindEvents();

    NotificationUI.load().catch(console.error);
    NotificationUI.subscribe();

    return true;
  };

  /* ---------------------------------------------------------
     CLEANUP AND STATE
  --------------------------------------------------------- */

  NotificationUI.getState = function () {
    return {
      notifications: state.notifications.slice(),
      unreadCount: state.unreadCount,
      isOpen: state.isOpen,
      isLoading: state.isLoading
    };
  };

  NotificationUI.clear = function () {
    NotificationUI.unsubscribe();

    state.notifications = [];
    state.unreadCount = 0;
    state.isOpen = false;

    NotificationUI.close();
    NotificationUI.renderBadge();
    NotificationUI.renderEmpty();
  };

  /* ---------------------------------------------------------
     EXPORT
  --------------------------------------------------------- */

  LC.notificationUI = NotificationUI;
  window.LensCircleNotificationUI = NotificationUI;

})(window, document);
