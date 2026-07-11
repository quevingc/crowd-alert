# Paunawa — Crowdsourced Real-Time Emergency Reporting

A free, open, crowdsourced platform for reporting and tracking emergencies
(floods, earthquakes, fires, storms, landslides, armed conflict, and other
hazards) on a live map — plus a publicly editable directory of evacuation
centers, hospitals, and safe points — with a tamper-evident audit trail on
every edit.

**Stack:** HTML/CSS/JS (frontend) · Leaflet + OpenStreetMap (map) ·
Google Apps Script + Google Sheets (backend/database) · GitHub Pages (hosting)

---

## 1. Project structure

```
emergency-report-app/
├── index.html                 # Single-page app shell
├── manifest.json              # PWA manifest
├── service-worker.js          # PWA offline app-shell caching
├── css/
│   └── style.css              # All styling (design tokens, components, responsive)
├── js/
│   ├── config.js              # ⚠️ Set your Apps Script URL here
│   ├── utils.js                # Shared helpers (geolocation, validation, spam checks…)
│   ├── blockchain.js          # Client-side hash-chain verification
│   ├── api.js                  # Fetch wrapper for the Apps Script backend
│   ├── offline.js             # IndexedDB offline report queue + auto-sync
│   ├── theme.js                # Dark / light mode
│   ├── i18n.js                 # Multi-language strings (en, es, fr, ar, tl)
│   ├── notifications.js       # Browser notifications for nearby incidents
│   ├── map.js                  # Leaflet map, markers, clustering, heatmap, routing
│   ├── reports.js             # Incident report submit/edit/upvote/export logic
│   ├── facilities.js          # Public facility submit/edit/upvote/history logic
│   ├── dashboard.js           # Dashboard charts & lists (Chart.js)
│   ├── sos.js                  # One-tap SOS mode
│   ├── admin.js                # Moderation panel logic
│   └── app.js                  # App bootstrap — wires everything together
├── icons/                     # PWA icons
├── gas/                        # Google Apps Script backend (copy into Apps Script editor)
│   ├── Code.gs                 # doGet/doPost router
│   ├── Setup.gs                 # One-time sheet creation script
│   ├── Utils.gs                 # Shared sheet helpers
│   ├── Reports.gs               # Incident report CRUD
│   ├── Facilities.gs            # Facility CRUD (public submit/edit/upvote/moderate)
│   ├── Ratings.gs               # Rating submission
│   ├── Users.gs                 # Anonymous user registry
│   ├── Blockchain.gs            # Server-side hash-chain audit trail
│   └── Dashboard.gs             # Aggregated stats endpoint
└── docs/
    ├── DEPLOYMENT.md            # Step-by-step deployment guide
    ├── API.md                    # REST-style endpoint reference
    └── SHEETS_SCHEMA.md          # Google Sheets schema reference
```

## 2. Quick start

1. **Backend:** Create a new Google Sheet → Extensions → Apps Script. Copy
   all files from `gas/` into the Apps Script editor (one .gs file each).
   Run `setupSpreadsheet()` once to create the sheet tabs. Deploy as a
   **Web app** (Execute as: Me, Who has access: Anyone). Copy the `/exec` URL.
   Full details in [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).
2. **Frontend:** Paste this URL into `js/config.js` → `CONFIG.API_URL`.
    "https://script.google.com/macros/s/AKfycbypBJ6AuNVfNoP2_17GHheU9xfS5GBoFjmB4JrNwlwcV4tBupnMtNtJktz3-JVf0vE2/exec"
3. **Hosting:** Push this folder to a GitHub repository and enable
   GitHub Pages (Settings → Pages → Deploy from branch → `/ (root)`).
4. Open the published GitHub Pages URL. Change the default admin PIN in the
   `Settings` sheet (`adminPin`, default `changeme123`) immediately.

### Redeploying after any change

Two independent things need to be redeployed after edits, and it's easy to
update one and forget the other:

- **Frontend files** (`index.html`, `css/`, `js/`) → just commit and push to
  GitHub; Pages rebuilds automatically.
