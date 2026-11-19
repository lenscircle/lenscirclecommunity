
/**
 * LENS CIRCLE — GLOBAL SEARCH MODULE
 * File: assets/js/search.js
 *
 * Features:
 * - Search photographs
 * - Search public photographer profiles
 * - Search competitions
 * - Search community activities
 * - Search published editorial stories
 * - Category-based filtering
 * - Search suggestions
 * - Search result rendering
 *
 * REQUIRED SUPABASE RPC:
 *
 * search_lens_circle(p_query, p_category, p_limit)
 *
 * Expected result structure:
 * {
 *   id: UUID,
 *   title: TEXT,
 *   description: TEXT,
 *   category: TEXT,
 *   result_type: TEXT,
 *   image_url: TEXT,
 *   destination_url: TEXT,
 *   created_at: TIMESTAMPTZ
 * }
 *
 * SECURITY:
 * - Search must return only publicly discoverable records.
 * - Private member information must never be exposed.
 * - Database RLS must control searchable records.
 * - Search results must not reveal unpublished submissions.
 */

(function () {
  "use strict";

  const CONFIG = {
    rpc: "search_lens_circle",

    categories: {
      all: "Everything",
      photographs: "Photographs",
      photographers: "Photographers",
      competitions: "Competitions",
      activities: "Activities",
      stories: "Stories"
    },

    minimumCharacters: 2,
    maximumCharacters: 100,
    defaultLimit: 30,
    debounceDelay: 350
  };

  const state = {
    query: "",
    category: "all",
    results: [],
    loading: false,
    error: null
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

  function normaliseQuery(value) {
    return String(value || "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, CONFIG.maximumCharacters);
  }

  function normaliseResult(record) {
    if (!record || typeof record !== "object") {
      return null;
    }

    const allowedTypes = [
      "photograph",
      "photographer",
      "competition",
      "activity",
      "story"
    ];

    if (!allowedTypes.includes(record.result_type)) {
      return null;
    }

    return {
      id: record.id || "",
      title: record.title || "Untitled",
      description: record.description || "",
      category: record.category || "",
      type: record.result_type,
      imageUrl: record.image_url || "",
      destinationUrl: safeDestination(record.destination_url),
      createdAt: record.created_at || null
    };
  }

  function safeDestination(value) {
    if (!value) return "#";

    try {
      const url = new URL(value, window.location.origin);

      if (
        url.protocol !== "https:" &&
        url.protocol !== "http:"
      ) {
        return "#";
      }

      return url.href;

    } catch {
      return "#";
    }
  }

  function getTypeLabel(type) {
    const labels = {
      photograph: "Photograph",
      photographer: "Photographer",
      competition: "Competition",
      activity: "Community Activity",
      story: "Editorial Story"
    };

    return labels[type] || "Lens Circle";
  }

  async function search(query, options = {}) {
    const term = normaliseQuery(query);

    if (term.length < CONFIG.minimumCharacters) {
      state.query = term;
      state.results = [];

      return {
        success: true,
        data: [],
        message: "Enter at least two characters."
      };
    }

    const category = options.category || state.category;

    if (!Object.hasOwn(CONFIG.categories, category)) {
      throw new Error("Invalid search category.");
    }

    state.loading = true;
    state.query = term;
    state.category = category;
    state.error = null;

    try {
      const { data, error } = await client().rpc(
        CONFIG.rpc,
        {
          p_query: term,
          p_category: category,
          p_limit: options.limit || CONFIG.defaultLimit
        }
      );

      if (error) throw error;

      state.results = Array.isArray(data)
        ? data.map(normaliseResult).filter(Boolean)
        : [];

      return {
        success: true,
        data: state.results
      };

    } catch (error) {
      console.error("Global search failed:", error);

      state.error = error.message || "Search failed.";

      return {
        success: false,
        data: [],
        error: state.error
      };

    } finally {
      state.loading = false;
    }
  }

  function renderCard(record) {
    const item = normaliseResult(record);

    if (!item) return "";

    const image = item.imageUrl
      ? `
        <img
          src="${escapeHTML(item.imageUrl)}"
          alt="${escapeHTML(item.title)}"
          loading="lazy"
        >
      `
      : `
        <div class="lc-search-placeholder">
          <span>${escapeHTML(getTypeLabel(item.type))}</span>
        </div>
      `;

    return `
      <article class="lc-search-card">

        <a
          href="${escapeHTML(item.destinationUrl)}"
          class="lc-search-card__image"
          aria-label="Open ${escapeHTML(item.title)}">

          ${image}

        </a>

        <div class="lc-search-card__content">

          <span class="lc-search-card__type">
            ${escapeHTML(getTypeLabel(item.type))}
          </span>

          <h3>
            <a href="${escapeHTML(item.destinationUrl)}">
              ${escapeHTML(item.title)}
            </a>
          </h3>

          <p>${escapeHTML(item.description)}</p>

          ${
            item.category
              ? `<span class="lc-search-card__category">
                  ${escapeHTML(item.category)}
                </span>`
              : ""
          }

        </div>

      </article>
    `;
  }

  function renderResults(container, results = state.results) {
    if (!container) return;

    if (state.loading) {
      container.innerHTML = `
        <div class="lc-search-loading">
          Searching Lens Circle...
        </div>
      `;
      return;
    }

    if (state.error) {
      container.innerHTML = `
        <div class="lc-search-error">
          <p>Search is temporarily unavailable.</p>
        </div>
      `;
      return;
    }

    if (!results.length) {
      container.innerHTML = `
        <div class="lc-search-empty">
          <h3>No results found</h3>
          <p>
            Try another keyword or choose a different category.
          </p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="lc-search-results-grid">
        ${results.map(renderCard).join("")}
      </div>
    `;
  }

  function debounce(callback, delay = CONFIG.debounceDelay) {
    let timeout;

    return function (...args) {
      clearTimeout(timeout);

      timeout = setTimeout(() => {
        callback.apply(this, args);
      }, delay);
    };
  }

  function bind(options = {}) {
    const input = document.querySelector(
      options.input || "[data-lc-search]"
    );

    const category = document.querySelector(
      options.category || "[data-lc-search-category]"
    );

    const results = document.querySelector(
      options.results || "[data-lc-search-results]"
    );

    if (!input || !results) return;

    const performSearch = debounce(async () => {
      const result = await search(input.value, {
        category: category?.value || "all"
      });

      renderResults(results, result.data);
    });

    input.addEventListener("input", performSearch);

    category?.addEventListener("change", performSearch);

    input.addEventListener("keydown", event => {
      if (event.key === "Enter") {
        event.preventDefault();

        search(input.value, {
          category: category?.value || "all"
        }).then(result => {
          renderResults(results, result.data);
        });
      }
    });
  }

  async function initialise(options = {}) {
    bind(options);

    const input = document.querySelector(
      options.input || "[data-lc-search]"
    );

    const results = document.querySelector(
      options.results || "[data-lc-search-results]"
    );

    if (input?.value) {
      const result = await search(input.value, {
        category: options.category || "all"
      });

      renderResults(results, result.data);
    }
  }

  window.LensCircleSearch = {
    config: CONFIG,
    state,
    search,
    renderCard,
    renderResults,
    debounce,
    bind,
    initialise
  };

})();
