// ---------------------------------------------------------------------------
// ESPN data layer
// ---------------------------------------------------------------------------
// Unofficial API — see README for the calibration note. Nothing here is
// Saint-Mary's-specific anymore; pass any ESPN team id.

const BASE = '/api/espn'

export const SAINT_MARYS_TEAM_ID = '2608'

// ESPN (like KenPom) names a season by the year its second half falls in:
// the 2025-26 season is "season=2026", not 2025. Confirmed against ESPN's
// own schedule URLs (e.g. games in Dec 2024 live under "2025 Season").
export const SEASONS = [
  { key: '2026-27', label: '2026-27', espnSeason: 2027 },
  { key: '2025-26', label: '2025-26', espnSeason: 2026 },
  { key: '2024-25', label: '2024-25', espnSeason: 2025 },
]

async function getJSON(path) {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`ESPN request failed (${res.status}): ${path}`)
  return res.json()
}

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------

let _teamCache = null

/** All Division I teams (cached in-memory for the session). */
export async function fetchAllD1Teams() {
  if (_teamCache) return _teamCache
  const data = await getJSON(`/teams?groups=50&limit=400`)
  const teams = (data.sports?.[0]?.leagues?.[0]?.teams || []).map((t) => ({
    id: t.team.id,
    name: t.team.displayName,
    shortName: t.team.shortDisplayName,
    abbrev: t.team.abbreviation,
    logo: t.team.logos?.[0]?.href || null,
    // CONFIRMED via live ESPN data (WebFetch, Sep 2026): this field does
    // NOT exist on the /teams list endpoint at all — checked a real team
    // object's full key list and neither `conferenceId` nor `groups.id`
    // is present. Kept as a no-op fallback chain (always resolves to
    // null in practice) rather than removed, so nothing downstream
    // breaks; RankingsPanel already shows an "unavailable" note when this
    // is null. The reliable alternative — confirmed working — is
    // clusterConferences() in lib/adjMath.js, which infers conference
    // membership from real conference-game results instead of this field.
    conferenceId: t.team.conferenceId || t.team.groups?.id || null,
  }))
  teams.sort((a, b) => a.name.localeCompare(b.name))
  _teamCache = teams
  return teams
}

// ---------------------------------------------------------------------------
// Schedule / games
// ---------------------------------------------------------------------------

export async function fetchTeamSchedule(teamId, espnSeason) {
  const data = await getJSON(`/teams/${teamId}/schedule?season=${espnSeason}`)
  const events = data.events || []
  return events
    .filter((e) => e.competitions?.[0]?.status?.type?.completed)
    .map((e) => {
      const comp = e.competitions[0]
      const competitors = comp.competitors || []
      const opponent = competitors.find((c) => c.team?.id !== teamId)
      const self = competitors.find((c) => c.team?.id === teamId)
      return {
        id: e.id,
        date: e.date,
        opponentId: opponent?.team?.id,
        opponent: opponent?.team?.displayName || 'Unknown',
        isHome: self?.homeAway === 'home',
        neutralSite: !!comp.neutralSite,
        // Used to cluster teams into conferences for the Adj. Efficiency
        // panel (see clusterConferences in lib/adjMath.js) — more reliable
        // than a team's own conferenceId field, which is CONFIRMED to not
        // exist at all on the /teams list endpoint (see fetchAllD1Teams).
        // conferenceCompetition itself is CONFIRMED real via live ESPN
        // data: true on an actual WCC tournament game (Gonzaga vs Saint
        // Mary's, 2025-03-11), checked directly against the scoreboard
        // endpoint's competitions[0] object, which shares the same shape
        // this schedule endpoint uses.
        isConferenceGame: !!comp.conferenceCompetition,
        result: `${self?.winner ? 'W' : 'L'} ${self?.score?.value ?? ''}-${opponent?.score?.value ?? ''}`,
        // Real per-game points for both sides, straight off the schedule
        // endpoint's competitors[].score.value (confirmed present on every
        // completed game via live ESPN data). This is what the Adj.
        // Efficiency pool sums to get ptsFor/ptsAgainst — the season-stats
        // endpoint has no opponent-points field at all, so this is the
        // only real source for it.
        teamScore: self?.score?.value != null ? Number(self.score.value) : null,
        oppScore: opponent?.score?.value != null ? Number(opponent.score.value) : null,
      }
    })
    .sort((a, b) => new Date(a.date) - new Date(b.date))
}

export async function fetchGameSummary(eventId) {
  return getJSON(`/summary?event=${eventId}`)
}

