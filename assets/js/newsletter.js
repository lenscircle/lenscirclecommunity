
/* =========================================================
   LENS CIRCLE — NEWSLETTER MODULE
   File: assets/js/newsletter.js

   FEATURES
   - Public newsletter subscriptions
   - Email confirmation
   - Subscription preferences
   - Unsubscribe
   - Subscriber status
   - Editorial announcements
   - Campaign management
   - Subscriber statistics

   EXPECTED SUPABASE RPC CONTRACTS
   - subscribe_lens_circle_newsletter
   - confirm_newsletter_subscription
   - unsubscribe_lens_circle_newsletter
   - update_newsletter_preferences
   - get_newsletter_subscription_status
   - get_public_newsletter_archive
   - get_staff_newsletter_campaigns
   - create_newsletter_campaign
   - update_newsletter_campaign
   - publish_newsletter_campaign
   - get_newsletter_statistics

   SECURITY
   - Never expose subscriber email lists publicly.
   - Confirmation tokens must be generated and verified
     server-side.
   - Unsubscribe tokens must be securely validated.
   - Campaign publishing requires authorised staff access.
   - Email delivery must use a trusted server-side provider.
   ========================================================= */

(function (window, document) {
  "use strict";

  const LC = window.LensCircle =
    window.LensCircle || {};

  const Newsletter = {};

  const CONFIG = {
    maxEmailLength: 254,
    maxNameLength: 100,
    maxTitleLength: 180,
    maxContentLength: 12000,

    topics: [
      "community_updates",
      "photography_tips",
      "competitions",
      "challenges",
      "editorial_stories",
      "events"
    ],

    statuses: [
      "draft",
      "scheduled",
      "published",
      "cancelled"
    ]
  };

  const state = {
    subscription: null,
    archive: [],
    campaigns: [],
    statistics: null,
    loading: false
  };

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
      node.textContent = clean(content, 3000);
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
      console.info("[Lens Circle Newsletter]", message);
    }
  }

  function validEmail(email) {
    const value = clean(
      email,
      CONFIG.maxEmailLength
    );

    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  function formatDate(value) {
    if (!value) return "—";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "—";

    return date.toLocaleDateString(undefined, {
      day: "numeric",
      month: "long",
      year: "numeric"
    });
  }

  function validTopics(topics) {
    return list(topics).filter(function (topic) {
      return CONFIG.topics.includes(topic);
    });
  }

  /* ---------------------------------------------------------
     RPC
  --------------------------------------------------------- */

  Newsletter.rpc = async function (name, params) {
    const { data, error } = await db().rpc(
      name,
      params || {}
    );

    if (error) {
      console.error("[Newsletter RPC]", name, error);
      throw error;
    }

    return data;
  };

  /* ---------------------------------------------------------
     SUBSCRIBE
  --------------------------------------------------------- */

  Newsletter.subscribe = async function (payload) {
    const email = clean(
      payload.email,
      CONFIG.maxEmailLength
    ).toLowerCase();

    const name = clean(
      payload.name,
      CONFIG.maxNameLength
    );

    const topics = validTopics(payload.topics);

    if (!validEmail(email)) {
      throw new Error("Enter a valid email address.");
    }

    if (
      payload.topics &&
      list(payload.topics).length !== topics.length
    ) {
      throw new Error("One or more selected topics are invalid.");
    }

    if (payload.consent !== true) {
      throw new Error(
        "Please confirm your newsletter consent."
      );
    }

    const result = await Newsletter.rpc(
      "subscribe_lens_circle_newsletter",
      {
        p_email: email,
        p_name: name || null,
        p_topics: topics,
        p_consent: true
      }
    );

    notify(
      "Please check your email to confirm your subscription.",
      "success"
    );

    return result;
  };

  /* ---------------------------------------------------------
     CONFIRM SUBSCRIPTION
  --------------------------------------------------------- */

  Newsletter.confirm = async function (token) {
    const confirmationToken = clean(token, 500);

    if (!confirmationToken) {
      throw new Error("Confirmation token is missing.");
    }

    const result = await Newsletter.rpc(
      "confirm_newsletter_subscription",
      {
        p_token: confirmationToken
      }
    );

    notify(
      "Your newsletter subscription is confirmed.",
      "success"
    );

    return result;
  };

  /* ---------------------------------------------------------
     UNSUBSCRIBE
  --------------------------------------------------------- */

  Newsletter.unsubscribe = async function (token) {
    const unsubscribeToken = clean(token, 500);

    if (!unsubscribeToken) {
      throw new Error("Unsubscribe token is missing.");
    }

    const result = await Newsletter.rpc(
      "unsubscribe_lens_circle_newsletter",
      {
        p_token: unsubscribeToken
      }
    );

    notify(
      "You have been unsubscribed successfully.",
      "success"
    );

    return result;
  };

  /* ---------------------------------------------------------
     SUBSCRIPTION STATUS
  --------------------------------------------------------- */

  Newsletter.getStatus = async function (email) {
    const value = clean(
      email,
      CONFIG.maxEmailLength
    ).toLowerCase();

    if (!validEmail(value)) {
      throw new Error("Enter a valid email address.");
    }

    const result = await Newsletter.rpc(
      "get_newsletter_subscription_status",
      {
        p_email: value
      }
    );

    state.subscription = Array.isArray(result)
      ? result[0] || null
      : result;

    Newsletter.renderStatus(state.subscription);

    return state.subscription;
  };

  Newsletter.renderStatus = function (subscription) {
    const container = document.querySelector(
      "[data-newsletter-status]"
    );

    if (!container) return;

    container.replaceChildren();

    if (!subscription) {
      container.appendChild(
        element(
          "p",
          "newsletter-empty",
          "No subscription information is available."
        )
      );

      return;
    }

    container.append(
      element(
        "p",
        "newsletter-status",
        "Status: " + subscription.status
      ),
      element(
        "p",
        "newsletter-topics",
        "Topics: " +
        list(subscription.topics).join(", ")
      )
    );
  };

  /* ---------------------------------------------------------
     UPDATE PREFERENCES
  --------------------------------------------------------- */

  Newsletter.updatePreferences = async function (payload) {
    const email = clean(
      payload.email,
      CONFIG.maxEmailLength
    ).toLowerCase();

    const topics = validTopics(payload.topics);

    if (!validEmail(email)) {
      throw new Error("Enter a valid email address.");
    }

    if (
      list(payload.topics).length !== topics.length
    ) {
      throw new Error("Invalid newsletter preferences.");
    }

    const result = await Newsletter.rpc(
      "update_newsletter_preferences",
      {
        p_email: email,
        p_token: clean(payload.token, 500),
        p_topics: topics
      }
    );

    notify("Newsletter preferences updated.", "success");

    return result;
  };

  /* ---------------------------------------------------------
     PUBLIC NEWSLETTER ARCHIVE
  --------------------------------------------------------- */

  Newsletter.getArchive = async function () {
    const data = await Newsletter.rpc(
      "get_public_newsletter_archive"
    );

    state.archive = list(data);

    Newsletter.renderArchive(state.archive);

    return state.archive;
  };

  Newsletter.renderArchive = function (records) {
    const container = document.querySelector(
      "[data-newsletter-archive]"
    );

    if (!container) return;

    container.replaceChildren();

    if (!records.length) {
      container.appendChild(
        element(
          "p",
          "newsletter-empty",
          "Our newsletter archive is coming soon."
        )
      );

      return;
    }

    records.forEach(function (campaign) {
      const card = element(
        "article",
        "newsletter-archive-card"
      );

      card.append(
        element(
          "h3",
          "newsletter-archive-title",
          campaign.title
        ),
        element(
          "p",
          "newsletter-archive-description",
          campaign.summary
        ),
        element(
          "small",
          "newsletter-archive-date",
          formatDate(campaign.published_at)
        )
      );

      if (campaign.public_url) {
        try {
          const url = new URL(
            campaign.public_url,
            window.location.origin
          );

          if (
            url.protocol === "https:" ||
            url.origin === window.location.origin
          ) {
            const link = element(
              "a",
              "newsletter-archive-link",
              "Read newsletter"
            );

            link.href = url.href;
            link.rel = "noopener noreferrer";

            card.appendChild(link);
          }
        } catch (_) {
          // Ignore invalid URLs.
        }
      }

      container.appendChild(card);
    });
  };

  /* ---------------------------------------------------------
     STAFF CAMPAIGN MANAGEMENT
  --------------------------------------------------------- */

  Newsletter.getCampaigns = async function () {
    const data = await Newsletter.rpc(
      "get_staff_newsletter_campaigns"
    );

    state.campaigns = list(data);

    Newsletter.renderCampaigns(state.campaigns);

    return state.campaigns;
  };

  Newsletter.renderCampaigns = function (records) {
    const container = document.querySelector(
      "[data-newsletter-campaigns]"
    );

    if (!container) return;

    container.replaceChildren();

    if (!records.length) {
      container.appendChild(
        element(
          "p",
          "newsletter-empty",
          "No newsletter campaigns found."
        )
      );

      return;
    }

    records.forEach(function (campaign) {
      const card = element(
        "article",
        "newsletter-campaign-card"
      );

      card.append(
        element(
          "h3",
          "newsletter-campaign-title",
          campaign.title
        ),
        element(
          "span",
          "newsletter-campaign-status",
          campaign.status
        ),
        element(
          "small",
          "newsletter-campaign-date",
          formatDate(campaign.created_at)
        )
      );

      container.appendChild(card);
    });
  };

  /* ---------------------------------------------------------
     CREATE CAMPAIGN
  --------------------------------------------------------- */

  Newsletter.createCampaign = async function (payload) {
    const title = clean(
      payload.title,
      CONFIG.maxTitleLength
    );

    const content = clean(
      payload.content,
      CONFIG.maxContentLength
    );

    const summary = clean(
      payload.summary,
      500
    );

    if (!title || !content) {
      throw new Error(
        "Campaign title and content are required."
      );
    }

    const result = await Newsletter.rpc(
      "create_newsletter_campaign",
      {
        p_title: title,
        p_summary: summary || null,
        p_content: content,
        p_topics: validTopics(payload.topics),
        p_scheduled_at: payload.scheduled_at || null
      }
    );

    notify("Newsletter campaign created.", "success");

    return result;
  };

  /* ---------------------------------------------------------
     UPDATE CAMPAIGN
  --------------------------------------------------------- */

  Newsletter.updateCampaign = async function (
    campaignId,
    payload
  ) {
    const id = clean(campaignId, 100);

    if (!id) {
      throw new Error("Campaign ID is required.");
    }

    const result = await Newsletter.rpc(
      "update_newsletter_campaign",
      {
        p_campaign_id: id,
        p_title: clean(
          payload.title,
          CONFIG.maxTitleLength
        ),
        p_summary: clean(payload.summary, 500),
        p_content: clean(
          payload.content,
          CONFIG.maxContentLength
        ),
        p_topics: validTopics(payload.topics),
        p_scheduled_at: payload.scheduled_at || null
      }
    );

    notify("Newsletter campaign updated.", "success");

    return result;
  };

  /* ---------------------------------------------------------
     PUBLISH CAMPAIGN
  --------------------------------------------------------- */

  Newsletter.publishCampaign = async function (
    campaignId
  ) {
    const id = clean(campaignId, 100);

    if (!id) {
      throw new Error("Campaign ID is required.");
    }

    if (!window.confirm(
      "Publish this newsletter campaign?"
    )) {
      return false;
    }

    const result = await Newsletter.rpc(
      "publish_newsletter_campaign",
      {
        p_campaign_id: id
      }
    );

    notify(
      "Newsletter campaign publishing requested.",
      "success"
    );

    return result;
  };

  /* ---------------------------------------------------------
     STATISTICS
  --------------------------------------------------------- */

  Newsletter.getStatistics = async function () {
    const data = await Newsletter.rpc(
      "get_newsletter_statistics"
    );

    state.statistics = Array.isArray(data)
      ? data[0] || {}
      : data || {};

    Newsletter.renderStatistics(state.statistics);

    return state.statistics;
  };

  Newsletter.renderStatistics = function (stats) {
    const container = document.querySelector(
      "[data-newsletter-statistics]"
    );

    if (!container) return;

    container.replaceChildren();

    const metrics = [
      ["Subscribers", stats.total_subscribers],
      ["Confirmed", stats.confirmed_subscribers],
      ["Pending", stats.pending_subscribers],
      ["Unsubscribed", stats.unsubscribed],
      ["Campaigns", stats.total_campaigns]
    ];

    metrics.forEach(function (metric) {
      const card = element(
        "div",
        "newsletter-stat"
      );

      card.append(
        element(
          "span",
          "newsletter-stat-label",
          metric[0]
        ),
        element(
          "strong",
          "newsletter-stat-value",
          String(Number(metric[1]) || 0)
        )
      );

      container.appendChild(card);
    });
  };

  /* ---------------------------------------------------------
     SUBSCRIPTION FORM
  --------------------------------------------------------- */

  Newsletter.bindSubscriptionForm = function () {
    const form = document.querySelector(
      "[data-newsletter-form]"
    );

    if (!form || form.dataset.bound) return;

    form.dataset.bound = "true";

    form.addEventListener("submit", async function (event) {
      event.preventDefault();

      const formData = new FormData(form);

      const topics = form.querySelectorAll(
        '[name="topics"]:checked'
      );

      const payload = {
        email: formData.get("email"),
        name: formData.get("name"),
        topics: Array.from(topics).map(function (input) {
          return input.value;
        }),
        consent: formData.get("consent") === "on"
      };

      const button = form.querySelector(
        '[type="submit"]'
      );

      if (button) button.disabled = true;

      try {
        await Newsletter.subscribe(payload);
        form.reset();
      } catch (error) {
        notify(error.message, "error");
      } finally {
        if (button) button.disabled = false;
      }
    });
  };

  /* ---------------------------------------------------------
     UNSUBSCRIBE PAGE
  --------------------------------------------------------- */

  Newsletter.bindUnsubscribe = function () {
    const button = document.querySelector(
      "[data-newsletter-unsubscribe]"
    );

    if (!button || button.dataset.bound) return;

    button.dataset.bound = "true";

    button.addEventListener("click", async function () {
      const params = new URLSearchParams(
        window.location.search
      );

      const token = params.get("token");

      if (!token) {
        notify(
          "Unsubscribe link is invalid.",
          "error"
        );

        return;
      }

      button.disabled = true;

      try {
        await Newsletter.unsubscribe(token);
        button.textContent = "Unsubscribed";
      } catch (error) {
        notify(error.message, "error");
        button.disabled = false;
      }
    });
  };

  /* ---------------------------------------------------------
     CONFIRMATION PAGE
  --------------------------------------------------------- */

  Newsletter.bindConfirmation = async function () {
    const params = new URLSearchParams(
      window.location.search
    );

    const token = params.get("token");

    if (!token) return false;

    await Newsletter.confirm(token);

    return true;
  };

  /* ---------------------------------------------------------
     INITIALISATION
  --------------------------------------------------------- */

  Newsletter.init = async function (options) {
    const settings = options || {};

    if (settings.subscriptionForm) {
      Newsletter.bindSubscriptionForm();
    }

    if (settings.unsubscribe) {
      Newsletter.bindUnsubscribe();
    }

    if (settings.confirmation) {
      await Newsletter.bindConfirmation();
    }

    if (settings.archive) {
      await Newsletter.getArchive();
    }

    if (settings.staff) {
      await Newsletter.getCampaigns();

      if (settings.statistics) {
        await Newsletter.getStatistics();
      }
    }

    return true;
  };

  /* ---------------------------------------------------------
     EXPORT
  --------------------------------------------------------- */

  Newsletter.getState = function () {
    return {
      archiveCount: state.archive.length,
      campaignCount: state.campaigns.length,
      subscription: state.subscription,
      statistics: state.statistics
    };
  };

  LC.newsletter = Newsletter;

  window.LensCircleNewsletter = Newsletter;

})(window, document);
