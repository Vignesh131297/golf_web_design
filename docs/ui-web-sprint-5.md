# Sprint 5 — Web UI specification (React portals)

Status: **draft for review** · Prepared 24 Nov 2026
Repo: `WeHark/Golf-App-Frontend-web`, branch `develop`. Routes below are from `src/utils/constants.js` (`ROUTES`) and `src/routers/routeConfig.jsx`.
API details: see `api-contract-sprint-5.md` (section numbers in brackets, e.g. [API §1.3]).
Scope: the 15 `web` tickets in Sprint 5.

Sprint 5 is **validate and fix**. Each section says where the feature lives today, what it must do, the states to handle, and how to check it. Build nothing new unless the section says so.

---

## 0. Rules for every screen

| Rule | Detail |
|---|---|
| Server is the truth | Counts, statuses, payment state and permissions come from the API response. Don't compute them locally and show them as fact |
| No false success | Show a success message only after a 2xx. On any error, keep the form data and show the error |
| One submit at a time | Disable the action button while its request is in flight. Send `Idempotency-Key` (new UUID per user action) where the API accepts it [API §8] |
| Four states | Every data panel handles **loading**, **empty**, **error** (with Retry) and **loaded** |
| Errors by code | Map `code` from the error body to a message (table in §0.1). Unknown codes: "Something went wrong. Try again." plus `traceId` in small text |
| Stale data | On 409 `STALE_VERSION` / `CONCURRENCY_ERROR`: reload the record, then show "This was changed by someone else. We've loaded the latest version." |
| Access | On 403: show the access-denied message and don't retry. On 401: send the user to sign-in, then back |
| Refresh | After a page reload, everything shown must match the server again |

### 0.1 Error code → message

| Code | Message |
|---|---|
| `FIELD_FULL` | Registration is full. The maximum capacity for this tournament has been reached. |
| `GROUP_FULL` | This team is already full. |
| `ALREADY_REGISTERED` | You're already registered for this tournament. |
| `REGISTRATION_CLOSED` | Registration for this tournament is closed. |
| `VALIDATION_FAILED` | Show each item in `details` next to its field, or as a list |
| `TOURNAMENT_ACCESS_DENIED`, `FORBIDDEN`, `ACCESS_ENDED` | You don't have access to this tournament. |
| `STALE_VERSION`, `CONCURRENCY_ERROR` | This was changed by someone else. We've loaded the latest version. |
| `CARD_LOCKED` | This scorecard is locked. |
| `UNSETTLED_MISMATCH`, `VERIFY_NOT_READY` | This scorecard can't be verified yet. Resolve the open items first. |
| `CARDS_NOT_VERIFIED` | All scorecards must be verified before sign-off. |
| `PLAY_SUSPENDED` | Play is suspended. |
| `ANNOUNCEMENT_LOCKED` | Published announcements can't be edited. |
| `AUDIENCE_EMPTY` | Nobody is in this audience yet. |
| `REPORT_FORBIDDEN` | Only the tournament owner can download reports. |
| Network failure (no response) | You're offline or the server didn't respond. Check your connection and try again. |

---

## 1. Team tournament capacity (#189, #190, #191)

### 1.1 Maximum Teams field (#189)

**Where:** Tournament editor `/admin/tournaments/new` and `/admin/tournaments/:tournamentId`. Component: `pages/AdminTournamentEditor/RegistrationEntrySection.jsx`.

| Item | Spec |
|---|---|
| Visibility | Show **Maximum teams** (and optional **Minimum teams**) only when participation is Team (Four-Ball, Scramble). Hide **Maximum golfers** in that case, and show the derived golfer limit as read-only help text: "Up to {maxTeams × teamSize} golfers" |
| Input | Whole number ≥ 1. Block negative, zero, decimals and text before submit, with "Enter a whole number of 1 or more." |
| Save | `PUT /tournaments/{id}` with `registration.maxTeams` and the current `version` [API §1.1] |
| Reopen | Field shows the saved value from `GET /tournaments/{id}` |
| Individual tournaments | Unchanged: only Maximum golfers |
| Errors | 400 → field-level messages from `details`. 409 → reload and say so |

