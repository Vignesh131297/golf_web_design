# AJ review — UI walkthrough and confirmations

**Meeting:** Wednesday 25 November 2026, 9:00 AM (IST) · follow-up to the Sprint 4 demo on 24 Nov
**Presenter:** Vignesh (screen share) · **Client:** AJ
**What we show:** the clickable prototypes — web console (`golf_web_design`, `main`) and golfer app (`golf_flutter_design`, `main`)
**Same file in both repos.** Status legend used throughout:

| Tag | Meaning |
|---|---|
| ✅ **Implemented** | Works in the prototype today |
| 🔍 **Needs validation** | Works, but AJ must confirm the rule or wording |
| ❌ **Not implemented** | Not in the prototype |
| 💡 **Proposed** | Added for this meeting as a proposal — needs AJ's approval before it is built for real |

---

## 1. Meeting objective

1. Walk AJ through the tournament journey screen by screen and **agree the labels, field names and terminology**.
2. Confirm how **handicap strokes, stroke index, Stableford points and pick-up** should work, using AJ's own handicap 12 vs 18 example.
3. Show the **Hole-in-One register** proposal.
4. Note the **payment / physical POS** question as a separate technical item.
5. Book the **30-minute scoring session**.
6. Record each answer in the checklist (§11): Approved / Changes required / Pending.

**How to open the demo**

| Where | How |
|---|---|
| Web console | GitHub Pages site of `golf_web_design` (deployed from `main`), or locally: `npm install && npm run dev` |
| Golfer app | `golf_flutter_design`: `npm install && npm run dev`, open at phone width (430 px) or on a phone |
| Organiser login | `dana@augustapines.com` / `augusta`, or the **Organiser** demo button |
| Golfer login | **Golfer** demo button (Alexander Hartwell, HI 6.4) |
| Fresh data | Demo data loads on first open. To reset, clear the site's storage in the browser. |

---

## 2. AJ's actual requirements from the Sprint 4 demo (24 Nov)

| # | AJ said (paraphrased from the transcript) | Our action |
|---|---|---|
| R1 | Online payment via Stripe is fine — **can the same facility work with a physical point-of-sale machine** (tap / insert a card)? | Separate technical discussion (§8). Not approved for build. |
| R2 | **Handicap and stroke index**: a 12-handicap gets no stroke on a stroke-index-15 hole, an 18-handicap gets one, so their **pick-up point differs** ("Campa" example). | Worked example added to set-up; rules to confirm (§5). |
| R3 | Don't just say "two over" — tell the golfer **"Please pick up your ball after double bogey."** | Pick-up message added on the scoring screen (proposal, §5). |
| R4 | Terminology confirmed: **Birdie, Eagle, Albatross, Bogey, Double Bogey, Triple Bogey**. | Labels updated (§6). |
| R5 | **"A separate placeholder where we can capture specific Hole-in-One incidents from any tournament … as a separate database."** | Hole-in-One register proposal (§7). |
| R6 | **"Whosoever is doing this scoring, please set up a 30-minute call."** | Separate session (§9). |
| R7 | Follow-up next morning; time moved earlier (9:00). | This meeting. |

---

## 3. Complete UI walkthrough (presentation order)

### Step 1 — Open the application
- Web: sign-in page → **Organiser** demo login → lands on **Dashboard** (`#/admin`).
- Left navigation (organiser): **Dashboard · Tournaments · Courses · Hole-in-One · Organisation · Roles & permissions · Team**.

### Step 2 — Screen 1: Tournament listing ✅
**Path:** Tournaments (`#/admin/tournaments`)

| Element | Actual UI |
|---|---|
| Page heading | **Tournaments** (eyebrow: organisation name) |
| Search | "Search tournaments" |
| Status filter chips | All · Draft · Coming soon · Registration open · Registration closed · Upcoming · Live — in progress · Completed · Cancelled |
| Table columns | **Tournament** (name, with format and division line under it) · **Dates** · **Players** (team events: "3 / 3 teams" + golfers) · **Status** · **Actions** |
| Actions | One tournament-day button whose label follows the status (**Registrations** / **Tee sheet** / **Live** / **Results**) · Edit · Delete |
| Top button | **New tournament** |

