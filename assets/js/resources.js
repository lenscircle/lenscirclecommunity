
/* =========================================================
   LENS CIRCLE — LEARNING RESOURCES
   File: assets/js/resources.js

   Features:
   - Public photography learning library
   - Search, category and difficulty filters
   - Resource details and downloads
   - Member bookmarks
   - Staff resource management
   - Publish, update and archive resources

   Backend identity and permissions must be enforced
   by Supabase RPC functions and RLS.
========================================================= */

(function () {
  "use strict";

  const LCResources = {
    state: {
      resources: [],
      currentResource: null,
      categories: [],
      filters: {
        search: "",
        category: "all",
        difficulty: "all",
        type: "all"
      },
      initialized: false
    },

    config: {
      table: "learning_resources",
      defaultLimit: 100,
      allowedDifficulties: [
        "beginner",
        "intermediate",
        "advanced",
        "all"
      ],
      allowedTypes: [
        "article",
        "tutorial",
        "guide",
        "video",
        "download",
        "all"
      ]
    },

    rpc: {
      publicResources: "get_public_learning_resources",
      resourceDetails: "get_learning_resource_details",
      searchResources: "search_learning_resources",
      categories: "get_learning_resource_categories",
      bookmarkResource: "bookmark_learning_resource",
      removeBookmark: "remove_learning_resource_bookmark",
      myBookmarks: "get_my_learning_resource_bookmarks",
      submitResource: "submit_learning_resource",
      mySubmissions: "get_my_resource_submissions",
      staffResources: "get_staff_learning_resources",
      createResource: "create_learning_resource",
      updateResource: "update_learning_resource",
      publishResource: "publish_learning_resource",
      archiveResource: "archive_learning_resource",
      deleteResource: "delete_learning_resource",
      statistics: "get_learning_resource_statistics"
    },

    getClient() {
      if (window.supabaseClient) return window.supabaseClient;
      if (window.LensCircle?.supabase) {
        return window.LensCircle.supabase;
      }
      if (window.supabase?.client) {
        return window.supabase.client;
      }

      throw new Error("Supabase client is not initialized.");
    },

    async callRpc(name, params = {}) {
      const { data, error } = await this.getClient().rpc(
        name,
        params
      );

      if (error) {
        console.error(`[Resources] ${name}:`, error);
        throw error;
      }

      return data;
    },

    getElement(id) {
      return document.getElementById(id);
    },

    setText(id, value) {
      const element = this.getElement(id);
      if (element) element.textContent = value ?? "";
    },

    escapeHTML(value) {
      return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      })[char]);
    },

    normalizeArray(data) {
      if (Array.isArray(data)) return data;
      if (Array.isArray(data?.resources)) return data.resources;
      if (Array.isArray(data?.data)) return data.data;
      return [];
    },

    notify(message, type = "info") {
      if (window.LensCircle?.notify) {
        window.LensCircle.notify(message, type);
        return;
      }

      if (window.showToast) {
        window.showToast(message, type);
        return;
      }

      console.log(`[Resources: ${type}] ${message}`);
    },

    async init() {
      if (this.state.initialized) return;

      this.bindEvents();

      try {
        await Promise.all([
          this.loadCategories(),
          this.loadPublicResources()
        ]);

        this.state.initialized = true;
      } catch (error) {
        console.error("[Resources] Initialization failed:", error);
        this.notify("Unable to load learning resources.", "error");
      }
    },

    bindEvents() {
      const search = this.getElement("resource-search");
      const category = this.getElement("resource-category-filter");
      const difficulty = this.getElement("resource-difficulty-filter");
      const type = this.getElement("resource-type-filter");

      search?.addEventListener("input", event => {
        this.state.filters.search = event.target.value.trim();
        this.applyFilters();
      });

      category?.addEventListener("change", event => {
        this.state.filters.category = event.target.value;
        this.applyFilters();
      });

      difficulty?.addEventListener("change", event => {
        this.state.filters.difficulty = event.target.value;
        this.applyFilters();
      });

      type?.addEventListener("change", event => {
        this.state.filters.type = event.target.value;
        this.applyFilters();
      });

      document.addEventListener("click", event => {
        const resourceButton = event.target.closest("[data-resource-id]");
        const bookmarkButton = event.target.closest("[data-resource-bookmark]");

        if (bookmarkButton) {
          event.preventDefault();
          this.toggleBookmark(bookmarkButton.dataset.resourceBookmark);
          return;
        }

        if (resourceButton) {
          event.preventDefault();
          this.openResource(resourceButton.dataset.resourceId);
        }
      });
    },

    async loadCategories() {
      try {
        const result = await this.callRpc(this.rpc.categories);
        this.state.categories = this.normalizeArray(result);
        this.renderCategories();
      } catch (error) {
        console.warn("[Resources] Categories unavailable:", error);
      }
    },

    renderCategories() {
      const select = this.getElement("resource-category-filter");
      if (!select) return;

      const currentValue = select.value || "all";

      select.innerHTML = `
        <option value="all">All categories</option>
        ${this.state.categories.map(category => {
          const value = typeof category === "string"
            ? category
            : category.slug || category.name;

          const label = typeof category === "string"
            ? category
            : category.name || category.slug;

          return `
            <option value="${this.escapeHTML(value)}">
              ${this.escapeHTML(label)}
            </option>
          `;
        }).join("")}
      `;

      select.value = currentValue;
    },

    async loadPublicResources() {
      const result = await this.callRpc(
        this.rpc.publicResources,
        { p_limit: this.config.defaultLimit }
      );

      this.state.resources = this.normalizeArray(result);
      this.applyFilters();
      this.renderStatistics();
    },

    async search(query) {
      const result = await this.callRpc(
        this.rpc.searchResources,
        { p_query: query }
      );

      this.state.resources = this.normalizeArray(result);
      this.applyFilters();
      return this.state.resources;
    },

    applyFilters() {
      const filters = this.state.filters;

      const filtered = this.state.resources.filter(resource => {
        const searchText = [
          resource.title,
          resource.description,
          resource.excerpt,
          resource.author,
          resource.category
        ].join(" ").toLowerCase();

        const matchesSearch =
          !filters.search ||
          searchText.includes(filters.search.toLowerCase());

        const matchesCategory =
          filters.category === "all" ||
          resource.category_slug === filters.category ||
          resource.category === filters.category;

        const matchesDifficulty =
          filters.difficulty === "all" ||
          resource.difficulty === filters.difficulty;

        const matchesType =
          filters.type === "all" ||
          resource.resource_type === filters.type;

        return (
          matchesSearch &&
          matchesCategory &&
          matchesDifficulty &&
          matchesType
        );
      });

      this.renderResources(filtered);
      this.setText("resource-result-count", filtered.length);
    },

    renderResources(resources) {
      const container = this.getElement("resources-grid");
      if (!container) return;

      if (!resources.length) {
        container.innerHTML = `
          <div class="resources-empty">
            <h3>No resources found</h3>
            <p>Try changing your search or filters.</p>
          </div>
        `;
        return;
      }

      container.innerHTML = resources.map(resource => {
        const id = this.escapeHTML(resource.id);
        const title = this.escapeHTML(resource.title);
        const description = this.escapeHTML(
          resource.excerpt || resource.description || ""
        );

        const image = resource.cover_image_url
          ? this.escapeHTML(resource.cover_image_url)
          : "";

        return `
          <article class="resource-card">
            <div class="resource-card-image">
              ${
                image
                  ? `<img src="${image}" alt="${title}" loading="lazy">`
                  : `<div class="resource-image-placeholder">Lens Circle</div>`
              }
            </div>

            <div class="resource-card-content">
              <span class="resource-category">
                ${this.escapeHTML(resource.category || "Photography")}
              </span>

              <h3>${title}</h3>
              <p>${description}</p>

              <div class="resource-meta">
                <span>${this.escapeHTML(resource.difficulty || "All levels")}</span>
                <span>${this.escapeHTML(resource.resource_type || "Guide")}</span>
              </div>

              <button
                type="button"
                class="resource-open-button"
                data-resource-id="${id}">
                Explore resource
              </button>

              <button
                type="button"
                class="resource-bookmark-button"
                data-resource-bookmark="${id}"
                aria-label="Bookmark ${title}">
                Save
              </button>
            </div>
          </article>
        `;
      }).join("");
    },

    async openResource(resourceId) {
      if (!resourceId) return;

      try {
        const result = await this.callRpc(
          this.rpc.resourceDetails,
          { p_resource_id: resourceId }
        );

        const resource = Array.isArray(result)
          ? result[0]
          : result?.resource || result;

        if (!resource) {
          throw new Error("Resource not found.");
        }

        this.state.currentResource = resource;
        this.renderResourceDetails(resource);

        document.dispatchEvent(new CustomEvent(
          "lenscircle:resource-opened",
          { detail: { resource } }
        ));
      } catch (error) {
        console.error("[Resources] Resource details failed:", error);
        this.notify("Unable to open this resource.", "error");
      }
    },

    renderResourceDetails(resource) {
      const container = this.getElement("resource-detail");
      if (!container) return;

      const title = this.escapeHTML(resource.title);
      const content = this.escapeHTML(resource.content || "");
      const description = this.escapeHTML(resource.description || "");

      container.innerHTML = `
        <div class="resource-detail-content">
          <button type="button" id="resource-detail-close">
            Close
          </button>

          <span class="resource-category">
            ${this.escapeHTML(resource.category || "Photography")}
          </span>

          <h1>${title}</h1>
          <p>${description}</p>

          <div class="resource-detail-meta">
            <span>${this.escapeHTML(resource.difficulty || "")}</span>
            <span>${this.escapeHTML(resource.author || "Lens Circle")}</span>
          </div>

          <div class="resource-body">${content}</div>

          ${
            resource.download_url
              ? `
                <a
                  href="${this.escapeHTML(resource.download_url)}"
                  target="_blank"
                  rel="noopener noreferrer">
                  Download resource
                </a>
              `
              : ""
          }
        </div>
      `;

      container.hidden = false;

      this.getElement("resource-detail-close")
        ?.addEventListener("click", () => {
          container.hidden = true;
        });
    },

    async toggleBookmark(resourceId) {
      if (!resourceId) return;

      try {
        const { data: { user }, error } =
          await this.getClient().auth.getUser();

        if (error) throw error;

        if (!user) {
          this.notify("Please log in to save resources.", "warning");
          return;
        }

        const button = document.querySelector(
          `[data-resource-bookmark="${CSS.escape(resourceId)}"]`
        );

        const isSaved = button?.dataset.saved === "true";

        if (isSaved) {
          await this.callRpc(this.rpc.removeBookmark, {
            p_resource_id: resourceId
          });

          if (button) {
            button.dataset.saved = "false";
            button.textContent = "Save";
          }

          this.notify("Resource removed from saved items.", "success");
        } else {
          await this.callRpc(this.rpc.bookmarkResource, {
            p_resource_id: resourceId
          });

          if (button) {
            button.dataset.saved = "true";
            button.textContent = "Saved";
          }

          this.notify("Resource saved successfully.", "success");
        }
      } catch (error) {
        console.error("[Resources] Bookmark failed:", error);
        this.notify("Unable to update bookmark.", "error");
      }
    },

    async loadMyBookmarks() {
      const result = await this.callRpc(this.rpc.myBookmarks);
      const bookmarks = this.normalizeArray(result);

      const container = this.getElement("my-resource-bookmarks");
      if (!container) return bookmarks;

      if (!bookmarks.length) {
        container.innerHTML = "<p>You have not saved any resources yet.</p>";
        return bookmarks;
      }

      container.innerHTML = bookmarks.map(item => {
        const resource = item.resource || item;
        return `
          <article class="saved-resource">
            <h3>${this.escapeHTML(resource.title)}</h3>
            <button
              type="button"
              data-resource-id="${this.escapeHTML(resource.id)}">
              Open
            </button>
          </article>
        `;
      }).join("");

      return bookmarks;
    },

    async submitResourceSuggestion(payload) {
      const title = String(payload?.title || "").trim();
      const description = String(payload?.description || "").trim();
      const url = String(payload?.reference_url || "").trim();

      if (!title || !description) {
        throw new Error("Title and description are required.");
      }

      const result = await this.callRpc(
        this.rpc.submitResource,
        {
          p_title: title,
          p_description: description,
          p_reference_url: url || null,
          p_category: payload.category || null
        }
      );

      this.notify("Your resource suggestion has been submitted.", "success");
      return result;
    },

    async loadMySubmissions() {
      const result = await this.callRpc(this.rpc.mySubmissions);
      const submissions = this.normalizeArray(result);

      const container = this.getElement("my-resource-submissions");
      if (!container) return submissions;

      container.innerHTML = submissions.length
        ? submissions.map(item => `
            <article class="resource-submission">
              <h3>${this.escapeHTML(item.title)}</h3>
              <span>${this.escapeHTML(item.status || "Pending")}</span>
            </article>
          `).join("")
        : "<p>You have not submitted any resource suggestions.</p>";

      return submissions;
    },

    async loadStaffResources(filters = {}) {
      const result = await this.callRpc(
        this.rpc.staffResources,
        {
          p_status: filters.status || null,
          p_search: filters.search || null
        }
      );

      const resources = this.normalizeArray(result);
      this.renderStaffResources(resources);
      return resources;
    },

    renderStaffResources(resources) {
      const container = this.getElement("staff-resources-list");
      if (!container) return;

      container.innerHTML = resources.map(resource => `
        <article class="staff-resource-row">
          <div>
            <h3>${this.escapeHTML(resource.title)}</h3>
            <p>${this.escapeHTML(resource.category || "")}</p>
            <span>${this.escapeHTML(resource.status || "Draft")}</span>
          </div>

          <div class="staff-resource-actions">
            <button
              type="button"
              data-edit-resource="${this.escapeHTML(resource.id)}">
              Edit
            </button>

            <button
              type="button"
              data-publish-resource="${this.escapeHTML(resource.id)}">
              Publish
            </button>

            <button
              type="button"
              data-archive-resource="${this.escapeHTML(resource.id)}">
              Archive
            </button>
          </div>
        </article>
      `).join("");

      container.querySelectorAll("[data-publish-resource]")
        .forEach(button => {
          button.addEventListener("click", () => {
            this.publish(button.dataset.publishResource);
          });
        });

      container.querySelectorAll("[data-archive-resource]")
        .forEach(button => {
          button.addEventListener("click", () => {
            this.archive(button.dataset.archiveResource);
          });
        });

      container.querySelectorAll("[data-edit-resource]")
        .forEach(button => {
          button.addEventListener("click", () => {
            this.edit(button.dataset.editResource);
          });
        });
    },

    async create(payload) {
      this.validateResourcePayload(payload);

      const result = await this.callRpc(
        this.rpc.createResource,
        {
          p_title: payload.title.trim(),
          p_description: payload.description.trim(),
          p_content: payload.content || "",
          p_category: payload.category,
          p_difficulty: payload.difficulty || "beginner",
          p_resource_type: payload.resource_type || "article",
          p_cover_image_url: payload.cover_image_url || null,
          p_download_url: payload.download_url || null
        }
      );

      this.notify("Resource created successfully.", "success");
      return result;
    },

    async update(resourceId, payload) {
      if (!resourceId) throw new Error("Resource ID is required.");

      this.validateResourcePayload(payload);

      const result = await this.callRpc(
        this.rpc.updateResource,
        {
          p_resource_id: resourceId,
          p_title: payload.title.trim(),
          p_description: payload.description.trim(),
          p_content: payload.content || "",
          p_category: payload.category,
          p_difficulty: payload.difficulty || "beginner",
          p_resource_type: payload.resource_type || "article",
          p_cover_image_url: payload.cover_image_url || null,
          p_download_url: payload.download_url || null
        }
      );

      this.notify("Resource updated successfully.", "success");
      return result;
    },

    validateResourcePayload(payload) {
      if (!payload || !String(payload.title || "").trim()) {
        throw new Error("Resource title is required.");
      }

      if (!String(payload.description || "").trim()) {
        throw new Error("Resource description is required.");
      }

      if 