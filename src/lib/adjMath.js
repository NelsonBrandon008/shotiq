// ---------------------------------------------------------------------------
// Opponent-adjusted efficiency (ShotIQ model)
// ---------------------------------------------------------------------------
// Pure math, no network — kept separate so it can be unit-tested on its own
// (see scripts/testAdjMath.mjs).
//
// What it computes, per team:
//   rawO = points scored  per 100 possessions
//   rawD = points allowed per 100 possessions
//   adjO / adjD = what those numbers would be against an AVERAGE D1 schedule
//                 (neutral court)
//   adjEM = adjO - adjD  (adjusted efficiency margin)
//
// How: a multiplicative, iterative solve in the same spirit as KenPom's own
// published description of his method (Bradley-Terry / iterative-scaling
// style). A team's raw offense is assumed to equal its "true" offense
// scaled by how good the defenses it faced were (and a small home-court
// factor), and vice versa for defense:
//
//   rawO_i  ≈  adjO_i * mean_j( adjD_j * (1 ± hca) ) / lg
//   rawD_i  ≈  adjD_i * mean_j( adjO_j * (1 ∓ hca) ) / lg
//
// Solve for adjO / adjD for every team simultaneously by iterating until
// nothing moves. This is NOT KenPom's exact algorithm (his is proprietary —
// per-game weighting, recency, blowout dampening, etc.), so numbers will be
// close in spirit but not identical to KenPom's own site. It works from
// each team's season totals (points for/against, possessions) plus its game
// list (opponent id + game location), not per-game possession counts.

// Home team's efficiency runs ~1.4% higher than neutral, away team's ~1.4%
// lower. Tunable — this is the one constant worth calibrating against real
// results if the numbers feel off.
export const HOME_COURT_FACTOR = 0.014

/**
 * @param {Array<{id, gp, poss, ptsFor, ptsAgainst, games: Array<{oppId, loc, conf}>}>} teams
 *   poss = average possessions PER GAME (season total possessions / gp).
 *   ptsFor / ptsAgainst = SEASON TOTAL points scored / allowed.
 *   games[].loc = 'home' | 'away' | 'neutral' (from this team's perspective).
 *   games[].conf = true if this was a game against a conference opponent
 *     (used only by clusterConferences below, optional here).
 */
export function computeAdjEfficiency(teams, { iterations = 60, hca = HOME_COURT_FACTOR, tolerance = 1e-5 } = {}) {
  // Only teams with usable data participate. Explicit != null checks
  // matter here — JS coerces `null >= 0` to true, which would otherwise
  // silently let a team with missing points data through with a bogus
  // rawO/rawD of 0 instead of being excluded.
  const rated = teams
    .filter(
      (t) => t.gp > 0 && t.poss > 0 && t.ptsFor != null && t.ptsAgainst != null && t.ptsFor >= 0 && t.ptsAgainst >= 0
    )
    .map((t) => ({
      ...t,
      rawO: (t.ptsFor / (t.gp * t.poss)) * 100,
      rawD: (t.ptsAgainst / (t.gp * t.poss)) * 100,
    }))

  if (rated.length < 2) return { rows: [], iterationsRun: 0, converged: false, leagueAvg: null }

  const byId = new Map(rated.map((t) => [t.id, t]))

  const meanO = rated.reduce((a, t) => a + t.rawO, 0) / rated.length
  const meanD = rated.reduce((a, t) => a + t.rawD, 0) / rated.length
  const lg = (meanO + meanD) / 2 // league-average points per 100 possessions

  // Start from raw and refine.
  for (const t of rated) {
    t.adjO = t.rawO
    t.adjD = t.rawD
  }

  let iterationsRun = 0
  let converged = false

  for (let it = 0; it < iterations; it++) {
    iterationsRun++
    let maxDelta = 0

    const next = rated.map((t) => {
      let sumOppD = 0
      let sumOppO = 0
      let n = 0
      for (const g of t.games) {
        const opp = byId.get(g.oppId)
        if (!opp) continue // non-D1 (or data-less) opponent: excluded
        // f > 0 when t is at home: its offense gets a boost, so the
        // opponent's defense "felt" is effectively weaker (and vice versa).
        const f = g.loc === 'home' ? hca : g.loc === 'away' ? -hca : 0
        sumOppD += opp.adjD * (1 + f)
        sumOppO += opp.adjO * (1 - f)
        n++
      }
      if (!n) return { id: t.id, adjO: t.rawO, adjD: t.rawD }
      return {
        id: t.id,
        adjO: (t.rawO * lg) / (sumOppD / n),
        adjD: (t.rawD * lg) / (sumOppO / n),
      }
    })

    // Re-center so the league average stays pinned at lg (the model is only
    // identified up to a common scale factor, otherwise it can drift).
    const nMeanO = next.reduce((a, r) => a + r.adjO, 0) / next.length
    const nMeanD = next.reduce((a, r) => a + r.adjD, 0) / next.length
    for (const r of next) {
      const t = byId.get(r.id)
      const newO = r.adjO * (lg / nMeanO)
      const newD = r.adjD * (lg / nMeanD)
      maxDelta = Math.max(maxDelta, Math.abs(newO - t.adjO), Math.abs(newD - t.adjD))
      t.adjO = newO
      t.adjD = newD
    }

    if (maxDelta < tolerance) {
      converged = true
      break
    }
  }

  // Strength of schedule = average adjusted margin of the D1 opponents faced.
  const rows = rated.map((t) => {
    let sum = 0
    let n = 0
    for (const g of t.games) {
      const opp = byId.get(g.oppId)
      if (!opp) continue
      sum += opp.adjO - opp.adjD
      n++
    }
    return {
      id: t.id,
      gp: t.gp,
      tempo: t.poss,
      rawO: t.rawO,
      rawD: t.rawD,
      rawEM: t.rawO - t.rawD,
      adjO: t.adjO,
      adjD: t.adjD,
      adjEM: t.adjO - t.adjD,
      sos: n ? sum / n : null,
      d1Games: n,
    }
  })

  return { rows, iterationsRun, converged, leagueAvg: lg }
}

