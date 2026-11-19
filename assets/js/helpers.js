
/* =====================================================
   LENS CIRCLE
   Shared Application Helpers
   File: assets/js/helpers.js
   ===================================================== */

(function () {
  "use strict";

  const Helpers = window.LensCircleHelpers = {};

  // ----------------------------------------------------
  // 1. DATE AND TIME UTILITIES
  // ----------------------------------------------------

  Helpers.now = function () {
    return new Date();
  };

  Helpers.formatDate = function (
    value,
    options
  ) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "—";
    }

    return new Intl.DateTimeFormat(
      "en-IN",
      options || {
        day: "2-digit",
        month: "short",
        year: "numeric"
      }
    ).format(date);
  };

  Helpers.formatDateTime = function (value) {
    return Helpers.formatDate(value, {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  Helpers.timeAgo = function (value) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "Unknown time";
    }

    const seconds = Math.floor(
      (Date.now() - date.getTime()) / 1000
    );

    if (seconds < 0) {
      return "In the future";
    }

    const units = [
      ["year", 31536000],
      ["month", 2592000],
      ["week", 604800],
      ["day", 86400],
      ["hour", 3600],
      ["minute", 60]
    ];

    for (const [unit, size] of units) {
      const count = Math.floor(seconds / size);

      if (count >= 1) {
        return count + " " + unit +
          (count === 1 ? "" : "s") + " ago";
      }
    }

    return "Just now";
  };

  Helpers.isToday = function (value) {
    const date = new Date(value);
    const today = new Date();

    return (
      date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth() &&
      date.getDate() === today.getDate()
    );
  };

  Helpers.isPast = function (value) {
    const date = new Date(value);

    return (
      !Number.isNaN(date.getTime()) &&
      date.getTime() < Date.now()
    );
  };

  Helpers.isFuture = function (value) {
    const date = new Date(value);

    return (
      !Number.isNaN(date.getTime()) &&
      date.getTime() > Date.now()
    );
  };

  // ----------------------------------------------------
  // 2. CURRENCY AND NUMBER FORMATTING
  // ----------------------------------------------------

  Helpers.formatNumber = function (value) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      return "—";
    }

    return new Intl.NumberFormat("en-IN").format(number);
  };

  Helpers.formatCurrency = function (
    value,
    currency
  ) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      return "—";
    }

    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: currency || "INR",
      maximumFractionDigits: 2
    }).format(number);
  };

  Helpers.formatPercentage = function (value) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      return "—";
    }

    return new Intl.NumberFormat("en-IN", {
      style: "percent",
      maximumFractionDigits: 1
    }).format(number);
  };

  Helpers.formatFileSize = function (bytes) {
    const size = Number(bytes);

    if (!Number.isFinite(size) || size < 0) {
      return "—";
    }

    if (size < 1024) {
      return size + " B";
    }

    if (size < 1024 * 1024) {
      return (size / 1024).toFixed(1) + " KB";
    }

    if (size < 1024 * 1024 * 1024) {
      return (
        size / (1024 * 1024)
      ).toFixed(1) + " MB";
    }

    return (
      size / (1024 * 1024 * 1024)
    ).toFixed(1) + " GB";
  };

  // ----------------------------------------------------
  // 3. STRING UTILITIES
  // ----------------------------------------------------

  Helpers.capitalize = function (value) {
    if (!value) return "";

    const text = String(value);

    return (
      text.charAt(0).toUpperCase() +
      text.slice(1)
    );
  };

  Helpers.titleCase = function (value) {
    if (!value) return "";

    return String(value)
      .trim()
      .split(/\s+/)
      .map(function (word) {
        return Helpers.capitalize(
          word.toLowerCase()
        );
      })
      .join(" ");
  };

  Helpers.truncate = function (
    value,
    limit
  ) {
    const text = String(value || "");
    const maximum = Number(limit) || 100;

    if (text.length <= maximum) {
      return text;
    }

    return text.slice(0, maximum).trimEnd() + "…";
  };

  Helpers.slugify = function (value) {
    return String(value || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  };

  Helpers.initials = function (name) {
    if (!name) return "LC";

    return String(name)
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map(function (part) {
        return part.charAt(0).toUpperCase();
      })
      .join("");
  };

  // ----------------------------------------------------
  // 4. SEARCH UTILITIES
  // ----------------------------------------------------

  Helpers.search = function (
    items,
    query,
    fields
  ) {
    if (!Array.isArray(items)) {
      return [];
    }

    const term = String(query || "")
      .trim()
      .toLowerCase();

    if (!term) {
      return items.slice();
    }

    return items.filter(function (item) {
      const values = fields && fields.length
        ? fields.map(function (field) {
            return item[field];
          })
        : Object.values(item);

      return values.some(function (value) {
        return String(value || "")
          .toLowerCase()
          .includes(term);
      });
    });
  };

  // ----------------------------------------------------
  // 5. SORTING UTILITIES
  // ----------------------------------------------------

  Helpers.sort = function (
    items,
    field,
    direction
  ) {
    if (!Array.isArray(items)) {
      return [];
    }

    const result = items.slice();

    const multiplier =
      direction === "desc" ? -1 : 1;

    result.sort(function (a, b) {
      const first = a[field];
      const second = b[field];

      if (first == null && second == null) return 0;
      if (first == null) return 1;
      if (second == null) return -1;

      if (
        typeof first === "number" &&
        typeof second === "number"
      ) {
        return (first - second) * multiplier;
      }

      return String(first).localeCompare(
        String(second),
        undefined,
        {
          numeric: true,
          sensitivity: "base"
        }
      ) * multiplier;
    });

    return result;
  };

  // ----------------------------------------------------
  // 6. PAGINATION
  // ----------------------------------------------------

  Helpers.paginate = function (
    items,
    page,
    pageSize
  ) {
    if (!Array.isArray(items)) {
      return {
        items: [],
        page: 1,
        pageSize: 0,
        totalItems: 0,
        totalPages: 0,
        hasNext: false,
        hasPrevious: false
      };
    }

    const size = Math.max(
      1,
      Number(pageSize) || 10
    );

    const totalItems = items.length;

    const totalPages = Math.ceil(
      totalItems / size
    );

    const currentPage = Math.min(
      Math.max(1, Number(page) || 1),
      Math.max(1, totalPages)
    );

    const start = (currentPage - 1) * size;

    return {
      items: items.slice(start, start + size),
      page: currentPage,
      pageSize: size,
      totalItems: totalItems,
      totalPages: totalPages,
      hasNext: currentPage < totalPages,
      hasPrevious: currentPage > 1
    };
  };

  // ----------------------------------------------------
  // 7. SAFE HTML TEXT
  // ----------------------------------------------------

  Helpers.escapeHTML = function (value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  };

  // ----------------------------------------------------
  // 8. FORM UTILITIES
  // ----------------------------------------------------

  Helpers.getFormData = function (form) {
    if (typeof form === "string") {
      form = document.querySelector(form);
    }

    if (!form) {
      throw new Error("Form not found.");
    }

    const data = new FormData(form);
    const result = {};

    for (const [key, value] of data.entries()) {
      if (Object.prototype.hasOwnProperty.call(result, key)) {
        if (!Array.isArray(result[key])) {
          result[key] = [result[key]];
        }

        result[key].push(value);
      } else {
        result[key] = value;
      }
    }

    return result;
  };

  Helpers.resetForm = function (form) {
    if (typeof form === "string") {
      form = document.querySelector(form);
    }

    if (form) {
      form.reset();
    }
  };

  Helpers.setButtonLoading = function (
    button,
    loading,
    loadingText
  ) {
    if (typeof button === "string") {
      button = document.querySelector(button);
    }

    if (!button) return;

    if (loading) {
      button.dataset.originalText =
        button.textContent;

      button.disabled = true;

      button.textContent =
        loadingText || "Please wait…";

    } else {
      button.disabled = false;

      button.textContent =
        button.dataset.originalText ||
        button.textContent;

      delete button.dataset.originalText;
    }
  };

  // ----------------------------------------------------
  // 9. DOM UTILITIES
  // ----------------------------------------------------

  Helpers.element = function (
    tag,
    attributes,
    text
  ) {
    const element = document.createElement(tag);

    if (attributes) {
      Object.entries(attributes).forEach(
        function (entry) {
          const key = entry[0];
          const value = entry[1];

          if (key === "className") {
            element.className = value;
          } else if (key === "dataset") {
            Object.assign(element.dataset, value);
          } else if (key === "textContent") {
            element.textContent = value;
          } else {
            element.setAttribute(key, value);
          }
        }
      );
    }

    if (text !== undefined) {
      element.textContent = text;
    }

    return element;
  };

  Helpers.show = function (element) {
    if (typeof element === "string") {
      element = document.querySelector(element);
    }

    if (element) {
      element.hidden = false;
    }
  };

  Helpers.hide = function (element) {
    if (typeof element === "string") {
      element = document.querySelector(element);
    }

    if (element) {
      element.hidden = true;
    }
  };

  // ----------------------------------------------------
  // 10. LOADING STATES
  // ----------------------------------------------------

  Helpers.showLoading = function (
    container,
    message
  ) {
    if (typeof container === "string") {
      container = document.querySelector(container);
    }

    if (!container) return;

    const loader = document.createElement("div");

    loader.className = "lc-loading-state";
    loader.setAttribute("role", "status");

    const spinner = document.createElement("span");
    spinner.className = "lc-spinner";
    spinner.setAttribute("aria-hidden", "true");

    const text = document.createElement("span");
    text.textContent = message || "Loading…";

    loader.appendChild(spinner);
    loader.appendChild(text);

    container.replaceChildren(loader);
  };

  Helpers.showError = function (
    container,
    message
  ) {
    if (typeof container === "string") {
      container = document.querySelector(container);
    }

    if (!container) return;

    const error = document.createElement("div");

    error.className = "lc-error-state";
    error.setAttribute("role", "alert");
    error.textContent =
      message || "Something went wrong.";

    container.replaceChildren(error);
  };

  Helpers.showEmpty = function (
    container,
    message
  ) {
    if (typeof container === "string") {
      container = document.querySelector(container);
    }

    if (!container) return;

    const empty = document.createElement("div");

    empty.className = "lc-empty-state";
    empty.textContent =
      message || "No records found.";

    container.replaceChildren(empty);
  };

  // ----------------------------------------------------
  // 11. RANDOM IDENTIFIERS
  // ----------------------------------------------------

  Helpers.createId = function () {
    if (
      window.crypto &&
      typeof window.crypto.randomUUID === "function"
    ) {
      return window.crypto.randomUUID();
    }

    throw new Error(
      "Secure random identifier generation is unavailable."
    );
  };

  // ----------------------------------------------------
  // 12. IST DATE UTILITIES
  // ----------------------------------------------------

  Helpers.formatIST = function (value) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "—";
    }

    return new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true
    }).format(date);
  };

  Helpers.getISTDateParts = function (value) {
    const date = value ? new Date(value) : new Date();

    if (Number.isNaN(date.getTime())) {
      throw new Error("Invalid date.");
    }

    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(date);

    const result = {};

    parts.forEach(function (part) {
      if (part.type !== "literal") {
        result[part.type] = part.value;
      }
    });

    return result;
  };

  // ----------------------------------------------------
  // 13. DEBOUNCE
  // ----------------------------------------------------

  Helpers.debounce = function (
    callback,
    delay
  ) {
    let timeout;

    return function () {
      const context = this;
      const args = arguments;

      window.clearTimeout(timeout);

      timeout = window.setTimeout(function () {
        callback.apply(context, args);
      }, delay || 300);
    };
  };

  // ----------------------------------------------------
  // 14. URL UTILITIES
  // ----------------------------------------------------

  Helpers.getQueryParameter = function (name) {
    return new URLSearchParams(
      window.location.search
    ).get(name);
  };

  Helpers.isInternalUrl = function (value) {
    try {
      const url = new URL(
        value,
        window.location.origin
      );

      return url.origin === window.location.origin;

    } catch (error) {
      return false;
    }
  };

  // ----------------------------------------------------
  // 15. EXPORT
  // ----------------------------------------------------

  console.info(
    "Lens Circle: Shared helpers loaded."
  );

})();
