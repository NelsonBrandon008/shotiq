import { SEASONS } from '../lib/espnData'

export function SeasonSelector({ seasonKey, onChange, loading }) {
  return (
    <select className="season-select" value={seasonKey} onChange={(e) => onChange(e.target.value)} disabled={loading}>
      {SEASONS.map((s) => (
        <option key={s.key} value={s.key}>
          {s.label} season
        </option>
      ))}
    </select>
  )
}
