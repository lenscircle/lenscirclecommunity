
/* =========================================================
   LENS CIRCLE — FORMS MODULE
   File: assets/js/forms.js

   FEATURES
   - Required-field validation.
   - Email and URL validation.
   - Password validation.
   - Minimum and maximum length.
   - File validation.
   - Character counters.
   - Inline error messages.
   - Success and error notifications.
   - Loading and disabled button states.
   - Async form submission.
   - Double-submission prevention.
   - Accessible validation messages.
   - Confirmation before destructive actions.

   SECURITY
   - Client-side validation is for usability only.
   - Repeat all validation in PostgreSQL/RPCs.
   - Never trust browser-provided role or user IDs.
   - Never place service-role keys in frontend code.
   ========================================================= */

(function (window, document) {
  "use strict";

  const LC = window.LensCircle = window.LensCircle || {};
  const Forms = {};

  const state = {
    submitting: new WeakSet(),
    messages: new WeakMap()
  };

  const DEFAULT_MESSAGES = {
    required: "This field is required.",
    email: "Enter a valid email address.",
    url: "Enter a valid website URL.",
    minlength: "This field is too short.",
    maxlength: "This field is too long.",
    password: "Password does not meet the requirements.",
    match: "The values do not match.",
    file: "Choose a valid file.",
    generic: "Please check this field."
  };

  /* ---------------------------------------------------------
     HELPERS
  --------------------------------------------------------- */

  function cleanText(value, maxLength) {
    return String(value == null ? "" : value)
      .trim()
      .slice(0, maxLength || 5000);
  }

  function escapeHTML(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function getElement(target) {
    if (typeof target === "string") {
      return document.querySelector(target);
    }

    return target || null;
  }

  function getFieldValue(field) {
    if (!field) return "";

    if (field.type === "checkbox") {
      return field.checked ? "true" : "";
    }

    if (field.type === "file") {
      return field.files && field.files.length
        ? field.files[0]
        : null;
    }

    return String(field.value || "").trim();
  }

  function getMessageElement(field) {
    if (!field || !field.parentElement) return null;

    const parent = field.parentElement;

    let message = parent.querySelector(
      ".form-field-error"
    );

    if (!message) {
      message = document.createElement("span");
      message.className = "form-field-error";
      message.setAttribute("role", "alert");
      parent.appendChild(message);
    }

    return message;
  }

  function clearFieldError(field) {
    if (!field) return;

    field.classList.remove("is-invalid");
    field.removeAttribute("aria-invalid");

    const message = field.parentElement
      ? field.parentElement.querySelector(".form-field-error")
      : null;

    if (message) {
      message.textContent = "";
      message.hidden = true;
    }
  }

  function setFieldError(field, message) {
    if (!field) return false;

    field.classList.add("is-invalid");
    field.setAttribute("aria-invalid", "true");

    const element = getMessageElement(field);

    if (element) {
      element.textContent = message;
      element.hidden = false;
    }

    return false;
  }

  function clearFormErrors(form) {
    if (!form) return;

    form.querySelectorAll(
      "input, textarea, select"
    ).forEach(clearFieldError);

    const summary = form.querySelector(
      "[data-form-error]"
    );

    if (summary) {
      summary.textContent = "";
      summary.hidden = true;
    }
  }

  /* ---------------------------------------------------------
     VALIDATORS
  --------------------------------------------------------- */

  Forms.validators = {};

  Forms.validators.required = function (value) {
    if (value instanceof File) return true;

    return String(value == null ? "" : value).trim().length > 0;
  };

  Forms.validators.email = function (value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      String(value || "").trim()
    );
  };

  Forms.validators.url = function (value) {
    try {
      const url = new URL(
        String(value).startsWith("http")
          ? value
          : "https://" + value
      );

      return (
        url.protocol === "https:" ||
        url.protocol === "http:"
      );
    } catch (_) {
      return false;
    }
  };

  Forms.validators.minlength = function (value, length) {
    return String(value || "").length >= Number(length);
  };

  Forms.validators.maxlength = function (value, length) {
    return String(value || "").length <= Number(length);
  };

  Forms.validators.password = function (value) {
    const password = String(value || "");

    return (
      password.length >= 10 &&
      /[a-z]/.test(password) &&
      /[A-Z]/.test(password) &&
      /[0-9]/.test(password)
    );
  };

  Forms.validators.match = function (value, otherValue) {
    return String(value || "") === String(otherValue || "");
  };

  Forms.validators.file = function (file, options) {
    if (!(file instanceof File)) return false;

    const settings = options || {};

    const allowedTypes = settings.types || [
      "image/jpeg",
      "image/png",
      "image/webp"
    ];

    const maxSize = Number(settings.maxSize) ||
      12 * 1024 * 1024;

    return (
      allowedTypes.includes(file.type) &&
      file.size <= maxSize
    );
  };

  /* ---------------------------------------------------------
     SINGLE FIELD VALIDATION
  --------------------------------------------------------- */

  Forms.validateField = function (field) {
    if (!field) return true;

    clearFieldError(field);

    const value = getFieldValue(field);
    const name = field.name || field.id || "Field";

    const required = field.required ||
      field.dataset.required === "true";

    if (
      required &&
      !Forms.validators.required(value)
    ) {
      return setFieldError(
        field,
        field.dataset.requiredMessage ||
        DEFAULT_MESSAGES.required
      );
    }

    if (!value) return true;

    if (
      field.type === "email" &&
      !Forms.validators.email(value)
    ) {
      return setFieldError(field, DEFAULT_MESSAGES.email);
    }

    if (
      field.type === "url" &&
      !Forms.validators.url(value)
    ) {
      return setFieldError(field, DEFAULT_MESSAGES.url);
    }

    if (
      field.minLength > 0 &&
      !Forms.validators.minlength(value, field.minLength)
    ) {
      return setFieldError(field, DEFAULT_MESSAGES.minlength);
    }

    if (
      field.maxLength > 0 &&
      !Forms.validators.maxlength(value, field.maxLength)
    ) {
      return setFieldError(field, DEFAULT_MESSAGES.maxlength);
    }

    if (field.dataset.match) {
      const other = document.querySelector(
        field.dataset.match
      );

      if (
        other &&
        !Forms.validators.match(value, other.value)
      ) {
        return setFieldError(field, DEFAULT_MESSAGES.match);
      }
    }

    if (field.dataset.password === "true") {
      if (!Forms.validators.password(value)) {
        return setFieldError(
          field,
          field.dataset.passwordMessage ||
          DEFAULT_MESSAGES.password
        );
      }
    }

    if (field.type === "file" && field.dataset.fileTypes) {
      const file = field.files && field.files[0];

      const types = field.dataset.fileTypes
        .split(",")
        .map(type => type.trim());

      const maxSize = Number(field.dataset.maxSize) ||
        12 * 1024 * 1024;

      if (
        file &&
        !Forms.validators.file(file, {
          types,
          maxSize
        })
      ) {
        return setFieldError(
          field,
          field.dataset.fileMessage ||
          DEFAULT_MESSAGES.file
        );
      }
    }

    return true;
  };

  /* ---------------------------------------------------------
     FORM VALIDATION
  --------------------------------------------------------- */

  Forms.validate = function (form) {
    const target = getElement(form);

    if (!target || !target.elements) {
      throw new Error("Form element not found.");
    }

    clearFormErrors(target);

    let valid = true;
    let firstInvalid = null;

    Array.from(target.elements).forEach(function (field) {
      if (
        !field.name ||
        field.disabled ||
        field.type === "submit" ||
        field.type === "button"
      ) {
        return;
      }

      const result = Forms.validateField(field);

      if (!result) {
        valid = false;

        if (!firstInvalid) {
          firstInvalid = field;
        }
      }
    });

    if (!valid && firstInvalid) {
      firstInvalid.focus();
    }

    return valid;
  };

  /* ---------------------------------------------------------
     FORM DATA
  --------------------------------------------------------- */

  Forms.getValues = function (form) {
    const target = getElement(form);

    if (!target || !target.elements) {
      throw new Error("Form element not found.");
    }

    const values = {};

    Array.from(target.elements).forEach(function (field) {
      if (!field.name || field.disabled) return;

      if (field.type === "checkbox") {
        if (field.name.endsWith("[]")) {
          const key = field.name.slice(0, -2);

          if (!Array.isArray(values[key])) {
            values[key] = [];
          }

          if (field.checked) {
            values[key].push(field.value);
          }
        } else {
          values[field.name] = field.checked;
        }

        return;
      }

      if (field.type === "radio") {
        if (field.checked) {
          values[field.name] = field.value;
        }

        return;
      }

      if (field.type === "file") {
        values[field.name] = field.files
          ? field.files[0] || null
          : null;

        return;
      }

      values[field.name] = field.value.trim();
    });

    return values;
  };

  /* ---------------------------------------------------------
     BUTTON LOADING STATE
  --------------------------------------------------------- */

  Forms.setLoading = function (button, loading, text) {
    const target = getElement(button);

    if (!target) return;

    if (loading) {
      if (!target.dataset.originalText) {
        target.dataset.originalText =
          target.textContent.trim();
      }

      target.disabled = true;
      target.setAttribute("aria-busy", "true");

      target.textContent = text || "Please wait...";
      target.classList.add("is-loading");
    } else {
      target.disabled = false;
      target.removeAttribute("aria-busy");

      target.textContent =
        target.dataset.originalText || "Submit";

      target.classList.remove("is-loading");
    }
  };

  /* ---------------------------------------------------------
     FORM FEEDBACK
  --------------------------------------------------------- */

  Forms.showMessage = function (
    form,
    message,
    type
  ) {
    const target = getElement(form);

    if (!target) return;

    const summary = target.querySelector(
      "[data-form-error], [data-form-success]"
    );

    if (summary) {
      summary.textContent = message;
      summary.hidden = false;

      summary.classList.remove(
        "form-message-success",
        "form-message-error"
      );

      summary.classList.add(
        type === "success"
          ? "form-message-success"
          : "form-message-error"
      );

      summary.setAttribute(
        "role",
        type === "success" ? "status" : "alert"
      );

      return;
    }

    Forms.notify(message, type);
  };

  Forms.notify = function (message, type) {
    if (
      LC.main &&
      typeof LC.main.notify === "function"
    ) {
      LC.main.notify(message, type || "info");
      return;
    }

    const notification = document.createElement("div");

    notification.className =
      "lc-form-notification lc-form-notification-" +
      (type || "info");

    notification.setAttribute("role", "status");
    notification.textContent = message;

    document.body.appendChild(notification);

    window.setTimeout(function () {
      notification.remove();
    }, 4000);
  };

  /* ---------------------------------------------------------
     ASYNC FORM SUBMISSION
  --------------------------------------------------------- */

  /**
   * Usage:
   *
   * Forms.submit(form, async function(values, form) {
   *   return await LensCircle.someModule.someAction(values);
   * });
   */
  Forms.submit = async function (form, handler, options) {
    const target = getElement(form);
    const settings = options || {};

    if (!target || !target.elements) {
      throw new Error("Form element not found.");
    }

    if (typeof handler !== "function") {
      throw new Error("A submission handler is required.");
    }

    if (state.submitting.has(target)) {
      return false;
    }

    if (!Forms.validate(target)) {
      return false;
    }

    const submitButton =
      target.querySelector('[type="submit"]');

    state.submitting.add(target);

    if (submitButton) {
      Forms.setLoading(
        submitButton,
        true,
        settings.loadingText || "Submitting..."
      );
    }

    if (settings.clearMessages !== false) {
      clearFormErrors(target);
    }

    try {
      const values = Forms.getValues(target);

      const result = await handler(values, target);

      if (settings.resetOnSuccess === true) {
        target.reset();
      }

      if (settings.successMessage) {
        Forms.showMessage(
          target,
          settings.successMessage,
          "success"
        );
      }

      if (typeof settings.onSuccess === "function") {
        settings.onSuccess(result, values);
      }

      return result;
    } catch (error) {
      console.error("[Lens Circle Forms]", error);

      const message = cleanText(
        error && error.message
          ? error.message
          : "Something went wrong. Please try again.",
        500
      );

      Forms.showMessage(target, message, "error");

      if (typeof settings.onError === "function") {
        settings.onError(error);
      }

      throw error;
    } finally {
      state.submitting.delete(target);

      if (submitButton) {
        Forms.setLoading(submitButton, false);
      }
    }
  };

  /* ---------------------------------------------------------
     CHARACTER COUNTERS
  --------------------------------------------------------- */

  Forms.updateCharacterCount = function (field) {
    const target = getElement(field);

    if (!target) return;

    const counter = document.querySelector(
      '[data-character-count-for="' +
      target.id +
      '"]'
    );

    if (!counter) return;

    const current = target.value.length;
    const max = target.maxLength > 0
      ? target.maxLength
      : null;

    counter.textContent = max
      ? current + " / " + max
      : current + " characters";

    counter.classList.toggle(
      "is-limit-reached",
      max !== null && current >= max
    );
  };

  Forms.initCharacterCounters = function () {
    document.querySelectorAll(
      "[data-character-count]"
    ).forEach(function (field) {
      Forms.updateCharacterCount(field);

      field.addEventListener("input", function () {
        Forms.updateCharacterCount(field);
      });
    });
  };

  /* ---------------------------------------------------------
     LIVE VALIDATION
  --------------------------------------------------------- */

  Forms.initLiveValidation = function () {
    document.addEventListener("blur", function (event) {
      const field = event.target;

      if (
        field.matches &&
        field.matches(
          "input, textarea, select"
        ) &&
        field.closest("[data-validate-form]")
      ) {
        Forms.validateField(field);
      }
    }, true);

    document.addEventListener("input", function (event) {
      const field = event.target;

      if (
        field.matches &&
        field.matches(
          "input, textarea, select"
        ) &&
        field.classList.contains("is-invalid")
      ) {
        Forms.validateField(field);
      }
    });
  };

  /* ---------------------------------------------------------
     FILE INPUT VALIDATION
  --------------------------------------------------------- */

  Forms.validateFile = function (
    file,
    options
  ) {
    const settings = options || {};

    if (!(file instanceof File)) {
      throw new Error("Choose a file.");
    }

    const maxSize = Number(settings.maxSize) ||
      12 * 1024 * 1024;

    const allowedTypes = settings.types || [
      "image/jpeg",
      "image/png",
      "image/webp"
    ];

    if (!allowedTypes.includes(file.type)) {
      throw new Error("This file type is not supported.");
    }

    if (file.size > maxSize) {
      throw new Error("The selected file is too large.");
    }

    return true;
  };

  /* ---------------------------------------------------------
     DESTRUCTIVE ACTION CONFIRMATION
  --------------------------------------------------------- */

  Forms.confirm = function (message) {
    return window.confirm(
      cleanText(message, 500) ||
      "Are you sure you want to continue?"
    );
  };

  /* ---------------------------------------------------------
     AUTO FORM INITIALISATION
  --------------------------------------------------------- */

  Forms.init = function () {
    Forms.initCharacterCounters();
    Forms.initLiveValidation();

    document.querySelectorAll(
      "[data-validate-form]"
    ).forEach(function (form) {
      form.addEventListener("submit", function (event) {
        if (!Forms.validate(form)) {
          event.preventDefault();
        }
      });
    });

    return true;
  };

  /* ---------------------------------------------------------
     EXPORT
  --------------------------------------------------------- */

  LC.forms = Forms;
  window.LensCircleForms = Forms;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", Forms.init);
  } else {
    Forms.init();
  }

})(window, document);
