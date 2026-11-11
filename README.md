# Golf Tournament Platform — Web

Desktop / responsive web version of the Golf Tournament mobile UX, using the same design system
(colours, type, cards, pill buttons, lime accent) and the same mock data.


## Sprint 4 (branch `sprint-4`)

Pickups in Stableford, marker confirmation policy + official override, the scramble shared team card, push notification states,
organiser announcements, operational CSV reports and course import from an external provider.
What changed and how to try it: [`docs/SPRINT-4-CHANGES.md`](docs/SPRINT-4-CHANGES.md) · API contract: [`docs/api-contract-sprint-4.md`](docs/api-contract-sprint-4.md) ([OpenAPI](docs/openapi-sprint-4.yaml)).

## Run

```bash
npx pnpm@9 install   # first time only
npx vite             # http://localhost:5180
```

There is **one sign-in page** (`#/signin`) for every role. The account decides where you land: platform staff and
organisers open the admin console, marshals and tournament officials open their tournament, golfers open the golfer home.
(`#/admin/login` still works and opens the same page.) **Try a role** under the form fills a demo login in one tap.

## Roles and logins

| Role | Demo login | Lands on | What they can do |
|---|---|---|---|
| **Golfer** | any other email, any password (`wrongpass` / `serverdown` show the error states) | `#/home` | Find and enter tournaments (paid by card), score their round, **mark their partner's card**, settle mismatches, ask for a ruling, see the leaderboard |
| **Organiser** | `dana@augustapines.com` / `augusta` (runs the live championship) · `owner@savannahgolf.com` / `savannah` · `hello@coastalcharity.org` / `coastal` (pending review) | `#/admin` (organiser console) | Set up tournaments; on the day: scorecards, field and groups, pace, disputes, marshal/official logins, score-change history, publish results |
| **Marshal** | `marshal@gmail.com` / `marshal` | `#/staff/t8` | Pace of play, log incidents (slow play, carts, rules, safety), send rulings to the committee, tee sheet and contacts. **No scores.** |
| **Tournament official** (committee) | `official@gmail.com` / `official` | `#/staff/t8` | Check scorecards against the marker's card, correct scores with a reason, verify cards, decide disputes, score-change history |
| **Platform admin** | `admin@gmail.com` / `admin` (more staff in `src/admin/access.ts`) | `#/admin` | Everything, across all organisations: organiser approvals, courses, roles, users |

- **Marshals and officials are per tournament** (client, 16 Oct): the organiser fills a *slot* on the tournament with a name and
  email, and that person gets a login. Before the day it opens the tee sheet and contacts only; on the day, the full console; once the
  tournament closes, nothing. `marshal@gmail.com` shows all three: live (Club Championship), upcoming (Classic Open), ended (Lowcountry Scramble).
- **One account, several roles:** the demo golfer is also marshal at the Carmel Bay Stableford Cup. *Your other roles* in the golfer
  sidebar switches to it, and *Switch to my golf* switches back.
- People invited from the organiser console sign in with the demo password `golf1234` (shown when the login is sent).
- Five wrong passwords on a console account lock it for 15 minutes (this browser session).

Or use **Sign up** to go through account creation and the golfer profile or organisation setup.

## Pages

