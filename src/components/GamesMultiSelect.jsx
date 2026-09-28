import { useEffect, useRef, useState } from 'react'

export default function GamesMultiSelect({ games, selectedIds, onChange, loading, seasonLabel }) {
  const [open, setOpen] = useState(false)
  const boxRef = useRef(null)

  useEffect(() => {
    function onClickOutside(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const allSelected = selectedIds.length === 0 // empty = every game (cumulative)

  function toggle(id) {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((x) => x !== id))
    } else {
      onChange([...selectedIds, id])
    }
  }

  const label = allSelected
    ? `Cumulative — ${seasonLabel}`
    : selectedIds.length === 1
    ? '1 game selected'
    : `${selectedIds.length} games selected`

  return (
    <div className="games-select" ref={boxRef}>
      <button className="games-select-trigger" onClick={() => setOpen((v) => !v)} disabled={loading}>
        <span>{label}</span>
        <span className="games-select-caret">▾</span>
      </button>
      {open && (
        <div className="games-select-dropdown">
          <div className="games-select-actions">
            <button onClick={() => onChange([])}>Cumulative (all)</button>
            <button onClick={() => onChange(games.map((g) => g.id))}>Select all</button>
            <button onClick={() => onChange([])}>Clear</button>
          </div>
          <div className="games-select-list">
            {games.map((g) => (
              <label key={g.id} className="games-select-row">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(g.id)}
                  onChange={() => toggle(g.id)}
                />
                <span>
                  {new Date(g.date).toLocaleDateString()} {g.isHome ? 'vs' : '@'} {g.opponent} ({g.result})
                </span>
              </label>
            ))}
            {!games.length && <div className="games-select-empty">No completed games this season yet</div>}
          </div>
        </div>
      )}
    </div>
  )
}
