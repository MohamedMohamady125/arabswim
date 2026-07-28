import React, { useState } from 'react'
import { ChevronDown, ChevronRight, Plus, Trash2, X } from 'lucide-react'
import { Badge } from '../ui'

const CELL_INPUT =
  'text-body-sm text-ink-900 border-0 border-b border-transparent hover:border-ink-200 ' +
  'focus:border-aqua-500 focus:ring-0 focus:outline-none px-1 py-1 bg-transparent'

export default function EditableResultsTable({ preview, onPreviewChange }) {
  const [expandedEvents, setExpandedEvents] = useState({})

  const toggleEvent = (idx) => {
    setExpandedEvents(prev => ({ ...prev, [idx]: !prev[idx] }))
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
        })
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
        }]
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
    <section className="bg-white rounded-md shadow-card border border-ink-100">
      <div className="px-4 py-3 border-b border-ink-100 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-body font-semibold text-ink-900 tnum">
          Results Preview ({totalResults} results in {preview.events.length} events)
        </h3>
        <span className="text-body-sm text-ink-400">Click any cell to edit</span>
      </div>

      <div className="divide-y divide-ink-100 max-h-[600px] overflow-y-auto">
        {preview.events.map((ev, eventIdx) => (
          <div key={eventIdx}>
            {/* Event header */}
            <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-ink-50 cursor-pointer hover:bg-ink-100 transition-colors min-h-11"
              onClick={() => toggleEvent(eventIdx)}>
              <div className="flex items-center gap-2.5 min-w-0 flex-wrap">
                {expandedEvents[eventIdx]
                  ? <ChevronDown size={14} className="text-ink-400 shrink-0" />
                  : <ChevronRight size={14} className="text-ink-400 shrink-0" />}
                <span className="font-medium text-body-sm text-ink-900">{ev.event_name}</span>
                <span className="text-body-sm text-ink-500">
                  {ev.gender === 'M' ? "Men" : ev.gender === 'F' ? "Women" : "Mixed"}
                </span>
                {ev.age_group && <Badge variant="aqua">{ev.age_group}</Badge>}
                {ev.round_type && <Badge variant="status">{ev.round_type}</Badge>}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-body-sm text-ink-400 tnum">{ev.results.length} results</span>
                <button onClick={(e) => { e.stopPropagation(); deleteEvent(eventIdx) }}
                  className="inline-flex items-center gap-1 text-body-sm text-neg/70 hover:text-neg min-h-10 px-1.5">
                  <Trash2 size={13} /> Remove Event
                </button>
              </div>
            </div>

            {/* Expanded results table */}
            {expandedEvents[eventIdx] && (
              <div className="px-4 py-2 overflow-x-auto">
                <table className="w-full min-w-[640px]">
                  <thead>
                    <tr className="text-label text-ink-400 border-b border-ink-100">
                      <th scope="col" className="py-1.5 text-start w-8 font-semibold">#</th>
                      <th scope="col" className="py-1.5 text-start min-w-[180px] font-semibold">Name</th>
                      <th scope="col" className="py-1.5 text-start w-20 font-semibold">Birth Yr</th>
                      <th scope="col" className="py-1.5 text-start w-12 font-semibold">Age</th>
                      <th scope="col" className="py-1.5 text-start w-16 font-semibold">Nat.</th>
                      <th scope="col" className="py-1.5 text-start min-w-[120px] font-semibold">Club</th>
                      <th scope="col" className="py-1.5 text-start w-24 font-semibold">Time</th>
                      <th scope="col" className="py-1.5 text-start w-16 font-semibold">FINA</th>
                      <th scope="col" className="py-1.5 w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {ev.results.map((r, ri) => (
                      <React.Fragment key={ri}>
                        <tr>
                          <td className="py-1 text-body-sm text-ink-400 tnum">{r.rank || ri + 1}</td>
                          <td className="py-1">
                            <input type="text" value={r.swimmer_name || ''} onChange={(e) => updateResult(eventIdx, ri, 'swimmer_name', e.target.value)}
                              aria-label="Swimmer name" className={`w-full ${CELL_INPUT}`} />
                          </td>
                          <td className="py-1">
                            <input type="text" value={r.birth_year || ''} onChange={(e) => updateResult(eventIdx, ri, 'birth_year', e.target.value)}
                              aria-label="Birth year" className={`w-20 tnum ${CELL_INPUT}`} />
                          </td>
                          <td className="py-1">
                            <input type="text" value={r.age || ''} onChange={(e) => updateResult(eventIdx, ri, 'age', e.target.value)}
                              aria-label="Age" className={`w-12 tnum ${CELL_INPUT}`} />
                          </td>
                          <td className="py-1">
                            <input type="text" value={r.nationality_code || ''} onChange={(e) => updateResult(eventIdx, ri, 'nationality_code', e.target.value)}
                              aria-label="Nationality code" className={`w-16 ${CELL_INPUT}`} />
                          </td>
                          <td className="py-1">
                            <input type="text" value={r.club || ''} onChange={(e) => updateResult(eventIdx, ri, 'club', e.target.value)}
                              aria-label="Club" className={`w-full ${CELL_INPUT}`} />
                          </td>
                          <td className="py-1">
                            <input type="text" value={r.time_text || ''} onChange={(e) => updateResult(eventIdx, ri, 'time_text', e.target.value)}
                              aria-label="Time" className={`w-24 tnum font-semibold ${CELL_INPUT}`} />
                          </td>
                          <td className="py-1">
                            <input type="text" value={r.fina_points || ''} onChange={(e) => updateResult(eventIdx, ri, 'fina_points', e.target.value)}
                              aria-label="FINA points" className={`w-16 tnum ${CELL_INPUT}`} />
                          </td>
                          <td className="py-1">
                            <button onClick={() => deleteResult(eventIdx, ri)} aria-label="Delete result"
                              className="text-ink-200 hover:text-neg p-1.5 rounded-sm">
                              <X size={14} />
                            </button>
                          </td>
                        </tr>
                        {r.split_times && r.split_times.length > 0 && (
                          <tr className="bg-ink-50/50">
                            <td></td>
                            <td colSpan={8} className="py-1 ps-4">
                              <div className="flex items-start gap-2 px-2 py-1">
                                <Badge variant="aqua" className="shrink-0">Splits</Badge>
                                <div className="flex flex-wrap gap-2 text-body-sm text-ink-500">
                                  {r.split_times.map((s, si) => {
                                    const parts = typeof s === 'string' ? s.match(/^(.+?)\s+(\d{1,2}[:.]\d{2}\.\d{2}|\d{1,2}\.\d{2})$/) : null
                                    const sName = parts ? parts[1] : s
                                    const sTime = parts ? parts[2] : ''
                                    return (
                                      <span key={si} className="inline-flex items-center gap-1 bg-white border border-ink-100 rounded-sm px-1.5 py-0.5">
                                        <span className="font-medium text-ink-700">{sName}</span>
                                        {sTime && <span className="tnum text-aqua-600">{sTime}</span>}
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
                <button onClick={() => addResult(eventIdx)}
                  className="inline-flex items-center gap-1 text-aqua-600 text-body-sm mt-1 hover:text-aqua-500 font-medium min-h-10 px-1">
                  <Plus size={14} /> Add Result
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
