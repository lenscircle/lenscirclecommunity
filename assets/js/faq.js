
/* =========================================================
   LENS CIRCLE — FAQ MODULE
   File: assets/js/faq.js

   FEATURES
   - Searchable frequently asked questions
   - FAQ categories
   - Expandable answers
   - Popular questions
   - Related questions
   - Contact support links
   - Dynamic FAQ management

   EXPECTED SUPABASE RPC CONTRACTS
   - get_public_lens_circle_faqs
   - get_lens_circle_faq_details
   - search_lens_circle_faqs
   - get_popular_lens_circle_faqs
   - create_lens_circle_faq
   - update_lens_circle_faq
   - delete_lens_circle_faq
   - publish_lens_circle_faq

   SECURITY
   - Public users can read published FAQs only.
   - Only authorised staff can manage FAQs.
   - Admin actions must be audited.
   ========================================================= */

(function (window, document) {
  "use strict";

  const LC = window.LensCircle =
    window.LensCircle || {};

  const FAQ = {};

  const CONFIG = {
    pageSize: 30,
    searchDelay: 300,

    categories: [
      "getting_started",
      "membership",
      "submissions",
      "photo_of_the_day",
      "challenges",
      "competitions",
      "community",
      "account",
      "privacy",
      "technical",
      "other"
    ]
  };

  const state = {
    faqs: [],
    popular: [],
    selected: null,
    search: "",
    category: "all",
    openId: null,
    loading: false
  };

  let searchTimer = null;

  /* ---------------------------------------------------------
     HELPERS
  --------------------------------------------------------- */

  function db() {
    if (LC.db) return LC.db;

    if (LC.supabase) return LC.supabase;

    throw new Error("Supabase client is unavailable.");
  }

  function clean(value, maxLength) {
    return String(value == null ? "" : value)
      .trim()
      .slice(0, maxLength || 500);
  }

  function list(value) {
    return Array.isArray(value) ? value : [];
  }

  function element(tag, className, content) {
    const node = document.createElement(tag);

    if (className) node.className = className;

    if (content !== undefined) {
      node.textContent = clean(content, 5000);
    }

    return node;
  }

  function notify(message, type) {
    if (
      LC.forms &&
      typeof LC.forms.notify === "function"
    ) {
      LC.forms.notify(message, type || "info");
    } else {
      console.info("[Lens Circle FAQ]", message);
    }
  }

  function validCategory(category) {
    return CONFIG.categories.includes(
      clean(category, 50).toLowerCase()
    );
  }

  /* ---------------------------------------------------------
     RPC
  --------------------------------------------------------- */

  FAQ.rpc = async function (name, params) {
    const { data, error } = await db().rpc(
      name,
      params || {}
    );

    if (error) {
      console.error("[FAQ RPC]", name, error);
      throw error;
    }

    return data;
  };

  /* ---------------------------------------------------------
     LOAD FAQS
  --------------------------------------------------------- */

  FAQ.load = async function (options) {
    if (state.loading) return state.faqs;

    const settings = options || {};

    state.loading = true;

    try {
      const data = await FAQ.rpc(
        "get_public_lens_circle_faqs",
        {
          p_category:
            state.category === "all"
              ? null
              : state.category,
          p_search: state.search || null,
          p_limit: CONFIG.pageSize
        }
      );

      state.faqs = list(data);

      FAQ.render(state.faqs);

      return state.faqs;

    } finally {
      state.loading = false;
    }
  };

  /* ---------------------------------------------------------
     SEARCH
  --------------------------------------------------------- */

  FAQ.search = function (query) {
    state.search = clean(query, 150);

    window.clearTimeout(searchTimer);

    return new Promise(function (resolve, reject) {
      searchTimer = window.setTimeout(function () {
        FAQ.load()
          .then(resolve)
          .catch(reject);
      }, CONFIG.searchDelay);
    });
  };

  /* ---------------------------------------------------------
     CATEGORY FILTER
  --------------------------------------------------------- */

  FAQ.setCategory = function (category) {
    const value = clean(
      category,
      50
    ).toLowerCase();

    if (
      value !== "all" &&
      !validCategory(value)
    ) {
      throw new Error("Invalid FAQ category.");
    }

    state.category = value;

    return FAQ.load();
  };

  /* ---------------------------------------------------------
     RENDER FAQ LIST
  --------------------------------------------------------- */

  FAQ.render = function (records) {
    const container = document.querySelector(
      "[data-faq-list]"
    );

    if (!container) return;

    container.replaceChildren();

    if (!records.length) {
      container.appendChild(
        element(
          "p",
          "faq-empty",
          "No matching questions found. Try another search."
        )
      );

      return;
    }

    records.forEach(function (faq, index) {
      const id = clean(
        faq.id || String(index),
        100
      );

      const article = element(
        "article",
        "faq-item"
      );

      const button = element(
        "button",
        "faq-question",
        faq.question
      );

      button.type = "button";
      button.setAttribute("aria-expanded", "false");
      button.setAttribute("aria-controls", "faq-answer-" + id);

      const answer = element(
        "div",
        "faq-answer"
      );

      answer.id = "faq-answer-" + id;
      answer.hidden = true;

      answer.appendChild(
        element(
          "p",
          "faq-answer-text",
          faq.answer
        )
      );

      button.addEventListener("click", function () {
        const shouldOpen =
          state.openId !== id;

        state.openId = shouldOpen ? id : null;

        container
          .querySelectorAll(".faq-item")
          .forEach(function (item) {
            const itemButton = item.querySelector(
              ".faq-question"
            );

            const itemAnswer = item.querySelector(
              ".faq-answer"
            );

            const expanded =
              itemButton === button && shouldOpen;

            itemButton.setAttribute(
              "aria-expanded",
              String(expanded)
            );

            itemAnswer.hidden = !expanded;

            item.classList.toggle(
              "is-open",
              expanded
            );
          });
      });

      article.append(button, answer);

      container.appendChild(article);
    });
  };

  /* ---------------------------------------------------------
     FAQ DETAILS
  --------------------------------------------------------- */

  FAQ.getDetails = async function (faqId) {
    const id = clean(faqId, 100);

    if (!id) {
      throw new Error("FAQ ID is required.");
    }

    const data = await FAQ.rpc(
      "get_lens_circle_faq_details",
      {
        p_faq_id: id
      }
    );

    state.selected = Array.isArray(data)
      ? data[0] || null
      : data;

    return state.selected;
  };

  /* ---------------------------------------------------------
     POPULAR QUESTIONS
  --------------------------------------------------------- */

  FAQ.getPopular = async function () {
    const data = await FAQ.rpc(
      "get_popular_lens_circle_faqs"
    );

    state.popular = list(data);

    FAQ.renderPopular(state.popular);

    return state.popular;
  };

  FAQ.renderPopular = function (records) {
    const container = document.querySelector(
      "[data-popular-faqs]"
    );

    if (!container) return;

    container.replaceChildren();

    if (!records.length) {
      container.appendChild(
        element(
          "p",
          "faq-empty",
          "Popular questions will appear here."
        )
      );

      return;
    }

    records.forEach(function (faq) {
      const button = element(
        "button",
        "popular-faq-button",
        faq.question
      );

      button.type = "button";

      button.addEventListener("click", function () {
        FAQ.getDetails(faq.id)
          .then(function (record) {
            if (!record) return;

            const container = document.querySelector(
              "[data-faq-detail]"
            );

            if (!container) return;

            container.replaceChildren(
              element(
                "h2",
                "faq-detail-question",
                record.question
              ),
              element(
                "p",
                "faq-detail-answer",
                record.answer
              )
            );

            container.scrollIntoView({
              behavior: "smooth",
              block: "start"
            });
          })
          .catch(function (error) {
            notify(error.message, "error");
          });
      });

      container.appendChild(button);
    });
  };

  /* ---------------------------------------------------------
     ADMIN — CREATE FAQ
  --------------------------------------------------------- */

  FAQ.create = async function (payload) {
    const question = clean(payload.question, 500);
    const answer = clean(payload.answer, 5000);

    const category = clean(
      payload.category,
      50
    ).toLowerCase();

    if (!question || !answer) {
      throw new Error(
        "Question and answer are required."
      );
    }

    if (!validCategory(category)) {
      throw new Error("Select a valid FAQ category.");
    }

    const result = await FAQ.rpc(
      "create_lens_circle_faq",
      {
        p_question: question,
        p_answer: answer,
        p_category: category,
        p_sort_order: Number(payload.sort_order) || 0
      }
    );

    notify("FAQ created successfully.", "success");

    return result;
  };

  /* ---------------------------------------------------------
     ADMIN — UPDATE FAQ
  --------------------------------------------------------- */

  FAQ.update = async function (faqId, payload) {
    const id = clean(faqId, 100);

    if (!id) {
      throw new Error("FAQ ID is required.");
    }

    const category = clean(
      payload.category,
      50
    ).toLowerCase();

    if (!validCategory(category)) {
      throw new Error("Invalid FAQ category.");
    }

    const result = await FAQ.rpc(
      "update_lens_circle_faq",
      {
        p_faq_id: id,
        p_question: clean(payload.question, 500),
        p_answer: clean(payload.answer, 5000),
        p_category: category,
        p_sort_order: Number(payload.sort_order) || 0
      }
    );

    notify("FAQ updated successfully.", "success");

    return result;
  };

  /* ---------------------------------------------------------
     ADMIN — PUBLISH FAQ
  --------------------------------------------------------- */

  FAQ.publish = async function (faqId) {
    const id = clean(faqId, 100);

    if (!id) {
      throw new Error("FAQ ID is required.");
    }

    if (!window.confirm("Publish this FAQ?")) {
      return false;
    }

    await FAQ.rpc(
      "publish_lens_circle_faq",
      {
        p_faq_id: id
      }
    );

    notify("FAQ published successfully.", "success");

    return true;
  };

  /* ---------------------------------------------------------
     ADMIN — DELETE FAQ
  --------------------------------------------------------- */

  FAQ.remove = async function (faqId) {
    const id = clean(faqId, 100);

    if (!id) {
      throw new Error("FAQ ID is required.");
    }

    if (!window.confirm(
      "Delete this FAQ permanently?"
    )) {
      return false;
    }

    await FAQ.rpc(
      "delete_lens_circle_faq",
      {
        p_faq_id: id
      }
    );

    notify("FAQ deleted successfully.", "success");

    return true;
  };

  /* ---------------------------------------------------------
     SEARCH AND CATEGORY CONTROLS
  --------------------------------------------------------- */

  FAQ.bindControls = function () {
    const search = document.querySelector(
      "[data-faq-search]"
    );

    if (search && !search.dataset.bound) {
      search.dataset.bound = "true";

      search.addEventListener("input", function () {
        FAQ.search(search.value)
          .catch(function (error) {
            notify(error.message, "error");
          });
      });
    }

    document.querySelectorAll(
      "[data-faq-category]"
    ).forEach(function (button) {
      if (button.dataset.bound) return;

      button.dataset.bound = "true";

      button.addEventListener("click", function () {
        FAQ.setCategory(
          button.dataset.faqCategory
        ).catch(function (error) {
          notify(error.message, "error");
        });
      });
    });
  };

  /* ---------------------------------------------------------
     INITIALISATION
  --------------------------------------------------------- */

  FAQ.init = async function (options) {
    const settings = options || {};

    FAQ.bindControls();

    await FAQ.load();

    if (settings.popular) {
      await FAQ.getPopular();
    }

    return true;
  };

  /* ---------------------------------------------------------
     STATE
  --------------------------------------------------------- */

  FAQ.getState = function () {
    return {
      faqCount: state.faqs.length,
      popularCount: state.popular.length,
      category: state.category,
      search: state.search,
      selected: state.selected
    };
  };

  /* ---------------------------------------------------------
     EXPORT
  --------------------------------------------------------- */

  LC.faq = FAQ;

  window.LensCircleFAQ = FAQ;

})(window, document);
