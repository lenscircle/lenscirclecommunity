
/* =========================================================
   LENS CIRCLE — ACHIEVEMENTS MODULE
   File: assets/js/achievements.js

   FEATURES
   - Member achievement badges
   - Photography milestones
   - Competition awards
   - Challenge awards
   - Community contribution recognition
   - Achievement history
   - Public achievement showcase
   - Member achievement statistics

   EXPECTED SUPABASE RPC CONTRACTS
   - get_my_achievements
   - get_public_member_achievements
   - get_achievement_catalog
   - get_achievement_details
   - get_achievement_statistics
   - award_member_achievement
   - revoke_member_achievement

   SECURITY
   - Members cannot award achievements to themselves.
   - Only authorised staff can award or revoke achievements.
   - Achievement eligibility must be validated server-side.
   - Award and revocation actions must be audited.
   ========================================================= */

(function (window, document) {
  "use strict";

  const LC = window.LensCircle =
    window.LensCircle || {};

  const Achievements = {};

  const CONFIG = {
    pageSize: 24,

    categories: [
      "photography",
      "participation",
      "competition",
      "challenge",
      "community",
      "special"
    ]
  };

  const state = {
    mine: [],
    publicAchievements: [],
    catalog: [],
    selected: null,
    statistics: null,
    category: "all",
    loading: false
  };

  /* ---------------------------------------------------------
     HELPERS
  --------------------------------------------------------- */

  function db() {
    if (LC.db) return LC.db;

    if (LC.supabase) return LC.supabase;

    throw new Error("Supabase client is unavailable.");
  }

  function clean(value, maxLength) {
    return String(value == null ? "" : value)
      .trim()
      .slice(0, maxLength || 500);
  }

  function list(value) {
    return Array.isArray(value) ? value : [];
  }

  function element(tag, className, content) {
    const node = document.createElement(tag);

    if (className) node.className = className;

    if (content !== undefined) {
      node.textContent = clean(content, 3000);
    }

    return node;
  }

  function notify(message, type) {
    if (
      LC.forms &&
      typeof LC.forms.notify === "function"
    ) {
      LC.forms.notify(message, type || "info");
    } else {
      console.info("[Lens Circle Achievements]", message);
    }
  }

  function formatDate(value) {
    if (!value) return "—";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "—";

    return date.toLocaleDateString(undefined, {
      day: "numeric",
      month: "long",
      year: "numeric"
    });
  }

  function safeImage(url) {
    if (!url) return "";

    try {
      const parsed = new URL(url, window.location.origin);

      if (
        parsed.protocol !== "https:" &&
        parsed.origin !== window.location.origin
      ) {
        return "";
      }

      if (
        parsed.protocol !== "https:" &&
        parsed.protocol !== "http:"
      ) {
        return "";
      }

      return parsed.href;
    } catch (_) {
      return "";
    }
  }

  /* ---------------------------------------------------------
     RPC
  --------------------------------------------------------- */

  Achievements.rpc = async function (name, params) {
    const { data, error } = await db().rpc(
      name,
      params || {}
    );

    if (error) {
      console.error(
        "[Achievements RPC]",
        name,
        error
      );

      throw error;
    }

    return data;
  };

  /* ---------------------------------------------------------
     AUTHENTICATION
  --------------------------------------------------------- */

  Achievements.requireMember = async function () {
    const { data, error } = await db()
      .auth.getSession();

    if (error) throw error;

    if (!data.session) {
      window.location.assign(
        "/member/login.html"
      );

      return false;
    }

    return true;
  };

  /* ---------------------------------------------------------
     MY ACHIEVEMENTS
  --------------------------------------------------------- */

  Achievements.getMine = async function () {
    const allowed =
      await Achievements.requireMember();

    if (!allowed) return [];

    const data = await Achievements.rpc(
      "get_my_achievements"
    );

    state.mine = list(data);

    Achievements.renderMine(state.mine);

    return state.mine;
  };

  Achievements.renderMine = function (records) {
    const container = document.querySelector(
      "[data-my-achievements]"
    );

    if (!container) return;

    container.replaceChildren();

    if (!records.length) {
      container.appendChild(
        element(
          "p",
          "achievement-empty",
          "Your achievements will appear here as you participate in Lens Circle."
        )
      );

      return;
    }

    records.forEach(function (achievement) {
      const card = element(
        "article",
        "achievement-card"
      );

      const icon = element(
        "div",
        "achievement-icon",
        achievement.icon || "★"
      );

      const title = element(
        "h3",
        "achievement-title",
        achievement.title
      );

      const description = element(
        "p",
        "achievement-description",
        achievement.description
      );

      const category = element(
        "span",
        "achievement-category",
        achievement.category
      );

      const date = element(
        "small",
        "achievement-date",
        "Awarded " + formatDate(achievement.awarded_at)
      );

      card.append(
        icon,
        title,
        description,
        category,
        date
      );

      container.appendChild(card);
    });
  };

  /* ---------------------------------------------------------
     PUBLIC MEMBER ACHIEVEMENTS
  --------------------------------------------------------- */

  Achievements.getPublic = async function (userId) {
    const id = clean(userId, 100);

    if (!id) {
      throw new Error("Member ID is required.");
    }

    const data = await Achievements.rpc(
      "get_public_member_achievements",
      {
        p_user_id: id
      }
    );

    state.publicAchievements = list(data);

    Achievements.renderPublic(
      state.publicAchievements
    );

    return state.publicAchievements;
  };

  Achievements.renderPublic = function (records) {
    const container = document.querySelector(
      "[data-public-achievements]"
    );

    if (!container) return;

    container.replaceChildren();

    if (!records.length) {
      container.appendChild(
        element(
          "p",
          "achievement-empty",
          "No public achievements have been displayed yet."
        )
      );

      return;
    }

    records.forEach(function (achievement) {
      const card = element(
        "article",
        "public-achievement-card"
      );

      card.append(
        element(
          "span",
          "achievement-icon",
          achievement.icon || "★"
        ),
        element(
          "h3",
          "achievement-title",
          achievement.title
        ),
        element(
          "p",
          "achievement-description",
          achievement.description
        ),
        element(
          "small",
          "achievement-date",
          formatDate(achievement.awarded_at)
        )
      );

      container.appendChild(card);
    });
  };

  /* ---------------------------------------------------------
     ACHIEVEMENT CATALOG
  --------------------------------------------------------- */

  Achievements.getCatalog = async function () {
    const data = await Achievements.rpc(
      "get_achievement_catalog"
    );

    state.catalog = list(data);

    Achievements.renderCatalog(state.catalog);

    return state.catalog;
  };

  Achievements.renderCatalog = function (records) {
    const container = document.querySelector(
      "[data-achievement-catalog]"
    );

    if (!container) return;

    container.replaceChildren();

    const filtered = state.category === "all"
      ? records
      : records.filter(function (item) {
          return item.category === state.category;
        });

    if (!filtered.length) {
      container.appendChild(
        element(
          "p",
          "achievement-empty",
          "No achievements found in this category."
        )
      );

      return;
    }

    filtered.forEach(function (achievement) {
      const card = element(
        "article",
        "achievement-catalog-card"
      );

      card.append(
        element(
          "div",
          "achievement-icon",
          achievement.icon || "★"
        ),
        element(
          "h3",
          "achievement-title",
          achievement.title
        ),
        element(
          "p",
          "achievement-description",
          achievement.description
        ),
        element(
          "span",
          "achievement-category",
          achievement.category
        )
      );

      const status = element(
        "small",
        "achievement-requirement",
        achievement.requirement || "Recognition award"
      );

      card.appendChild(status);

      container.appendChild(card);
    });
  };

  /* ---------------------------------------------------------
     ACHIEVEMENT DETAILS
  --------------------------------------------------------- */

  Achievements.getDetails = async function (
    achievementId
  ) {
    const id = clean(achievementId, 100);

    if (!id) {
      throw new Error("Achievement ID is required.");
    }

    const data = await Achievements.rpc(
      "get_achievement_details",
      {
        p_achievement_id: id
      }
    );

    state.selected = Array.isArray(data)
      ? data[0] || null
      : data;

    Achievements.renderDetails(state.selected);

    return state.selected;
  };

  Achievements.renderDetails = function (achievement) {
    const container = document.querySelector(
      "[data-achievement-details]"
    );

    if (!container) return;

    container.replaceChildren();

    if (!achievement) {
      container.appendChild(
        element(
          "p",
          "achievement-empty",
          "Achievement not found."
        )
      );

      return;
    }

    container.append(
      element(
        "h2",
        "achievement-detail-title",
        achievement.title
      ),
      element(
        "p",
        "achievement-detail-description",
        achievement.description
      ),
      element(
        "p",
        "achievement-detail-category",
        achievement.category
      ),
      element(
        "p",
        "achievement-detail-requirement",
        achievement.requirement
      )
    );
  };

  /* ---------------------------------------------------------
     ACHIEVEMENT STATISTICS
  --------------------------------------------------------- */

  Achievements.getStatistics = async function () {
    const data = await Achievements.rpc(
      "get_achievement_statistics"
    );

    state.statistics = Array.isArray(data)
      ? data[0] || {}
      : data || {};

    Achievements.renderStatistics(
      state.statistics
    );

    return state.statistics;
  };

  Achievements.renderStatistics = function (stats) {
    const container = document.querySelector(
      "[data-achievement-statistics]"
    );

    if (!container) return;

    container.replaceChildren();

    const metrics = [
      ["Achievements awarded", stats.total_awarded],
      ["Photographers recognised", stats.members_recognised],
      ["Available badges", stats.available_badges],
      ["Awards this month", stats.awards_this_month]
    ];

    metrics.forEach(function (metric) {
      const card = element(
        "div",
        "achievement-stat"
      );

      card.append(
        element(
          "span",
          "achievement-stat-label",
          metric[0]
        ),
        element(
          "strong",
          "achievement-stat-value",
          String(Number(metric[1]) || 0)
        )
      );

      container.appendChild(card);
    });
  };

  /* ---------------------------------------------------------
     STAFF — AWARD ACHIEVEMENT
  --------------------------------------------------------- */

  Achievements.award = async function (payload) {
    const userId = clean(payload.user_id, 100);
    const achievementId = clean(
      payload.achievement_id,
      100
    );

    const reason = clean(payload.reason, 1000);

    if (!userId || !achievementId) {
      throw new Error(
        "Member and achievement are required."
      );
    }

    const result = await Achievements.rpc(
      "award_member_achievement",
      {
        p_user_id: userId,
        p_achievement_id: achievementId,
        p_reason: reason || null
      }
    );

    notify("Achievement awarded successfully.", "success");

    return result;
  };

  /* ---------------------------------------------------------
     STAFF — REVOKE ACHIEVEMENT
  --------------------------------------------------------- */

  Achievements.revoke = async function (
    memberAchievementId,
    reason
  ) {
    const id = clean(memberAchievementId, 100);
    const explanation = clean(reason, 1000);

    if (!id) {
      throw new Error(
        "Member achievement ID is required."
      );
    }

    if (!explanation) {
      throw new Error(
        "A revocation reason is required."
      );
    }

    if (!window.confirm(
      "Revoke this achievement?"
    )) {
      return false;
    }

    await Achievements.rpc(
      "revoke_member_achievement",
      {
        p_member_achievement_id: id,
        p_reason: explanation
      }
    );

    notify("Achievement revoked.", "success");

    return true;
  };

  /* ---------------------------------------------------------
     CATEGORY FILTER
  --------------------------------------------------------- */

  Achievements.setCategory = function (category) {
    const value = clean(category, 40).toLowerCase();

    if (
      value !== "all" &&
      !CONFIG.categories.includes(value)
    ) {
      throw new Error("Invalid achievement category.");
    }

    state.category = value;

    Achievements.renderCatalog(state.catalog);
  };

  Achievements.bindFilters = function () {
    document.querySelectorAll(
      "[data-achievement-category]"
    ).forEach(function (button) {
      if (button.dataset.bound) return;

      button.dataset.bound = "true";

      button.addEventListener("click", function () {
        Achievements.setCategory(
          button.dataset.achievementCategory
        );
      });
    });
  };

  /* ---------------------------------------------------------
     INITIALISATION
  --------------------------------------------------------- */

  Achievements.init = async function (options) {
    const settings = options || {};

    Achievements.bindFilters();

    if (settings.member) {
      await Achievements.getMine();
    }

    if (settings.catalog) {
      await Achievements.getCatalog();
    }

    if (settings.statistics) {
      await Achievements.getStatistics();
    }

    return true;
  };

  /* ---------------------------------------------------------
     STATE
  --------------------------------------------------------- */

  Achievements.getState = function () {
    return {
      myAchievements: state.mine.length,
      publicAchievements: state.publicAchievements.length,
      catalogCount: state.catalog.length,
      category: state.category
    };
  };

  /* ---------------------------------------------------------
     EXPORT
  --------------------------------------------------------- */

  LC.achievements = Achievements;

  window.LensCircleAchievements = Achievements;

})(window, document);
