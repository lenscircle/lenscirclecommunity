
/*
========================================================
LENS CIRCLE
Shared Supabase Client & Authentication Utilities
File: assets/js/supabase-client.js
========================================================

IMPORTANT:
1. Load the Supabase JS CDN before this file.
2. Replace the configuration placeholders.
3. Use only the publishable/anon key in browser code.
4. NEVER place the Supabase service-role key here.
5. Staff roles must be verified using protected database
   functions, never user-editable metadata.
========================================================
*/

(function () {
  "use strict";

  // ----------------------------------------------------
  // 1. SUPABASE CONFIGURATION
  // ----------------------------------------------------

  const SUPABASE_URL = "YOUR_SUPABASE_PROJECT_URL";

  const SUPABASE_ANON_KEY =
    "YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY";

  // ----------------------------------------------------
  // 2. CONFIGURATION VALIDATION
  // ----------------------------------------------------

  if (
    !SUPABASE_URL ||
    !SUPABASE_ANON_KEY ||
    SUPABASE_URL.includes("YOUR_SUPABASE") ||
    SUPABASE_ANON_KEY.includes("YOUR_SUPABASE")
  ) {
    console.error(
      "Lens Circle: Supabase configuration is incomplete."
    );

    window.LensCircle = {
      configured: false,
      db: null,
      error: "Supabase configuration is missing."
    };

    return;
  }

  if (!window.supabase || !window.supabase.createClient) {
    console.error(
      "Lens Circle: Supabase JavaScript SDK was not loaded."
    );

    window.LensCircle = {
      configured: false,
      db: null,
      error: "Supabase SDK is unavailable."
    };

    return;
  }

  // ----------------------------------------------------
  // 3. CREATE SHARED SUPABASE CLIENT
  // ----------------------------------------------------

  const db = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
      }
    }
  );

  // ----------------------------------------------------
  // 4. AUTHENTICATION UTILITIES
  // ----------------------------------------------------

  async function getSession() {
    const { data, error } = await db.auth.getSession();

    if (error) {
      throw error;
    }

    return data.session;
  }

  async function getCurrentUser() {
    const { data, error } = await db.auth.getUser();

    if (error) {
      throw error;
    }

    return data.user;
  }

  async function isAuthenticated() {
    const session = await getSession();
    return Boolean(session);
  }

  // ----------------------------------------------------
  // 5. STAFF ROLE VERIFICATION
  // ----------------------------------------------------

  async function hasStaffRole(requiredRole) {
    const allowedRoles = [
      "admin",
      "director",
      "moderator"
    ];

    if (!allowedRoles.includes(requiredRole)) {
      throw new Error("Invalid staff role requested.");
    }

    const session = await getSession();

    if (!session) {
      return false;
    }

    const { data, error } = await db.rpc(
      "has_staff_role",
      {
        required_role: requiredRole
      }
    );

    if (error) {
      console.error("Staff role verification failed:", error);
      return false;
    }

    return data === true;
  }

  // ----------------------------------------------------
  // 6. REQUIRE AUTHENTICATED MEMBER
  // ----------------------------------------------------

  async function requireMember(loginPath) {
    const session = await getSession();

    if (!session) {
      window.location.replace(
        loginPath || "/member/login.html"
      );

      return null;
    }

    return session;
  }

  // ----------------------------------------------------
  // 7. REQUIRE AUTHORISED STAFF
  // ----------------------------------------------------

  async function requireStaff(requiredRole, loginPath) {
    const session = await getSession();

    if (!session) {
      window.location.replace(
        loginPath || "/member/login.html"
      );

      return null;
    }

    const authorised = await hasStaffRole(requiredRole);

    if (!authorised) {
      await db.auth.signOut();

      window.location.replace(
        loginPath || "/member/login.html"
      );

      return null;
    }

    return session;
  }

  // ----------------------------------------------------
  // 8. DISPLAY NAME
  // ----------------------------------------------------

  function getDisplayName(user) {
    if (!user) {
      return "Member";
    }

    return (
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.email?.split("@")[0] ||
      "Member"
    );
  }

  // ----------------------------------------------------
  // 9. SIGN OUT
  // ----------------------------------------------------

  async function signOut(redirectPath) {
    const { error } = await db.auth.signOut();

    if (error) {
      throw error;
    }

    if (redirectPath) {
      window.location.replace(redirectPath);
    }
  }

  // ----------------------------------------------------
  // 10. AUTHENTICATION STATE LISTENER
  // ----------------------------------------------------

  function onAuthStateChange(callback) {
    return db.auth.onAuthStateChange(
      (event, session) => {
        if (typeof callback === "function") {
          callback(event, session);
        }
      }
    );
  }

  // ----------------------------------------------------
  // 11. EXPOSE SHARED API
  // ----------------------------------------------------

  window.LensCircle = Object.freeze({
    configured: true,
    db: db,

    auth: Object.freeze({
      getSession,
      getCurrentUser,
      isAuthenticated,
      hasStaffRole,
      requireMember,
      requireStaff,
      getDisplayName,
      signOut,
      onAuthStateChange
    })
  });

  console.info(
    "Lens Circle: Shared Supabase client initialized."
  );

})();