**Explain:** the status drives what golfers see (e.g. *Coming soon* is visible but not open for entry).
**Missing:** no separate **Golf course** or **Format** column — they sit under the name. ❌
**Ask AJ:** Are the status names right ("Coming soon", "Live — in progress")? Should course and format be their own columns?

### Step 3 — Screen 2: Create tournament ✅
**Path:** Tournaments › **New tournament** (`#/admin/tournaments/new`). Three steps: **A Essentials → B Setup → C Review & publish**. Bottom bar: Back · Close · Continue.

| Step | Section | Main fields (actual labels) |
|---|---|---|
| Essentials | Basic information | Name *, Category *, Description *, Logo link, Contact person *, Contact email *, Contact phone |
| | Format & participation | **Participation type** (Individual / Team) · **Format** · Team size · Team formation (Golfers register with partners / I build the teams) |
| | Rounds & course | **Golf course** *, Number of rounds, per round: Date, Holes (18 / Front 9 / Back 9), Round name |
| | Divisions & tees | Division, Handicap range, Gender, Age range, Tees |
| | **Handicap & scoring** | Handicap usage (Handicap / Scratch) · Handicap system: WHS · Handicap lock date * · Maximum Handicap Index · **Handicap allowance** (slider, recommended 95% Stroke Play / Stableford, 85% Four-Ball; scramble shares) · **Worked example: handicap 12 vs 18** 💡 · Results shown (Gross / Net / Gross and net) |
| | Tie-breaks | Countback / Playoff / Shared position, Playoff holes |
| Setup | Registration & entry | Registration opens / closes, Max players (team events: **Maximum teams** → golfer limit worked out), Registration method, Allow withdrawal, Official handicap required, Club members only |
| | Fees | Fee type (Free / Per player / Per team / Per group), Currency *, Amount *, Add tax / HST, includes |
| | Tee sheet & pairings | Tee times / Shotgun, Group size, Interval, Starting tees (1st tee / 1st and 10th), Pairing method, Publish tee sheet on |
| | Rules & officials | Local rules, officials (Name, Role, Phone), Marshals & officials slots |
| | Scoring & results | Score verification, **Marker confirmation** (Required on every hole / Checked when entered), Stableford pickup note, Results release |
| | Prizes, Communication & visibility | Prize name, Prize, Division, Hole (for hole prizes) |
| Review & publish | Summary of every section, warnings, **Publish** | |

**Show:** open *Augusta Pines Twilight Stableford* → Essentials → Format & participation, then Handicap & scoring (this tournament is live, so it opens **view only** — safe to click through).
**Ask AJ:** Are field names right? Anything missing? Which fields should change with the format (see §4)?

### Step 4 — Screen 3: Tournament formats ✅ / 🔍
Supported formats (`TournamentFormat`): **Stroke Play · Stableford · Four-Ball · Scramble**. Individual = Stroke Play or Stableford; Team = Four-Ball or Scramble. Comparison in §4.
**Not in the prototype:** match play, foursomes, other team formats ❌ (allowances for them are listed as reference only).

### Step 5 — Screen 4: Course and hole configuration ✅
**Path:** Courses (`#/admin/courses`) → open *Augusta Pines Golf Club*; or **Import** (`#/admin/courses/import`) from the course database.