**Check:** create a Four-Ball with Maximum teams = 10 → save → reload → still 10. Enter -1 → blocked. Switch to Individual → Maximum golfers shows, Maximum teams hides.

### 1.2 Registered team & golfer counts (#190)

**Where:** Registration management `/admin/tournaments/:tournamentId/registrations` (`pages/TournamentRegistrations`, `pages/RegistrationManagement/RegistrationManagementApi.jsx`), and the capacity badge in the tournament list (`pages/AdminTournaments/TournamentPlayerCapacity.jsx`).

Show for team tournaments:

| Label | Source |
|---|---|
| Maximum teams | `registration.maxTeams` |
| Registered teams | `registeredTeams` |
| Registered golfers | `registeredPlayers` |
| Spots left | `remainingTeamSpots` (hide if `null`) |

Rules:
- Read the numbers from the API [API §1.2]. Don't count rows in the table.
- Refetch after: registration, team save, move, replace, remove.
- Zero registrations → "0 teams · 0 golfers", not empty.
- On error, show "Couldn't load registration counts" with Retry. **Don't show 0.**

**Check:** 5-team, 2-per-team tournament with 3 teams → shows 5 / 3 / 6. Add a team → 4 / 8. Replace one golfer → still 4 / 8.

### 1.3 Registration full handling (#191)

**Where:** Golfer registration panel on `/tournaments/:tournamentId` (`pages/TournamentDetails/sections/RegistrationPanel.jsx`), and organiser "Register golfer" (`AdminTournamentEditor/RegisterGolferSection.jsx`).

| Situation | UI |
|---|---|
| Page loads with `remainingTeamSpots = 0` or `remainingPlayerSpots = 0` | Button disabled, label "Registration full" |
| Spots shown, but full by the time the golfer submits | Backend returns 422 `FIELD_FULL` → show the §0.1 message, refetch counts, disable the button |
| Submitting | Button shows a spinner and is disabled |
| Network error | Network message plus Retry. Not the capacity message |
| Success | Confirmation only after 200 and `status` `REGISTERED` (or `PENDING_PAYMENT`, see §2) |

**Check:** 3 teams × 2 full → another registration gets the full message, no confirmation. Double-click Register → one request.

---

## 2. Paid registration (#203, #204)

> **Read first:** card payment is built in the **Flutter app** today (`lib/core/payments/card_payments.dart`, Stripe payment sheet). The web app has no checkout code. Ticket #203 says to reassign it if paid registration lives only in another client. **Decision D7:** move #203/#204 to mobile, or build web checkout with Stripe Elements. The spec below applies whichever client does it.

### 2.1 Checkout (#203)

| Step | UI |
|---|---|
| Fee display | Tournament details shows the entry fee from the API (`entryFee`, `feeCurrency`). Free → "Free" |
| Register | `POST /tournaments/{id}/registrations` [API §3.1] |
| Response `status = REGISTERED` | Free or already paid: show the confirmation |
| Response `status = PENDING_PAYMENT` with `payment.clientSecret` | Open the Stripe card form with `clientSecret`. Show the amount from `payment.total` and `payment.currency` |
| While opening | Spinner. Button disabled |
| Checkout can't start (`PAYMENTS_NOT_CONFIGURED`, `PAYMENT_PROVIDER_UNAVAILABLE`) | "Online payment isn't available right now. Your place is held — try again shortly." |

Never mark the registration paid because the card form opened or closed.

### 2.2 Payment result (#204)

After Stripe returns, re-read the golfer's entry [API §3.4] and show:

| Entry state | Screen |
|---|---|
| `REGISTERED` / `PAID` | ✅ "You're registered. Payment received." |
| `PENDING_PAYMENT`, Stripe reported success | ⏳ "Payment is processing. We'll confirm shortly." Re-check every 5 s for up to 1 min, plus a Refresh button |
| `PENDING_PAYMENT`, Stripe reported failure or cancel | ❌ "Payment didn't go through. You haven't been charged." plus **Try again** |
| `WITHDRAWN` (hold expired) | "Your held place has expired." plus Register again if spots remain |
| Read failed | "Couldn't check your payment status." plus Retry. Don't show success or failure |

