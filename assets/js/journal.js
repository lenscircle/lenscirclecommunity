
/* =========================================================
   LENS CIRCLE — JOURNAL MODULE
   File: assets/js/journal.js

   FEATURES
   - Retrieve published journal articles.
   - Retrieve individual articles by slug.
   - Search and filter journal content.
   - Retrieve articles by category.
   - Retrieve featured articles.
   - Save and retrieve reading-list items.
   - Record article views.
   - Retrieve editorial drafts for authorised staff.
   - Create, edit, publish and archive articles.
   - Render article cards and article pages.
   - Generate reading-time estimates.

   ARTICLE CATEGORIES
   - photography_education
   - creator_stories
   - visual_essays
   - industry_technology
   - community_features
   - magazine

   REQUIRED DATABASE RPC CONTRACTS
   get_published_journal_articles(p_category, p_limit, p_offset)
   get_journal_article(p_slug)
   get_featured_journal_articles(p_limit)
   search_journal_articles(p_query, p_limit, p_offset)
   record_journal_article_view(p_article_id)
   get_my_reading_list()
   add_to_reading_list(p_article_id)
   remove_from_reading_list(p_article_id)
   get_editorial_articles(p_status, p_category)
   create_journal_article(
     p_title,
     p_slug,
     p_excerpt,
     p_content,
     p_category,
     p_cover_image,
     p_tags
   )
   update_journal_article(
     p_article_id,
     p_title,
     p_slug,
     p_excerpt,
     p_content,
     p_category,
     p_cover_image,
     p_tags
   )
   publish_journal_article(p_article_id)
   archive_journal_article(p_article_id)

   SECURITY
   - Public reads return published articles only.
   - Drafts are restricted to authorised editorial staff.
   - Publishing requires explicit editorial permission.
   - Authors cannot assign themselves staff roles.
   - Reading-list operations are restricted to the owner.
   - Article view counts must be rate-limited server-side.
   - All write operations must derive the actor from auth.uid().
   - Sanitize rich content before rendering.
   ========================================================= */

