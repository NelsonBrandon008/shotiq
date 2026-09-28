import { useState } from 'react'
import { fetchNationalStatsPool, computeRankings, buildRankLookup, approximateQuad } from '../lib/rankings'

const METRIC_LABELS = {
  offRtg: 'Efficiency (pts/100 poss)',
  efg: 'Effective FG%',
  tovPct: 'Turnover %',
  ftRate: 'FT Rate',
  pace: 'Pace (poss/game)',
}

function RankCell({ rank }) {
  if (!rank) return <span className="rank-dash">—</span>
  return (
    <span className="rank-value">
      {rank.rank}
      <span className="rank-total">/{rank.total}</span>
    </span>
  )
}

export default function RankingsPanel({ team, espnSeason, games, teamMetrics }) {
  const [pool, setPool] = useState(null)
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState(null)
  const [confOnly, setConfOnly] = useState(false)

  async function compute() {
    setError(null)
    setProgress({ done: 0, total: 1 })
    try {
      const p = await fetchNationalStatsPool(espnSeason, (done, total) => setProgress({ done, total }))
      setPool(p)
    } catch (e) {
      setError(e.message)
    } finally {
      setProgress(null)
    }
  }

  if (!pool) {
    return (
      <div className="rankings-panel">
        <p className="rankings-intro">
          Rank {team.name}'s efficiency and Four Factors against every other D1 team — computed
          from ESPN's own season-totals endpoint, not scraped from KenPom. This needs one request
          per D1 team (~360), so it's manual rather than automatic.
        </p>
        <button className="rankings-compute-btn" onClick={compute} disabled={!!progress}>
          {progress ? `Fetching teams… ${progress.done}/${progress.total}` : 'Compute National Rankings'}
        </button>
        {error && <div className="status-line error">Couldn't finish: {error}</div>}
      </div>
    )
  }

  const teamEntry = pool.find((p) => p.teamId === team.id)
  const conferenceId = teamEntry?.conferenceId
  const rankings = computeRankings(pool, team.id, conferenceId)
  const rankLookup = buildRankLookup(pool)

  // Approximate quad record for the current game selection.
  const quadCounts = { 1: { w: 0, l: 0 }, 2: { w: 0, l: 0 }, 3: { w: 0, l: 0 }, 4: { w: 0, l: 0 } }
  for (const g of games) {
    const oppRank = rankLookup[g.opponentId]
    const loc = g.neutralSite ? 'neutral' : g.isHome ? 'home' : 'away'
    const quad = approximateQuad(oppRank, loc)
    if (!quad) continue
    const won = g.result?.startsWith('W')
    quadCounts[quad][won ? 'w' : 'l']++
  }

  return (
    <div className="rankings-panel">
      <div className="rankings-header">
        <h3>National &amp; Conference Rank</h3>
        <label className="rankings-conf-toggle">
          <input type="checkbox" checked={confOnly} onChange={(e) => setConfOnly(e.target.checked)} />
          Conference only
        </label>
      </div>

      <div className="rankings-table">
        <div className="rankings-row rankings-row-header">
          <div />
          <div>Value</div>
          <div>Rank</div>
        </div>
        {Object.entries(METRIC_LABELS).map(([key, label]) => {
          const val = teamMetrics?.[key]
          const rank = confOnly ? rankings[key].conference : rankings[key].national
          return (
            <div className="rankings-row" key={key}>
              <div className="rankings-row-label">{label}</div>
              <div className="rankings-row-val">
                {val == null ? '—' : key === 'pace' ? val.toFixed(1) : key.includes('Pct') || key === 'efg' || key === 'tovPct' || key === 'ftRate' ? `${(val * 100).toFixed(1)}%` : val.toFixed(1)}
              </div>
              <div className="rankings-row-val">
                <RankCell rank={rank} />
              </div>
            </div>
          )
        })}
      </div>
      {confOnly && !conferenceId && (
        <div className="stats-panel-note stats-panel-warn">
          Conference grouping wasn't available for this team from ESPN's data — showing national
          rank isn't possible to scope by conference here.
        </div>
      )}

      <div className="stats-divider" />
      <div className="rankings-header">
        <h3>Approximate Quad Record</h3>
      </div>
      <div className="quad-grid">
        {[1, 2, 3, 4].map((q) => (
          <div key={q} className="quad-cell">
            <div className="quad-label">Quad {q}</div>
            <div className="quad-record">
              {quadCounts[q].w}-{quadCounts[q].l}
            </div>
          </div>
        ))}
      </div>
      <div className="stats-panel-note">
        Uses our own computed efficiency rank in place of the NCAA's real NET rank, applied to the
        NCAA's actual quad boundary table (Home 1-30/31-75/76-160, Neutral 1-50/51-100/101-200,
        Away 1-75/76-135/136-240). Will disagree with the official Selection Committee sheet
        whenever a team's efficiency rank and true NET rank diverge — there's no public NET feed
        to match it exactly.
      </div>

      <button className="rankings-refresh-btn" onClick={() => setPool(null)}>
        Refresh rankings
      </button>
    </div>
  )
}
