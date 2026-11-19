
/* =========================================================
   LENS CIRCLE — MEMBERS MODULE
   File: assets/js/members.js

   FEATURES
   - Search public member profiles.
   - Retrieve public photographer profiles.
   - Retrieve the current user's own profile.
   - Retrieve member directories for authorised staff.
   - Update own profile information.
   - Update profile visibility.
   - Suspend or reinstate member access through protected RPCs.
   - Render member cards and profile information.
   - Filter and sort member directories.

   REQUIRED DATABASE RPC CONTRACTS
   search_public_members(p_query, p_limit, p_offset)
   get_public_member_profile(p_username)
   get_my_member_profile()
   update_my_member_profile(
     p_full_name,
     p_username,
     p_bio,
     p_location,
     p_website,
     p_interests,
     p_is_public,
     p_avatar_path
   )
   get_staff_member_directory(p_query, p_status, p_limit, p_offset)
   get_staff_member_details(p_member_id)
   update_member_access(p_member_id, p_action, p_reason)

   SECURITY
   - Public searches return only public profile fields.
   - Members can update only their own profiles.
   - User metadata must never determine staff roles.
   - Member suspension and reinstatement are staff-only.
   - Admin authority must be verified in PostgreSQL.
   - Directors and Moderators require explicit permissions.
   - Never accept a caller ID as proof of identity.
   - Database derives the acting user from auth.uid().
   ========================================================= */

