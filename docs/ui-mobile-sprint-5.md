# Sprint 5 — Mobile UI specification (Flutter Golfer App)

Status: **draft for review** · Prepared 24 Nov 2026
Repo: `WeHark/Golf-Mobile-App`, branch `develop`. Screen names are the route names in `lib/app/routes/app_routes.dart`.
API details: see `api-contract-sprint-5.md` (section numbers in brackets, e.g. [API §4.2]).
Scope: the 9 `mobile` tickets in Sprint 5. Also covers paid checkout, which lives only in this app (see §6).

Sprint 5 is **validate and fix** on Android and iOS release builds against staging. Build nothing new unless the section says so.

---

## 0. Rules for every screen

| Rule | Detail |
|---|---|
| Server is the truth | Scores, totals, statuses and tee times shown as current must come from the latest API response |
| Four states | **Loading** (skeleton or spinner) · **Empty** (friendly line, not a blank screen) · **Error** (message plus Retry, app never crashes) · **Loaded** |
| Pull to refresh | On every list and detail screen |
| Refresh on return | Refetch when the app comes back to the foreground and when a screen is reopened |
| Offline | Show "You're offline" in a banner, keep the last data visible, and mark it as possibly out of date |
| No false success | Show success only after a 2xx |
| One submit at a time | Disable the button while its request is in flight |
| Never overwrite local edits | A background refresh must not replace a hole the golfer is typing or hasn't saved yet |
| Errors | Same codes and messages as the web spec §0.1. Show `traceId` only in a "details" expander |
| Release builds | `BASE_API_URL` must be https. Debug base-URL switching is never in release |

---

## 1. Announcements (#197, #198)

Code: `lib/app/modules/announcements/` (`announcement_pages.dart`, `announcement_repository.dart`).

### 1.1 List: route `announcements` (arg: `tournamentId`) (#197)

| Item | Spec |
|---|---|
| Entry point | "Announcements" on the tournament details screen |
| Data | `GET /tournaments/{id}/announcements` [API §2.3]. The server already filters by audience. Don't filter again on the device |
| Row | Title · first 2 lines of the message · published time ("2h ago", full date after 7 days) |
| Order | Newest first |
| Empty | "No announcements yet." |
| Error | "Couldn't load announcements." plus Retry |
| Scope | Only this tournament's announcements. Nothing from tournaments the golfer isn't registered for |

**Check:** golfer registered in A, not B → sees A's announcement, never B's. Pull to refresh shows a new one.

### 1.2 Detail: route `announcement` (arg: `AnnouncementArgs(id, tournamentId)`) (#198)

| Item | Spec |
|---|---|
| Data | `GET /announcements/{announcementId}` |
| Shows | Full title, full message (selectable text), published time, tournament name |
| Back | Returns to the list for the same tournament. When opened from a notification with nothing behind it, Back goes to `tournament_details` for that tournament |
| Deleted / not found (404) | "This announcement is no longer available." plus button back to the tournament |
| Not allowed (403 `NOT_A_RECIPIENT`) | "This announcement isn't available to you." **Show no content** |
| Duplicates | Opening the same announcement twice doesn't stack two detail screens |

**Check:** tap "Round 2 Schedule" → that announcement opens → Back → list.

---

## 2. Push notifications (#219–#222)

Code: `lib/app/notifications/` (`push_service.dart`, `device_registrar.dart`, `push_payload.dart`, `notification_router.dart`).

### 2.1 Permission & device registration (#219)

| Step | Behaviour |
|---|---|
| When to ask | After the first successful sign-in, not on the login screen. iOS: the system prompt. Android 13+: `POST_NOTIFICATIONS` prompt |
| Granted | Get the FCM token → `POST /me/devices` with `platform`, `environment` (`STAGING` / `PRODUCTION` from the build), `token`, `appVersion`, `installationId` [API §4.1] |
| `installationId` | A UUID generated once per install and kept in local storage. Survives logout |
| Denied | The app works normally. Profile/settings shows "Notifications are off" with a link to system settings. No error dialog, no false "registered" message |
| Same token already registered | Don't call the API again (compare with the stored token + account) |
| Network failure | Retry silently on next app start or reconnect. Never block the UI |
| Logout | `DELETE /me/devices/{deviceId}`, then clear the stored `deviceId`. If that fails, the next user's sign-in re-registers the same `installationId`, and the server moves it to them |

