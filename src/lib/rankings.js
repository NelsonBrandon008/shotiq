// ---------------------------------------------------------------------------
// National + conference rankings
// ---------------------------------------------------------------------------
// Ranks the selected team against every other D1 team on raw (not
// opponent-adjusted) Efficiency, Pace, and Four Factors — the same shape
// as KenPom's ranking columns, computed entirely from ESPN's per-team
// season-totals endpoint (see fetchTeamSeasonStats in espnData.js).
//
// Cost: this needs ONE request per D1 team (~360 requests) to build the
// ranking pool, so it's triggered manually (a button), not automatically,
// and cached in localStorage per season so it's a one-time cost.

import { fetchAllD1Teams, fetchTeamSeasonStats } from './espnData'

const POOL_CACHE_KEY = (espnSeason) => `shotiq-national-pool-${espnSeason}`
const POOL_CACHE_TTL_MS = 12 * 60 * 60 * 1000 // 12 hours — stats change during the season

export function possessionsFromPerGame(s) {
  if (s.fgaPerGame == null) return null
  return s.fgaPerGame - (s.orebPerGame || 0) + (s.tovPerGame || 0) + 0.475 * (s.ftaPerGame || 0)
}

/** Derive Four-Factors-style per-team metrics from season-totals fields. */
export function deriveMetrics(stats) {
  const poss = possessionsFromPerGame(stats)
  const efg =
    stats.fgaPerGame ? (stats.fgmPerGame + 0.5 * stats.tpmPerGame) / stats.fgaPerGame : null
  const tovPct = poss ? stats.tovPerGame / poss : null
  const ftRate = stats.fgaPerGame ? stats.ftaPerGame / stats.fgaPerGame : null
  const offRtg = poss && stats.ppg != null ? (stats.ppg / poss) * 100 : null
  return {
    pace: poss,
    offRtg,
    efg,
    tovPct,
    ftRate,
    ppg: stats.ppg,
    oppPpg: stats.oppPpg,
  }
}

/**
 * Fetch season stats for every D1 team and derive ranking metrics.
 * Runs with limited concurrency and reports progress via onProgress(done, total).
 * Cached in localStorage per season.
 */
export async function fetchNationalStatsPool(espnSeason, onProgress) {
  const cacheKey = POOL_CACHE_KEY(espnSeason)
  const cached = localStorage.getItem(cacheKey)
  if (cached) {
    try {
      const parsed = JSON.parse(cached)
      if (Date.now() - parsed.fetchedAt < POOL_CACHE_TTL_MS) return parsed.pool
    } catch {
      // fall through and refetch
    }
  }

  const teams = await fetchAllD1Teams()
  const pool = []
  let done = 0
  const CONCURRENCY = 12

  async function worker(queue) {
    while (queue.length) {
      const team = queue.pop()
      try {
        const stats = await fetchTeamSeasonStats(team.id, espnSeason)
        pool.push({
          teamId: team.id,
          name: team.name,
          conferenceId: team.conferenceId,
          metrics: deriveMetrics(stats),
        })
      } catch {
        // one team failing shouldn't break the whole pool
      } finally {
        done++
        onProgress?.(done, teams.length)
      }
    }
  }

  const queue = [...teams]
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(queue)))

  localStorage.setItem(cacheKey, JSON.stringify({ fetchedAt: Date.now(), pool }))
  return pool
}

// Higher value = better, for each ranked metric.
const HIGHER_IS_BETTER = {
  offRtg: true,
  defRtg: false, // not derivable per-team without opponent data; reserved
  pace: null, // neutral — no "better", just faster/slower
  efg: true,
  tovPct: false,
  ftRate: true,
}

/** Rank `teamId` on one metric against `pool`, optionally within one conference. */
function rankOne(pool, teamId, metric, conferenceId) {
  const scoped = conferenceId ? pool.filter((p) => p.conferenceId === conferenceId) : pool
  const withValue = scoped.filter((p) => p.metrics[metric] != null)
  const higherBetter = HIGHER_IS_BETTER[metric]
  const sorted = [...withValue].sort((a, b) =>
    higherBetter === false
      ? a.metrics[metric] - b.metrics[metric]
      : b.metrics[metric] - a.metrics[metric]
  )
  const idx = sorted.findIndex((p) => p.teamId === teamId)
  if (idx === -1) return null
  return { rank: idx + 1, total: sorted.length }
}

export function computeRankings(pool, teamId, conferenceId) {
  const metrics = ['offRtg', 'efg', 'tovPct', 'ftRate', 'pace']
  const out = {}
  for (const m of metrics) {
    out[m] = {
      national: rankOne(pool, teamId, m, null),
      conference: conferenceId ? rankOne(pool, teamId, m, conferenceId) : null,
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Approximate NCAA Quad classification
// ---------------------------------------------------------------------------
// The NCAA's real Quad system buckets a game by the OPPONENT'S NET rank and
// game location. There's no public NET feed, so this substitutes our own
// national offensive-efficiency rank for NET rank in the same boundary
// table the NCAA actually uses. Label this "approximate" everywhere it's
// shown — it will disagree with the real Selection Committee sheet
// whenever a team's efficiency rank and NET rank diverge (which happens).

const QUAD_BOUNDARIES = {
  home: [30, 75, 160],
  neutral: [50, 100, 200],
  away: [75, 135, 240],
}

export function approximateQuad(opponentRank, location) {
  if (opponentRank == null) return null
  const bounds = QUAD_BOUNDARIES[location] || QUAD_BOUNDARIES.neutral
  if (opponentRank <= bounds[0]) return 1
  if (opponentRank <= bounds[1]) return 2
  if (opponentRank <= bounds[2]) return 3
  return 4
}

/** Build a teamId -> overall rank lookup (by offensive efficiency, as a
 * single composite proxy for "how good is this team") from the pool. */
export function buildRankLookup(pool) {
  const withValue = pool.filter((p) => p.metrics.offRtg != null)
  const sorted = [...withValue].sort((a, b) => b.metrics.offRtg - a.metrics.offRtg)
  const map = {}
  sorted.forEach((p, i) => {
    map[p.teamId] = i + 1
  })
  return map
}
