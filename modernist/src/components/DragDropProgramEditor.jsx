import { useMemo, useState, useCallback, useEffect } from 'react'
import { getEvents } from '../api/core'
import { formatDate } from '../utils'

const GENDER_LABEL = { M: 'Men', F: 'Women', X: 'Mixed' }
const SESSION_LABEL = { HEATS: 'Heats', SEMIS: 'Semis', FINALS: 'Finals' }

const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

/**
 * Build the list of draggable event cards from the import preview.
 * Each unique (event_name, gender, round, age_category) becomes one card.
 */
function buildEventCards(preview) {
  if (!preview?.events) return []
  const seen = new Set()
  const cards = []
  for (const ev of preview.events) {
    const round = ev.round_type || ''
    const session = round === 'Prelims' || round === 'Heats' ? 'HEATS'
      : round === 'Semis' || round === 'Semifinals' ? 'SEMIS'
      : round === 'Finals' ? 'FINALS' : ''
    const cat = ev.age_group || ''
    const key = `${ev.event_name}|${ev.gender}|${session}|${cat}`
    if (seen.has(key)) continue
    seen.add(key)
    cards.push({
      id: key,
      event_name: ev.event_name,
      gender: ev.gender || 'M',
      session,
      age_category: cat,
      resultCount: (ev.results || []).length,
    })
  }
  return cards
}


/**
 * Drag-and-drop program editor for the import wizard.
 *
 * Shows all parsed events as draggable cards on the left, and day
 * columns on the right. The user first toggles morning/evening
 * sessions, then drags each event card into the correct day+session.
 *
 * Props:
 *   - preview: the parsed file preview (editedPreview)
 *   - startDate, endDate: meet date range
 *   - items: current program items array
 *   - onChange(items): callback to update parent state
 */