// ---------------------------------------------------------------------------
// Season totals (a SECOND, separate ESPN host — sports.core.api.espn.com —
// that returns a team's full-season stat totals in one request, instead of
// summing every individual box score). Used for the "Season Totals" +
// "Strength of Schedule" panels.
//
// !! CALIBRATION NOTE !! This endpoint's existence and URL shape are
// well-confirmed (it's what the open-source hoopR package hits internally),
// but the exact stat field NAMES inside its response aren't something I
// could verify live from this build environment. `SEASON_STAT_KEYS` below
// tries the most likely ESPN naming conventions (these are the same names
// ESPN uses on its own team-stats-leaders pages) and normalizeSeasonStats()
// degrades gracefully to `null` per field rather than showing a wrong
// number if a name doesn't match. If something shows as "—" that should be
// there, open devtools, hit the endpoint directly, and add the real field
// name to the candidate list — it's one line per field.

const CORE_BASE = '/api/espn-core'

async function getCoreJSON(path) {
  const res = await fetch(`${CORE_BASE}${path}`)
  if (!res.ok) throw new Error(`ESPN core request failed (${res.status}): ${path}`)
  return res.json()
}

let _seasonStatsCache = {}

/** Full-season stat totals for one team, one season, in a single request. */
export async function fetchTeamSeasonStats(teamId, espnSeason, seasonType = 2) {
  const cacheKey = `${teamId}-${espnSeason}-${seasonType}`
  if (_seasonStatsCache[cacheKey]) return _seasonStatsCache[cacheKey]
  const raw = await getCoreJSON(`/seasons/${espnSeason}/types/${seasonType}/teams/${teamId}/statistics/0`)
  const normalized = normalizeSeasonStats(raw)
  const result = { raw, ...normalized }
  _seasonStatsCache[cacheKey] = result
  return result
}

// CONFIRMED via live ESPN data (WebFetch against Saint Mary's real 2025-26
// statistics/0 response, Sep 2026): gamesPlayed, avgPoints,
// avgFieldGoalsAttempted/Made, avgThreePointFieldGoalsAttempted/Made,
// avgFreeThrowsAttempted/Made, avgOffensiveRebounds, avgDefensiveRebounds,
// avgRebounds, avgAssists, avgTurnovers, fieldGoalPct, threePointFieldGoalPct
// and freeThrowPct are all real field names, first-candidate-correct as
// listed below. Percent fields come back on a 0-100 scale (e.g. 46.13, not
// 0.4613) — worth double-checking anywhere a fraction is assumed.
//
// CONFIRMED MISSING: there is no opponent/points-allowed field anywhere in
// this endpoint's response under any name — avgPointsAllowed,
// opponentPointsPerGame and defensivePointsPerGame were all checked
// exhaustively against the real payload and none exist. The endpoint only
// ever reports a team's own offensive/defensive-effort stats (blocks,
// steals, rebounds), never points allowed. `oppPpg` is kept here for
// display purposes only (Season Totals panel shows "—" for it) — the real
// opponent-adjusted model (lib/adjEfficiencyData.js) does NOT use this
// field; it sums real per-game opponent scores off the schedule endpoint
// instead, which IS confirmed to carry them.
const SEASON_STAT_KEYS = {
  gamesPlayed: ['gamesPlayed'],
  ppg: ['avgPoints', 'pointsPerGame'],
  oppPpg: ['avgPointsAllowed', 'opponentPointsPerGame', 'defensivePointsPerGame'],
  fgPct: ['fieldGoalPct', 'avgFieldGoalPct'],
  tpPct: ['threePointFieldGoalPct', 'avgThreePointFieldGoalPct'],
  ftPct: ['freeThrowPct', 'avgFreeThrowPct'],
  rpg: ['avgRebounds', 'reboundsPerGame'],
  apg: ['avgAssists', 'assistsPerGame'],
  topg: ['avgTurnovers', 'turnoversPerGame'],
  // Extra fields needed to derive Four-Factors-style ranks for EVERY team
  // (not just the selected one) without re-fetching every game's box
  // score for all 362 D1 teams — see fetchNationalStatsPool below.
  fgaPerGame: ['avgFieldGoalsAttempted', 'fieldGoalsAttemptedPerGame'],
  fgmPerGame: ['avgFieldGoalsMade', 'fieldGoalsMadePerGame'],
  tpaPerGame: ['avgThreePointFieldGoalsAttempted', 'threePointFieldGoalsAttemptedPerGame'],
  tpmPerGame: ['avgThreePointFieldGoalsMade', 'threePointFieldGoalsMadePerGame'],
  ftaPerGame: ['avgFreeThrowsAttempted', 'freeThrowsAttemptedPerGame'],
  ftmPerGame: ['avgFreeThrowsMade', 'freeThrowsMadePerGame'],
  orebPerGame: ['avgOffensiveRebounds', 'offensiveReboundsPerGame'],
  drebPerGame: ['avgDefensiveRebounds', 'defensiveReboundsPerGame'],
  tovPerGame: ['avgTurnovers', 'turnoversPerGame'],
}