A page refresh shows the same state. A Stripe success redirect alone is never proof of payment.

**Check (Stripe test cards):** success card → confirmed. Decline card → failed, entry not paid. 3-D Secure card left open → pending.

---

## 3. Announcements (#196)

**Where:** Live tournament page, Announcements tab: `/admin/tournaments/:tournamentId/live` (`pages/TournamentDay/sections/AnnouncementsSection.jsx`). Delivery status: `NotificationStatus.jsx`.

| Item | Spec |
|---|---|
| Form | Title (required, max 80, live counter) · Message (required, max 1000, live counter) · Audience: Golfers / Staff / Both |
| Audience preview | On audience change call `GET …/announcements/audience` and show "Sends to {total} people ({withPush} with the app)". `AUDIENCE_EMPTY` → warning, Publish disabled |
| Actions | **Save draft** (`status: DRAFT`) and **Publish** (create with `PUBLISHED`, or publish the draft with its `version`) |
| Submit | New `Idempotency-Key` per click. Button disabled while sending |
| List | `GET /tournaments/{id}/announcements`, newest first: title, audience, status chip, published time, author |
| Edit | Drafts only. Published rows have no Edit button (`ANNOUNCEMENT_LOCKED`) |
| Delivery | Row → `GET /notifications/{eventId}/deliveries`, shown as counts by state (Accepted, Skipped, Failed) |
| Tournament scope | List and form always use the `:tournamentId` in the URL |

**Check:** publish "Tournament Schedule Update" to Tournament A participants → in A's list, not B's → survives reload. Empty title → blocked. Fast double-click → one announcement.

---

## 4. Tournament operations (#226–#231)

Staff use `/assignments` → `/assignments/:tournamentId` → `/assignments/:tournamentId/live`. Organisers use `/admin/tournaments/:tournamentId/live`. Both render `TournamentDay` with tabs. The tickets' "Marshal Portal" and "Official Portal" are these routes with the staff role.

### 4.1 Pace of play (#226): Marshal, Organiser

**Where:** `TournamentDay/sections/PaceSection.jsx`, `pages/MarshalConsole`.

| Item | Spec |
|---|---|
| Data | `GET …/rounds/{round}/pace`, live via `GET …/pace/stream` (SSE). If the stream drops, poll every 30 s and show "Live updates paused" |
| Row | Group · tee time · current hole · holes completed · minutes behind · status chip |
| Status chips | `ON_PACE` green · `BEHIND` amber · `OUT_OF_POSITION` red · `NOT_STARTED` grey · `FINISHED` grey |
| Filters | Round, status (Behind only), group search |
| Show the status the API gives | Don't recalculate pace in the browser |
| Scope | Marshals only see assigned tournaments. Any other id → access-denied page |

**Check:** Group 4 on hole 7, 15 min behind → row shows hole 7, "15 min behind", amber.

### 4.2 Incidents & escalation (#227): Marshal

**Where:** `TournamentDay/sections/IncidentsSection.jsx`.

| Item | Spec |
|---|---|
| Create | Kind (Slow play, Score dispute, Cart, Safety, Other) · Round · Hole · Group · Players (one or more, required) · Note (required, max 2000) |
| Submit | `POST …/incidents` with `Idempotency-Key`. Button disabled while sending |
| List | Filters: status, kind, round. Columns: time, kind, hole, group, players, state, raised by |
| Escalate | Marshal only. "Send to official" asks for a note → `POST …/incidents/{id}/escalate`. State becomes Committee |
| Detail | Notes timeline from `GET …/incidents/{id}/history` |

**Check:** Group 5 / hole 8 slow play → in the list after reload → escalate → visible to the assigned Official.

### 4.3 Dispute review & resolution (#228): Official

**Where:** `/assignments/:tournamentId/live` (`TournamentDay` with `officialMode`), Incidents tab.