| URL | Page |
|---|---|
| `#/signin` | Single sign-in for golfers, organisers and admins (routes by role) |
| `#/signup`, `#/setup`, `#/organizer-setup` | Sign up (golfer or organiser: first / last name, terms + optional marketing consent, common passwords blocked). Golfer setup (spec: `Docs/REGISTER GOLFER.txt`): verify email (demo link, or verify later — needed before registering for a tournament) → about you (age 13+, juniors flagged, ratings choice for non-binary / prefer not to say, optional address, emergency contact) → your game (Handicap Index or "not yet", plus handicaps as +2.0, issuing body, home club, membership) → preferences (contact method, dietary). Organisation setup (spec: `Docs/REGISTER ORGANIZER.txt`) |
| `#/home` | Dashboard |
| `#/tournaments` | Tournament grid with search and filters |
| `#/tournaments/:id` | Tournament details: schedule, scoring, divisions, eligibility, fees, prizes, local rules, contacts, register / waitlist / withdraw |
| `#/tournaments/:id/leaderboard` | Live leaderboard (gross / net / Stableford, divisions, hole-by-hole cards) |
| `#/tournaments/:id/play` | Live scoring: hole map, distances to the green and hazards, tap-to-measure, mark the ball (tap or GPS), score entry, submit card |
| `#/courses/:id` | Course details: scorecard, tees (rating/slope per gender), hole guide with maps, facilities, contact, directions |
| `#/profile`, `#/profile/edit` | Profile and edit profile |
| `#/admin/tournaments/new`, `#/admin/tournaments/:id` | Create / edit tournament wizard (spec: `Docs/CREATE TOURNAMENT - REVISED.txt`): **A · Essentials** (basics, format & participation, rounds & course, divisions & tees, handicap & scoring, tie-breaks) → **B · Setup** (registration, fees with tax, tee sheet with preview, rules & pace of play & officials, scoring & results, prizes, visibility) → **C · Review & publish** (summary, blocking errors, warnings). Drafts need only a name; format and fee lock once golfers register; live / completed tournaments are read-only |
| `#/admin/tournaments/:id/live` | Tournament day (tabs): **Scorecards** (marker check, corrections with a reason, verify) · **Field & groups** (tee sheet, remove / replace a player, move groups, change a player's tees until they tee off) · **Pace of play** · **Disputes & incidents** · **Marshals & officials** (fill slots, send logins, see who's signed in) · **Score changes**. *Publish results* closes the tournament for good |
| `#/admin/courses/new`, `#/admin/courses/:id` | Create / edit course wizard (spec: `Docs/CREATE COURSE.txt`): **A · Course & location** (facility and course name, holes, type, unit, description, cover photo; address with postal-code check and map pin; contact, facilities, dress code, status) → **B · Tees & scorecard** (tee sets with men's / women's rating and slope, front / back 9 ratings; scorecard grid with par, stroke index, women's values, yards per tee, hole notes, WHS stroke-index guidance) → **C · Review & activate**. Courses are Draft → Active → Archived; only Active courses can be chosen for tournaments. Changing ratings on an active course creates a new ratings version from today and keeps the old one in its history |
| `#/admin/organizers` | Organiser review (platform admins): oldest first, review checklist (email verified, website matches owner email, registration number / Golf Canada ID, duplicates), approve (only once the owner has verified their email) or reject with a reason — decided once; then suspend / reactivate. Every decision is kept in the history |
| `#/staff` | Marshal / official: **My assignments** — live, upcoming and ended tournaments for this login |
| `#/staff/:id/pace` | Marshal: groups by tee time, hole they're on, minutes behind, out-of-position flag, *Log warning* |
| `#/staff/:id/incidents` | Marshal: log incidents, *Handled on the course* or *Send to committee*. Official: **Disputes & incidents** — decide, optionally change a score |
| `#/staff/:id/scorecards` | Official: every card against the marker's record (mismatches in red), correct with a reason, verify |
| `#/staff/:id/changes` | Official: audit trail of every score changed after entry (who, when, why, from which dispute) |
| `#/staff/:id/tee-sheet` | Marshal / official: tee sheet and contacts (the only page before tournament day) |
| `#/admin/organisation` | Organisation profile (organisers): review status, details, verification and events; editable. While pending: drafts only, no team invites |

### Live demo

**Augusta Pines Club Championship** (`t8`) is live. Sign in as a golfer: Home shows "Playing now";
the golfer is on hole 5 of round 1. The rest of the field moves on every few seconds while the leaderboard is open
(or press "Simulate next hole" in the admin live page). Hole maps are drawn on a yard grid generated from par and
yards; in production each point is a GPS coordinate and the map sits on satellite imagery.

Hash URLs work on any static host (e.g. GitHub Pages) without server rewrites.
Build for a sub-path with `BASE_PATH=/repo-name npx vite build`.

## Client answers built in (Sprint 2 clarification matrix + 16 Oct call)

| Ref | Decision | Where |
|---|---|---|
| T-02 | Divisions can play different tees; a player keeps the same tees all tournament | Divisions; organiser can change a player's tees only before they tee off |
| T-03 / T-05 | After publishing: remove players, change grouping / tee time / tees; replace a team member | Tournament day → Field & groups |
| T-04 | **No waiting list** — organisers manage the field | Removed from set-up and registration; a full field shows *Field is full* |
| T-06 | Online payment as early as possible (Stripe) | Registration → payment sheet (`src/payments.tsx`; test card 4242 4242 4242 4242) |
| T-07 | Allowances per format; Scramble 35/15 · 30/20/10 · 25/20/15/10 | Set-up → Handicap & scoring (`FORMAT_ALLOWANCES`, `scrambleTeamHandicap` in `golf.ts`) |
| T-09 | Golfers submit the card as entered; invalid values blocked | Submit allowed with blank holes (with a warning); strokes limited to 1–15 |
| T-10 | Organisers/committee correct scores with an audit trail | Every correction needs a reason → Score changes |
| T-12 | **No cuts** | Removed from set-up and review |
| T-14 | A closed tournament can't be reopened | Publishing results closes it; cards become read-only |
| Call | Marshal = per-tournament slot with its own login; no say in scores | Marshal console, slots on the tournament |
| Call | Markers: partners mark each other; disagreements settled on the spot, else the committee decides | Golfer live play, official scorecards, disputes |
| Call | TagMarshal GPS later; pace from scores for now | Pace of play note; `paceFor` in `src/ops.ts` |

## Structure

- `src/App.tsx` — routes and sign-in guard
- `src/router.ts` — tiny hash router
- `src/app-context.tsx` — auth, toast and dialog state
- `src/shell.tsx` — sidebar, top bar, page header, auth split layout, toast, dialog
- `src/components.tsx` — shared UI (same as the mobile project, plus web tweaks)
- `src/data.ts`, `src/types.ts` — mock data and types (shared with mobile)
- `src/account-rules.ts` — sign-up rules shared with mobile (postal codes, blocked passwords, names, golfer profile steps)
- `src/golf.ts` — golf rules and defaults: tee sets, hole maps, handicaps, Stableford, tee times
- `src/live.ts` — tournament-day store: field, tee groups, scorecards, marked shots, leaderboard, field edits
- `src/ops.ts` — roles on the day (identical copy in the mobile prototype): marshal/official slots and logins, incidents and disputes, marker scores, score-change audit trail, pace of play
- `src/ops-ui.tsx` — tournament-day panels shared by the organiser console and the marshal / official consoles
- `src/staff/StaffConsole.tsx` — marshal and official consoles (layout, assignments, per-tournament pages)
- `src/payments.tsx` — entry-fee payment sheet (Stripe in production)
- `src/hole-map.tsx` — SVG hole map (editor, course guide, live play)
- `src/screens/` — one file per page
- `src/admin/TournamentWizard.tsx` + `tournament-setup.ts`, `src/admin/CourseWizard.tsx` + `course-setup.ts` — the wizards (screens + rules); `wizard-ui.tsx` holds the shared wizard parts
- Design rules: `.claude/skills/golf-ux-design/SKILL.md` (repo root)

This is a prototype: there is no backend. Admin edits, tournament-day data and incidents are kept in this browser's localStorage; **Reset demo data** in the admin console (as `admin@gmail.com`) restores everything.
"# golf_web_design" 
