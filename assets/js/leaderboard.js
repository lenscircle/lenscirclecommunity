
/* =========================================================
   LENS CIRCLE — LEADERBOARD MODULE
   File: assets/js/leaderboard.js

   FEATURES
   - Global photographer rankings
   - Monthly rankings
   - Weekly rankings
   - Challenge participation points
   - Competition recognition
   - Featured photographers
   - Member achievements
   - Personal ranking
   - Leaderboard filters

   EXPECTED SUPABASE RPC CONTRACTS
   - get_lens_circle_leaderboard
   - get_my_leaderboard_stats
   - get_photographer_achievements
   - get_featured_photographers
   - get_photographer_public_profile

   IMPORTANT
   Rankings and points must be calculated by trusted
   database functions. Never accept points, ranks,
   awards or reviewer identity from the browser.
   ========================================================= */

(function (window, document) {
  "use strict";

  const LC = window.LensCircle =
    window.LensCircle || {};

  const Leaderboard = {};

  const CONFIG = {
    pageSize: 20,
    periods: ["all", "monthly", "weekly"],
    categories: [
      "all",
      "photography",
      "challenges",
      "competitions"
    ]
  };

  const state = {
    entries: [],
    achievements: [],
    featured: [],
    myStats: null,
    period: "all",
    category: "all",
    search: "",
    page: 0,
    hasMore: true,
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
      .slice(0, maxLength || 300);
  }

  function list(value) {
    return Array.isArray(value) ? value : [];
  }

  function element(tag, className, content) {
    const node = document.createElement(tag);

    if (className) node.className = className;

    if (content !== undefined) {
      node.textContent = clean(content, 2000);
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
      console.info("[Lens Circle Leaderboard]", message);
    }
  }

  function formatNumber(value) {
    const number = Number(value);

    return Number.isFinite(number)
      ? new Intl.NumberFormat().format(number)
      : "0";
  }

  function formatDate(value) {
    if (!value) return "—";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "—";

    return date.toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric"
    });
  }

  function avatarInitials(name) {
    const words = clean(name, 100)
      .split(/\s+/)
      .filter(Boolean);

    return words
      .slice(0, 2)
      .map(function (word) {
        return word.charAt(0).toUpperCase();
      })
      .join("") || "LC";
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

  Leaderboard.rpc = async function (name, params) {
    const { data, error } = await db().rpc(
      name,
      params || {}
    );

    if (error) {
      console.error("[Leaderboard RPC]", name, error);
      throw error;
    }

    return data;
  };

  /* ---------------------------------------------------------
     LEADERBOARD DATA
  --------------------------------------------------------- */

  Leaderboard.load = async function (options) {
    const settings = options || {};

    if (state.loading || !state.hasMore) {
      return state.entries;
    }

    if (settings.reset) {
      state.page = 0;
      state.entries = [];
      state.hasMore = true;
    }

    state.loading = true;

    try {
      const data = await Leaderboard.rpc(
        "get_lens_circle_leaderboard",
        {
          p_period: state.period,
          p_category:
            state.category === "all"
              ? null
              : state.category,
          p_search: state.search || null,
          p_page: state.page,
          p_page_size: CONFIG.pageSize
        }
      );

      const records = list(data);

      state.entries = settings.reset
        ? records
        : state.entries.concat(records);

      state.hasMore =
        records.length === CONFIG.pageSize;

      if (records.length) {
        state.page += 1;
      }

      Leaderboard.render(state.entries);

      return state.entries;

    } finally {
      state.loading = false;
    }
  };

  Leaderboard.setPeriod = function (period) {
    const value = clean(period, 30).toLowerCase();

    if (!CONFIG.periods.includes(value)) {
      throw new Error("Invalid leaderboard period.");
    }

    state.period = value;

    return Leaderboard.load({ reset: true });
  };

  Leaderboard.setCategory = function (category) {
    const value = clean(category, 40).toLowerCase();

    if (!CONFIG.categories.includes(value)) {
      throw new Error("Invalid leaderboard category.");
    }

    state.category = value;

    return Leaderboard.load({ reset: true });
  };

  Leaderboard.search = function (query) {
    state.search = clean(query, 100);

    return Leaderboard.load({ reset: true });
  };

  /* ---------------------------------------------------------
     LEADERBOARD RENDERING
  --------------------------------------------------------- */

  Leaderboard.render = function (records) {
    const container = document.querySelector(
      "[data-leaderboard]"
    );

    if (!container) return;

    container.replaceChildren();

    if (!records.length) {
      container.appendChild(
        element(
          "p",
          "leaderboard-empty",
          "No photographer rankings are available yet."
        )
      );

      return;
    }

    records.forEach(function (person) {
      const card = element(
        "article",
        "leaderboard-card"
      );

      const rank = element(
        "span",
        "leaderboard-rank",
        person.rank
          ? "#" + person.rank
          : "—"
      );

      const avatar = element(
        "div",
        "leaderboard-avatar"
      );

      const imageUrl = safeImage(person.avatar_url);

      if (imageUrl) {
        const image = document.createElement("img");

        image.src = imageUrl;
        image.alt = "";
        image.loading = "lazy";

        avatar.appendChild(image);
      } else {
        avatar.textContent =
          avatarInitials(person.display_name);
      }

      const details = element(
        "div",
        "leaderboard-details"
      );

      const name = element(
        "h3",
        "leaderboard-name",
        person.display_name || "Lens Circle Member"
      );

      const location = element(
        "p",
        "leaderboard-location",
        person.location || "Photography enthusiast"
      );

      const achievements = element(
        "p",
        "leaderboard-achievements",
        person.recognition || ""
      );

      details.append(name, location, achievements);

      const points = element(
        "strong",
        "leaderboard-points",
        formatNumber(person.points) + " points"
      );

      const viewButton = element(
        "button",
        "leaderboard-profile-button",
        "View profile"
      );

      viewButton.type = "button";

      viewButton.addEventListener("click", function () {
        Leaderboard.openProfile(person.user_id)
          .catch(function (error) {
            notify(error.message, "error");
          });
      });

      card.append(
        rank,
        avatar,
        details,
        points,
        viewButton
      );

      container.appendChild(card);
    });
  };

  /* ---------------------------------------------------------
     LOAD MORE
  --------------------------------------------------------- */

  Leaderboard.loadMore = async function () {
    return Leaderboard.load();
  };

  /* ---------------------------------------------------------
     PERSONAL STATISTICS
  --------------------------------------------------------- */

  Leaderboard.getMyStats = async function () {
    const { data, error } = await db()
      .auth.getSession();

    if (error) throw error;

    if (!data.session) {
      return null;
    }

    const result = await Leaderboard.rpc(
      "get_my_leaderboard_stats"
    );

    state.myStats = Array.isArray(result)
      ? result[0] || null
      : result;

    Leaderboard.renderMyStats(state.myStats);

    return state.myStats;
  };

  Leaderboard.renderMyStats = function (stats) {
    const container = document.querySelector(
      "[data-my-leaderboard-stats]"
    );

    if (!container) return;

    container.replaceChildren();

    if (!stats) {
      container.appendChild(
        element(
          "p",
          "leaderboard-empty",
          "Sign in to view your photography achievements."
        )
      );

      return;
    }

    const metrics = [
      {
        label: "Global rank",
        value: stats.global_rank
          ? "#" + stats.global_rank
          : "Unranked"
      },
      {
        label: "Total points",
        value: formatNumber(stats.total_points)
      },
      {
        label: "Challenges",
        value: formatNumber(stats.challenges_participated)
      },
      {
        label: "Awards",
        value: formatNumber(stats.awards_count)
      }
    ];

    metrics.forEach(function (metric) {
      const item = element(
        "div",
        "leaderboard-stat"
      );

      item.append(
        element("span", "leaderboard-stat-label", metric.label),
        element("strong", "leaderboard-stat-value", metric.value)
      );

      container.appendChild(item);
    });
  };

  /* ---------------------------------------------------------
     ACHIEVEMENTS
  --------------------------------------------------------- */

  Leaderboard.getAchievements = async function (userId) {
    const id = clean(userId, 100);

    if (!id) {
      throw new Error("Photographer ID is required.");
    }

    const data = await Leaderboard.rpc(
      "get_photographer_achievements",
      {
        p_user_id: id
      }
    );

    state.achievements = list(data);

    Leaderboard.renderAchievements(
      state.achievements
    );

    return state.achievements;
  };

  Leaderboard.renderAchievements = function (records) {
    const container = document.querySelector(
      "[data-photographer-achievements]"
    );

    if (!container) return;

    container.replaceChildren();

    if (!records.length) {
      container.appendChild(
        element(
          "p",
          "leaderboard-empty",
          "Achievements will appear here."
        )
      );

      return;
    }

    records.forEach(function (achievement) {
      const card = element(
        "article",
        "achievement-card"
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

      const date = element(
        "small",
        "achievement-date",
        formatDate(achievement.awarded_at)
      );

      card.append(title, description, date);

      container.appendChild(card);
    });
  };

  /* ---------------------------------------------------------
     FEATURED PHOTOGRAPHERS
  --------------------------------------------------------- */

  Leaderboard.getFeatured = async function () {
    const data = await Leaderboard.rpc(
      "get_featured_photographers"
    );

    state.featured = list(data);

    Leaderboard.renderFeatured(state.featured);

    return state.featured;
  };

  Leaderboard.renderFeatured = function (records) {
    const container = document.querySelector(
      "[data-featured-photographers]"
    );

    if (!container) return;

    container.replaceChildren();

    if (!records.length) {
      container.appendChild(
        element(
          "p",
          "leaderboard-empty",
          "Featured photographers will appear here."
        )
      );

      return;
    }

    records.forEach(function (person) {
      const card = element(
        "article",
        "featured-photographer-card"
      );

      const imageUrl = safeImage(person.avatar_url);

      if (imageUrl) {
        const image = document.createElement("img");

        image.src = imageUrl;
        image.alt = "";
        image.loading = "lazy";

        card.appendChild(image);
      }

      card.append(
        element(
          "h3",
          "featured-photographer-name",
          person.display_name
        ),
        element(
          "p",
          "featured-photographer-description",
          person.featured_reason || "Featured Lens Circle photographer"
        )
      );

      const button = element(
        "button",
        "featured-photographer-button",
        "View profile"
      );

      button.type = "button";

      button.addEventListener("click", function () {
        Leaderboard.openProfile(person.user_id)
          .catch(function (error) {
            notify(error.message, "error");
          });
      });

      card.appendChild(button);

      container.appendChild(card);
    });
  };

  /* ---------------------------------------------------------
     PHOTOGRAPHER PUBLIC PROFILE
  --------------------------------------------------------- */

  Leaderboard.openProfile = async function (userId) {
    const id = clean(userId, 100);

    if (!id) {
      throw new Error("Photographer ID is required.");
    }

    const data = await Leaderboard.rpc(
      "get_photographer_public_profile",
      {
        p_user_id: id
      }
    );

    const profile = Array.isArray(data)
      ? data[0] || null
      : data;

    if (!profile) {
      throw new Error("Photographer profile not found.");
    }

    const container = document.querySelector(
      "[data-public-photographer-profile]"
    );

    if (container) {
      container.replaceChildren();

      container.append(
        element(
          "h2",
          "public-photographer-name",
          profile.display_name
        ),
        element(
          "p",
          "public-photographer-bio",
          profile.bio
        ),
        element(
          "p",
          "public-photographer-location",
          profile.location
        )
      );

      const stats = element(
        "p",
        "public-photographer-points",
        formatNumber(profile.total_points) + " points"
      );

      container.appendChild(stats);

      container.hidden = false;
    }

    if (container) {
      container.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }

    return profile;
  };

  /* ---------------------------------------------------------
     FILTER CONTROLS
  --------------------------------------------------------- */

  Leaderboard.bindControls = function () {
    const search = document.querySelector(
      "[data-leaderboard-search]"
    );

    if (search && !search.dataset.bound) {
      search.dataset.bound = "true";

      let timer;

      search.addEventListener("input", function () {
        window.clearTimeout(timer);

        timer = window.setTimeout(function () {
          Leaderboard.search(search.value)
            .catch(function (error) {
              notify(error.message, "error");
            });
        }, 300);
      });
    }

    document.querySelectorAll(
      "[data-leaderboard-period]"
    ).forEach(function (button) {
      if (button.dataset.bound) return;

      button.dataset.bound = "true";

      button.addEventListener("click", function () {
        Leaderboard.setPeriod(
          button.dataset.leaderboardPeriod
        ).catch(function (error) {
          notify(error.message, "error");
        });
      });
    });

    document.querySelectorAll(
      "[data-leaderboard-category]"
    ).forEach(function (button) {
      if (button.dataset.bound) return;

      button.dataset.bound = "true";

      button.addEventListener("click", function () {
        Leaderboard.setCategory(
          button.dataset.leaderboardCategory
        ).catch(function (error) {
          notify(error.message, "error");
        });
      });
    });

    const more = document.querySelector(
      "[data-leaderboard-load-more]"
    );

    if (more && !more.dataset.bound) {
      more.dataset.bound = "true";

      more.addEventListener("click", function () {
        more.disabled = true;

        Leaderboard.loadMore()
          .catch(function (error) {
            notify(error.message, "error");
          })
          .finally(function () {
            more.disabled = false;
            more.hidden = !state.hasMore;
          });
      });
    }
  };

  /* ---------------------------------------------------------
     INITIALISE
  --------------------------------------------------------- */

  Leaderboard.init = async function (options) {
    const settings = options || {};

    Leaderboard.bindControls();

    await Leaderboard.load({
      reset: true
    });

    if (settings.personalStats) {
      await Leaderboard.getMyStats();
    }

    if (settings.featured) {
      await Leaderboard.getFeatured();
    }

    return true;
  };

  /* ---------------------------------------------------------
     PUBLIC STATE
  --------------------------------------------------------- */

  Leaderboard.getState = function () {
    return {
      entries: state.entries.length,
      period: state.period,
      category: state.category,
      hasMore: state.hasMore,
      personalStats: state.myStats
    };
  };

  /* ---------------------------------------------------------
     EXPORT
  --------------------------------------------------------- */

  LC.leaderboard = Leaderboard;

  window.LensCircleLeaderboard = Leaderboard;

})(window, document);
