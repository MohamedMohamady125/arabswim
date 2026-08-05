import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  getPredictions, getPrediction, recomputePrediction,
  getPredictionEntries, addPredictionEntry, updatePredictionEntry,
  deletePredictionEntry, seedPredictionEntries,
} from '../api/predictions'
import { searchSwimmers } from '../api/swimmers'
import { PageHead, Loading, Empty, Seg, SectHead } from '../components/ui'
import Flag from '../components/Flag'
import { useAuth } from '../context/AuthContext'
import { formatDate, formatDateRange, formatTime, parseTime } from '../utils'

const STROKE_ORDER = { Freestyle: 0, Backstroke: 1, Breaststroke: 2, Butterfly: 3, 'Individual Medley': 4 }

// tier → visual treatment: gold tint for favorites, navy for strong, neutral otherwise
function statusStyle(status) {
  const s = String(status || '')
  if (s.includes('Favorite')) {
    return { background: 'rgba(200,160,60,0.14)', color: '#7a5c14', border: '1px solid rgba(200,160,60,0.5)' }
  }
  if (s.includes('Strong') || s.includes('Contender')) {
    return { background: 'var(--color-accent)', color: '#fff', border: '1px solid var(--color-accent)' }
  }
  return { background: 'var(--color-bg)', color: 'var(--color-neutral-700)', border: '1px solid var(--color-neutral-300)' }
}

function StatusBadge({ status, pct }) {
  return (
    <span style={{
      ...statusStyle(status),
      display: 'inline-block', fontFamily: 'var(--font-heading)', fontWeight: 700,
      fontSize: 10.5, letterSpacing: '0.05em', textTransform: 'uppercase',
      padding: '3px 8px', lineHeight: 1.4, whiteSpace: 'nowrap',
    }}>
      {status}{pct != null ? ` — ${Math.round(pct)}%` : ''}
    </span>
  )
}

function Chip({ children, tone }) {
  const tones = {
    warn: { background: 'rgba(200,160,60,0.14)', color: '#7a5c14', border: '1px solid rgba(200,160,60,0.5)' },
    navy: { background: 'var(--color-accent)', color: '#fff', border: '1px solid var(--color-accent)' },
    plain: { background: 'var(--color-bg)', color: 'var(--color-neutral-700)', border: '1px solid var(--color-neutral-300)' },
  }
  return (
    <span style={{
      ...(tones[tone] || tones.plain),
      fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 10.5,
      letterSpacing: '0.05em', textTransform: 'uppercase', padding: '3px 8px', lineHeight: 1.4,
    }}>
      {children}
    </span>
  )
}

// Swimmer card used by all four sections
function SwimmerCard({ c, showDelta }) {
  return (
    <div>
      <div className="card-kicker kicker" style={{ marginBottom: 6 }}>
        {c.event} · {c.gender === 'M' ? 'Men' : 'Women'}
      </div>
      <div className="rec-name" style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Flag code={c.country_code} name={c.country_name} />
        <Link to={`/swimmers/${c.swimmer_id}`}>{c.name}</Link>
      </div>
      <div className="rec-meta micro" style={{ marginTop: 5 }}>
        Seed <span className="asw-time">{c.seed}</span>
        {showDelta && c.delta != null && (
          <span style={{ color: 'var(--color-accent-800)', fontWeight: 700 }}> · +{c.delta} pts</span>
        )}
      </div>
      <div style={{ marginTop: 8 }}>
        <StatusBadge
          status={String(c.gold_status || '').includes('Gold') ? c.gold_status : c.status}
          pct={String(c.gold_status || '').includes('Gold') ? c.p_gold : c.p_medal}
        />
      </div>
    </div>
  )
}

function Section({ title, items, sub, showDelta }) {
  if (!items || items.length === 0) return null
  return (
    <div style={{ marginBottom: 26 }}>
      <SectHead title={title} />
      {sub && <div className="micro" style={{ margin: '-4px 0 10px' }}>{sub}</div>}
      <div className="record-cards">
        {items.map((c, i) => <SwimmerCard key={`${c.swimmer_id}-${c.event_id}-${i}`} c={c} showDelta={showDelta} />)}
      </div>
    </div>
  )
}

