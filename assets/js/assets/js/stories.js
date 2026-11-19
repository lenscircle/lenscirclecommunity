
/**
 * LENS CIRCLE — STORIES & EDITORIAL MODULE
 * File: assets/js/stories.js
 *
 * Features:
 * - Retrieve published editorial stories
 * - Retrieve individual articles
 * - Filter by editorial category
 * - Search published articles
 * - Display featured stories
 * - Display latest stories
 * - Track article reading progress
 * - Increment article views through protected RPC
 *
 * REQUIRED SUPABASE RPC FUNCTIONS:
 *
 * get_published_stories(p_category, p_limit, p_offset)
 * get_story_details(p_slug)
 * increment_story_view(p_story_id)
 *
 * REQUIRED TABLE:
 * public.stories
 *
 * Suggested fields:
 * id UUID
 * title TEXT
 * slug TEXT UNIQUE
 * excerpt TEXT
 * content TEXT
 * category TEXT
 * cover_image_url TEXT
 * author_name TEXT
 * status TEXT
 * is_featured BOOLEAN
 * published_at TIMESTAMPTZ
 *
 * SECURITY:
 * - Only published stories should be publicly readable.
 * - Drafts and unpublished editorial material remain staff-only.
 * - View-count increments must be rate-limited server-side.
 * - Never render untrusted HTML directly.
 */

