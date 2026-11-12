# Sprint 4 — API contract (proposal for S4-D02)

Status: **draft for review** · Prepared 11 Nov 2026 · Matches the clickable prototypes in `golf_web_design` and `golf_flutter_design` (branch `sprint-4`).
Machine-readable version: [`openapi-sprint-4.yaml`](./openapi-sprint-4.yaml).

This contract covers the new and changed endpoints the prototypes assume. Final routes must be reconciled with the
existing backend contracts (`docs/frontend-api-requests-responses.md`, `docs/team-issues-openapi.json`) before tickets
S4-B01…B12 start. Where a rule is still a product decision it is marked **D01**, **D03**, etc.

---

## 0. Conventions (all endpoints)

| Topic | Rule |
|---|---|
| Base path | `/api/v1` |
| Auth | `Authorization: Bearer <access token>`; identity always comes from the token, never from the body |
| Errors | `{ "code": "STRING_CODE", "message": "Human text", "traceId": "…", "details": { … } }` — see §9 for codes |
| Concurrency | Mutable resources return `version` (integer). Writes send `version`; a stale write returns **409 `STALE_VERSION`** with the current resource so the client reloads before retrying |
| Idempotency | Create/send operations accept `Idempotency-Key` (UUID, client-generated per user action). Same key + same body ⇒ same response, no second effect. Same key + different body ⇒ **422 `IDEMPOTENCY_KEY_REUSED`** |
| Times | ISO-8601 with offset (`2026-10-04T08:10:00-04:00`). Tournament-local times also carry `timeZone` |
| Enums | UPPER_SNAKE in JSON (`PICKUP`, `MARKER_REQUIRED`) |
| Paging | `?page=0&size=20` → `{ items, page, size, total }` |

---

## 1. Scoring (SC1–SC3, CS1)

### 1.1 Hole outcome model (SC1)

A hole score is no longer just a number. Pickups never store a fake stroke count.

```json
{ "holeNumber": 5, "outcome": "STROKES", "strokes": 6 }
{ "holeNumber": 6, "outcome": "PICKUP",  "strokes": null }
{ "holeNumber": 7, "outcome": "MISSING", "strokes": null }
```

| outcome | Meaning | Stableford points | Gross / net |
|---|---|---|---|
| `STROKES` | Holed out, `strokes` 1–15 (ST3 may make the limit configurable) | Calculated | Counted |
| `PICKUP` | Intentional no-hole-out. **Stableford formats only** — rejected with `422 PICKUP_NOT_ALLOWED` in stroke play | 0, hole counts as played | `null` (never 0) |
| `MISSING` | Nothing recorded yet | — (card incomplete) | — |

### 1.2 Tournament scoring settings — marker policy (SC2)

`PATCH /tournaments/{tournamentId}` — `scoring` object gains:

```json
{ "scoring": { "markerPolicy": "MARKER_REQUIRED", "…": "existing fields" } }
```

| Value | Verification rule |
|---|---|
| `MARKER_REQUIRED` (default; legacy tournaments migrate to this — **D01**) | Every counting hole needs the marker's record **and** zero unresolved discrepancies |
| `MARKER_OPTIONAL` | Discrepancies still block; holes the marker skipped don't |

### 1.3 Scorecard read

`GET /tournaments/{tid}/rounds/{round}/scorecards/{entryId}`

```json
{
  "entryId": "t9-e3", "round": 1, "state": "SUBMITTED", "version": 14,
  "cardHolderId": "t9-e3",
  "holes":       [{ "holeNumber": 1, "outcome": "STROKES", "strokes": 5 }, { "holeNumber": 2, "outcome": "PICKUP", "strokes": null }],
  "markerHoles": [{ "holeNumber": 1, "outcome": "STROKES", "strokes": 5 }, { "holeNumber": 2, "outcome": "STROKES", "strokes": 7 }],
  "marker": { "entryId": "t9-e7", "name": "Henry Kim", "roundStatus": "PLAYING" },
  "settledHoles": [{ "holeNumber": 2, "by": { "name": "Helen Brooks", "role": "OFFICIAL" }, "reason": "Marker confirmed the pickup", "at": "…" }],
  "verification": {
    "policy": "MARKER_REQUIRED",
    "ready": false,
    "blankHoles": [],
    "unconfirmedHoles": [9],
    "discrepancyHoles": [2],
    "noMarker": false
  },
  "override": null,
  "totals": { "thru": 9, "gross": 41, "net": 37, "points": 18, "pickups": 1 }
}
```

