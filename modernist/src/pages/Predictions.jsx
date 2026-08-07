import React, { useEffect, useMemo, useState } from 'react'
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
import { formatDate, formatDateRange, formatTime, parseTime, mediaUrl } from '../utils'

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

// ---- Overview view --------------------------------------------------------
// The boss-approved "outer look": hero card, projection overview, top
// candidates with photos, by-event table + projected medal table.

const TIER_LEGEND = [
  { label: 'Gold Favorite', range: '\u2265 50% gold', color: 'var(--asw-gold)' },
  { label: 'Medal Favorite', range: '80 – 100%', color: '#3f9d5a' },
  { label: 'Strong Medal Chance', range: '65 – 79%', color: '#3b82c4' },
  { label: 'Medal Contender', range: '45 – 64%', color: '#8b6cc9' },
  { label: 'Podium Challenger', range: '25 – 44%', color: '#e08b3c' },
  { label: 'Outside Chance', range: '10 – 24%', color: '#d05252' },
]

const STROKE_CHIPS = ['All', 'Freestyle', 'Backstroke', 'Breaststroke', 'Butterfly', 'Individual Medley']

function StatCard({ label, value, sub, accent }) {
  return (
    <div style={{
      border: '1px solid var(--color-divider)', background: 'var(--color-surface)',
      borderTop: `3px solid ${accent || 'var(--color-accent)'}`, padding: '14px 16px', minWidth: 0,
    }}>
      <div className="micro" style={{ marginBottom: 6 }}>{label}</div>
      <div className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 30, lineHeight: 1 }}>{value}</div>
      {sub && <div className="micro" style={{ marginTop: 7, textTransform: 'none', letterSpacing: 0 }}>{sub}</div>}
    </div>
  )
}

// Photo or navy-initial avatar
function Avatar({ photo, name, size = 72 }) {
  const initial = (name || '?').trim()[0]?.toUpperCase() || '?'
  if (photo) {
    return (
      <img
        src={mediaUrl(photo)} alt={name}
        style={{ width: size, height: size, objectFit: 'cover', objectPosition: 'top', display: 'block', border: '1px solid var(--color-divider)' }}
      />
    )
  }
  return (
    <div style={{
      width: size, height: size, background: 'var(--color-accent-800)', color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: size * 0.4,
    }}>
      {initial}
    </div>
  )
}