| Element | Actual UI |
|---|---|
| Course details | Name, address, holes (9 / 18), facilities, status (Open / Closed / Maintenance) |
| Scorecard per hole | **Hole · Par · Stroke index** (men; women's par / SI where different) · yardage per tee |
| Tee sets | Name / colour, yardages, men's & women's **course rating and slope** |

**Explain:** stroke index decides where handicap strokes fall (SI 1 = hardest hole, gets the first stroke). Rating and slope turn a Handicap Index into a course handicap.
**Ask AJ:** Is hole / par / SI / tees / rating / slope enough?

### Step 6 — Screen 5: Golfers and handicaps ✅
**Path:** Tournament › **Tournament day** › **Field & registrations** tab (`#/admin/tournaments/t8/live`). The list's **Registrations** button opens the same page.

| Column | Meaning |
|---|---|
| Player | Name (+ ID / handicap verified ticks) |
| **HI** | Handicap Index |
| Division | e.g. Championship (0–9.9) |
| Entry | Online / By organiser, payment status |
| Tees | Tees the golfer plays |
| Group | Group assignment |
| Actions | Replace · Remove |

Header: **Field · 16 / 48** (team events: *3 / 3 teams · 6 golfers*). Button: **Register a golfer**.
**Ask AJ:** More golfer information needed (club, membership no., phone, gender, age)?

### Step 7 — Screen 6: Groups and tee times ✅
**Path:** Tournament day › Field & registrations › **Tee sheet · round 1**; organiser tee sheet: **Generate** groups.

| Element | Actual UI |
|---|---|
| Group | Group number |
| Time / starting hole | Tee time and hole (1st tee, 1st and 10th, or shotgun) |
| Players | Assigned golfers with HI; move between groups |
| Golfer side | "Your tee time 7:30 AM off hole 1 · Playing with …" (changed tee time shows **Updated**) |

**Ask AJ:** Should the tee sheet also show each golfer's **playing handicap** (not just HI)?

### Step 8 — Screen 7: Digital scorecard ✅ / 🔍
**Golfer web:** Tournament › **Enter my scores** (`#/tournaments/t9/play`) — "My round". **Golfer app:** Events › tournament › **Enter my scores**.

| Element | Actual UI |
|---|---|
| Header | Round · division · tees · **playing handicap 11** |
| Summary tiles | Position · To par (gross) · Net · Thru |
| Hole strip | 1…9 with scores |
| Hole | **Hole 5 · Par 4 · 410 yds · SI 11** (app shows **· +1** when a stroke is received; web shows "1 stroke received") |
| Score entry | − / + , big number; under it the **result name** and **net** (Stroke Play) or **points** (Stableford) |
| Pick-up | Stableford only: **Picked up (no score on this hole)**; new **pick-up message** 💡 |
| Marker | "Marking James — Enter their score" with ✓ |
| Save | **Save & next hole** · **Card** (full scorecard) · **Submit card** at the end |
| Resume | Leaving and returning keeps saved holes; offline holes are kept on the phone (Sprint 5) |

**Ask AJ:** Is the wording clear? Should the result name follow **gross** (now) or **net**?

### Step 9 — Screen 8: Handicap & Stableford scoring 🔍 💡 — see §5
1. Set-up › Essentials › Handicap & scoring › **Worked example: handicap 12 vs handicap 18** → *Show*.
2. Golfer app → *Twilight Stableford* → Enter my scores → hole 5 (SI 11, golfer gets 1 stroke) → press **+** to 7 → **"Please pick up your ball. You've reached net double bogey (7) — no more points on this hole."**

### Step 10 — Screen 9: Leaderboard and results ✅
**Paths:** Tournament day › **Leaderboard** and **Results & winners**; golfer: tournament › **Leaderboard** (`#/tournaments/t9/leaderboard`).

| Format | Columns |
|---|---|
| Stroke Play | Pos · Player · Gross / Net (by "Results shown") · Thru · Card |
| Stableford | Pos · Player · **Points** · Thru · Card ("P = pickup (0 points)") |
| Four-Ball / Scramble | Pos · **Team** (members listed, team handicap for scramble) · score · Thru |
| Golfer leaderboard | Pos · R · Strokes · Thru · Total |
| Results & winners | Winners per division (gross / net), playoff, publish results; reports RESULTS / DIVISIONS / WINNERS / SCORECARDS |

Ties: countback (back 9, last 6, last 3, last hole), playoff or shared — shown in the subtitle.
**Ask AJ:** Is this the right information per format? Show Stableford **gross and net points**?

### Step 11 — Screen 10: Hole-in-One register 💡 — see §7
**Path:** **Hole-in-One** in the left navigation (`#/admin/hole-in-one`).

### Step 12 — Payment / POS (separate) — see §8
### Step 13 — Record AJ's confirmations — §11

---

## 4. Tournament format comparison (from the code)

| UI information | Stroke Play | Stableford | Scramble | Four-Ball |
|---|---|---|---|---|
| Participation | Individual | Individual | Team (2–4) | Team (pairs) |
| Configuration | Allowance 95% (recommended) | Allowance 95%; results basis sets gross or net points | **Team handicap shares** 35/15 (2) · 30/20/10 (3) · 25/20/15/10 (4); team size; team formation | Allowance 85% each; team formation |
| Capacity | Max players | Max players | **Maximum teams** → golfer limit | **Maximum teams** → golfer limit |
| Golfer information | HI, division, tees | Same | Team + members | Team + partner |
| Groups | By golfer | By golfer | By team | By team |
| Scorecard | Own card · result name · **net** | Own card · result name · **points** · **pick-up** | **One shared team card** ("Shared team card with …", either player enters) | Own card per player; better ball counts |
| Scoring display | Gross, net, to par | Points (0 for pick-up) | Team gross / net off team handicap | Best net per hole of the pair |
| Leaderboard | Gross and/or net | Points | Team rows, team handicap | Team rows |
| Pick-up allowed | No | **Yes** | No | No |

**Missing / to confirm (format-specific):** ❌ Four-Ball **Stableford** (pairs better-ball points) — not a separate format · ❌ match play · 🔍 Should Stroke Play also have a **maximum score** (net double bogey) for handicap purposes?

---

## 5. Handicap and Stableford discussion

### What the prototype does (✅, from `golf.ts`)
| Step | Rule in the code |
|---|---|
| Course handicap | Handicap Index × slope / 113 + (course rating − par) — WHS |
| Playing handicap | Course handicap × allowance % (95% Stroke Play / Stableford, 85% Four-Ball), rounded |
| Strokes on a hole | floor(playing ÷ 18) + 1 if stroke index ≤ (playing mod 18) |
| Net score | Gross − strokes received |
| Stableford points | max(0, 2 + par + strokes received − gross) → net par = 2, net birdie = 3, net bogey = 1, net double bogey or worse = 0 |
| Pick-up (Stableford) | Golfer can mark **Picked up** → hole counts as played, 0 points |

### AJ's example — handicap 12 vs 18 (par 4, stroke index 15)
| | Handicap 12 | Handicap 18 |
|---|---|---|
| Stroke on SI 15? | No (12 strokes go to SI 1–12) | Yes (one on every hole) |
| Net par | 4 | 5 |
| Pick up after (net double bogey) 💡 | **6** — don't play a 7th shot | **7** — don't play an 8th shot |
| Stableford points at that score | 0 | 0 |

This matches the transcript ("pick up his ball at 7 … if he's playing 7th stroke" for 12; "pick up after 7th shot … I get one extra" for 18).

### Added for the meeting 💡 (display only — no calculation changed)
- **Golfer scoring screen** (web and app, Stableford): under the score, *"Par 4 + 1 stroke · pick up after 7 (net double bogey)"*; once reached: **"Please pick up your ball.** You've reached net double bogey (7) — no more points on this hole."
- **Set-up › Handicap & scoring › Worked example**: every hole of the course with strokes and pick-up point for handicap 12 and 18.

### To confirm with AJ 🔍
1. **"Handicap 12"** — Handicap Index, course handicap or **playing handicap**? It matters: at 95% on Augusta Pines, a Handicap Index of 12.0 plays as **19** off Black, **18** off Blue and **12** off Red (an index of 18.0 plays as 27 / 25 / 19).
2. Pick-up point = **net double bogey** (par + strokes + 2)? Or one stroke earlier — once no point is possible?
3. Wording: "Please pick up your ball after double bogey" — show **before** the hole (as a hint) **and** when reached, or only when reached?
4. Should the hint appear in **Stroke Play** too (as a maximum score), or Stableford only?
5. 9-hole rounds: stroke allocation over 9 holes uses ⌈SI ÷ 2⌉ in the leaderboard; the scoring screen uses the 18-hole SI. **Gap to fix** — confirm the 9-hole rule in the scoring session.

---

## 6. Golf scoring terminology ✅ (updated after AJ's confirmation)

Label = gross strokes against par, shown under the score and in the save message.

| Result | Label now | Before |
|---|---|---|
| Completed in one stroke | **Hole-in-One** | Ace |
| 3 under par | **Albatross** | Albatross |
| 2 under par | **Eagle** | Eagle |
| 1 under par | **Birdie** | Birdie |
| Level | **Par** | Par |
| 1 over | **Bogey** | Bogey |
| 2 over | **Double Bogey** | Double |
| 3 over | **Triple Bogey** | +3 |
| 4+ over | +4, +5 … | same |

Notes: a 1 on a par 4 shows **Hole-in-One** (also an albatross). Labels never use the stroke count itself — "Birdie" on a par 5 is 4 strokes. 🔍 Confirm whether "Quadruple Bogey" is wanted for +4, and whether labels should be net when the golfer receives a stroke.

---

## 7. Hole-in-One requirement 💡

**AJ:** "a separate placeholder where we can capture specific Hole-in-One incidents from any tournament … as a separate database."

**Prototype proposal:** left navigation › **Hole-in-One** (`#/admin/hole-in-one`), badge *Proposal for AJ · demo data*.

| Part | What it does |
|---|---|
| **Found on scorecards** | Any hole scored **1** on any card in the organiser's tournaments is listed; **Confirm** opens the form pre-filled |
| **Register** | Table: **Golfer · Tournament · Golf course · Hole (par, yards) · Round · Date · Details** |
| **Record a hole-in-one** | Form: Tournament *, Golf course (from tournament), Golfer *, Hole *, Round, Date of incident *, Incident details (club, witnesses, who confirmed) |
| Demo data | Two entries (fictional golfers) on Augusta Pines Club Championship |

To demo detection: golfer web → Club Championship → enter **1** on a par 3 (hole 12 or 16) → organiser › Hole-in-One shows it under *Found on scorecards*.

**Data stays in the browser.** Real build needs approval: a separate `hole_in_one` table (golfer, tournament, course, hole, round, date, details, witnesses, confirmed by, created by/at), an API, and the rule for auto-detection from verified cards.

**Ask AJ:** fields right? Add **witnesses**, **club used**, **yardage**, **photo**? Who confirms (organiser / official)? Should golfers see a hole-in-one badge on their profile? Visible across all clubs or per organisation?

---

## 8. Payment and physical POS (separate technical item — not approved for build)

| Topic | Current position |
|---|---|
| Online payment ✅ | Stripe card payment in the golfer flow (prototype payment sheet; backend has Stripe integration). Sprint 5 adds confirming / pending / declined / cancelled states. |
| Methods | Cards (prototype). Wallets / local methods depend on Stripe configuration — to confirm. |
| Physical POS ❌ | Not in the platform. **Stripe Terminal** supports physical card readers and Tap to Pay on phones, and manages in-person payments **in the same Stripe account** as online payments. Readers and availability vary by country; the Stripe account and reader must be in the same country, local currency only. |
| What it would take | Choose readers, add a "take payment at the desk" flow for organisers, link the in-person payment to the golfer's entry, reconcile with online payments. Separate estimate. |

**Ask AJ:** Which countries / clubs? Desk payments only, or also on the course? Is "pay at course" (already an option, marked manually) enough for now?

---

## 9. Scoring team follow-up (separate 30-minute session)

**AJ:** "Whosoever is doing this scoring, please set up a 30-minute call."
**Attendees:** AJ, scoring developer(s) (backend scoring), Vignesh. **Not** part of the UI walkthrough.

Agenda:
1. Our understanding: course handicap → playing handicap (WHS, allowances) → strokes by stroke index.
2. Net score and Stableford points (formula in §5).
3. Pick-up / maximum score rule and wording (net double bogey?).
4. 9-hole rounds: stroke index on 9 holes (gap in §5.5).
5. Team formats: Four-Ball better ball, scramble team handicap.
6. Countback and playoffs.
7. AJ's Excel / Access method — walk through one of his sheets to compare numbers.

**Action:** book it during the meeting.

---

## 10. Questions to ask AJ

| Screen | Questions |
|---|---|
| Tournament listing | Status names OK? Course and format as separate columns? |
| Create tournament | Field names OK? Anything missing? Which fields change by format? |
| Formats | Are the four formats enough for the pilot? Match play / Four-Ball Stableford needed? |
| Course & holes | Hole, par, SI, tees, rating, slope — enough? |
| Golfers | Extra golfer details needed? |
| Groups & tee times | Show playing handicap on the tee sheet? |
| Scorecard | Wording OK? Result name gross or net? |
| Handicap & Stableford | Which "handicap" in examples? Pick-up rule and timing (§5)? |
| Leaderboard | Right columns per format? Gross and net points for Stableford? |
| Hole-in-One | Fields, who confirms, visibility (§7)? |
| Payment / POS | Countries, in-person scenarios (§8)? |

---

## 11. Final confirmation checklist

Mark each: **Approved** / **Changes required** / **Pending**.

| # | Item | Status in prototype | AJ decision | Notes |
|---|---|---|---|---|
| 1 | Tournament listing — columns and status names | ✅ | ☐ Approved ☐ Changes ☐ Pending | |
| 2 | Create tournament — sections and field labels | ✅ | ☐ Approved ☐ Changes ☐ Pending | |
| 3 | Format-specific fields (§4) | ✅ / 🔍 | ☐ Approved ☐ Changes ☐ Pending | |
| 4 | Course & hole configuration | ✅ | ☐ Approved ☐ Changes ☐ Pending | |
| 5 | Golfer & handicap information | ✅ | ☐ Approved ☐ Changes ☐ Pending | |
| 6 | Groups & tee times | ✅ | ☐ Approved ☐ Changes ☐ Pending | |
| 7 | Digital scorecard layout | ✅ | ☐ Approved ☐ Changes ☐ Pending | |
| 8 | Terminology (Hole-in-One … Triple Bogey) | ✅ updated | ☐ Approved ☐ Changes ☐ Pending | Gross or net labels? |
| 9 | Handicap strokes by stroke index | ✅ | ☐ Approved ☐ Changes ☐ Pending | Which handicap? |
| 10 | Stableford points | ✅ | ☐ Approved ☐ Changes ☐ Pending | |
| 11 | Pick-up rule: net double bogey | 💡 | ☐ Approved ☐ Changes ☐ Pending | |
| 12 | Pick-up message wording and timing | 💡 | ☐ Approved ☐ Changes ☐ Pending | |
| 13 | Worked example in set-up | 💡 | ☐ Approved ☐ Changes ☐ Pending | |
| 14 | Leaderboard per format | ✅ | ☐ Approved ☐ Changes ☐ Pending | |
| 15 | Hole-in-One register (UI + separate data) | 💡 | ☐ Approved ☐ Changes ☐ Pending | Fields? Who confirms? |
| 16 | Physical POS — investigate | ❌ | ☐ Approved ☐ Changes ☐ Pending | Separate estimate |
| 17 | Scoring session booked | — | ☐ Booked | Date / time: |

---

### Appendix — what changed in the prototypes for this meeting

| Change | Files | Type |
|---|---|---|
| Result labels: Hole-in-One, Double Bogey, Triple Bogey | `src/golf.ts` (both) | Label only |
| `pickupAfter` / `pickupName` helpers (par + strokes + 2) | `src/golf.ts` (both) | Display helper, not used in scoring |
| Pick-up message on the scoring screen (Stableford) | `src/screens/LivePlay.tsx` (both) | Display only |
| Worked example: handicap 12 vs 18 | `src/admin/HandicapExample.tsx`, `TournamentWizard.tsx` (web) | Display only |
| Hole-in-One register (proposal, browser storage) | `src/admin/HoleInOne.tsx`, `router.ts`, `App.tsx`, `AdminShell.tsx` (web) | New proposal screen |

No backend API, database schema or scoring calculation was changed.
