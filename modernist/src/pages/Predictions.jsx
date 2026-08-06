import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  getPredictions, getPrediction, recomputePrediction,
  getPredictionEntries, addPredictionEntry, updatePredictionEntry,
  deletePredictionEntry, seedPredictionEntries,
  getPredictionAgeGroups, addPredictionAgeGroup, deletePredictionAgeGroup,
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
        {c.event} · {c.gender === 'M' ? 'Men' : 'Women'}{c.age_group ? ` · ${c.age_group}` : ''}
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

// ---- Admin: age-category manager -----------------------------------------
// Defining categories makes the engine predict every event separately per
// age group (age in the meet year), which is what age-group meets need.
function AgeGroupsAdmin({ champId, onChanged }) {
  const [groups, setGroups] = useState([])
  const [label, setLabel] = useState('')
  const [minAge, setMinAge] = useState('')
  const [maxAge, setMaxAge] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const load = () => {
    getPredictionAgeGroups(champId).then((res) => setGroups(res.data || [])).catch(() => setGroups([]))
  }
  useEffect(load, [champId])

  const act = async (fn, okMsg) => {
    setBusy(true); setMsg('')
    try {
      await fn()
      load()
      onChanged?.()
      if (okMsg) setMsg(okMsg)
    } catch (e) {
      const d = e?.response?.data
      setMsg(d && typeof d === 'object' ? Object.values(d).flat().join(' ') : 'Action failed')
    } finally {
      setBusy(false)
    }
  }

  const add = () => {
    if (!label.trim() || (!minAge && !maxAge)) { setMsg('Give the category a name and at least one age bound'); return }
    act(() => addPredictionAgeGroup(champId, {
      label: label.trim(),
      min_age: minAge ? Number(minAge) : null,
      max_age: maxAge ? Number(maxAge) : null,
    }), 'Category added — prediction recomputed').then(() => { setLabel(''); setMinAge(''); setMaxAge('') })
  }

  const inputStyle = { padding: '7px 10px', border: '1px solid var(--color-neutral-300)', fontSize: 13, background: '#fff' }

  return (
    <div style={{ marginTop: 30, border: '1px solid var(--color-divider)', background: 'var(--color-surface)', padding: '16px 18px' }}>
      <SectHead title="Age categories (admin)" />
      <div className="micro" style={{ margin: '-4px 0 12px', textTransform: 'none', letterSpacing: 0 }}>
        For age-group / youth meets. Each category is predicted as its own race; swimmers are placed
        by their age in the meet year. Leave empty for open meets. Changes recompute the prediction instantly.
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: groups.length ? 12 : 0 }}>
        <input style={{ ...inputStyle, width: 130 }} placeholder="Label, e.g. 13-14" value={label} onChange={(e) => setLabel(e.target.value)} />
        <input style={{ ...inputStyle, width: 90 }} type="number" placeholder="Min age" value={minAge} onChange={(e) => setMinAge(e.target.value)} />
        <input style={{ ...inputStyle, width: 90 }} type="number" placeholder="Max age" value={maxAge} onChange={(e) => setMaxAge(e.target.value)} />
        <button className="btn btn-primary" disabled={busy} onClick={add}>Add category</button>
        {msg && <span className="micro" style={{ textTransform: 'none', letterSpacing: 0 }}>{msg}</span>}
      </div>
      {groups.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {groups.map((g) => (
            <span key={g.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, border: '1px solid var(--color-neutral-300)', background: '#fff', padding: '5px 10px', fontSize: 13 }}>
              <b>{g.label}</b>
              <span className="micro" style={{ textTransform: 'none', letterSpacing: 0 }}>
                {g.min_age != null && g.max_age != null ? `${g.min_age}–${g.max_age}`
                  : g.min_age != null ? `${g.min_age}+` : `up to ${g.max_age}`}
              </span>
              <button
                disabled={busy}
                onClick={() => act(() => deletePredictionAgeGroup(champId, g.id), 'Category removed — prediction recomputed')}
                style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0, color: 'var(--color-neutral-700)' }}
                aria-label={`Remove ${g.label}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
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
          {events
            .filter((e, i, arr) => arr.findIndex((x) => x.event_id === e.event_id && x.gender === e.gender) === i)
            .map((e) => (
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

// ---- People view ----------------------------------------------------------
// Fan-first angle: fans follow swimmers, not events. One row per swimmer,
// aggregated across everything they race at this meet.

function shortEvent(name) {
  return String(name)
    .replace(/\s*M\s+/, ' ')
    .replace('Freestyle', 'Free').replace('Backstroke', 'Back')
    .replace('Breaststroke', 'Breast').replace('Butterfly', 'Fly')
    .replace('Individual Medley', 'IM')
}

function ChanceBar({ label, pct, gold }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span className="micro" style={{ width: 86, flex: 'none', textTransform: 'none', letterSpacing: 0 }}>{label}</span>
      <div style={{ flex: 1, height: 8, background: 'var(--color-bg)', border: '1px solid var(--color-divider)' }}>
        <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: gold ? 'var(--asw-gold)' : 'var(--color-accent)' }} />
      </div>
      <span className="asw-num" style={{ width: 38, flex: 'none', textAlign: 'right', fontSize: 12, fontWeight: 700 }}>{Math.round(pct)}%</span>
    </div>
  )
}

function PeopleTab({ snap }) {
  const [gender, setGender] = useState('ALL')
  const [country, setCountry] = useState('')
  const [query, setQuery] = useState('')

  // one entry per swimmer, aggregated across all their events
  const swimmers = useMemo(() => {
    const map = new Map()
    for (const ev of snap.events || []) {
      for (const r of ev.field || []) {
        if (!map.has(r.swimmer_id)) {
          map.set(r.swimmer_id, {
            id: r.swimmer_id, name: r.name,
            country_code: r.country_code, country_name: r.country_name,
            gender: ev.gender, age_group: ev.age_group || null, events: [],
            eg: 0, es: 0, eb: 0, em: 0,
          })
        }
        const s = map.get(r.swimmer_id)
        s.events.push({
          event: ev.event, gender: ev.gender,
          p_gold: r.p_gold, p_medal: r.p_medal,
          status: r.status, gold_status: r.gold_status,
          seed: r.seed, place_range: r.place_range,
        })
        s.eg += r.p_gold / 100
        s.es += r.p_silver / 100
        s.eb += r.p_bronze / 100
        s.em += r.p_medal / 100
      }
    }
    const arr = [...map.values()]
    arr.forEach((s) => {
      s.events.sort((a, b) => b.p_medal - a.p_medal)
      s.best = s.events[0]
    })
    // meet stars first: most expected medals, golds break ties
    arr.sort((a, b) => (b.em - a.em) || (b.eg - a.eg))
    return arr
  }, [snap])

  const countries = useMemo(() => {
    const seen = new Map()
    swimmers.forEach((s) => { if (s.country_code && !seen.has(s.country_code)) seen.set(s.country_code, s.country_name) })
    return [...seen.entries()].sort((a, b) => (a[1] || '').localeCompare(b[1] || ''))
  }, [swimmers])

  const filtered = useMemo(() => (
    swimmers.filter((s) => (
      (gender === 'ALL' || s.gender === gender)
      && (!country || s.country_code === country)
      && (!query || s.name.toLowerCase().includes(query.toLowerCase()))
    ))
  ), [swimmers, gender, country, query])

  const noFilter = gender === 'ALL' && !country && !query
  const stars = noFilter ? filtered.filter((s) => s.em >= 0.5).slice(0, 6) : []
  const listed = filtered.filter((s) => s.em >= 0.02).slice(0, 60)

  return (
    <div>
      {/* stars of the meet */}
      {stars.length > 0 && (
        <div style={{ marginBottom: 26 }}>
          <SectHead title="Stars of the meet" />
          <div className="micro" style={{ margin: '-4px 0 10px' }}>
            The swimmers projected to take home the most medals
          </div>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
            {stars.map((s, i) => (
              <div key={s.id} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-divider)', borderTop: i === 0 ? '3px solid var(--asw-gold)' : '3px solid var(--color-accent)', padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 22, color: 'var(--color-neutral-300)', width: 26, flex: 'none' }}>{i + 1}</span>
                  <Flag code={s.country_code} name={s.country_name} large />
                  <div style={{ minWidth: 0 }}>
                    <Link to={`/swimmers/${s.id}`} style={{ fontWeight: 700, fontSize: 14.5 }}>{s.name}</Link>
                    <div className="micro" style={{ marginTop: 1 }}>
                      {s.country_name} · {s.gender === 'M' ? 'Men' : 'Women'}{s.age_group ? ` · ${s.age_group}` : ''}
                    </div>
                  </div>
                  <div style={{ marginLeft: 'auto', textAlign: 'right', flex: 'none' }}>
                    <div className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, lineHeight: 1 }}>{s.em.toFixed(1)}</div>
                    <div className="micro" style={{ fontSize: 9 }}>Expected medals</div>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
                  {s.events.slice(0, 3).map((e) => (
                    <ChanceBar key={`${e.event}`} label={shortEvent(e.event)} pct={e.p_medal} gold={e.p_gold >= 50} />
                  ))}
                </div>
                {s.events.length > 3 && (
                  <div className="micro" style={{ marginTop: 8, textTransform: 'none', letterSpacing: 0 }}>
                    +{s.events.length - 3} more event{s.events.length - 3 > 1 ? 's' : ''}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* everyone with a realistic shot */}
      <SectHead title="Medal outlook by swimmer" />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', margin: '4px 0 12px' }}>
        <Seg
          options={[{ value: 'ALL', label: 'All' }, { value: 'M', label: 'Men' }, { value: 'F', label: 'Women' }]}
          value={gender}
          onChange={setGender}
        />
        <select
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          style={{ padding: '7px 10px', border: '1px solid var(--color-neutral-300)', fontSize: 13, background: '#fff' }}
        >
          <option value="">All countries</option>
          {countries.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
        </select>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search swimmer…"
          style={{ padding: '7px 10px', border: '1px solid var(--color-neutral-300)', fontSize: 13, background: '#fff', minWidth: 160 }}
        />
      </div>
      {listed.length === 0 ? (
        <Empty label="No swimmers match this filter" />
      ) : (
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Swimmer</th>
                <th className="num">Expected medals</th>
                <th>Best shot</th>
                <th>Outlook</th>
                <th className="hide-mobile">All events</th>
              </tr>
            </thead>
            <tbody>
              {listed.map((s, i) => (
                <tr key={s.id}>
                  <td className="asw-num">{i + 1}</td>
                  <td style={{ fontWeight: 600 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                      <Flag code={s.country_code} name={s.country_name} />
                      <Link to={`/swimmers/${s.id}`}>{s.name}</Link>
                      {s.age_group && (
                        <span className="micro" style={{ fontWeight: 400 }}>{s.age_group}</span>
                      )}
                    </span>
                  </td>
                  <td className="num asw-num" style={{ fontWeight: 700 }}>{s.em.toFixed(1)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {shortEvent(s.best.event)} <span className="asw-num" style={{ fontWeight: 700 }}>{Math.round(s.best.p_medal)}%</span>
                  </td>
                  <td>
                    <StatusBadge
                      status={String(s.best.gold_status || '').includes('Gold') ? s.best.gold_status : s.best.status}
                      pct={String(s.best.gold_status || '').includes('Gold') ? s.best.p_gold : s.best.p_medal}
                    />
                  </td>
                  <td className="hide-mobile" style={{ fontSize: 12, color: 'var(--color-neutral-700)' }}>
                    {s.events.slice(0, 4).map((e) => `${shortEvent(e.event)} ${Math.round(e.p_medal)}%`).join(' · ')}
                    {s.events.length > 4 ? ` · +${s.events.length - 4}` : ''}
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
  const [view, setView] = useState('people')

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
        if ((a.distance || 0) !== (b.distance || 0)) return (a.distance || 0) - (b.distance || 0)
        return String(a.age_group || '').localeCompare(String(b.age_group || ''))
      })
  ), [events, gender])

  const evKey = (e) => `${e.event_id}|${e.age_group || ''}`
  const selectedEvent = useMemo(() => {
    if (genderEvents.length === 0) return null
    return genderEvents.find((e) => evKey(e) === eventKey) || genderEvents[0]
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
                  {snap.age_groups?.length > 0 && <Chip tone="plain">Age-group meet</Chip>}
                </span>
              </div>
              {snap.age_groups?.length > 0 && (
                <div className="micro" style={{ marginBottom: 4 }}>
                  Age categories: {snap.age_groups.join(' · ')} — every event is predicted separately per category
                </div>
              )}
              <div className="micro" style={{ marginBottom: 4 }}>
                Prediction updated: {formatDate(snap.updated_at?.slice(0, 10))} · {snap.event_count} events · {snap.swimmer_count} swimmers analysed
              </div>
              {snap.stage !== 'OFFICIAL' && (
                <div className="micro" style={{ marginBottom: 16, color: '#7a5c14' }}>
                  Early prediction — the entry list has not been published yet. Fields are estimated from recent results and will update when entries are official.
                </div>
              )}
              <div style={{ margin: '12px 0 20px' }}>
                <Seg
                  options={[{ value: 'people', label: 'People' }, { value: 'original', label: 'Original' }]}
                  value={view}
                  onChange={setView}
                />
              </div>

              {view === 'people' && <PeopleTab snap={snap} />}

              {view === 'original' && (
              <>
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
                    value={selectedEvent ? evKey(selectedEvent) : ''}
                    onChange={(e) => setEventKey(e.target.value)}
                    style={{ padding: '7px 10px', border: '1px solid var(--color-neutral-300)', fontSize: 13, background: '#fff' }}
                  >
                    {genderEvents.map((e) => (
                      <option key={evKey(e)} value={evKey(e)}>
                        {e.event}{e.age_group ? ` — ${e.age_group}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                {selectedEvent ? <EventDetail ev={selectedEvent} /> : <Empty label="No events predicted for this selection" />}
              </div>
              </>
              )}

              <div className="micro" style={{ borderTop: '1px solid var(--color-divider)', paddingTop: 12, marginTop: 20 }}>
                These are probabilities, not certainties. Predictions are simulated from recent verified results
                and update as entry lists, new times and withdrawals come in.
              </div>

              {isAdmin && (
                <>
                  <AgeGroupsAdmin champId={selectedId} onChanged={() => loadDetail(selectedId)} />
                  <EntriesAdmin
                    champId={selectedId}
                    stage={snap.stage}
                    events={events}
                    onChanged={() => loadDetail(selectedId)}
                  />
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
