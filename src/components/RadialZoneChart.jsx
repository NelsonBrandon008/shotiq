import { aggregateShots } from '../lib/espnData'

// Halfcourt drawn in feet -> SVG px. Same frame as CourtChart's Shots view.
const W = 500
const H = 470
const MARGIN = 20
const FT_TO_PX = (H - 2 * MARGIN) / 47

function polar(rFt, angleDeg) {
  // angleDeg: 0 = straight out from the basket, + = shooter's right
  const rad = (angleDeg * Math.PI) / 180
  const x = rFt * Math.sin(rad)
  const y = rFt * Math.cos(rad)
  const px = MARGIN + (x + 25) * ((W - 2 * MARGIN) / 50)
  const py = H - MARGIN - y * FT_TO_PX
  return [px, py]
}

/** SVG path for one annular wedge (a ring slice). */
function wedgePath(rInner, rOuter, angleStart, angleEnd) {
  const [x1, y1] = polar(rOuter, angleStart)
  const [x2, y2] = polar(rOuter, angleEnd)
  const [x3, y3] = polar(rInner, angleEnd)
  const [x4, y4] = polar(rInner, angleStart)
  const largeArc = angleEnd - angleStart > 180 ? 1 : 0

  if (rInner <= 0) {
    // Pie slice (no inner arc) for the rim
    const [cx, cy] = polar(0, 0)
    return `M ${cx} ${cy} L ${x1} ${y1} A ${rOuter * FT_TO_PX} ${rOuter * FT_TO_PX} 0 ${largeArc} 1 ${x2} ${y2} Z`
  }

  return [
    `M ${x1} ${y1}`,
    `A ${rOuter * FT_TO_PX} ${rOuter * FT_TO_PX} 0 ${largeArc} 1 ${x2} ${y2}`,
    `L ${x3} ${y3}`,
    `A ${rInner * FT_TO_PX} ${rInner * FT_TO_PX} 0 ${largeArc} 0 ${x4} ${y4}`,
    'Z',
  ].join(' ')
}

function labelPos(rInner, rOuter, angleStart, angleEnd) {
  const rMid = (rInner + rOuter) / 2 || rOuter * 0.5
  const angleMid = (angleStart + angleEnd) / 2
  return polar(rMid, angleMid)
}

function colorForPct(pct, attempts) {
  if (!attempts) return 'var(--zone-empty)'
  const t = Math.max(0, Math.min(1, pct / 0.65))
  const r = Math.round(210 - t * 140)
  const g = Math.round(80 + t * 130)
  const b = 85
  return `rgb(${r},${g},${b})`
}

// Ring/wedge geometry, matched to classifyZoneDetailed's bucket+wedge output.
const RINGS = [
  { bucket: 'RIM', rInner: 0, rOuter: 4, wedges: [{ id: 'C', start: -90, end: 90 }] },
  {
    bucket: 'S-MID',
    rInner: 4,
    rOuter: 12,
    wedges: [
      { id: 'L', start: -90, end: 0 },
      { id: 'R', start: 0, end: 90 },
    ],
  },
  {
    bucket: 'L-MID',
    rInner: 12,
    rOuter: 22.146,
    wedges: [
      { id: 'L', start: -90, end: -30 },
      { id: 'C', start: -30, end: 30 },
      { id: 'R', start: 30, end: 90 },
    ],
  },
  {
    bucket: '3P',
    rInner: 22.146,
    rOuter: 30,
    wedges: [
      { id: 'LC', start: -90, end: -60 },
      { id: 'LW', start: -60, end: -20 },
      { id: 'TOP', start: -20, end: 20 },
      { id: 'RW', start: 20, end: 60 },
      { id: 'RC', start: 60, end: 90 },
    ],
  },
]

export default function RadialZoneChart({ shots }) {
  const byKey = {}
  for (const s of shots) {
    const key = `${s.bucket}|${s.wedge}`
    byKey[key] ??= []
    byKey[key].push(s)
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%">
      {/* baseline */}
      <line
        x1={MARGIN}
        y1={H - MARGIN}
        x2={W - MARGIN}
        y2={H - MARGIN}
        stroke="var(--line)"
        strokeWidth="2"
      />
      {RINGS.map((ring) =>
        ring.wedges.map((w) => {
          const key = `${ring.bucket}|${w.id}`
          const group = byKey[key] || []
          const stats = aggregateShots(group)
          const path = wedgePath(ring.rInner, ring.rOuter, w.start, w.end)
          const [lx, ly] = labelPos(ring.rInner, ring.rOuter, w.start, w.end)
          return (
            <g key={key}>
              <path
                d={path}
                fill={colorForPct(stats.fgPct, stats.attempts)}
                stroke="#0b0e14"
                strokeWidth="2"
              />
              {stats.attempts ? (
                <>
                  <text x={lx} y={ly - 6} textAnchor="middle" fontSize="13" fontWeight="700" fill="#10121a">
                    {stats.makes}/{stats.attempts}
                  </text>
                  <text x={lx} y={ly + 10} textAnchor="middle" fontSize="11" fill="#10121a">
                    {Math.round(stats.fgPct * 100)}%
                  </text>
                </>
              ) : (
                <text x={lx} y={ly + 2} textAnchor="middle" fontSize="11" fill="#5a6070">
                  None
                </text>
              )}
            </g>
          )
        })
      )}
      {/* free-throw circle + hoop outline on top, purely decorative */}
      <circle cx={polar(0, 0)[0]} cy={polar(0, 0)[1]} r="3" fill="#0b0e14" />
    </svg>
  )
}