- `override` (when set): `{ "by": {…}, "at": "…", "reason": "…", "openItems": ["Marker hasn't confirmed hole 9"] }` — the card is **never** reported as marker-confirmed.
- Scramble (SC3): `cardHolderId` is the team's card; every member's GET returns the same holes and `version`.

### 1.4 Player writes their own hole

`PUT /tournaments/{tid}/rounds/{round}/scorecards/{entryId}/holes/{holeNumber}`
Body `{ "outcome": "PICKUP" | "STROKES", "strokes": 6, "version": 14 }` → 200 scorecard.
Errors: `403 NOT_YOUR_CARD`, `409 STALE_VERSION`, `409 CARD_LOCKED` (submitted/verified/signed off), `409 PLAY_SUSPENDED`, `422 PICKUP_NOT_ALLOWED`, `422 STROKES_OUT_OF_RANGE`.

Scramble: any team member may write the team card; response includes `"enteredBy": { "entryId", "name", "at" }` per hole. Writes are atomic per hole and audited.

### 1.5 Marker writes their record

`PUT /tournaments/{tid}/rounds/{round}/scorecards/{entryId}/marker-holes/{holeNumber}` — same body.
Only the **current assigned marker** may write. `403 NOT_ASSIGNED_MARKER`, `403 SELF_CONFIRMATION` (marker = player). Marker replacement keeps earlier marker records (history).

### 1.6 Submit, verify, override, correct, unlock

| Method & path | Who | Body | Notes |
|---|---|---|---|
| `POST …/scorecards/{entryId}/submit` | Player (scramble: any member, submits the team card) | `{ version }` | Blank holes allowed (T-09); `MISSING` ≠ pickup |
| `POST …/scorecards/verify` | Official, organiser, admin | `{ entryIds: [], version map }` | Server re-checks `verification.ready`; non-ready cards are returned in `rejected[]` with reasons |
| `POST …/scorecards/{entryId}/verify-override` | Official, organiser, admin (**D01**: confirm officials may) | `{ reason, version }` | `reason` required. Stored with actor; card shows "override" |
| `POST …/scorecards/{entryId}/corrections` | Official, organiser, admin | `{ holeNumber, outcome, strokes, reason, incidentId?, version }` | Sets the player value; if the marker's record differs the hole is **settled** (shown as such, not as marker-confirmed). Verified card → back to `SUBMITTED`; overrides cleared; sign-off and results invalidated |
| `POST …/scorecards/{entryId}/unlock` | Official, organiser, admin | `{ reason, version }` | Refused after round sign-off |

### 1.7 Leaderboard / results additions

Leaderboard rows add `pickups` (count) and `points`; team rows (Four-Ball) add `countedBy[]` per hole. Scramble rows read the team card only.

### 1.8 Status consistency & suspension (CS1, B09)

Round status enum: `PLAYING | WD | DQ | NS | DNF` (registration withdrawal stays separate: `registrationStatus: REGISTERED | WITHDRAWN`).
Tournament / round DTOs add:

```json
{ "suspension": { "state": "SUSPENDED", "reason": "Lightning in the area", "note": "…", "by": { "name": "…" }, "at": "…" } }
```

