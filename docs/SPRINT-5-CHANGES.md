# Sprint 5: changes to the prototypes

Branch `sprint-5` in **golf_web_design** (web) and **golf_flutter_design** (mobile), built on `sprint-4`. This file is the same in both repos.
Scope source: the 57 open GitHub issues labelled `sprint 5` in `WeHark/Golf-App-Issue-Tracking`.
Specs: [`api-contract-sprint-5.md`](./api-contract-sprint-5.md), [`ui-web-sprint-5.md`](./ui-web-sprint-5.md), [`ui-mobile-sprint-5.md`](./ui-mobile-sprint-5.md).

Sprint 5 is mostly validation of what Sprints 1–4 built. The prototypes already covered announcements, delivery status, push permission and navigation, pace, incidents, disputes, verification, sign-off, reports, course import and role-based access. This branch adds only the screens and states that were missing.

## 1. What changed, by ticket

| Tickets | What you can see now | Web | Mobile |
|---|---|---|---|
| **#189** Team capacity setting | Team events (Four-Ball, Scramble) ask for **Maximum teams**. The golfer limit is worked out from it and shown under the field: "Up to 6 golfers (teams of 2)". The old single "Maximum teams" number that was really a golfer count is gone. Bad values (0, negative, decimals) are refused with "Enter a whole number of 1 or more". Older team events get a team limit from their golfer limit (decision D1). | Tournament wizard › Registration & entry; review summary | — |
| **#190** Registered team & golfer counts | Team events show **teams and golfers separately**, everywhere: "3 / 3 teams · 6 golfers". Counts come from the field records, not a local tally. | Field & registrations panel title, tournament-day stat tile, tournaments list, golfer tournament card and page | Tournament card, tournament page tile and spots bar |
| **#191** Registration full | When the team limit is reached: button reads **Registration full**, the bar says **Full**, the organiser's panel says **Team capacity reached** and *Register a golfer* is disabled. The check runs again at the moment of registering: if the field filled after the page opened, the golfer gets "Registration is full. The maximum team capacity for this tournament has been reached." and no confirmation. A team with a free place still takes a partner: "1 partner place left". | Golfer tournament page; organiser Field panel | Tournament page |
| **#203 / #204** Payment result states | After the card is accepted the sheet shows **Confirming your payment…** and only then registers the golfer. The card form closing is never proof of payment. 3-D Secure card → **Payment is processing** (not registered yet, *Check again*). Declined → "Payment didn't go through. You haven't been charged". Closing before paying → "Payment cancelled — you haven't been charged and you're not registered yet". | Payment sheet (`payments.tsx`), golfer tournament page | Payment sheet, tournament page |
| **#232 / #249** Live scoring states | Under the score: **Saved ✓**, **Not saved**, or **Not sent yet · 5 kept on this phone**. **Offline** banner: keep scoring, holes are kept on the phone and sent once when the signal is back ("Back online — 2 scores sent"). An official's correction shows on the hole: "Corrected by Helen Brooks: 5 → 4 · reason". If the hole changes while the golfer is editing it: "Hole 7 was changed to 4 by … while you were editing. Keep your 5?" with **Use 4** / **Keep mine**. | — | Live play (`LivePlay.tsx`) |
| **#233** Tournament info | Tee time **Updated** chip with the change message when the organiser moved the golfer. "Groups not published yet · tee time to be confirmed" before groups exist. **Play suspended** banner (reason) on the tournament page while play is stopped. | — | Tournament page |

### Checked and already covered (no change needed)

| Tickets | Where it already is |
|---|---|
| #196 announcements, #197 / #198 announcement list & detail, #219–#222 push permission, devices, foreground banner, tap-through and unavailable screens | Sprint 4 (AN1, PN1–PN3) |
| #226–#231 pace, incidents and escalation, disputes, scorecard verification and override, sign-off, live controls, operational reports | Sprints 3–4 |
| #237 role-based navigation | Role guards in `App.tsx`, `NoAccess`, staff access windows (`StaffConsole` "Your access has ended"), organisers only see their own tournaments (`scopedTournaments`). Marshals can only close an incident "handled on the course" — they can't change a score; only the committee (official / organiser) can |

## 2. Files

### Shared (same in both repos, so change both)
| File | Change |
|---|---|
| `src/capacity.ts` | **New**: team and golfer limits, registered counts, full / partner-place rules, messages |
| `src/live.ts` | `fieldCapacity(t)`; organiser registration refuses with the team-capacity message; storage key v6 |
| `src/payments.tsx` | Confirming / pending / declined states, `onCancel`, `onPending`, 3-D Secure test card |
| `src/components.tsx` | `SpotsBar` shows teams · golfers and partner places |
| `src/types.ts` | `RegistrationWindow.maxTeams` (mobile also gets `Tournament.participation`) |
| `src/data.ts` | Demo event **t11 Augusta Pines Winter Four-Ball**: registration open, 3 teams of 2, already full |
| `src/store.ts` | Storage key bump so t11 loads |

### Web only
`src/admin/TournamentWizard.tsx` (Maximum teams field, summaries) · `src/admin/tournament-setup.ts` (validation, team-limit migration, golfer limit derived on save) · `src/ops-ui.tsx` (Field panel) · `src/admin/LiveControl.tsx` (stat tile) · `src/admin/ManageTournaments.tsx` (list) · `src/screens/TournamentDetails.tsx` (full state, re-check, payment messages)

### Mobile only
`src/screens/LivePlay.tsx` (offline queue, save status, correction, changed-while-editing) · `src/screens/TournamentDetails.tsx` (capacity, full state, tee-time Updated, suspension banner, payment messages)

## 3. How to try it

| Who | Login | Where |
|---|---|---|
| Golfer (web or mobile) | "Golfer" demo login | **Winter Four-Ball** › Registration full |
| Organiser (web) | `dana@augustapines.com` / `augusta` | Tournaments › **Winter Four-Ball** › edit › Setup › Registration & entry (Maximum teams) · Tournament day › Field (3 / 3 teams · 6 golfers, Team capacity reached). Remove a golfer → "1 partner place left" for golfers |
| Golfer (web) | after removing a golfer as organiser | Winter Four-Ball › Register & pay. Cards: `4242 4242 4242 4242` paid · `4000 0000 0000 0002` declined · `4000 0025 0000 3155` pending (3-D Secure) |
| Golfer (mobile) | "Golfer" | Home › Continue · hole 5 › turn the network off (browser dev tools › Network › Offline, or airplane mode on a phone) › save a hole › turn it back on |

If you've used the prototype before, the new storage keys load the Sprint 5 demo data automatically.

## 4. Prototype limits (what the real build must do instead)

- No backend. "Confirming your payment" is a timer. The real app waits for Stripe's webhook, then re-reads the entry ([API §3.4](./api-contract-sprint-5.md)).
- The web and mobile prototypes keep separate data, so a correction made on web doesn't reach the phone. To see a correction on the phone, change the phone's own demo data.
- The offline queue uses the browser's online / offline events. The real app must also retry when a request fails while "online", and send each hole with the card `version` so a stale hole can't overwrite an official's correction ([API §7](./api-contract-sprint-5.md)).
- Version conflicts (`409 STALE_VERSION`) still need a server. The mobile "changed while you were editing" prompt is the client side of that rule.
