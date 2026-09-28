import { useState } from 'react'
import { fetchAdjEfficiencyPool, findTeamRow } from '../lib/adjEfficiencyData'

// Column key -> { label, higherBetter, natRankField, confRankField }
const COLUMNS = {
  adjEM: { label: 'AdjEM', higherBetter: true, natRank: 'rkEM', confRank: 'cRkEM' },
  adjO: { label: 'AdjO', higherBetter: true, natRank: 'rkO', confRank: 'cRkO' },
  adjD: { label: 'AdjD', higherBetter: false, natRank: 'rkD', confRank: 'cRkD' },
  tempo: { label: 'Tempo', higherBetter: true, natRank: 'rkTempo', confRank: 'cRkTempo' },
}

function fmt(key, val) {
  if (val == null) return '—'
  if (key === 'adjEM') return `${val >= 0 ? '+' : ''}${val.toFixed(1)}`
  return val.toFixed(1)
}

export default function AdjEfficiencyPanel({ team, espnSeason }) {
  const [pool, setPool] = useState(null)
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState(null)
  const [scope, setScope] = useState('national') // 'national' | 'conference'
  const [sortKey, setSortKey] = useState('adjEM')

  async function compute() {
    setError(null)
    setProgress({ done: 0, total: 1 })
    try {
      const p = await fetchAdjEfficiencyPool(espnSeason, (done, total) => setProgress({ done, total }))
      setPool(p)
    } catch (e) {
      setError(e.message)
    } finally {
      setProgress(null)
    }
  }

  if (!pool) {
    return (
      <div className="adjeff-panel">
        <div className="rankings-header">
          <h3>Adj. Efficiency</h3>
        </div>
        <p className="rankings-intro">
          Opponent-adjusted Offensive/Defensive Efficiency (AdjO / AdjD / AdjEM) for {team.name}
          and every other D1 team — an iterative model computed entirely from ESPN's season
          totals and schedules, not KenPom's numbers. Needs two requests per D1 team (~720 total),
          so it's manual rather than automatic; the result is cached for 12 hours.
        </p>
        <button className="rankings-compute-btn" onClick={compute} disabled={!!progress}>
          {progress ? `Fetching teams… ${progress.done}/${progress.total}` : 'Compute Adj. Efficiency'}
        </button>
        {error && <div className="status-line error">Couldn't finish: {error}</div>}
      </div>
    )
  }

  const teamRow = findTeamRow(pool, team.id)
  const scopedRows =
    scope === 'conference' && teamRow?.conf ? pool.rows.filter((r) => r.conf === teamRow.conf) : pool.rows

  const colDef = COLUMNS[sortKey]
  const sorted = [...scopedRows].sort((a, b) =>
    colDef.higherBetter ? b[sortKey] - a[sortKey] : a[sortKey] - b[sortKey]
  )

  // National view: cap the table to a readable length but always keep the
  // selected team's row visible, even if it falls outside that window.
  // Conference view is small enough to just show every team in it.
  const displayCap = scope === 'conference' ? sorted.length : 50
  let displayed = sorted.slice(0, displayCap)
  if (teamRow && !displayed.some((r) => r.id === teamRow.id)) {
    displayed = [...displayed, teamRow]
  }

  const rankFieldFor = (key) => (scope === 'conference' ? COLUMNS[key].confRank : COLUMNS[key].natRank)

  return (
    <div className="adjeff-panel">
      <div className="rankings-header">
        <h3>Adj. Efficiency</h3>
        <button className="rankings-refresh-btn" onClick={() => setPool(null)}>
          Recompute
        </button>
      </div>

      {teamRow ? (
        <div className="adjeff-headline">
          <div className="adjeff-headline-cell">
            <div className="adjeff-headline-label">Offense</div>
            <div className="adjeff-headline-value">{teamRow.adjO.toFixed(1)}</div>
            <div className="adjeff-headline-ranks">
              Natl #{teamRow.rkO}
              {teamRow.cRkO ? ` · Conf #${teamRow.cRkO}` : ''}
            </div>
          </div>
          <div className="adjeff-headline-cell">
            <div className="adjeff-headline-label">Defense</div>
            <div className="adjeff-headline-value">{teamRow.adjD.toFixed(1)}</div>
            <div className="adjeff-headline-ranks">
              Natl #{teamRow.rkD}
              {teamRow.cRkD ? ` · Conf #${teamRow.cRkD}` : ''}
            </div>
          </div>
          <div className="adjeff-headline-cell">
            <div className="adjeff-headline-label">Margin</div>
            <div className={`adjeff-headline-value ${teamRow.adjEM >= 0 ? 'adjeff-pos' : 'adjeff-neg'}`}>
              {fmt('adjEM', teamRow.adjEM)}
            </div>
            <div className="adjeff-headline-ranks">
              Natl #{teamRow.rkEM}
              {teamRow.cRkEM ? ` · Conf #${teamRow.cRkEM}` : ''}
            </div>
          </div>
        </div>
      ) : (
        <div className="status-line error">
          {team.name} wasn't included in this computation — likely missing schedule or
          season-stats data from ESPN for this season.
        </div>
      )}

      <div className="adjeff-controls">
        <div className="view-toggle">
          <button className={scope === 'national' ? 'active' : ''} onClick={() => setScope('national')}>
            All D-I
          </button>
          <button
            className={scope === 'conference' ? 'active' : ''}
            onClick={() => setScope('conference')}
            disabled={!teamRow?.conf}
          >
            Conference{teamRow?.confSize ? ` (${teamRow.confSize})` : ''}
          </button>
        </div>
        <div className="adjeff-meta">
          {pool.teamsIncluded}/{pool.teamsTotal} teams ·{' '}
          {pool.converged ? 'model converged' : `stopped after ${pool.iterationsRun} iterations`}
        </div>
      </div>

      {scope === 'conference' && !teamRow?.conf && (
        <div className="stats-panel-note stats-panel-warn">
          Conference grouping wasn't resolvable for {team.name} from this season's schedule data
          (too few conference-flagged games), so conference scoping isn't available here.
        </div>
      )}

      <div className="adjeff-table-wrap">
        <table className="adjeff-table">
          <thead>
            <tr>
              <th>Rk</th>
              <th className="adjeff-th-team">Team</th>
              {Object.entries(COLUMNS).map(([key, def]) => (
                <th
                  key={key}
                  className={sortKey === key ? 'adjeff-th-active' : ''}
                  onClick={() => setSortKey(key)}
                >
                  {def.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayed.map((r) => {
              const isTeam = r.id === team.id
              const rank = r[rankFieldFor(sortKey)]
              return (
                <tr key={r.id} className={isTeam ? 'adjeff-row-highlight' : ''}>
                  <td>{rank ?? '—'}</td>
                  <td className="adjeff-td-team">
                    {r.logo && <img src={r.logo} alt="" className="adjeff-team-logo" />}
                    {r.name}
                  </td>
                  {Object.keys(COLUMNS).map((key) => (
                    <td key={key}>{fmt(key, r[key])}</td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {scope === 'national' && sorted.length > displayCap && (
        <div className="adjeff-table-note">
          Showing top {displayCap} of {sorted.length}
          {teamRow && !sorted.slice(0, displayCap).some((r) => r.id === teamRow.id)
            ? ` (plus ${team.name}, pinned below)`
            : ''}
          . Click a column to sort by it.
        </div>
      )}

      <div className="stats-panel-note">
        Our own opponent-adjustment model — an iterative solve in the spirit of KenPom's published
        description of his method, run entirely on ESPN's season totals and schedules. It is{' '}
        <strong>not</strong> KenPom's numbers or methodology: his is proprietary and includes
        per-game weighting, recency, and margin-of-victory dampening this doesn't attempt, so
        treat AdjEM here as directionally right rather than identical to his site.
      </div>
    </div>
  )
}