// Projected medal table — countries (or clubs for national meets)
function TallyTable({ table, isNational }) {
  if (!table || table.length === 0) return null
  return (
    <div style={{ marginBottom: 26 }}>
      <SectHead title={isNational ? 'Projected medal table by club' : 'Projected medal table by country'} />
      <div className="micro" style={{ margin: '-4px 0 10px' }}>
        Expected medal counts across all simulated outcomes — decimals are averages, not promises
      </div>
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>#</th>
              <th>{isNational ? 'Club' : 'Country'}</th>
              <th className="num">Gold</th>
              <th className="num">Silver</th>
              <th className="num">Bronze</th>
              <th className="num">Total</th>
              <th className="num">Most likely</th>
              <th className="num">Likely range</th>
            </tr>
          </thead>
          <tbody>
            {table.map((r, i) => (
              <tr key={r.name}>
                <td className="asw-num">{i + 1}</td>
                <td style={{ fontWeight: 600 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                    {r.code && <Flag code={r.code} name={r.name} />}
                    {r.name}
                  </span>
                </td>
                <td className="num asw-num" style={{ fontWeight: 700 }}>{r.gold.toFixed(1)}</td>
                <td className="num asw-num">{r.silver.toFixed(1)}</td>
                <td className="num asw-num">{r.bronze.toFixed(1)}</td>
                <td className="num asw-num" style={{ fontWeight: 700 }}>{r.total.toFixed(1)}</td>
                <td className="num asw-num">{r.most_likely}</td>
                <td className="num asw-num">{r.likely_min}–{r.likely_max}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Per-event field table with projected standards + gap to bronze
function EventDetail({ ev }) {
  if (!ev) return null
  return (
    <div>
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>Swimmer</th>
              <th className="time">Seed</th>
              <th className="num">Expected place</th>
              <th className="num">Gold</th>
              <th className="num">Silver</th>
              <th className="num">Bronze</th>
              <th>Medal chance</th>
              <th className="num">Gap to bronze</th>
            </tr>
          </thead>
          <tbody>
            {ev.field.map((r) => (
              <tr key={r.swimmer_id}>
                <td style={{ fontWeight: 600 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                    <Flag code={r.country_code} name={r.country_name} />
                    <Link to={`/swimmers/${r.swimmer_id}`}>{r.name}</Link>
                  </span>
                </td>
                <td className="time asw-time">{r.seed}</td>
                <td className="num asw-num">{r.place_range}</td>
                <td className="num asw-num">{r.p_gold}%</td>
                <td className="num asw-num">{r.p_silver}%</td>
                <td className="num asw-num">{r.p_bronze}%</td>
                <td><StatusBadge status={r.status} pct={r.p_medal} /></td>
                <td className="num asw-num" style={{ color: r.gap_to_bronze > 0 ? 'var(--color-neutral-700)' : 'var(--color-accent-800)' }}>
                  {r.gap_to_bronze > 0 ? `+${r.gap_to_bronze.toFixed(2)}s` : `${r.gap_to_bronze.toFixed(2)}s`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="micro" style={{ marginTop: 10, display: 'flex', gap: 18, flexWrap: 'wrap' }}>
        <span>Projected gold standard: <span className="asw-time" style={{ fontWeight: 700 }}>{ev.standards.gold}</span></span>
        <span>Projected silver: <span className="asw-time">{ev.standards.silver}</span></span>
        <span>Projected bronze: <span className="asw-time">{ev.standards.bronze}</span></span>
      </div>
    </div>
  )
}

// ---- Admin: entry-list manager -------------------------------------------
function EntriesAdmin({ champId, stage, events, onChanged }) {
  const [entries, setEntries] = useState([])
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [swimmer, setSwimmer] = useState(null)
  const [eventId, setEventId] = useState('')
  const [entryTime, setEntryTime] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const loadEntries = () => {
    getPredictionEntries(champId).then((res) => setEntries(res.data || [])).catch(() => setEntries([]))
  }
  useEffect(loadEntries, [champId])

  // debounced swimmer search
  useEffect(() => {
    if (!query || query.length < 2 || swimmer) { setResults([]); return }
    const t = setTimeout(() => {
      searchSwimmers(query)
        .then((res) => setResults((Array.isArray(res.data) ? res.data : res.data?.results || []).slice(0, 8)))
        .catch(() => setResults([]))
    }, 250)
    return () => clearTimeout(t)
  }, [query, swimmer])

  const act = async (fn, okMsg) => {
    setBusy(true); setMsg('')
    try {
      await fn()
      loadEntries()
      if (okMsg) setMsg(okMsg)
    } catch (e) {
      setMsg(e?.response?.data?.detail || 'Action failed')
    } finally {
      setBusy(false)
    }
  }

  const add = () => {
    if (!swimmer || !eventId) { setMsg('Pick a swimmer and an event'); return }
    const cs = entryTime ? parseTime(entryTime) : null
    act(() => addPredictionEntry(champId, {
      swimmer: swimmer.id, event: Number(eventId),
      ...(cs ? { entry_time_cs: cs } : {}),
    }), 'Entry added').then(() => { setSwimmer(null); setQuery(''); setEntryTime('') })
  }

  const inputStyle = { padding: '7px 10px', border: '1px solid var(--color-neutral-300)', fontSize: 13, background: '#fff' }

  return (
    <div style={{ marginTop: 30, border: '1px solid var(--color-divider)', background: 'var(--color-surface)', padding: '16px 18px' }}>
      <SectHead title="Entry list (admin)" />
      <div className="micro" style={{ margin: '-4px 0 12px' }}>
        Stage: <b>{stage}</b> — adding official entries upgrades the prediction to Official / High confidence after recompute.
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ position: 'relative' }}>
          <input
            style={{ ...inputStyle, minWidth: 220 }}
            placeholder="Search swimmer…"
            value={swimmer ? swimmer.name : query}
            onChange={(e) => { setSwimmer(null); setQuery(e.target.value) }}
          />
          {results.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, background: '#fff', border: '1px solid var(--color-neutral-300)', maxHeight: 220, overflowY: 'auto' }}>
              {results.map((s) => (
                <div
                  key={s.id}
                  onClick={() => { setSwimmer(s); setResults([]) }}
                  style={{ padding: '7px 10px', fontSize: 13, cursor: 'pointer', borderBottom: '1px solid var(--color-divider)' }}
                >
                  {s.name} {s.nationality_code ? `(${s.nationality_code})` : ''}
                </div>
              ))}
            </div>
          )}
        </div>
        <select style={inputStyle} value={eventId} onChange={(e) => setEventId(e.target.value)}>
          <option value="">Event…</option>
          {events.map((e) => (
            <option key={`${e.event_id}-${e.gender}`} value={e.event_id}>
              {e.event} ({e.gender === 'M' ? 'Men' : 'Women'})
            </option>
          ))}
        </select>
        <input
          style={{ ...inputStyle, width: 110 }}
          placeholder="Entry time"
          value={entryTime}
          onChange={(e) => setEntryTime(e.target.value)}
        />
        <button className="btn btn-primary" disabled={busy} onClick={add}>Add entry</button>
        <button
          className="btn btn-secondary" disabled={busy}
          onClick={() => act(() => seedPredictionEntries(champId), 'Seeded from automatic field')}
        >
          Seed from auto field
        </button>
        <button
          className="btn btn-secondary" disabled={busy}
          onClick={() => act(async () => { await recomputePrediction(champId); onChanged?.() }, 'Recomputed')}
        >
          Recompute now
        </button>
      </div>
      {msg && <div className="micro" style={{ marginBottom: 10 }}>{msg}</div>}

      {entries.length > 0 && (
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr><th>Swimmer</th><th>Event</th><th className="time">Entry time</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {entries.map((en) => (
                <tr key={en.id} style={en.withdrawn ? { opacity: 0.5 } : undefined}>
                  <td style={{ fontWeight: 600 }}>{en.swimmer_name} {en.nationality_code ? `(${en.nationality_code})` : ''}</td>
                  <td>{en.event_name} ({en.gender === 'M' ? 'Men' : 'Women'})</td>
                  <td className="time asw-time">{formatTime(en.entry_time_cs)}</td>
                  <td>{en.withdrawn ? 'Withdrawn' : 'Entered'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button
                      className="btn btn-secondary" disabled={busy} style={{ marginRight: 6 }}
                      onClick={() => act(() => updatePredictionEntry(champId, en.id, { withdrawn: !en.withdrawn }))}
                    >
                      {en.withdrawn ? 'Restore' : 'Withdraw'}
                    </button>
                    <button
                      className="btn btn-secondary" disabled={busy}
                      onClick={() => act(() => deletePredictionEntry(champId, en.id))}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ---- Page -----------------------------------------------------------------
export default function Predictions() {
  const { isAdmin } = useAuth()
  const [champs, setChamps] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [snap, setSnap] = useState(null)
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [gender, setGender] = useState('M')
  const [eventKey, setEventKey] = useState('')

  useEffect(() => {
    getPredictions()
      .then((res) => {
        const list = res.data || []
        setChamps(list)
        if (list.length > 0) setSelectedId(list[0].id)
      })
      .catch(() => setChamps([]))
      .finally(() => setLoading(false))
  }, [])

  const loadDetail = (id) => {
    setDetailLoading(true)
    getPrediction(id)
      .then((res) => setSnap(res.data))
      .catch(() => setSnap(null))
      .finally(() => setDetailLoading(false))
  }
  useEffect(() => {
    if (!selectedId) { setSnap(null); return }
    setEventKey('')
    loadDetail(selectedId)
  }, [selectedId])

  const events = snap?.events || []
  const genderEvents = useMemo(() => (
    events
      .filter((e) => e.gender === gender)
      .sort((a, b) => {
        const sa = STROKE_ORDER[a.stroke] ?? 99
        const sb = STROKE_ORDER[b.stroke] ?? 99
        if (sa !== sb) return sa - sb
        return (a.distance || 0) - (b.distance || 0)
      })
  ), [events, gender])

  const selectedEvent = useMemo(() => {
    if (genderEvents.length === 0) return null
    return genderEvents.find((e) => String(e.event_id) === String(eventKey)) || genderEvents[0]
  }, [genderEvents, eventKey])

  if (loading) return <Loading label="Loading predictions" />

  const champ = snap?.championship
  const sections = snap?.sections || {}

  return (
    <div>
      <PageHead title="Medal predictions" />

      {champs.length === 0 ? (
        <Empty label="No upcoming Arab, GCC or national championships to predict yet" />
      ) : (
        <>
          {/* championship tab bar */}
          <div className="rule-b records-filters" style={{ padding: '10px 32px', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            {champs.map((c) => {
              const active = c.id === selectedId
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedId(c.id)}
                  style={{
                    cursor: 'pointer', whiteSpace: 'nowrap',
                    fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 12.5,
                    padding: '7px 13px', lineHeight: 1,
                    background: active ? 'var(--color-accent)' : 'var(--color-bg)',
                    color: active ? '#fff' : 'var(--color-accent-800)',
                    border: `1px solid ${active ? 'var(--color-accent)' : 'var(--color-neutral-300)'}`,
                    borderBottom: active ? '2px solid var(--asw-gold)' : '1px solid var(--color-neutral-300)',
                  }}
                >
                  {c.name}
                </button>
              )
            })}
          </div>

          {detailLoading ? (
            <Loading label="Computing prediction" />
          ) : !snap ? (
            <Empty label="Prediction unavailable" />
          ) : (
            <div style={{ padding: '18px 32px 28px' }}>
              {/* header: dates + stage + confidence + updated */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
                <span className="kicker">
                  {formatDateRange(champ?.date, champ?.end_date)}
                  {champ?.country ? ` · ${champ.country}` : ''}
                  {champ?.pool ? ` · ${champ.pool}` : ''}
                </span>
                <span style={{ display: 'flex', gap: 6, marginLeft: 'auto', flexWrap: 'wrap' }}>
                  <Chip tone={snap.stage === 'OFFICIAL' ? 'navy' : 'warn'}>
                    {snap.stage === 'OFFICIAL' ? 'Official entries' : 'Early prediction'}
                  </Chip>
                  <Chip tone={snap.confidence === 'High' ? 'navy' : 'plain'}>{snap.confidence} confidence</Chip>
                </span>
              </div>
              <div className="micro" style={{ marginBottom: 4 }}>
                Prediction updated: {formatDate(snap.updated_at?.slice(0, 10))} · {snap.event_count} events · {snap.swimmer_count} swimmers analysed
              </div>
              {snap.stage !== 'OFFICIAL' && (
                <div className="micro" style={{ marginBottom: 16, color: '#7a5c14' }}>
                  Early prediction — the entry list has not been published yet. Fields are estimated from recent results and will update when entries are official.
                </div>
              )}
              <div style={{ height: 10 }} />

              <Section title="Top gold candidates" items={sections.top_gold} />
              <Section title="Strongest medal chances" items={sections.strongest} />
              <Section title="Podium challengers" items={sections.challengers} sub="Within reach of the podium — a strong swim changes everything" />
              <Section title="Rising medal chances" items={sections.rising} sub="Biggest gains since the previous prediction update" showDelta />

              <TallyTable table={snap.table} isNational={snap.is_national} />

              {/* medal chances by event */}
              <div style={{ marginBottom: 26 }}>
                <SectHead title="Medal chances by event" />
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', margin: '4px 0 12px' }}>
                  <Seg
                    options={[{ value: 'M', label: 'Men' }, { value: 'F', label: 'Women' }]}
                    value={gender}
                    onChange={(g) => { setGender(g); setEventKey('') }}
                  />
                  <select
                    value={selectedEvent ? String(selectedEvent.event_id) : ''}
                    onChange={(e) => setEventKey(e.target.value)}
                    style={{ padding: '7px 10px', border: '1px solid var(--color-neutral-300)', fontSize: 13, background: '#fff' }}
                  >
                    {genderEvents.map((e) => (
                      <option key={e.event_id} value={e.event_id}>{e.event}</option>
                    ))}
                  </select>
                </div>
                {selectedEvent ? <EventDetail ev={selectedEvent} /> : <Empty label="No events predicted for this selection" />}
              </div>

              <div className="micro" style={{ borderTop: '1px solid var(--color-divider)', paddingTop: 12 }}>
                These are probabilities, not certainties. Predictions are simulated from recent verified results
                and update as entry lists, new times and withdrawals come in.
              </div>

              {isAdmin && (
                <EntriesAdmin
                  champId={selectedId}
                  stage={snap.stage}
                  events={events}
                  onChanged={() => loadDetail(selectedId)}
                />
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
