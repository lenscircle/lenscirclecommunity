
/**
 * LENS CIRCLE — VOTING MODULE
 * File: assets/js/voting.js
 *
 * Features:
 * - Submit votes for eligible photography entries
 * - Prevent duplicate voting through database enforcement
 * - Retrieve a member's voting status
 * - Retrieve published voting results
 * - Display voting progress and results
 * - Support Photo of the Day and Photography Battles
 *
 * REQUIRED SUPABASE RPC FUNCTIONS:
 *
 * cast_photography_vote(
 *   p_activity_id,
 *   p_entry_id
 * )
 *
 * get_my_vote_status(
 *   p_activity_id
 * )
 *
 * get_published_voting_results(
 *   p_activity_id
 * )
 *
 * get_voting_period_status(
 *   p_activity_id
 * )
 *
 * SECURITY:
 * - The database must derive voter identity from auth.uid().
 * - Unique constraints must prevent duplicate votes.
 * - The database must verify activity and voting deadlines.
 * - Users must not vote for their own entries if prohibited by rules.
 * - Results must not expose hidden votes before publication.
 * - Never accept a voter ID or trusted vote count from the browser.
 */

(function () {
  "use strict";

  const CONFIG = {
    rpc: {
      cast: "cast_photography_vote",
      myStatus: "get_my_vote_status",
      results: "get_published_voting_results",
      period: "get_voting_period_status"
    },

    activityTypes: [
      "photo_of_the_day",
      "photography_battle",
      "competition"
    ],

    timezone: "Asia/Kolkata"
  };

  const state = {
    currentActivityId: null,
    voteStatus: null,
    results: [],
    votingPeriod: null,
    loading: false
  };

  function client() {
    if (window.LensCircle?.db) {
      return window.LensCircle.db;
    }

    if (window.supabaseClient) {
      return window.supabaseClient;
    }

    throw new Error(
      "Lens Circle Supabase client is unavailable."
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

  function notify(message, type = "info") {
    window.dispatchEvent(
      new CustomEvent("lenscircle:vote-message", {
        detail: { message, type }
      })
    );
  }

  function formatDateTime(value) {
    if (!value) return "To be announced";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "To be announced";
    }

    return new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: CONFIG.timezone,
      timeZoneName: "short"
    }).format(date);
  }

  async function getPeriodStatus(activityId) {
    if (!activityId) {
      throw new Error("Activity ID is required.");
    }

    const { data, error } = await client().rpc(
      CONFIG.rpc.period,
      {
        p_activity_id: activityId
      }
    );

    if (error) throw error;

    state.votingPeriod = data;

    return {
      success: true,
      data
    };
  }

  async function getMyStatus(activityId) {
    if (!activityId) {
      throw new Error("Activity ID is required.");
    }

    const { data, error } = await client().rpc(
      CONFIG.rpc.myStatus,
      {
        p_activity_id: activityId
      }
    );

    if (error) throw error;

    state.currentActivityId = activityId;
    state.voteStatus = data;

    return {
      success: true,
      data
    };
  }

  async function castVote(activityId, entryId) {
    if (!activityId || !entryId) {
      throw new Error(
        "Activity and photograph entry are required."
      );
    }

    const period = await getPeriodStatus(activityId);

    if (
      period.data &&
      period.data.is_open === false
    ) {
      throw new Error(
        "Voting is currently closed for this activity."
      );
    }

    const status = await getMyStatus(activityId);

    if (
      status.data &&
      status.data.has_voted === true
    ) {
      throw new Error(
        "You have already voted in this activity."
      );
    }

    const confirmed = window.confirm(
      "Submit your vote for this photograph?"
    );

    if (!confirmed) {
      return {
        success: false,
        cancelled: true
      };
    }

    const { data, error } = await client().rpc(
      CONFIG.rpc.cast,
      {
        p_activity_id: activityId,
        p_entry_id: entryId
      }
    );

    if (error) {
      if (
        error.code === "23505" ||
        /duplicate|already voted/i.test(error.message || "")
      ) {
        throw new Error(
          "Your vote has already been recorded."
        );
      }

      throw error;
    }

    await getMyStatus(activityId);

    notify("Your vote has been recorded.", "success");

    return {
      success: true,
      data
    };
  }

  async function getResults(activityId) {
    if (!activityId) {
      throw new Error("Activity ID is required.");
    }

    const { data, error } = await client().rpc(
      CONFIG.rpc.results,
      {
        p_activity_id: activityId
      }
    );

    if (error) throw error;

    state.results = Array.isArray(data)
      ? data
      : [];

    return {
      success: true,
      data: state.results
    };
  }

  function renderVotingStatus(container, period, voteStatus) {
    if (!container) return;

    const isOpen = period?.is_open === true;
    const hasVoted = voteStatus?.has_voted === true;

    let heading = "Voting information";
    let message = "Voting information is currently unavailable.";

    if (isOpen && hasVoted) {
      heading = "Vote recorded";
      message = "Your vote has already been submitted.";
    } else if (isOpen) {
      heading = "Voting is open";
      message = "Choose your favourite photograph and cast your vote.";
    } else if (period?.is_upcoming) {
      heading = "Voting starts soon";
      message = "Come back when the voting period begins.";
    } else if (period?.is_closed) {
      heading = "Voting has closed";
      message = "Thank you to everyone who participated.";
    }

    container.innerHTML = `
      <section class="lc-voting-status">
        <h3>${escapeHTML(heading)}</h3>
        <p>${escapeHTML(message)}</p>

        <div class="lc-voting-dates">
          <span>
            <strong>Voting opens</strong>
            ${escapeHTML(formatDateTime(period?.voting_start))}
          </span>

          <span>
            <strong>Voting closes</strong>
            ${escapeHTML(formatDateTime(period?.voting_end))}
          </span>
        </div>
      </section>
    `;
  }

  function renderResults(container, results) {
    if (!container) return;

    if (!results.length) {
      container.innerHTML = `
        <div class="lc-voting-empty">
          <h3>Results are not available yet</h3>
          <p>
            Results will appear after the voting period
            and official publication.
          </p>
        </div>
      `;
      return;
    }

    container.innerHTML = results.map((entry, index) => `
      <article class="lc-voting-result">
        <span class="lc-voting-result__rank">
          ${escapeHTML(entry.rank || index + 1)}
        </span>

        <div class="lc-voting-result__information">
          <h4>${escapeHTML(entry.title || "Photograph")}</h4>
          <p>
            By ${escapeHTML(entry.photographer_name || "Photographer")}
          </p>
        </div>

        ${
          entry.award
            ? `<span class="lc-voting-result__award">
                ${escapeHTML(entry.award)}
              </span>`
            : ""
        }
      </article>
    `).join("");
  }

  async function initialise(activityId, options = {}) {
    if (!activityId) {
      throw new Error("Activity ID is required.");
    }

    state.loading = true;

    try {
      const [period, status] = await Promise.all([
        getPeriodStatus(activityId),
        getMyStatus(activityId)
      ]);

      const statusContainer = document.querySelector(
        options.statusContainer || "[data-voting-status]"
      );

      renderVotingStatus(
        statusContainer,
        period.data,
        status.data
      );

      return {
        success: true,
        period: period.data,
        voteStatus: status.data
      };

    } finally {
      state.loading = false;
    }
  }

  function bind(container = document) {
    container.addEventListener("click", async event => {
      const button = event.target.closest(
        "[data-vote-entry]"
      );

      if (!button) return;

      const activityId = button.dataset.activityId;
      const entryId = button.dataset.voteEntry;

      button.disabled = true;

      try {
        await castVote(activityId, entryId);

        button.textContent = "Vote Recorded";
        button.setAttribute("aria-pressed", "true");

      } catch (error) {
        console.error("Voting failed:", error);

        notify(
          error.message || "Unable to submit your vote.",
          "error"
        );

      } finally {
        button.disabled = false;
      }
    });
  }

  window.LensCircleVoting = {
    config: CONFIG,
    state,
    getPeriodStatus,
    getMyStatus,
    castVote,
    getResults,
    renderVotingStatus,
    renderResults,
    initialise,
    bind,
    formatDateTime
  };

})();
