// ---------------------------------------------------------------------------
// Adjusted-efficiency data orchestration
// ---------------------------------------------------------------------------
// Fetches what computeAdjEfficiency (lib/adjMath.js — pure math, unit
// tested separately) needs for every D1 team: season totals (for
// points-for/against and a possessions estimate) AND full schedule
// (opponent id + location + conference-game flag, so strength of schedule
// and conference clustering both come from real results, not a team field
// ESPN doesn't always populate).
//
// Cost: 2 requests per D1 team (~720 total for a ~360-team season), so —
// same pattern as fetchNationalStatsPool in rankings.js — this is a manual,
// button-triggered action, not automatic, and the result is cached.

import { fetchAllD1Teams, fetchTeamSeasonStats, fetchTeamSchedule } from './espnData'
import { possessionsFromPerGame } from './rankings'
import { computeAdjEfficiency, attachRanks, clusterConferences } from './adjMath'

const POOL_CACHE_KEY = (espnSeason) => `shotiq-adjeff-pool-${espnSeason}`
const POOL_CACHE_TTL_MS = 12 * 60 * 60 * 1000 // 12 hours — stats shift during the season

function safeLocalSet(key, value) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // quota exceeded or storage disabled — the computed pool still works
    // for this session, it just won't persist across a reload
  }
}

/**
 * Fetch season stats + schedule for every D1 team, run the opponent
 * adjustment, and return ranked rows plus a name/logo lookup.
 * onProgress(done, total) is called as team fetches complete.
 */
export async function fetchAdjEfficiencyPool(espnSeason, onProgress) {
  const cacheKey = POOL_CACHE_KEY(espnSeason)
  const cached = localStorage.getItem(cacheKey)
  if (cached) {
    try {
      const parsed = JSON.parse(cached)
      if (Date.now() - parsed.fetchedAt < POOL_CACHE_TTL_MS) return parsed.result
    } catch {
      // fall through and refetch
    }
  }

  const teams = await fetchAllD1Teams()
  const teamMeta = new Map(teams.map((t) => [t.id, t]))
  const raw = [] // { id, gp, poss, ptsFor, ptsAgainst, games }

  let done = 0
  const CONCURRENCY = 12

  async function worker(queue) {
    while (queue.length) {
      const team = queue.pop()
      try {
        const [stats, schedule] = await Promise.all([
          fetchTeamSeasonStats(team.id, espnSeason),
          fetchTeamSchedule(team.id, espnSeason),
        ])
        // Points for/against come straight from the schedule's own
        // per-game score.value fields (confirmed real via live ESPN data),
        // NOT from the season-stats endpoint — that endpoint has no
        // opponent/points-allowed field under any of the candidate names
        // we tried (avgPointsAllowed, opponentPointsPerGame,
        // defensivePointsPerGame all come back missing on real responses).
        // Summing real per-game scores sidesteps that gap entirely and is
        // actually more directly verifiable than trusting a single
        // "season total" field would have been.
        const scored = schedule.filter((g) => g.teamScore != null && g.oppScore != null)
        const gp = scored.length
        const poss = possessionsFromPerGame(stats)
        if (gp > 0 && poss != null) {
          const ptsFor = scored.reduce((sum, g) => sum + g.teamScore, 0)
          const ptsAgainst = scored.reduce((sum, g) => sum + g.oppScore, 0)
          raw.push({
            id: team.id,
            gp,
            poss,
            ptsFor,
            ptsAgainst,
            games: schedule.map((g) => ({
              oppId: g.opponentId,
              loc: g.neutralSite ? 'neutral' : g.isHome ? 'home' : 'away',
              conf: g.isConferenceGame,
            })),
          })
        }
      } catch {
        // one team failing (bad id, transient ESPN error, etc.) shouldn't
        // break the whole pool — it's just excluded from the model
      } finally {
        done++
        onProgress?.(done, teams.length)
      }
    }
  }

  const queue = [...teams]
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(queue)))

  const { rows, iterationsRun, converged, leagueAvg } = computeAdjEfficiency(raw)
  const confOf = clusterConferences(raw)
  const ranked = attachRanks(rows, confOf)

  const result = {
    fetchedAt: Date.now(),
    espnSeason,
    iterationsRun,
    converged,
    leagueAvg,
    teamsIncluded: ranked.length,
    teamsTotal: teams.length,
    rows: ranked.map((r) => ({
      ...r,
      name: teamMeta.get(r.id)?.name || r.id,
      abbrev: teamMeta.get(r.id)?.abbrev || null,
      logo: teamMeta.get(r.id)?.logo || null,
    })),
  }

  safeLocalSet(cacheKey, JSON.stringify({ fetchedAt: Date.now(), result }))
  return result
}

export function findTeamRow(pool, teamId) {
  return pool?.rows?.find((r) => r.id === teamId) || null
}
