import React, { useState } from 'react'

const cellInput = {
  width: '100%', border: 0, borderBottom: '1px solid transparent',
  background: 'transparent', font: 'inherit', fontSize: 13, padding: '2px 4px',
  color: 'var(--color-text)',
}

function CellInput({ value, onChange, width, mono }) {
  return (
    <input
      type="text"
      value={value}
      onChange={onChange}
      style={{
        ...cellInput,
        ...(width ? { width } : {}),
        ...(mono ? { fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--font-heading)', fontWeight: 600 } : {}),
      }}
      onFocus={(e) => { e.target.style.borderBottom = '1px solid var(--color-accent)' }}
      onBlur={(e) => { e.target.style.borderBottom = '1px solid transparent' }}
    />
  )
}

export default function EditableResultsTable({ preview, onPreviewChange }) {
  const [expandedEvents, setExpandedEvents] = useState({})

  const toggleEvent = (idx) => {
    setExpandedEvents((prev) => ({ ...prev, [idx]: !prev[idx] }))
  }

  const updateResult = (eventIdx, resultIdx, field, value) => {
    const updated = { ...preview }
    updated.events = updated.events.map((ev, ei) => {
      if (ei !== eventIdx) return ev
      return {
        ...ev,
        results: ev.results.map((r, ri) => {
          if (ri !== resultIdx) return r
          return { ...r, [field]: value }
        }),
      }
    })
    onPreviewChange(updated)
  }

  const deleteResult = (eventIdx, resultIdx) => {
    const updated = { ...preview }
    updated.events = updated.events.map((ev, ei) => {
      if (ei !== eventIdx) return ev
      return { ...ev, results: ev.results.filter((_, ri) => ri !== resultIdx) }
    })
    updated.stats = {
      ...updated.stats,
      total_results: updated.events.reduce((sum, ev) => sum + ev.results.length, 0),
    }
    onPreviewChange(updated)
  }

  const addResult = (eventIdx) => {
    const updated = { ...preview }
    updated.events = updated.events.map((ev, ei) => {
      if (ei !== eventIdx) return ev
      return {
        ...ev,
        results: [...ev.results, {
          swimmer_name: '', time_text: '', time_centiseconds: 0,
          club: '', nationality_code: '', birth_year: 0, fina_points: 0,
          rank: 0, age: 0, gender: ev.gender || '',
        }],
      }
    })
    updated.stats = {
      ...updated.stats,
      total_results: updated.events.reduce((sum, ev) => sum + ev.results.length, 0),
    }
    onPreviewChange(updated)
  }

  const deleteEvent = (eventIdx) => {
    const updated = { ...preview }
    updated.events = updated.events.filter((_, ei) => ei !== eventIdx)
    updated.stats = {
      ...updated.stats,
      total_results: updated.events.reduce((sum, ev) => sum + ev.results.length, 0),
      total_events: updated.events.length,
    }
    onPreviewChange(updated)
  }

  if (!preview || !preview.events) return null

  const totalResults = preview.events.reduce((sum, ev) => sum + ev.results.length, 0)

  return (
    <div style={{ border: '1px solid var(--color-divider)' }}>
      <div className="hair-b" style={{ padding: '12px 16px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <span className="kicker">Results preview — {totalResults} results in {preview.events.length} events</span>
        <span className="micro">Click any cell to edit</span>
      </div>

      <div style={{ maxHeight: 600, overflowY: 'auto' }}>
        {preview.events.map((ev, eventIdx) => (
          <div key={eventIdx}>
            {/* Event header */}
            <div
              className="hair-b"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 16px', background: 'var(--color-surface)', cursor: 'pointer', gap: 12,
              }}
              onClick={() => toggleEvent(eventIdx)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span className="micro" style={{ width: 12 }}>{expandedEvents[eventIdx] ? '▼' : '▶'}</span>
                <span style={{ fontWeight: 700, fontSize: 13 }}>{ev.event_name}</span>
                <span className="micro">
                  {ev.gender === 'M' ? 'Men' : ev.gender === 'F' ? 'Women' : 'Mixed'}
                </span>
                {ev.age_group && <span className="tag tag-accent">{ev.age_group}</span>}
                {ev.round_type && <span className="tag tag-neutral">{ev.round_type}</span>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span className="micro asw-num">{ev.results.length} results</span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); deleteEvent(eventIdx) }}
                  style={{ border: 0, background: 'transparent', cursor: 'pointer', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--asw-slow)', fontFamily: 'inherit' }}
                >
                  Remove event
                </button>
              </div>
            </div>

            {/* Expanded results table */}
            {expandedEvents[eventIdx] && (
              <div className="hair-b table-scroll" style={{ padding: '6px 16px 12px' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ width: 32 }}>#</th>
                      <th style={{ minWidth: 180 }}>Name</th>
                      <th style={{ width: 80 }}>Birth yr</th>
                      <th style={{ width: 50 }}>Age</th>
                      <th style={{ width: 60 }}>Nat.</th>
                      <th style={{ minWidth: 120 }}>Club</th>
                      <th style={{ width: 100 }}>Time</th>
                      <th style={{ width: 60 }}>FINA</th>
                      <th style={{ width: 32 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {ev.results.map((r, ri) => (
                      <React.Fragment key={ri}>
                        <tr>
                          <td className="asw-num text-muted" style={{ fontSize: 12 }}>{r.rank || ri + 1}</td>
                          <td><CellInput value={r.swimmer_name || ''} onChange={(e) => updateResult(eventIdx, ri, 'swimmer_name', e.target.value)} /></td>
                          <td><CellInput value={r.birth_year || ''} onChange={(e) => updateResult(eventIdx, ri, 'birth_year', e.target.value)} /></td>
                          <td><CellInput value={r.age || ''} onChange={(e) => updateResult(eventIdx, ri, 'age', e.target.value)} /></td>
                          <td><CellInput value={r.nationality_code || ''} onChange={(e) => updateResult(eventIdx, ri, 'nationality_code', e.target.value)} /></td>
                          <td><CellInput value={r.club || ''} onChange={(e) => updateResult(eventIdx, ri, 'club', e.target.value)} /></td>
                          <td><CellInput mono value={r.time_text || ''} onChange={(e) => updateResult(eventIdx, ri, 'time_text', e.target.value)} /></td>
                          <td><CellInput value={r.fina_points || ''} onChange={(e) => updateResult(eventIdx, ri, 'fina_points', e.target.value)} /></td>
                          <td>
                            <button
                              type="button"
                              onClick={() => deleteResult(eventIdx, ri)}
                              title="Delete row"
                              style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--asw-slow)', fontSize: 15, lineHeight: 1, padding: 2 }}
                            >
                              ×
                            </button>
                          </td>
                        </tr>
                        {r.split_times && r.split_times.length > 0 && (
                          <tr style={{ background: 'var(--color-neutral-100)' }}>
                            <td></td>
                            <td colSpan={8} style={{ padding: '6px 8px' }}>
                              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                                <span className="tag tag-dark" style={{ flex: 'none' }}>Splits</span>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, fontSize: 12 }}>
                                  {r.split_times.map((s, si) => {
                                    const parts = typeof s === 'string' ? s.match(/^(.+?)\s+(\d{1,2}[:.]\d{2}\.\d{2}|\d{1,2}\.\d{2})$/) : null
                                    const sName = parts ? parts[1] : s
                                    const sTime = parts ? parts[2] : ''
                                    return (
                                      <span key={si} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: '1px solid var(--color-divider)', background: 'var(--color-bg)', padding: '1px 6px' }}>
                                        <span style={{ fontWeight: 600, color: 'var(--color-neutral-800)' }}>{sName}</span>
                                        {sTime && <span className="asw-time" style={{ fontSize: 12, color: 'var(--color-accent)' }}>{sTime}</span>}
                                      </span>
                                    )
                                  })}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ fontSize: 12, marginTop: 6 }}
                  onClick={() => addResult(eventIdx)}
                >
                  + Add result
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
