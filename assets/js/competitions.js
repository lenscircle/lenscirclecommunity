
/**
 * LENS CIRCLE — COMPETITIONS MODULE
 * File: assets/js/competitions.js
 *
 * Responsibilities:
 * - Fetch published competitions
 * - Fetch individual competition details
 * - Register and withdraw members
 * - Retrieve competition results
 * - Staff-side competition creation and updates
 * - Safe competition card rendering
 *
 * SECURITY:
 * All privileged operations must be enforced by Supabase RPC functions.
 * Never trust client-provided roles, reviewer IDs, scores or ownership.
 *
 * REQUIRED RPC CONTRACT:
 *
 * get_published_competitions()
 * get_competition_details(p_competition_id)
 * register_for_competition(p_competition_id)
 * withdraw_from_competition(p_competition_id)
 * get_competition_results(p_competition_id)
 * create_competition(p_title, p_description, p_category,
 *   p_submission_start, p_submission_end, p_rules, p_status)
 * update_competition(p_competition_id, p_title, p_description,
 *   p_category, p_submission_start, p_submission_end, p_rules, p_status)
 *
 * These functions must derive the authenticated user using auth.uid().
 */

(function () {
  "use strict";

  const CONFIG = {
    rpc: {
      list: "get_published_competitions",
      details: "get_competition_details",
      register: "register_for_competition",
      withdraw: "withdraw_from_competition",
      results: "get_competition_results",
      create: "create_competition",
      update: "update_competition"
    },

    categories: [
      "Nature & Wildlife",
      "Portrait",
      "Street & Documentary",
      "Creative & Experimental",
      "Landscape",
      "Architecture",
      "Macro",
      "Mobile Photography"
    ],

    statuses: {
      draft: "Draft",
      upcoming: "Upcoming",
      open: "Open for Entries",
      judging: "Judging",
      completed: "Completed",
      cancelled: "Cancelled"
    },

    pageSize: 12
  };

  const state = {
    competitions: [],
    currentCompetition: null,
    currentResults: [],
    loading: false
  };

  const db = () => {
    if (
      window.LensCircle &&
      window.LensCircle.db
    ) {
      return window.LensCircle.db;
    }

    if (window.supabaseClient) {
      return window.supabaseClient;
    }

    throw new Error(
      "Lens Circle Supabase client is not available."
    );
  };

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

  function normaliseCompetition(item) {
    if (!item || typeof item !== "object") {
      return null;
    }

    return {
      id: item.id || item.competition_id || "",
      title: item.title || "Untitled Competition",
      description: item.description || "",
      category: item.category || "General",
      status: item.status || "upcoming",
      submissionStart: item.submission_start || null,
      submissionEnd: item.submission_end || null,
      coverImage: item.cover_image_url || "",
      rules: item.rules || "",
      entryCount: Number(item.entry_count || 0),
      createdAt: item.created_at || null
    };
  }

  function formatDate(value) {
    if (!value) return "To be announced";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "To be announced";
    }

    return new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric"
    }).format(date);
  }

  function getStatusLabel(status) {
    return CONFIG.statuses[status] || status || "Upcoming";
  }

  function getDeadlineState(competition) {
    const now = Date.now();
    const start = competition.submissionStart
      ? new Date(competition.submissionStart).getTime()
      : null;
    const end = competition.submissionEnd
      ? new Date(competition.submissionEnd).getTime()
      : null;

    if (competition.status === "cancelled") {
      return "cancelled";
    }

    if (competition.status === "completed") {
      return "completed";
    }

    if (competition.status === "judging") {
      return "judging";
    }

    if (start && now < start) {
      return "upcoming";
    }

    if (end && now > end) {
      return "closed";
    }

    if (
      competition.status === "open" ||
      (!start && !end)
    ) {
      return "open";
    }

    return competition.status;
  }

  function renderCard(competition) {
    const item = normaliseCompetition(competition);

    if (!item) return "";

    const deadlineState = getDeadlineState(item);

    const image = item.coverImage
      ? `
        <img
          class="lc-competition-card__image"
          src="${escapeHTML(item.coverImage)}"
          alt="${escapeHTML(item.title)}"
          loading="lazy"
        >
      `
      : `
        <div class="lc-competition-card__placeholder">
          <span>Lens Circle</span>
        </div>
      `;

    return `
      <article class="lc-competition-card"
        data-competition-id="${escapeHTML(item.id)}">

        <div class="lc-competition-card__visual">
          ${image}
          <span class="lc-competition-card__status
            lc-status--${escapeHTML(deadlineState)}">
            ${escapeHTML(getStatusLabel(deadlineState))}
          </span>
        </div>

        <div class="lc-competition-card__body">

          <p class="lc-competition-card__category">
            ${escapeHTML(item.category)}
          </p>

          <h3>${escapeHTML(item.title)}</h3>

          <p class="lc-competition-card__description">
            ${escapeHTML(item.description)}
          </p>

          <div class="lc-competition-card__meta">
            <span>
              <strong>Entries close</strong>
              ${escapeHTML(formatDate(item.submissionEnd))}
            </span>

            <span>
              <strong>Entries</strong>
              ${escapeHTML(item.entryCount)}
            </span>
          </div>

          <button
            type="button"
            class="lc-button lc-button--dark"
            data-action="view-competition"
            data-id="${escapeHTML(item.id)}"
            ${item.id ? "" : "disabled"}>
            Explore Competition
          </button>

        </div>
      </article>
    `;
  }

  function renderList(container, competitions) {
    if (!container) return;

    if (!competitions.length) {
      container.innerHTML = `
        <div class="lc-competition-empty">
          <h3>No competitions available</h3>
          <p>
            New photography competitions will appear here.
            Keep creating and stay connected with Lens Circle.
          </p>
        </div>
      `;
      return;
    }

    container.innerHTML = competitions
      .map(renderCard)
      .join("");
  }

  async function getPublished() {
    state.loading = true;

    try {
      const { data, error } = await db().rpc(
        CONFIG.rpc.list
      );

      if (error) throw error;

      state.competitions = Array.isArray(data)
        ? data.map(normaliseCompetition).filter(Boolean)
        : [];

      return {
        success: true,
        data: state.competitions
      };

    } catch (error) {
      console.error(
        "Competition listing failed:",
        error
      );

      return {
        success: false,
        data: [],
        error: error.message || "Unable to load competitions."
      };

    } finally {
      state.loading = false;
    }
  }

  async function loadInto(selector) {
    const container = typeof selector === "string"
      ? document.querySelector(selector)
      : selector;

    if (!container) {
      return {
        success: false,
        error: "Competition container not found."
      };
    }

    container.innerHTML = `
      <div class="lc-competition-loading">
        Loading competitions...
      </div>
    `;

    const result = await getPublished();

    if (!result.success) {
      container.innerHTML = `
        <div class="lc-competition-error">
          <p>Competitions could not be loaded.</p>
          <button type="button"
            class="lc-button lc-button--outline"
            data-action="reload-competitions">
            Try again
          </button>
        </div>
      `;

      return result;
    }

    renderList(container, result.data);
    return result;
  }

  async function getDetails(competitionId) {
    if (!competitionId) {
      throw new Error("Competition ID is required.");
    }

    const { data, error } = await db().rpc(
      CONFIG.rpc.details,
      {
        p_competition_id: competitionId
      }
    );

    if (error) throw error;

    const record = Array.isArray(data)
      ? data[0]
      : data;

    if (!record) {
      throw new Error("Competition not found.");
    }

    state.currentCompetition = normaliseCompetition(record);

    return {
      success: true,
      data: state.currentCompetition,
      raw: record
    };
  }

  async function register(competitionId) {
    if (!competitionId) {
      throw new Error("Competition ID is required.");
    }

    const { data, error } = await db().rpc(
      CONFIG.rpc.register,
      {
        p_competition_id: competitionId
      }
    );

    if (error) throw error;

    return {
      success: true,
      data
    };
  }

  async function withdraw(competitionId) {
    if (!competitionId) {
      throw new Error("Competition ID is required.");
    }

    const confirmed = window.confirm(
      "Are you sure you want to withdraw from this competition?"
    );

    if (!confirmed) {
      return {
        success: false,
        cancelled: true
      };
    }

    const { data, error } = await db().rpc(
      CONFIG.rpc.withdraw,
      {
        p_competition_id: competitionId
      }
    );

    if (error) throw error;

    return {
      success: true,
      data
    };
  }

  async function getResults(competitionId) {
    if (!competitionId) {
      throw new Error("Competition ID is required.");
    }

    const { data, error } = await db().rpc(
      CONFIG.rpc.results,
      {
        p_competition_id: competitionId
      }
    );

    if (error) throw error;

    state.currentResults = Array.isArray(data)
      ? data
      : [];

    return {
      success: true,
      data: state.currentResults
    };
  }

  async function create(payload) {
    if (!payload || !payload.title || !payload.category) {
      throw new Error(
        "Competition title and category are required."
      );
    }

    if (!CONFIG.categories.includes(payload.category)) {
      throw new Error("Invalid competition category.");
    }

    const { data, error } = await db().rpc(
      CONFIG.rpc.create,
      {
        p_title: payload.title.trim(),
        p_description: payload.description || "",
        p_category: payload.category,
        p_submission_start: payload.submissionStart || null,
        p_submission_end: payload.submissionEnd || null,
        p_rules: payload.rules || "",
        p_status: payload.status || "draft"
      }
    );

    if (error) throw error;

    return {
      success: true,
      data
    };
  }

  async function update(competitionId, payload) {
    if (!competitionId) {
      throw new Error("Competition ID is required.");
    }

    if (!payload || !payload.title || !payload.category) {
      throw new Error(
        "Competition title and category are required."
      );
    }

    if (!CONFIG.categories.includes(payload.category)) {
      throw new Error("Invalid competition category.");
    }

    const { data, error } = await db().rpc(
      CONFIG.rpc.update,
      {
        p_competition_id: competitionId,
        p_title: payload.title.trim(),
        p_description: payload.description || "",
        p_category: payload.category,
        p_submission_start: payload.submissionStart || null,
        p_submission_end: payload.submissionEnd || null,
        p_rules: payload.rules || "",
        p_status: payload.status || "draft"
      }
    );

    if (error) throw error;

    return {
      success: true,
      data
    };
  }

  function renderResults(container, results) {
    if (!container) return;

    if (!results.length) {
      container.innerHTML = `
        <div class="lc-competition-empty">
          <h3>Results are not available yet</h3>
          <p>
            Final results will be published after the judging process.
          </p>
        </div>
      `;
      return;
    }

    container.innerHTML = results.map((result, index) => `
      <article class="lc-result-row">
        <span class="lc-result-rank">
          ${escapeHTML(result.rank || index + 1)}
        </span>

        <div class="lc-result-information">
          <h4>${escapeHTML(result.display_name || "Photographer")}</h4>
          <p>${escapeHTML(result.award_title || "Selected Entry")}</p>
        </div>

        <span class="lc-result-award">
          ${escapeHTML(result.award || "Recognised")}
        </span>
      </article>
    `).join("");
  }

  function filter(competitions, options = {}) {
    let result = [...competitions];

    if (options.category && options.category !== "all") {
      result = result.filter(item =>
        item.category === options.category
      );
    }

    if (options.status && options.status !== "all") {
      result = result.filter(item =>
        getDeadlineState(item) === options.status
      );
    }

    if (options.search) {
      const term = options.search.toLowerCase();

      result = result.filter(item =>
        item.title.toLowerCase().includes(term) ||
        item.description.toLowerCase().includes(term) ||
        item.category.toLowerCase().includes(term)
      );
    }

    return result;
  }

  function bind(container = document) {
    container.addEventListener("click", async event => {
      const button = event.target.closest("[data-action]");

      if (!button) return;

      const action = button.dataset.action;
      const id = button.dataset.id;

      try {
        if (action === "view-competition") {
          window.dispatchEvent(
            new CustomEvent("lenscircle:competition-view", {
              detail: { competitionId: id }
            })
          );
        }

        if (action === "reload-competitions") {
          const target = button.closest("[data-competition-list]");

          if (target) {
            await loadInto(target);
          }
        }

      } catch (error) {
        console.error(error);

        window.dispatchEvent(
          new CustomEvent("lenscircle:competition-error", {
            detail: {
              message: error.message || "Something went wrong."
            }
          })
        );
      }
    });
  }

  window.LensCircleCompetitions = {
    config: CONFIG,
    state,
    getPublished,
    loadInto,
    getDetails,
    register,
    withdraw,
    getResults,
    create,
    update,
    renderCard,
    renderList,
    renderResults,
    filter,
    bind,
    formatDate,
    getDeadlineState
  };

})();
