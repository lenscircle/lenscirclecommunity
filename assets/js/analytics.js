
/* =========================================================
   LENS CIRCLE — ANALYTICS MODULE
   File: assets/js/analytics.js

   FEATURES
   - Platform overview statistics.
   - Membership growth.
   - Member engagement.
   - Photography submission analytics.
   - Photo of the Day analytics.
   - Competition analytics.
   - Exhibition analytics.
   - Editorial performance.
   - Department-specific analytics.
   - Date-range reporting.
   - Chart.js integration (optional).
   - CSV export.

   REQUIRED DATABASE RPC CONTRACTS
   get_platform_analytics(p_start_date, p_end_date)
   get_membership_analytics(p_start_date, p_end_date)
   get_engagement_analytics(p_start_date, p_end_date)
   get_submission_analytics(p_start_date, p_end_date)
   get_competition_analytics(p_start_date, p_end_date)
   get_exhibition_analytics(p_start_date, p_end_date)
   get_editorial_analytics(p_start_date, p_end_date)
   get_department_analytics(
     p_department_id,
     p_start_date,
     p_end_date
   )

   SECURITY
   - Admin receives platform-wide analytics.
   - Directors receive only their authorised department data.
   - Moderators receive no analytics unless explicitly granted.
   - Database verifies the caller using auth.uid().
   - Aggregate responses must not expose personal information.
   - Never accept a role or permission claim from the browser.
   - Apply minimum cohort sizes where statistics could
     otherwise reveal an individual's activity.

   NOTE
   The RPCs must be created before live analytics work.
   Chart.js is optional and must be loaded separately.
   ========================================================= */

