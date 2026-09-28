# ShotIQ

A KenPom/cbbshotcharts-style analytics tool: shot charts + advanced stats
for **any** Division I team, per-game, for any custom subset of games, or
cumulative-by-season, pulling directly from ESPN's (unofficial) API.

## Verified against live ESPN data (Sep 2026)

Everything below used to be a "best guess, unverifiable from this build
environment" — that's no longer true for most of it. I pulled real data
straight from ESPN (Saint Mary's schedule + season stats, a real 2025-26
game's play-by-play, a real WCC tournament scoreboard entry, and a real
team-list entry) and checked it against the code's assumptions:

- **Found and fixed a real bug**: the Adj. Efficiency feature (below)
  originally tried to read a team's opponent-points-allowed from
  `avgPointsAllowed` / `opponentPointsPerGame` / `defensivePointsPerGame`
  on ESPN's season-stats endpoint. None of those exist — checked
  exhaustively against Saint Mary's real statistics response, and that
  endpoint simply never reports points allowed. As shipped before this
  check, the feature would have silently produced an **empty pool for
  every team**. Fixed: points for/against are now summed directly from
  each team's own schedule (`competitors[].score.value`), which IS
  confirmed present on every completed game. This is arguably more
  correct anyway — it's real per-game results, not a season-total field.
- **Confirmed correct**: `gamesPlayed`, `avgPoints`, `avgFieldGoalsAttempted`/
  `Made`, `avgThreePointFieldGoalsAttempted`/`Made`,
  `avgFreeThrowsAttempted`/`Made`, `avgOffensiveRebounds`,
  `avgDefensiveRebounds`, `avgRebounds`, `avgAssists`, `avgTurnovers`,
  `fieldGoalPct`, `threePointFieldGoalPct`, `freeThrowPct` — all real field
  names on the season-stats endpoint, first-guess-correct. (Percent fields
  come back 0-100, not 0-1, e.g. `46.13`.) This is the backbone of Season
  Totals, Four Factors, and the National Rankings pool.
- **Confirmed correct**: `conferenceCompetition` on a game's competition
  object is real — checked against an actual WCC tournament game (Gonzaga
  58, Saint Mary's 51, 2025-03-11) and it came back `true`. This is what
  the Adj. Efficiency panel's conference clustering relies on.
- **Confirmed missing**: `conferenceId` does **not** exist on the `/teams`
  list endpoint at all (checked a real team object's full key list — no
  `conferenceId`, no `groups.id`). The raw National Rankings panel's
  conference-only view depends on this field and will show "unavailable"
  for most teams as a result — this was already handled gracefully in the
  UI, but it's now a confirmed limitation rather than a guess. The Adj.
  Efficiency panel doesn't have this problem because it infers conferences
  from real game results instead (`clusterConferences`).
- **Spot-checked, not exhaustively proven**: shot coordinates from a real
  2025-26 game (Saint Mary's vs St. Thomas) came back well inside the
  ranges the code assumes (raw x roughly 0-25, raw y roughly 0-25 for
  shots near one basket — a made corner three at x=10,y=22, a top-of-key
  three at x=9,y=19), consistent with the existing 0-50 / 0-94 mapping.
  No shot in the sample had y>47, so the "fold to the near basket" branch
  specifically wasn't exercised — if a shot chart ever looks mirrored,
  that's the first place to check.

## Latest addition: real opponent-adjusted Adj. Efficiency

The Advanced Stats tab now has an **Adj. Efficiency** panel — true
opponent-adjusted Offensive/Defensive Efficiency and Margin (AdjO / AdjD /
AdjEM), the actual KenPom-shaped numbers, not the raw/unadjusted stand-ins
from before. National and conference ranks, a sortable All-D1 /
Conference leaderboard, and your team's headline card (Offense / Defense /
Margin with both ranks), matching the KenPom screenshot layout.

**How it's computed** — entirely from ESPN, no KenPom data involved:
1. For every D1 team, fetch season totals (points for/against, a
   possessions estimate) and the full schedule (opponent + home/away/
   neutral + conference-game flag). Two requests per team, ~720 total for
   a ~360-team season.
2. Run an iterative solve (`computeAdjEfficiency` in `src/lib/adjMath.js`):
   each team's raw points-per-100-possessions gets scaled by how good the
   opponents it actually played were, repeated until the ratings stop
   moving (typically 20-40 iterations). This is the same family of method
   KenPom has publicly described using (Bradley-Terry / iterative scaling),
   including a small home-court adjustment — but it is **not** his exact
   algorithm, which is proprietary and includes per-game weighting,
   recency, and margin-of-victory dampening this doesn't attempt. Expect
   numbers directionally right, not identical to his site.
3. Conferences are inferred from real results — two teams that played a
   game ESPN flagged as a conference game get clustered together
   (`clusterConferences`) — rather than relying on a team-conference field
   ESPN doesn't always populate cleanly.

This is a manual "Compute Adj. Efficiency" button (like the existing
National Rankings one), not automatic, because of the request volume;
results cache for 12 hours in `localStorage`.

**Tested before shipping**: since this session couldn't reach ESPN to
verify against real results, the math itself (`src/lib/adjMath.js`) is
unit-tested against a synthetic league with known "true" ratings —
`npm run test:adjmath` (or `node scripts/testAdjMath.mjs`) generates ~60
fake teams across 4 conferences with deliberately randomized schedules,
runs the solver, and checks it recovers the known ratings (currently:
~2 pts/100poss mean error on a ~30-point true spread, >0.9 rank
correlation, consistent across 5 different random seeds). That validates
the *math*; it can't validate ESPN's actual field names from here (same
caveat as `SEASON_STAT_KEYS` below) — if the computed numbers look wrong
once run against live data, check that first.

## Latest fixes

- **Fixed a storage crash**: caching a full season's shot data (especially
  with per-shot lineup tracking) could exceed `sessionStorage`'s small
  (~5-10MB) quota, and that failure was propagating up and blocking the
  whole app with a scary error. Fixed two ways: a failed cache write now
  just skips caching that one game instead of crashing anything, and the
  cached payload itself got smaller (dropped the raw play text per shot,
  no longer needed once the shooter's name is extracted from it).
- **Removed the lineup on/off-court filter.** It was more complexity than
  needed and had a real bug (duplicate "X subbing" entries in the player
  list from substitution parsing). The single Player dropdown covers what
  you actually need — pick one player, see their shots. If you want a
  particular *opponent's* shooting across every meeting, or shots from a
  custom set of games, use the game picker's checkboxes at the top
  instead (e.g. check every game played against Santa Clara this season).

## About the "KenPom" stats

Not scraped from KenPom.com (paid, ToS-protected, unstable foundation to
build on). Instead:

1. **Four Factors** (Offensive/Defensive Efficiency, Pace, eFG%, TOV%,
   ORB%, FT Rate) — computed from ESPN's public box score totals using
   Dean Oliver's standard public formulas.
2. **Season Totals + Strength of Schedule** — a second ESPN host
   (`sports.core.api.espn.com`) returns a team's full season stat totals
   in one request; the app fetches this for the selected team AND every
   distinct opponent on the schedule, then averages the opponents into a
   Strength of Schedule readout.

3. **Adj. Efficiency (opponent-adjusted)** — see the section above. This
   closes the gap the first two didn't cover: a real iterative
   strength-of-schedule adjustment, not raw per-game averages.

**Calibration note**: the season-totals endpoint's exact stat field names
are my best guess at ESPN's convention (unverifiable live from this build
environment) — see `SEASON_STAT_KEYS` in `src/lib/espnData.js`. If "Season
Totals" shows dashes, the panel tells you, and the fix is a one-line
addition to that candidate list once you see the real field name in
devtools.

