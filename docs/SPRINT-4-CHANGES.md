# Sprint 4: changes to the prototypes

Branch `sprint-4` in **golf_web_design** (web) and **golf_flutter_design** (mobile). This file is the same in both repos.
Scope source: *Golf_Sprint_4_Scope.docx* v1.1 (9 Nov 2026). API: [`api-contract-sprint-4.md`](./api-contract-sprint-4.md) and [`openapi-sprint-4.yaml`](./openapi-sprint-4.yaml).
Videos: `00-sprint-4-full-walkthrough.mp4` covers all seven workflows. Clips `01`–`07` cover one workflow each.

## 1. What changed, by scope item

| Scope | What you can see now | Web (golf_web_design) | Mobile (golf_flutter_design) | API (contract §) | Video |
|---|---|---|---|---|---|
| **SC1** Stableford pickup | Golfer taps **Picked up (no score)**: the hole shows **P**, scores 0 points and counts as played. No stroke count is stored. A blank hole stays incomplete and is a different thing. The marker records **P** too. Player P against a marker number is a discrepancy. Officials can correct to/from Pickup, and the change log says "pickup". Not available in stroke play. | Golfer live play; Scorecards board (Points column "16 · 1P", P cells, Pickup in the correction dialog); scorecards CSV shows P | Live play stepper + Pickup button; "Marking X" **P** button; scorecard sheet; official card sheet | §1.1, §1.4–1.6 | 02, 03 |
| **SC2** Marker verification | New **Marker confirmation** setting: *Required on every hole* (default) or *Checked when entered*. Verify stays disabled until every counting hole is confirmed and nothing is in dispute. Unconfirmed holes show **?** with an amber "N not confirmed" chip. **Verify by override…** needs a reason, lists what's still open and shows **Override · name**, never marker-confirmed. An official's correction **settles** a disputed hole: the marker's value is struck through with ✓ and kept on record. One-player group = no marker, so it needs an override (open point for D01). The rule is also enforced in the store (`verifyCards`), not only in the UI. | Tournament wizard › Scoring & results; Scorecards board; Override modal; change log | Official **Cards** sheet: blockers, override, pickup correction | §1.2, §1.3, §1.6 | 02 |
| **SC3** Scramble | **One shared team card**: every member reads and writes the same score per hole. "Hole N entered by …" is recorded. Submitting hands in the team card for the whole team. Verify, unlock and override apply to the team. Another team in the group marks the card, not a teammate. | Golfer live play banner; results read one team card | Live play "Team card · shared with …" banner | §1.3–1.4 | 04 |
| **CS1** Status / suspension | Unchanged UI. Suspension now also sends notifications. The suspension DTO is in the contract. | — | — | §1.8 | 06 |
| **PN1** Devices | Permission is asked at a useful moment (the Home card, once the golfer is in a tournament): our explanation first, then the OS prompt. If refused: "Alerts are off · Settings" banner, and the app still works. **Notifications** screen lists this account's devices (platform, environment, shortened token). Rotate keeps the same device. **Sign out removes this phone's token.** | — | Home alerts card, `PermissionPrompt`, Profile › Notifications, `NotificationSettings`; sign-out unregisters | §2 | 06 |
| **PN2** Delivery | Each change writes **one event**. Deliveries are per recipient × channel × device. **Email and push are tracked separately.** A dead token retries 3× then fails and the device is removed. "No app" = email only. The versioned payload carries ids only. | Announcements tab: delivery chips + **Delivery** detail (per-recipient states, payload JSON); "Alerts sent for this tournament" | — | §3 | 05 |
| **PN3** Navigation | Foreground banner, **once per alert**. A tap re-checks the current state and the account's access first. Alerts go to announcement detail, tournament (tee-time) or live play (suspension). Safe screens cover stale ("Play has already resumed"), cancelled, other-account and no-longer-assigned cases. | — | `PushBanner`, `openAlert`, `AnnouncementScreen`, `AlertUnavailable` | §3.1 | 06 |
| **Section 7 events** | Tee time changed when an organiser moves a player to another group. Play suspended / resumed. Staff assigned (filling a marshal/official slot). Registration confirmed (mobile register). | Field & groups move → toast "sent the new tee time"; slot invite | Register / pay → event | §3.2 | 05, 06 |
| **AN1** Announcements | Compose → audience (golfers / staff / both, with live counts) → **Preview** (app alert + email + reach) → **Send** once (idempotency key, so a double click sends one) → history with email/push status. Limits 80 / 1000 characters. Not available for draft or cancelled tournaments. Recipients read it in the app. | New **Announcements** tab on the tournament-day page | Announcement detail screen; "Announcements" section on tournament details | §4 | 05, 06 |
| **RP1–RP10** Reports | New **Operational reports** panel (organiser/admin only): **Registrations** (status, division, optional round status; no payment fields), **Incidents** (round, kind, state, date range; notes, escalation, decision), **Participation** (per-round PLAYING/WD/DQ/NS/DNF, cards submitted/verified, stated denominator). Live row counts, "Preparing…" progress, warning when nothing matches, readable errors. Each file starts with tournament, generated time and filters. **All CSVs** (old ones too) are now UTF-8 with BOM, CRLF and **formula-injection-safe** (`'=…`). | Reports tab (`OperationalReports`) | — | §5 | 07 |
| **GC1–GC8** Course import | Courses › **Import from course database**: search by name and country → results with location, provider reference and each layout (18 / 9) → **Preview** (tees with rating/slope, full scorecard, **missing** fields marked) → **Review** (red cells for blocking errors such as missing par or duplicate SI, editable inline; optional gaps listed) → **Import** (course Active; provenance saved; manual fixes recorded). **Dedup**: "imported" badge, "Already imported" panel, controlled **Update from provider** (new course version; refused while a live tournament uses it). Lookalike warning for a hand-made course with the same name. Imported course is selectable in tournament set-up. Golfer course pages credit the provider. Error states for timeout, rate-limit, credentials and malformed data all offer **Add by hand**. | `admin/CourseImport.tsx`, `admin/course-import.ts` (provider adapter stand-in), route `#/admin/courses/import`, Courses list badge, course editor banner, golfer course page | Course page "Course data from …" | §6 | 01 |

