# Sprint 5 — API contract

Status: **draft for review** · Prepared 24 Nov 2026
Source of truth: `WeHark/Golf-App-Backend` branch `develop` (commit `f6dac15`), read controller by controller.
Scope: the 24 backend (`server`) tickets in Sprint 5, plus the endpoints the 15 web and 9 mobile tickets call.

Sprint 5 is a **validate-and-fix** sprint. Almost every endpoint below already exists. This document records the contract as built, so web, mobile and QA test against the same thing, and lists the gaps the tickets need closed (marked **GAP**).

Follows the layout of `docs/api-contract/api-contract-sprint-4.md` in the web repo.

---

## 0. Conventions (all endpoints)

| Topic | Rule (as implemented) |
|---|---|
| Base path | `/api/v1` |
| Auth | `Authorization: Bearer <access token>`. The acting user always comes from the token, never from the body (#239, #240) |
| Success body | `{ "data": <payload>, "traceId": "…" }` (`ApiResponse<T>`) |
| Error body | `{ "code": "STRING_CODE", "message": "Human text", "details": [ "…" ], "timestamp": "…", "traceId": "…" }` (`ErrorResponse`) |
| Paging | Lists of tournaments: `?page=0&size=20&sort=` → `{ items, page, size, totalElements, totalPages }` (`PageResponse`). Notifications use `{ items, page, size, total }` |
| Concurrency | Mutable resources carry `version`. Writes send it back. Stale write → **409 `STALE_VERSION`** or **409 `CONCURRENCY_ERROR`** (optimistic-lock failure) |
| Idempotency | `Idempotency-Key: <UUID>` header on create/send actions listed in §8. Same key + same body → same result, no second effect. Same key + different body → **409 `IDEMPOTENCY_CONFLICT`** / **422 `IDEMPOTENCY_KEY_REUSED`** |
| Enums | UPPER_SNAKE in JSON |
| Times | ISO-8601. Tournament-local times also carry `timeZone` |

### 0.1 HTTP status mapping (from `GlobalExceptionHandler`)

| Status | When | `code` |
|---|---|---|
| 400 | Bean validation failed, unreadable JSON, bad enum, missing header, type mismatch | `VALIDATION_FAILED` |
| 400 | Bad payment webhook signature / payload | `INVALID_STRIPE_SIGNATURE`, `INVALID_PAYMENT_WEBHOOK` |
| 403 | Role not allowed (Spring Security) | `FORBIDDEN` |
| 403 | Business permission denied | `TOURNAMENT_ACCESS_DENIED`, `NOT_YOUR_CARD`, `NOT_ASSIGNED_MARKER`, `SELF_CONFIRMATION`, `ACCESS_ENDED`, `NOT_REGISTERED`, `NOT_MARKER`, `NOT_A_RECIPIENT`, `REPORT_FORBIDDEN`, `SCORE_CHANGE_NOT_ALLOWED` |
| 404 | Resource not found | `NOT_FOUND`, `ANNOUNCEMENT_NOT_FOUND`, `DEVICE_NOT_FOUND`, `PROVIDER_COURSE_NOT_FOUND`, `REPORT_JOB_NOT_FOUND` |
| 409 | State / version conflict | `STALE_VERSION`, `CONCURRENCY_ERROR`, `CARD_LOCKED`, `ROUND_SIGNED_OFF`, `PLAY_SUSPENDED`, `IDEMPOTENCY_CONFLICT`, `ALREADY_IMPORTED`, `COURSE_IN_LIVE_TOURNAMENT`, `ANNOUNCEMENT_LOCKED`, `TOURNAMENT_NOT_ANNOUNCEABLE` |
| 422 | Any other business rule (default) | e.g. `FIELD_FULL`, `GROUP_FULL`, `REGISTRATION_CLOSED`, `ALREADY_REGISTERED`, `UNSETTLED_MISMATCH`, `CARDS_NOT_VERIFIED`, `PICKUP_NOT_ALLOWED`, `STROKES_OUT_OF_RANGE`, `REFUND_EXCEEDS_PAYMENT`, `PAYMENT_MISMATCH` |
| 429 | Course provider rate-limited (sends `Retry-After`) | `PROVIDER_RATE_LIMITED` |
| 502 / 503 / 504 | Course or payment provider failure | `PROVIDER_BAD_RESPONSE` / `PROVIDER_UNAVAILABLE`, `PAYMENTS_NOT_CONFIGURED`, `PAYMENT_PROVIDER_UNAVAILABLE` / `PROVIDER_TIMEOUT` |
| 500 | Anything unexpected (no stack trace returned) | `INTERNAL_ERROR` |

**GAP (#242):**
- `ResourceConflictException` returns `details` as an **object** (`{ "current": … }`), while every other error returns `details` as a **list of strings**. Pick one shape, or document both, so clients can parse every error the same way.
- `IllegalArgumentException` is mapped to 400 `VALIDATION_FAILED`. Any internal bug that throws it will look like a client error. Throw `BusinessException` for real validation instead.
- A `VALIDATION_ERROR` constant also exists alongside `VALIDATION_FAILED`. Keep only one.

---

## 1. Team tournament capacity & registration (#192, #193, #194 · web #189–191)

### 1.1 Configure capacity — `PUT /tournaments/{tournamentId}`

The `TournamentSetupRequest` already carries team capacity:

```json
{
  "version": 7,
  "name": "Club Four-Ball",
  "format": "FOUR_BALL",
  "participation": "TEAM",
  "team": { "size": 2, "formation": "ORGANISER" },
  "registration": {
    "maxTeams": 3, "minTeams": 1,
    "maxPlayers": null, "minPlayers": null,
    "opensAt": "2026-12-01T08:00:00", "closesAt": "2026-12-10T18:00:00"
  }
}
```

| Field | Rule |
|---|---|
| `team.size` | 2–4 |
| `registration.maxTeams` / `minTeams` | Positive integers. Used only when `participation = TEAM` |
| Golfer limit | `maxTeams × team.size` when `maxTeams` is set. Otherwise `maxPlayers`. Otherwise unlimited |
| Individual tournaments | Unchanged: `maxPlayers` only |

Bad values (negative, zero, non-numeric) → **400 `VALIDATION_FAILED`**.

**Decision needed (#188):** how existing team tournaments that only have `maxPlayers` are migrated (derive `maxTeams = maxPlayers / team.size`, or leave them unlimited).

### 1.2 Registered counts

Returned by `POST /tournaments/{id}/registrations`, `GET /tournaments/{id}/entries` and the tournament day view:

```json
{
  "registeredPlayers": 6,
  "registeredTeams": 3,
  "remainingTeamSpots": 0,
  "remainingPlayerSpots": 0
}
```

`remaining*` is `null` when there is no limit. Counts come from entries that still hold a spot, so withdrawn and expired entries are not counted.

### 1.3 Register — `POST /tournaments/{tournamentId}/registrations`

Body `{ "divisionId": "d1", "teamId": "team-a" }` (both optional) → 200:

```json
{
  "entryId": "t9-e3", "golferId": "…", "invited": false,
  "status": "REGISTERED | PENDING_PAYMENT",
  "payment": null,
  "players": 6, "registeredPlayers": 6, "registeredTeams": 3,
  "remainingTeamSpots": 0, "remainingPlayerSpots": 0
}
```

| Error | When |
|---|---|
| 422 `FIELD_FULL` | Golfer capacity reached |
| 422 `FIELD_FULL` ("The tournament team capacity is full") | Would create a team beyond `maxTeams` |
| 422 `GROUP_FULL` | Team already has `team.size` golfers |
| 422 `ALREADY_REGISTERED` | Golfer already holds a spot |
| 422 `REGISTRATION_CLOSED` | Outside the registration window |
| 422 `NOT_ELIGIBLE`, `NO_MATCHING_DIVISION`, `ABOVE_MAX_HANDICAP` | Eligibility rules |

Withdraw: `DELETE /tournaments/{tournamentId}/registrations/me`.

### 1.4 Team formation & replacement (#193)

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/tournaments/{id}/teams` | — | Teams with members |
| POST | `/tournaments/{id}/teams` | `{ "teamId": "team-a", "entryIds": ["e1","e2"] }` | Create or update a team |
| POST | `/tournaments/{id}/entries` | `Entry` (organiser adds a golfer) | Same capacity checks as §1.3 |
| PATCH | `/tournaments/{id}/entries/{entryId}` | `{ "teeSetId", "divisionId", "teamId" }` | Move between teams |
| POST | `/tournaments/{id}/entries/{entryId}/replace` | `{ "firstName", "lastName", "email", "handicapIndex", "ratingsGender", "dateOfBirth" }` | **Must not change** `registeredPlayers` / `registeredTeams` |
| DELETE | `/tournaments/{id}/entries/{entryId}` | — | Frees one spot |

Errors: 422 `GROUP_FULL`, 422 `PLAYER_TEED_OFF`, 422 `FIELD_LOCKED`.

### 1.5 Concurrency (#194)

- Every write action in `TournamentPlayService` (registration included) loads the tournament **with a row lock** (`findByIdForUpdate`) inside one transaction. Two simultaneous registrations for the last team spot must give exactly one 200 and one 422 `FIELD_FULL`.
- A failed registration leaves no partial entry or team.
- **GAP:** `POST /registrations` does not accept `Idempotency-Key`. A retry after a lost response returns 422 `ALREADY_REGISTERED` rather than the original result. Either add the header or document that clients treat `ALREADY_REGISTERED` on retry as success (see §8).

---

## 2. Email, verification & announcements (#199, #200, #201 · web #196 · mobile #197, #198)

### 2.1 Email verification

| Method | Path | Body |
|---|---|---|
| POST | `/golfers/email-verification/request` | `{ "email" }` |
| POST | `/golfers/email-verification/confirm` | `{ "email", "code": "123456" }` or `{ "token" }` |
| POST | `/organizers/email-verification/request` | `{ "email" }` |
| POST | `/organizers/email-verification/confirm` | as golfer |

Errors: 422 `CODE_INVALID`, 422 `CODE_EXPIRED`. A code or token only verifies the account it was issued for.

### 2.2 Emails the backend sends

| Trigger | Template | Ticket |
|---|---|---|
| Successful registration (status `REGISTERED`) | Registration confirmation (**restore missing template**) | #199 |
| Signup / verification request | Verification code | #200 |
| Staff slot filled with `sendInvite: true` or `POST /staff/{slotId}/invite` | Staff invitation | #200 |
| Organiser adds a golfer with `notify: true` | Invitation | #200 |
| Payment link (`sendEmail: true`) | Payment link | #202 |
| Notification events (§4.4) | `notification-email.txt` (title, body, recipientName, tournamentUrl) | #201 |

A rejected registration (`FIELD_FULL`, etc.) must send **no** confirmation email.

### 2.3 Announcements

Request body:

```json
{ "title": "Round 2 schedule", "body": "First tee 09:00.", "audience": "GOLFERS | STAFF | BOTH", "status": "DRAFT | PUBLISHED", "version": 0 }
```

Limits: `title` ≤ 80, `body` ≤ 1000.

| Method | Path | Who | Notes |
|---|---|---|---|
| GET | `/tournaments/{id}/announcements/audience?audience=GOLFERS` | Organiser | `{ golfers, staff, total, withPush }` preview |
| POST | `/tournaments/{id}/announcements` | Organiser | **`Idempotency-Key` required.** 201 |
| PUT | `/tournaments/{id}/announcements/{announcementId}` | Organiser | Draft edit. Send `version` |
| POST | `/tournaments/{id}/announcements/{announcementId}/publish` | Organiser | `{ "version": 3 }` |
| GET | `/tournaments/{id}/announcements?page=0&size=20` | Organiser, staff, golfer | Golfers and staff see only what their audience allows |
| GET | `/announcements/{announcementId}` | Recipient | 403 `NOT_A_RECIPIENT` if not in the audience |

Response:

```json
{
  "announcementId": "uuid", "tournamentId": "t9", "title": "…", "body": "…",
  "audience": "GOLFERS", "status": "PUBLISHED",
  "createdBy": "uuid", "createdAt": "…", "publishedBy": "uuid", "publishedAt": "…",
  "version": 3, "eventId": "uuid", "recipientIds": ["uuid"], "duplicate": false
}
```

Errors: 409 `ANNOUNCEMENT_LOCKED` (editing a published one), 409 `TOURNAMENT_NOT_ANNOUNCEABLE`, 422 `AUDIENCE_EMPTY`, 409 `STALE_VERSION`.

**GAP (#201):** `recipientIds` is returned to the organiser. Confirm that golfer-facing reads strip it (it lists other golfers' account ids).

---

## 3. Paid registration & payments (#205, #206, #207 · web #203, #204)

Provider: **Stripe** (`StripePaymentAdapter`). A `SimulatedPaymentAdapter` confirms payments immediately in local profiles.

### 3.1 Paid registration

`POST /tournaments/{id}/registrations` for a paid tournament returns `status: "PENDING_PAYMENT"` and:

```json
"payment": {
  "paymentIntentId": "pi_…", "clientSecret": "pi_…_secret_…",
  "amount": 2000.00, "taxAmount": 0.00, "total": 2000.00, "currency": "INR"
}
```

The client confirms the card with Stripe using `clientSecret` (the Flutter app uses the Stripe payment sheet). **The client never marks an entry as paid.** The entry becomes `REGISTERED` / `PAID` only when the webhook arrives (§3.3).

### 3.2 Organiser payment link — `POST /tournaments/{id}/entries/{entryId}/payment-link`

Body `{ "expiresInHours": 48, "sendEmail": true }` (1–720) → `{ url, amount, currency, expiresAt }`. Calling it again before expiry returns the same link. Error 422 `NOT_PAID_ONLINE` if the entry needs no payment.

### 3.3 Webhook — `POST /payments/webhooks/stripe`

- Raw body + `Stripe-Signature` header. Bad signature → **400 `INVALID_STRIPE_SIGNATURE`**.
- Handled events: `payment_intent.succeeded`, `checkout.session.completed` (when paid), `payment_intent.payment_failed`, `charge.refunded`, `refund.updated`, `refund.failed`.
- Metadata must carry `tournamentId` and `entryId`. Events without them are ignored (200).
- **Idempotent:** processed event ids are stored, so a repeated event is a no-op (#206).
- Amount and currency must match the entry, otherwise 422 `PAYMENT_MISMATCH`.
- The tournament row is locked while processing.

**GAP (#206):** check that an older `payment_intent.payment_failed` arriving after `succeeded` cannot downgrade a paid entry.

### 3.4 Payment status read (#204)

**GAP:** there is no dedicated payment-status endpoint. After the Stripe sheet closes, the client should re-read the entry (`GET /golfers/me/tournaments` or `GET /tournaments/{id}`) and show:

| `status` / `paymentStatus` | UI state |
|---|---|
| `REGISTERED` / `PAID` | Confirmed |
| `PENDING_PAYMENT` | Pending: offer retry with the held `clientSecret` |
| `PENDING_PAYMENT` after the Stripe sheet reported failure | Failed: retry |
| `WITHDRAWN` (hold expired) | Spot released |

Backend to confirm which field on those two reads carries `paymentStatus` for the signed-in golfer, or add `GET /tournaments/{id}/registrations/me`.

### 3.5 Refund — `POST /tournaments/{id}/entries/{entryId}/refund` (#207)

Header `Idempotency-Key` (optional today; **make it required**). Body `{ "amount": 500.00, "reason": "…" }` (`amount` omitted = full remaining) → `{ refundId, amount, currency, status: "PENDING | SUCCEEDED | FAILED | CANCELED" }`.

| Error | When |
|---|---|
| 409 `IDEMPOTENCY_CONFLICT` | Same key, different amount, reason or entry |
| 422 `NOT_PAID_ONLINE` | No online payment |
| 422 `REFUND_EXCEEDS_PAYMENT` | More than paid minus already refunded |
| 422 `VALIDATION_FAILED` | Too many decimals for the currency |

Refund status changes only on `refund.updated` / `refund.failed`. A failed refund puts the balance back.

**Reconciliation (#207):** compare `entry.paymentIntentId` / `refunds[].providerId` against Stripe test-mode records. No reconciliation endpoint exists. Record discrepancies in the test evidence.

---

## 4. Push notifications (#223, #224 · mobile #219–222)

### 4.1 Devices

| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/me/devices` | `{ "platform": "IOS|ANDROID", "environment": "STAGING|PRODUCTION", "token": "…", "appVersion": "1.4.0", "installationId": "uuid" }` | 201. One active record per `installationId` |
| PUT | `/me/devices/{deviceId}` | `{ "token": "…" }` | Token refresh (#220) |
| DELETE | `/me/devices/{deviceId}` | — | On logout |
| GET | `/me/devices` | — | `{ "items": [ { deviceId, platform, environment, label, registeredAt, lastSeenAt } ] }` |

Rules:
- The device belongs to the token's user. Another user's `deviceId` → 404 `DEVICE_NOT_FOUND`, never 200.
- Registering the same `installationId` under a new user transfers ownership (account switch). Transfers, rotation and removal are serialised with a lock.
- When Firebase rejects a token, the delivery is recorded as `SKIPPED` with `INVALID_DEVICE_TOKEN`. **Check (#223):** the device record should also be deactivated so later events skip it.

### 4.2 Push payload (v1): ids only

FCM `data` message:

```json
{ "v": "1", "type": "ANNOUNCEMENT", "eventId": "uuid", "tournamentId": "t9", "resourceId": "uuid" }
```

| `type` | `resourceId` | Mobile destination |
|---|---|---|
| `ANNOUNCEMENT` | announcement id (required, UUID) | `announcement` detail |
| `TEE_TIME_CHANGED` | entry or group id | `tournament_details` |
| `SCHEDULE_UPDATED` | — | `tournament_details` |
| `REGISTRATION_CONFIRMED` | entry id | `tournament_details` |
| `PLAY_SUSPENDED` / `PLAY_RESUMED` | — | `tournament_details` |
| `PARTICIPANT_STATUS_UPDATED` | entry id | `tournament_details` |

The app ignores payloads with an unknown `v`, a non-UUID `eventId`, or an `ANNOUNCEMENT` without a UUID `resourceId`. No title or body text goes in `data`; the app shows text from its own strings and loads content through the API, which applies permissions.

**GAP:** the mobile app also knows `STAFF_ASSIGNED`. Confirm whether the backend sends it, or remove it from the app.

### 4.3 Recipients (#224)

`GOLFERS` → entries holding a spot. `STAFF` → active staff slots. `BOTH` → both. A golfer not registered for the tournament never receives its push.

### 4.4 Delivery log (organiser / admin)

| Method | Path |
|---|---|
| GET | `/tournaments/{id}/notifications?type=ANNOUNCEMENT&page=0&size=20` |
| GET | `/notifications/{eventId}/deliveries` |

Delivery `state`: `QUEUED`, `ACCEPTED`, `SKIPPED`, `FAILED`. `error`: `NO_ACTIVE_DEVICE`, `INVALID_DEVICE_TOKEN`, `PROVIDER_DELIVERY_FAILED`. Includes `attempts` and `nextAttemptAt` for retries.

---

## 5. Tournament operations (#234, #235 · web #226–231 · mobile #232, #233)

### 5.1 Live day & pace

| Method | Path | Who | Notes |
|---|---|---|---|
| GET | `/tournaments/{id}/day?round=1` | Organiser, staff | Live dashboard data |
| GET | `/tournaments/{id}/staff-view` | Marshal, Official | Staff-scoped view |
| GET | `/me/assignments` | Marshal, Official | Assigned tournaments |
| GET | `/tournaments/{id}/rounds/{round}/pace` | Organiser, Marshal | Pace per group: `ON_PACE`, `BEHIND`, `OUT_OF_POSITION`, `NOT_STARTED`, `FINISHED` |
| GET | `/tournaments/{id}/pace/stream?round=1` | Organiser, Marshal | SSE |
| GET | `/tournaments/{id}/rounds/{round}/groups` | Organiser, staff | Groups and tee times |
| POST | `/tournaments/{id}/start` | Organiser | Start the tournament |
| POST | `/tournaments/{id}/suspend` / `/resume` | Organiser, Official | `{ "reason" }` |
| PATCH | `/tournaments/{id}/status` | Organiser | `{ status: DRAFT|REGISTRATION_OPEN|REGISTRATION_CLOSED|UPCOMING|CANCELLED|RESCHEDULED, newStartDate, reason, refundAll, notifyRegistrants }` |

### 5.2 Incidents & disputes (#227, #228)

| Method | Path | Body |
|---|---|---|
| GET | `/tournaments/{id}/incidents?round=&status=&kind=&from=&to=` | — |
| POST | `/tournaments/{id}/incidents` | `{ round, kind, hole, groupId, entryIds[], note, status: OPEN|COMMITTEE }` · `Idempotency-Key` accepted |
| GET | `/tournaments/{id}/incidents/{incidentId}` | — |
| GET | `/tournaments/{id}/incidents/{incidentId}/history` | — |
| PATCH | `/tournaments/{id}/incidents/{incidentId}` | partial update · `Idempotency-Key` accepted |
| POST | `/tournaments/{id}/incidents/{incidentId}/escalate` | `{ "text" }` (Marshal → Official) |
| POST | `/tournaments/{id}/incidents/{incidentId}/notes` | `{ "text" }` |
| POST | `/tournaments/{id}/incidents/{incidentId}/resolve` | `{ "decision", "scoreChange": { entryId, hole, strokes } }` |

`kind`: `SLOW_PLAY`, `SCORE_DISPUTE`, `CART`, `SAFETY`, `OTHER`. `state`: `OPEN`, `ESCALATED` / `COMMITTEE`, `RESOLVED`.
A `scoreChange` inside `resolve` applies an authorised correction and writes a score-change record. 422 `ENTRY_NOT_IN_INCIDENT` if the entry isn't part of the incident.

Note: the notes route is declared as `/incidents/{entryId}/notes` in `TournamentController`, but the value is the incident id. Rename the path variable.

### 5.3 Scorecard review, verification & sign-off (#229)

| Method | Path | Notes |
|---|---|---|
| GET | `/tournaments/{id}/rounds/{round}/cards?filter=&groupId=` | Card list for review |
| GET | `/tournaments/{id}/rounds/{round}/scorecards/{entryId}` | Card with `verification { ready, blankHoles, unconfirmedHoles, discrepancyHoles }` |
| POST | `/tournaments/{id}/rounds/{round}/scorecards/verify` | Verify one or many |
| POST | `/tournaments/{id}/rounds/{round}/scorecards/{entryId}/verify-override` | Needs a reason (`OVERRIDE_REASON_REQUIRED`) |
| POST | `/tournaments/{id}/rounds/{round}/scorecards/{entryId}/corrections` | `{ hole, strokes, reason, version }` |
| POST | `/tournaments/{id}/rounds/{round}/scorecards/{entryId}/unlock` | `{ reason, version }` |
| GET | `/tournaments/{id}/rounds/{round}/cards/{entryId}/history` | Card audit trail |
| POST | `/tournaments/{id}/rounds/{round}/sign-off` | `{ "note" }` → 422 `CARDS_NOT_VERIFIED` if any card isn't verified |
| GET | `/tournaments/{id}/sign-offs` | — |

Verify errors: 422 `VERIFY_NOT_READY`, 422 `UNSETTLED_MISMATCH` / `MISMATCH_UNSETTLED`, 422 `CARD_NOT_SUBMITTED`.

**GAP:** two route families exist for the same cards. The legacy family is `/rounds/{round}/cards/{entryId}/…` (`ScorecardController`); the Sprint 4 family is `/rounds/{round}/scorecards/{entryId}/…` (`TournamentWorkflowController`). The mobile app still calls the legacy `cards/…/verify` and `cards/…/holes/{hole}`. Agree which family is canonical before regression (#250) and deprecate the other.

### 5.4 Reports (#231)

| Method | Path | Filters (query) |
|---|---|---|
| GET | `/tournaments/{id}/reports/registrations` | `q`, `status`, `divisionId` |
| GET | `/tournaments/{id}/reports/incidents` | `kind`, `state`, `round` |
| GET | `/tournaments/{id}/reports/participation` | `divisionId` |
| GET | `/report-jobs/{jobId}` | Job status (`QUEUED`, `READY`, `EXPIRED`) |
| GET | `/report-jobs/{jobId}/download` | CSV file |
| GET | `/tournaments/{id}/reports/{type}` | `RESULTS`, `DIVISIONS`, `WINNERS`, `SCORECARDS`. Only after results are published |

The JSON report returns `{ rows, filename, content }` or a job. The CSV includes a header block with tournament, generation time (UTC) and filters. Only the tournament owner or a platform admin can read operational reports (403 `REPORT_FORBIDDEN`).

### 5.5 Golfer-facing reads (#232, #233)

| Method | Path | Notes |
|---|---|---|
| GET | `/golfers/me/home` | Home summary |
| GET | `/golfers/me/tournaments` | Assigned tournaments, group, tee time, entry status |
| GET | `/golfers/me/rounds/current` | Current round |
| GET | `/tournaments/{id}` | Detail |
| GET | `/tournaments/{id}/rounds/{round}/my-card` | Own card |
| PUT | `/tournaments/{id}/rounds/{round}/my-card/holes/{hole}` | `{ strokes, outcome: STROKES|PICKUP, version }` |
| PUT | `/tournaments/{id}/rounds/{round}/cards/{entryId}/marker/holes/{hole}` | Marker record |
| POST | `/tournaments/{id}/rounds/{round}/my-card/submit` | `{ acknowledgeBlankHoles, version }` |
| GET | `/tournaments/{id}/leaderboard?round=&divisionId=&view=` | `view`: `GROSS`, `NET`, `GROSS_AND_NET` |
| GET | `/tournaments/{id}/leaderboard/stream?round=&view=&divisionId=` | SSE |
| GET | `/tournaments/{id}/winners` | After publication |

Golfers must never receive staff-only fields (incident notes, staff contacts) from these reads (#233).

### 5.6 Golf course search & import (#234)

| Method | Path | Notes |
|---|---|---|
| GET | `/golf-courses/external/search?q=&country=&page=0&size=20` | Provider search. `q` is required |
| GET | `/golf-courses/external/{providerCourseId}` | Preview: layouts, tees, holes |
| POST | `/golf-courses/external/{providerCourseId}/import` | **`Idempotency-Key`**. Body `{ layoutId, teeIds[], fixes[ {holeNumber, par, strokeIndex, parWomen, strokeIndexWomen} ], mode: CREATE|UPDATE, existingCourseId, version }` |
| POST | `/golf-courses/list` | Internal course list for tournament setup |
| GET | `/golf-courses/{courseId}` | — |

Errors: 409 `ALREADY_IMPORTED` (same layout imported with `CREATE`), 409 `COURSE_IN_LIVE_TOURNAMENT` (update blocked), 404 `PROVIDER_COURSE_NOT_FOUND`, 429 / 502 / 503 / 504 provider errors. A failed import writes nothing (import request and revision tables).

---

## 6. Authorization & audit (#238, #239, #240 · web #237)

### 6.1 Roles

`GOLFER`, `ORGANIZER`, `PLATFORM_ADMIN`, plus per-tournament staff slots `MARSHAL` and `TOURNAMENT_OFFICIAL`.

### 6.2 Permission matrix (what the backend must enforce)

| Operation | Golfer | Organiser (own tournament) | Marshal (assigned) | Official (assigned) | Platform admin |
|---|---|---|---|---|---|
| Browse / view published tournament | ✓ | ✓ | ✓ | ✓ | ✓ |
| Register / withdraw self | ✓ | — | — | — | — |
| Create / configure / publish tournament | — | ✓ | — | — | ✓ |
| Manage entries, teams, groups, tee times | — | ✓ | — | — | ✓ |
| Manage staff slots | — | ✓ | — | — | ✓ |
| Write own card / marker record | ✓ (own, or as assigned marker) | — | — | — | — |
| View pace, raise incident | — | ✓ | ✓ | ✓ | ✓ |
| Escalate incident | — | — | ✓ | — | — |
| Resolve incident / correct score / unlock | — | ✓ | ✗ (see GAP) | ✓ | ✓ |
| Verify cards / round sign-off | — | ✓ | — | ✓ | ✓ |
| Suspend / resume play | — | ✓ | — | ✓ | ✓ |
| Publish results / declare winners | — | ✓ | — | — | ✓ |
| Read operational reports | — | ✓ | — | — | ✓ |
| Announcements: create / publish | — | ✓ | — | — | ✓ |
| Approve organisers | — | — | — | — | ✓ |

Rules for every row:
- An organiser of Tournament A gets **403 `TOURNAMENT_ACCESS_DENIED`** on Tournament B, whatever id is put in the URL or body.
- Staff whose slot was removed or whose tournament ended get **403 `ACCESS_ENDED`**.
- Role and actor come from the token. A `role` or `actorId` in a body is ignored.
- Rejected requests change nothing.

How the code decides today (`TournamentPlaySupport`):
- `manager()` = platform admin, or the organiser who owns the tournament.
- `manage()` passes for a manager **or an assigned Official**.
- `incidentAccess()` passes for a manager **or any assigned staff**, Marshals included.
- Escalation is Marshal-only.

**GAP (#239):** `resolve` checks `incidentAccess()`, so an assigned **Marshal can resolve an incident and apply a score change**. If resolving is Official-only, `resolve` must check for the Official role.

**Decision needed:** confirm that organisers may do official actions (resolve, correct, sign-off) on their own tournaments, as the code allows today, or make those actions Official-only.

### 6.3 Audit records (#240)

What exists today:

| Record | Read endpoint |
|---|---|
| Score changes (correction, marker override, unlock) | `GET /tournaments/{id}/score-changes?round=&entryId=` and `GET …/cards/{entryId}/history` |
| Incident lifecycle (`CREATED`, `ESCALATED`, `NOTE_ADDED`, `UPDATED`, `RESOLVED`) | `GET /tournaments/{id}/incidents/{incidentId}/history` |
| Card verification / override / sign-off | card history, `GET /tournaments/{id}/sign-offs` |
| Suspend / resume, status changes | tournament day view |

Each record must hold: actor (from the token), action, backend timestamp, tournament id, affected record id, and for score changes the previous value, new value and reason.

**GAP:** staff slot add / fill / remove and tournament configuration changes have no readable audit trail. Add records for them, with a read endpoint for organisers and admins (for example `GET /tournaments/{id}/audit`). Audit records must not be editable or deletable through the API.

---

## 7. Concurrency & state transitions (#244, #245)

| Area | Mechanism | Client sees |
|---|---|---|
| Hole score writes | `version` on the card + optimistic locking | 409 `STALE_VERSION` / `CONCURRENCY_ERROR` → reload the card, show the latest value |
| Writes to different holes on the same card | Accepted independently. A version bump must not drop a valid hole | — |
| Submit while another write is in flight | Submit uses the card `version` | 409 → reload |
| Correction then stale player write | Card `CARD_LOCKED` after submit; corrected value wins | 409 `CARD_LOCKED` |
| Registration vs closing registration | Tournament row lock | 422 `REGISTRATION_CLOSED` |
| Score write vs round sign-off | — | 409 `ROUND_SIGNED_OFF` |
| Score write while suspended | — | 409 `PLAY_SUSPENDED` |
| Two people complete / sign off the same round | Second call must be a no-op or 409. Side effects (notifications, results) run once | — |
| Finalise with unverified cards | — | 422 `CARDS_NOT_VERIFIED` |
| Publish results while invalid | — | 422 `RESULTS_INVALIDATED` / `WINNERS_NOT_DECLARED` |

`POST /tournaments/{id}/publish-results` takes `{ "allowProvisional": false }`.

---

## 8. Idempotency coverage (#243)

| Operation | `Idempotency-Key` today | Needed |
|---|---|---|
| Announcement create | ✓ required | — |
| Course import | ✓ | — |
| Refund | ✓ optional | Make required |
| Incident create / update | ✓ optional | — |
| Card write / marker / submit / verify / override / correct / unlock (`/scorecards/…` routes) | ✓ optional | — |
| Tournament registration | ✗ | **Add** (#243 example 1) |
| Legacy `my-card/submit` | ✗ | **Add**, or move mobile to `/scorecards/…/submit` |
| Team save, add entry | ✗ | **Add** |
| Staff slot add / fill / invite | ✗ | **Add** |
| Start, sign-off, publish results | ✗ | Make repeat calls no-ops (state check) |

---

## 9. Performance, health & release (#252, #253, #254)

### 9.1 Endpoints under load test

| Ticket | Endpoints |
|---|---|
| #252 writes | `POST /tournaments/{id}/registrations`, `PUT …/my-card/holes/{hole}`, `PUT …/scorecards/{entryId}/holes/{hole}`, `POST …/my-card/submit` |
| #253 reads | `GET /tournaments/{id}/leaderboard`, `GET …/leaderboard/stream`, `GET /tournaments/{id}/day` |

Targets (p95 latency, throughput, error rate) are **to be agreed** before the runs. The tickets use a 120-golfer, 30-group field as the reference size.

### 9.2 Health

Spring Boot Actuator `GET /actuator/health`.

**GAP (#253):** `application.yml` sets `management.endpoint.health.show-details: always`, which exposes database and dependency details to anyone. Use `when-authorized` in staging and production.

Every response carries `traceId`. Logs must include it, and never tokens, passwords or card data.

### 9.3 External configuration checked at deploy (#254)

| Service | Setting |
|---|---|
| Mail | SMTP host and credentials (staging) |
| Firebase | Service account for the staging project; device `environment` = `STAGING` |
| Stripe | Test secret key, webhook signing secret, publishable key in the mobile build (`--dart-define=STRIPE_PUBLISHABLE_KEY`) |
| Golf course provider | API key (Golf API adapter) or sample adapter |
| Mobile | `--dart-define=BASE_API_URL=https://<staging-host>/api/v1` (release builds reject http) |

CI: `.github/workflows/deploy-dev.yml`. No secret values in the repo or build logs.

---

## 10. Open decisions

| # | Decision | Owner | Blocks |
|---|---|---|---|
| D1 | Migration of capacity for existing team tournaments (§1.1) | Product | #188, #192 |
| D2 | Canonical scorecard route family, `cards` vs `scorecards` (§5.3) | Backend + mobile | #249, #250 |
| D3 | Payment status read for the golfer (§3.4) | Backend | #204 |
| D4 | Whether organisers can perform official actions (§6.2) | Product | #238, #239 |
| D5 | Performance targets (§9.1) | Product + backend | #252, #253 |
| D6 | Stripe provider approval and live credentials. If missing, record the launch decision | Product | #202 |
| D7 | Paid checkout exists only in the Flutter app. Reassign #203 / #204 to mobile, or build web checkout | Product | #203, #204 |

---

## Appendix: ticket → section

Parent tickets: #188 → §1 · #195 → §2 · #202 → §3 · #218 → §4 · #225 → §5 · #236 → §6 · #241 → §0.1, §7, §8 · #246 → §5 and the regression journeys in the web and mobile specs · #251 → §9.

| Ticket | Section |
|---|---|
| #192, #193, #194 | §1 |
| #199, #200, #201 | §2 |
| #205, #206, #207 | §3 |
| #223, #224 | §4 |
| #234, #235 | §5 |
| #238, #239, #240 | §6 |
| #242 | §0.1 |
| #243 | §8 |
| #244, #245 | §7 |
| #250 | §5 (all lifecycle endpoints) |
| #252, #253, #254 | §9 |
