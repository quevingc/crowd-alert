/**
 * api.js
 * Wrapper around fetch() for talking to the Google Apps Script Web App.
 *
 * IMPORTANT (GAS quirk): Apps Script Web Apps do not support custom
 * request headers well and trigger CORS preflight (OPTIONS) issues if you
 * send `Content-Type: application/json`. The convention used here is:
 *   - All calls are POST with `Content-Type: text/plain;charset=utf-8`
 *   - The JSON payload includes an `action` field the backend dispatches on
 *   - GET is used only for simple read-only calls with query params
 * This matches the router implemented in gas/Code.gs.
 */

const Api = {
  async post(action, payload = {}) {
    if (!CONFIG.API_URL || CONFIG.API_URL.includes("PASTE_YOUR")) {
      throw new Error(
        "API_URL is not configured yet. Set CONFIG.API_URL in js/config.js to your deployed Apps Script Web App URL."
      );
    }
    // `action` is the reserved dispatch key (see gas/Code.gs router). Guard
    // against a payload field of the same name silently clobbering it.
    if ("action" in payload) {
      throw new Error(
        `Api.post payload must not contain a reserved "action" field (action="${action}").`
      );
    }
    const body = JSON.stringify({ action, ...payload });
    const res = await fetch(CONFIG.API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body,
    });
    if (!res.ok) throw new Error(`Network error: ${res.status}`);
    const json = await res.json();
    if (json.error) throw new Error(json.error);
    return json.data;
  },

  async get(action, params = {}) {
    if (!CONFIG.API_URL || CONFIG.API_URL.includes("PASTE_YOUR")) {
      throw new Error(
        "API_URL is not configured yet. Set CONFIG.API_URL in js/config.js to your deployed Apps Script Web App URL."
      );
    }
    const url = new URL(CONFIG.API_URL);
    url.searchParams.set("action", action);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const res = await fetch(url.toString(), { method: "GET" });
    if (!res.ok) throw new Error(`Network error: ${res.status}`);
    const json = await res.json();
    if (json.error) throw new Error(json.error);
    return json.data;
  },

  // ---- Reports ----
  createReport(report) {
    return Api.post("createReport", { report });
  },
  getReports(filters = {}) {
    return Api.post("getReports", { filters });
  },
  getReport(reportId) {
    return Api.post("getReport", { reportId });
  },
  updateReport(reportId, changes, editorId, editorAlias) {
    return Api.post("updateReport", { reportId, changes, editorId, editorAlias });
  },
  upvoteReport(reportId, userId) {
    return Api.post("upvoteReport", { reportId, userId });
  },
  uploadImageMeta(reportId, imageMeta) {
    return Api.post("uploadImageMeta", { reportId, imageMeta });
  },

  // ---- Ratings ----
  submitRating(reportId, userId, ratings) {
    // ratings = { accuracy, authenticity, usefulness }
    return Api.post("submitRating", { reportId, userId, ratings });
  },

  // ---- Dashboard ----
  getDashboardStats() {
    return Api.post("getDashboardStats", {});
  },

  // ---- Audit trail ----
  getAuditHistory(reportId) {
    return Api.post("getAuditHistory", { reportId });
  },

  // ---- Users ----
  registerUser(user) {
    return Api.post("registerUser", { user });
  },

  // ---- Facilities (evacuation centers / hospitals / community safe points) ----
  getFacilities() {
    return Api.post("getFacilities", {});
  },
  createFacility(facility) {
    return Api.post("createFacility", { facility });
  },
  updateFacility(facilityId, changes, editorId, editorAlias) {
    return Api.post("updateFacility", { facilityId, changes, editorId, editorAlias });
  },
  upvoteFacility(facilityId, userId) {
    return Api.post("upvoteFacility", { facilityId, userId });
  },
  moderateFacility(facilityId, moderatorId, modAction, reason, pin) {
    return Api.post("moderateFacility", { facilityId, moderatorId, modAction, reason, pin });
  },

  // ---- Admin moderation ----
  moderateReport(reportId, moderatorId, modAction, reason, pin) {
    return Api.post("moderateReport", { reportId, moderatorId, modAction, reason, pin });
  },
};