| Item | Spec |
|---|---|
| List | Escalated and open incidents for the tournament. Filters: status, kind |
| Detail | Description, reporter, players, group, hole, history and notes |
| Add note | `POST …/incidents/{id}/notes` |
| Resolve | Decision text (required). Optional **score change**: player, hole, new strokes. Show the current value next to it → `POST …/incidents/{id}/resolve` |
| After resolve | Incident shows Resolved, the decision, who and when. The scorecard and leaderboard show the new score after refetch |
| Already resolved | 422 → "This incident has already been resolved." Reload |
| History | Resolved incidents stay visible under a Resolved filter |

**Check:** hole 6 dispute → Official corrects 5 → 4 with a reason → card shows 4 → score-changes list shows who and why.

### 4.4 Scorecard review, verification & sign-off (#229): Official

**Where:** `TournamentDay/sections/ScorecardsSection.jsx`, `OfficialResultsSection.jsx`, `CardHistory.jsx`.

| Item | Spec |
|---|---|
| List | `GET …/rounds/{round}/cards`. Columns: golfer, thru, gross, net, state (Submitted / Verified / In progress), marker confirmed, open items |
| Card detail | Hole-by-hole player and marker values. Discrepancies highlighted. Blank and unconfirmed holes listed (`verification` block) |
| Verify | Enabled only when `verification.ready = true`. Otherwise disabled, with a tooltip listing the open items |
| Override | "Verify anyway" needs a reason. Show the open items being overridden |
| Correct / Unlock | Reason required. Sends the card `version`. 409 → reload |
| Sign off round | Enabled only when every card is verified. Confirm dialog → `POST …/rounds/{round}/sign-off`. 422 `CARDS_NOT_VERIFIED` → show which cards are missing |
| History | Card history panel shows each change: who, when, before → after, reason |

**Check:** card with a hole-9 mismatch → Verify disabled. Settle it → Verify works. Sign-off blocked until all cards are verified.

### 4.5 Live tournament controls (#230): Organiser

**Where:** `/admin/tournaments/:tournamentId/live` (`RoundOperations.jsx`, `SuspendPlay.jsx`, `FieldSection.jsx`).

| Item | Spec |
|---|---|
| Header | Tournament status, round status, groups started / finished, cards submitted / verified, open incidents |
| Actions shown | Only those valid for the current state, e.g. Start (not started), Suspend (live), Resume (suspended), Publish results (all rounds signed off) |
| Sensitive actions | Start, Suspend, Resume, Cancel, Publish results → confirm dialog. Suspend and Cancel need a reason |
| After an action | Use the state the API returns. Refetch the day view |
| Changed elsewhere | On 409 or 422 for a state transition, reload and say "The tournament status changed. We've loaded the latest." |
| Other tournaments | URL edited to another organiser's tournament → access-denied page, no data |

**Check:** 120 golfers / 30 groups → suspend with a reason → golfers' scoring is blocked (`PLAY_SUSPENDED`) → resume.

### 4.6 Operational reports (#231): Organiser

**Where:** `TournamentDay/sections/OperationalReportsSection.jsx`, `ReportsSection.jsx`, `ReportRecords.jsx`.

| Report | Filters | API |
|---|---|---|
| Registrations | search, status, division | `GET …/reports/registrations` |
| Incidents | kind, state, round | `GET …/reports/incidents` |
| Participation | division | `GET …/reports/participation` |
| Results / Divisions / Winners / Scorecards | — (after results are published) | `GET …/reports/{type}` |

| Item | Spec |
|---|---|
| Filters | Sent as query parameters. **Clear filters** resets and refetches |
| Table | Shows exactly the API rows. No matches → "No records match these filters." |
| Export | **Download CSV**. If the API returns a job, poll `GET /report-jobs/{jobId}` and show "Preparing…" until `READY`, then download. Disable the button while preparing |
| File | Must match the filters on screen. Header block includes tournament, generated time and filters |
| Access | Non-owner → `REPORT_FORBIDDEN` message |

**Check:** Tournament A, Round 2, Unresolved → only matching rows → CSV has the same rows.

---

## 5. Role-based navigation (#237)

**Where:** `src/routers/ProtectedRoute.jsx`, `roleRoutes.js`, `routeConfig.jsx`, `components/shared/AppShell`.

### 5.1 Who sees what

