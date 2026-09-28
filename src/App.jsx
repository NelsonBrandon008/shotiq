import { useEffect, useState, useMemo } from 'react'
import {
  fetchTeamSchedule,
  fetchGameSummary,
  extractShots,
  extractBoxScore,
  aggregateFourFactors,
  fetchTeamSeasonStats,
  fetchStrengthOfSchedule,
  SAINT_MARYS_TEAM_ID,
  SEASONS,
} from './lib/espnData'
import { deriveMetrics } from './lib/rankings'
import CourtChart from './components/CourtChart'
import { SeasonSelector } from './components/GameSelector'
import GamesMultiSelect from './components/GamesMultiSelect'
import TeamSearch from './components/TeamSearch'
import FiltersPanel from './components/FiltersPanel'
import StatsPanel from './components/StatsPanel'
import RankingsPanel from './components/RankingsPanel'
import AdjEfficiencyPanel from './components/AdjEfficiencyPanel'

const SMC_LOGO_OVERRIDE = '/smc-logo.png'

// v3: dropped lineup on/off-court tracking (removed per feedback — the
// single Player dropdown covers what's needed) and stopped caching the
// per-shot `text` field, both of which shrink the cached payload a lot.
const CACHE_KEY = (teamId, season, gameId) => `shots-v3-${teamId}-${season}-${gameId}`

// sessionStorage has a small (~5-10MB) quota, and caching a full season's
// worth of shot data can bump into it. A failed cache WRITE should never
// take down the app — it just means that one game refetches next time
// instead of hitting cache. Reading is unaffected either way.
function safeSessionSet(key, value) {
  try {
    sessionStorage.setItem(key, value)
  } catch {
    // quota exceeded or storage disabled — fine, just don't cache this one
  }
}

const emptyFilters = { player: '', half: '', opponent: '', location: '' }

