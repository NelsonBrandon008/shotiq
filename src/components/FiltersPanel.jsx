import { useState } from 'react'

export default function FiltersPanel({ options, filters, onChange }) {
  const [open, setOpen] = useState(false)

  function set(key, value) {
    onChange({ ...filters, [key]: value })
  }

  function clearAll() {
    onChange({ player: '', half: '', opponent: '', location: '' })
  }

  const activeCount = Object.values(filters).filter(Boolean).length

  return (
    <div className="filters-panel">
      <button className="filters-toggle" onClick={() => setOpen((v) => !v)}>
        Filters {activeCount > 0 && <span className="filters-count">{activeCount}</span>}
        <span className="filters-caret">{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div className="filters-body">
          <div className="filters-row">
            <select value={filters.player} onChange={(e) => set('player', e.target.value)}>
              <option value="">Player (all)</option>
              {options.players.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            {filters.player && (
              <button className="filters-clear-one" onClick={() => set('player', '')}>
                ✕
              </button>
            )}
          </div>

          <div className="filters-row filters-row-2">
            <select value={filters.half} onChange={(e) => set('half', e.target.value)}>
              <option value="">Half (all)</option>
              <option value="1">1st Half</option>
              <option value="2">2nd Half</option>
              <option value="OT">OT</option>
            </select>
            <select value={filters.location} onChange={(e) => set('location', e.target.value)}>
              <option value="">Location (all)</option>
              <option value="home">Home</option>
              <option value="away">Away</option>
              <option value="neutral">Neutral</option>
            </select>
          </div>

          <div className="filters-row">
            <select value={filters.opponent} onChange={(e) => set('opponent', e.target.value)}>
              <option value="">Opponent (all)</option>
              {options.opponents.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>

          <div className="filters-note">
            For multiple opponents or games at once (e.g. every game vs. Santa Clara), use the game
            picker up top instead — check any combination of games there and this panel's filters
            apply on top of that selection.
          </div>

          <button className="filters-clear-all" onClick={clearAll}>
            Clear all
          </button>
        </div>
      )}
    </div>
  )
}