(function () {
  "use strict";

  const CONFIG = {
    rpc: {
      list: "get_published_stories",
      details: "get_story_details",
      view: "increment_story_view"
    },

    categories: {
      all: "All Stories",
      education: "Photography Education",
      creator_stories: "Creator Stories",
      visual_essays: "Visual Essays",
      industry: "Industry & Technology",
      community: "Community Features",
      magazine: "Magazine & Publications",
      inspiration: "Inspiration"
    },

    defaultLimit: 12,
    maximumLimit: 50
  };

  const state = {
    stories: [],
    currentStory: null,
    loading: false,
    category: "all",
    search: ""
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

  function normaliseStory(record) {
    if (!record || typeof record !== "object") {
      return null;
    }

    return {
      id: record.id || "",
      title: record.title || "Untitled Story",
      slug: record.slug || "",
      excerpt: record.excerpt || "",
      content: record.content || "",
      category: record.category || "community",
      coverImage: record.cover_image_url || "",
      author: record.author_name || "Lens Circle Editorial",
      featured: record.is_featured === true,
      publishedAt: record.published_at || null,
      readingTime: Number(record.reading_time || 0),
      views: Number(record.view_count || 0)
    };
  }

  function formatDate(value) {
    if (!value) return "Recently published";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "Recently published";
    }

    return new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "long",
      year: "numeric"
    }).format(date);
  }

  function getCategoryLabel(category) {
    return CONFIG.categories[category] || category || "Editorial";
  }

  function getStoryUrl(story) {
    if (!story?.slug) return "#";

    return `story.html?slug=${encodeURIComponent(story.slug)}`;
  }

  async function getPublished(options = {}) {
    const category = options.category || "all";

    if (!Object.hasOwn(CONFIG.categories, category)) {
      throw new Error("Invalid editorial category.");
    }

    const limit = Math.min(
      Math.max(Number(options.limit) || CONFIG.defaultLimit, 1),
      CONFIG.maximumLimit
    );

    const offset = Math.max(
      Number(options.offset) || 0,
      0
    );

    state.loading = true;

    try {
      const { data, error } = await client().rpc(
        CONFIG.rpc.list,
        {
          p_category: category,
          p_limit: limit,
          p_offset: offset
        }
      );

      if (error) throw error;

      const stories = Array.isArray(data)
        ? data.map(normaliseStory).filter(Boolean)
        : [];

      if (offset === 0 && category === "all") {
        state.stories = stories;
      }

      return {
        success: true,
        data: stories
      };

    } finally {
      state.loading = false;
    }
  }

  async function getDetails(slug) {
    const value = String(slug || "").trim();

    if (!value) {
      throw new Error("Article slug is required.");
    }

    const { data, error } = await client().rpc(
      CONFIG.rpc.details,
      {
        p_slug: value
      }
    );

    if (error) throw error;

    const record = Array.isArray(data)
      ? data[0]
      : data;

    if (!record) {
      throw new Error("Story not found.");
    }

    state.currentStory = normaliseStory(record);

    return {
      success: true,
      data: state.currentStory
    };
  }

  async function trackView(storyId) {
    if (!storyId) return;

    const { error } = await client().rpc(
      CONFIG.rpc.view,
      {
        p_story_id: storyId
      }
    );

    if (error) {
      console.warn(
        "Story view could not be recorded:",
        error.message
      );
    }
  }

  function renderCard(record) {
    const story = normaliseStory(record);

    if (!story) return "";

    const image = story.coverImage
      ? `
        <img
          src="${escapeHTML(story.coverImage)}"
          alt="${escapeHTML(story.title)}"
          loading="lazy"
        >
      `
      : `
        <div class="lc-story-placeholder">
          Lens Circle Journal
        </div>
      `;

    return `
      <article class="lc-story-card">

        <a
          href="${escapeHTML(getStoryUrl(story))}"
          class="lc-story-card__image">

          ${image}

        </a>

        <div class="lc-story-card__content">

          <span class="lc-story-category">
            ${escapeHTML(getCategoryLabel(story.category))}
          </span>

          <h3>
            <a href="${escapeHTML(getStoryUrl(story))}">
              ${escapeHTML(story.title)}
            </a>
          </h3>

          <p>${escapeHTML(story.excerpt)}</p>

          <div class="lc-story-meta">
            <span>${escapeHTML(story.author)}</span>
            <span>${escapeHTML(formatDate(story.publishedAt))}</span>
          </div>

          <a
            href="${escapeHTML(getStoryUrl(story))}"
            class="lc-story-read-link">
            Read story →
          </a>

        </div>

      </article>
    `;
  }

  function renderList(container, stories) {
    if (!container) return;

    if (!stories.length) {
      container.innerHTML = `
        <div class="lc-story-empty">
          <h3>More stories are on the way</h3>
          <p>
            Explore our editorial collection again soon.
          </p>
        </div>
      `;
      return;
    }

    container.innerHTML = stories
      .map(renderCard)
      .join("");
  }

  function renderFeatured(container, stories) {
    if (!container) return;

    const featured = stories.find(
      story => story.featured
    );

    if (!featured) {
      container.innerHTML = "";
      return;
    }

    const image = featured.coverImage
      ? `
        <img
          src="${escapeHTML(featured.coverImage)}"
          alt="${escapeHTML(featured.title)}"
        >
      `
      : "";

    container.innerHTML = `
      <article class="lc-story-featured">

        <div class="lc-story-featured__image">
          ${image}
        </div>

        <div class="lc-story-featured__content">

          <span>Editor's Selection</span>

          <h2>${escapeHTML(featured.title)}</h2>

          <p>${escapeHTML(featured.excerpt)}</p>

          <a href="${escapeHTML(getStoryUrl(featured))}">
            Discover the story →
          </a>

        </div>

      </article>
    `;
  }

  function renderArticle(container, story) {
    if (!container || !story) return;

    const safeContent = escapeHTML(story.content)
      .replace(/\r\n/g, "\n")
      .replace(/\n\n+/g, "</p><p>")
      .replace(/\n/g, "<br>");

    container.innerHTML = `
      <article class="lc-article">

        <header class="lc-article-header">

          <span>${escapeHTML(getCategoryLabel(story.category))}</span>

          <h1>${escapeHTML(story.title)}</h1>

          <p>${escapeHTML(story.excerpt)}</p>

          <div class="lc-article-meta">
            <span>${escapeHTML(story.author)}</span>
            <span>${escapeHTML(formatDate(story.publishedAt))}</span>
            ${
              story.readingTime
                ? `<span>${escapeHTML(story.readingTime)} min read</span>`
                : ""
            }
          </div>

        </header>

        ${
          story.coverImage
            ? `<img
                class="lc-article-cover"
                src="${escapeHTML(story.coverImage)}"
                alt="${escapeHTML(story.title)}"
              >`
            : ""
        }

        <div class="lc-article-body">
          <p>${safeContent}</p>
        </div>

      </article>
    `;
  }

  function filter(stories, options = {}) {
    let result = [...stories];

    const category = options.category || "all";
    const term = String(options.search || "")
      .trim()
      .toLowerCase();

    if (category !== "all") {
      result = result.filter(
        story => story.category === category
      );
    }

    if (term) {
      result = result.filter(story =>
        story.title.toLowerCase().includes(term) ||
        story.excerpt.toLowerCase().includes(term) ||
        story.author.toLowerCase().includes(term)
      );
    }

    return result;
  }

  async function loadInto(selector, options = {}) {
    const container = typeof selector === "string"
      ? document.querySelector(selector)
      : selector;

    if (!container) {
      return {
        success: false,
        error: "Story container not found."
      };
    }

    container.innerHTML = `
      <div class="lc-story-loading">
        Loading editorial stories...
      </div>
    `;

    try {
      const result = await getPublished(options);

      renderList(container, result.data);

      return result;

    } catch (error) {
      console.error("Story loading failed:", error);

      container.innerHTML = `
        <div class="lc-story-empty">
          <p>Stories could not be loaded right now.</p>
        </div>
      `;

      return {
        success: false,
        error: error.message
      };
    }
  }

  async function loadArticle(options = {}) {
    const container = document.querySelector(
      options.container || "[data-story-content]"
    );

    const params = new URLSearchParams(
      window.location.search
    );

    const slug = options.slug || params.get("slug");

    if (!container || !slug) {
      throw new Error("Article container or slug is missing.");
    }

    container.innerHTML = `
      <div class="lc-story-loading">
        Loading article...
      </div>
    `;

    try {
      const result = await getDetails(slug);

      renderArticle(container, result.data);

      await trackView(result.data.id);

      return result;

    } catch (error) {
      container.innerHTML = `
        <div class="lc-story-empty">
          <h2>Story unavailable</h2>
          <p>This article could not be found.</p>
          <a href="stories.html">Return to stories</a>
        </div>
      `;

      throw error;
    }
  }

  function bindFilters(options = {}) {
    const container = document.querySelector(
      options.container || "[data-story-grid]"
    );

    const searchInput = document.querySelector(
      options.search || "[data-story-search]"
    );

    const categorySelect = document.querySelector(
      options.category || "[data-story-category]"
    );

    if (!container) return;

    let timeout;

    async function update() {
      clearTimeout(timeout);

      timeout = setTimeout(async () => {
        try {
          const result = await getPublished({
            category: categorySelect?.value || "all"
          });

          const filtered = filter(result.data, {
            search: searchInput?.value || ""
          });

          renderList(container, filtered);

        } catch (error) {
          console.error(error);
        }
      }, 300);
    }

    searchInput?.addEventListener("input", update);
    categorySelect?.addEventListener("change", update);
  }

  async function initialise(options = {}) {
    const grid = document.querySelector(
      options.grid || "[data-story-grid]"
    );

    const featured = document.querySelector(
      options.featured || "[data-story-featured]"
    );

    const result = await getPublished({
      category: "all",
      limit: options.limit || CONFIG.defaultLimit
    });

    renderList(grid, result.data);
    renderFeatured(featured, result.data);

    bindFilters(options);

    return result;
  }

  window.LensCircleStories = {
    config: CONFIG,
    state,
    getPublished,
    getDetails,
    trackView,
    renderCard,
    renderList,
    renderFeatured,
    renderArticle,
    filter,
    loadInto,
    loadArticle,
    bindFilters,
    initialise,
    formatDate
  };

})();