**Check:** fresh install → sign in → allow → device appears in `GET /me/devices`. Deny → app usable, no device registered. Log out and sign in as another golfer → the device belongs only to the new golfer.

### 2.2 Token refresh (#220)

| Item | Behaviour |
|---|---|
| Listener | Subscribe to `FirebaseMessaging.onTokenRefresh` once, at app start |
| On new token | If signed in and a `deviceId` exists → `PUT /me/devices/{deviceId}` with `{ token }`. Without a `deviceId` → `POST /me/devices` |
| Unchanged token | Don't send |
| Offline | Store as pending. Send on reconnect or next start |
| On app start | Compare the current token with the last one sent and sync if different |
| Never | Interrupt navigation or scoring while syncing |

**Check:** force a token refresh (reinstall Play Services data, or delete the token in debug) → backend shows the new token → the next push arrives.

### 2.3 Receiving in each app state (#221)

| App state | Behaviour |
|---|---|
| **Foreground** | Don't show a system banner. Show an in-app banner at the top for 4 s: the title from `NotificationType` (e.g. "New tournament announcement") and a **View** button. **Don't navigate automatically.** On the live scoring screen, the banner never covers the score entry and never takes focus |
| **Background** | System notification (title and body from the FCM notification block). Tap → §2.4 |
| **Terminated** | System notification. Tap starts the app. `getInitialMessage()` → hold the payload until sign-in and first frame are done → §2.4 |
| Same `eventId` twice | Handle once (the router keeps the last 100 event ids) |
| Bad payload | Unknown `v`, non-UUID `eventId`, or announcement without a UUID `resourceId` → "This notification can't be opened." No crash |

Check on a real Android device and a real iPhone with the staging Firebase project.

### 2.4 Tap → destination (#222)

Payload [API §4.2]: `{ v, type, eventId, tournamentId, resourceId }`.

| `type` | Opens |
|---|---|
| `ANNOUNCEMENT` | `announcement` with `AnnouncementArgs(resourceId, tournamentId)` |
| `TEE_TIME_CHANGED`, `SCHEDULE_UPDATED`, `REGISTRATION_CONFIRMED`, `PLAY_SUSPENDED`, `PLAY_RESUMED`, `PARTICIPANT_STATUS_UPDATED` | `tournament_details` with `tournamentId` |
| Anything else | `tournament_details` |

| Case | Behaviour |
|---|---|
| Not signed in | Keep it pending. Show "Sign in to see this update." After sign-in, open the destination (`consumePending`) |
| Signed in as someone else | The API returns 403 → the screen shows its not-allowed state. No content |
| Tournament or announcement deleted | The screen shows its not-found state |
| Same notification tapped twice within 2 s | Opens one screen |
| Back | Goes to the screen underneath, or to `main` if the app was launched by the tap |

**Gap:** the app defines `STAFF_ASSIGNED`. Confirm with the backend whether it is sent [API §4.2].

**Check:** "Tournament A — Round 2 information updated" opens Tournament A. "New announcement" opens that announcement. Both work from foreground, background and terminated states.

---

## 3. Live scoring & leaderboard (#232)

Code: `lib/app/modules/play/live_scoring_page.dart` (route `live_play`), `tournaments/leaderboard_page.dart` (route `leaderboard`), `live/`.

### 3.1 Scorecard

| Item | Spec |
|---|---|
| Load | `GET /tournaments/{id}/rounds/{round}/my-card` for the correct tournament, round and golfer |
| Hole entry | `PUT …/my-card/holes/{hole}` with `{ strokes, outcome, version }`. Pickup only for Stableford (`PICKUP_NOT_ALLOWED` otherwise) |
| Saved indicator | Per hole: Saving… / Saved ✓ / Not saved (tap to retry) |
| Totals | Thru, gross, and net (when the format uses handicap), taken from the response `totals`. Don't add them up on the device |
| Status chip | In progress · Submitted · Verified · Locked |
| Marker | Shows the marker's value per hole. Differences highlighted with "Your marker recorded 5" |
| Submit | Confirm dialog listing blank holes → `POST …/my-card/submit` with `{ acknowledgeBlankHoles, version }` |
| Official correction | When the card reloads with a changed hole, mark that hole "Corrected by official" and update totals. Only that hole changes |
| Conflict (409) | Reload the card. Keep the golfer's unsaved entry on screen and ask "Your marker or an official changed this card. Keep your entry for hole 7?" |
| Locked / suspended / signed off | Entry disabled with the reason (`CARD_LOCKED`, `PLAY_SUSPENDED`, `ROUND_SIGNED_OFF`) |