## Before you rely on the shot locations: calibrate the coordinates

ESPN doesn't document its coordinate format. `normalizeCoordinate()` in
`src/lib/espnData.js` has the calibration note — pick a real game,
spot-check a couple of shots against ESPN's own play-by-play page, adjust
if anything looks mirrored/rotated.

## Setup

```bash
npm install
npm run dev
```

## Deploying

Needs the `/api/espn` and `/api/espn-core` serverless proxies, so use
**Vercel**, not GitHub Pages:

```bash
npm install -g vercel
vercel
vercel --prod
```

## What's NOT built yet

- **NET Quad (real)** — there's no public NET rankings feed, official or
  unofficial. What IS built: an **Approximate Quad Record** (Advanced
  Stats tab, under National Rankings) that uses our own computed national
  efficiency rank in place of NET rank, run through the NCAA's actual quad
  boundary table (Home 1-30/31-75/76-160, Neutral 1-50/51-100/101-200,
  Away 1-75/76-135/136-240). It'll disagree with the real Selection
  Committee sheet whenever a team's efficiency rank and NET rank diverge —
  labeled as approximate everywhere it shows up. It currently still keys
  off the older *raw* efficiency rank (`buildRankLookup` in
  `src/lib/rankings.js`) rather than the new opponent-adjusted AdjEM rank;
  swapping it to use `src/lib/adjEfficiencyData.js`'s pool instead would
  be a quick, worthwhile follow-up now that the adjusted numbers exist.
- **Lineup on/off-court filters** — removed per feedback (was more
  complexity than needed, and had a name-parsing bug). If this comes back
  up later, `src/lib/rankings.js`'s pattern for best-effort ESPN text
  parsing is a reasonable starting point.
- **National/Conference Rankings** — this IS built now (Advanced Stats tab
  → Compute National Rankings), ranking the selected team's Efficiency,
  eFG%, TOV%, FT Rate, and Pace against every D1 team (or just its
  conference), computed from ESPN's season-totals endpoint for all ~360
  teams. Same calibration caveat as `SEASON_STAT_KEYS` applies here too —
  if ranks look off, check the actual field names ESPN returns.
- **Shot Type filter** — NCAA's own play-by-play shot-type tagging is
  inconsistent enough (same caveat cbbshotcharts.com prints) that it's
  left out rather than shipped unreliable.

## File map

- `src/lib/espnData.js` — all ESPN calls, season handling, coordinate
  normalization, zone classification, Four Factors + season-totals math.
- `src/lib/adjMath.js` — the opponent-adjustment solver, national/
  conference rank attachment, conference clustering. Pure math, no
  network calls — unit-tested via `scripts/testAdjMath.mjs`.
- `src/lib/adjEfficiencyData.js` — fetches every D1 team's season stats +
  schedule and feeds `adjMath.js`; localStorage caching.
- `src/components/AdjEfficiencyPanel.jsx` — the Adj. Efficiency headline
  card + sortable All-D1/Conference leaderboard.
- `src/lib/rankings.js` — raw (non-adjusted) national/conference rankings
  pool + approximate quad classification.
- `src/components/RankingsPanel.jsx` — raw rankings table + quad record UI.
- `src/components/RadialZoneChart.jsx` — the concentric-wedge zone chart.
- `src/components/CourtChart.jsx` — Shots dot view + the 4-zone stat bar.
- `src/components/TeamSearch.jsx` — the any-D1-team search box.
- `src/components/GamesMultiSelect.jsx` — checkbox multi-select game picker.
- `src/components/FiltersPanel.jsx` — Player/Half/Opponent/Location filters.
- `src/components/StatsPanel.jsx` — Four Factors + Season Totals + SoS tab.
- `public/smc-logo.png` — Saint Mary's logo override.