(function (window, document) {
  "use strict";

  const LC = window.LensCircle = window.LensCircle || {};
  const Analytics = {};

  const RPC = Object.freeze({
    PLATFORM: "get_platform_analytics",
    MEMBERSHIP: "get_membership_analytics",
    ENGAGEMENT: "get_engagement_analytics",
    SUBMISSIONS: "get_submission_analytics",
    COMPETITIONS: "get_competition_analytics",
    EXHIBITIONS: "get_exhibition_analytics",
    EDITORIAL: "get_editorial_analytics",
    DEPARTMENT: "get_department_analytics"
  });

  const DATE_PRESETS = Object.freeze([
    "7d",
    "30d",
    "90d",
    "365d",
    "custom"
  ]);

  const state = {
    dateRange: {
      startDate: null,
      endDate: null,
      preset: "30d"
    },
    platform: null,
    membership: null,
    engagement: null,
    submissions: null,
    competitions: null,
    exhibitions: null,
    editorial: null,
    department: null,
    charts: {}
  };

  /* ---------------------------------------------------------
     CORE HELPERS
  --------------------------------------------------------- */

  function getClient() {
    const client = LC.db || LC.supabase;

    if (!client || typeof client.rpc !== "function") {
      throw new Error(
        "Supabase client unavailable. Check supabase-client.js."
      );
    }

    return client;
  }

  async function requireUser() {
    const result = await getClient().auth.getUser();

    if (result.error) throw result.error;

    if (!result.data || !result.data.user) {
      throw new Error("Please sign in to view analytics.");
    }

    return result.data.user;
  }

  async function callRPC(name, params) {
    const result = await getClient().rpc(name, params || {});

    if (result.error) {
      console.error("[Lens Circle Analytics]", name, result.error);

      throw new Error(
        result.error.message || "Analytics request failed."
      );
    }

    return result.data;
  }

  function cleanText(value, maxLength) {
    return String(value == null ? "" : value)
      .trim()
      .slice(0, maxLength || 500);
  }

  function escapeHTML(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function toNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function normaliseDate(value) {
    if (!value) return null;

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      throw new Error("Invalid analytics date.");
    }

    return date.toISOString();
  }

  function normaliseRange(startDate, endDate) {
    const start = normaliseDate(startDate);
    const end = normaliseDate(endDate);

    if (!start || !end) {
      throw new Error("Select both start and end dates.");
    }

    if (new Date(start) > new Date(end)) {
      throw new Error("Start date must be before end date.");
    }

    if (
      new Date(end).getTime() - new Date(start).getTime() >
      366 * 24 * 60 * 60 * 1000
    ) {
      throw new Error("Choose a reporting period of 366 days or less.");
    }

    return {
      startDate: start,
      endDate: end
    };
  }

  function getRangeParams() {
    if (!state.dateRange.startDate || !state.dateRange.endDate) {
      setPreset("30d");
    }

    return {
      p_start_date: state.dateRange.startDate,
      p_end_date: state.dateRange.endDate
    };
  }

  function normaliseSeries(data) {
    if (!Array.isArray(data)) return [];

    return data.map(item => ({
      label: cleanText(
        item.label || item.date || item.month || item.name,
        100
      ),
      value: toNumber(
        item.value ?? item.count ?? item.total
      )
    }));
  }

  function normaliseMetric(data) {
    const source = data || {};

    return {
      total: toNumber(source.total),
      previous: toNumber(source.previous),
      change: toNumber(source.change),
      percentage: toNumber(source.percentage),
      series: normaliseSeries(source.series)
    };
  }

  function unwrapObject(data) {
    if (Array.isArray(data)) return data[0] || {};
    return data || {};
  }

  function formatNumber(value) {
    return new Intl.NumberFormat("en-IN", {
      maximumFractionDigits: 1
    }).format(toNumber(value));
  }

  function formatPercentage(value) {
    const number = toNumber(value);

    return (number > 0 ? "+" : "") +
      number.toFixed(1) + "%";
  }

  function formatDateLabel(value) {
    if (!value) return "—";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "—";

    return new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric"
    }).format(date);
  }

  /* ---------------------------------------------------------
     DATE RANGE MANAGEMENT
  --------------------------------------------------------- */

  function setPreset(preset) {
    if (!DATE_PRESETS.includes(preset) || preset === "custom") {
      throw new Error("Choose a supported date preset.");
    }

    const end = new Date();
    const start = new Date(end);

    const days = {
      "7d": 7,
      "30d": 30,
      "90d": 90,
      "365d": 365
    }[preset];

    start.setDate(start.getDate() - days);

    state.dateRange = {
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      preset
    };

    return Object.assign({}, state.dateRange);
  }

  Analytics.setDatePreset = function (preset) {
    return setPreset(preset);
  };

  Analytics.setCustomDateRange = function (
    startDate,
    endDate
  ) {
    const range = normaliseRange(startDate, endDate);

    state.dateRange = {
      startDate: range.startDate,
      endDate: range.endDate,
      preset: "custom"
    };

    return Object.assign({}, state.dateRange);
  };

  Analytics.getDateRange = function () {
    return Object.assign({}, state.dateRange);
  };

  /* ---------------------------------------------------------
     PLATFORM OVERVIEW
  --------------------------------------------------------- */

  Analytics.getPlatformOverview = async function () {
    await requireUser();

    const data = unwrapObject(
      await callRPC(RPC.PLATFORM, getRangeParams())
    );

    state.platform = {
      members: normaliseMetric(data.members),
      activeMembers: normaliseMetric(data.active_members),
      photographs: normaliseMetric(data.photographs),
      competitions: normaliseMetric(data.competitions),
      exhibitions: normaliseMetric(data.exhibitions),
      articles: normaliseMetric(data.articles),
      engagement: normaliseMetric(data.engagement),
      series: normaliseSeries(data.series)
    };

    return state.platform;
  };

  /* ---------------------------------------------------------
     MEMBERSHIP ANALYTICS
  --------------------------------------------------------- */

  Analytics.getMembershipAnalytics = async function () {
    await requireUser();

    const data = unwrapObject(
      await callRPC(RPC.MEMBERSHIP, getRangeParams())
    );

    state.membership = {
      totalMembers: normaliseMetric(data.total_members),
      newMembers: normaliseMetric(data.new_members),
      activeMembers: normaliseMetric(data.active_members),
      suspendedMembers: normaliseMetric(data.suspended_members),
      publicProfiles: normaliseMetric(data.public_profiles),
      growth: normaliseSeries(data.growth),
      monthlyGrowth: normaliseSeries(data.monthly_growth)
    };

    return state.membership;
  };

  /* ---------------------------------------------------------
     ENGAGEMENT ANALYTICS
  --------------------------------------------------------- */

  Analytics.getEngagementAnalytics = async function () {
    await requireUser();

    const data = unwrapObject(
      await callRPC(RPC.ENGAGEMENT, getRangeParams())
    );

    state.engagement = {
      activeUsers: normaliseMetric(data.active_users),
      returningUsers: normaliseMetric(data.returning_users),
      submissions: normaliseMetric(data.submissions),
      votes: normaliseMetric(data.votes),
      bookmarks: normaliseMetric(data.bookmarks),
      comments: normaliseMetric(data.comments),
      engagementTrend: normaliseSeries(data.engagement_trend)
    };

    return state.engagement;
  };

  /* ---------------------------------------------------------
     PHOTOGRAPHY SUBMISSION ANALYTICS
  --------------------------------------------------------- */

  Analytics.getSubmissionAnalytics = async function () {
    await requireUser();

    const data = unwrapObject(
      await callRPC(RPC.SUBMISSIONS, getRangeParams())
    );

    state.submissions = {
      total: normaliseMetric(data.total),
      photoOfTheDay: normaliseMetric(data.photo_of_the_day),
      weeklyChallenges: normaliseMetric(data.weekly_challenges),
      photographyBattles: normaliseMetric(data.photography_battles),
      competitions: normaliseMetric(data.competitions),
      exhibitions: normaliseMetric(data.exhibitions),
      approved: normaliseMetric(data.approved),
      rejected: normaliseMetric(data.rejected),
      trend: normaliseSeries(data.trend)
    };

    return state.submissions;
  };

  /* ---------------------------------------------------------
     COMPETITION ANALYTICS
  --------------------------------------------------------- */

  Analytics.getCompetitionAnalytics = async function () {
    await requireUser();

    const data = unwrapObject(
      await callRPC(RPC.COMPETITIONS, getRangeParams())
    );

    state.competitions = {
      total: normaliseMetric(data.total),
      active: normaliseMetric(data.active),
      completed: normaliseMetric(data.completed),
      entries: normaliseMetric(data.entries),
      participants: normaliseMetric(data.participants),
      categoryBreakdown: normaliseSeries(data.category_breakdown),
      trend: normaliseSeries(data.trend)
    };

    return state.competitions;
  };

  /* ---------------------------------------------------------
     EXHIBITION ANALYTICS
  --------------------------------------------------------- */

  Analytics.getExhibitionAnalytics = async function () {
    await requireUser();

    const data = unwrapObject(
      await callRPC(RPC.EXHIBITIONS, getRangeParams())
    );

    state.exhibitions = {
      total: normaliseMetric(data.total),
      published: normaliseMetric(data.published),
      entries: normaliseMetric(data.entries),
      featured: normaliseMetric(data.featured),
      contributors: normaliseMetric(data.contributors),
      trend: normaliseSeries(data.trend)
    };

    return state.exhibitions;
  };

  /* ---------------------------------------------------------
     EDITORIAL ANALYTICS
  --------------------------------------------------------- */

  Analytics.getEditorialAnalytics = async function () {
    await requireUser();

    const data = unwrapObject(
      await callRPC(RPC.EDITORIAL, getRangeParams())
    );

    state.editorial = {
      articles: normaliseMetric(data.articles),
      published: normaliseMetric(data.published),
      drafts: normaliseMetric(data.drafts),
      views: normaliseMetric(data.views),
      readingListSaves: normaliseMetric(data.reading_list_saves),
      categoryBreakdown: normaliseSeries(data.category_breakdown),
      trend: normaliseSeries(data.trend)
    };

    return state.editorial;
  };

  /* ---------------------------------------------------------
     DEPARTMENT ANALYTICS
  --------------------------------------------------------- */

  /**
   * Director department analytics.
   *
   * Department access is verified inside the database.
   * Passing a department ID does not grant access to it.
   */
  Analytics.getDepartmentAnalytics = async function (
    departmentId
  ) {
    await requireUser();

    const id = cleanText(departmentId, 100);

    if (!id) {
      throw new Error("A department ID is required.");
    }

    const data = unwrapObject(
      await callRPC(RPC.DEPARTMENT, {
        p_department_id: id,
        ...getRangeParams()
      })
    );

    state.department = {
      department: cleanText(data.department, 100),
      tasks: normaliseMetric(data.tasks),
      completedTasks: normaliseMetric(data.completed_tasks),
      moderators: normaliseMetric(data.moderators),
      submissions: normaliseMetric(data.submissions),
      activities: normaliseMetric(data.activities),
      competitions: normaliseMetric(data.competitions),
      trend: normaliseSeries(data.trend)
    };

    return state.department;
  };

  /* ---------------------------------------------------------
     LOAD DASHBOARD DATA
  --------------------------------------------------------- */

  /**
   * Admin overview: loads all platform analytics sections.
   *
   * Every RPC must independently verify Admin access.
   */
  Analytics.loadAdminDashboard = async function () {
    await requireUser();

    const results = await Promise.all([
      Analytics.getPlatformOverview(),
      Analytics.getMembershipAnalytics(),
      Analytics.getEngagementAnalytics(),
      Analytics.getSubmissionAnalytics(),
      Analytics.getCompetitionAnalytics(),
      Analytics.getExhibitionAnalytics(),
      Analytics.getEditorialAnalytics()
    ]);

    return {
      platform: results[0],
      membership: results[1],
      engagement: results[2],
      submissions: results[3],
      competitions: results[4],
      exhibitions: results[5],
      editorial: results[6]
    };
  };

  /**
   * Director dashboard: loads only authorised department data.
   */
  Analytics.loadDirectorDashboard = async function (
    departmentId
  ) {
    const department = await Analytics.getDepartmentAnalytics(
      departmentId
    );

    return { department };
  };

  /* ---------------------------------------------------------
     METRIC RENDERING
  --------------------------------------------------------- */

  Analytics.renderMetric = function (
    container,
    label,
    metric
  ) {
    const target =
      typeof container === "string"
        ? document.querySelector(container)
        : container;

    if (!target) {
      throw new Error("Metric container was not found.");
    }

    const value = normaliseMetric(metric);

    const changeClass =
      value.change > 0
        ? "analytics-positive"
        : value.change < 0
          ? "analytics-negative"
          : "analytics-neutral";

    target.innerHTML = `
      <article class="analytics-metric-card">
        <span class="analytics-metric-label">
          ${escapeHTML(label)}
        </span>

        <strong class="analytics-metric-value">
          ${escapeHTML(formatNumber(value.total))}
        </strong>

        <span class="${changeClass}">
          ${escapeHTML(formatPercentage(value.change))}
        </span>
      </article>
    `;
  };

  Analytics.renderMetricGrid = function (
    container,
    metrics
  ) {
    const target =
      typeof container === "string"
        ? document.querySelector(container)
        : container;

    if (!target) {
      throw new Error("Metric grid container was not found.");
    }

    const items = Array.isArray(metrics) ? metrics : [];

    target.innerHTML = items.map(item => {
      const metric = normaliseMetric(item.metric);

      return `
        <article class="analytics-metric-card">
          <span class="analytics-metric-label">
            ${escapeHTML(item.label)}
          </span>

          <strong class="analytics-metric-value">
            ${escapeHTML(formatNumber(metric.total))}
          </strong>

          <span>
            ${escapeHTML(formatPercentage(metric.change))}
          </span>
        </article>
      `;
    }).join("");
  };

  /* ---------------------------------------------------------
     CHART.JS INTEGRATION
  --------------------------------------------------------- */

  /**
   * Chart.js must be loaded separately.
   *
   * Example:
   * <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
   *
   * Data passed to this method should be aggregate data returned
   * by the authorised analytics RPC.
   */
  Analytics.renderLineChart = function (
    canvas,
    label,
    series,
    options
  ) {
    if (!window.Chart) {
      throw new Error("Chart.js has not been loaded.");
    }

    const target =
      typeof canvas === "string"
        ? document.querySelector(canvas)
        : canvas;

    if (!target) {
      throw new Error("Chart canvas was not found.");
    }

    const settings = options || {};
    const chartKey = settings.key || target.id || "default";

    if (state.charts[chartKey]) {
      state.charts[chartKey].destroy();
    }

    const values = normaliseSeries(series);

    state.charts[chartKey] = new window.Chart(target, {
      type: "line",
      data: {
        labels: values.map(item => item.label),
        datasets: [{
          label: cleanText(label, 100),
          data: values.map(item => item.value),
          borderWidth: 2,
          tension: 0.3,
          fill: false
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          intersect: false,
          mode: "index"
        },
        plugins: {
          legend: {
            display: true
          }
        },
        scales: {
          y: {
            beginAtZero: true
          }
        }
      }
    });

    return state.charts[chartKey];
  };

  Analytics.renderBarChart = function (
    canvas,
    label,
    series,
    options
  ) {
    if (!window.Chart) {
      throw new Error("Chart.js has not been loaded.");
    }

    const target =
      typeof canvas === "string"
        ? document.querySelector(canvas)
        : canvas;

    if (!target) {
      throw new Error("Chart canvas was not found.");
    }

    const settings = options || {};
    const chartKey = settings.key || target.id || "default";

    if (state.charts[chartKey]) {
      state.charts[chartKey].destroy();
    }

    const values = normaliseSeries(series);

    state.charts[chartKey] = new window.Chart(target, {
      type: "bar",
      data: {
        labels: values.map(item => item.label),
        datasets: [{
          label: cleanText(label, 100),
          data: values.map(item => item.value),
          borderWidth: 1
        }]
      },
      