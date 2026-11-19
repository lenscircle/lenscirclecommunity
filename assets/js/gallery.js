
/* =====================================================
   LENS CIRCLE
   Shared Photography Gallery Engine
   File: assets/js/gallery.js

   Dependencies:
   - assets/js/helpers.js
   - assets/css/main.css

   This file handles gallery presentation.
   It does not independently retrieve database records.
   ===================================================== */

(function () {
  "use strict";

  const Gallery = window.LensCircleGallery = {};

  // ----------------------------------------------------
  // 1. DEFAULT CONFIGURATION
  // ----------------------------------------------------

  const DEFAULTS = {
    pageSize: 12,
    imageAspect: "4 / 3",
    emptyMessage: "No photographs found.",
    showPhotographer: true,
    showCategory: true,
    showCaption: true,
    enableLightbox: true,
    enableSearch: true,
    enableCategories: true,
    enableSorting: true
  };

  const instances = new Map();

  // ----------------------------------------------------
  // 2. NORMALISE PHOTOGRAPH DATA
  // ----------------------------------------------------

  function normalisePhoto(photo, index) {
    return {
      id: String(photo.id || "photo-" + index),
      title: String(photo.title || "Untitled photograph"),
      image: String(photo.image || photo.image_url || ""),
      thumbnail: String(
        photo.thumbnail || photo.image || photo.image_url || ""
      ),
      photographer: String(
        photo.photographer || photo.creator || "Lens Circle"
      ),
      category: String(photo.category || "Photography"),
      caption: String(photo.caption || ""),
      location: String(photo.location || ""),
      createdAt: photo.created_at || photo.createdAt || null,
      likes: Number(photo.likes || 0),
      featured: Boolean(photo.featured),
      alt: String(
        photo.alt || photo.title || "Photography artwork"
      )
    };
  }

  // ----------------------------------------------------
  // 3. SAFE URL VALIDATION
  // ----------------------------------------------------

  function validImageUrl(value) {
    try {
      const url = new URL(
        value,
        window.location.origin
      );

      return (
        url.protocol === "https:" ||
        url.protocol === "http:"
      ) ? url.href : "";
    } catch (error) {
      return "";
    }
  }

  // ----------------------------------------------------
  // 4. CREATE ELEMENT
  // ----------------------------------------------------

  function createElement(tag, className, text) {
    const element = document.createElement(tag);

    if (className) {
      element.className = className;
    }

    if (text !== undefined) {
      element.textContent = text;
    }

    return element;
  }

  // ----------------------------------------------------
  // 5. BUILD PHOTO CARD
  // ----------------------------------------------------

  function createPhotoCard(photo, options) {
    const card = createElement("article", "lc-gallery-card");

    card.dataset.photoId = photo.id;

    const imageButton = createElement(
      "button",
      "lc-gallery-image-button"
    );

    imageButton.type = "button";
    imageButton.setAttribute(
      "aria-label",
      "View " + photo.title
    );

    const image = createElement(
      "img",
      "lc-gallery-image"
    );

    image.src = validImageUrl(photo.thumbnail);
    image.alt = photo.alt;
    image.loading = "lazy";
    image.decoding = "async";

    imageButton.appendChild(image);
    card.appendChild(imageButton);

    const details = createElement(
      "div",
      "lc-gallery-details"
    );

    if (options.showCategory) {
      details.appendChild(
        createElement(
          "span",
          "lc-gallery-category",
          photo.category
        )
      );
    }

    if (options.showCaption) {
      details.appendChild(
        createElement(
          "h3",
          "lc-gallery-title",
          photo.title
        )
      );
    }

    if (options.showPhotographer) {
      details.appendChild(
        createElement(
          "p",
          "lc-gallery-photographer",
          "Photograph by " + photo.photographer
        )
      );
    }

    if (photo.location) {
      details.appendChild(
        createElement(
          "p",
          "lc-gallery-location",
          photo.location
        )
      );
    }

    card.appendChild(details);

    if (options.enableLightbox) {
      imageButton.addEventListener("click", function () {
        Gallery.openLightbox(photo, options);
      });
    }

    return card;
  }

  // ----------------------------------------------------
  // 6. LIGHTBOX
  // ----------------------------------------------------

  let lightbox = null;

  function createLightbox() {
    if (lightbox) return lightbox;

    lightbox = createElement(
      "div",
      "lc-lightbox"
    );

    lightbox.hidden = true;
    lightbox.setAttribute("role", "dialog");
    lightbox.setAttribute("aria-modal", "true");
    lightbox.setAttribute(
      "aria-label",
      "Photograph viewer"
    );

    const close = createElement(
      "button",
      "lc-lightbox-close",
      "×"
    );

    close.type = "button";
    close.setAttribute(
      "aria-label",
      "Close photograph viewer"
    );

    const content = createElement(
      "div",
      "lc-lightbox-content"
    );

    const image = createElement(
      "img",
      "lc-lightbox-image"
    );

    const caption = createElement(
      "div",
      "lc-lightbox-caption"
    );

    content.appendChild(image);
    content.appendChild(caption);

    lightbox.appendChild(close);
    lightbox.appendChild(content);

    document.body.appendChild(lightbox);

    close.addEventListener("click", Gallery.closeLightbox);

    lightbox.addEventListener("click", function (event) {
      if (event.target === lightbox) {
        Gallery.closeLightbox();
      }
    });

    document.addEventListener("keydown", function (event) {
      if (
        event.key === "Escape" &&
        !lightbox.hidden
      ) {
        Gallery.closeLightbox();
      }
    });

    return lightbox;
  }

  Gallery.openLightbox = function (photo) {
    const viewer = createLightbox();

    const image = viewer.querySelector(
      ".lc-lightbox-image"
    );

    const caption = viewer.querySelector(
      ".lc-lightbox-caption"
    );

    const imageUrl = validImageUrl(photo.image);

    if (!imageUrl) return;

    image.src = imageUrl;
    image.alt = photo.alt;

    caption.replaceChildren();

    const title = createElement(
      "h3",
      "",
      photo.title
    );

    const photographer = createElement(
      "p",
      "",
      "Photograph by " + photo.photographer
    );

    const description = createElement(
      "p",
      "",
      photo.caption
    );

    caption.appendChild(title);
    caption.appendChild(photographer);

    if (photo.caption) {
      caption.appendChild(description);
    }

    viewer.hidden = false;
    document.body.classList.add("lc-lightbox-open");

    const closeButton = viewer.querySelector(
      ".lc-lightbox-close"
    );

    closeButton.focus();
  };

  Gallery.closeLightbox = function () {
    if (!lightbox) return;

    lightbox.hidden = true;

    document.body.classList.remove(
      "lc-lightbox-open"
    );
  };

  // ----------------------------------------------------
  // 7. CATEGORY EXTRACTION
  // ----------------------------------------------------

  function getCategories(photos) {
    return Array.from(
      new Set(
        photos.map(function (photo) {
          return photo.category;
        }).filter(Boolean)
      )
    ).sort();
  }

  // ----------------------------------------------------
  // 8. FILTER PHOTOGRAPHS
  // ----------------------------------------------------

  function filterPhotos(photos, state) {
    return photos.filter(function (photo) {
      const matchesSearch =
        !state.search ||
        [
          photo.title,
          photo.photographer,
          photo.category,
          photo.caption,
          photo.location
        ].join(" ").toLowerCase().includes(
          state.search.toLowerCase()
        );

      const matchesCategory =
        !state.category ||
        state.category === "all" ||
        photo.category === state.category;

      return matchesSearch && matchesCategory;
    });
  }

  // ----------------------------------------------------
  // 9. SORT PHOTOGRAPHS
  // ----------------------------------------------------

  function sortPhotos(photos, sortMode) {
    const result = photos.slice();

    if (sortMode === "oldest") {
      return result.sort(function (a, b) {
        return new Date(a.createdAt || 0) -
          new Date(b.createdAt || 0);
      });
    }

    if (sortMode === "most-liked") {
      return result.sort(function (a, b) {
        return b.likes - a.likes;
      });
    }

    if (sortMode === "title") {
      return result.sort(function (a, b) {
        return a.title.localeCompare(b.title);
      });
    }

    if (sortMode === "featured") {
      return result.sort(function (a, b) {
        return Number(b.featured) -
          Number(a.featured);
      });
    }

    return result.sort(function (a, b) {
      return new Date(b.createdAt || 0) -
        new Date(a.createdAt || 0);
    });
  }

  // ----------------------------------------------------
  // 10. RENDER GALLERY
  // ----------------------------------------------------

  function renderGallery(instance) {
    const filtered = filterPhotos(
      instance.photos,
      instance.state
    );

    const sorted = sortPhotos(
      filtered,
      instance.state.sort
    );

    const pagination = window.LensCircleHelpers
      ? window.LensCircleHelpers.paginate(
          sorted,
          instance.state.page,
          instance.options.pageSize
        )
      : {
          items: sorted,
          page: 1,
          totalPages: 1
        };

    instance.grid.replaceChildren();

    if (!pagination.items.length) {
      const empty = createElement(
        "div",
        "lc-gallery-empty",
        instance.options.emptyMessage
      );

      instance.grid.appendChild(empty);
    } else {
      pagination.items.forEach(function (photo) {
        instance.grid.appendChild(
          createPhotoCard(photo, instance.options)
        );
      });
    }

    instance.state.page = pagination.page || 1;

    if (instance.pagination) {
      renderPagination(
        instance,
        pagination
      );
    }

    if (instance.resultCount) {
      instance.resultCount.textContent =
        sorted.length + " photographs";
    }
  }

  // ----------------------------------------------------
  // 11. PAGINATION CONTROLS
  // ----------------------------------------------------

  function renderPagination(instance, pagination) {
    const container = instance.pagination;

    container.replaceChildren();

    if (pagination.totalPages <= 1) {
      return;
    }

    const previous = createElement(
      "button",
      "lc-gallery-page-button",
      "Previous"
    );

    previous.type = "button";
    previous.disabled = !pagination.hasPrevious;

    previous.addEventListener("click", function () {
      instance.state.page--;
      renderGallery(instance);
    });

    const current = createElement(
      "span",
      "lc-gallery-page-current",
      "Page " + pagination.page +
      " of " + pagination.totalPages
    );

    const next = createElement(
      "button",
      "lc-gallery-page-button",
      "Next"
    );

    next.type = "button";
    next.disabled = !pagination.hasNext;

    next.addEventListener("click", function () {
      instance.state.page++;
      renderGallery(instance);
    });

    container.appendChild(previous);
    container.appendChild(current);
    container.appendChild(next);
  }

  // ----------------------------------------------------
  // 12. BUILD FILTER CONTROLS
  // ----------------------------------------------------

  function buildControls(instance) {
    const controls = instance.controls;

    if (!controls) return;

    controls.replaceChildren();

    if (instance.options.enableSearch) {
      const search = createElement(
        "input",
        "lc-gallery-search"
      );

      search.type = "search";
      search.placeholder = "Search photographs…";
      search.setAttribute(
        "aria-label",
        "Search photographs"
      );

      search.addEventListener(
        "input",
        function () {
          instance.state.search = search.value;
          instance.state.page = 1;
          renderGallery(instance);
        }
      );

      controls.appendChild(search);
    }

    if (instance.options.enableCategories) {
      const select = createElement(
        "select",
        "lc-gallery-category-filter"
      );

      select.setAttribute(
        "aria-label",
        "Filter by category"
      );

      const allOption = createElement(
        "option",
        "",
        "All categories"
      );

      allOption.value = "all";
      select.appendChild(allOption);

      getCategories(instance.photos).forEach(
        function (category) {
          const option = createElement(
            "option",
            "",
            category
          );

          option.value = category;
          select.appendChild(option);
        }
      );

      select.addEventListener("change", function () {
        instance.state.category = select.value;
        instance.state.page = 1;
        renderGallery(instance);
      });

      controls.appendChild(select);
    }

    if (instance.options.enableSorting) {
      const sort = createElement(
        "select",
        "lc-gallery-sort"
      );

      sort.setAttribute(
        "aria-label",
        "Sort photographs"
      );

      const sortOptions = [
        ["newest", "Newest first"],
        ["oldest", "Oldest first"],
        ["most-liked", "Most liked"],
        ["title", "Title"],
        ["featured", "Featured"]
      ];

      sortOptions.forEach(function (item) {
        const option = createElement(
          "option",
          "",
          item[1]
        );

        option.value = item[0];
        sort.appendChild(option);
      });

      sort.addEventListener("change", function () {
        instance.state.sort = sort.value;
        instance.state.page = 1;
        renderGallery(instance);
      });

      controls.appendChild(sort);
    }
  }

  // ----------------------------------------------------
  // 13. INITIALISE GALLERY
  // ----------------------------------------------------

  Gallery.init = function (config) {
    if (!config || !config.container) {
      throw new Error(
        "Gallery container is required."
      );
    }

    const container =
      typeof config.container === "string"
        ? document.querySelector(config.container)
        : config.container;

    if (!container) {
      throw new Error(
        "Gallery container was not found."
      );
    }

    const options = Object.assign(
      {},
      DEFAULTS,
      config.options || {}
    );

    const id = config.id ||
      "gallery-" + Math.random().toString(36).slice(2);

    container.replaceChildren();

    const wrapper = createElement(
      "div",
      "lc-gallery-wrapper"
    );

    const controls = createElement(
      "div",
      "lc-gallery-controls"
    );

    const count = createElement(
      "div",
      "lc-gallery-count"
    );

    const grid = createElement(
      "div",
      "lc-gallery-grid"
    );

    grid.style.setProperty(
      "--lc-gallery-aspect",
      options.imageAspect
    );

    const pagination = createElement(
      "div",
      "lc-gallery-pagination"
    );

    wrapper.appendChild(controls);
    wrapper.appendChild(count);
    wrapper.appendChild(grid);
    wrapper.appendChild(pagination);

    container.appendChild(wrapper);

    const instance = {
      id: id,
      container: container,
      wrapper: wrapper,
      controls: controls,
      resultCount: count,
      grid: grid,
      pagination: pagination,
      photos: (config.photos || []).map(
        normalisePhoto
      ),
      options: options,
      state: {
        search: "",
        category: "all",
        sort: "newest",
        page: 1
      }
    };

    instances.set(id, instance);

    buildControls(instance);
    renderGallery(instance);

    return {
      id: id,

      refresh: function (photos) {
        if (Array.isArray(photos)) {
          instance.photos = photos.map(
            normalisePhoto
          );
        }

        instance.state.page = 1;

        buildControls(instance);
        renderGallery(instance);
      },

      getPhotos: function () {
        return instance.photos.slice();
      },

      destroy: function () {
        instance.container.replaceChildren();
        instances.delete(id);
      }
    };
  };

  // ----------------------------------------------------
  // 14. UPDATE GALLERY DATA
  // ----------------------------------------------------

  Gallery.update = function (id, photos) {
    const instance = instances.get(id);

    if (!instance) {
      throw new Error("Gallery instance not found.");
    }

    instance.photos = (photos || []).map(
      normalisePhoto
    );

    instance.state.page = 1;

    buildControls(instance);
    renderGallery(instance);
  };

  // ----------------------------------------------------
  // 15. DESTROY GALLERY
  // ----------------------------------------------------

  Gallery.destroy = function (id) {
    const instance = instances.get(id);

    if (!instance) return false;

    instance.container.replaceChildren();

    instances.delete(id);

    return true;
  };

  // ----------------------------------------------------
  // 16. EXPORT
  // ----------------------------------------------------

  Gallery.version = "1.0.0";

  console.info(
    "Lens Circle: Gallery engine loaded."
  );

})();
