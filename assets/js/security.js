
/* =========================================================
   LENS CIRCLE — SECURITY MODULE
   File: assets/js/security.js

   FEATURES
   - Authentication session monitoring.
   - Session expiry detection.
   - Privileged portal protection.
   - Inactivity warning.
   - Secure sign-out.
   - Authentication-state listener.
   - Session refresh.
   - Cross-tab sign-out handling.
   - Security status display.

   IMPORTANT
   - Does not replace Supabase RLS.
   - Does not grant roles.
   - Does not store passwords or tokens manually.
   - Does not expose service-role credentials.
   ========================================================= */

(function (window, document) {
  "use strict";

  const LC = window.LensCircle = window.LensCircle || {};
  const Security = {};

  const DEFAULTS = {
    inactivityLimit: 30 * 60 * 1000,
    warningBeforeExpiry: 5 * 60 * 1000,
    checkInterval: 60 * 1000,
    requireSecureOrigin: true,
    redirectOnExpiry: true
  };

  const state = {
    config: Object.assign({}, DEFAULTS),
    lastActivity: Date.now(),
    session: null,
    user: null,
    authSubscription: null,
    activityHandler: null,
    interval: null,
    warningShown: false,
    initialised: false,
    checking: false,
    loggingOut: false
  };

  /* ---------------------------------------------------------
     HELPERS
  --------------------------------------------------------- */

  function select(selector) {
    return document.querySelector(selector);
  }

  function clean(value, maxLength) {
    return String(value == null ? "" : value)
      .trim()
      .slice(0, maxLength || 500);
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

  function isAuthPage() {
    return /\/(login|register|reset-password|update-password)\.html$/i
      .test(window.location.pathname);
  }

  function getPortal() {
    const path = window.location.pathname.toLowerCase();

    if (path.includes("/admin/")) return "admin";
    if (path.includes("/director/")) return "director";
    if (path.includes("/moderator/")) return "moderator";
    if (path.includes("/member/")) return "member";

    return "public";
  }

  function getLoginURL(portal) {
    const paths = {
      admin: "login.html",
      director: "login.html",
      moderator: "login.html",
      member: "login.html"
    };

    if (portal === "public") {
      return "";
    }

    return paths[portal] || "";
  }

  function redirectToLogin(portal, reason) {
    const login = getLoginURL(portal);

    if (!login) return;

    const destination = new URL(
      login,
      window.location.href
    );

    if (reason) {
      destination.searchParams.set(
        "reason",
        clean(reason, 50)
      );
    }

    window.location.replace(destination.href);
  }

  function updateActivity() {
    state.lastActivity = Date.now();
    state.warningShown = false;
  }

  function showMessage(message, type) {
    if (
      LC.forms &&
      typeof LC.forms.notify === "function"
    ) {
      LC.forms.notify(message, type || "info");
      return;
    }

    console.info("[Lens Circle Security]", message);
  }

  /* ---------------------------------------------------------
     CONFIGURATION
  --------------------------------------------------------- */

  Security.configure = function (options) {
    const settings = options || {};

    if (settings.inactivityLimit) {
      state.config.inactivityLimit = Math.max(
        60 * 1000,
        Number(settings.inactivityLimit)
      );
    }

    if (settings.warningBeforeExpiry) {
      state.config.warningBeforeExpiry = Math.max(
        30 * 1000,
        Number(settings.warningBeforeExpiry)
      );
    }

    if (settings.checkInterval) {
      state.config.checkInterval = Math.max(
        15 * 1000,
        Number(settings.checkInterval)
      );
    }

    if (
      typeof settings.requireSecureOrigin === "boolean"
    ) {
      state.config.requireSecureOrigin =
        settings.requireSecureOrigin;
    }

    if (
      typeof settings.redirectOnExpiry === "boolean"
    ) {
      state.config.redirectOnExpiry =
        settings.redirectOnExpiry;
    }

    return Security;
  };

  /* ---------------------------------------------------------
     SECURE ORIGIN CHECK
  --------------------------------------------------------- */

  Security.isSecureOrigin = function () {
    return (
      window.location.protocol === "https:" ||
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1"
    );
  };

  Security.checkSecureOrigin = function () {
    if (
      state.config.requireSecureOrigin &&
      !Security.isSecureOrigin()
    ) {
      console.error(
        "[Lens Circle Security] HTTPS is required."
      );

      return false;
    }

    return true;
  };

  /* ---------------------------------------------------------
     SESSION CHECK
  --------------------------------------------------------- */

  Security.getSession = async function () {
    const db = getClient();

    const { data, error } =
      await db.auth.getSession();

    if (error) throw error;

    state.session =
      data && data.session
        ? data.session
        : null;

    state.user =
      state.session
        ? state.session.user
        : null;

    return state.session;
  };

  Security.isAuthenticated = function () {
    return Boolean(
      state.session &&
      state.session.user
    );
  };

  Security.getCurrentUser = function () {
    return state.user;
  };

  /* ---------------------------------------------------------
     PORTAL ROLE PROTECTION
  --------------------------------------------------------- */

  Security.requirePortal = async function (
    expectedRole
  ) {
    const role = clean(expectedRole).toLowerCase();

    const allowed = [
      "admin",
      "director",
      "moderator",
      "member"
    ];

    if (!allowed.includes(role)) {
      throw new Error("Invalid portal role.");
    }

    if (!Security.checkSecureOrigin()) {
      throw new Error(
        "This portal requires a secure HTTPS connection."
      );
    }

    const session = await Security.getSession();

    if (!session) {
      redirectToLogin(role, "session-required");
      return false;
    }

    /*
     * Use the protected backend role-check function.
     * Never trust user_metadata or browser-supplied roles.
     */
    const db = getClient();

    const { data, error } = await db.rpc(
      "has_staff_role",
      {
        required_role: role
      }
    );

    if (error || data !== true) {
      console.error(
        "[Lens Circle Security] Portal access denied.",
        error || ""
      );

      await Security.logout({
        redirect: false,
        reason: "access-denied"
      });

      redirectToLogin(role, "access-denied");

      return false;
    }

    return true;
  };

  /* ---------------------------------------------------------
     ACTIVITY MONITORING
  --------------------------------------------------------- */

  Security.startActivityMonitoring = function () {
    if (state.activityHandler) return;

    const events = [
      "pointerdown",
      "keydown",
      "touchstart",
      "scroll"
    ];

    state.activityHandler = updateActivity;

    events.forEach(function (eventName) {
      document.addEventListener(
        eventName,
        state.activityHandler,
        { passive: true }
      );
    });
  };

  Security.stopActivityMonitoring = function () {
    if (!state.activityHandler) return;

    const events = [
      "pointerdown",
      "keydown",
      "touchstart",
      "scroll"
    ];

    events.forEach(function (eventName) {
      document.removeEventListener(
        eventName,
        state.activityHandler
      );
    });

    state.activityHandler = null;
  };

  /* ---------------------------------------------------------
     SESSION WARNING
  --------------------------------------------------------- */

  Security.showExpiryWarning = function () {
    if (state.warningShown) return;

    state.warningShown = true;

    const message =
      "Your session is nearing its inactivity limit. " +
      "Continue using the portal to remain active.";

    showMessage(message, "warning");

    const warning = select(
      "[data-session-warning]"
    );

    if (warning) {
      warning.hidden = false;
      warning.textContent = message;
    }
  };

  Security.hideExpiryWarning = function () {
    const warning = select(
      "[data-session-warning]"
    );

    if (warning) {
      warning.hidden = true;
    }
  };

  /* ---------------------------------------------------------
     SESSION CHECK LOOP
  --------------------------------------------------------- */

  Security.checkSession = async function () {
    if (state.checking || state.loggingOut) return;

    state.checking = true;

    try {
      const portal = getPortal();

      if (portal === "public") return;

      const session = await Security.getSession();

      if (!session) {
        if (state.config.redirectOnExpiry) {
          redirectToLogin(portal, "session-expired");
        }

        return;
      }

      const inactiveFor =
        Date.now() - state.lastActivity;

      const warningAt =
        state.config.inactivityLimit -
        state.config.warningBeforeExpiry;

      if (inactiveFor >= state.config.inactivityLimit) {
        await Security.logout({
          redirect: true,
          reason: "inactivity"
        });

        return;
      }

      if (inactiveFor >= warningAt) {
        Security.showExpiryWarning();
      } else {
        Security.hideExpiryWarning();
      }

    } catch (error) {
      console.error(
        "[Lens Circle Security] Session check failed:",
        error
      );
    } finally {
      state.checking = false;
    }
  };

  Security.startSessionMonitoring = function () {
    if (state.interval) return;

    Security.startActivityMonitoring();

    state.interval = window.setInterval(
      Security.checkSession,
      state.config.checkInterval
    );
  };

  Security.stopSessionMonitoring = function () {
    if (state.interval) {
      window.clearInterval(state.interval);
      state.interval = null;
    }

    Security.stopActivityMonitoring();
  };

  /* ---------------------------------------------------------
     REFRESH SESSION
  --------------------------------------------------------- */

  Security.refreshSession = async function () {
    const db = getClient();

    const { data, error } =
      await db.auth.refreshSession();

    if (error) throw error;

    state.session =
      data && data.session
        ? data.session
        : null;

    state.user =
      state.session
        ? state.session.user
        : null;

    updateActivity();

    return state.session;
  };

  /* ---------------------------------------------------------
     LOGOUT
  --------------------------------------------------------- */

  Security.logout = async function (options) {
    const settings = options || {};

    if (state.loggingOut) return;

    state.loggingOut = true;

    Security.stopSessionMonitoring();

    try {
      const db = getClient();

      const { error } = await db.auth.signOut({
        scope: "local"
      });

      if (error) throw error;

      state.session = null;
      state.user = null;

      if (settings.redirect !== false) {
        const portal = getPortal();

        redirectToLogin(
          portal,
          settings.reason || "signed-out"
        );
      }

      return true;

    } catch (error) {
      state.loggingOut = false;

      console.error(
        "[Lens Circle Security] Logout failed:",
        error
      );

      showMessage(
        "Unable to sign out. Please try again.",
        "error"
      );

      throw error;
    }
  };

  /* ---------------------------------------------------------
     AUTH STATE LISTENER
  --------------------------------------------------------- */

  Security.listenToAuthChanges = function () {
    if (state.authSubscription) return;

    const db = getClient();

    const { data } = db.auth.onAuthStateChange(
      function (event, session) {
        state.session = session || null;
        state.user =
          session && session.user
            ? session.user
            : null;

        if (
          event === "SIGNED_OUT" ||
          event === "USER_DELETED"
        ) {
          state.session = null;
          state.user = null;

          Security.stopSessionMonitoring();

          if (
            getPortal() !== "public" &&
            !isAuthPage()
          ) {
            redirectToLogin(
              getPortal(),
              "signed-out"
            );
          }
        }

        if (event === "SIGNED_IN") {
          updateActivity();
        }

        if (event === "TOKEN_REFRESHED") {
          state.session = session || null;
        }

        if (event === "PASSWORD_RECOVERY") {
          /*
           * Recovery pages should handle password updates
           * through their dedicated recovery workflow.
           */
          document.dispatchEvent(
            new CustomEvent(
              "lenscircle:password-recovery"
            )
          );
        }
      }
    );

    state.authSubscription =
      data && data.subscription
        ? data.subscription
        : null;
  };

  /* ---------------------------------------------------------
     CROSS-TAB LOGOUT SIGNAL
  --------------------------------------------------------- */

  Security.listenToStorageEvents = function () {
    window.addEventListener("storage", function (event) {
      if (
        event.key === "lens-circle-signout" &&
        event.newValue
      ) {
        if (getPortal() !== "public") {
          Security.logout({
            redirect: true,
            reason: "signed-out"
          }).catch(function () {});
        }
      }
    });
  };

  Security.broadcastSignOut = function () {
    try {
      localStorage.setItem(
        "lens-circle-signout",
        String(Date.now())
      );
    } catch (_) {
      // Storage may be unavailable.
    }
  };

  /* ---------------------------------------------------------
     SECURITY STATUS
  --------------------------------------------------------- */

  Security.renderStatus = function () {
    const session = state.session;

    const status = session
      ? "Authenticated"
      : "Not authenticated";

    document.querySelectorAll(
      "[data-security-status]"
    ).forEach(function (element) {
      element.textContent = status;
    });

    document.querySelectorAll(
      "[data-security-https]"
    ).forEach(function (element) {
      element.textContent =
        Security.isSecureOrigin()
          ? "Secure connection"
          : "Insecure connection";
    });
  };

  /* ---------------------------------------------------------
     INITIALISATION
  --------------------------------------------------------- */

  Security.init = async function (options) {
    if (state.initialised) return Security;

    Security.configure(options);

    if (!Security.checkSecureOrigin()) {
      throw new Error("HTTPS connection required.");
    }

    Security.listenToAuthChanges();
    Security.listenToStorageEvents();

    state.initialised = true;

    try {
      await Security.getSession();

      if (
        Security.isAuthenticated() &&
        !isAuthPage()
      ) {
        Security.startSessionMonitoring();
      }

      Security.renderStatus();

    } catch (error) {
      console.error(
        "[Lens Circle Security] Initialisation failed:",
        error
      );

      throw error;
    }

    return Security;
  };

  /* ---------------------------------------------------------
     CLEANUP
  --------------------------------------------------------- */

  Security.destroy = function () {
    Security.stopSessionMonitoring();

    if (
      state.authSubscription &&
      typeof state.authSubscription.unsubscribe === "function"
    ) {
      state.authSubscription.unsubscribe();
    }

    state.authSubscription = null;
    state.initialised = false;
  };

  /* ---------------------------------------------------------
     EXPORT
  --------------------------------------------------------- */

  LC.security = Security;
  window.LensCircleSecurity = Security;

})(window, document);
