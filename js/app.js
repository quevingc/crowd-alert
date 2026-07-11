/**
 * app.js
 * Application bootstrap: initializes modules, binds UI events, and
 * orchestrates data flow between the map, forms, and dashboard.
 */

const App = {
  refreshTimer: null,
  selectedLatLng: null,

  async init() {
    Theme.init();
    I18N.init();
    MapModule.init("map");
    OfflineQueue.init(App.onOfflineSync);
    Notifications.init();

    App.bindNav();
    App.bindReportForm();
    App.bindFilters();
    App.bindModals();
    App.bindShareFromURL();
    App.bindSOS();
    App.bindThemeAndLang();

    await App.refreshAll();
    App.startAutoRefresh();
    App.registerServiceWorker();

    document.addEventListener("click", App.delegateClicks);
    window.addEventListener("focus-report", (e) => App.openReportDetail(e.detail));
  },

  async refreshAll() {
    await Reports.loadAll();
    App.renderCurrentView();
    Notifications.checkNearby(Reports.all);
    App.updateOfflineBadge();
    try {
      const facilities = await Api.getFacilities();
      MapModule.renderFacilities(facilities || []);
      App.facilities = facilities || [];
    } catch {
      App.facilities = [];
    }
  },

  startAutoRefresh() {
    // Poll every 30s for near-real-time updates (Apps Script has no websockets)
    App.refreshTimer = setInterval(() => App.refreshAll(), 30000);
  },

  renderCurrentView() {
    const list = Reports.applyFilters();
    MapModule.renderReports(list, App.openReportDetail);
    Dashboard.render(Reports.all);
    App.renderReportListPanel(list);
    const heatToggle = document.getElementById("heatmapToggle");
    if (heatToggle) MapModule.toggleHeatmap(list, heatToggle.checked);
  },

  renderReportListPanel(list) {
    const container = document.getElementById("reportListPanel");
    if (!container) return;
    container.innerHTML =
      list
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .map((r) => Dashboard.reportListItem(r))
        .join("") || `<p class="empty-state">No reports match your filters.</p>`;
  },

  // ---------------- Navigation ----------------
  bindNav() {
    document.querySelectorAll("[data-view]").forEach((btn) => {
      btn.addEventListener("click", () => App.switchView(btn.getAttribute("data-view")));
    });
  },

  switchView(view) {
    document.querySelectorAll(".view").forEach((v) => v.classList.remove("view-active"));
    document.getElementById(`view-${view}`)?.classList.add("view-active");
    document.querySelectorAll("[data-view]").forEach((b) =>
      b.classList.toggle("nav-active", b.getAttribute("data-view") === view)
    );
    if (view === "map") setTimeout(() => MapModule.map.invalidateSize(), 100);
    if (view === "admin") App.loadAdminPanel();
    if (view === "facilities") App.renderFacilitiesList();
  },

  renderFacilitiesList() {
    const container = document.getElementById("facilitiesList");
    if (!container) return;
    const facilities = App.facilities || [];
    if (facilities.length === 0) {
      container.innerHTML = `<p class="empty-state">No facilities registered yet. Admins can add rows to the Facilities sheet.</p>`;
      return;
    }
    container.innerHTML = facilities
      .map((f) => {
        const info = CONFIG.FACILITIES[f.type] || CONFIG.FACILITIES.evacuation;
        return `
        <div class="admin-row">
          <span>${info.icon} <strong>${Utils.escapeHTML(f.name)}</strong></span>
          <span class="muted">${info.label}${f.capacity ? ` · Capacity ${f.capacity}` : ""}${
          f.contact ? ` · ${Utils.escapeHTML(f.contact)}` : ""
        }</span>
        </div>`;
      })
      .join("");
  },

  // ---------------- Report Form ----------------
  bindReportForm() {
    const form = document.getElementById("reportForm");
    if (!form) return;

    document.getElementById("openReportForm")?.addEventListener("click", () => App.openReportForm());
    document.getElementById("closeReportForm")?.addEventListener("click", () => App.closeReportForm());

    document.getElementById("useGpsBtn")?.addEventListener("click", async () => {
      try {
        const pos = await Utils.getCurrentPosition();
        App.setSelectedLocation(pos.lat, pos.lng);
      } catch (e) {
        alert("Could not get GPS location: " + e.message);
      }
    });

    document.getElementById("pinOnMapBtn")?.addEventListener("click", async () => {
      App.closeReportForm(true);
      alert("Tap anywhere on the map to drop a pin for this report.");
      const { lat, lng } = await MapModule.enablePinDrop();
      App.setSelectedLocation(lat, lng);
      App.openReportForm();
    });

    document.getElementById("imageInput")?.addEventListener("change", App.handleImageSelect);

    form.addEventListener("submit", App.handleFormSubmit);
  },

  openReportForm() {
    Reports.editingReportId = null;
    document.getElementById("reportFormTitle").textContent = I18N.t("reportIncident");
    document.getElementById("reportForm").reset();
    Reports.currentImages = [];
    App.renderImagePreviews();
    document.getElementById("reportFormModal")?.classList.add("modal-open");
  },

  closeReportForm(silent = false) {
    document.getElementById("reportFormModal")?.classList.remove("modal-open");
    MapModule.disablePinDrop();
  },

  setSelectedLocation(lat, lng) {
    App.selectedLatLng = { lat, lng };
    const label = document.getElementById("selectedLocationLabel");
    if (label) label.textContent = `📍 ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  },

  async handleImageSelect(e) {
    const files = Array.from(e.target.files || []).slice(0, CONFIG.MAX_IMAGES_PER_REPORT);
    for (const file of files) {
      if (file.size > CONFIG.MAX_IMAGE_SIZE_MB * 1024 * 1024) {
        alert(`${file.name} exceeds ${CONFIG.MAX_IMAGE_SIZE_MB}MB and was skipped.`);
        continue;
      }
      try {
        const base64 = await Utils.fileToResizedBase64(file);
        Reports.currentImages.push(base64);
      } catch {
        console.warn("Could not process image", file.name);
      }
    }
    App.renderImagePreviews();
  },

  renderImagePreviews() {
    const container = document.getElementById("imagePreviews");
    if (!container) return;
    container.innerHTML = Reports.currentImages
      .map(
        (src, i) =>
          `<div class="img-preview"><img src="${src}" alt="Preview ${i + 1}"/><button type="button" data-remove-img="${i}">✕</button></div>`
      )
      .join("");
    container.querySelectorAll("[data-remove-img]").forEach((btn) => {
      btn.addEventListener("click", () => {
        Reports.currentImages.splice(parseInt(btn.dataset.removeImg, 10), 1);
        App.renderImagePreviews();
      });
    });
  },

  async handleFormSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const description = form.description.value;
    const type = form.type.value;
    const reporterAlias = form.reporterAlias.value;

    if (!App.selectedLatLng) {
      alert("Please set a location using GPS or by pinning on the map.");
      return;
    }

    // Duplicate detection warning
    const dupes = Reports.findPossibleDuplicates({ type, ...App.selectedLatLng });
    if (dupes.length > 0) {
      const proceed = confirm(
        `${dupes.length} similar report(s) already exist nearby in the last hour. Submit anyway?`
      );
      if (!proceed) return;
    }

    const submitBtn = form.querySelector('[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting…";

    try {
      if (Reports.editingReportId) {
        await Reports.update(Reports.editingReportId, {
          description,
          type,
          lat: App.selectedLatLng.lat,
          lng: App.selectedLatLng.lng,
          images: Reports.currentImages,
        });
      } else {
        const result = await Reports.submit({
          description,
          type,
          reporterAlias,
          lat: App.selectedLatLng.lat,
          lng: App.selectedLatLng.lng,
          images: Reports.currentImages,
        });
        if (result.offline) {
          App.toast(I18N.t("offlineQueued"));
        } else {
          App.toast("Report submitted. Thank you for helping your community stay safe.");
        }
      }
      App.closeReportForm();
      App.selectedLatLng = null;
      await App.refreshAll();
    } catch (err) {
      alert("Error: " + err.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = I18N.t("submit");
    }
  },

  // ---------------- Filters / Search ----------------
  bindFilters() {
    ["filterType", "filterStatus"].forEach((id) => {
      document.getElementById(id)?.addEventListener("change", App.renderCurrentView);
    });
    document
      .getElementById("searchInput")
      ?.addEventListener("input", Utils.debounce(App.renderCurrentView, 250));
    document.getElementById("heatmapToggle")?.addEventListener("change", App.renderCurrentView);
    document.getElementById("exportCsvBtn")?.addEventListener("click", () =>
      Reports.exportCSV(Reports.applyFilters())
    );
    document.getElementById("exportJsonBtn")?.addEventListener("click", () =>
      Reports.exportJSON(Reports.applyFilters())
    );
  },

  // ---------------- Report Detail Modal ----------------
  async openReportDetail(reportId) {
    const report = Reports.all.find((r) => r.reportId === reportId);
    if (!report) return;
    const modal = document.getElementById("reportDetailModal");
    const typeInfo = CONFIG.EMERGENCY_TYPES[report.type] || CONFIG.EMERGENCY_TYPES.other;
    const statusInfo = CONFIG.STATUS[report.status] || CONFIG.STATUS.Active;
    const confidence = Reports.computeConfidenceScore(report);

    document.getElementById("reportDetailBody").innerHTML = `
      <div class="detail-header">
        <span class="badge" style="background:${typeInfo.color}">${typeInfo.icon} ${typeInfo.label}</span>
        <span class="badge" style="background:${statusInfo.color}">${statusInfo.label}</span>
        <span class="badge-outline">Confidence: ${confidence}%</span>
      </div>
      <p>${Utils.escapeHTML(report.description)}</p>
      <div class="image-gallery">
        ${(report.images || []).map((src) => `<img src="${src}" class="gallery-img" alt="Report photo"/>`).join("")}
      </div>
      <ul class="detail-meta">
        <li><strong>Report ID:</strong> ${report.reportId}</li>
        <li><strong>Reported:</strong> ${Utils.formatDate(report.timestamp)}</li>
        <li><strong>Last updated:</strong> ${Utils.formatDate(report.lastUpdated)}</li>
        <li><strong>Reporter:</strong> ${Utils.escapeHTML(report.reporterAlias || "Anonymous")}</li>
        <li><strong>Upvotes:</strong> ${report.upvotes || 0}</li>
      </ul>
      <div class="detail-actions">
        <button id="upvoteBtn" data-report-id="${report.reportId}">✔ Verify / Upvote</button>
        <button id="rateBtn" data-report-id="${report.reportId}">⭐ Rate</button>
        <button id="editReportBtn" data-report-id="${report.reportId}">✎ Edit</button>
        <button id="historyBtn" data-report-id="${report.reportId}">🕘 History</button>
        <button id="shareBtn" data-report-id="${report.reportId}">🔗 Share</button>
        <button id="routeBtn" data-report-id="${report.reportId}">🧭 Nearest Safe Zone</button>
      </div>
      <div id="reportDetailExtra"></div>
    `;
    modal.classList.add("modal-open");
  },

  closeReportDetail() {
    document.getElementById("reportDetailModal")?.classList.remove("modal-open");
    document.getElementById("reportDetailExtra").innerHTML = "";
  },

  // ---------------- Modals / global click delegation ----------------
  bindModals() {
    document.querySelectorAll("[data-close-modal]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.target.closest(".modal")?.classList.remove("modal-open");
      });
    });
  },

  async delegateClicks(e) {
    const openReportEl = e.target.closest("[data-open-report]");
    if (openReportEl) {
      App.openReportDetail(openReportEl.getAttribute("data-open-report"));
      return;
    }

    if (e.target.id === "upvoteBtn") {
      try {
        await Reports.upvote(e.target.dataset.reportId);
        App.toast("Thanks for verifying this report!");
        await App.refreshAll();
        App.openReportDetail(e.target.dataset.reportId);
      } catch (err) {
        alert(err.message);
      }
      return;
    }

    if (e.target.id === "rateBtn") {
      App.showRatingForm(e.target.dataset.reportId);
      return;
    }

    if (e.target.id === "editReportBtn") {
      App.startEdit(e.target.dataset.reportId);
      return;
    }

    if (e.target.id === "historyBtn") {
      App.showHistory(e.target.dataset.reportId);
      return;
    }

    if (e.target.id === "shareBtn") {
      App.showShare(e.target.dataset.reportId);
      return;
    }

    if (e.target.id === "routeBtn") {
      App.showNearestSafeZone(e.target.dataset.reportId);
      return;
    }

    if (e.target.dataset.adminAction) {
      App.handleAdminAction(e.target.dataset.adminAction, e.target.dataset.reportId);
      return;
    }
  },

  showRatingForm(reportId) {
    const extra = document.getElementById("reportDetailExtra");
    extra.innerHTML = `
      <div class="rating-form">
        <label>Accuracy <input type="range" min="1" max="5" value="3" id="rateAccuracy"/></label>
        <label>Authenticity <input type="range" min="1" max="5" value="3" id="rateAuthenticity"/></label>
        <label>Usefulness <input type="range" min="1" max="5" value="3" id="rateUsefulness"/></label>
        <button id="submitRatingBtn">Submit Rating</button>
      </div>`;
    document.getElementById("submitRatingBtn").addEventListener("click", async () => {
      try {
        await Reports.rate(reportId, {
          accuracy: +document.getElementById("rateAccuracy").value,
          authenticity: +document.getElementById("rateAuthenticity").value,
          usefulness: +document.getElementById("rateUsefulness").value,
        });
        App.toast("Rating submitted. Thank you!");
        await App.refreshAll();
        App.openReportDetail(reportId);
      } catch (err) {
        alert(err.message);
      }
    });
  },

  startEdit(reportId) {
    const report = Reports.all.find((r) => r.reportId === reportId);
    if (!report) return;
    Reports.editingReportId = reportId;
    Reports.currentImages = [...(report.images || [])];
    App.closeReportDetail();
    document.getElementById("reportFormTitle").textContent = I18N.t("editReport");
    const form = document.getElementById("reportForm");
    form.description.value = report.description;
    form.type.value = report.type;
    form.reporterAlias.value = report.reporterAlias || "";
    App.setSelectedLocation(report.lat, report.lng);
    App.renderImagePreviews();
    document.getElementById("reportFormModal")?.classList.add("modal-open");
  },

  async showHistory(reportId) {
    const extra = document.getElementById("reportDetailExtra");
    extra.innerHTML = `<p>Loading audit trail…</p>`;
    try {
      const chain = await Reports.getHistory(reportId);
      const verification = await BlockchainClient.verifyChain(chain || []);
      extra.innerHTML = `
        <h4>${I18N.t("history")} ${
        verification.valid
          ? '<span class="badge" style="background:#43A047">✔ Verified Unbroken</span>'
          : '<span class="badge" style="background:#E53935">⚠ Tamper Detected</span>'
      }</h4>
        <ul class="history-list">
          ${(chain || [])
            .map(
              (b) => `<li>
                <strong>${b.action}</strong> by ${Utils.escapeHTML(b.editorId || "unknown")}
                <br/><small>${Utils.formatDate(b.timestamp)}</small>
                <br/><code>${BlockchainClient.shortHash(b.currentHash)}</code>
              </li>`
            )
            .join("")}
        </ul>`;
    } catch (e) {
      extra.innerHTML = `<p class="error">Could not load history: ${e.message}</p>`;
    }
  },

  showShare(reportId) {
    const link = Utils.buildShareLink(reportId);
    const extra = document.getElementById("reportDetailExtra");
    extra.innerHTML = `
      <div class="share-box">
        <input type="text" readonly value="${link}" id="shareLinkInput"/>
        <button id="copyShareLinkBtn">Copy</button>
        <div id="qrcodeContainer" style="margin-top:10px"></div>
      </div>`;
    document.getElementById("copyShareLinkBtn").addEventListener("click", async () => {
      await Utils.copyToClipboard(link);
      App.toast("Link copied!");
    });
    if (typeof QRCode !== "undefined") {
      new QRCode(document.getElementById("qrcodeContainer"), { text: link, width: 140, height: 140 });
    }
  },

  showNearestSafeZone(reportId) {
    const report = Reports.all.find((r) => r.reportId === reportId);
    if (!report || !App.facilities?.length) {
      App.toast("No facility data available.");
      return;
    }
    const nearest = MapModule.findNearestFacility(report.lat, report.lng, App.facilities);
    if (!nearest) return;
    App.closeReportDetail();
    App.switchView("map");
    MapModule.drawRoute([report.lat, report.lng], nearest.facility);
    App.toast(
      `Nearest: ${nearest.facility.name} (${nearest.distanceKm.toFixed(1)} km away)`
    );
  },

  bindShareFromURL() {
    const params = new URLSearchParams(window.location.search);
    const reportId = params.get("report");
    if (reportId) {
      setTimeout(() => App.openReportDetail(reportId), 800);
    }
  },

  // ---------------- SOS ----------------
  bindSOS() {
    document.getElementById("sosBtn")?.addEventListener("click", async () => {
      if (!confirm("Send an SOS report with your current location? Only use this for a genuine emergency.")) return;
      const btn = document.getElementById("sosBtn");
      btn.disabled = true;
      btn.textContent = "Sending…";
      const result = await SOS.trigger();
      btn.disabled = false;
      btn.textContent = "🆘 " + I18N.t("sosMode");
      if (result.success) {
        App.toast("SOS sent. Stay safe — help is being alerted.");
        App.showEmergencyContacts();
        await App.refreshAll();
      } else {
        alert("SOS failed: " + result.error);
      }
    });
  },

  showEmergencyContacts() {
    const modal = document.getElementById("contactsModal");
    if (!modal) return;
    document.getElementById("contactsList").innerHTML = SOS.emergencyContacts
      .map((c) => `<li><strong>${c.name}:</strong> ${c.number}</li>`)
      .join("");
    modal.classList.add("modal-open");
  },

  // ---------------- Admin ----------------
  async loadAdminPanel() {
    const panel = document.getElementById("adminPanel");
    if (!panel) return;
    if (!Admin.authenticated) {
      panel.innerHTML = `
        <div class="admin-login">
          <input type="password" id="adminPinInput" placeholder="Admin PIN"/>
          <button id="adminLoginBtn">Login</button>
        </div>`;
      document.getElementById("adminLoginBtn").addEventListener("click", async () => {
        const pin = document.getElementById("adminPinInput").value;
        const ok = await Admin.login(pin);
        if (ok) App.loadAdminPanel();
        else alert("Invalid PIN.");
      });
      return;
    }
    Admin.renderPanel(Reports.all, panel);
  },

  async handleAdminAction(action, reportId) {
    if (action === "history") {
      App.openReportDetail(reportId);
      setTimeout(() => App.showHistory(reportId), 300);
      return;
    }
    try {
      await Admin.moderate(reportId, action);
      App.toast("Action applied.");
      await App.refreshAll();
      App.loadAdminPanel();
    } catch (e) {
      alert(e.message);
    }
  },

  // ---------------- Theme / Language ----------------
  bindThemeAndLang() {
    // handled in Theme.init()/I18N.init(); placeholder for future extension
  },

  // ---------------- Offline ----------------
  async onOfflineSync(result) {
    if (result.synced > 0) {
      App.toast(`${result.synced} offline report(s) synced.`);
      await App.refreshAll();
    }
  },

  async updateOfflineBadge() {
    const count = await OfflineQueue.count();
    const badge = document.getElementById("offlineBadge");
    if (badge) {
      badge.style.display = count > 0 ? "inline-block" : "none";
      badge.textContent = count;
    }
  },

  // ---------------- Toast ----------------
  toast(message) {
    const el = document.getElementById("toast");
    if (!el) return;
    el.textContent = message;
    el.classList.add("toast-show");
    setTimeout(() => el.classList.remove("toast-show"), 3500);
  },

  // ---------------- PWA ----------------
  registerServiceWorker() {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("service-worker.js").catch((e) => {
        console.warn("Service worker registration failed:", e);
      });
    }
  },
};

document.addEventListener("DOMContentLoaded", App.init);
