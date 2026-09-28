import { useEffect, useMemo, useState, useRef } from 'react'
import { fetchAllD1Teams } from '../lib/espnData'

export default function TeamSearch({ selectedTeam, onSelect }) {
  const [teams, setTeams] = useState([])
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const boxRef = useRef(null)

  useEffect(() => {
    fetchAllD1Teams().then(setTeams).catch(() => {})
  }, [])

  useEffect(() => {
    function onClickOutside(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const results = useMemo(() => {
    if (!query.trim()) return teams.slice(0, 8)
    const q = query.toLowerCase()
    return teams.filter((t) => t.name.toLowerCase().includes(q) || t.abbrev?.toLowerCase().includes(q)).slice(0, 8)
  }, [teams, query])

  return (
    <div className="team-search" ref={boxRef}>
      <button className="team-search-trigger" onClick={() => setOpen((v) => !v)}>
        {selectedTeam?.logo && <img src={selectedTeam.logo} alt="" className="team-search-logo" />}
        <span>{selectedTeam?.name || 'Select a team'}</span>
        <span className="team-search-caret">▾</span>
      </button>
      {open && (
        <div className="team-search-dropdown">
          <input
            autoFocus
            className="team-search-input"
            placeholder="Type any D1 team…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="team-search-results">
            {results.map((t) => (
              <button
                key={t.id}
                className="team-search-result"
                onClick={() => {
                  onSelect(t)
                  setOpen(false)
                  setQuery('')
                }}
              >
                {t.logo && <img src={t.logo} alt="" className="team-search-logo" />}
                {t.name}
              </button>
            ))}
            {!results.length && <div className="team-search-empty">No matches</div>}
          </div>
        </div>
      )}
    </div>
  )
}
