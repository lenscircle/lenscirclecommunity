
/* =====================================================
   LENS CIRCLE
   Central Notification System
   File: assets/js/notifications.js

   Dependencies:
   - Supabase JS SDK v2
   - assets/js/supabase-client.js
   - assets/js/auth.js

   Required Supabase table:
   public.notifications

   Expected columns:
   id           uuid
   user_id      uuid
   title        text
   message      text
   type         text
   link         text
   is_read      boolean
   created_at   timestamptz

   RLS must restrict users to their own notifications.
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
      "Lens Circle Notifications: Dependencies missing."
    );
    return;
  }

  const db = window.LensCircle.db;

  const Notifications =
    window.LensCircleNotifications = {};

  const TABLE = "notifications";

  const PAGE_SIZE = 20;

  const VALID_TYPES = [
    "general",
    "announcement",
    "competition",
    "submission",
    "activity",
    "assignment",
    "moderation",
    "system"
  ];

  let currentUserId = null;
  let realtimeChannel = null;

  // ----------------------------------------------------
  // 2. GET CURRENT USER
  // ----------------------------------------------------

  async function getUserId() {
    const user =
      await window.LensCircleAuth.getUser();

    if (!user) {
      throw new Error(
        "Sign in to access notifications."
      );
    }

    currentUserId = user.id;

    return user.id;
  }

  // ----------------------------------------------------
  // 3. FETCH NOTIFICATIONS
  // ----------------------------------------------------

  Notifications.getAll = async function (options) {
    options = options || {};

    const userId = await getUserId();

    const limit = Math.min(
      Math.max(Number(options.limit) || PAGE_SIZE, 1),
      100
    );

    let query = db
      .from(TABLE)
      .select(
        "id, title, message, type, link, is_read, created_at"
      )
      .eq("user_id", userId)
      .order("created_at", {
        ascending: false
      })
      .limit(limit);

    if (options.unreadOnly === true) {
      query = query.eq("is_read", false);
    }

    if (options.before) {
      query = query.lt(
        "created_at",
        options.before
      );
    }

    const { data, error } = await query;

    if (error) {
      console.error(
        "Unable to load notifications:",
        error
      );

      throw error;
    }

    return data || [];
  };

  // ----------------------------------------------------
  // 4. GET UNREAD COUNT
  // ----------------------------------------------------

  Notifications.getUnreadCount = async function () {
    const userId = await getUserId();

    const { count, error } = await db
      .from(TABLE)
      .select("id", {
        count: "exact",
        head: true
      })
      .eq("user_id", userId)
      .eq("is_read", false);

    if (error) {
      throw error;
    }

    return count || 0;
  };

  // ----------------------------------------------------
  // 5. MARK ONE NOTIFICATION AS READ
  // ----------------------------------------------------

  Notifications.markAsRead = async function (
    notificationId
  ) {
    const userId = await getUserId();

    const { data, error } = await db
      .from(TABLE)
      .update({
        is_read: true
      })
      .eq("id", notificationId)
      .eq("user_id", userId)
      .select("id")
      .maybeSingle();

    if (error) {
      throw error;
    }

    return Boolean(data);
  };

  // ----------------------------------------------------
  // 6. MARK ALL NOTIFICATIONS AS READ
  // ----------------------------------------------------

  Notifications.markAllAsRead = async function () {
    const userId = await getUserId();

    const { data, error } = await db
      .from(TABLE)
      .update({
        is_read: true
      })
      .eq("user_id", userId)
      .eq("is_read", false)
      .select("id");

    if (error) {
      throw error;
    }

    return data || [];
  };

  // ----------------------------------------------------
  // 7. DELETE OWN NOTIFICATION
  // ----------------------------------------------------

  Notifications.delete = async function (
    notificationId
  ) {
    const userId = await getUserId();

    const { data, error } = await db
      .from(TABLE)
      .delete()
      .eq("id", notificationId)
      .eq("user_id", userId)
      .select("id")
      .maybeSingle();

    if (error) {
      throw error;
    }

    return Boolean(data);
  };

  // ----------------------------------------------------
  // 8. DELETE ALL READ NOTIFICATIONS
  // ----------------------------------------------------

  Notifications.clearRead = async function () {
    const userId = await getUserId();

    const { data, error } = await db
      .from(TABLE)
      .delete()
      .eq("user_id", userId)
      .eq("is_read", true)
      .select("id");

    if (error) {
      throw error;
    }

    return data || [];
  };

  // ----------------------------------------------------
  // 9. NOTIFICATION DATE FORMAT
  // ----------------------------------------------------

  Notifications.formatDate = function (dateValue) {
    if (!dateValue) {
      return "";
    }

    const date = new Date(dateValue);

    if (Number.isNaN(date.getTime())) {
      return "";
    }

    return new Intl.DateTimeFormat("en-IN", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(date);
  };

  // ----------------------------------------------------
  // 10. SAFE NOTIFICATION RENDERING
  // ----------------------------------------------------

  Notifications.render = function (
    container,
    notifications
  ) {
    if (typeof container === "string") {
      container = document.querySelector(container);
    }

    if (!container) {
      throw new Error(
        "Notification container was not found."
      );
    }

    container.replaceChildren();

    if (!notifications || !notifications.length) {
      const empty = document.createElement("div");

      empty.className = "lc-notification-empty";
      empty.textContent = "You're all caught up.";

      container.appendChild(empty);

      return;
    }

    notifications.forEach(function (item) {
      const article = document.createElement("article");

      article.className =
        "lc-notification-item" +
        (item.is_read ? "" : " is-unread");

      article.dataset.notificationId = item.id;

      const content = document.createElement("div");

      content.className = "lc-notification-content";

      const title = document.createElement("h4");
      title.textContent = item.title || "Notification";

      const message = document.createElement("p");
      message.textContent = item.message || "";

      const date = document.createElement("time");

      date.textContent =
        Notifications.formatDate(item.created_at);

      date.dateTime = item.created_at || "";

      content.appendChild(title);
      content.appendChild(message);
      content.appendChild(date);

      article.appendChild(content);

      if (!item.is_read) {
        const readButton =
          document.createElement("button");

        readButton.type = "button";
        readButton.textContent = "Mark as read";
        readButton.className =
          "lc-notification-read";

        readButton.addEventListener(
          "click",
          async function () {
            try {
              await Notifications.markAsRead(item.id);

              article.classList.remove("is-unread");
              readButton.remove();

              article.dispatchEvent(
                new CustomEvent("lc:notification-read", {
                  bubbles: true,
                  detail: { id: item.id }
                })
              );

            } catch (error) {
              console.error(error);

              window.LensCircleUI?.notify(
                "Unable to update notification.",
                "error"
              );
            }
          }
        );

        article.appendChild(readButton);
      }

      if (item.link) {
        const link = document.createElement("a");

        link.href = Notifications.safeLink(item.link);
        link.textContent = "View details";
        link.className = "lc-notification-link";

        article.appendChild(link);
      }

      container.appendChild(article);
    });
  };

  // ----------------------------------------------------
  // 11. VALIDATE NOTIFICATION LINK
  // ----------------------------------------------------

  Notifications.safeLink = function (link) {
    if (typeof link !== "string") {
      return "#";
    }

    try {
      const parsed = new URL(
        link,
        window.location.origin
      );

      if (
        parsed.origin !== window.location.origin
      ) {
        return "#";
      }

      return parsed.href;

    } catch (error) {
      return "#";
    }
  };

  // ----------------------------------------------------
  // 12. REAL-TIME NOTIFICATION SUBSCRIPTION
  // ----------------------------------------------------

  Notifications.subscribe = async function (callback) {
    const userId = await getUserId();

    if (realtimeChannel) {
      await Notifications.unsubscribe();
    }

    realtimeChannel = db
      .channel("lc-notifications-" + userId)

      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: TABLE,
          filter: "user_id=eq." + userId
        },
        function (payload) {
          if (typeof callback === "function") {
            callback({
              event: "INSERT",
              notification: payload.new
            });
          }
        }
      )

      .subscribe();

    return realtimeChannel;
  };

  // ----------------------------------------------------
  // 13. UNSUBSCRIBE
  // ----------------------------------------------------

  Notifications.unsubscribe = async function () {
    if (!realtimeChannel) {
      return;
    }

    await db.removeChannel(realtimeChannel);

    realtimeChannel = null;
  };

  // ----------------------------------------------------
  // 14. LOAD NOTIFICATIONS INTO A PAGE
  // ----------------------------------------------------

  Notifications.loadInto = async function (
    containerSelector,
    options
  ) {
    try {
      const notifications =
        await Notifications.getAll(options);

      Notifications.render(
        containerSelector,
        notifications
      );

      return notifications;

    } catch (error) {
      console.error(error);

      const container =
        document.querySelector(containerSelector);

      if (container) {
        container.textContent =
          "Unable to load notifications.";
      }

      return [];
    }
  };

  // ----------------------------------------------------
  // 15. UPDATE NOTIFICATION BADGE
  // ----------------------------------------------------

  Notifications.updateBadge = async function (
    selector
  ) {
    const badge =
      document.querySelector(selector || "[data-lc-unread-count]");

    if (!badge) {
      return 0;
    }

    try {
      const count =
        await Notifications.getUnreadCount();

      badge.textContent =
        count > 99 ? "99+" : String(count);

      badge.hidden = count === 0;

      return count;

    } catch (error) {
      console.error(
        "Unable to update unread count:",
        error
      );

      badge.hidden = true;

      return 0;
    }
  };

  // ----------------------------------------------------
  // 16. NOTIFICATION TYPE VALIDATION
  // ----------------------------------------------------

  Notifications.isValidType = function (type) {
    return VALID_TYPES.includes(type);
  };

  // ----------------------------------------------------
  // 17. CLEANUP
  // ----------------------------------------------------

  window.addEventListener("beforeunload", function () {
    if (realtimeChannel) {
      db.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }
  });

  // ----------------------------------------------------
  // 18. INITIALISE
  // ----------------------------------------------------

  console.info(
    "Lens Circle: Notification utilities loaded."
  );

})();
