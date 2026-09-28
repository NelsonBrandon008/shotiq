import { aggregateShots } from '../lib/espnData'
import RadialZoneChart from './RadialZoneChart'

const W = 500
const H = 470
const MARGIN = 20

function toSvg(x, y) {
  const px = MARGIN + ((x + 25) / 50) * (W - 2 * MARGIN)
  const py = H - MARGIN - (y / 47) * (H - 2 * MARGIN)
  return [px, py]
}

function Court() {
  const [bx, by] = toSvg(0, 0)
  const threeR = (22.146 / 47) * (H - 2 * MARGIN)
  const [, keyTop] = toSvg(0, 19)
  const [keyLeft] = toSvg(-8, 0)
  const [keyRight] = toSvg(8, 0)
  const [, baseline] = toSvg(0, 0)

  return (
    <g stroke="var(--line)" strokeWidth="2" fill="none">
      <line x1={MARGIN} y1={baseline} x2={W - MARGIN} y2={baseline} />
      <rect x={keyLeft} y={keyTop} width={keyRight - keyLeft} height={baseline - keyTop} />
      <circle cx={bx} cy={keyTop} r={(6 / 47) * (H - 2 * MARGIN)} />
      <circle cx={bx} cy={by + 6} r="6" />
      <path
        d={`M ${MARGIN + 4} ${Math.min(baseline, by + 4)} A ${threeR} ${threeR} 0 0 1 ${W - MARGIN - 4} ${Math.min(
          baseline,
          by + 4
        )}`}
      />
    </g>
  )
}

const BUCKET_LABEL = { RIM: 'Rim', 'S-MID': 'Short Mid', 'L-MID': 'Long Mid', '3P': '3PT' }

function ShotsView({ shots }) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%">
      <Court />
      {shots.map((s) => {
        const [px, py] = toSvg(s.x, s.y)
        return (
          <circle key={s.id} cx={px} cy={py} r="4.5" fill={s.made ? 'var(--make)' : 'var(--miss)'} opacity="0.85" />
        )
      })}
    </svg>
  )
}

export default function CourtChart({ title, shots, view }) {
  const stats = aggregateShots(shots)
  return (
    <div className="chart-panel">
      <div className="chart-header">
        <h3>{title}</h3>
        <div className="chart-stats">
          <span>{(stats.fgPct * 100).toFixed(1)}% FG</span>
          <span>
            {stats.makes}/{stats.attempts}
          </span>
          <span>{(stats.efg * 100).toFixed(1)}% eFG</span>
          <span>{stats.ptsPerShot.toFixed(3)} pts/shot</span>
        </div>
      </div>

      <div className="chart-body">
        {view === 'shots' ? <ShotsView shots={shots} /> : <RadialZoneChart shots={shots} />}
      </div>

      <div className="zone-summary-bar">
        {['RIM', 'S-MID', 'L-MID', '3P'].map((z) => (
          <div key={z} className="zone-summary-cell">
            <div className="zone-summary-label">{BUCKET_LABEL[z]} FG%</div>
            <div className="zone-summary-value">
              {stats.bucketStats[z].attempts ? `${(stats.bucketStats[z].pct * 100).toFixed(1)}%` : '—'}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