| Route | Golfer | Organiser | Platform admin | Marshal | Official |
|---|---|---|---|---|---|
| `/` home, `/profile` | ✓ | — | — | — | — |
| `/tournaments`, `/tournaments/:id`, `/courses/:id` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/tournaments/:id/play` (scorecard) | ✓ | — | — | — | — |
| `/tournaments/:id/leaderboard` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/admin/**` | — | ✓ (own tournaments) | ✓ | — | — |
| `/admin/organizers` | — | — | ✓ | — | — |
| `/assignments`, `/assignments/:id` | — | ✓ | ✓ | ✓ (assigned) | ✓ (assigned) |
| `/assignments/:id/live` | — | — | — | — | ✓ (assigned) |

### 5.2 Actions inside the live page

| Action | Marshal | Official | Organiser |
|---|---|---|---|
| View pace, raise incident | ✓ | ✓ | ✓ |
| Escalate | ✓ | — | — |
| Resolve, correct score, unlock, verify, sign off | **hidden** | ✓ | ✓ |
| Suspend / resume | — | ✓ | ✓ |
| Staff, announcements, reports, publish results | — | — | ✓ |

Hide actions the role can't use. Don't just disable them. The backend still rejects them [API §6.2].

### 5.3 Behaviour

- Typing a URL the role can't use → redirect to the role's home (`homeRouteForRole`) with "You don't have access to that page."
- Tournament-level 403 from the API → access-denied view inside the page, no partial data.
- Session expired (401 and refresh fails) → sign-in, then return to the page.
- **Logout** clears the auth state, cached queries and any tournament data in memory or storage.
- Switching accounts never shows the previous user's menu or data, even briefly.

**Check:** a Marshal opens `/assignments/:id/live` by URL → blocked. A Marshal never sees Sign off. Organiser A opens Tournament B's `/admin/tournaments/:id/live` → access denied.

---

## 6. Regression journeys (#247, #248)

Run on staging release builds. Record pass / fail / blocked per step with screenshots. Add or extend Playwright tests (`WeHark/Golf-Playwright-automation`) for each journey.

### 6.1 Setup, publish, registration (#247)

| # | Step | Expected |
|---|---|---|
| 1 | Organiser → `/admin/tournaments/new` → individual tournament, course, 1 round, max 20 golfers, fee as needed | Saves. Reopen shows the same values |
| 2 | Edit the name → save | New name persists after reload |
| 3 | Publish with a required field missing | Blocked. Validation lists what's missing (`POST …/validate`) |
| 4 | Complete and publish | Status Published. Registration availability shown |
| 5 | 5 golfers register | Organiser sees 5 registered, 15 spots left |
| 6 | Close registration | A new golfer can't register (`REGISTRATION_CLOSED`) |
| 7 | Reload every page | Same numbers |
| 8 | Repeat 1–7 for a Four-Ball team tournament | Team counts as in §1.2 |

### 6.2 Operations to final results (#248)

Use a separate seeded tournament (20 golfers, 5 groups) so this doesn't wait for 6.1.

| # | Step | Expected |
|---|---|---|
| 1 | Organiser → Flights/Groups → generate groups for round 1 | 5 groups of 4, tee times assigned |
| 2 | Move one golfer between groups. Change one tee time | Saved. Golfer app shows the new tee time |
| 3 | Start the tournament | Status Live |
| 4 | Marshal → pace shows groups. Raise an incident and escalate | Official sees it |
| 5 | Official → resolve with a score correction | Card and leaderboard show the corrected score |
| 6 | Official → verify all cards → sign off the round | Sign-off recorded |
| 7 | Organiser → publish results | Results match the verified scores |
| 8 | Switch between organiser, marshal and official accounts | Each sees only their own menus and data |

---

## Appendix: ticket → section

| Ticket | Section |
|---|---|
| #189 | 1.1 |
| #190 | 1.2 |
| #191 | 1.3 |
| #196 | 3 |
| #203 | 2.1 |
| #204 | 2.2 |
| #226 | 4.1 |
| #227 | 4.2 |
| #228 | 4.3 |
| #229 | 4.4 |
| #230 | 4.5 |
| #231 | 4.6 |
| #237 | 5 |
| #247 | 6.1 |
| #248 | 6.2 |
