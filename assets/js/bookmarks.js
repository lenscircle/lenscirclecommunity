
/**
 * LENS CIRCLE — BOOKMARKS MODULE
 * File: assets/js/bookmarks.js
 *
 * Features:
 * - Add a photograph to bookmarks
 * - Remove a bookmark
 * - Toggle bookmark state
 * - Check whether a photograph is bookmarked
 * - Retrieve the current member's bookmarks
 * - Render saved photographs
 * - Search and filter bookmarks
 *
 * REQUIRED SUPABASE RPC FUNCTIONS:
 *
 * get_my_bookmarks()
 * add_photo_bookmark(p_photo_id)
 * remove_photo_bookmark(p_photo_id)
 * is_photo_bookmarked(p_photo_id)
 *
 * SECURITY:
 * - User identity must be derived from auth.uid().
 * - Members may only access their own bookmarks.
 * - RLS must protect the underlying bookmarks table.
 * - Never trust a user ID supplied by the browser.
 */

(function () {
  "use strict";

  const CONFIG = {
    rpc: {
      list: "get_my_bookmarks",
      add: "add_photo_bookmark",
      remove: "remove_photo_bookmark",
      check: "is_photo_bookmarked"
    },

    pageSize: 12
  };

  const state = {
    bookmarks: [],
    loading: false,
    search: "",
    category: "all",
    sort: "newest"
  };

  function getClient() {
    if (window.LensCircle?.db) {
      return window.LensCircle.db;
    }

    if (window.supabaseClient) {
      return window.supabaseClient;
    }

    throw new Error(
      "Lens Circle Supabase client is not available."
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

  function normaliseBookmark(record) {
    if (!record || typeof record !== "object") {
      return null;
    }

    const photo = record.photo || record.photograph || record;

    return {
      id: record.id || record.bookmark_id || "",
      photoId: record.photo_id || photo.id || "",
      title: photo.title || record.title || "Untitled Photograph",
      photographer: photo.photographer_name ||
        record.photographer_name ||
        "Lens Circle Photographer",
      category: photo.category || record.category || "Photography",
      imageUrl: photo.image_url ||
        photo.image_url_signed ||
        record.image_url ||
        "",
      description: photo.description || record.description || "",
      savedAt: record.created_at || record.saved_at || null,
      photographerUrl: photo.photographer_url || ""
    };
  }

  function notify(message, type = "info") {
    window.dispatchEvent(
      new CustomEvent("lenscircle:bookmark-message", {
        detail: { message, type }
      })
    );

    if (window.LensCircle?.notify) {
      window.LensCircle.notify(message, type);
    }
  }

  async function add(photoId) {
    if (!photoId) {
      throw new Error("Photograph ID is required.");
    }

    const { data, error } = await getClient().rpc(
      CONFIG.rpc.add,
      {
        p_photo_id: photoId
      }
    );

    if (error) throw error;

    await refresh();

    notify("Photograph added to your bookmarks.", "success");

    return {
      success: true,
      data
    };
  }

  async function remove(photoId) {
    if (!photoId) {
      throw new Error("Photograph ID is required.");
    }

    const { data, error } = await getClient().rpc(
      CONFIG.rpc.remove,
      {
        p_photo_id: photoId
      }
    );

    if (error) throw error;

    state.bookmarks = state.bookmarks.filter(
      item => item.photoId !== photoId
    );

    notify("Photograph removed from bookmarks.", "success");

    return {
      success: true,
      data
    };
  }

  async function toggle(photoId, currentlySaved) {
    if (currentlySaved) {
      return remove(photoId);
    }

    return add(photoId);
  }

  async function isSaved(photoId) {
    if (!photoId) return false;

    const { data, error } = await getClient().rpc(
      CONFIG.rpc.check,
      {
        p_photo_id: photoId
      }
    );

    if (error) throw error;

    return data === true;
  }

  async function refresh() {
    state.loading = true;

    try {
      const { data, error } = await getClient().rpc(
        CONFIG.rpc.list
      );

      if (error) throw error;

      state.bookmarks = Array.isArray(data)
        ? data.map(normaliseBookmark).filter(Boolean)
        : [];

      return {
        success: true,
        data: state.bookmarks
      };

    } catch (error) {
      console.error("Bookmark loading failed:", error);

      return {
        success: false,
        data: [],
        error: error.message || "Unable to load bookmarks."
      };

    } finally {
      state.loading = false;
    }
  }

  function filter(items, options = {}) {
    let result = [...items];

    const search = (
      options.search ?? state.search
    ).trim().toLowerCase();

    const category = options.category ?? state.category;
    const sort = options.sort ?? state.sort;

    if (search) {
      result = result.filter(item =>
        item.title.toLowerCase().includes(search) ||
        item.photographer.toLowerCase().includes(search) ||
        item.category.toLowerCase().includes(search)
      );
    }

    if (category && category !== "all") {
      result = result.filter(item =>
        item.category === category
      );
    }

    if (sort === "oldest") {
      result.sort((a, b) =>
        new Date(a.savedAt || 0) -
        new Date(b.savedAt || 0)
      );
    } else if (sort === "title") {
      result.sort((a, b) =>
        a.title.localeCompare(b.title)
      );
    } else {
      result.sort((a, b) =>
        new Date(b.savedAt || 0) -
        new Date(a.savedAt || 0)
      );
    }

    return result;
  }

  function renderCard(item) {
    const bookmark = normaliseBookmark(item);

    if (!bookmark) return "";

    const image = bookmark.imageUrl
      ? `
        <img
          src="${escapeHTML(bookmark.imageUrl)}"
          alt="${escapeHTML(bookmark.title)}"
          loading="lazy"
        >
      `
      : `
        <div class="lc-bookmark-placeholder">
          Image unavailable
        </div>
      `;

    return `
      <article class="lc-bookmark-card"
        data-photo-id="${escapeHTML(bookmark.photoId)}">

        <div class="lc-bookmark-card__image">
          ${image}

          <button
            type="button"
            class="lc-bookmark-remove"
            data-bookmark-action="remove"
            data-photo-id="${escapeHTML(bookmark.photoId)}"
            aria-label="Remove ${escapeHTML(bookmark.title)} from bookmarks"
            title="Remove bookmark">
            ♥
          </button>
        </div>

        <div class="lc-bookmark-card__content">
          <p class="lc-bookmark-category">
            ${escapeHTML(bookmark.category)}
          </p>

          <h3>${escapeHTML(bookmark.title)}</h3>

          <p class="lc-bookmark-photographer">
            By ${escapeHTML(bookmark.photographer)}
          </p>
        </div>

      </article>
    `;
  }

  function render(container, items = state.bookmarks) {
    if (!container) return;

    const filtered = filter(items);

    if (!filtered.length) {
      container.innerHTML = `
        <div class="lc-bookmark-empty">
          <div class="lc-bookmark-empty__icon">♡</div>
          <h3>Your collection starts here</h3>
          <p>
            Save photographs that inspire you.
            Your personal collection will appear here.
          </p>
          <a href="../discover.html"
             class="lc-button lc-button--dark">
            Discover Photography
          </a>
        </div>
      `;

      return;
    }

    container.innerHTML = filtered
      .map(renderCard)
      .join("");
  }

  async function loadInto(selector) {
    const container = typeof selector === "string"
      ? document.querySelector(selector)
      : selector;

    if (!container) {
      return {
        success: false,
        error: "Bookmark container not found."
      };
    }

    container.innerHTML = `
      <div class="lc-bookmark-loading">
        Loading your collection...
      </div>
    `;

    const result = await refresh();

    if (!result.success) {
      container.innerHTML = `
        <div class="lc-bookmark-error">
          <p>Your bookmarks could not be loaded.</p>
          <button type="button"
            class="lc-button lc-button--outline"
            data-bookmark-action="reload">
            Try again
          </button>
        </div>
      `;

      return result;
    }

    render(container);
    return result;
  }

  function bind(container = document) {
    container.addEventListener("click", async event => {
      const button = event.target.closest(
        "[data-bookmark-action]"
      );

      if (!button) return;

      const action = button.dataset.bookmarkAction;
      const photoId = button.dataset.photoId;

      button.disabled = true;

      try {
        if (action === "remove") {
          const result = await remove(photoId);

          if (result.success) {
            const card = button.closest(".lc-bookmark-card");
            card?.remove();

            const grid = container.querySelector(
              "[data-bookmark-grid]"
            );

            if (grid) render(grid);
          }
        }

        if (action === "reload") {
          const grid = container.querySelector(
            "[data-bookmark-grid]"
          );

          if (grid) await loadInto(grid);
        }

      } catch (error) {
        console.error("Bookmark action failed:", error);

        notify(
          error.message || "Unable to update bookmark.",
          "error"
        );

      } finally {
        button.disabled = false;
      }
    });
  }

  function bindFilters(options = {}) {
    const searchInput = document.querySelector(
      options.search || "[data-bookmark-search]"
    );

    const categorySelect = document.querySelector(
      options.category || "[data-bookmark-category]"
    );

    const sortSelect = document.querySelector(
      options.sort || "[data-bookmark-sort]"
    );

    const grid = document.querySelector(
      options.grid || "[data-bookmark-grid]"
    );

    function update() {
      state.search = searchInput?.value || "";
      state.category = categorySelect?.value || "all";
      state.sort = sortSelect?.value || "newest";

      render(grid);
    }

    searchInput?.addEventListener("input", update);
    categorySelect?.addEventListener("change", update);
    sortSelect?.addEventListener("change", update);
  }

  async function initialise(options = {}) {
    const grid = document.querySelector(
      options.grid || "[data-bookmark-grid]"
    );

    bind();
    bindFilters(options);

    return loadInto(grid);
  }

  window.LensCircleBookmarks = {
    config: CONFIG,
    state,
    add,
    remove,
    toggle,
    isSaved,
    refresh,
    filter,
    render,
    renderCard,
    loadInto,
    bind,
    bindFilters,
    initialise
  };

})();