`state`: `NONE | SUSPENDED`. Clients refresh on reconnect; writes during suspension return `409 PLAY_SUSPENDED`.
Partner WD/DQ/NS/DNF outcomes for Four-Ball and scramble follow the **D01** matrix (prototype: a DQ'd partner's scores don't count; a WD partner keeps holes played; no blanket team DQ).

---

## 2. Push devices (PN1)

| Method & path | Body | Response |
|---|---|---|
| `POST /me/devices` | `{ "platform": "IOS"|"ANDROID", "environment": "STAGING"|"PRODUCTION", "token": "…", "appVersion": "2.4.0", "installationId": "uuid" }` | `201 { deviceId, registeredAt }` — upsert on `installationId` (rotation never duplicates) |
| `PUT /me/devices/{deviceId}` | `{ token }` | 200 — token rotation |
| `DELETE /me/devices/{deviceId}` | — | 204 — sign-out / account switch; also removes server-side on token invalidation |
| `GET /me/devices` | — | `{ items: [{ deviceId, platform, environment, label, lastSeenAt }] }` (token never returned) |

Rules: the account is taken from the access token; a token registered to account A is moved (not shared) when account B registers it. Permanently invalid tokens reported by FCM/APNs are deleted.

---

## 3. Notification events & delivery (PN2, section 7)

### 3.1 Push payload (v1) — ids only

```json
{ "v": 1, "type": "TEE_TIME_CHANGED", "eventId": "evt_…", "tournamentId": "t8", "resourceId": "grp_…" }
```

`type`: `REGISTRATION_CONFIRMED | STAFF_ASSIGNED | TEE_TIME_CHANGED | ANNOUNCEMENT | PLAY_SUSPENDED | PLAY_RESUMED`.
No names of other players, no incident text. The app always re-fetches the resource with the user's token before showing it (PN3).

### 3.2 Event & delivery read (organiser / admin)

`GET /tournaments/{tid}/notifications?type=&page=&size=`

```json
{ "items": [{
  "eventId": "evt_…", "type": "TEE_TIME_CHANGED", "title": "…", "createdAt": "…", "createdBy": { "name": "…" },
  "recipientCount": 1, "expiresAt": "…",
  "delivery": { "email": { "accepted": 1, "pending": 0, "failed": 0 }, "push": { "accepted": 1, "pending": 0, "failed": 0, "skipped": 0 } }
}] }
```

`GET /notifications/{eventId}/deliveries` → per recipient × channel × device: `{ account, name, channel: EMAIL|PUSH, deviceId?, state: QUEUED|ATTEMPTED|ACCEPTED|FAILED|SKIPPED, attempts, error? }`.
`ACCEPTED` = provider accepted (not proof of display). Dedup key: `(eventId, recipient, deviceId, channel)`.

| Event | Recipients | Email | TTL (**D02**) |
|---|---|---|---|
| Registration confirmed | The golfer | existing | — |
| Staff assigned / invited | Assigned marshal / official | existing invite | — |
| Tee time / group changed | Affected registered golfers (moved player; both groups when swapped) | **new** saved-change email | until the round starts; superseded by a newer change |
| Announcement | Selected audience | **new** outbox email | — |
| Play suspended / resumed | Golfers in the field + assigned staff | existing | 6 h; a suspension alert is stale once play resumes |

Events are written to the outbox in the same transaction as the change and processed after commit.

---

## 4. Announcements (AN1)

| Method & path | Who | Notes |
|---|---|---|
| `GET /tournaments/{tid}/announcements/audience?audience=GOLFERS|STAFF|BOTH` | Owner, admin | `{ golfers, staff, total, withPush }` — preview counts |
| `POST /tournaments/{tid}/announcements` + `Idempotency-Key` | Owner, admin | Body `{ title (≤80), body (≤1000), audience }` → `201` announcement. Retry with same key returns the same announcement (`200`, `"duplicate": true`) |
| `GET /tournaments/{tid}/announcements` | Owner, admin | List with delivery summary |
| `GET /announcements/{announcementId}` | Recipients, owner, admin | `403 NOT_A_RECIPIENT` otherwise |

Validation: `422 TITLE_REQUIRED | TITLE_TOO_LONG | BODY_REQUIRED | BODY_TOO_LONG | AUDIENCE_EMPTY`; `409 TOURNAMENT_NOT_ANNOUNCEABLE` (draft, cancelled).
Response: `{ announcementId, tournamentId, title, body, audience, sentBy, sentAt, eventId, counts: { golfers, staff } }`.

---

## 5. Operational reports (RP1–RP10)

All: owner / admin only (`403 REPORT_FORBIDDEN`), `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="<tournament-slug>-<report>.csv"`, UTF-8 BOM, CRLF line endings.
Every file starts with a context block (`Report`, `Tournament (id)`, `Generated (UTC)`, `Filters`) then a blank line, then the table, then `Rows,<n>`.
Text cells starting with `= + - @ TAB CR` are prefixed with `'` (formula-injection mitigation). Empty result ⇒ headers only.
Over the agreed size limit (**D02**, proposal 20 000 rows) ⇒ `202 { jobId }` and `GET /report-jobs/{jobId}` → `{ state, downloadUrl? }`.

| Endpoint | Filters | Columns |
|---|---|---|
| `GET /tournaments/{tid}/reports/registrations.csv` | `status=REGISTERED|WITHDRAWN`, `divisionId`, `round` (adds round status) | Entry ID, Tournament ID, Golfer, Email, Handicap index, Division, [Team], Registration status, Registered at, Entered by, [Round n status] — **no payment fields** |
| `GET /tournaments/{tid}/reports/incidents.csv` | `round`, `kind`, `state=OPEN|COMMITTEE|RESOLVED`, `from`, `to` (dates) | Incident ID, Round, Hole, Kind, Players involved, Entry IDs, Raised by, Raised by role, Raised at, Note, State, Sent to committee, Follow-up notes, Decision, Decided by, Decided at, Score changes |
| `GET /tournaments/{tid}/reports/participation.csv` | `round` (default all) | Summary per round: Registered (denominator), Withdrawn before play, Playing, WD, DQ, NS, DNF, Cards submitted, Cards verified, Players/Teams — then one row per entry with each round's status and card state |

Denominator: registered **entries** (players). Team formats also give the team count (**D01** to confirm).

---

## 6. External golf course search & import (GC1–GC8)

Provider is behind a backend adapter (hexagonal port `GolfCourseProvider`); the API key is server-side only. Provider id/name, coverage, caching and refresh rules: **D03**.

### 6.1 Search

`GET /golf-courses/external/search?q=lakeview&country=CA&page=0&size=20` (q ≥ 3 chars)

```json
{ "items": [{
  "provider": "demo-provider", "providerCourseId": "dp:ca-on-0419",
  "facility": "Lakeview Golf & Country Club", "city": "Mississauga", "region": "Ontario", "country": "Canada",
  "layouts": [{ "layoutId": "dp:ca-on-0419:champ", "name": "Championship", "holes": 18, "importedCourseId": null }],
  "attribution": "Course data © …"
}], "page": 0, "size": 20, "total": 1 }
```

`providerCourseId` is opaque and URL-encoded in paths.

### 6.2 Preview

`GET /golf-courses/external/{providerCourseId}` → facility, address fields (nullable), `updatedAt`, `layouts[]` with
`tees[] { teeId, name, color, menRating?, menSlope?, womenRating?, womenSlope?, yards[] }` and
`scorecard[] { holeNumber, par?, strokeIndex?, parWomen?, strokeIndexWomen? }`, plus
`missing[]` (e.g. `"tees[White].womenRating"`) and `validation { errors[], warnings[] }` computed server-side.

### 6.3 Import / update

`POST /golf-courses/external/{providerCourseId}/import` + `Idempotency-Key`

```json
{
  "layoutId": "dp:ca-on-0419:champ",
  "teeIds": ["dp:ca-on-0419:champ-black", "dp:ca-on-0419:champ-blue"],
  "fixes": [{ "holeNumber": 12, "par": 4 }, { "holeNumber": 14, "strokeIndex": 12 }],
  "mode": "CREATE",
  "existingCourseId": null
}
```

| Response | When |
|---|---|
| `201 { course, source }` | Created, lifecycle `ACTIVE`, selectable in tournament set-up |
| `200 { course, source, version }` | `mode: UPDATE` — changed ratings/scorecard create a new course version effective today; old version kept |
| `409 ALREADY_IMPORTED { courseId }` | Same provider course + layout already imported (dedup on `provider + providerCourseId + layoutId`) |
| `409 COURSE_IN_LIVE_TOURNAMENT { tournamentId }` | `UPDATE` while a tournament on the course is in progress — live scorecards never change |
| `422 COURSE_VALIDATION { errors[] }` | Invalid hole numbers, missing par, duplicate / out-of-range stroke index, bad tee yardage, no rating |

`source` (stored on the course): `{ provider, providerCourseId, layoutId, importedAt, importedBy, refreshedAt?, providerVersion, filledByHand[] }`.

### 6.4 Provider failures (GC8)

| Status | code | Client message |
|---|---|---|
| 504 | `PROVIDER_TIMEOUT` | "Didn't answer in time" + Try again + Add by hand |
| 429 | `PROVIDER_RATE_LIMITED` + `Retry-After` | "Try again in N seconds" |
| 502 | `PROVIDER_BAD_RESPONSE` | "This course's data is incomplete" — add by hand |
| 503 | `PROVIDER_UNAVAILABLE` (credentials / config) | "Course database unavailable" — add by hand |
| 404 | `PROVIDER_COURSE_NOT_FOUND` | "No longer listed" |

Calls, retries and usage are logged with `traceId`. Manual course creation (`POST /golf-courses`) is unchanged.

---

## 7. Permissions matrix

| Action | Owner organiser | Unrelated organiser | Official (assigned, live) | Marshal | Golfer | Expired staff | Admin |
|---|---|---|---|---|---|---|---|
| Write own hole / pickup | — | — | — | — | ✔ own (team card in scramble) | — | — |
| Write marker record | — | — | — | — | ✔ when assigned marker | — | — |
| Verify / correct / unlock | ✔ | ✘ | ✔ | ✘ | ✘ | ✘ | ✔ |
| Verify by override | ✔ | ✘ | ✔ (**D01**) | ✘ | ✘ | ✘ | ✔ |
| Set marker policy | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ |
| Send / list announcements | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ |
| Read an announcement | ✔ | ✘ | if recipient | if recipient | if recipient | ✘ | ✔ |
| Operational reports | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ |
| Course search / import | ✔ | ✔ (own org) | ✘ | ✘ | ✘ | ✘ | ✔ |
| Register / remove own device | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |

---

## 8. Migrations (Liquibase)

| Change | Notes |
|---|---|
| `hole_score.outcome` (`STROKES|PICKUP|MISSING`), `strokes` nullable | Backfill: non-null strokes → `STROKES`, null → `MISSING` |
| `marker_hole_score.outcome` | Same backfill |
| `scorecard_hole_settlement` (card, hole, actor, reason, at) | New |
| `scorecard_verification_override` (card, actor, reason, open_items json, at) | New |
| `tournament.marker_policy` default `MARKER_REQUIRED` | **D01** for legacy |
| `team_scorecard` / `entered_by` per hole for scramble | Or a `card_holder_entry_id` on team members |
| `push_device` (account, installation_id unique, platform, environment, token, last_seen_at) | New |
| `notification_event`, `notification_delivery` | Extend existing outbox |
| `announcement` | New |
| `course.source_*` columns, unique (`provider`, `provider_course_id`, `layout_id`) | New |

---

## 9. Error codes (new)

`PICKUP_NOT_ALLOWED`, `STROKES_OUT_OF_RANGE`, `NOT_YOUR_CARD`, `NOT_ASSIGNED_MARKER`, `SELF_CONFIRMATION`, `CARD_LOCKED`, `PLAY_SUSPENDED`,
`VERIFY_NOT_READY`, `OVERRIDE_REASON_REQUIRED`, `STALE_VERSION`, `IDEMPOTENCY_KEY_REUSED`,
`TITLE_REQUIRED`, `TITLE_TOO_LONG`, `BODY_REQUIRED`, `BODY_TOO_LONG`, `AUDIENCE_EMPTY`, `TOURNAMENT_NOT_ANNOUNCEABLE`, `NOT_A_RECIPIENT`,
`REPORT_FORBIDDEN`, `ALREADY_IMPORTED`, `COURSE_IN_LIVE_TOURNAMENT`, `COURSE_VALIDATION`,
`PROVIDER_TIMEOUT`, `PROVIDER_RATE_LIMITED`, `PROVIDER_BAD_RESPONSE`, `PROVIDER_UNAVAILABLE`, `PROVIDER_COURSE_NOT_FOUND`.

## 10. Open decisions this contract depends on

| Ref | Question |
|---|---|
| D01 | Legacy tournaments → `MARKER_REQUIRED`? May officials (not only owners) override? One-player group behaviour (prototype: needs override). Four-Ball/scramble partner WD/DQ/NS/DNF matrix. Participation denominators for teams |
| D02 | Notification TTLs, report size limit / async threshold, announcement length limits (prototype: 80 / 1000) |
| D03 | Provider, licensing, caching/refresh policy, required vs optional fields, country coverage |