// ESPN's `value` field is usually already numeric, but `displayValue` (the
// fallback when `value` is missing) can carry formatting — "45.6%", "1,234"
// — that Number() turns into NaN rather than throwing. A silently-NaN stat
// is worse than a missing one (it poisons every average/rank downstream),
// so this always resolves to a real number or null, never NaN.
function toCleanNumber(raw) {
  if (raw == null) return null
  const n = typeof raw === 'number' ? raw : Number(String(raw).replace(/[^0-9.\-]/g, ''))
  return Number.isFinite(n) ? n : null
}

function findStat(categories, candidates) {
  for (const cat of categories || []) {
    for (const stat of cat.stats || []) {
      if (candidates.includes(stat.name)) {
        const n = toCleanNumber(stat.value ?? stat.displayValue)
        if (n != null) return n
        // name matched but the value was unusable — keep looking in case
        // a later category has the same stat name with a clean value
      }
    }
  }
  return null
}

function normalizeSeasonStats(raw) {
  const categories = raw?.splits?.categories || []
  const out = {}
  for (const [field, candidates] of Object.entries(SEASON_STAT_KEYS)) {
    out[field] = findStat(categories, candidates)
  }
  return out
}

/**
 * Strength-of-schedule context: average PPG scored / PPG allowed by every
 * distinct opponent a team has faced this season, computed from each
 * opponent's own season totals (one extra request per unique opponent).
 * This is context, not a KenPom-style single adjusted number — shown
 * alongside the team's own raw numbers so the coach can read both.
 */
export async function fetchStrengthOfSchedule(opponentIds, espnSeason) {
  const unique = [...new Set(opponentIds)].filter(Boolean)
  const results = []
  for (const id of unique) {
    try {
      const stats = await fetchTeamSeasonStats(id, espnSeason)
      if (stats.ppg != null) results.push(stats)
    } catch {
      // one opponent failing shouldn't break the whole panel
    }
  }
  if (!results.length) return null
  const avg = (key) => {
    const vals = results.map((r) => r[key]).filter((v) => v != null)
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
  }
  return {
    opponentsCounted: results.length,
    avgOpponentPpg: avg('ppg'),
    avgOpponentOppPpg: avg('oppPpg'),
  }
}

// ---------------------------------------------------------------------------
// Coordinate normalization + zone classification
// ---------------------------------------------------------------------------
// Spot-checked against a real game (Saint Mary's vs St. Thomas, 2025-26
// opener, via WebFetch): real shootingPlay coordinates came back as raw
// x in roughly 0-25 and raw y in roughly 0-25 for shots near one basket
// (a made corner three at x=10,y=22; a made top-of-key three at x=9,y=19;
// a missed three at x=16,y=23) — all comfortably inside the assumed 0-50 /
// 0-94 raw ranges below, with no y>47 case observed yet to confirm the
// fold branch specifically. Directionally consistent with the assumed
// mapping; treat this as corroborating, not an exhaustive proof — if a
// specific shot looks mirrored or off, re-check it against ESPN's own
// play-by-play page for that game.
function normalizeCoordinate(rawX, rawY) {
  let x = rawX - 25
  let y = rawY
  if (y > 47) {
    y = 94 - y
    x = -x
  }
  return { x, y }
}

const THREE_PT_RADIUS_FT = 22.146 // NCAA men's arc distance since 2019-20

/**
 * Full zone classification used by both the summary bar (bucket) and the
 * radial "Zones" chart (bucket + wedge). Angle is measured from straight
 * out from the basket (0deg), positive = shooter's right.
 */