export default function App() {
  const [team, setTeam] = useState({ id: SAINT_MARYS_TEAM_ID, name: "Saint Mary's Gaels", logo: SMC_LOGO_OVERRIDE })
  const [seasonKey, setSeasonKey] = useState('2025-26')
  const season = SEASONS.find((s) => s.key === seasonKey)

  const [games, setGames] = useState([])
  const [selectedGameIds, setSelectedGameIds] = useState([]) // empty = cumulative (all games)
  const [view, setView] = useState('shots')
  const [tab, setTab] = useState('chart') // 'chart' | 'stats'
  const [filters, setFilters] = useState(emptyFilters)

  const [loading, setLoading] = useState(true)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [error, setError] = useState(null)
  const [gameData, setGameData] = useState({}) // { [gameId]: {shots:{offense,defense}, box:{self,opp}} }

  // Reset everything when team or season changes.
  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      setGameData({})
      setSelectedGameIds([])
      setFilters(emptyFilters)
      try {
        const schedule = await fetchTeamSchedule(team.id, season.espnSeason)
        if (cancelled) return
        setGames(schedule)
        setProgress({ done: 0, total: schedule.length })

        for (const g of schedule) {
          const cacheKey = CACHE_KEY(team.id, season.key, g.id)
          let entry = null
          const cached = sessionStorage.getItem(cacheKey)
          if (cached) {
            try {
              entry = JSON.parse(cached)
            } catch {
              entry = null // corrupted cache entry — just refetch below
            }
          }
          if (!entry) {
            const summary = await fetchGameSummary(g.id)
            const shots = extractShots(summary, team.id)
            const box = extractBoxScore(summary, team.id)
            // Drop the raw play text before caching — only needed it
            // transiently to pull the shooter's name out, already done.
            for (const s of [...shots.offense, ...shots.defense]) delete s.text
            entry = { shots, box }
            safeSessionSet(cacheKey, JSON.stringify(entry))
          }
          if (cancelled) return
          setProgress((p) => ({ ...p, done: p.done + 1 }))
          setGameData((prev) => ({ ...prev, [g.id]: entry }))
        }
      } catch (e) {
        if (!cancelled) setError(e.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [team.id, season.key])

  const gameIds = useMemo(() => {
    return selectedGameIds.length ? selectedGameIds : games.map((g) => g.id)
  }, [selectedGameIds, games])

  const filterOptions = useMemo(() => {
    const players = new Set()
    for (const id of Object.keys(gameData)) {
      const d = gameData[id]
      for (const s of d?.shots?.offense || []) {
        if (s.shooter) players.add(s.shooter)
      }
    }
    return {
      players: [...players].sort(),
      opponents: games.map((g) => g.opponent),
    }
  }, [gameData, games])

  function applyFilters(shots, gameId, side) {
    const game = games.find((g) => g.id === gameId)
    return shots.filter((s) => {
      // Player filter only makes sense against the side whose players
      // you're looking at — applying "your" player name to opponent
      // (defense) shots would just blank the defense chart out.
      if (filters.player && side === 'offense' && s.shooter !== filters.player) return false
      if (filters.half && String(s.half) !== filters.half) return false
      if (filters.opponent && game?.opponent !== filters.opponent) return false
      if (filters.location) {
        const loc = game?.neutralSite ? 'neutral' : game?.isHome ? 'home' : 'away'
        if (loc !== filters.location) return false
      }
      return true
    })
  }

  const { offense, defense } = useMemo(() => {
    const offense = []
    const defense = []
    for (const id of gameIds) {
      const d = gameData[id]
      if (!d) continue
      offense.push(...applyFilters(d.shots.offense, id, 'offense'))
      defense.push(...applyFilters(d.shots.defense, id, 'defense'))
    }
    return { offense, defense }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameIds, gameData, filters])

  const fourFactors = useMemo(() => {
    const boxes = gameIds.map((id) => gameData[id]?.box).filter(Boolean)
    return aggregateFourFactors(boxes)
  }, [gameIds, gameData])

  const [seasonTotals, setSeasonTotals] = useState(null)
  const [sos, setSos] = useState(null)

  // Only fetch these (extra requests) once the user actually opens the
  // Stats tab, and only once per team+season.
  useEffect(() => {
    if (tab !== 'stats' || loading) return
    let cancelled = false
    setSeasonTotals(null)
    setSos(null)
    fetchTeamSeasonStats(team.id, season.espnSeason)
      .then((s) => !cancelled && setSeasonTotals(s))
      .catch(() => {})
    const opponentIds = games.map((g) => g.opponentId)
    if (opponentIds.length) {
      fetchStrengthOfSchedule(opponentIds, season.espnSeason)
        .then((s) => !cancelled && setSos(s))
        .catch(() => {})
    }
    return () => {
      cancelled = true
    }
  }, [tab, loading, team.id, season.espnSeason, games])

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-title">
          {team.logo && <img src={team.logo} alt="" className="app-logo" />}
          <span className="app-title-main">ShotIQ</span>
        </div>
        <TeamSearch selectedTeam={team} onSelect={(t) => setTeam(t)} />
      </header>

      <div className="controls">
        <SeasonSelector seasonKey={seasonKey} onChange={setSeasonKey} loading={loading} />
        <GamesMultiSelect
          games={games}
          selectedIds={selectedGameIds}
          onChange={setSelectedGameIds}
          loading={loading}
          seasonLabel={season.label}
        />
        <div className="view-toggle">
          <button className={tab === 'chart' ? 'active' : ''} onClick={() => setTab('chart')}>
            Shot Chart
          </button>
          <button className={tab === 'stats' ? 'active' : ''} onClick={() => setTab('stats')}>
            Advanced Stats
          </button>
        </div>
      </div>

      {tab === 'chart' && (
        <div className="controls controls-secondary">
          <FiltersPanel options={filterOptions} filters={filters} onChange={setFilters} />
          <div className="view-toggle">
            <button className={view === 'shots' ? 'active' : ''} onClick={() => setView('shots')}>
              Shots
            </button>
            <button className={view === 'zones' ? 'active' : ''} onClick={() => setView('zones')}>
              Zones
            </button>
          </div>
        </div>
      )}

      {loading && (
        <div className="status-line">
          Loading {team.name} games… {progress.done}/{progress.total}
        </div>
      )}
      {error && (
        <div className="status-line error">
          Couldn't load data: {error}. ESPN's endpoints are unofficial and can be flaky — try again in a moment.
        </div>
      )}
      {!loading && !error && !games.length && (
        <div className="status-line">No completed {season.label} games found for {team.name} yet.</div>
      )}

      {tab === 'chart' ? (
        <div className="charts-row">
          <CourtChart title="Offense" shots={offense} view={view} />
          <CourtChart title="Defense" shots={defense} view={view} />
        </div>
      ) : (
        <>
          <AdjEfficiencyPanel team={team} espnSeason={season.espnSeason} />
          <div style={{ height: 20 }} />
          <StatsPanel stats={fourFactors} seasonTotals={seasonTotals} sos={sos} teamName={team.name} />
          <div style={{ height: 20 }} />
          <RankingsPanel
            team={team}
            espnSeason={season.espnSeason}
            games={games}
            teamMetrics={seasonTotals ? deriveMetrics(seasonTotals) : null}
          />
        </>
      )}

      <footer className="app-footer">
        Data via ESPN (unofficial API) · Advanced stats computed from box scores, not scraped from KenPom · Not affiliated with ESPN, KenPom, or the NCAA
      </footer>
    </div>
  )
}
