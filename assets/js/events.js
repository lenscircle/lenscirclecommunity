
/* =========================================================
   LENS CIRCLE — EVENTS MODULE
   File: assets/js/events.js

   FEATURES
   - Event discovery and calendar
   - Event details
   - Event registration and withdrawal
   - Member registration history
   - Event capacity information
   - Event search and category filters
   - Director/Admin event creation and management
   - Participant management for authorised staff

   EXPECTED SUPABASE RPC CONTRACTS
   - get_published_events
   - get_event_details
   - get_my_event_registrations
   - register_for_event
   - withdraw_from_event
   - create_lens_circle_event
   - update_lens_circle_event
   - cancel_lens_circle_event
   - get_event_participants

   SECURITY
   - Public visitors can only see published public events.
   - Members can manage only their own registrations.
   - Staff permissions and department scope are enforced by DB.
   - Capacity and registration deadlines are checked server-side.
   - Event organisers cannot grant themselves privileges.
   ========================================================= */

(function (window, document) {
  "use strict";

  const LC = window.LensCircle = window.LensCircle || {};
  const Events = {};

  const CATEGORIES = [
    "photography",
    "workshop",
    "competition",
    "exhibition",
    "community",
    "webinar",
    "meetup",
    "other"
  ];

  const STATUSES = [
    "draft",
    "published",
    "registration_open",
    "registration_closed",
    "completed",
    "cancelled"
  ];

  const state = {
    user: null,
    authenticated: false,
    events: [],
    selectedEvent: null,
    registrations: [],
    participants: [],
    page: 0,
    pageSize: 12,
    hasMore: true,
    loading: false,
    search: "",
    category: "all",
    view: "upcoming"
  };

  /* ---------------------------------------------------------
     HELPERS
  --------------------------------------------------------- */

  function clean(value, maxLength) {
    return String(value == null ? "" : value)
      .trim()
      .slice(0, maxLength || 500);
  }

  function array(value) {
    return Array.isArray(value) ? value : [];
  }

  function db() {
    if (LC.db) return LC.db;

    if (
      LC.supabase &&
      typeof LC.supabase.rpc === "function"
    ) {
      return LC.supabase;
    }

    throw new Error("Supabase client is unavailable.");
  }

  function notify(message, type) {
    if (
      LC.forms &&
      typeof LC.forms.notify === "function"
    ) {
      LC.forms.notify(message, type || "info");
    } else {
      console.info("[Lens Circle Events]", message);
    }
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);

    if (className) node.className = className;

    if (text !== undefined) {
      node.textContent = clean(text, 2000);
    }

    return node;
  }

  function formatDate(value) {
    if (!value) return "Date to be announced";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "Date to be announced";
    }

    return date.toLocaleDateString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "long",
      year: "numeric"
    });
  }

  function formatTime(value) {
    if (!value) return "";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "";

    return date.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit"
    });
  }

  function validDate(value) {
    if (!value) return false;

    return !Number.isNaN(
      new Date(value).getTime()
    );
  }

  function setLoading(button, loading) {
    if (!button) return;

    button.disabled = Boolean(loading);
    button.setAttribute(
      "aria-busy",
      String(Boolean(loading))
    );
  }

  /* ---------------------------------------------------------
     AUTHENTICATION
  --------------------------------------------------------- */

  Events.refreshAuth = async function () {
    const { data, error } = await db()
      .auth.getSession();

    if (error) throw error;

    const session = data && data.session;

    state.authenticated = Boolean(session);
    state.user = session ? session.user : null;

    return state.authenticated;
  };

  Events.requireMember = async function () {
    const authenticated = await Events.refreshAuth();

    if (!authenticated) {
      window.location.assign(
        "/member/login.html"
      );

      return false;
    }

    return true;
  };

  /* ---------------------------------------------------------
     RPC
  --------------------------------------------------------- */

  Events.rpc = async function (name, params) {
    const { data, error } = await db().rpc(
      name,
      params || {}
    );

    if (error) {
      console.error("[Events RPC]", name, error);
      throw error;
    }

    return data;
  };

  /* ---------------------------------------------------------
     EVENT DISCOVERY
  --------------------------------------------------------- */

  Events.getEvents = async function (options) {
    const settings = options || {};

    if (state.loading) return state.events;

    if (settings.reset) {
      state.page = 0;
      state.hasMore = true;
      state.events = [];
    }

    if (!state.hasMore) return state.events;

    state.loading = true;

    try {
      const data = await Events.rpc(
        "get_published_events",
        {
          p_search: state.search || null,
          p_category:
            state.category === "all"
              ? null
              : state.category,
          p_view: state.view,
          p_page: state.page,
          p_page_size: state.pageSize
        }
      );

      const records = array(data);

      if (settings.reset) {
        state.events = records;
      } else {
        state.events = state.events.concat(records);
      }

      state.hasMore =
        records.length === state.pageSize;

      if (records.length) state.page += 1;

      Events.renderEvents(state.events);

      return state.events;

    } finally {
      state.loading = false;
    }
  };

  Events.search = function (query) {
    state.search = clean(query, 150);

    return Events.getEvents({
      reset: true
    });
  };

  Events.filterCategory = function (category) {
    const selected = clean(
      category,
      40
    ).toLowerCase();

    if (
      selected !== "all" &&
      !CATEGORIES.includes(selected)
    ) {
      throw new Error("Invalid event category.");
    }

    state.category = selected;

    return Events.getEvents({
      reset: true
    });
  };

  Events.setView = function (view) {
    const allowed = [
      "upcoming",
      "past",
      "all"
    ];

    if (!allowed.includes(view)) {
      throw new Error("Invalid event view.");
    }

    state.view = view;

    return Events.getEvents({
      reset: true
    });
  };

  /* ---------------------------------------------------------
     EVENT DETAILS
  --------------------------------------------------------- */

  Events.getDetails = async function (eventId) {
    const id = clean(eventId, 100);

    if (!id) {
      throw new Error("Event ID is required.");
    }

    const data = await Events.rpc(
      "get_event_details",
      {
        p_event_id: id
      }
    );

    state.selectedEvent = Array.isArray(data)
      ? data[0] || null
      : data;

    Events.renderDetails(state.selectedEvent);

    return state.selectedEvent;
  };

  Events.renderDetails = function (event) {
    const container = document.querySelector(
      "[data-event-details]"
    );

    if (!container) return;

    container.replaceChildren();

    if (!event) {
      container.appendChild(
        el("p", "event-empty", "Event not found.")
      );
      return;
    }

    const heading = el(
      "h1",
      "event-detail-title",
      event.title
    );

    const description = el(
      "p",
      "event-detail-description",
      event.description
    );

    const date = el(
      "p",
      "event-detail-date",
      formatDate(event.starts_at)
    );

    const time = el(
      "p",
      "event-detail-time",
      formatTime(event.starts_at)
    );

    const location = el(
      "p",
      "event-detail-location",
      event.location || "Location to be announced"
    );

    const category = el(
      "span",
      "event-detail-category",
      event.category
    );

    container.append(
      category,
      heading,
      description,
      date,
      time,
      location
    );

    const registration = document.querySelector(
      "[data-event-registration]"
    );

    if (registration) {
      registration.hidden =
        event.status === "cancelled" ||
        event.status === "completed" ||
        event.registration_open === false;
    }
  };

  /* ---------------------------------------------------------
     EVENT REGISTRATION
  --------------------------------------------------------- */

  Events.register = async function (eventId) {
    const allowed = await Events.requireMember();

    if (!allowed) return false;

    const id = clean(eventId, 100);

    if (!id) {
      throw new Error("Event ID is required.");
    }

    const confirmed = window.confirm(
      "Register for this Lens Circle event?"
    );

    if (!confirmed) return false;

    const result = await Events.rpc(
      "register_for_event",
      {
        p_event_id: id
      }
    );

    notify("Your event registration is confirmed.", "success");

    await Events.getMyRegistrations();

    return result;
  };

  Events.withdraw = async function (eventId) {
    const allowed = await Events.requireMember();

    if (!allowed) return false;

    const id = clean(eventId, 100);

    if (!id) {
      throw new Error("Event ID is required.");
    }

    if (!window.confirm(
      "Withdraw your registration from this event?"
    )) {
      return false;
    }

    const result = await Events.rpc(
      "withdraw_from_event",
      {
        p_event_id: id
      }
    );

    notify("Your registration has been withdrawn.", "success");

    await Events.getMyRegistrations();

    return result;
  };

  Events.getMyRegistrations = async function () {
    const allowed = await Events.requireMember();

    if (!allowed) return [];

    const data = await Events.rpc(
      "get_my_event_registrations"
    );

    state.registrations = array(data);

    Events.renderRegistrations(state.registrations);

    return state.registrations;
  };

  /* ---------------------------------------------------------
     EVENT MANAGEMENT
  --------------------------------------------------------- */

  Events.validateEvent = function (payload) {
    const title = clean(payload.title, 150);
    const description = clean(
      payload.description,
      5000
    );

    const category = clean(
      payload.category,
      40
    ).toLowerCase();

    if (!title) {
      throw new Error("Event title is required.");
    }

    if (!description) {
      throw new Error("Event description is required.");
    }

    if (!CATEGORIES.includes(category)) {
      throw new Error("Select a valid event category.");
    }

    if (!validDate(payload.starts_at)) {
      throw new Error("Enter a valid event start date.");
    }

    if (
      payload.ends_at &&
      !validDate(payload.ends_at)
    ) {
      throw new Error("Enter a valid event end date.");
    }

    if (
      payload.ends_at &&
      new Date(payload.ends_at) <
      new Date(payload.starts_at)
    ) {
      throw new Error(
        "Event end time cannot be before its start time."
      );
    }

    const capacity = payload.capacity == null ||
      payload.capacity === ""
        ? null
        : Number(payload.capacity);

    if (
      capacity !== null &&
      (!Number.isInteger(capacity) || capacity < 1)
    ) {
      throw new Error(
        "Capacity must be a positive whole number."
      );
    }

    return {
      title,
      description,
      category,
      starts_at: payload.starts_at,
      ends_at: payload.ends_at || null,
      registration_deadline:
        payload.registration_deadline || null,
      location: clean(payload.location, 250) || null,
      event_url: clean(payload.event_url, 500) || null,
      capacity,
      status: clean(payload.status || "draft", 30)
    };
  };

  Events.create = async function (payload) {
    const event = Events.validateEvent(payload);

    if (!STATUSES.includes(event.status)) {
      throw new Error("Invalid event status.");
    }

    const result = await Events.rpc(
      "create_lens_circle_event",
      {
        p_event: event
      }
    );

    notify("Event created successfully.", "success");

    return result;
  };

  Events.update = async function (
    eventId,
    payload
  ) {
    const id = clean(eventId, 100);

    if (!id) {
      throw new Error("Event ID is required.");
    }

    const event = Events.validateEvent(payload);

    if (!STATUSES.includes(event.status)) {
      throw new Error("Invalid event status.");
    }

    const result = await Events.rpc(
      "update_lens_circle_event",
      {
        p_event_id: id,
        p_event: event
      }
    );

    notify("Event updated successfully.", "success");

    return result;
  };

  Events.cancel = async function (eventId, reason) {
    const id = clean(eventId, 100);

    if (!id) {
      throw new Error("Event ID is required.");
    }

    if (!window.confirm(
      "Cancel this event? Registered participants may need to be notified."
    )) {
      return false;
    }

    const result = await Events.rpc(
      "cancel_lens_circle_event",
      {
        p_event_id: id,
        p_reason: clean(reason, 1000) || null
      }
    );

    notify("Event cancellation recorded.", "success");

    return result;
  };

  /* ---------------------------------------------------------
     PARTICIPANTS
  --------------------------------------------------------- */

  Events.getParticipants = async function (eventId) {
    const id = clean(eventId, 100);

    if (!id) {
      throw new Error("Event ID is required.");
    }

    const data = await Events.rpc(
      "get_event_participants",
      {
        p_event_id: id
      }
    );

    state.participants = array(data);

    Events.renderParticipants(state.participants);

    return state.participants;
  };

  Events.renderParticipants = function (records) {
    const container = document.querySelector(
      "[data-event-participants]"
    );

    if (!container) return;

    container.replaceChildren();

    if (!records.length) {
      container.appendChild(
        el(
          "p",
          "event-empty",
          "No participants are available to display."
        )
      );

      return;
    }

    records.forEach(function (participant) {
      const card = el(
        "article",
        "event-participant"
      );

      const name = el(
        "strong",
        "event-participant-name",
        participant.display_name || "Member"
      );

      const status = el(
        "span",
        "event-participant-status",
        participant.registration_status || "Registered"
      );

      card.append(name, status);
      container.appendChild(card);
    });
  };

  /* ---------------------------------------------------------
     EVENT RENDERING
  --------------------------------------------------------- */

  Events.renderEvents = function (records) {
    const container = document.querySelector(
      "[data-events-list]"
    );

    if (!container) return;

    container.replaceChildren();

    if (!records.length) {
      container.appendChild(
        el(
          "p",
          "event-empty",
          "No events match your search. Check back soon."
        )
      );

      return;
    }

    records.forEach(function (event) {
      const card = el("article", "event-card");

      const category = el(
        "span",
        "event-category",
        event.category
      );

      const title = el(
        "h3",
        "event-title",
        event.title
      );

      const description = el(
        "p",
        "event-description",
        event.short_description ||
        event.description
      );

      const date = el(
        "p",
        "event-date",
        formatDate(event.starts_at)
      );

      const time = el(
        "p",
        "event-time",
        formatTime(event.starts_at)
      );

      const location = el(
        "p",
        "event-location",
        event.location || "Location to be announced"
      );

      const button = el(
        "button",
        "event-details-button",
        "View event"
      );

      button.type = "button";

      button.addEventListener("click", function () {
        const target = event.details_url;

        if (target) {
          const url = new URL(
            target,
            window.location.href
          );

          if (url.origin === window.location.origin) {
            window.location.assign(url.href);
            return;
          }
        }

        Events.getDetails(event.id).catch(function (error) {
          notify(error.message, "error");
        });
      });

      card.append(
        category,
        title,
        description,
        date,
        time,
        location,
        button
      );

      container.appendChild(card);
    });
  };

  /* ---------------------------------------------------------
     REGISTRATION RENDERING
  --------------------------------------------------------- */

  Events.renderRegistrations = function (records) {
    const container = document.querySelector(
      "[data-my-event-registrations]"
    );

    if (!container) return;

    container.replaceChildren();

    if (!records.length) {
      container.appendChild(
        el(
          "p",
          "event-empty",
          "You have not registered for any events."
        )
      );

      return;
    }

    records.forEach(function (registration) {
      const card = el(
        "article",
        "event-registration-card"
      );

      const title = el(
        "h3",
        "event-registration-title",
        registration.event_title
      );

      const date = el(
        "p",
        "event-registration-date",
        formatDate(registration.starts_at)
      );

      const status = el(
        "span",
        "event-registration-status",
        registration.status
      );

      card.append(title, date, status);

      if (
        registration.status === "registered" &&
        registration.can_withdraw !== false
      ) {
        const button = el(
          "button",
          "event-withdraw-button",
          "Withdraw"
        );

        button.type = "button";

        button.addEventListener("click", function () {
          Events.withdraw(registration.event_id)
            .catch(function (error) {
              notify(error.message, "error");
            });
        });

        card.appendChild(button);
      }

      container.appendChild(card);
    });
  };

  /* ---------------------------------------------------------
     FILTER BINDINGS
  --------------------------------------------------------- */

  Events.bindFilters = function () {
    const search = document.querySelector(
      "[data-events-search]"
    );

    if (search && !search.dataset.bound) {
      search.dataset.bound = "true";

      let timeout;

      search.addEventListener("input", function () {
        window.clearTimeout(timeout);

        timeout = window.setTimeout(function () {
          Events.search(search.value).catch(function (error) {
            notify(error.message, "error");
          });
        }, 300);
      });
    }

    document.querySelectorAll(
      "[data-events-category]"
    ).forEach(function (button) {
      if (button.dataset.bound) return;

      button.dataset.bound = "true";

      button.addEventListener("click", function () {
        Events.filterCategory(
          button.dataset.eventsCategory
        ).cat