# Google Sheets Schema

Created automatically by `gas/Setup.gs` → `setupSpreadsheet()`. Each sheet
tab's first row is a frozen header row matching the columns below.

## Reports
| Column | Type | Notes |
|---|---|---|
| reportId | string | Primary key, e.g. `RPT-A1B2C3D4` |
| timestamp | ISO datetime | When first reported |
| lastUpdated | ISO datetime | Bumped on every edit |
| type | enum | flood, earthquake, conflict, fire, landslide, storm, other |
| status | enum | Active, Monitoring, Resolved |
| lat, lng | number | Decimal degrees |
| description | string | Sanitized against formula injection |
| reporterAlias | string | Optional, defaults to "Anonymous" |
| editorId | string | Anonymous device UUID of original reporter |
| upvotes | number | Community verification count |
| avgAccuracy, avgAuthenticity, avgUsefulness | number (1–5) | Denormalized rating averages |
| flagged | boolean | Set by moderation |
| hidden | boolean | Hidden reports are excluded from `getReports` |
| imageCount | number | Count of attached images |

## Updates
Field-level version history — one row per changed field per edit.
| Column | Notes |
|---|---|
| updateId | Primary key |
| reportId | Foreign key → Reports |
| timestamp | When the change was made |
| editorId, editorAlias | Who made the change |
| fieldChanged | e.g. `status`, `description`, `lat` |
| oldValue, newValue | Before/after values |

## Ratings
| Column | Notes |
|---|---|
| ratingId | Primary key |
| reportId | Foreign key → Reports |
| userId | Anonymous device UUID |
| accuracy, authenticity, usefulness | 1–5 |
| timestamp | |

## Users
| Column | Notes |
|---|---|
| userId | Primary key (anonymous device UUID) |
| alias | Display name, optional |
| createdAt | |
| role | `reporter` or `admin` (informational only — auth is PIN-based) |
| reportsSubmitted | Running count |

## Blockchain
The hash-chain audit ledger. One row = one immutable block.
| Column | Notes |
|---|---|
| blockId | Primary key |
| reportId | Foreign key → Reports |
| action | CREATE, UPDATE, UPVOTE, RATE, MODERATE:hide, etc. |
| editorId | Who performed the action |
| timestamp | |
| previousHash | Hash of the prior block for this report ("GENESIS" if first) |
| currentHash | SHA-256 of `previousHash|reportId|action|editorId|timestamp|payload` |
| payloadSnapshot | JSON string of what changed |

## Settings
Simple key/value store.
| key | value |
|---|---|
| adminPin | PIN for the admin panel — **change from the default immediately** |
| appName | Display name |

## Facilities
| Column | Notes |
|---|---|
| facilityId | Primary key |
| name | |
| type | `evacuation` or `hospital` |
| lat, lng | |
| capacity | Optional, evacuation centers only |
| contact | Optional phone/contact |

## Images
Stored separately from Reports to keep row sizes manageable.
| Column | Notes |
|---|---|
| imageId | Primary key |
| reportId | Foreign key → Reports |
| uploadedAt | |
| base64OrUrl | Resized base64 data URL (client resizes before upload) |
| caption | Optional |