(function (window, document) {
  "use strict";

  const LC = window.LensCircle = window.LensCircle || {};
  const Members = {};

  const RPC = Object.freeze({
    SEARCH_PUBLIC: "search_public_members",
    PUBLIC_PROFILE: "get_public_member_profile",
    MY_PROFILE: "get_my_member_profile",
    UPDATE_PROFILE: "update_my_member_profile",
    STAFF_DIRECTORY: "get_staff_member_directory",
    STAFF_DETAILS: "get_staff_member_details",
    UPDATE_ACCESS: "update_member_access"
  });

  const MEMBER_STATUSES = Object.freeze([
    "active",
    "suspended",
    "pending",
    "deactivated"
  ]);

  const ACCESS_ACTIONS = Object.freeze([
    "suspend",
    "reinstate"
  ]);

  const MAX_SEARCH_RESULTS = 50;
  const DEFAULT_PAGE_SIZE = 20;

  const state = {
    publicMembers: [],
    staffMembers: [],
    currentProfile: null,
    currentMember: null,
    filters: {
      search: "",
      status: "all",
      sort: "recent"
    },
    pagination: {
      page: 0,
      pageSize: DEFAULT_PAGE_SIZE
    }
  };

  /* ---------------------------------------------------------
     CORE HELPERS
  --------------------------------------------------------- */

  function getClient() {
    const client = LC.db || LC.supabase;

    if (!client || typeof client.rpc !== "function") {
      throw new Error(
        "Supabase client unavailable. Check supabase-client.js."
      );
    }

    return client;
  }

  async function requireUser() {
    const result = await getClient().auth.getUser();

    if (result.error) throw result.error;

    if (!result.data || !result.data.user) {
      throw new Error("Please sign in to continue.");
    }

    return result.data.user;
  }

  async function callRPC(name, params) {
    const result = await getClient().rpc(name, params || {});

    if (result.error) {
      console.error("[Lens Circle Members]", name, result.error);

      throw new Error(
        result.error.message || "The member request failed."
      );
    }

    return result.data;
  }

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

  function safeWebsite(value) {
    const website = cleanText(value, 1000);

    if (!website) return "";

    try {
      const url = new URL(
        website.startsWith("http") ? website : "https://" + website
      );

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

  function safeImageURL(value) {
    const image = cleanText(value, 2000);

    if (!image) return "";

    try {
      const url = new URL(image, window.location.origin);

      if (
        url.protocol !== "https:" &&
        url.origin !== window.location.origin
      ) {
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

  function normaliseStatus(value) {
    const status = cleanText(value, 30).toLowerCase();

    return MEMBER_STATUSES.includes(status)
      ? status
      : "active";
  }

  function unwrapRows(data, key) {
    if (Array.isArray(data)) return data;

    if (data && key && Array.isArray(data[key])) {
      return data[key];
    }

    if (data && typeof data === "object") {
      return [data];
    }

    return [];
  }

  function validateUsername(value) {
    const username = cleanText(value, 30)
      .toLowerCase()
      .replace(/^@/, "");

    if (!/^[a-z0-9_]{3,30}$/.test(username)) {
      throw new Error(
        "Username must be 3–30 characters using letters, numbers or underscores."
      );
    }

    return username;
  }

  function validateUUID(value, label) {
    const id = cleanText(value, 100);

    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
    ) {
      throw new Error("A valid " + label + " ID is required.");
    }

    return id;
  }

  function normaliseInterests(value) {
    let interests = value;

    if (typeof interests === "string") {
      interests = interests.split(",");
    }

    if (!Array.isArray(interests)) return [];

    return [...new Set(
      interests
        .map(item => cleanText(item, 50))
        .filter(Boolean)
    )].slice(0, 20);
  }

  function normaliseMember(row) {
    const item = row || {};

    return {
      id: cleanText(item.id || item.member_id, 100),
      username: cleanText(item.username, 30).toLowerCase(),
      full_name: cleanText(
        item.full_name || item.display_name,
        120
      ),
      bio: cleanText(item.bio, 1000),
      location: cleanText(item.location, 120),
      website: safeWebsite(item.website),
      avatar_url: safeImageURL(
        item.avatar_url || item.avatar
      ),
      interests: normaliseInterests(item.interests),
      is_public: item.is_public === true,
      status: normaliseStatus(item.status),
      joined_at: item.joined_at || item.created_at || null,
      photography_count: Number(item.photography_count) || 0,
      exhibition_count: Number(item.exhibition_count) || 0
    };
  }

  function formatDate(value) {
    if (!value) return "Member";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "Member";

    return new Intl.DateTimeFormat("en-IN", {
      month: "short",
      year: "numeric"
    }).format(date);
  }

  function displayName(member) {
    return member.full_name || member.username || "Lens Circle member";
  }

  /* ---------------------------------------------------------
     PUBLIC MEMBER SEARCH
  --------------------------------------------------------- */

  /**
   * Search public member profiles.
   *
   * The database must return only profiles whose visibility
   * is public and whose account is eligible for discovery.
   */
  Members.searchPublic = async function (query, options) {
    const settings = options || {};
    const search = cleanText(query, 120);

    const limit = Math.min(
      Math.max(Number(settings.limit) || DEFAULT_PAGE_SIZE, 1),
      MAX_SEARCH_RESULTS
    );

    const offset = Math.max(Number(settings.offset) || 0, 0);

    const data = await callRPC(RPC.SEARCH_PUBLIC, {
      p_query: search,
      p_limit: limit,
      p_offset: offset
    });

    state.publicMembers = unwrapRows(data, "members")
      .map(normaliseMember)
      .filter(member => member.is_public);

    return state.publicMembers;
  };

  /* ---------------------------------------------------------
     PUBLIC MEMBER PROFILE
  --------------------------------------------------------- */

  Members.getPublicProfile = async function (username) {
    const handle = validateUsername(username);

    const data = await callRPC(RPC.PUBLIC_PROFILE, {
      p_username: handle
    });

    const row = Array.isArray(data) ? data[0] : data;

    if (!row) {
      throw new Error("This public profile could not be found.");
    }

    const profile = normaliseMember(row);

    if (!profile.is_public) {
      throw new Error("This profile is not publicly available.");
    }

    return profile;
  };

  /* ---------------------------------------------------------
     CURRENT MEMBER PROFILE
  --------------------------------------------------------- */

  Members.getMyProfile = async function () {
    await requireUser();

    const data = await callRPC(RPC.MY_PROFILE);

    const row = Array.isArray(data) ? data[0] : data;

    if (!row) {
      throw new Error("Your member profile could not be found.");
    }

    state.currentProfile = normaliseMember(row);

    return state.currentProfile;
  };

  Members.updateMyProfile = async function (input) {
    await requireUser();

    const values = input || {};

    const fullName = cleanText(values.fullName, 120);
    const username = validateUsername(values.username);
    const bio = cleanText(values.bio, 1000);
    const location = cleanText(values.location, 120);
    const website = safeWebsite(values.website);
    const interests = normaliseInterests(values.interests);
    const isPublic = values.isPublic === true;
    const avatarPath = cleanText(values.avatarPath, 1000);

    if (fullName.length < 2) {
      throw new Error("Enter your full name.");
    }

    if (
      avatarPath &&
      (
        avatarPath.startsWith("/") ||
        avatarPath.includes("..")
      )
    ) {
      throw new Error("Invalid profile image path.");
    }

    const data = await callRPC(RPC.UPDATE_PROFILE, {
      p_full_name: fullName,
      p_username: username,
      p_bio: bio,
      p_location: location,
      p_website: website || null,
      p_interests: interests,
      p_is_public: isPublic,
      p_avatar_path: avatarPath || null
    });

    return data;
  };

  /* ---------------------------------------------------------
     STAFF MEMBER DIRECTORY
  --------------------------------------------------------- */

  /**
   * Staff directory.
   *
   * The database must verify the caller's permissions and limit
   * the fields returned according to the staff role.
   *
   * Directors and Moderators must not automatically receive
   * organisation-wide member access.
   */
  Members.getStaffDirectory = async function (options) {
    await requireUser();

    const settings = options || {};

    const query = cleanText(settings.search, 120);
    const status = cleanText(
      settings.status || "all",
      30
    ).toLowerCase();

    if (
      status !== "all" &&
      !MEMBER_STATUSES.includes(status)
    ) {
      throw new Error("Invalid member status filter.");
    }

    const limit = Math.min(
      Math.max(Number(settings.limit) || DEFAULT_PAGE_SIZE, 1),
      MAX_SEARCH_RESULTS
    );

    const offset = Math.max(Number(settings.offset) || 0, 0);

    const data = await callRPC(RPC.STAFF_DIRECTORY, {
      p_query: query,
      p_status: status === "all" ? null : status,
      p_limit: limit,
      p_offset: offset
    });

    state.staffMembers = unwrapRows(data, "members")
      .map(normaliseMember);

    return state.staffMembers;
  };

  Members.getStaffMemberDetails = async function (memberId) {
    await requireUser();

    const id = validateUUID(memberId, "member");

    const data = await callRPC(RPC.STAFF_DETAILS, {
      p_member_id: id
    });

    const row = Array.isArray(data) ? data[0] : data;

    if (!row) throw new Error("Member record not found.");

    state.currentMember = normaliseMember(row);

    return state.currentMember;
  };

  /* ---------------------------------------------------------
     STAFF: MEMBER ACCESS
  --------------------------------------------------------- */

  /**
   * Suspend or reinstate a member.
   *
   * The database must:
   * - Verify the caller's active staff role.
   * - Verify permission for this specific action.
   * - Prevent self-suspension where appropriate.
   * - Prevent changes to Admin and protected staff accounts
   *   through ordinary member-management operations.
   * - Record an audit log.
   * - Validate the reason.
   */
  Members.updateAccess = async function (
    memberId,
    action,
    reason
  ) {
    await requireUser();

    const id = validateUUID(memberId, "member");
    const nextAction = cleanText(action, 30).toLowerCase();
    const note = cleanText(reason, 1000);

    if (!ACCESS_ACTIONS.includes(nextAction)) {
      throw new Error("Invalid member access action.");
    }

    if (note.length < 5) {
      throw new Error("Provide a reason for this action.");
    }

    return callRPC(RPC.UPDATE_ACCESS, {
      p_member_id: id,
      p_action: nextAction,
      p_reason: note
    });
  };

  /* ---------------------------------------------------------
     FILTERING AND SORTING
  --------------------------------------------------------- */

  Members.setFilters = function (filters) {
    const values = filters || {};

    if (values.search !== undefined) {
      state.filters.search = cleanText(values.search, 120)
        .toLowerCase();
    }

    if (values.status !== undefined) {
      const status = cleanText(values.status, 30).toLowerCase();

      state.filters.status =
        status === "all" || MEMBER_STATUSES.includes(status)
          ? status
          : "all";
    }

    if (values.sort !== undefined) {
      const sort = cleanText(values.sort, 30).toLowerCase();

      state.filters.sort = [
        "recent",
        "name",
        "photographs",
        "joined"
      ].includes(sort)
        ? sort
        : "recent";
    }

    return Members.getFilteredMembers();
  };

  Members.getFilteredMembers = function (source) {
    let items = Array.isArray(source)
      ? source.map(normaliseMember)
      : state.publicMembers.slice();

    const filters = state.filters;

    items = items.filter(function (member) {
      if (
        filters.status !== "all" &&
        member.status !== filters.status
      ) {
        return false;
      }

      if (filters.search) {
        const searchable = [
          member.full_name,
          member.username,
          member.location,
          member.bio,
          member.interests.join(" ")
        ].join(" ").toLowerCase();

        if (!searchable.includes(filters.search)) {
          return false;
        }
      }

      return true;
    });

    switch (filters.sort) {
      case "name":
        items.sort((a, b) =>
          displayName(a).localeCompare(displayName(b))
        );
        break;

      case "photographs":
        items.sort((a, b) =>
          b.photography_count - a.photography_count
        );
        break;

      case "joined":
        items.sort((a, b) =>
          new Date(a.joined_at || 0) -
          new Date(b.joined_at || 0)
        );
        break;

      case "recent":
      default:
        items.sort((a, b) =>
          new Date(b.joined_at || 0) -
          new Date(a.joined_at || 0)
        );
        break;
    }

    return items;
  };

  /* ---------------------------------------------------------
     MEMBER CARD RENDERING
  --------------------------------------------------------- */

  Members.renderCard = function (member) {
    const item = normaliseMember(member);

    const avatar = item.avatar_url
      ? `<img src="${escapeHTML(item.avatar_url)}"
          alt="${escapeHTML(displayName(item))}"
          loading="lazy">`
      : `<span class="member-avatar-placeholder">
          ${escapeHTML(
            displayName(item).charAt(0).toUpperCase()
          )}
        </span>`;

    const profileURL = item.username
      ? "profile.html?username=" + encodeURIComponent(item.username)
      : "#";

    return `
      <article class="member-card"
        data-member-id="${escapeHTML(item.id)}">

        <div class="member-card-avatar">
          ${avatar}
        </div>

        <div class="member-card-content">
          <h3>${escapeHTML(displayName(item))}</h3>

          ${
            item.username
              ? `<p class="member-username">
                  @${escapeHTML(item.username)}
                </p>`
              : ""
          }

          ${
            item.location
              ? `<p class="member-location">
                  ${escapeHTML(item.location)}
                </p>`
              : ""
          }

          ${
            item.bio
              ? `<p class="member-bio">
                  ${escapeHTML(item.bio)}
                </p>`
              : ""
          }

          ${
            item.interests.length
              ? `<div class="member-interests">
                  ${item.interests.map(interest =>
                    `<span>${escapeHTML(interest)}</span>`
                  ).join("")}
                </div>`
              : ""
          }

          <div class="member-card-stats">
            <span>${item.photography_count} photographs</span>
            <span>Member since ${escapeHTML(formatDate(item.joined_at))}</span>
          </div>

          <a class="btn btn-secondary"
             href="${escapeHTML(profileURL)}">
            View profile
          </a>
        </div>
      </article>
    `;
  };

  Members.renderDirectory = function (container, source) {
    const target =
      typeof container === "string"
        ? document.querySelector(container)
        : container;

    if (!target) {
      throw new Error("Member directory container was not found.");
    }

    const members = Members.getFilteredMembers(source);

    if (!members.length) {
      target.innerHTML = `
        <div class="member-empty-state">
          <h3>No members found</h3>
          <p>Try a different search or filter.</p>
        </div>
      `;
      return;
    }

    target.innerHTML = members
      .map(Members.renderCard)
      .join("");
  };

  /* ---------------------------------------------------------
     PROFILE RENDERING
  --------------------------------------------------------- */

  Members.renderProfile = function (container, profile) {
    const target =
      typeof container === "string"
        ? document.querySelector(container)
        : container;

    if (!target) {
      throw new Error("Profile container was not found.");
    }

    const member = normaliseMember(profile);

    if (!member.is_public) {
      target.innerHTML = `
        <div class="member-empty-state">
          <h2>Profile unavailable</h2>
          <p>This photographer has not made their profile public.</p>
        </div>
      `;
      return;
    }

    const avatar = member.avatar_url
      ? `<img src="${escapeHTML(member.avatar_url)}"
          alt="${escapeHTML(displayName(member))}">`
      : `<span class="member-avatar-placeholder">
          ${escapeHTML(
            displayName(member).charAt(0).toUpperCase()
          )}
        </span>`;

    target.innerHTML = `
      <section class="member-profile">
        <div class="member-profile-avatar">
          ${avatar}
        </div>

        <div class="member-profile-content">
          <p class="member-profile-eyebrow">Lens Circle Photographer</p>

          <h1>${escapeHTML(displayName(member))}</h1>

          ${
            member.username
         