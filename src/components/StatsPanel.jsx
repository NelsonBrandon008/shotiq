function pct(v) {
  return v == null ? '—' : `${(v * 100).toFixed(1)}%`
}
function num(v, d = 1) {
  return v == null ? '—' : v.toFixed(d)
}

function Row({ label, off, def, offFmt = pct, defFmt = pct }) {
  return (
    <div className="stats-row">
      <div className="stats-row-label">{label}</div>
      <div className="stats-row-val stats-off">{offFmt(off)}</div>
      <div className="stats-row-val stats-def">{defFmt(def)}</div>
    </div>
  )
}

export default function StatsPanel({ stats, seasonTotals, sos, teamName }) {
  if (!stats || !stats.gamesPlayed) {
    return <div className="stats-panel stats-panel-empty">No completed games yet for this selection.</div>
  }

  return (
    <div className="stats-panel">
      <div className="stats-panel-header">
        <h3>{teamName} · Advanced Stats</h3>
        <span className="stats-panel-sub">{stats.gamesPlayed} games</span>
      </div>

      <div className="stats-table">
        <div className="stats-row stats-row-header">
          <div className="stats-row-label" />
          <div className="stats-row-val">Offense</div>
          <div className="stats-row-val">Defense</div>
        </div>
        <Row label="Efficiency (pts/100 poss)" off={stats.offRtg} def={stats.defRtg} offFmt={(v) => num(v)} defFmt={(v) => num(v)} />
        <Row label="Pace (poss/game)" off={stats.pace} def={stats.pace} offFmt={(v) => num(v)} defFmt={() => '—'} />
        <Row label="Effective FG%" off={stats.offEfg} def={stats.defEfg} />
        <Row label="Turnover %" off={stats.offTov} def={stats.defTov} />
        <Row label="Off. Rebound %" off={stats.offOrb} def={stats.defOrb} />
        <Row label="FT Rate" off={stats.offFtRate} def={stats.defFtRate} />
      </div>
      <div className="stats-panel-note">
        Four Factors, computed directly from ESPN box scores using Dean
        Oliver's public formulas — raw, not opponent-adjusted.
      </div>

      {seasonTotals && (
        <>
          <div className="stats-divider" />
          <div className="stats-panel-header">
            <h3>Season Totals</h3>
            <span className="stats-panel-sub">per ESPN's own season stats</span>
          </div>
          <div className="stats-mini-grid">
            <div className="stats-mini-cell"><div className="stats-mini-label">PPG</div><div className="stats-mini-value">{num(seasonTotals.ppg)}</div></div>
            <div className="stats-mini-cell"><div className="stats-mini-label">FG%</div><div className="stats-mini-value">{num(seasonTotals.fgPct)}</div></div>
            <div className="stats-mini-cell"><div className="stats-mini-label">3P%</div><div className="stats-mini-value">{num(seasonTotals.tpPct)}</div></div>
            <div className="stats-mini-cell"><div className="stats-mini-label">FT%</div><div className="stats-mini-value">{num(seasonTotals.ftPct)}</div></div>
            <div className="stats-mini-cell"><div className="stats-mini-label">RPG</div><div className="stats-mini-value">{num(seasonTotals.rpg)}</div></div>
            <div className="stats-mini-cell"><div className="stats-mini-label">APG</div><div className="stats-mini-value">{num(seasonTotals.apg)}</div></div>
            <div className="stats-mini-cell"><div className="stats-mini-label">TOPG</div><div className="stats-mini-value">{num(seasonTotals.topg)}</div></div>
          </div>
        </>
      )}

      {sos && (
        <>
          <div className="stats-divider" />
          <div className="stats-panel-header">
            <h3>Strength of Schedule</h3>
            <span className="stats-panel-sub">{sos.opponentsCounted} opponents</span>
          </div>
          <div className="stats-mini-grid">
            <div className="stats-mini-cell">
              <div className="stats-mini-label">Avg opp. PPG</div>
              <div className="stats-mini-value">{num(sos.avgOpponentPpg)}</div>
            </div>
            <div className="stats-mini-cell">
              <div className="stats-mini-label">Avg opp. PPG allowed</div>
              <div className="stats-mini-value">{num(sos.avgOpponentOppPpg)}</div>
            </div>
          </div>
          <div className="stats-panel-note">
            Average scoring/defense of the teams on this schedule, from each
            opponent's own season totals — context for how good this
            competition is, not a single blended "adjusted" number like
            KenPom's AdjEM (that needs a full-league iterative solve across
            every D1 team's results, a good follow-up project on its own).
          </div>
        </>
      )}

      {(!seasonTotals || Object.values(seasonTotals).every((v) => v == null)) && (
        <div className="stats-panel-note stats-panel-warn">
          Season Totals didn't come back populated — this endpoint's exact
          field names weren't verifiable from the environment this was
          built in. See the calibration note in <code>fetchTeamSeasonStats</code>{' '}
          in <code>src/lib/espnData.js</code>.
        </div>
      )}
    </div>
  )
}