// ---------------------------------------------------------------------------
// Rankings (national + within a group such as a conference)
// ---------------------------------------------------------------------------

function rankBy(rows, key, higherIsBetter) {
  const sorted = [...rows].sort((a, b) => (higherIsBetter ? b[key] - a[key] : a[key] - b[key]))
  const ranks = new Map()
  sorted.forEach((r, i) => ranks.set(r.id, i + 1))
  return ranks
}

/**
 * Attach national ranks (rkO, rkD, rkEM) and conference ranks (cRkO, cRkD,
 * cRkEM) to each row. `confOf` maps team id -> conference key (or undefined
 * / null for teams with no known conference grouping).
 */
export function attachRanks(rows, confOf) {
  const natO = rankBy(rows, 'adjO', true)
  const natD = rankBy(rows, 'adjD', false) // lower allowed = better
  const natEM = rankBy(rows, 'adjEM', true)
  // Tempo has no "better" direction — ranked fastest-to-slowest purely so
  // a leaderboard sorted by tempo still has a stable, meaningful rank
  // number in the Rk column (rather than reusing the EM rank, which would
  // silently mismatch the sort the user is looking at).
  const natTempo = rankBy(rows, 'tempo', true)

  const groups = new Map()
  for (const r of rows) {
    const c = confOf.get(r.id)
    if (!c) continue
    if (!groups.has(c)) groups.set(c, [])
    groups.get(c).push(r)
  }
  const confRanks = new Map() // id -> {o,d,em,tempo,size}
  for (const [, members] of groups) {
    const o = rankBy(members, 'adjO', true)
    const d = rankBy(members, 'adjD', false)
    const em = rankBy(members, 'adjEM', true)
    const tempo = rankBy(members, 'tempo', true)
    for (const m of members) {
      confRanks.set(m.id, {
        o: o.get(m.id),
        d: d.get(m.id),
        em: em.get(m.id),
        tempo: tempo.get(m.id),
        size: members.length,
      })
    }
  }

  return rows.map((r) => ({
    ...r,
    conf: confOf.get(r.id) || null,
    rkO: natO.get(r.id),
    rkD: natD.get(r.id),
    rkEM: natEM.get(r.id),
    rkTempo: natTempo.get(r.id),
    cRkO: confRanks.get(r.id)?.o ?? null,
    cRkD: confRanks.get(r.id)?.d ?? null,
    cRkEM: confRanks.get(r.id)?.em ?? null,
    cRkTempo: confRanks.get(r.id)?.tempo ?? null,
    confSize: confRanks.get(r.id)?.size ?? null,
  }))
}

// ---------------------------------------------------------------------------
// Conference inference from conference-game flags
// ---------------------------------------------------------------------------
// Fallback for when ESPN doesn't hand us clean conference membership
// directly: two teams that played a game flagged "conference competition"
// are in the same conference, so connected components of those games ARE
// the conferences (union-find over the "played a conference game against"
// graph).

export function clusterConferences(teams) {
  const parent = new Map(teams.map((t) => [t.id, t.id]))
  const find = (x) => {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)))
      x = parent.get(x)
    }
    return x
  }
  const union = (a, b) => {
    if (!parent.has(a) || !parent.has(b)) return
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent.set(ra, rb)
  }

  for (const t of teams) {
    for (const g of t.games) if (g.conf) union(t.id, g.oppId)
  }

  // Only groups with 2+ members count as a conference (independents, or
  // any team whose conference games didn't resolve, drop out — they just
  // get no conference rank rather than a wrong one).
  const sizes = new Map()
  for (const t of teams) {
    const root = find(t.id)
    sizes.set(root, (sizes.get(root) || 0) + 1)
  }
  const out = new Map()
  for (const t of teams) {
    const root = find(t.id)
    if (sizes.get(root) >= 2) out.set(t.id, `cluster-${root}`)
  }
  return out
}