(function (window, document) {
  "use strict";

  const LC = window.LensCircle = window.LensCircle || {};
  const Journal = {};

  const RPC = Object.freeze({
    LIST: "get_published_journal_articles",
    ARTICLE: "get_journal_article",
    FEATURED: "get_featured_journal_articles",
    SEARCH: "search_journal_articles",
    VIEW: "record_journal_article_view",
    READING_LIST: "get_my_reading_list",
    ADD_READING: "add_to_reading_list",
    REMOVE_READING: "remove_from_reading_list",
    EDITORIAL_LIST: "get_editorial_articles",
    CREATE: "create_journal_article",
    UPDATE: "update_journal_article",
    PUBLISH: "publish_journal_article",
    ARCHIVE: "archive_journal_article"
  });

  const CATEGORIES = Object.freeze([
    "photography_education",
    "creator_stories",
    "visual_essays",
    "industry_technology",
    "community_features",
    "magazine"
  ]);

  const ARTICLE_STATUSES = Object.freeze([
    "draft",
    "review",
    "published",
    "archived"
  ]);

  const CATEGORY_LABELS = Object.freeze({
    photography_education: "Photography Education",
    creator_stories: "Creator Stories",
    visual_essays: "Visual Essays",
    industry_technology: "Industry & Technology",
    community_features: "Community Features",
    magazine: "Lens Circle Magazine"
  });

  const state = {
    articles: [],
    featured: [],
    currentArticle: null,
    readingList: [],
    editorialArticles: [],
    filters: {
      search: "",
      category: "all"
    }
  };

  const DEFAULT_LIMIT = 12;
  const MAX_LIMIT = 50;
  const WORDS_PER_MINUTE = 220;

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
      console.error("[Lens Circle Journal]", name, result.error);

      throw new Error(
        result.error.message || "The journal request failed."
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

  function validateUUID(value, label) {
    const id = cleanText(value, 100);

    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
    ) {
      throw new Error("A valid " + label + " ID is required.");
    }

    return id;
  }

  function validateSlug(value) {
    const slug = cleanText(value, 180).toLowerCase();

    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      throw new Error("Enter a valid article URL slug.");
    }

    return slug;
  }

  function makeSlug(value) {
    return cleanText(value, 180)
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 180);
  }

  function normaliseCategory(value) {
    const category = cleanText(value, 50).toLowerCase();

    return CATEGORIES.includes(category)
      ? category
      : "community_features";
  }

  function normaliseTags(value) {
    if (typeof value === "string") {
      value = value.split(",");
    }

    if (!Array.isArray(value)) return [];

    return [...new Set(
      value
        .map(tag => cleanText(tag, 40).toLowerCase())
        .filter(Boolean)
    )].slice(0, 15);
  }

  function normaliseArticle(row) {
    const item = row || {};

    return {
      id: cleanText(item.id || item.article_id, 100),
      title: cleanText(item.title, 180),
      slug: cleanText(item.slug, 180),
      excerpt: cleanText(item.excerpt, 500),
      content: String(item.content || ""),
      category: normaliseCategory(item.category),
      cover_image: safeImageURL(
        item.cover_image || item.cover_image_url
      ),
      author_name: cleanText(
        item.author_name || item.author,
        120
      ),
      status: cleanText(item.status, 30).toLowerCase(),
      tags: normaliseTags(item.tags),
      is_featured: item.is_featured === true,
      reading_time: Number(item.reading_time) || 0,
      view_count: Number(item.view_count) || 0,
      published_at: item.published_at || null,
      created_at: item.created_at || null,
      updated_at: item.updated_at || null
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

  function categoryLabel(value) {
    return CATEGORY_LABELS[normaliseCategory(value)];
  }

  /* ---------------------------------------------------------
     READING TIME
  --------------------------------------------------------- */

  /**
   * Estimate reading time from plain text.
   * For rich HTML content, strip tags before calling.
   */
  Journal.getReadingTime = function (content) {
    const plainText = String(content || "")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const words = plainText
      ? plainText.split(" ").length
      : 0;

    return Math.max(
      1,
      Math.ceil(words / WORDS_PER_MINUTE)
    );
  };

  /* ---------------------------------------------------------
     PUBLIC ARTICLE LISTING
  --------------------------------------------------------- */

  Journal.getPublished = async function (options) {
    const settings = options || {};

    const category = settings.category &&
      settings.category !== "all"
        ? normaliseCategory(settings.category)
        : null;

    const limit = Math.min(
      Math.max(Number(settings.limit) || DEFAULT_LIMIT, 1),
      MAX_LIMIT
    );

    const offset = Math.max(Number(settings.offset) || 0, 0);

    const data = await callRPC(RPC.LIST, {
      p_category: category,
      p_limit: limit,
      p_offset: offset
    });

    state.articles = unwrapRows(data, "articles")
      .map(normaliseArticle);

    return state.articles;
  };

  Journal.getFeatured = async function (limit) {
    const count = Math.min(
      Math.max(Number(limit) || 4, 1),
      12
    );

    const data = await callRPC(RPC.FEATURED, {
      p_limit: count
    });

    state.featured = unwrapRows(data, "articles")
      .map(normaliseArticle);

    return state.featured;
  };

  Journal.getArticle = async function (slug) {
    const articleSlug = validateSlug(slug);

    const data = await callRPC(RPC.ARTICLE, {
      p_slug: articleSlug
    });

    const row = Array.isArray(data) ? data[0] : data;

    if (!row) throw new Error("Article not found.");

    const article = normaliseArticle(row);

    if (article.status !== "published") {
      throw new Error("This article is not available.");
    }

    state.currentArticle = article;

    return article;
  };

  /* ---------------------------------------------------------
     ARTICLE SEARCH
  --------------------------------------------------------- */

  Journal.search = async function (query, options) {
    const settings = options || {};
    const search = cleanText(query, 120);

    if (search.length < 2) {
      return [];
    }

    const limit = Math.min(
      Math.max(Number(settings.limit) || DEFAULT_LIMIT, 1),
      MAX_LIMIT
    );

    const offset = Math.max(Number(settings.offset) || 0, 0);

    const data = await callRPC(RPC.SEARCH, {
      p_query: search,
      p_limit: limit,
      p_offset: offset
    });

    return unwrapRows(data, "articles")
      .map(normaliseArticle)
      .filter(article => article.status === "published");
  };

  /* ---------------------------------------------------------
     ARTICLE VIEWS
  --------------------------------------------------------- */

  /**
   * Record a view.
   * The database should apply rate limits and deduplication.
   */
  Journal.recordView = async function (articleId) {
    const id = validateUUID(articleId, "article");

    return callRPC(RPC.VIEW, {
      p_article_id: id
    });
  };

  /* ---------------------------------------------------------
     READING LIST
  --------------------------------------------------------- */

  Journal.getReadingList = async function () {
    await requireUser();

    const data = await callRPC(RPC.READING_LIST);

    state.readingList = unwrapRows(data, "articles")
      .map(normaliseArticle);

    return state.readingList;
  };

  Journal.addToReadingList = async function (articleId) {
    await requireUser();

    const id = validateUUID(articleId, "article");

    return callRPC(RPC.ADD_READING, {
      p_article_id: id
    });
  };

  Journal.removeFromReadingList = async function (articleId) {
    await requireUser();

    const id = validateUUID(articleId, "article");

    return callRPC(RPC.REMOVE_READING, {
      p_article_id: id
    });
  };

  Journal.isSaved = function (articleId) {
    const id = cleanText(articleId, 100);

    return state.readingList.some(article => article.id === id);
  };

  /* ---------------------------------------------------------
     EDITORIAL WORKSPACE
  --------------------------------------------------------- */

  /**
   * Retrieve editorial articles.
   * The database must verify that the caller has editorial
   * department permissions or an explicitly authorised Admin role.
   */
  Journal.getEditorialArticles = async function (status, category) {
    await requireUser();

    const selectedStatus = cleanText(
      status || "all",
      30
    ).toLowerCase();

    if (
      selectedStatus !== "all" &&
      !ARTICLE_STATUSES.includes(selectedStatus)
    ) {
      throw new Error("Invalid editorial status.");
    }

    const selectedCategory =
      category && category !== "all"
        ? normaliseCategory(category)
        : null;

    const data = await callRPC(RPC.EDITORIAL_LIST, {
      p_status: selectedStatus === "all"
        ? null
        : selectedStatus,
      p_category: selectedCategory
    });

    state.editorialArticles = unwrapRows(data, "articles")
      .map(normaliseArticle);

    return state.editorialArticles;
  };

  /* ---------------------------------------------------------
     CREATE ARTICLE
  --------------------------------------------------------- */

  Journal.createArticle = async function (input) {
    await requireUser();

    const values = input || {};

    const title = cleanText(values.title, 180);
    const slug = validateSlug(
      values.slug || makeSlug(title)
    );
    const excerpt = cleanText(values.excerpt, 500);
    const content = String(values.content || "").trim();
    const category = normaliseCategory(values.category);
    const coverImage = safeImageURL(values.coverImage);
    const tags = normaliseTags(values.tags);

    if (title.length < 5) {
      throw new Error("Article title must have at least 5 characters.");
    }

    if (content.length < 100) {
      throw new Error("Article content is too short.");
    }

    return callRPC(RPC.CREATE, {
      p_title: title,
      p_slug: slug,
      p_excerpt: excerpt,
      p_content: content,
      p_category: category,
      p_cover_image: coverImage || null,
      p_tags: tags
    });
  };

  /* ---------------------------------------------------------
     UPDATE ARTICLE
  --------------------------------------------------------- */

  Journal.updateArticle = async function (
    articleId,
    input
  ) {
    await requireUser();

    const id = validateUUID(articleId, "article");
    const values = input || {};

    const title = cleanText(values.title, 180);
    const slug = validateSlug(
      values.slug || makeSlug(title)
    );
    const excerpt = cleanText(values.excerpt, 500);
    const content = String(values.content || "").trim();
    const category = normaliseCategory(values.category);
    const coverImage = safeImageURL(values.coverImage);
    const tags = normaliseTags(values.tags);

    if (title.length < 5) {
      throw new Error("Article title must have at least 5 characters.");
    }

    if (content.length < 100) {
      throw new Error("Article content is too short.");
    }

    return callRPC(RPC.UPDATE, {
      p_article_id: id,
      p_title: title,
      p_slug: slug,
      p_excerpt: excerpt,
      p_content: content,
      p_category: category,
      p_cover_image: coverImage || null,
      p_tags: tags
    });
  };

  /* ---------------------------------------------------------
     PUBLISH AND ARCHIVE
  --------------------------------------------------------- */

  Journal.publishArticle = async function (articleId) {
    await requireUser();

    const id = validateUUID(articleId, "article");

    return callRPC(RPC.PUBLISH, {
      p_article_id: id
    });
  };

  Journal.archiveArticle = async function (articleId) {
    await requireUser();

    const id = validateUUID(articleId, "article");

    return callRPC(RPC.ARCHIVE, {
      p_article_id: id
    });
  };

  /* ---------------------------------------------------------
     FILTERING
  --------------------------------------------------------- */

  Journal.setFilters = function (filters) {
    const values = filters || {};

    if (values.search !== undefined) {
      state.filters.search = cleanText(values.search, 120)
        .toLowerCase();
    }

    if (values.category !== undefined) {
      const category = cleanText(values.category, 50).toLowerCase();

      state.filters.category =
        category === "all" || CATEGORIES.includes(category)
          ? category
          : "all";
    }

    return Journal.getFilteredArticles();
  };

  Journal.getFilteredArticles = function (source) {
    const items = Array.isArray(source)
      ? source.map(normaliseArticle)
      : state.articles.slice();

    return items.filter(function (article) {
      const filters = state.filters;

      if (
        filters.category !== "all" &&
        article.category !== filters.category
      ) {
        return false;
      }

      if (filters.search) {
        const searchable = [
          article.title,
          article.excerpt,
          article.author_name,
          article.tags.join(" ")
        ].join(" ").toLowerCase();

        if (!searchable.includes(filters.search)) {
          return false;
        }
      }

      return true;
    });
  };

  /* ---------------------------------------------------------
     RENDERING
  --------------------------------------------------------- */

  Journal.renderCard = function (article) {
    const item = normaliseArticle(article);

    const image = item.cover_image
      ? `<img src="${escapeHTML(item.cover_image)}"
          alt="${escapeHTML(item.title)}"
          loading="lazy">`
      : "";

    const readingTime = item.reading_time ||
      Journal.getReadingTime(item.content);

    return `
      <article class="journal-card"
        data-article-id="${escapeHTML(item.id)}">

        <a class="journal-card-image"
           href="article.html?slug=${encodeURIComponent(item.slug)}">
          ${image}
        </a>

        <div class="journal-card-content">
          <span class="journal-category">
            ${escapeHTML(categoryLabel(item.category))}
          </span>

          <h3>
            <a href="article.html?slug=${encodeURIComponent(item.slug)}">
              ${escapeHTML(item.title)}
            </a>
          </h3>

          <p>${escapeHTML(item.excerpt)}</p>

          <div class="journal-card-meta">
            ${
              item.author_name
                ? `<span>${escapeHTML(item.author_name)}</span>`
                : ""
            }

            <span>${escapeHTML(formatDate(item.published_at))}</span>
            <span>${readingTime} min read</span>
          </div>
        </div>
      </article>
    `;
  };

  Journal.renderList = function (container, source) {
    const target =
      typeof container === "string"
        ? document.querySelector(container)
        : container;

    if (!target) {
      throw new Error("Journal container was not found.");
    }

    const items = Journal.getFilteredArticles(source);

    if (!items.length) {
      target.innerHTML = `
        <div class="journal-empty-state">
          <h3>No articles found</h3>
          <p>Explore another category or try a different search.</p>
        </div>
      `;
      return;
   