- **Backend files** (`gas/*.gs`) → editing them in the Apps Script editor is
  **not enough**. You must go to **Deploy → Manage deployments → (pencil
  icon) → New version → Deploy** to push the change live to your existing
  `/exec` URL. If you forget this step, the live API keeps running the old
  code and you'll see errors like `X is not defined` for anything new.

## 3. Feature checklist

**Core — incident reports**
- Interactive Leaflet map, colored by emergency type & status, with clustering and heatmap
- Report create / edit with full version history (`Updates` sheet)
- Ratings (accuracy, authenticity, usefulness) + community upvotes
- Dashboard: active incidents, counts by type, 14-day timeline, recent & most-verified reports
- Search, filters, dark/light mode, responsive mobile-first UI
- Image upload with in-browser resizing, gallery + lightbox-style preview
- CSV / JSON export, shareable report links with QR codes
- Browser notifications for nearby active incidents

**Facilities — publicly submittable**
- Anyone can add an evacuation center, hospital, or community safe point
  from the **Facilities** tab — not just admins
- Same treatment as incident reports: GPS or pin-on-map location, photos,
  optional capacity/contact/description, optional alias
- Editing with full field-level version history
- Community verify/upvote with a simple confidence score
- Clickable map markers open the same detail view as the Facilities list
- Shareable links with QR codes (`?facility=ID` deep links)
- Duplicate-facility warning when something similar already exists nearby
- Simple straight-line "Nearest Safe Zone" routing from any incident report

**Tamper-evident audit trail**
- Every create/update/moderate/rate/upvote action — for both reports *and*
  facilities — appends a hash-chain block (`Blockchain` sheet): previous
  hash, current hash, timestamp, editor ID, action. Verifiable both
  server-side and client-side (`js/blockchain.js` recomputes and checks
  every link).

**Public-benefit additions**
- Offline report queue (IndexedDB) that auto-syncs when back online
- Duplicate-report detection (same type, close in time & space)
- Confidence score blending upvotes + average ratings
- Emergency contact directory + SOS one-tap mode
- QR code sharing, multi-language UI, WCAG-minded accessibility (skip link,
  focus states, semantic roles, reduced-motion support)
- PWA support (installable, offline app shell)
- Spam heuristics + spreadsheet-formula-injection sanitization
- Admin moderation dashboard (PIN-gated: hide / resolve / flag reports and
  facilities, view audit trail)

## 4. Notes & honest limitations

- **"Real-time"** here means polling every 30 seconds (`App.startAutoRefresh`
  in `js/app.js`) — Apps Script Web Apps don't support WebSockets. For true
  push updates, swap in Firebase Realtime Database or a small dedicated
  backend later; the frontend's `Api` module is written to be swappable.
- **Blockchain** is a single-ledger SHA-256 hash chain stored in a Sheet, not
  a distributed blockchain — it detects tampering, it doesn't prevent an
  admin with sheet access from rewriting history undetected if they also
  regenerate every downstream hash. It's the right amount of "blockchain"
  for this use case; say so plainly if asked.
- **Reports and facilities share some sheet columns.** The `Images`,
  `Updates`, and `Blockchain` sheets all use a generic `reportId` column as
  their foreign key — for a facility row, that column simply holds the
  `facilityId` instead. It's a parent-record key, not report-specific; see
  [`docs/SHEETS_SCHEMA.md`](docs/SHEETS_SCHEMA.md) for details.
- **Admin auth** is a PIN stored in the Settings sheet for simplicity. Swap
  in Google OAuth (`Session.getActiveUser()` restricted to a Workspace
  domain) before using this for anything beyond a prototype/pilot.
- Anyone can submit or edit a facility — there's no ownership model, so
  edit wars are possible on high-traffic entries. The version history and
  audit trail make this visible and reversible, but nothing currently
  prevents it proactively; add a cooldown or moderation queue if that
  becomes a problem for your deployment.
- Google Sheets is a fine database for a pilot / community deployment
  (thousands of rows); migrate to Firestore/BigQuery if you outgrow it.

## 5. License

Provided as-is for public-benefit / civic use. Attribute OpenStreetMap
per their license when displaying the map.