export default function DragDropProgramEditor({ preview, startDate, endDate, items, onChange }) {
  const [hasSessions, setHasSessions] = useState(false)
  const [dragItem, setDragItem] = useState(null)
  const [dbEvents, setDbEvents] = useState([])

  // Fetch DB events for name→ID resolution
  useEffect(() => {
    getEvents().then((res) => setDbEvents(res.data || [])).catch(() => {})
  }, [])

  // Map event name → DB event ID (case-insensitive, normalized)
  const eventIdMap = useMemo(() => {
    const m = {}
    for (const ev of dbEvents) {
      m[ev.name.toUpperCase().replace(/\s+/g, ' ').trim()] = ev.id
    }
    return m
  }, [dbEvents])

  const resolveEventId = useCallback((name) => {
    const key = (name || '').toUpperCase().replace(/\s+/g, ' ').trim()
    return eventIdMap[key] || null
  }, [eventIdMap])

  // All unique event cards from the parsed file
  const allCards = useMemo(() => buildEventCards(preview), [preview])

  // Day range
  const days = useMemo(() => {
    if (!startDate) return []
    let n = 1
    if (endDate && endDate >= startDate) {
      n = Math.min(Math.floor((new Date(endDate) - new Date(startDate)) / 86400000) + 1, 30)
    }
    return Array.from({ length: n }, (_, i) => ({
      day: i + 1,
      date: addDays(startDate, i),
    }))
  }, [startDate, endDate])

  // Which cards are already placed
  const placedKeys = useMemo(() => {
    const s = new Set()
    for (const it of items) {
      s.add(`${it.event_name}|${it.gender}|${it.session || ''}|${it.age_category || ''}`)
    }
    return s
  }, [items])

  const unplaced = useMemo(() => allCards.filter((c) => !placedKeys.has(c.id)), [allCards, placedKeys])

  // Drag handlers
  const onDragStart = useCallback((e, card) => {
    setDragItem(card)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', card.id)
  }, [])

  const onDrop = useCallback((e, dayNo, timeOfDay) => {
    e.preventDefault()
    if (!dragItem) return
    // Check not already in this slot
    const exists = items.some((it) =>
      it.event_name === dragItem.event_name && it.gender === dragItem.gender
      && (it.session || '') === (dragItem.session || '')
      && (it.age_category || '') === (dragItem.age_category || '')
      && it.day === dayNo)
    if (exists) return
    const evId = resolveEventId(dragItem.event_name)
    onChange([...items, {
      day: dayNo,
      event: evId,
      event_name: dragItem.event_name,
      gender: dragItem.gender,
      session: dragItem.session || '',
      time_of_day: timeOfDay || '',
      age_category: dragItem.age_category || '',
    }])
    setDragItem(null)
  }, [dragItem, items, onChange])

  const onDragOver = useCallback((e) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const removeItem = useCallback((idx) => {
    onChange(items.filter((_, i) => i !== idx))
  }, [items, onChange])

  if (!startDate) return null

  const cardStyle = (isDragging) => ({
    padding: '6px 10px',
    fontSize: 12,
    background: isDragging ? 'var(--color-accent-100)' : '#fff',
    border: '1px solid var(--color-neutral-300)',
    borderLeft: '3px solid var(--color-accent)',
    cursor: 'grab',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
    userSelect: 'none',
  })

  const dropZoneStyle = (isOver) => ({
    minHeight: 48,
    padding: '6px',
    background: isOver ? 'var(--color-accent-50, #e8f4f8)' : 'var(--color-surface)',
    border: '2px dashed var(--color-neutral-300)',
    borderRadius: 4,
    transition: 'background 0.15s',
  })

  return (
    <div style={{ border: '1px solid var(--color-divider)', background: 'var(--color-surface)', padding: '14px 16px' }}>
      <div className="kicker" style={{ marginBottom: 4 }}>Build meet program</div>
      <div className="micro" style={{ marginBottom: 12, textTransform: 'none', letterSpacing: 0 }}>
        Drag each event from the left panel into the correct day. The program is saved automatically when you confirm the import.
      </div>

      {/* Morning/evening toggle */}
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, fontSize: 13, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={hasSessions}
          onChange={(e) => setHasSessions(e.target.checked)}
        />
        Meet has morning &amp; evening sessions
      </label>

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        {/* Left: unplaced events */}
        <div style={{ width: 280, flexShrink: 0 }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 12, marginBottom: 6 }}>
            Events to place ({unplaced.length})
          </div>
          <div style={{ maxHeight: 500, overflowY: 'auto', padding: '2px' }}>
            {unplaced.length === 0 && (
              <div className="micro" style={{ padding: 8, textTransform: 'none', letterSpacing: 0, color: 'var(--asw-fast)' }}>
                All events placed
              </div>
            )}
            {unplaced.map((card) => (
              <div
                key={card.id}
                draggable
                onDragStart={(e) => onDragStart(e, card)}
                style={cardStyle(dragItem?.id === card.id)}
              >
                <span style={{ fontWeight: 600, flex: 1 }}>{card.event_name}</span>
                <span className="micro" style={{ textTransform: 'none', letterSpacing: 0, flexShrink: 0 }}>
                  {GENDER_LABEL[card.gender] || card.gender}
                </span>
                {card.session && (
                  <span className="tag tag-neutral" style={{ fontSize: 10, flexShrink: 0 }}>
                    {SESSION_LABEL[card.session] || card.session}
                  </span>
                )}
                {card.age_category && (
                  <span className="tag tag-neutral" style={{ fontSize: 10, flexShrink: 0 }}>
                    {card.age_category}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Right: day columns */}
        <div style={{ flex: 1, display: 'flex', gap: 8, overflowX: 'auto', alignItems: 'flex-start' }}>
          {days.map((d) => {
            const dayItems = items.filter((it) => it.day === d.day)
            const morningItems = dayItems.filter((it) => it.time_of_day === 'MORNING' || (!hasSessions && !it.time_of_day))
            const eveningItems = dayItems.filter((it) => it.time_of_day === 'EVENING')
            // Items without session assignment when sessions are on
            const unsessioned = hasSessions ? dayItems.filter((it) => !it.time_of_day) : []

            return (
              <div
                key={d.day}
                style={{
                  minWidth: 200, flex: '1 0 200px',
                  border: '1px solid var(--color-neutral-300)',
                  background: '#fff',
                }}
              >
                {/* Day header */}
                <div style={{
                  padding: '8px 10px',
                  background: 'var(--color-accent)',
                  color: '#fff',
                  fontFamily: 'var(--font-heading)',
                  fontWeight: 700,
                  fontSize: 12.5,
                }}>
                  Day {d.day}
                  <span style={{ fontWeight: 400, fontSize: 10, marginLeft: 6, opacity: 0.85 }}>
                    {formatDate(d.date)}
                  </span>
                  {dayItems.length > 0 && (
                    <span style={{ fontWeight: 400, fontSize: 10, marginLeft: 6, opacity: 0.85 }}>
                      · {dayItems.length} events
                    </span>
                  )}
                </div>

                {hasSessions ? (
                  <>
                    {/* Morning */}
                    <div style={{ padding: '6px 8px' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4, color: 'var(--color-neutral-500)' }}>
                        MORNING (Heats)
                      </div>
                      <DropZone
                        items={morningItems}
                        allItems={items}
                        onDrop={(e) => onDrop(e, d.day, 'MORNING')}
                        onDragOver={onDragOver}
                        onRemove={removeItem}
                        style={dropZoneStyle}
                      />
                    </div>
                    {/* Evening */}
                    <div style={{ padding: '6px 8px' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4, color: 'var(--color-neutral-500)' }}>
                        EVENING (Finals)
                      </div>
                      <DropZone
                        items={eveningItems}
                        allItems={items}
                        onDrop={(e) => onDrop(e, d.day, 'EVENING')}
                        onDragOver={onDragOver}
                        onRemove={removeItem}
                        style={dropZoneStyle}
                      />
                    </div>
                    {unsessioned.length > 0 && (
                      <div style={{ padding: '6px 8px' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4, color: 'var(--asw-slow)' }}>
                          UNASSIGNED
                        </div>
                        <DropZone
                          items={unsessioned}
                          allItems={items}
                          onDrop={() => {}}
                          onDragOver={(e) => e.preventDefault()}
                          onRemove={removeItem}
                          style={dropZoneStyle}
                        />
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ padding: '6px 8px' }}>
                    <DropZone
                      items={dayItems}
                      allItems={items}
                      onDrop={(e) => onDrop(e, d.day, '')}
                      onDragOver={onDragOver}
                      onRemove={removeItem}
                      style={dropZoneStyle}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}


function DropZone({ items, allItems, onDrop, onDragOver, onRemove, style }) {
  const [isOver, setIsOver] = useState(false)

  return (
    <div
      onDrop={(e) => { onDrop(e); setIsOver(false) }}
      onDragOver={(e) => { onDragOver(e); setIsOver(true) }}
      onDragLeave={() => setIsOver(false)}
      style={style(isOver)}
    >
      {items.length === 0 && (
        <div className="micro" style={{ textAlign: 'center', padding: '10px 0', textTransform: 'none', letterSpacing: 0, opacity: 0.5 }}>
          Drop events here
        </div>
      )}
      {items.map((it) => {
        const globalIdx = allItems.indexOf(it)
        return (
          <div
            key={`${it.event_name}-${it.gender}-${it.session}-${it.age_category}`}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '4px 6px', marginBottom: 3,
              background: '#fff', border: '1px solid var(--color-neutral-200)',
              fontSize: 12,
            }}
          >
            <span style={{ fontWeight: 600, flex: 1 }}>{it.event_name}</span>
            <span className="micro" style={{ textTransform: 'none', letterSpacing: 0, flexShrink: 0 }}>
              {GENDER_LABEL[it.gender] || ''}
            </span>
            {it.session && (
              <span className="tag tag-neutral" style={{ fontSize: 9, flexShrink: 0 }}>
                {SESSION_LABEL[it.session] || it.session}
              </span>
            )}
            {it.age_category && (
              <span className="tag tag-neutral" style={{ fontSize: 9, flexShrink: 0 }}>
                {it.age_category}
              </span>
            )}
            <button
              type="button"
              onClick={() => onRemove(globalIdx)}
              style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '0 3px', color: 'var(--asw-slow)', fontSize: 14, lineHeight: 1 }}
              aria-label="Remove"
            >
              ×
            </button>
          </div>
        )
      })}
    </div>
  )
}