export function classifyZoneDetailed(x, y) {
  const r = Math.sqrt(x * x + y * y)
  const angle = (Math.atan2(x, y) * 180) / Math.PI // -90..90

  if (r <= 4) return { bucket: 'RIM', wedge: 'C', ring: 0 }

  if (r <= 12) {
    const wedge = angle < 0 ? 'L' : 'R'
    return { bucket: 'S-MID', wedge, ring: 1 }
  }

  if (r < THREE_PT_RADIUS_FT) {
    let wedge = 'C'
    if (angle <= -30) wedge = 'L'
    else if (angle >= 30) wedge = 'R'
    return { bucket: 'L-MID', wedge, ring: 2 }
  }

  let wedge = 'TOP'
  if (angle <= -60) wedge = 'LC'
  else if (angle <= -20) wedge = 'LW'
  else if (angle >= 60) wedge = 'RC'
  else if (angle >= 20) wedge = 'RW'
  return { bucket: '3P', wedge, ring: 3 }
}

export function classifyZone(x, y) {
  return classifyZoneDetailed(x, y).bucket
}

// ---------------------------------------------------------------------------
// Shot extraction
// ---------------------------------------------------------------------------

// ESPN's play-by-play doesn't reliably populate a structured "who shot
// this" field for college hoops, so the primary source of truth is the
// play text itself, which always starts with the shooter's name
// (e.g. "Joshua Dent made Layup", "Aidan Mahaney missed Three Point
// Jumper"). Structured athlete fields are tried first in case they're
// present, text parsing is the reliable fallback.
function extractShooterName(play) {
  const structured =
    play.athletesInvolved?.[0]?.displayName || play.athletesInvolved?.[0]?.shortName
  if (structured) return structured

  const text = play.text || ''
  const match = text.match(/^(.*?)\s+(made|missed)\s/i)
  return match ? match[1].trim() : null
}

export function extractShots(summary, teamId) {
  const plays = summary?.plays || []
  const shots = []

  for (const play of plays) {
    if (!play.shootingPlay) continue
    const coord = play.coordinate
    if (!coord || coord.x == null || coord.y == null) continue

    const { x, y } = normalizeCoordinate(coord.x, coord.y)
    const { bucket, wedge, ring } = classifyZoneDetailed(x, y)
    const made = !!play.scoringPlay
    const isThree = /three point/i.test(play.text || '')
    const teamIsSelf = String(play.team?.id) === String(teamId)
    const period = play.period?.number
    const shooter = extractShooterName(play)

    shots.push({
      id: play.id,
      x,
      y,
      made,
      points: isThree ? 3 : 2,
      pointsScored: made ? (isThree ? 3 : 2) : 0,
      bucket,
      wedge,
      ring,
      side: teamIsSelf ? 'offense' : 'defense',
      shooter,
      period,
      half: period <= 2 ? period : 'OT',
      text: play.text,
    })
  }

  return {
    offense: shots.filter((s) => s.side === 'offense'),
    defense: shots.filter((s) => s.side === 'defense'),
  }
}

/** Aggregate a list of shots into per-bucket + overall stats. */
export function aggregateShots(shots) {
  const buckets = ['RIM', 'S-MID', 'L-MID', '3P']
  const byBucket = Object.fromEntries(buckets.map((b) => [b, { attempts: 0, makes: 0, points: 0 }]))

  let attempts = 0
  let makes = 0
  let points = 0

  for (const s of shots) {
    attempts++
    byBucket[s.bucket].attempts++
    if (s.made) {
      makes++
      points += s.points
      byBucket[s.bucket].makes++
      byBucket[s.bucket].points += s.points
    }
  }

  const fgPct = attempts ? makes / attempts : 0
  const threeMakes = shots.filter((s) => s.made && s.points === 3).length
  const efg = attempts ? (makes + 0.5 * threeMakes) / attempts : 0
  const ptsPerShot = attempts ? points / attempts : 0

  const bucketStats = Object.fromEntries(
    buckets.map((b) => {
      const d = byBucket[b]
      return [b, { ...d, pct: d.attempts ? d.makes / d.attempts : 0 }]
    })
  )

  return { attempts, makes, points, fgPct, efg, ptsPerShot, bucketStats }
}

/** Group shots by (bucket, wedge) for the radial zone chart. */
export function aggregateByWedge(shots) {
  const groups = {}
  for (const s of shots) {
    const key = `${s.bucket}|${s.wedge}`
    groups[key] ??= []
    groups[key].push(s)
  }
  const out = {}
  for (const [key, group] of Object.entries(groups)) {
    out[key] = aggregateShots(group)
  }
  return out
}