## 2. Files

### Shared (identical in both repos, so change both)
| File | Change |
|---|---|
| `src/live.ts` | Pickups (`pickupAllowed`, `setPickup`, `outcomesFor`, `HoleOutcome`), scramble card holder (`cardHolderId`, `teamEntryFor`), leaderboard `pickups`; storage key v5 |
| `src/ops.ts` | Marker pickups, `markerOutcomesFor`, `verifyBlockers` / `blockerText`, `markerPolicyOf`, overrides (`overrideVerify`, `overrideFor`, `canOverride`), committee-settled holes (`settledFor`), invalidation after corrections, scramble marker rule, `correctScore` accepts `'P'`, safe `cell()`/`csv()`, RP1–RP3 builders (`registrationRows/Csv`, `incidentRows/Csv`, `participationSummary/Csv`), notifications on suspend/resume, Sprint 4 demo seed; storage key v2 |
| `src/notify.ts` | **New**: events, outbox worker stand-in, deliveries, announcements, device registry, push payload v1, landing/access check |
| `src/types.ts` | `ScoringRules.markerPolicy`, `Course.source` (+ mobile `ScreenName` additions) |
| `src/data.ts` | Demo events **t9 Augusta Pines Twilight Stableford** (live, 9 holes) and **t10 Augusta Pines Pairs Scramble** (live, teams of 2) |
| `src/store.ts` | Storage key bump so the new demo events load |

### Web only
`src/admin/Announcements.tsx` (new) · `src/admin/OperationalReports.tsx` (new) · `src/admin/CourseImport.tsx` (new) · `src/admin/course-import.ts` (new) · `src/ops-ui.tsx` (scorecards board, correction/override modals, tee-time and staff events) · `src/admin/LiveControl.tsx` (Announcements tab, reports) · `src/admin/TournamentWizard.tsx` (marker policy) · `src/admin/ManageCourses.tsx`, `CourseWizard.tsx`, `AdminShell.tsx`, `src/router.ts`, `src/App.tsx` (import route, provenance) · `src/screens/LivePlay.tsx` (pickup, scramble) · `src/screens/CourseDetails.tsx` (attribution)

### Mobile only
`src/screens/Notifications.tsx` (new) · `src/screens/LivePlay.tsx` (pickup, marker P, scramble banner, points) · `src/ops-ui.tsx` (official card sheet) · `src/App.tsx` (screens, banner, sign-out unregisters) · `src/screens/Home.tsx` (alerts card, bell → settings) · `src/screens/Profile.tsx` (Notifications row) · `src/screens/TournamentDetails.tsx` (announcements, registration event) · `src/screens/CourseDetails.tsx` · `src/index.css` (banner animation)

## 3. How to try it

| Who | Login | Where |
|---|---|---|
| Organiser (web) | `dana@augustapines.com` / `augusta` | Courses › Import from course database · Tournaments › Club Championship › **Announcements**, **Reports**, Field & registrations (move a player) |
| Official (web) | `official@gmail.com` / `official` | My assignments › **Twilight Stableford** › Scorecards (pickups, discrepancy, "1 not confirmed", override) |
| Golfer (mobile) | "Golfer" under *Try a role* | Events › Twilight Stableford › Enter my scores (pickup) · Events › Pairs Scramble (team card) · Home › **Turn on** alerts · Profile › Notifications › *Send me a test alert* |

Course import demo searches: `Lakeview` (clean, 18 + 9-hole layouts), `Cedar Ridge` (missing women's ratings), `Harbourside` (missing par + duplicate SI to fix), `Augusta` (lookalike of an existing course), `Riverbend` (malformed), `timeout` / `busy` / `key` (provider failures).
If you've used the prototype before, the new storage keys load the Sprint 4 demo data automatically. **Reset demo data** (admin) also works.

## 4. Prototype limits (what the real build must do instead)

- No backend: everything is in localStorage. The web and mobile prototypes are separate apps, so an announcement sent on web doesn't reach the phone. The phone has *Send me a test alert*, which fires the same events.
- The outbox worker, FCM/APNs and email are simulated by a timer. "Accepted" means provider-accepted only.
- The course provider is a demo catalogue behind `course-import.ts`. The real adapter is server-side (key never in the client) and is chosen in **S4-D03**.
- Version conflicts / stale-version reloads (`409 STALE_VERSION`) are in the contract but can't be shown without a server.

## 5. Decisions still needed (see contract §10)

D01: legacy marker policy, whether officials may override, one-player groups, Four-Ball/scramble partner status matrix, team denominators · D02: TTLs, report size limit, announcement limits · D03: provider, licensing, refresh policy.

## 6. Bugs fixed along the way

- An official correcting a disputed hole back to the player's value left the discrepancy open, because the marker's record still differed. The hole is now **settled by the committee** and shown as such.
- Scramble players were assigned their own teammate as marker. A player from another team in the group now marks the shared card.
- CSV exports weren't protected against spreadsheet formulas and had no BOM, so accents could break in Excel.
