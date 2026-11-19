
/**
 * LENS CIRCLE — NOTIFICATIONS MODULE
 * File: assets/js/notifications.js
 *
 * Features:
 * - Load authenticated user's notifications
 * - Display unread notification count
 * - Render notification dropdown
 * - Mark individual notifications as read
 * - Mark all notifications as read
 * - Delete individual notifications
 * - Subscribe to Supabase Realtime updates
 * - Navigate to notification destinations
 *
 * REQUIRED TABLE: public.notifications
 *
 * Suggested columns:
 * id UUID PRIMARY KEY
 * user_id UUID REFERENCES auth.users(id)
 * title TEXT NOT NULL
 * message TEXT
 * type TEXT
 * link TEXT
 * is_read BOOLEAN DEFAULT FALSE
 * created_at TIMESTAMPTZ DEFAULT NOW()
 *
 * SECURITY:
 * - RLS must restrict records to their intended recipient.
 * - Users must not create notifications for themselves
 *   unless explicitly permitted by the platform design.
 * - Staff notification creation must use trusted backend functions.
 * - Realtime subscriptions must be protected by RLS.
 */

(function () {
  "use strict";

  const CONFIG = {
    table: "notifications",
    limit: 30,
    realtime: true,
    refreshInterval: null
  };

  const state = {
    notifications: [],
    unreadCount: 0,
    loading: false,
    subscription: null,
    userId: null
  };

  function client() {
    if (window.LensCircle?.db) {
      return window.LensCircle.db;
    }

    if (window.supabaseClient) {
      return window.supabaseClient;
    }

    throw new Error(
      "Lens Circle Supabase client is unavailable."
    );
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(
      /[&<>"']/g,
      character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      })[character]
    );
  }

  function safeLink(value) {
    if (!value) return "";

    try {
      const url = new URL(
        value,
        window.location.origin
      );

      if (
        url.protocol !== "https:" &&
        url.protocol !== "http:"
      ) {
        return "";
      }

      return url.href;
    } catch {
      return "";
    }
  }

  function timeAgo(value) {
    if (!value) return "";

    const timestamp = new Date(value).getTime();

    if (Number.isNaN(timestamp)) return "";

    const seconds = Math.max(
      0,
      Math.floor((Date.now() - timestamp) / 1000)
    );

    if (seconds < 60) return "Just now";

    const minutes = Math.floor(seconds / 60);

    if (minutes < 60) {
      return `${minutes} min ago`;
    }

    const hours = Math.floor(minutes / 60);

    if (hours < 24) {
      return `${hours} hr ago`;
    }

    const days = Math.floor(hours / 24);

    if (days < 7) {
      return `${days} days ago`;
    }

    return new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric"
    }).format(new Date(value));
  }

  function normalise(record) {
    if (!record || typeof record !== "object") {
      return null;
    }

    return {
      id: record.id || "",
      title: record.title || "Notification",
      message: record.message || "",
      type: record.type || "general",
      link: safeLink(record.link),
      isRead: record.is_read === true,
      createdAt: record.created_at || null
    };
  }

  function notify(message, type = "info") {
    window.dispatchEvent(
      new CustomEvent("lenscircle:notification-message", {
        detail: { message, type }
      })
    );
  }

  async function getCurrentUser() {
    const { data, error } = await client().auth.getUser();

    if (error) throw error;

    if (!data?.user) {
      throw new Error("Please sign in to continue.");
    }

    state.userId = data.user.id;

    return data.user;
  }

  function updateUnreadCount() {
    state.unreadCount = state.notifications.filter(
      item => !item.isRead
    ).length;

    document.querySelectorAll(
      "[data-notification-count]"
    ).forEach(element => {
      element.textContent = state.unreadCount;

      element.hidden = state.unreadCount === 0;
      element.setAttribute(
        "aria-label",
        `${state.unreadCount} unread notifications`
      );
    });

    document.querySelectorAll(
      "[data-notification-unread]"
    ).forEach(element => {
      element.textContent = state.unreadCount;
    });

    window.dispatchEvent(
      new CustomEvent("lenscircle:unread-count-changed", {
        detail: {
          count: state.unreadCount
        }
      })
    );
  }

  async function load(options = {}) {
    state.loading = true;

    try {
      await getCurrentUser();

      const { data, error } = await client()
        .from(CONFIG.table)
        .select(
          "id, title, message, type, link, is_read, created_at"
        )
        .order("created_at", {
          ascending: false
        })
        .limit(options.limit || CONFIG.limit);

      if (error) throw error;

      state.notifications = Array.isArray(data)
        ? data.map(normalise).filter(Boolean)
        : [];

      updateUnreadCount();

      return {
        success: true,
        data: state.notifications,
        unreadCount: state.unreadCount
      };

    } catch (error) {
      console.error(
        "Notification loading failed:",
        error
      );

      return {
        success: false,
        data: [],
        error: error.message || "Unable to load notifications."
      };

    } finally {
      state.loading = false;
    }
  }

  async function markAsRead(notificationId) {
    if (!notificationId) {
      throw new Error("Notification ID is required.");
    }

    const { error } = await client()
      .from(CONFIG.table)
      .update({
        is_read: true
      })
      .eq("id", notificationId)
      .eq("user_id", state.userId)
      .eq("is_read", false);

    if (error) throw error;

    state.notifications = state.notifications.map(item =>
      item.id === notificationId
        ? { ...item, isRead: true }
        : item
    );

    updateUnreadCount();

    return {
      success: true
    };
  }

  async function markAllAsRead() {
    await getCurrentUser();

    const { error } = await client()
      .from(CONFIG.table)
      .update({
        is_read: true
      })
      .eq("user_id", state.userId)
      .eq("is_read", false);

    if (error) throw error;

    state.notifications = state.notifications.map(item => ({
      ...item,
      isRead: true
    }));

    updateUnreadCount();

    return {
      success: true
    };
  }

  async function remove(notificationId) {
    if (!notificationId) {
      throw new Error("Notification ID is required.");
    }

    const { error } = await client()
      .from(CONFIG.table)
      .delete()
      .eq("id", notificationId)
      .eq("user_id", state.userId);

    if (error) throw error;

    state.notifications = state.notifications.filter(
      item => item.id !== notificationId
    );

    updateUnreadCount();

    return {
      success: true
    };
  }

  function renderItem(item) {
    const notification = normalise(item);

    if (!notification) return "";

    return `
      <article
        class="lc-notification-item
          ${notification.isRead ? "is-read" : "is-unread"}"
        data-notification-id="${escapeHTML(notification.id)}">

        <div class="lc-notification-item__content">

          <span class="lc-notification-type">
            ${escapeHTML(notification.type.replace(/_/g, " "))}
          </span>

          <h4>${escapeHTML(notification.title)}</h4>

          <p>${escapeHTML(notification.message)}</p>

          <time>
            ${escapeHTML(timeAgo(notification.createdAt))}
          </time>

        </div>

        <div class="lc-notification-item__actions">

          ${
            !notification.isRead
              ? `<button
                  type="button"
                  data-notification-action="read"
                  data-id="${escapeHTML(notification.id)}"
                  aria-label="Mark as read">
                  Mark read
                </button>`
              : ""
          }

          <button
            type="button"
            data-notification-action="delete"
            data-id="${escapeHTML(notification.id)}"
            aria-label="Delete notification">
            Delete
          </button>

          ${
            notification.link
              ? `<button
                  type="button"
                  data-notification-action="open"
                  data-id="${escapeHTML(notification.id)}">
                  View
                </button>`
              : ""
          }

        </div>

      </article>
    `;
  }

  function render(container) {
    if (!container) return;

    if (state.loading) {
      container.innerHTML = `
        <div class="lc-notifications-loading">
          Loading notifications...
        </div>
      `;
      return;
    }

    if (!state.notifications.length) {
      container.innerHTML = `
        <div class="lc-notifications-empty">
          <span class="lc-notifications-empty__icon">♧</span>
          <h3>You're all caught up</h3>
          <p>New updates from Lens Circle will appear here.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="lc-notifications-header">
        <div>
          <h3>Notifications</h3>
          <span>${state.unreadCount} unread</span>
        </div>

        ${
          state.unreadCount
            ? `<button
                type="button"
                data-notification-action="read-all">
                Mark all as read
              </button>`
            : ""
        }
      </div>

      <div class="lc-notifications-list">
        ${state.notifications.map(renderItem).join("")}
      </div>
    `;
  }

  async function loadInto(selector) {
    const container = typeof selector === "string"
      ? document.querySelector(selector)
      : selector;

    if (!container) {
      return {
        success: false,
        error: "Notification container not found."
      };
    }

    const result = await load();

    if (!result.success) {
      container.innerHTML = `
        <div class="lc-notifications-error">
          Notifications could not be loaded.
        </div>
      `;

      return result;
    }

    render(container);

    return result;
  }

  function refreshVisibleContainers() {
    document.querySelectorAll(
      "[data-notification-list]"
    ).forEach(render);
  }

  async function handleAction(action, notificationId) {
    if (action === "read") {
      await markAsRead(notificationId);
    }

    if (action === "read-all") {
      await markAllAsRead();
    }

    if (action === "delete") {
      await remove(notificationId);
    }

    if (action === "open") {
      const item = state.notifications.find(
        notification => notification.id === notificationId
      );

      if (!item) return;

      if (!item.isRead) {
        await markAsRead(notificationId);
      }

      if (item.link) {
        window.location.assign(item.link);
      }
    }

    refreshVisibleContainers();
  }

  function bind(container = document) {
    container.addEventListener("click", async event => {
      const button = event.target.closest(
        "[data-notification-action]"
      );

      if (!button) return;

      const action = button.dataset.notificationAction;
      const id = button.dataset.id;

      button.disabled = true;

      try {
        await handleAction(action, id);

      } catch (error) {
        console.error(
          "Notification action failed:",
          error
        );

        notify(
          error.message || "Unable to update notification.",
          "error"
        );

      } finally {
        button.disabled = false;
      }
    });
  }

  function subscribe() {
    if (!CONFIG.realtime || state.subscription) {
      return state.subscription;
    }

    if (!state.userId) {
      return null;
    }

    state.subscription = client()
      .channel(`notifications-${state.userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: CONFIG.table,
          filter: `user_id=eq.${state.userId}`
        },
        async () => {
          await load();
          refreshVisibleContainers();
        }
      )
      .subscribe();

    return state.subscription;
  }

  async function unsubscribe() {
    if (!state.subscription) return;

    await client().removeChannel(state.subscription);

    state.subscription = null;
  }

  async function initialise(options = {}) {
    bind();

    const result = await load({
      limit: options.limit || CONFIG.limit
    });

    if (result.success) {
      document.querySelectorAll(
        "[data-notification-list]"
      ).forEach(render);

      if (options.realtime !== false) {
        subscribe();
      }
    }

    return result;
  }

  window.LensCircleNotifications = {
    config: CONFIG,
    state,
    load,
    loadInto,
    markAsRead,
    markAllAsRead,
    remove,
    render,
    renderItem,
    updateUnreadCount,
    subscribe,
    unsubscribe,
    bind,
    initialise,
    timeAgo
  };

})();