// ---------------------------------------------------------------------------
// Box score / Four Factors
// ---------------------------------------------------------------------------
// A KenPom-*flavored* advanced stats summary — computed from ESPN's public
// box score totals using Dean Oliver's standard, publicly documented "Four
// Factors" formulas. This is NOT scraped from KenPom.com. See README for
// why (KenPom's specific numbers are behind a subscription and its
// opponent-adjustment methodology is proprietary; the underlying raw
// efficiency/four-factors math is public domain and reproducible from any
// box score, which is what this does).

function statMap(statistics = []) {
  const m = {}
  for (const s of statistics) m[s.name] = s.displayValue
  return m
}

function splitMadeAttempted(str) {
  if (!str) return [0, 0]
  const [m, a] = str.split('-').map(Number)
  return [m || 0, a || 0]
}

/** Pull raw box score totals for both teams out of one game summary. */
export function extractBoxScore(summary, teamId) {
  const teams = summary?.boxscore?.teams || []
  const selfEntry = teams.find((t) => String(t.team?.id) === String(teamId))
  const oppEntry = teams.find((t) => String(t.team?.id) !== String(teamId))
  if (!selfEntry || !oppEntry) return null

  const parseTeam = (entry) => {
    const m = statMap(entry.statistics)
    const [fgm, fga] = splitMadeAttempted(m['fieldGoalsMade-fieldGoalsAttempted'])
    const [tpm, tpa] = splitMadeAttempted(m['threePointFieldGoalsMade-threePointFieldGoalsAttempted'])
    const [ftm, fta] = splitMadeAttempted(m['freeThrowsMade-freeThrowsAttempted'])
    return {
      teamId: entry.team?.id,
      fgm,
      fga,
      tpm,
      tpa,
      ftm,
      fta,
      oreb: Number(m.offensiveRebounds) || 0,
      dreb: Number(m.defensiveRebounds) || 0,
      tov: Number(m.turnovers) || 0,
      ast: Number(m.assists) || 0,
      pts: (fgm - tpm) * 2 + tpm * 3 + ftm,
    }
  }

  return { self: parseTeam(selfEntry), opp: parseTeam(oppEntry) }
}

/** Estimate possessions (Dean Oliver's formula). */
function possessions(t) {
  return t.fga - t.oreb + t.tov + 0.475 * t.fta
}

/**
 * Aggregate Four-Factors-style advanced stats across a list of
 * {self, opp} box scores (one per game).
 */
export function aggregateFourFactors(boxScores) {
  const sum = (key, side) => boxScores.reduce((acc, b) => acc + (b[side]?.[key] || 0), 0)

  const self = {
    fgm: sum('fgm', 'self'),
    fga: sum('fga', 'self'),
    tpm: sum('tpm', 'self'),
    tpa: sum('tpa', 'self'),
    ftm: sum('ftm', 'self'),
    fta: sum('fta', 'self'),
    oreb: sum('oreb', 'self'),
    dreb: sum('dreb', 'self'),
    tov: sum('tov', 'self'),
    pts: sum('pts', 'self'),
  }
  const opp = {
    fgm: sum('fgm', 'opp'),
    fga: sum('fga', 'opp'),
    tpm: sum('tpm', 'opp'),
    tpa: sum('tpa', 'opp'),
    ftm: sum('ftm', 'opp'),
    fta: sum('fta', 'opp'),
    oreb: sum('oreb', 'opp'),
    dreb: sum('dreb', 'opp'),
    tov: sum('tov', 'opp'),
    pts: sum('pts', 'opp'),
  }

  const gamesPlayed = boxScores.length
  const offPoss = possessions(self)
  const defPoss = possessions(opp)

  return {
    gamesPlayed,
    pace: gamesPlayed ? offPoss / gamesPlayed : 0,
    offRtg: offPoss ? (self.pts / offPoss) * 100 : 0,
    defRtg: defPoss ? (opp.pts / defPoss) * 100 : 0,
    offEfg: self.fga ? (self.fgm + 0.5 * self.tpm) / self.fga : 0,
    defEfg: opp.fga ? (opp.fgm + 0.5 * opp.tpm) / opp.fga : 0,
    offTov: offPoss ? self.tov / offPoss : 0,
    defTov: defPoss ? opp.tov / defPoss : 0,
    offOrb: self.oreb + opp.dreb ? self.oreb / (self.oreb + opp.dreb) : 0,
    defOrb: opp.oreb + self.dreb ? opp.oreb / (opp.oreb + self.dreb) : 0,
    offFtRate: self.fga ? self.fta / self.fga : 0,
    defFtRate: opp.fga ? opp.fta / opp.fga : 0,
    self,
    opp,
  }
}
