
/* =====================================================
   LENS CIRCLE
   Shared Frontend Interactions
   File: assets/js/main.js
   ===================================================== */

(function () {
  "use strict";

  const LC = window.LensCircleUI = {};

  // ----------------------------------------------------
  // 1. SELECTOR UTILITIES
  // ----------------------------------------------------

  LC.select = function (selector, parent) {
    return (parent || document).querySelector(selector);
  };

  LC.selectAll = function (selector, parent) {
    return Array.from(
      (parent || document).querySelectorAll(selector)
    );
  };

  LC.on = function (element, event, callback, options) {
    if (!element) return;

    element.addEventListener(
      event,
      callback,
      options || false
    );
  };

  // ----------------------------------------------------
  // 2. MOBILE NAVIGATION
  // ----------------------------------------------------

  LC.initMobileNavigation = function () {
    const toggle = LC.select("[data-lc-menu-toggle]");
    const menu = LC.select("[data-lc-mobile-menu]");

    if (!toggle || !menu) return;

    function closeMenu() {
      menu.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
      document.body.classList.remove("lc-menu-open");
    }

    function openMenu() {
      menu.classList.add("is-open");
      toggle.setAttribute("aria-expanded", "true");
      document.body.classList.add("lc-menu-open");
    }

    LC.on(toggle, "click", function () {
      const isOpen =
        toggle.getAttribute("aria-expanded") === "true";

      if (isOpen) {
        closeMenu();
      } else {
        openMenu();
      }
    });

    LC.selectAll("a", menu).forEach(function (link) {
      LC.on(link, "click", closeMenu);
    });

    LC.on(document, "keydown", function (event) {
      if (event.key === "Escape") {
        closeMenu();
      }
    });

    LC.on(document, "click", function (event) {
      if (
        !menu.contains(event.target) &&
        !toggle.contains(event.target)
      ) {
        closeMenu();
      }
    });
  };

  // ----------------------------------------------------
  // 3. ACTIVE NAVIGATION LINK
  // ----------------------------------------------------

  LC.initActiveNavigation = function () {
    const currentPath = window.location.pathname
      .replace(/\/$/, "");

    LC.selectAll("[data-lc-nav] a").forEach(function (link) {
      const linkPath = new URL(
        link.href,
        window.location.origin
      ).pathname.replace(/\/$/, "");

      if (linkPath === currentPath) {
        link.classList.add("active");
        link.setAttribute("aria-current", "page");
      }
    });
  };

  // ----------------------------------------------------
  // 4. NOTIFICATION SYSTEM
  // ----------------------------------------------------

  LC.notify = function (
    message,
    type,
    duration
  ) {
    if (!message) return;

    let container = LC.select("#lc-notifications");

    if (!container) {
      container = document.createElement("div");
      container.id = "lc-notifications";
      container.className = "lc-notifications";

      container.setAttribute("aria-live", "polite");
      container.setAttribute("aria-atomic", "true");

      document.body.appendChild(container);
    }

    const notification = document.createElement("div");

    notification.className =
      "lc-notification lc-notification-" +
      (type || "info");

    const messageElement = document.createElement("span");
    messageElement.textContent = message;

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.textContent = "×";
    closeButton.setAttribute(
      "aria-label",
      "Dismiss notification"
    );

    notification.appendChild(messageElement);
    notification.appendChild(closeButton);
    container.appendChild(notification);

    function removeNotification() {
      notification.classList.add("is-removing");

      window.setTimeout(function () {
        notification.remove();

        if (!container.children.length) {
          container.remove();
        }
      }, 200);
    }

    LC.on(closeButton, "click", removeNotification);

    window.setTimeout(
      removeNotification,
      duration || 4500
    );
  };

  // ----------------------------------------------------
  // 5. CONFIRMATION DIALOG
  // ----------------------------------------------------

  LC.confirm = function (message) {
    return window.confirm(
      message || "Are you sure you want to continue?"
    );
  };

  // ----------------------------------------------------
  // 6. PASSWORD VISIBILITY
  // ----------------------------------------------------

  LC.initPasswordVisibility = function () {
    LC.selectAll("[data-lc-password-toggle]").forEach(
      function (button) {
        const targetId =
          button.getAttribute("data-lc-password-toggle");

        const input = document.getElementById(targetId);

        if (!input) return;

        LC.on(button, "click", function () {
          const visible = input.type === "text";

          input.type = visible ? "password" : "text";

          button.setAttribute(
            "aria-label",
            visible ? "Show password" : "Hide password"
          );

          button.textContent = visible ? "Show" : "Hide";
        });
      }
    );
  };

  // ----------------------------------------------------
  // 7. CHARACTER COUNTER
  // ----------------------------------------------------

  LC.initCharacterCounters = function () {
    LC.selectAll("[data-lc-character-count]").forEach(
      function (counter) {
        const targetId =
          counter.getAttribute("data-lc-character-count");

        const input = document.getElementById(targetId);

        if (!input) return;

        const maximum = Number(
          input.getAttribute("maxlength") || 0
        );

        function update() {
          counter.textContent =
            input.value.length +
            (maximum ? " / " + maximum : "");
        }

        LC.on(input, "input", update);
        update();
      }
    );
  };

  // ----------------------------------------------------
  // 8. IMAGE PREVIEW
  // ----------------------------------------------------

  LC.initImagePreviews = function () {
    LC.selectAll("[data-lc-image-preview]").forEach(
      function (input) {
        const targetId =
          input.getAttribute("data-lc-image-preview");

        const image = document.getElementById(targetId);

        if (!image) return;

        LC.on(input, "change", function () {
          const file = input.files && input.files[0];

          if (!file) return;

          if (!file.type.startsWith("image/")) {
            LC.notify(
              "Please select a valid image file.",
              "error"
            );

            input.value = "";
            return;
          }

          const maxSize =
            Number(input.dataset.maxSizeMb || 5) *
            1024 *
            1024;

          if (file.size > maxSize) {
            LC.notify(
              "Image exceeds the permitted file size.",
              "error"
            );

            input.value = "";
            return;
          }

          if (image.dataset.previewUrl) {
            URL.revokeObjectURL(
              image.dataset.previewUrl
            );
          }

          const previewUrl = URL.createObjectURL(file);

          image.src = previewUrl;
          image.dataset.previewUrl = previewUrl;
          image.hidden = false;
        });
      }
    );
  };

  // ----------------------------------------------------
  // 9. FORM VALIDATION
  // ----------------------------------------------------

  LC.initFormValidation = function () {
    LC.selectAll("[data-lc-validate]").forEach(
      function (form) {
        LC.on(form, "submit", function (event) {
          if (!form.checkValidity()) {
            event.preventDefault();
            form.reportValidity();
          }
        });
      }
    );
  };

  // ----------------------------------------------------
  // 10. PASSWORD MATCH VALIDATION
  // ----------------------------------------------------

  LC.initPasswordMatch = function () {
    LC.selectAll("[data-lc-password-match]").forEach(
      function (form) {
        const passwordId =
          form.dataset.passwordId || "password";

        const confirmId =
          form.dataset.confirmPasswordId ||
          "confirm-password";

        const password =
          document.getElementById(passwordId);

        const confirmation =
          document.getElementById(confirmId);

        if (!password || !confirmation) return;

        function validate() {
          if (
            confirmation.value &&
            password.value !== confirmation.value
          ) {
            confirmation.setCustomValidity(
              "Passwords do not match."
            );
          } else {
            confirmation.setCustomValidity("");
          }
        }

        LC.on(password, "input", validate);
        LC.on(confirmation, "input", validate);
      }
    );
  };

  // ----------------------------------------------------
  // 11. FILTERABLE CONTENT
  // ----------------------------------------------------

  LC.initFilters = function () {
    LC.selectAll("[data-lc-filter]").forEach(
      function (filter) {
        const targetSelector =
          filter.dataset.target || "[data-lc-filter-item]";

        const items = LC.selectAll(targetSelector);

        LC.on(filter, "input", applyFilter);
        LC.on(filter, "change", applyFilter);

        function applyFilter() {
          const query = filter.value
            .trim()
            .toLowerCase();

          items.forEach(function (item) {
            const content = (
              item.textContent +
              " " +
              (item.dataset.search || "")
            ).toLowerCase();

            item.hidden = !content.includes(query);
          });
        }
      }
    );
  };

  // ----------------------------------------------------
  // 12. SORTABLE CONTENT
  // ----------------------------------------------------

  LC.initSort = function () {
    LC.selectAll("[data-lc-sort]").forEach(
      function (select) {
        const targetSelector =
          select.dataset.target || "[data-lc-sort-item]";

        const container =
          document.querySelector(
            select.dataset.container || ""
          ) || select.parentElement;

        if (!container) return;

        LC.on(select, "change", function () {
          const items = LC.selectAll(
            targetSelector,
            container
          );

          const mode = select.value;

          items.sort(function (a, b) {
            const first = (
              a.dataset[mode] ||
              a.textContent
            ).toLowerCase();

            const second = (
              b.dataset[mode] ||
              b.textContent
            ).toLowerCase();

            return first.localeCompare(second);
          });

          items.forEach(function (item) {
            container.appendChild(item);
          });
        });
      }
    );
  };

  // ----------------------------------------------------
  // 13. COPY TO CLIPBOARD
  // ----------------------------------------------------

  LC.copyText = async function (text) {
    if (!navigator.clipboard) {
      LC.notify(
        "Clipboard access is unavailable.",
        "error"
      );

      return false;
    }

    try {
      await navigator.clipboard.writeText(text);

      LC.notify(
        "Copied to clipboard.",
        "success"
      );

      return true;
    } catch (error) {
      LC.notify(
        "Unable to copy text.",
        "error"
      );

      return false;
    }
  };

  LC.initCopyButtons = function () {
    LC.selectAll("[data-lc-copy]").forEach(
      function (button) {
        LC.on(button, "click", function () {
          const targetId =
            button.dataset.lcCopy;

          const target =
            document.getElementById(targetId);

          if (target) {
            LC.copyText(target.value || target.textContent);
          }
        });
      }
    );
  };

  // ----------------------------------------------------
  // 14. SCROLL TO TOP
  // ----------------------------------------------------

  LC.initScrollToTop = function () {
    const button = LC.select("[data-lc-scroll-top]");

    if (!button) return;

    LC.on(button, "click", function () {
      window.scrollTo({
        top: 0,
        behavior: "smooth"
      });
    });
  };

  // ----------------------------------------------------
  // 15. CURRENT YEAR
  // ----------------------------------------------------

  LC.initCurrentYear = function () {
    LC.selectAll("[data-lc-year]").forEach(
      function (element) {
        element.textContent =
          new Date().getFullYear();
      }
    );
  };

  // ----------------------------------------------------
  // 16. PASSWORD STRENGTH INDICATOR
  // ----------------------------------------------------

  LC.initPasswordStrength = function () {
    LC.selectAll("[data-lc-password-strength]").forEach(
      function (input) {
        const targetId =
          input.dataset.lcPasswordStrength;

        const output =
          document.getElementById(targetId);

        if (!output) return;

        LC.on(input, "input", function () {
          const value = input.value;

          let score = 0;

          if (value.length >= 8) score++;
          if (/[A-Z]/.test(value)) score++;
          if (/[a-z]/.test(value)) score++;
          if (/[0-9]/.test(value)) score++;
          if (/[^A-Za-z0-9]/.test(value)) score++;

          const levels = [
            "Very weak",
            "Weak",
            "Fair",
            "Good",
            "Strong",
            "Very strong"
          ];

          output.textContent =
            value.length ? levels[score] : "";

          output.dataset.strength = String(score);
        });
      }
    );
  };

  // ----------------------------------------------------
  // 17. INITIALISE SHARED COMPONENTS
  // ----------------------------------------------------

  function initialise() {
    LC.initMobileNavigation();
    LC.initActiveNavigation();
    LC.initPasswordVisibility();
    LC.initCharacterCounters();
    LC.initImagePreviews();
    LC.initFormValidation();
    LC.initPasswordMatch();
    LC.initFilters();
    LC.initSort();
    LC.initCopyButtons();
    LC.initScrollToTop();
    LC.initCurrentYear();
    LC.initPasswordStrength();

    document.documentElement.classList.add(
      "lc-js-ready"
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      initialise
    );
  } else {
    initialise();
  }

})();
