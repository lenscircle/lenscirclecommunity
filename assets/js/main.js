
/* =========================================================
   LENS CIRCLE
   Main Website JavaScript
   File: assets/js/main.js

   Shared functionality:
   1. Mobile navigation
   2. Dropdown menus
   3. Search interface
   4. Theme switching
   5. Modal management
   6. Toast notifications
   7. Accordion components
   8. Tabs
   9. Scroll effects
   10. Back-to-top button
   11. Smooth scrolling
   12. Copy-to-clipboard
   13. Shared utility functions

   Supabase authentication and database operations
   are handled by their dedicated modules.
========================================================= */

(function () {
  "use strict";

  /* =====================================================
     1. CONFIGURATION
  ===================================================== */

  const CONFIG = {
    selectors: {
      mobileMenu: [
        "[data-mobile-menu]",
        ".mobile-menu",
        "#mobile-menu"
      ],

      menuToggle: [
        "[data-menu-toggle]",
        ".menu-toggle",
        ".hamburger",
        "#menu-toggle"
      ],

      nav: [
        "[data-main-navigation]",
        ".main-navigation",
        ".site-nav",
        "nav"
      ],

      themeToggle: [
        "[data-theme-toggle]",
        ".theme-toggle",
        "#theme-toggle"
      ],

      searchToggle: [
        "[data-search-toggle]",
        ".search-toggle"
      ],

      searchPanel: [
        "[data-search-panel]",
        ".search-panel",
        "#search-panel"
      ],

      backToTop: [
        "[data-back-to-top]",
        ".back-to-top"
      ]
    },

    theme: {
      storageKey: "lens-circle-theme",
      default: "light"
    },

    scroll: {
      headerClass: "is-scrolled",
      threshold: 30
    },

    animation: {
      revealThreshold: 0.12
    }
  };


  /* =====================================================
     2. MAIN OBJECT
  ===================================================== */

  const LensCircle = {

    initialized: false,

    state: {
      theme: CONFIG.theme.default,
      mobileMenuOpen: false,
      searchOpen: false,
      activeModal: null
    },


    /* =================================================
       3. INITIALIZATION
    ================================================= */

    init() {
      if (this.initialized) return;

      this.initialized = true;

      this.initializeTheme();
      this.initializeNavigation();
      this.initializeDropdowns();
      this.initializeSearch();
      this.initializeModals();
      this.initializeAccordions();
      this.initializeTabs();
      this.initializeScrollEffects();
      this.initializeBackToTop();
      this.initializeSmoothScrolling();
      this.initializeRevealAnimations();
      this.initializeCopyButtons();
      this.initializeCounters();
      this.initializeCurrentYear();
      this.initializeGlobalEvents();

      document.documentElement.classList.add("lc-ready");

      this.emit("lenscircle:ready");

      console.info("Lens Circle initialized.");
    },


    /* =================================================
       4. DOM UTILITIES
    ================================================= */

    $(selector, parent = document) {
      return parent.querySelector(selector);
    },

    $$(selector, parent = document) {
      return Array.from(parent.querySelectorAll(selector));
    },

    findFirst(selectors) {
      for (const selector of selectors) {
        const element = this.$(selector);
        if (element) return element;
      }

      return null;
    },

    findAll(selectors) {
      const elements = [];

      selectors.forEach(selector => {
        this.$$(selector).forEach(element => {
          if (!elements.includes(element)) {
            elements.push(element);
          }
        });
      });

      return elements;
    },

    escapeHTML(value) {
      return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      })[character]);
    },

    emit(name, detail = {}) {
      document.dispatchEvent(
        new CustomEvent(name, { detail })
      );
    },


    /* =================================================
       5. MOBILE NAVIGATION
    ================================================= */

    initializeNavigation() {
      const toggles = this.findAll(CONFIG.selectors.menuToggle);
      const menus = this.findAll(CONFIG.selectors.mobileMenu);

      toggles.forEach(toggle => {
        toggle.addEventListener("click", () => {
          this.toggleMobileMenu();
        });
      });

      menus.forEach(menu => {
        menu.addEventListener("click", event => {
          const link = event.target.closest("a");

          if (link) {
            this.closeMobileMenu();
          }
        });
      });

      document.addEventListener("keydown", event => {
        if (event.key === "Escape") {
          this.closeMobileMenu();
        }
      });

      window.addEventListener("resize", () => {
        if (window.innerWidth > 900) {
          this.closeMobileMenu();
        }
      });
    },

    toggleMobileMenu() {
      if (this.state.mobileMenuOpen) {
        this.closeMobileMenu();
      } else {
        this.openMobileMenu();
      }
    },

    openMobileMenu() {
      this.state.mobileMenuOpen = true;

      const menus = this.findAll(CONFIG.selectors.mobileMenu);
      const toggles = this.findAll(CONFIG.selectors.menuToggle);

      menus.forEach(menu => {
        menu.classList.add("active");
        menu.classList.add("is-open");
        menu.setAttribute("aria-hidden", "false");
      });

      toggles.forEach(toggle => {
        toggle.classList.add("active");
        toggle.setAttribute("aria-expanded", "true");
      });

      document.body.classList.add("menu-open");

      this.emit("lenscircle:menu-open");
    },

    closeMobileMenu() {
      this.state.mobileMenuOpen = false;

      const menus = this.findAll(CONFIG.selectors.mobileMenu);
      const toggles = this.findAll(CONFIG.selectors.menuToggle);

      menus.forEach(menu => {
        menu.classList.remove("active");
        menu.classList.remove("is-open");
        menu.setAttribute("aria-hidden", "true");
      });

      toggles.forEach(toggle => {
        toggle.classList.remove("active");
        toggle.setAttribute("aria-expanded", "false");
      });

      document.body.classList.remove("menu-open");

      this.emit("lenscircle:menu-close");
    },


    /* =================================================
       6. DROPDOWN MENUS
    ================================================= */

    initializeDropdowns() {
      const dropdowns = this.$$(
        "[data-dropdown], .nav-dropdown, .dropdown"
      );

      dropdowns.forEach(dropdown => {
        const trigger = dropdown.querySelector(
          "[data-dropdown-toggle], .dropdown-toggle"
        );

        const panel = dropdown.querySelector(
          "[data-dropdown-menu], .dropdown-menu"
        );

        if (!trigger || !panel) return;

        trigger.setAttribute("aria-expanded", "false");

        trigger.addEventListener("click", event => {
          event.preventDefault();

          const isOpen = dropdown.classList.contains("is-open");

          this.closeDropdowns(dropdowns);

          if (!isOpen) {
            dropdown.classList.add("is-open");
            trigger.setAttribute("aria-expanded", "true");
          }
        });
      });

      document.addEventListener("click", event => {
        if (!event.target.closest(
          "[data-dropdown], .nav-dropdown, .dropdown"
        )) {
          this.closeDropdowns(dropdowns);
        }
      });
    },

    closeDropdowns(dropdowns = []) {
      dropdowns.forEach(dropdown => {
        dropdown.classList.remove("is-open");

        const trigger = dropdown.querySelector(
          "[data-dropdown-toggle], .dropdown-toggle"
        );

        trigger?.setAttribute("aria-expanded", "false");
      });
    },


    /* =================================================
       7. SEARCH
    ================================================= */

    initializeSearch() {
      const toggles = this.findAll(CONFIG.selectors.searchToggle);
      const panels = this.findAll(CONFIG.selectors.searchPanel);

      toggles.forEach(toggle => {
        toggle.addEventListener("click", () => {
          this.toggleSearch();
        });
      });

      panels.forEach(panel => {
        const closeButton = panel.querySelector(
          "[data-search-close]"
        );

        closeButton?.addEventListener("click", () => {
          this.closeSearch();
        });

        const form = panel.querySelector("form");

        form?.addEventListener("submit", event => {
          const input = form.querySelector(
            'input[type="search"], input[name="q"]'
          );

          if (!input?.value.trim()) {
            event.preventDefault();
            input?.focus();
          }
        });
      });

      document.addEventListener("keydown", event => {
        if (
          (event.ctrlKey || event.metaKey) &&
          event.key.toLowerCase() === "k"
        ) {
          event.preventDefault();
          this.openSearch();
        }

        if (event.key === "Escape") {
          this.closeSearch();
        }
      });
    },

    toggleSearch() {
      this.state.searchOpen
        ? this.closeSearch()
        : this.openSearch();
    },

    openSearch() {
      this.state.searchOpen = true;

      const panels = this.findAll(CONFIG.selectors.searchPanel);

      panels.forEach(panel => {
        panel.classList.add("active");
        panel.classList.add("is-open");
        panel.setAttribute("aria-hidden", "false");
      });

      const input = this.findFirst([
        "[data-search-panel] input",
        ".search-panel input",
        "#search-panel input"
      ]);

      input?.focus();

      this.emit("lenscircle:search-open");
    },

    closeSearch() {
      this.state.searchOpen = false;

      const panels = this.findAll(CONFIG.selectors.searchPanel);

      panels.forEach(panel => {
        panel.classList.remove("active");
        panel.classList.remove("is-open");
        panel.setAttribute("aria-hidden", "true");
      });

      this.emit("lenscircle:search-close");
    },


    /* =================================================
       8. THEME MANAGEMENT
    ================================================= */

    initializeTheme() {
      let savedTheme = CONFIG.theme.default;

      try {
        savedTheme = localStorage.getItem(
          CONFIG.theme.storageKey
        ) || CONFIG.theme.default;
      } catch (error) {
        console.warn("Theme storage unavailable.");
      }

      this.setTheme(savedTheme, false);

      const toggles = this.findAll(
        CONFIG.selectors.themeToggle
      );

      toggles.forEach(toggle => {
        toggle.addEventListener("click", () => {
          this.toggleTheme();
        });
      });
    },

    setTheme(theme, save = true) {
      const validTheme = theme === "dark" ? "dark" : "light";

      this.state.theme = validTheme;

      document.documentElement.dataset.theme = validTheme;
      document.documentElement.classList.toggle(
        "dark-theme",
        validTheme === "dark"
      );

      document.documentElement.classList.toggle(
        "light-theme",
        validTheme === "light"
      );

      const toggles = this.findAll(
        CONFIG.selectors.themeToggle
      );

      toggles.forEach(toggle => {
        toggle.setAttribute(
          "aria-label",
          validTheme === "dark"
            ? "Switch to light theme"
            : "Switch to dark theme"
        );

        toggle.setAttribute(
          "aria-pressed",
          String(validTheme === "dark")
        );
      });

      if (save) {
        try {
          localStorage.setItem(
            CONFIG.theme.storageKey,
            validTheme
          );
        } catch (error) {
          console.warn("Unable to save theme preference.");
        }
      }

      this.emit("lenscircle:theme-change", {
        theme: validTheme
      });
    },

    toggleTheme() {
      this.setTheme(
        this.state.theme === "dark" ? "light" : "dark"
      );
    },


    /* =================================================
       9. MODAL MANAGEMENT
    ================================================= */

    initializeModals() {
      document.addEventListener("click", event => {
        const openButton = event.target.closest(
          "[data-modal-open]"
        );

        const closeButton = event.target.closest(
          "[data-modal-close]"
        );

        if (openButton) {
          event.preventDefault();

          this.openModal(
            openButton.dataset.modalOpen
          );

          return;
        }

        if (closeButton) {
          event.preventDefault();
          this.closeModal();
          return;
        }

        const modal = event.target.closest("[data-modal]");

        if (modal && event.target === modal) {
          this.closeModal();
        }
      });

      document.addEventListener("keydown", event => {
        if (
          event.key === "Escape" &&
          this.state.activeModal
        ) {
          this.closeModal();
        }
      });
    },

    openModal(id) {
      const modal = document.getElementById(id);
      if (!modal) return;

      this.closeModal();

      modal.hidden = false;
      modal.classList.add("active");
      modal.setAttribute("aria-hidden", "false");

      this.state.activeModal = id;

      document.body.classList.add("modal-open");

      const focusable = modal.querySelector(
        'button, input, textarea, select, a[href]'
      );

      focusable?.focus();

      this.emit("lenscircle:modal-open", { id });
    },

    closeModal() {
      if (!this.state.activeModal) return;

      const modal = document.getElementById(
        this.state.activeModal
      );

      if (modal) {
        modal.classList.remove("active");
        modal.hidden = true;
        modal.setAttribute("aria-hidden", "true");
      }

      const previousModal = this.state.activeModal;

      this.state.activeModal = null;

      document.body.classList.remove("modal-open");

      this.emit("lenscircle:modal-close", {
        id: previousModal
      });
    },


    /* =================================================
       10. TOAST NOTIFICATIONS
    ================================================= */

    notify(message, type = "info", duration = 3500) {
      const validTypes = [
        "success",
        "error",
        "warning",
        "info"
      ];

      const safeType = validTypes.includes(type)
        ? type
        : "info";

      let container = this.$("#lc-toast-container");

      if (!container) {
        container = document.createElement("div");
        container.id = "lc-toast-container";
        container.className = "lc-toast-container";

        container.setAttribute("aria-live", "polite");
        container.setAttribute("aria-atomic", "true");

        document.body.appendChild(container);
      }

      const toast = document.createElement("div");

      toast.className = `lc-toast lc-toast-${safeType}`;

      const icon = {
        success: "✓",
        error: "!",
        warning: "⚠",
        info: "i"
      }[safeType];

      const iconElement = document.createElement("span");
      iconElement.className = "lc-toast-icon";
      iconElement.textContent = icon;

      const textElement = document.createElement("span");
      textElement.className = "lc-toast-message";
      textElement.textContent = String(message);

      const closeButton = document.createElement("button");
      closeButton.type = "button";
      closeButton.className = "lc-toast-close";
      closeButton.textContent = "×";
      closeButton.setAttribute("aria-label", "Dismiss notification");

      toast.append(iconElement, textElement, closeButton);
      container.appendChild(toast);

      const remove = () => {
        toast.classList.add("is-removing");

        window.setTimeout(() => {
          toast.remove();

          if (!container.children.length) {
            container.remove();
          }
        }, 250);
      };

      closeButton.addEventListener("click", remove);

      if (duration > 0) {
        window.setTimeout(remove, duration);
      }

      return toast;
    },


    /* =================================================
       11. ACCORDIONS
    ================================================= */

    initializeAccordions() {
      this.$$("[data-accordion]").forEach(accordion => {
        const trigger = accordion.querySelector(
          "[data-accordion-trigger]"
        );

        const content = accordion.querySelector(
          "[data-accordion-content]"
        );

        if (!trigger || !content) return;

        trigger.setAttribute("aria-expanded", "false");
        content.hidden = true;

        trigger.addEventListener("click", () => {
          const isOpen =
            trigger.getAttribute("aria-expanded") === "true";

          trigger.setAttribute(
            "aria-expanded",
            String(!isOpen)
          );

          content.hidden = isOpen;

          accordion.classList.toggle("is-open", !isOpen);
        });
      });
    },


    /* =================================================
       12. TABS
    ================================================= */

    initializeTabs() {
      this.$$("[data-tabs]").forEach(tabContainer => {
        const buttons = tabContainer.querySelectorAll(
          "[data-tab]"
        );

        const panels = tabContainer.querySelectorAll(
          "[data-tab-panel]"
        );

        buttons.forEach(button => {
          button.addEventListener("click", () => {
            const target = button.dataset.tab;

            buttons.forEach(item => {
              const active = item === button;

              item.classList.toggle("active", active);
              item.setAttribute(
                "aria-selected",
                String(active)
              );
            });

            panels.forEach(panel => {
              const active =
                panel.dataset.tabPanel === target;

              panel.hidden = !active;
              panel.classList.toggle("active", active);
            });

            this.emit("lenscircle:tab-change", {
              tab: target
            });
          });
        });
      });
    },


    /* =================================================
       13. SCROLL EFFECTS
    ================================================= */

    initializeScrollEffects() {
      const headers = this.$$(
        "[data-sticky-header], .site-header, header"
      );

      let ticking = false;

      const update = () => {
        const scrolled = window.scrollY >
          CONFIG.scroll.threshold;

        headers.forEach(header => {
          header.classList.toggle(
            CONFIG.scroll.headerClass,
            scrolled
          );
        });

        document.body.classList.toggle(
          "has-scrolled",
          scrolled
        );

        ticking = false;
      };

      window.addEventListener("scroll", () => {
        if (!ticking) {
          window.requestAnimationFrame(update);
          ticking = true;
        }
      }, { passive: true });

      update();
    },


    /* =================================================
       14. BACK TO TOP
    ================================================= */

    initializeBackToTop() {
      const buttons = this.findAll(
        CONFIG.selectors.backToTop
      );

      buttons.forEach(button => {
        button.addEventListener("click", () => {
          window.scrollTo({
            top: 0,
            behavior: "smooth"
          });
        });
      });

      const update = () => {
        buttons.forEach(button => {
          button.classList.toggle(
            "visible",
            window.scrollY > 400
          );
        });
      };

      window.addEventListener("scroll", update, {
        passive: true
      });

      update();
    },


    /* =================================================
       15. SMOOTH SCROLLING
    ================================================= */

    initializeSmoothScrolling() {
      document.addEventListener("click", event => {
        const link = event.target.closest(
          'a[href^="#"]'
        );

        if (!link) return;

        const href = link.getAttribute("href");

        if (!href || href === "#") return;

        const target = document.querySelector(href);

        if (!target) return;

        event.preventDefault();

        target.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });

        if (history.replaceState) {
          history.replaceState(null, "", href);
        }
      });
    },


    /* =================================================
       16. REVEAL ANIMATIONS
    ================================================= */

    initializeRevealAnimations() {
      const elements = this.$$(
        "[data-reveal], .reveal-on-scroll"
      );

      if (!elements.length) return;

      if (!("IntersectionObserver" in window)) {
        elements.forEach(element => {
          element.classList.add("is-visible");
        });

        return;
      }

      const observer = new IntersectionObserver(
        entries => {
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              entry.target.classList.add("is-visible");
              observer.unobserve(entry.target);
            }
          });
        },
        {
          threshold: CONFIG.animation.revealThreshold
        }
      );

      elements.forEach(element => {
        observer.observe(element);
      });
    },


    /* =================================================
       17. COPY TO CLIPBOARD
    ================================================= */

    initializeCopyButtons() {
      document.addEventListener("click", async event => {
        const button = event.target.closest(
          "[data-copy]"
        );

        if (!button) return;

        const value = button.dataset.copy;

        if (!value) return;

        try {
          await this.copyText(value);
          this.notify("Copied to clipboard.", "success");
        } catch (error) {
          this.notify("Unable to copy text.", "error");
        }
      });
    },

    async copyText(value) {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(String(value));
        return true;
      }

      const textarea = document.createElement("textarea");

      textarea.value = String(value);
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";

      document.body.appendChild(textarea);

      textarea.select();

      const successful = document.execCommand("copy");

      textarea.remove();

      if (!successful) {
        throw new Error("Copy failed.");
      }

      return true;
    },


    /* =================================================
       18. COUNTER ANIMATIONS
    ================================================= */

    initializeCounters() {
      const counters = this.$$("[data-counter]");

      if (!counters.length) return;

      const animateCounter = element => {
        const target = Number(element.dataset.counter);

        if (!Number.isFinite(target)) return;

        const duration = 1200;
        const start = performance.now();

        const update = now => {
          const progress = Math.min(
            (now - start) / duration,
            1
          );

          const eased = 1 - Math.pow(1 - progress, 3);
          const value = Math.round(target * eased);

          element.textContent =
            value.toLocaleString("en-IN");

          if (progress < 1) {
            requestAnimationFrame(update);
          }
        };

        requestAnimationFrame(update);
      };

      if (!("IntersectionObserver" in window)) {
        counters.forEach(animateCounter);
        return;
      }

      const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            animateCounter(entry.target);
            observer.unobserve(entry.target);
          }
        });
      });

      counters.forEach(counter => {
        observer.observe(counter);
      });
    },


    /* =================================================
       19. CURRENT YEAR
    ================================================= */

    initializeCurrentYear() {
      this.$$("[data-current-year], .current-year").forEach(
        element => {
          element.textContent = new Date().getFullYear();
        }
      );
    },


    /* =================================================
       20. GLOBAL EVENTS
    ================================================= */

    initializeGlobalEvents() {
      document.addEventListener("click", event => {
        const externalLink = event.target.closest(
          'a[target="_blank"]'
        );

        if (externalLink) {
          externalLink.setAttribute(
            "rel",
            "noopener noreferrer"
          );
        }
      });

      window.addEventListener("online", () => {
        this.notify("Your internet connection is restored.", "success");
      });

      window.addEventListener("offline", () => {
        this.notify("You are currently offline.", "warning", 5000);
      });
    },


    /* =================================================
       21. PUBLIC UTILITIES
    ================================================= */

    getTheme() {
      return this.state.theme;
    },

    isMobile() {
      return window.matchMedia("(max-width: 900px)").matches;
    },

    isOnline() {
      return navigator.onLine;
    },

    formatDate(date, options = {}) {
      const parsed = new Date(date);

      if (Number.isNaN(parsed.getTime())) return "";

      return new Intl.DateTimeFormat(
        "en-IN",
        {
          day: "numeric",
          month: "short",
          year: "numeric",
          ...options
        }
      ).format(parsed);
    },

    formatNumber(number) {
      return Number(number || 0).toLocaleString("en-IN");
    },

    debounce(callback, delay = 300) {
      let timeout;

      return (...args) => {
        window.clearTimeout(timeout);

        timeout = window.setTimeout(() => {
          callback(...args);
        }, delay);
      };
    },

    throttle(callback, delay = 200) {
      let lastCall = 0;

      return (...args) => {
        const now = Date.now();

        if (now - lastCall >= delay) {
          lastCall = now;
          callback(...args);
        }
      };
    }

  };


  /* =====================================================
     22. GLOBAL EXPORT
  ===================================================== */

  window.LensCircle = LensCircle;

  // Compatibility helper for existing modules.
  window.showToast = function (
    message,
    type = "info",
    duration = 3500
  ) {
    return LensCircle.notify(message, type, duration);
  };


  /* =====================================================
     23. START APPLICATION
  ===================================================== */

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      () => LensCircle.init(),
      { once: true }
    );
  } else {
    LensCircle.init();
  }

})();