function CandidateCard({ c, rank }) {
  const isGold = String(c.gold_status || '').includes('Gold')
  return (
    <div style={{
      border: '1px solid var(--color-divider)', background: 'var(--color-surface)',
      borderTop: `3px solid ${rank === 1 ? 'var(--asw-gold)' : 'var(--color-accent)'}`,
      padding: '14px 14px 12px', textAlign: 'center', position: 'relative', minWidth: 0,
    }}>
      <span className="asw-num" style={{
        position: 'absolute', top: 8, left: 10, fontFamily: 'var(--font-heading)',
        fontWeight: 800, fontSize: 15,
        color: rank === 1 ? 'var(--asw-gold)' : 'var(--color-neutral-300)',
      }}>
        {rank}
      </span>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
        <Avatar photo={c.photo} name={c.name} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, minWidth: 0 }}>
        <Flag code={c.country_code} name={c.country_name} />
        <Link to={`/swimmers/${c.swimmer_id}`} style={{ fontWeight: 700, fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {c.name}
        </Link>
      </div>
      <div className="micro" style={{ marginTop: 3 }}>
        {shortEvent(c.event)}{c.age_group ? ` · ${c.age_group}` : ''}
      </div>
      <div style={{ marginTop: 8 }}>
        <StatusBadge status={isGold ? c.gold_status : c.status} />
      </div>
      <div className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 26, marginTop: 8, lineHeight: 1 }}>
        {Math.round(c.p_medal)}%
      </div>
      <div className="micro" style={{ fontSize: 9, marginTop: 2 }}>Medal chance</div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 9, borderTop: '1px solid var(--color-divider)', paddingTop: 8 }}>
        {[['Gold', c.eg], ['Silver', c.es], ['Bronze', c.eb]].map(([lab, v]) => (
          <div key={lab}>
            <div className="asw-num" style={{ fontWeight: 700, fontSize: 12.5 }}>{Math.round(v)}%</div>
            <div className="micro" style={{ fontSize: 8.5 }}>{lab}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function OverviewTab({ snap, onOpenEvent }) {
  const champ = snap.championship || {}
  const table = snap.table || []
  const [countryKey, setCountryKey] = useState('')
  const [stroke, setStroke] = useState('All')
  const [gender, setGender] = useState('M')
  const [openKey, setOpenKey] = useState('')

  // best event per swimmer, with per-medal % of that event
  const candidates = useMemo(() => {
    const map = new Map()
    for (const ev of snap.events || []) {
      for (const r of ev.field || []) {
        const cur = map.get(r.swimmer_id)
        if (!cur || r.p_medal > cur.p_medal) {
          map.set(r.swimmer_id, {
            swimmer_id: r.swimmer_id, name: r.name, photo: r.photo,
            country_code: r.country_code, country_name: r.country_name,
            event: ev.event, age_group: ev.age_group,
            p_medal: r.p_medal, eg: r.p_gold, es: r.p_silver, eb: r.p_bronze,
            status: r.status, gold_status: r.gold_status,
          })
        }
      }
    }
    return [...map.values()].sort((a, b) => (b.p_medal - a.p_medal) || (b.eg - a.eg)).slice(0, 5)
  }, [snap])

  const selectedCountry = table.find((r) => r.name === countryKey) || table[0]

  const evKey = (e) => `${e.event_id}|${e.gender}|${e.age_group || ''}`
  const eventRows = useMemo(() => (
    (snap.events || [])
      .filter((e) => e.gender === gender && (stroke === 'All' || e.stroke === stroke))
      .sort((a, b) => {
        const sa = STROKE_ORDER[a.stroke] ?? 99
        const sb = STROKE_ORDER[b.stroke] ?? 99
        if (sa !== sb) return sa - sb
        if ((a.distance || 0) !== (b.distance || 0)) return (a.distance || 0) - (b.distance || 0)
        return String(a.age_group || '').localeCompare(String(b.age_group || ''))
      })
  ), [snap, gender, stroke])

  const rising = snap.sections?.rising || []
  const pageUrl = typeof window !== 'undefined' ? window.location.href : ''
  const shareText = `Medal predictions — ${champ.name}`

  const panelStyle = { border: '1px solid var(--color-divider)', background: 'var(--color-surface)', padding: '14px 16px' }

  return (
    <div>
      {/* hero */}
      <div style={{
        border: '1px solid var(--color-divider)', display: 'flex', flexWrap: 'wrap',
        marginBottom: 18, overflow: 'hidden',
      }}>
        <div style={{
          flex: '1 1 320px', minHeight: 130, position: 'relative',
          background: 'var(--color-accent-800)', color: '#fff',
          display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '22px 26px',
        }}>
          {champ.meet_photo && (
            <>
              <img src={mediaUrl(champ.meet_photo)} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(12,36,64,0.92) 0%, rgba(12,36,64,0.55) 60%, rgba(12,36,64,0.25) 100%)' }} />
            </>
          )}
          <div style={{ position: 'relative' }}>
            <div className="kicker" style={{ color: 'var(--asw-gold)', marginBottom: 6 }}>
              {champ.classification || 'Championship'}{champ.pool ? ` · ${champ.pool}` : ''}
            </div>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 26, lineHeight: 1.15 }}>
              {champ.name}
            </div>
            <div style={{ marginTop: 8, fontSize: 13, opacity: 0.92 }}>
              {formatDateRange(champ.date, champ.end_date)}
              {(champ.location || champ.country) ? ` · ${champ.location || champ.country}` : ''}
            </div>
          </div>
        </div>
        <div style={{
          flex: '0 1 250px', minWidth: 210, borderLeft: '1px solid var(--color-divider)',
          padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12, justifyContent: 'center',
          background: 'var(--color-surface)',
        }}>
          <div>
            <div className="micro" style={{ marginBottom: 3 }}>Prediction updated</div>
            <div style={{ fontWeight: 700, fontSize: 13.5 }}>{formatDate(snap.updated_at?.slice(0, 10))}</div>
          </div>
          <div>
            <div className="micro" style={{ marginBottom: 4 }}>Prediction stage</div>
            <Chip tone={snap.stage === 'OFFICIAL' ? 'navy' : 'warn'}>
              {snap.stage === 'OFFICIAL' ? 'Entry list prediction' : 'Early prediction'}
            </Chip>
          </div>
          <div>
            <div className="micro" style={{ marginBottom: 4 }}>Confidence level</div>
            <Chip tone={snap.confidence === 'High' ? 'navy' : 'plain'}>{snap.confidence}</Chip>
          </div>
        </div>
      </div>

      {/* projection overview */}
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: 22 }}>
        <div style={{ flex: '1 1 460px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
            <SectHead title="Medal projection overview" />
            {table.length > 1 && (
              <select
                value={selectedCountry?.name || ''}
                onChange={(e) => setCountryKey(e.target.value)}
                style={{ padding: '5px 8px', border: '1px solid var(--color-neutral-300)', fontSize: 12.5, background: '#fff', marginLeft: 'auto' }}
              >
                {table.map((r) => <option key={r.name} value={r.name}>{r.name}</option>)}
              </select>
            )}
          </div>
          {selectedCountry ? (
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
              <StatCard
                label={`${selectedCountry.name} — expected medals`}
                value={selectedCountry.total.toFixed(1)}
                sub={`Likely range: ${selectedCountry.likely_min} – ${selectedCountry.likely_max}`}
                accent="var(--color-accent)"
              />
              <StatCard label="Gold" value={selectedCountry.gold.toFixed(1)} accent="var(--asw-gold)" sub="Expected" />
              <StatCard label="Silver" value={selectedCountry.silver.toFixed(1)} accent="#9aa5b1" sub="Expected" />
              <StatCard label="Bronze" value={selectedCountry.bronze.toFixed(1)} accent="#b07a4a" sub="Expected" />
            </div>
          ) : (
            <Empty label="No projection available yet" />
          )}
        </div>
        <div style={{ flex: '0 1 280px', minWidth: 230, ...panelStyle }}>
          <div className="kicker" style={{ marginBottom: 8 }}>About the prediction</div>
          <div style={{ fontSize: 12.5, lineHeight: 1.55, color: 'var(--color-neutral-700)' }}>
            Predictions are calculated from current season best times, recent form, progression and
            thousands of simulated race outcomes. They are probabilities, not certainties, and update
            as entry lists, new times and withdrawals come in.
          </div>
        </div>
      </div>

      {/* top candidates + legend */}
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: 22 }}>
        <div style={{ flex: '1 1 520px', minWidth: 0 }}>
          <SectHead title="Top medal candidates" />
          {candidates.length === 0 ? (
            <Empty label="No candidates yet" />
          ) : (
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', marginTop: 10 }}>
              {candidates.map((c, i) => <CandidateCard key={c.swimmer_id} c={c} rank={i + 1} />)}
            </div>
          )}
        </div>
        <div style={{ flex: '0 1 280px', minWidth: 230, ...panelStyle, alignSelf: 'flex-start' }}>
          <div className="kicker" style={{ marginBottom: 10 }}>Medal chance status</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {TIER_LEGEND.map((t) => (
              <div key={t.label} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12.5 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: t.color, flex: 'none' }} />
                <span style={{ fontWeight: 600 }}>{t.label}</span>
                <span className="asw-num" style={{ marginLeft: 'auto', color: 'var(--color-neutral-700)', fontSize: 12 }}>{t.range}</span>
              </div>
            ))}
          </div>
          <div className="micro" style={{ marginTop: 12, textTransform: 'none', letterSpacing: 0, borderTop: '1px solid var(--color-divider)', paddingTop: 10 }}>
            Percentages represent the probability of winning ANY medal (gold, silver or bronze).
          </div>
        </div>
      </div>

      {/* by event + medal table */}
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: 22, alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 520px', minWidth: 0 }}>
          <SectHead title="Medal predictions by event" />
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', margin: '8px 0 12px' }}>
            {STROKE_CHIPS.map((s) => {
              const active = stroke === s
              return (
                <button
                  key={s} type="button" onClick={() => { setStroke(s); setOpenKey('') }}
                  style={{
                    cursor: 'pointer', fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 11,
                    padding: '5px 10px', lineHeight: 1, whiteSpace: 'nowrap',
                    background: active ? 'var(--color-accent)' : 'var(--color-bg)',
                    color: active ? '#fff' : 'var(--color-accent-800)',
                    border: `1px solid ${active ? 'var(--color-accent)' : 'var(--color-neutral-300)'}`,
                  }}
                >
                  {s === 'All' ? 'All events' : s === 'Individual Medley' ? 'IM' : s}
                </button>
              )
            })}
            <span style={{ marginLeft: 'auto' }}>
              <Seg
                options={[{ value: 'M', label: 'Men' }, { value: 'F', label: 'Women' }]}
                value={gender}
                onChange={(g) => { setGender(g); setOpenKey('') }}
              />
            </span>
          </div>
          {eventRows.length === 0 ? (
            <Empty label="No events match this filter" />
          ) : (
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>Event</th>
                    <th>Top contender</th>
                    <th className="time hide-mobile">Seed</th>
                    <th className="num hide-mobile">Expected rank</th>
                    <th>Medal chance</th>
                  </tr>
                </thead>
                <tbody>
                  {eventRows.map((ev) => {
                    const top = ev.field?.[0]
                    if (!top) return null
                    const key = evKey(ev)
                    const open = openKey === key
                    return (
                      <React.Fragment key={key}>
                        <tr onClick={() => setOpenKey(open ? '' : key)} style={{ cursor: 'pointer' }} title="View full field">
                          <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                            {shortEvent(ev.event)}{ev.age_group ? ` · ${ev.age_group}` : ''} {open ? '▲' : '▾'}
                          </td>
                          <td>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                              <Flag code={top.country_code} name={top.country_name} />
                              <Link to={`/swimmers/${top.swimmer_id}`} onClick={(e) => e.stopPropagation()}>{top.name}</Link>
                            </span>
                          </td>
                          <td className="time asw-time hide-mobile">{top.seed}</td>
                          <td className="num asw-num hide-mobile">{top.place_range}</td>
                          <td style={{ minWidth: 150 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ flex: 1, height: 7, background: 'var(--color-bg)', border: '1px solid var(--color-divider)', minWidth: 60 }}>
                                <div style={{ width: `${Math.min(100, top.p_medal)}%`, height: '100%', background: top.p_gold >= 50 ? 'var(--asw-gold)' : 'var(--color-accent)' }} />
                              </div>
                              <span className="asw-num" style={{ fontWeight: 700, fontSize: 12.5, width: 34, textAlign: 'right' }}>{Math.round(top.p_medal)}%</span>
                            </div>
                          </td>
                        </tr>
                        {open && (
                          <tr>
                            <td colSpan={5} style={{ background: 'var(--color-surface)', padding: '12px 12px 16px' }}>
                              <EventDetail ev={ev} />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div style={{ flex: '0 1 300px', minWidth: 250, ...panelStyle }}>
          <div className="kicker" style={{ marginBottom: 10 }}>
            {snap.is_national ? 'Projected medal table — clubs' : 'Projected medal table'}
          </div>
          {table.length === 0 ? (
            <div className="micro" style={{ textTransform: 'none', letterSpacing: 0 }}>Not available yet</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr className="micro">
                  <th style={{ textAlign: 'left', paddingBottom: 6 }}>{snap.is_national ? 'Club' : 'Country'}</th>
                  <th style={{ textAlign: 'right', paddingBottom: 6 }}>G</th>
                  <th style={{ textAlign: 'right', paddingBottom: 6 }}>S</th>
                  <th style={{ textAlign: 'right', paddingBottom: 6 }}>B</th>
                  <th style={{ textAlign: 'right', paddingBottom: 6 }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {table.slice(0, 10).map((r) => (
                  <tr key={r.name} style={{ borderTop: '1px solid var(--color-divider)' }}>
                    <td style={{ padding: '5px 0', fontWeight: 600 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        {r.code && <Flag code={r.code} name={r.name} />}
                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 120, display: 'inline-block' }}>{r.name}</span>
                      </span>
                    </td>
                    <td className="asw-num" style={{ textAlign: 'right' }}>{r.gold.toFixed(1)}</td>
                    <td className="asw-num" style={{ textAlign: 'right' }}>{r.silver.toFixed(1)}</td>
                    <td className="asw-num" style={{ textAlign: 'right' }}>{r.bronze.toFixed(1)}</td>
                    <td className="asw-num" style={{ textAlign: 'right', fontWeight: 700 }}>{r.total.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="micro" style={{ marginTop: 10, textTransform: 'none', letterSpacing: 0 }}>
            Values are expected medals (not guaranteed).
          </div>
        </div>
      </div>

      {/* improvements + share */}
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
        {rising.length > 0 && (
          <div style={{ flex: '1 1 320px', minWidth: 0, ...panelStyle }}>
            <div className="kicker" style={{ marginBottom: 10 }}>Biggest improvements</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {rising.slice(0, 6).map((c, i) => (
                <div key={`${c.swimmer_id}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  <Flag code={c.country_code} name={c.country_name} />
                  <Link to={`/swimmers/${c.swimmer_id}`} style={{ fontWeight: 600 }}>{c.name}</Link>
                  <span className="micro" style={{ textTransform: 'none', letterSpacing: 0 }}>{shortEvent(c.event)}</span>
                  <span className="asw-num" style={{ marginLeft: 'auto', color: '#3f9d5a', fontWeight: 700 }}>▲ +{c.delta} pts</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <div style={{ flex: '1 1 280px', minWidth: 0, ...panelStyle }}>
          <div className="kicker" style={{ marginBottom: 8 }}>Share predictions</div>
          <div className="micro" style={{ textTransform: 'none', letterSpacing: 0, marginBottom: 10 }}>
            Share these predictions with your friends and community.
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <a className="btn btn-secondary" href={`https://wa.me/?text=${encodeURIComponent(`${shareText} ${pageUrl}`)}`} target="_blank" rel="noreferrer">WhatsApp</a>
            <a className="btn btn-secondary" href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(pageUrl)}`} target="_blank" rel="noreferrer">X</a>
            <a className="btn btn-secondary" href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(pageUrl)}`} target="_blank" rel="noreferrer">Facebook</a>
            <button className="btn btn-secondary" type="button" onClick={() => navigator.clipboard?.writeText(pageUrl)}>Copy link</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function shortEvent(name) {
  return String(name)
    .replace(/\s*M\s+/, ' ')
    .replace('Freestyle', 'Free').replace('Backstroke', 'Back')
    .replace('Breaststroke', 'Breast').replace('Butterfly', 'Fly')
    .replace('Individual Medley', 'IM')
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
  const [view, setView] = useState('overview')

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
              {/* header: dates + stage + confidence + updated
                  (Overview has its own hero card with all of this) */}
              {view !== 'overview' && (
              <>
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
              </>
              )}
              {snap.stage !== 'OFFICIAL' && (
                <div className="micro" style={{ marginBottom: 16, color: '#7a5c14' }}>
                  Early prediction — the entry list has not been published yet. Fields are estimated from recent results and will update when entries are official.
                </div>
              )}
              <div style={{ margin: '12px 0 20px' }}>
                <Seg
                  options={[
                    { value: 'overview', label: 'Overview' },
                    { value: 'original', label: 'Original' },
                  ]}
                  value={view}
                  onChange={setView}
                />
              </div>

              {view === 'overview' && <OverviewTab snap={snap} />}

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
