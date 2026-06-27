import React, { useState } from 'react'

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
    <div className="bg-white rounded-lg border">
      <div className="p-4 border-b flex items-center justify-between">
        <h3 className="font-semibold">Results Preview ({totalResults} results in {preview.events.length} events)</h3>
        <span className="text-xs text-gray-500">Click any cell to edit</span>
      </div>

      <div className="divide-y max-h-[600px] overflow-y-auto">
        {preview.events.map((ev, eventIdx) => (
          <div key={eventIdx}>
            {/* Event header */}
            <div className="flex items-center justify-between px-4 py-2 bg-gray-50 cursor-pointer hover:bg-gray-100"
              onClick={() => toggleEvent(eventIdx)}>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-400">{expandedEvents[eventIdx] ? '\u25BC' : '\u25B6'}</span>
                <span className="font-medium text-sm">{ev.event_name}</span>
                <span className="text-xs text-gray-500">
                  {ev.gender === 'M' ? "Men" : ev.gender === 'F' ? "Women" : "Mixed"}
                </span>
                {ev.age_group && <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs">{ev.age_group}</span>}
                {ev.round_type && <span className="bg-gray-200 px-2 py-0.5 rounded text-xs">{ev.round_type}</span>}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500">{ev.results.length} results</span>
                <button onClick={(e) => { e.stopPropagation(); deleteEvent(eventIdx) }}
                  className="text-red-400 hover:text-red-600 text-xs">Remove Event</button>
              </div>
            </div>

            {/* Expanded results table */}
            {expandedEvents[eventIdx] && (
              <div className="px-4 py-2 overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-xs text-gray-500 border-b">
                      <th className="py-1 text-left w-8">#</th>
                      <th className="py-1 text-left min-w-[180px]">Name</th>
                      <th className="py-1 text-left w-20">Birth Yr</th>
                      <th className="py-1 text-left w-12">Age</th>
                      <th className="py-1 text-left w-16">Nat.</th>
                      <th className="py-1 text-left min-w-[120px]">Club</th>
                      <th className="py-1 text-left w-24">Time</th>
                      <th className="py-1 text-left w-16">FINA</th>
                      <th className="py-1 w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {ev.results.map((r, ri) => (
                      <React.Fragment key={ri}>
                        <tr className="group">
                          <td className="py-1 text-xs text-gray-400">{r.rank || ri + 1}</td>
                          <td className="py-1">
                            <input type="text" value={r.swimmer_name || ''} onChange={(e) => updateResult(eventIdx, ri, 'swimmer_name', e.target.value)}
                              className="w-full text-sm border-0 border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:ring-0 px-1 py-0.5 bg-transparent" />
                          </td>
                          <td className="py-1">
                            <input type="text" value={r.birth_year || ''} onChange={(e) => updateResult(eventIdx, ri, 'birth_year', e.target.value)}
                              className="w-20 text-sm border-0 border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:ring-0 px-1 py-0.5 bg-transparent" />
                          </td>
                          <td className="py-1">
                            <input type="text" value={r.age || ''} onChange={(e) => updateResult(eventIdx, ri, 'age', e.target.value)}
                              className="w-12 text-sm border-0 border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:ring-0 px-1 py-0.5 bg-transparent" />
                          </td>
                          <td className="py-1">
                            <input type="text" value={r.nationality_code || ''} onChange={(e) => updateResult(eventIdx, ri, 'nationality_code', e.target.value)}
                              className="w-16 text-sm border-0 border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:ring-0 px-1 py-0.5 bg-transparent" />
                          </td>
                          <td className="py-1">
                            <input type="text" value={r.club || ''} onChange={(e) => updateResult(eventIdx, ri, 'club', e.target.value)}
                              className="w-full text-sm border-0 border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:ring-0 px-1 py-0.5 bg-transparent" />
                          </td>
                          <td className="py-1">
                            <input type="text" value={r.time_text || ''} onChange={(e) => updateResult(eventIdx, ri, 'time_text', e.target.value)}
                              className="w-24 text-sm font-mono border-0 border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:ring-0 px-1 py-0.5 bg-transparent" />
                          </td>
                          <td className="py-1">
                            <input type="text" value={r.fina_points || ''} onChange={(e) => updateResult(eventIdx, ri, 'fina_points', e.target.value)}
                              className="w-16 text-sm border-0 border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:ring-0 px-1 py-0.5 bg-transparent" />
                          </td>
                          <td className="py-1">
                            <button onClick={() => deleteResult(eventIdx, ri)}
                              className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 text-xs">&times;</button>
                          </td>
                        </tr>
                        {r.split_times && r.split_times.length > 0 && (
                          <tr className="bg-gray-50/50">
                            <td></td>
                            <td colSpan={8} className="py-1 pl-4">
                              <div className="flex items-start gap-2 px-2 py-1">
                                <span className="bg-cyan-100 text-cyan-700 px-1.5 py-0.5 rounded text-xs font-semibold shrink-0">Splits</span>
                                <div className="flex flex-wrap gap-2 text-xs text-gray-500">
                                  {r.split_times.map((s, si) => {
                                    const parts = typeof s === 'string' ? s.match(/^(.+?)\s+(\d{1,2}[:.]\d{2}\.\d{2}|\d{1,2}\.\d{2})$/) : null
                                    const sName = parts ? parts[1] : s
                                    const sTime = parts ? parts[2] : ''
                                    return (
                                      <span key={si} className="inline-flex items-center gap-1 bg-white border rounded px-1.5 py-0.5">
                                        <span className="font-medium text-gray-700">{sName}</span>
                                        {sTime && <span className="font-mono text-blue-600">{sTime}</span>}
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
                  className="text-blue-600 text-xs mt-1 hover:text-blue-800">+ Add Result</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