### 3.2 Leaderboard

| Item | Spec |
|---|---|
| Data | `GET /tournaments/{id}/leaderboard?round=&view=&divisionId=`. Live via `…/leaderboard/stream` (SSE) while open; poll every 30 s if the stream isn't available |
| View | Gross / Net toggle when the format has both |
| My row | Highlighted, with "You" |
| Out of order | Ignore a response older than the one already shown (compare response time or version) |
| Empty | "No scores yet." |

**Check:** enter hole 7 → leaderboard position updates. Official corrects hole 7 → card and leaderboard show the correction. Other holes unchanged.

---

## 4. Tournament info & schedule (#233)

Code: `tournaments/tournament_details_page.dart` (route `tournament_details`), `home/home_page.dart`, `main_shell/`.

| Item | Spec |
|---|---|
| Data | `GET /golfers/me/tournaments`, `GET /golfers/me/home`, `GET /tournaments/{id}` |
| Shows | Tournament status, round status, my group, tee time (tournament time zone, labelled), playing partners, start hole |
| Actions by state | Not started: Register / Withdraw (if allowed). Live: **Start scoring** → `live_play`. Suspended: "Play suspended" banner, scoring disabled. Completed: Results and Leaderboard. Hide actions the state doesn't allow |
| Changes | Tee time or group changes show after pull to refresh, on reopen, or on a `TEE_TIME_CHANGED` push. Highlight a changed tee time once with "Updated" |
| Missing data | No group yet → "Groups not published yet." No tee time → "Tee time to be confirmed." |
| Staff info | Never show incident notes, staff contacts or other staff-only fields |

**Check:** Organiser moves Group 6 from 09:00 to 09:30 → golfer refreshes → 09:30 shown, never 09:00 again.

---

## 5. End-to-end golfer regression (#249)

Use seeded staging data (golfers, groups, tee times, markers) so this doesn't wait for web. Run on **Android and iOS release builds**. Record pass / fail / blocked with screenshots. Add or extend Flutter integration tests for steps 3–9.

| # | Step | Expected |
|---|---|---|
| 1 | Sign in as Golfer A | Home shows the assigned tournament |
| 2 | Open the tournament | Round, Group 3 and tee time correct |
| 3 | Start scoring. Enter holes 1–9 | Each hole shows Saved ✓. Totals match the server |
| 4 | Close the app completely. Reopen | Holes 1–9 still there |
| 5 | Turn on airplane mode, enter hole 10, turn it off | Hole 10 shows Not saved, then saves on retry. No duplicate |
| 6 | Finish 18 holes and submit | Status Submitted |
| 7 | Marker (Golfer B) confirms. Create one mismatch | Mismatch shown to both. Card can't be verified until it's settled |
| 8 | Official corrects one hole on the web | Golfer A sees the corrected hole and new total |
| 9 | Open the leaderboard | Golfer A's row matches the server's numbers |
| 10 | Official publishes results | Results screen shows the final standings |

---

## 6. Paid registration in the app (supports #202–#204)

Code: `lib/core/payments/card_payments.dart` (Stripe payment sheet, ticket M-08). Web has no checkout. See decision D7 in the API contract.

| Step | Behaviour |
|---|---|
| Fee | Tournament details shows the fee, or "Free" |
| Register | `POST /tournaments/{id}/registrations`. If `status = PENDING_PAYMENT` with `payment.clientSecret`, open the Stripe payment sheet with that secret |
| Sheet result `paid` | Show "Payment processing…" and re-read the entry until it is `REGISTERED` (up to 1 min), then "You're registered" |
| `cancelled` | "Payment cancelled. Your place is held for a limited time." plus **Pay now** (uses the held `clientSecret`) |
| `failed` | Stripe's message plus **Try again** |
| No publishable key in the build | Hide card payment. Say "The organiser will send you a payment link." |
| Never | Mark the entry paid from the sheet result alone |

Build with `--dart-define=STRIPE_PUBLISHABLE_KEY=pk_test_…` for staging.

---

## Appendix: ticket → section

| Ticket | Section |
|---|---|
| #197 | 1.1 |
| #198 | 1.2 |
| #219 | 2.1 |
| #220 | 2.2 |
| #221 | 2.3 |
| #222 | 2.4 |
| #232 | 3 |
| #233 | 4 |
| #249 | 5 |
