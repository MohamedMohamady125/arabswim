import React, { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  getPredictions, getPrediction, recomputePrediction,
  getPredictionEntries, addPredictionEntry, updatePredictionEntry,
  deletePredictionEntry, seedPredictionEntries,
  getPredictionAgeGroups, addPredictionAgeGroup, deletePredictionAgeGroup,
  getPredictionExclusions, addPredictionExclusion, removePredictionExclusion,
} from '../api/predictions'
import { searchSwimmers } from '../api/swimmers'
import { PageHead, Loading, Empty, Seg, SectHead } from '../components/ui'
import Flag from '../components/Flag'
import { useAuth } from '../context/AuthContext'
import { useFeatures } from '../context/FeaturesContext'
import { nameTie, formatDate, formatDateRange, formatTime, parseTime, mediaUrl, poolLabel, nameInitials } from '../utils'
import Pic from '../components/Pic'

// one wording for a pool course on every page (utils.poolLabel)
const poolWord = (p) => (p === 'OW' ? 'Open water' : poolLabel(p))
// A medal-table row without a club comes back named "—": never print a bare
// dash as a name — say what the bucket is.
const entityName = (n) => {
  const t = String(n ?? '').trim()
  return !t || /^[—–-]+$/.test(t) ? 'Unattached' : t
}
const STROKE_ORDER = { Freestyle: 0, Backstroke: 1, Breaststroke: 2, Butterfly: 3, 'Individual Medley': 4 }

// tier → visual treatment: gold tint for favorites, navy for strong, neutral otherwise
function statusStyle(status) {
  const s = String(status || '')
  if (s.includes('Favorite')) {
    return { background: 'color-mix(in srgb, var(--asw-gold) 14%, #fff)', color: 'var(--color-accent-900)', border: '1px solid color-mix(in srgb, var(--asw-gold) 50%, #fff)' }
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
      fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
      padding: '4px 8px', lineHeight: 1.4, whiteSpace: 'nowrap',
    }}>
      {status}{pct != null ? ` — ${fmtPct(pct)}` : ''}
    </span>
  )
}

function Chip({ children, tone }) {
  const tones = {
    warn: { background: 'color-mix(in srgb, var(--asw-gold) 14%, #fff)', color: 'var(--color-accent-900)', border: '1px solid color-mix(in srgb, var(--asw-gold) 50%, #fff)' },
    navy: { background: 'var(--color-accent)', color: '#fff', border: '1px solid var(--color-accent)' },
    plain: { background: 'var(--color-bg)', color: 'var(--color-neutral-700)', border: '1px solid var(--color-neutral-300)' },
  }
  return (
    <span style={{
      ...(tones[tone] || tones.plain),
      fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 11,
      letterSpacing: '0.08em', textTransform: 'uppercase', padding: '4px 8px', lineHeight: 1.4,
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
        <Link to={`/swimmers/${c.swimmer_id}`} style={{ padding: '8px 0', margin: '-7px 0' /* Fitts's Law: taller hit area, same layout */ }}>{c.name}</Link>
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
      <SectHead title={isNational ? 'Projected Medal Table by Club' : 'Projected Medal Table by Country'} />
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
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    {r.code && <Flag code={r.code} name={r.name} />}
                    {entityName(r.name)}
                  </span>
                </td>
                <td className="num asw-num" style={{ fontWeight: 700 }}>{fmtMedals(r.gold)}</td>
                <td className="num asw-num">{fmtMedals(r.silver)}</td>
                <td className="num asw-num">{fmtMedals(r.bronze)}</td>
                <td className="num asw-num" style={{ fontWeight: 700 }}>{fmtMedals(r.total)}</td>
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
function EventDetail({ ev, champId, onChanged }) {
  const { isAdmin } = useAuth()
  const [busyId, setBusyId] = useState(null)
  if (!ev) return null
  const canExclude = isAdmin && champId
  const exclude = async (r) => {
    if (!window.confirm(`Exclude ${r.name} from this meet's prediction? They will be removed from every event.`)) return
    setBusyId(r.swimmer_id)
    try {
      await addPredictionExclusion(champId, { swimmer: r.swimmer_id })
      onChanged?.()
    } catch { /* already excluded or failed — the list below shows the truth */ }
    setBusyId(null)
  }
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
              {canExclude && <th />}
            </tr>
          </thead>
          <tbody>
            {ev.field.map((r) => (
              <tr key={r.swimmer_id}>
                <td style={{ fontWeight: 600 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <Flag code={r.country_code} name={r.country_name} />
                    <Link to={`/swimmers/${r.swimmer_id}`}>{r.name}</Link>
                  </span>
                </td>
                <td className="time asw-time">{r.seed}</td>
                <td className="num asw-num">{r.place_range}</td>
                <td className="num asw-num">{fmtPct(r.p_gold)}</td>
                <td className="num asw-num">{fmtPct(r.p_silver)}</td>
                <td className="num asw-num">{fmtPct(r.p_bronze)}</td>
                <td><StatusBadge status={r.status} pct={r.p_medal} /></td>
                <td className="num asw-num" style={{ color: r.gap_to_bronze > 0 ? 'var(--color-neutral-700)' : 'var(--color-accent-800)' }}>
                  {r.gap_to_bronze > 0 ? `+${r.gap_to_bronze.toFixed(2)}s` : `${r.gap_to_bronze.toFixed(2)}s`}
                </td>
                {canExclude && (
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={busyId === r.swimmer_id}
                      onClick={() => exclude(r)}
                      aria-label={`Exclude ${r.name} from this meet's prediction`}
                      title="Exclude from this meet's prediction"
                    >
                      {busyId === r.swimmer_id ? '…' : 'Exclude'}
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="micro" style={{ marginTop: 10, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
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
      setMsg(d && typeof d === 'object' ? Object.values(d).flat().join(' ') : 'Could not save the change. Try again.')
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

  const inputStyle = { padding: '8px 10px', border: '1px solid var(--color-neutral-300)', fontSize: 13, background: '#fff' }

  return (
    <div style={{ marginTop: 30, border: '1px solid var(--color-divider)', background: 'var(--color-surface)', padding: '16px 16px' }}>
      <SectHead title="Age Categories (Admin)" />
      <div className="micro" style={{ margin: '-4px 0 12px', textTransform: 'none', letterSpacing: 0 }}>
        For age-group / youth meets. Each category is predicted as its own race; swimmers are placed
        by their age in the meet year. Leave empty for open meets. Changes recompute the prediction instantly.
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: groups.length ? 12 : 0 }}>
        <input aria-label="Category label" style={{ ...inputStyle, width: 130 }} placeholder="Label, e.g. 13-14" value={label} onChange={(e) => setLabel(e.target.value)} />
        <input aria-label="Minimum age" style={{ ...inputStyle, width: 90 }} type="number" placeholder="Min age" value={minAge} onChange={(e) => setMinAge(e.target.value)} />
        <input aria-label="Maximum age" style={{ ...inputStyle, width: 90 }} type="number" placeholder="Max age" value={maxAge} onChange={(e) => setMaxAge(e.target.value)} />
        <button type="button" className="btn btn-primary" disabled={busy} onClick={add}>{busy ? 'Saving…' : 'Add category'}</button>
        {msg && <span role="status" className="micro" style={{ textTransform: 'none', letterSpacing: 0 }}>{msg}</span>}
      </div>
      {groups.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {groups.map((g) => (
            <span key={g.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, border: '1px solid var(--color-neutral-300)', background: '#fff', padding: '4px 10px', fontSize: 13 }}>
              <b>{g.label}</b>
              <span className="micro" style={{ textTransform: 'none', letterSpacing: 0 }}>
                {g.min_age != null && g.max_age != null ? `${g.min_age}–${g.max_age}`
                  : g.min_age != null ? `${g.min_age}+` : `up to ${g.max_age}`}
              </span>
              <button
                type="button"
                disabled={busy}
                title={`Remove ${g.label}`}
                onClick={() => { if (window.confirm(`Remove the "${g.label}" category? The prediction is recomputed without it.`)) act(() => deletePredictionAgeGroup(champId, g.id), 'Category removed — prediction recomputed') }}
                style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0, color: 'var(--color-neutral-700)', minWidth: 40, minHeight: 40, margin: '-7px -9px -7px -5px' /* Fitts's Law: 32px target, chip size unchanged */ }}
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

// ---- Admin: excluded-athletes manager ------------------------------------
// Athletes the admin knows won't attend (injury, retirement, not selected…).
// Excluded swimmers are dropped from every predicted field, in both the
// automatic EARLY stage and the OFFICIAL entry-list stage.
function ExclusionsAdmin({ champId, onChanged, refreshKey }) {
  const [exclusions, setExclusions] = useState([])
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [swimmer, setSwimmer] = useState(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const load = () => {
    getPredictionExclusions(champId).then((res) => setExclusions(res.data || [])).catch(() => setExclusions([]))
  }
  useEffect(load, [champId, refreshKey])

  useEffect(() => {
    if (!query || query.trim().length < 2 || swimmer) { setResults([]); return }
    const t = setTimeout(() => {
      searchSwimmers(query.trim())
        .then((res) => setResults((Array.isArray(res.data) ? res.data : res.data?.results || []).slice(0, 8)))
        .catch(() => setResults([]))
    }, 250)
    return () => clearTimeout(t)
  }, [query, swimmer])

  const act = async (fn, okMsg) => {
    setBusy(true); setMsg('')
    try {
      await fn()
      load()
      onChanged?.()
      if (okMsg) setMsg(okMsg)
    } catch (e) {
      setMsg(e?.response?.data?.detail || 'Could not save the change. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const add = () => {
    if (!swimmer) { setMsg('Pick a swimmer to exclude'); return }
    act(() => addPredictionExclusion(champId, {
      swimmer: swimmer.id, reason: reason.trim(),
    }), 'Excluded — prediction recomputed').then(() => { setSwimmer(null); setQuery(''); setReason('') })
  }

  const inputStyle = { padding: '8px 10px', border: '1px solid var(--color-neutral-300)', fontSize: 13, background: '#fff' }

  return (
    <div style={{ marginTop: 30, border: '1px solid var(--color-divider)', background: 'var(--color-surface)', padding: '16px 16px' }}>
      <SectHead title="Excluded Athletes (Admin)" />
      <div className="micro" style={{ margin: '-4px 0 12px', textTransform: 'none', letterSpacing: 0 }}>
        Athletes you know won't compete (injury, retirement, not selected…). They are removed from
        every event of this meet's prediction. Adding or removing recomputes instantly.
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: exclusions.length ? 12 : 0 }}>
        <div style={{ position: 'relative' }}>
          <input
            type="search" aria-label="Search swimmer to exclude"
            style={{ ...inputStyle, minWidth: 220, appearance: 'none', WebkitAppearance: 'none' }}
            placeholder="Search swimmer to exclude…"
            value={swimmer ? swimmer.name : query}
            onChange={(e) => { setSwimmer(null); setQuery(e.target.value) }}
          />
          {results.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, background: '#fff', border: '1px solid var(--color-neutral-300)', maxHeight: 220, overflowY: 'auto' }}>
              {results.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => { setSwimmer(s); setResults([]) }}
                  style={{ display: 'block', width: '100%', minHeight: 40, textAlign: 'left', font: 'inherit', color: 'inherit', background: 'none', border: 'none', padding: '8px 10px', fontSize: 13, cursor: 'pointer', borderBottom: '1px solid var(--color-divider)' }}
                >
                  {s.name} {s.nationality_code ? `(${s.nationality_code})` : ''}
                </button>
              ))}
            </div>
          )}
        </div>
        <input
          aria-label="Reason (optional)"
          style={{ ...inputStyle, width: 200 }}
          placeholder="Reason (optional)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <button type="button" className="btn btn-primary" disabled={busy} onClick={add}>{busy ? 'Saving…' : 'Exclude athlete'}</button>
        {msg && <span role="status" className="micro" style={{ textTransform: 'none', letterSpacing: 0 }}>{msg}</span>}
      </div>
      {exclusions.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {exclusions.map((x) => (
            <span key={x.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, border: '1px solid var(--color-neutral-300)', background: '#fff', padding: '4px 10px', fontSize: 13 }}>
              <b>{x.swimmer_name}</b>
              {x.nationality_code && <span className="micro" style={{ textTransform: 'none', letterSpacing: 0 }}>{x.nationality_code}</span>}
              {x.reason && <span className="micro" style={{ textTransform: 'none', letterSpacing: 0 }}>— {x.reason}</span>}
              <button
                type="button"
                disabled={busy}
                title={`Restore ${x.swimmer_name}`}
                onClick={() => act(() => removePredictionExclusion(champId, x.id), 'Restored — prediction recomputed')}
                style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0, color: 'var(--color-neutral-700)', minWidth: 40, minHeight: 40, margin: '-7px -9px -7px -5px' /* Fitts's Law: 32px target, chip size unchanged */ }}
                aria-label={`Restore ${x.swimmer_name}`}
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
    if (!query || query.trim().length < 2 || swimmer) { setResults([]); return }
    const t = setTimeout(() => {
      searchSwimmers(query.trim())
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
      setMsg(e?.response?.data?.detail || 'Could not save the change. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const add = () => {
    if (!swimmer || !eventId) { setMsg('Pick a swimmer and an event'); return }
    const cs = entryTime.trim() ? parseTime(entryTime.trim()) : null
    if (entryTime.trim() && !cs) { setMsg('Entry time must look like 27.45 or 1:02.34'); return }
    act(() => addPredictionEntry(champId, {
      swimmer: swimmer.id, event: Number(eventId),
      ...(cs ? { entry_time_cs: cs } : {}),
    }), 'Entry added').then(() => { setSwimmer(null); setQuery(''); setEntryTime('') })
  }

  const inputStyle = { padding: '8px 10px', border: '1px solid var(--color-neutral-300)', fontSize: 13, background: '#fff' }

  return (
    <div style={{ marginTop: 30, border: '1px solid var(--color-divider)', background: 'var(--color-surface)', padding: '16px 16px' }}>
      <SectHead title="Entry List (Admin)" />
      <div className="micro" style={{ margin: '-4px 0 12px' }}>
        Stage: <b>{stage}</b> — adding official entries upgrades the prediction to Official / High confidence after recompute.
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ position: 'relative' }}>
          <input
            type="search" aria-label="Search swimmer"
            style={{ ...inputStyle, minWidth: 220, appearance: 'none', WebkitAppearance: 'none' }}
            placeholder="Search swimmer…"
            value={swimmer ? swimmer.name : query}
            onChange={(e) => { setSwimmer(null); setQuery(e.target.value) }}
          />
          {results.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, background: '#fff', border: '1px solid var(--color-neutral-300)', maxHeight: 220, overflowY: 'auto' }}>
              {results.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => { setSwimmer(s); setResults([]) }}
                  style={{ display: 'block', width: '100%', minHeight: 40, textAlign: 'left', font: 'inherit', color: 'inherit', background: 'none', border: 'none', padding: '8px 10px', fontSize: 13, cursor: 'pointer', borderBottom: '1px solid var(--color-divider)' }}
                >
                  {s.name} {s.nationality_code ? `(${s.nationality_code})` : ''}
                </button>
              ))}
            </div>
          )}
        </div>
        <select aria-label="Event" style={inputStyle} value={eventId} onChange={(e) => setEventId(e.target.value)}>
          <option value="">Event…</option>
          {events
            .filter((e, i, arr) => arr.findIndex((x) => x.event_id === e.event_id && x.gender === e.gender) === i)
            .map((e) => (
              <option key={`${e.event_id}-${e.gender}`} value={e.event_id}>
                {e.event} ({e.gender === 'M' ? "Men's" : "Women's"})
              </option>
            ))}
        </select>
        <input
          aria-label="Entry time"
          style={{ ...inputStyle, width: 110 }}
          placeholder="Entry time"
          value={entryTime}
          onChange={(e) => setEntryTime(e.target.value)}
        />
        <button type="button" className="btn btn-primary" disabled={busy} onClick={add}>{busy ? 'Saving…' : 'Add entry'}</button>
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
      {msg && <div role="status" className="micro" style={{ marginBottom: 10 }}>{msg}</div>}

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
                  <td>{en.event_name} ({en.gender === 'M' ? "Men's" : "Women's"})</td>
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
                      onClick={() => { if (window.confirm(`Delete the entry for ${en.swimmer_name} in ${en.event_name}?`)) act(() => deletePredictionEntry(champId, en.id), 'Entry deleted') }}
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
// Hero band, projection overview, podium of candidates, events as cards and an
// independent right rail. All layout lives in audit-predictions.css (pd-*).

// One number rule for the whole page: expected medals carry one decimal,
// chances are whole percents (never "0%" for a real chance, never "100%" for a near-certainty).
const fmtMedals = (v) => (Number(v) || 0).toFixed(1)
const fmtPct = (v) => {
  const n = Number(v) || 0
  if (n > 0 && n < 0.5) return '<1%'
  if (n >= 99.5 && n < 100) return '>99%'
  return `${Math.round(n)}%`
}
const genderWord = (g) => (g === 'M' ? 'Men' : g === 'F' ? 'Women' : 'Mixed')
// "200 M Freestyle" → "200 Freestyle"
const eventTitle = (name) => String(name || '').replace(/\s*M\s+/, ' ')

// Law of Similarity: one token per tier, used by the legend and by every chance bar.
// Thresholds mirror backend/predictions/engine.py (medal_status / gold_status).
const TIER_LEGEND = [
  { key: 'gold', label: 'Gold Favorite', range: '50%+ for gold', fill: 100 },
  { key: 'fav', label: 'Medal Favorite', range: '80% or more', fill: 100 },
  { key: 'strong', label: 'Strong Medal Chance', range: '65 – 79%', fill: 80 },
  { key: 'cont', label: 'Medal Contender', range: '45 – 64%', fill: 60 },
  { key: 'chal', label: 'Podium Challenger', range: '25 – 44%', fill: 40 },
  { key: 'out', label: 'Outside Chance', range: '10 – 24%', fill: 20 },
]
function tierKey(pMedal, pGold) {
  if (pGold >= 50) return 'gold'
  if (pMedal >= 80) return 'fav'
  if (pMedal >= 65) return 'strong'
  if (pMedal >= 45) return 'cont'
  if (pMedal >= 25) return 'chal'
  return 'out'
}

const STROKE_CHIPS = ['All', 'Freestyle', 'Backstroke', 'Breaststroke', 'Butterfly', 'Individual Medley']

function ChanceBar({ pMedal, pGold }) {
  return (
    <span className="pd-bar" aria-hidden="true">
      <span className={`pd-tier-${tierKey(pMedal, pGold)}`} style={{ width: `${Math.max(0, Math.min(100, Number(pMedal) || 0))}%` }} />
    </span>
  )
}

// Predicted position: 1/2/3 wear the medal gradient (a predicted gold/silver/bronze place)
function Pos({ n }) {
  return <span className={`pd-pos asw-num${n <= 3 ? ` pd-pos-${n}` : ''}`}>{n}</span>
}

// Photo, or the navy initials tile when there is none (or it fails to load)
function Avatar({ photo, name }) {
  return (
    <span className="pd-avatar">
      <Pic kind="person" w={160} src={photo} alt="" fallback={<span className="pd-initials" aria-hidden="true">{nameInitials(name)}</span>} />
    </span>
  )
}

function StatTile({ tone, label, value, sub }) {
  return (
    <div className={`pd-tile pd-tile-${tone}`}>
      <div className="pd-tile-label">{label}</div>
      <div className="pd-tile-value asw-num">{value}</div>
      <div className="pd-tile-sub asw-num">{sub}</div>
    </div>
  )
}

// One candidate, as a podium card (top three) or a list row (the rest). Both
// share the same parts in the same order, so cards and rows line up.
function Candidate({ c, rank, podium, isNational }) {
  const tier = TIER_LEGEND.find((t) => t.key === tierKey(c.p_medal, c.eg))
  return (
    <li className={podium ? 'pd-pod' : 'pd-cand'}>
      <Pos n={rank} />
      {podium && (
        <span className="pd-tier-tag"><i className={`pd-tier-${tier.key}`} />{tier.label}</span>
      )}
      <Avatar photo={c.photo} name={c.name} />
      <div className="pd-id">
        <Link to={`/swimmers/${c.swimmer_id}`} className="pd-name">{c.name}</Link>
        <div className="pd-sub">
          <Flag code={c.country_code} name={c.country_name} />
          <span>{isNational ? entityName(c.club) : (c.country_name || c.country_code)}</span>
        </div>
      </div>
      <div className="pd-evline">
        {eventTitle(c.event)} · {genderWord(c.gender)}{c.age_group ? ` · ${c.age_group}` : ''}
      </div>
      {podium && <span className="pd-lab">Medal chance</span>}
      <span className="pd-fig asw-num">{fmtPct(c.p_medal)}</span>
      <ChanceBar pMedal={c.p_medal} pGold={c.eg} />
      {podium && (
        <dl className="pd-split">
          {[['Gold', c.eg], ['Silver', c.es], ['Bronze', c.eb]].map(([lab, v]) => (
            <div key={lab}><dt>{lab}</dt><dd className="asw-num">{fmtPct(v)}</dd></div>
          ))}
        </dl>
      )}
    </li>
  )
}

const SHARE_ICONS = {
  whatsapp: ['0 0 16 16', 'M13.601 2.326A7.854 7.854 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.933 7.933 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.898 7.898 0 0 0 13.6 2.326zM7.994 14.521a6.573 6.573 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.557 6.557 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592zm3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.065-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.729.729 0 0 0-.529.247c-.182.198-.691.677-.691 1.654 0 .977.71 1.916.81 2.049.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232z'],
  facebook: ['0 0 16 16', 'M16 8.049c0-4.446-3.582-8.05-8-8.05C3.58 0-.002 3.603-.002 8.05c0 4.017 2.926 7.347 6.75 7.951v-5.625h-2.03V8.05H6.75V6.275c0-2.017 1.195-3.131 3.022-3.131.876 0 1.791.157 1.791.157v1.98h-1.009c-.993 0-1.303.621-1.303 1.258v1.51h2.218l-.354 2.326H9.25V16c3.824-.604 6.75-3.934 6.75-7.951z'],
  x: ['0 0 24 24', 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z'],
  link: ['0 0 16 16', 'M4.715 6.542 3.343 7.914a3 3 0 1 0 4.243 4.243l1.828-1.829A3 3 0 0 0 8.586 5.5L8 6.086a1.002 1.002 0 0 0-.154.199 2 2 0 0 1 .861 3.337L6.88 11.45a2 2 0 1 1-2.83-2.83l.793-.792a4.018 4.018 0 0 1-.128-1.287z M6.586 4.672A3 3 0 0 0 7.414 9.5l.775-.776a2 2 0 0 1-.896-3.346L9.12 3.55a2 2 0 1 1 2.83 2.83l-.793.792c.112.42.155.855.128 1.287l1.372-1.372a3 3 0 1 0-4.243-4.243L6.586 4.672z'],
}
function ShareIcon({ name }) {
  const [box, d] = SHARE_ICONS[name]
  return <svg viewBox={box} width="16" height="16" fill="currentColor" aria-hidden="true" focusable="false"><path d={d} /></svg>
}

function OverviewTab({ snap, onOpenEvent, champId, onChanged }) {
  const champ = snap.championship || {}
  const table = snap.table || []
  const [countryKey, setCountryKey] = useState('')
  const [stroke, setStroke] = useState('All')
  const [gender, setGender] = useState('M')
  const [openKey, setOpenKey] = useState('')
  const [copied, setCopied] = useState(false) // Doherty Threshold: instant feedback on Copy link
  const [coverOk, setCoverOk] = useState(true) // a cover that fails to load takes its frame with it

  // best event per swimmer, with per-medal % of that event
  const candidates = useMemo(() => {
    const map = new Map()
    for (const ev of snap.events || []) {
      for (const r of ev.field || []) {
        const cur = map.get(r.swimmer_id)
        if (!cur || r.p_medal > cur.p_medal) {
          map.set(r.swimmer_id, {
            swimmer_id: r.swimmer_id, name: r.name, photo: r.photo,
            country_code: r.country_code, country_name: r.country_name, club: r.club,
            event: ev.event, age_group: ev.age_group, gender: ev.gender,
            p_medal: r.p_medal, eg: r.p_gold, es: r.p_silver, eb: r.p_bronze,
            status: r.status, gold_status: r.gold_status,
          })
        }
      }
    }
    return [...map.values()].sort((a, b) => (b.p_medal - a.p_medal) || (b.eg - a.eg) || nameTie(a, b)).slice(0, 5)
  }, [snap])

  // Tesler's Law: open on the first named club/country, not on the "no club" bucket
  const selectedCountry = table.find((r) => r.name === countryKey) || table.find((r) => entityName(r.name) === r.name) || table[0]

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
  const entityWord = snap.is_national ? 'Club' : 'Country'
  const hasCover = !!champ.meet_photo && coverOk

  // Chunking: the meet's facts as short labelled items, only the ones the data has
  const facts = [
    ['Dates', formatDateRange(champ.date, champ.end_date)],
    ['Place', champ.location || champ.country],
    ['Pool', champ.pool ? poolWord(champ.pool) : ''],
    ['Events', snap.event_count],
    ['Swimmers', snap.swimmer_count],
  ].filter(([, v]) => v != null && v !== '' && v !== 0)

  return (
    <div>
      {/* hero: a solid navy band; the cover (if any) stays inside its own frame, never under text */}
      <header className={`pd-hero${hasCover ? ' has-cover' : ''}`}>
        <div className="pd-hero-main">
          <div className="pd-hero-kicker">{champ.classification || 'Championship'}</div>
          <h2 className="pd-hero-title">{champ.name}</h2>
          <div className="pd-facts-clip">
            <dl className="pd-facts">
              {facts.map(([k, v]) => (
                <div key={k}><dt>{k}</dt><dd className="asw-num">{v}</dd></div>
              ))}
            </dl>
          </div>
          {snap.stage !== 'OFFICIAL' && (
            <p className="pd-hero-note" role="note">
              Early prediction: entries are not published yet, so fields are estimated from recent results.
            </p>
          )}
          {/* Fitts's Law + Similarity: four equal 40px buttons, icon and label each */}
          <div className="pd-share" role="group" aria-label="Share these predictions">
            <a className="pd-share-btn" href={`https://wa.me/?text=${encodeURIComponent(`${shareText} ${pageUrl}`)}`} target="_blank" rel="noreferrer"><ShareIcon name="whatsapp" />WhatsApp</a>
            <a className="pd-share-btn" href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(pageUrl)}`} target="_blank" rel="noreferrer"><ShareIcon name="facebook" />Facebook</a>
            <a className="pd-share-btn" href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(pageUrl)}`} target="_blank" rel="noreferrer" aria-label="Share on X"><ShareIcon name="x" />X</a>
            <button className="pd-share-btn" type="button" onClick={() => { navigator.clipboard?.writeText(pageUrl); setCopied(true); setTimeout(() => setCopied(false), 2000) }}><ShareIcon name="link" /><span aria-live="polite">{copied ? 'Link copied' : 'Copy link'}</span></button>
          </div>
        </div>
        {hasCover && (
          <div className="pd-hero-cover">
            <Pic kind="meet" w={384} eager src={champ.meet_photo} alt="" onError={() => setCoverOk(false)} style={{ objectFit: 'cover' }} />
          </div>
        )}
      </header>

      {/* Uniform Connectedness: the rail is its own column, so its cards stack with one gap */}
      <div className="pd-layout">
        <div className="pd-main">
          {/* projection overview */}
          <section className="pd-sec">
            <SectHead title="Medal Projection Overview" />
            {selectedCountry ? (
              <div className="pd-ov">
                <div className="pd-ov-pick">
                  <label className="pd-label" htmlFor="pd-entity">{entityWord}</label>
                  {table.length > 1 ? (
                    <select
                      id="pd-entity" className="select pd-select"
                      value={selectedCountry?.name || ''}
                      onChange={(e) => setCountryKey(e.target.value)}
                    >
                      {table.map((r) => <option key={r.name} value={r.name}>{entityName(r.name)}</option>)}
                    </select>
                  ) : (
                    <div id="pd-entity" className="pd-ov-name">{entityName(selectedCountry.name)}</div>
                  )}
                  <div className="pd-hint">Expected medals, averaged over every simulated outcome.</div>
                </div>
                <StatTile tone="total" label="All medals" value={fmtMedals(selectedCountry.total)} sub={`Likely range ${selectedCountry.likely_min} – ${selectedCountry.likely_max}`} />
                <StatTile tone="gold" label="Gold" value={fmtMedals(selectedCountry.gold)} sub="Expected" />
                <StatTile tone="silver" label="Silver" value={fmtMedals(selectedCountry.silver)} sub="Expected" />
                <StatTile tone="bronze" label="Bronze" value={fmtMedals(selectedCountry.bronze)} sub="Expected" />
              </div>
            ) : (
              <Empty label="No projection available yet" hint="Check back after the next prediction update." />
            )}
          </section>

          {/* top candidates: a podium of three, then the rest as an aligned list */}
          <section className="pd-sec">
            <SectHead title="Top Medal Candidates" />
            {candidates.length === 0 ? (
              <Empty label="No candidates yet" hint="Candidates appear once the fields are predicted." />
            ) : (
              <>
                <ol className="pd-pod-list">
                  {candidates.slice(0, 3).map((c, i) => <Candidate key={c.swimmer_id} c={c} rank={i + 1} podium isNational={snap.is_national} />)}
                </ol>
                {candidates.length > 3 && (
                  <ol className="pd-cand-list" start={4}>
                    {candidates.slice(3).map((c, i) => <Candidate key={c.swimmer_id} c={c} rank={i + 4} isNational={snap.is_national} />)}
                  </ol>
                )}
              </>
            )}
          </section>

          {/* by event */}
          <section className="pd-sec">
            <SectHead title="Medal Predictions by Event" />
            {/* Hick's Law: two labelled controls on one baseline, each 40px tall */}
            <div className="pd-filters">
              <div className="pd-field">
                <span className="pd-label" id="pd-stroke-label">Stroke</span>
                <div className="pd-chips" role="group" aria-labelledby="pd-stroke-label">
                  {STROKE_CHIPS.map((s) => (
                    <button
                      key={s} type="button" className="pd-chip" aria-pressed={stroke === s}
                      onClick={() => { setStroke(s); setOpenKey('') }}
                    >
                      {s === 'All' ? 'All events' : s === 'Individual Medley' ? 'IM' : s}
                    </button>
                  ))}
                </div>
              </div>
              <div className="pd-field pd-field-gender">
                <span className="pd-label">Gender</span>
                <Seg
                  options={[{ value: 'M', label: 'Men' }, { value: 'F', label: 'Women' }]}
                  value={gender}
                  onChange={(g) => { setGender(g); setOpenKey('') }}
                />
              </div>
            </div>
            {eventRows.length === 0 ? (
              <Empty label="No events match this filter" hint="Try All events or the other gender." />
            ) : (
              <div className="pd-events">
                {eventRows.map((ev) => {
                  if (!ev.field?.[0]) return null
                  const key = evKey(ev)
                  const open = openKey === key
                  const title = `${eventTitle(ev.event)}${ev.age_group ? ` · ${ev.age_group}` : ''}`
                  return (
                    <section key={key} className="pd-ev">
                      <header className="pd-ev-head">
                        <h5 className="pd-ev-title">{eventTitle(ev.event)}</h5>
                        <span className="pd-tag">{genderWord(ev.gender)}</span>
                        {ev.age_group && <span className="pd-tag">{ev.age_group}</span>}
                      </header>
                      {/* Proportional columns: each is a short, even step from the last */}
                      <div className="pd-ev-table" role="table" aria-label={`${title}, ${genderWord(ev.gender)}: predicted podium`}>
                        <div className="pd-ev-row pd-ev-cols" role="row">
                          <span role="columnheader">Pos</span>
                          <span role="columnheader">Swimmer</span>
                          <span role="columnheader">{entityWord}</span>
                          <span role="columnheader" className="pd-c-seed">Seed</span>
                          <span role="columnheader" className="pd-c-chance">Medal chance</span>
                        </div>
                        {ev.field.slice(0, 3).map((r, i) => (
                          <div className="pd-ev-row" role="row" key={r.swimmer_id}>
                            <span className="pd-c-pos" role="cell"><Pos n={i + 1} /></span>
                            <span className="pd-c-name" role="cell">
                              <Flag code={r.country_code} name={r.country_name} />
                              <Link to={`/swimmers/${r.swimmer_id}`} className="pd-name">{r.name}</Link>
                            </span>
                            <span className="pd-c-club" role="cell">
                              {snap.is_national ? entityName(r.club) : (r.country_name || r.country_code)}
                            </span>
                            <span className="pd-c-seed asw-time" role="cell">{r.seed}</span>
                            <span className="pd-c-bar" role="cell"><ChanceBar pMedal={r.p_medal} pGold={r.p_gold} /></span>
                            <span className="pd-c-pct asw-num" role="cell">{fmtPct(r.p_medal)}</span>
                          </div>
                        ))}
                      </div>
                      <button type="button" className="pd-ev-more" aria-expanded={open} onClick={() => setOpenKey(open ? '' : key)}>
                        {open ? 'Hide the full field' : 'Show the full field'}
                        <span aria-hidden="true">{open ? '▴' : '▾'}</span>
                      </button>
                      {open && (
                        <div className="pd-ev-detail">
                          <EventDetail ev={ev} champId={champId} onChanged={onChanged} />
                        </div>
                      )}
                    </section>
                  )
                })}
              </div>
            )}
          </section>

          {rising.length > 0 && (
            <section className="pd-sec">
              <SectHead title="Biggest Improvements" />
              <ul className="pd-rise">
                {rising.slice(0, 6).map((c, i) => (
                  <li key={`${c.swimmer_id}-${i}`}>
                    <span className="pd-c-name">
                      <Flag code={c.country_code} name={c.country_name} />
                      <Link to={`/swimmers/${c.swimmer_id}`} className="pd-name">{c.name}</Link>
                    </span>
                    <span className="pd-c-club">{eventTitle(c.event)}</span>
                    <span className="pd-rise-delta asw-num">▲ +{c.delta} pts</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="pd-rail">
          <div className="pd-card">
            <div className="kicker pd-card-title">About the prediction</div>
            <dl className="pd-status">
              <div><dt>Stage</dt><dd>{snap.stage === 'OFFICIAL' ? 'Entry list prediction' : 'Early prediction'}</dd></div>
              <div><dt>Confidence</dt><dd>{snap.confidence}</dd></div>
              <div><dt>Updated</dt><dd className="asw-num">{formatDate(snap.updated_at?.slice(0, 10))}</dd></div>
            </dl>
            <p className="pd-card-text">
              Predictions are calculated from current season best times, recent form, progression and
              thousands of simulated race outcomes. They are probabilities, not certainties, and update
              as entry lists, new times and withdrawals come in.
            </p>
          </div>

          <div className="pd-card">
            <div className="kicker pd-card-title">Medal chance status</div>
            {/* Similarity + redundancy: each tier has its own token and its own bar length */}
            <ul className="pd-legend">
              {TIER_LEGEND.map((t) => (
                <li key={t.key}>
                  <span className="pd-bar" aria-hidden="true"><span className={`pd-tier-${t.key}`} style={{ width: `${t.fill}%` }} /></span>
                  <span className="pd-legend-name">{t.label}</span>
                  <span className="pd-legend-range asw-num">{t.range}</span>
                </li>
              ))}
            </ul>
            <p className="pd-card-text pd-card-foot">
              The percentage is the chance of winning any medal. Gold Favorite is the one tier set by the
              chance of gold; below 10% a swimmer is unlikely to medal.
            </p>
          </div>

          <div className="pd-card">
            <div className="kicker pd-card-title">
              {snap.is_national ? 'Projected medal table · clubs' : 'Projected medal table'}
            </div>
            {table.length === 0 ? (
              <Empty label="No projected medal table yet" hint="It appears once the fields are predicted." />
            ) : (
              <table className="pd-mt">
                <thead>
                  <tr>
                    <th scope="col">{entityWord}</th>
                    <th scope="col" className="pd-mt-g" aria-label="Gold">G</th>
                    <th scope="col" className="pd-mt-s" aria-label="Silver">S</th>
                    <th scope="col" className="pd-mt-b" aria-label="Bronze">B</th>
                    <th scope="col">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {table.slice(0, 10).map((r) => (
                    <tr key={r.name}>
                      <td>
                        <span className="pd-mt-name">
                          {r.code && <Flag code={r.code} name={r.name} />}
                          <span>{entityName(r.name)}</span>
                        </span>
                      </td>
                      <td className="asw-num pd-mt-g">{fmtMedals(r.gold)}</td>
                      <td className="asw-num pd-mt-s">{fmtMedals(r.silver)}</td>
                      <td className="asw-num pd-mt-b">{fmtMedals(r.bronze)}</td>
                      <td className="asw-num pd-mt-t">{fmtMedals(r.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="pd-card-text pd-card-foot">Values are expected medals, not guaranteed ones.</p>
          </div>
        </aside>
      </div>
    </div>
  )
}

// ---- Page -----------------------------------------------------------------
export default function Predictions() {
  const { isAdmin } = useAuth()
  const { flag } = useFeatures()
  const [champs, setChamps] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [snap, setSnap] = useState(null)
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [gender, setGender] = useState('M')
  const [eventKey, setEventKey] = useState('')
  const [view, setView] = useState('overview')
  const [listFailed, setListFailed] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [adminOpen, setAdminOpen] = useState(false)
  // Working Memory: the open championship is in the URL (?meet=), so a link or Back lands on it
  const [searchParams, setSearchParams] = useSearchParams()
  const pickChamp = (id) => {
    setSelectedId(id)
    setSearchParams((prev) => { const next = new URLSearchParams(prev); next.set('meet', String(id)); return next }, { replace: true })
  }

  useEffect(() => {
    setLoading(true)
    setListFailed(false)
    getPredictions()
      .then((res) => {
        const list = res.data || []
        setChamps(list)
        const wanted = Number(searchParams.get('meet'))
        if (list.length > 0) setSelectedId((list.find((c) => c.id === wanted) || list[0]).id)
      })
      .catch(() => { setChamps([]); setListFailed(true) })
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey])

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
      <PageHead title="Medal Predictions" />

      {listFailed ? (
        <Empty label="Predictions could not be loaded" hint="Check your connection and try again.">
          <button type="button" className="btn btn-secondary" onClick={() => setReloadKey((k) => k + 1)}>Try again</button>
        </Empty>
      ) : champs.length === 0 ? (
        // Paradox of the Active User: an empty page still leads somewhere
        <Empty label="No upcoming championships to predict yet" hint="Predictions open when an Arab, GCC or national championship is on the calendar.">
          {flag('calendar') && <Link to="/calendar" className="btn btn-secondary" style={{ marginRight: 8 }}>See the calendar</Link>}
          <Link to="/championships" className="btn btn-secondary">Past championships</Link>
        </Empty>
      ) : (
        <>
          {/* championship tab bar */}
          <div className={`rule-b records-filters${champs.length > 6 ? '' : ' at-fade-x'}`} style={{ padding: '10px 32px', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Hick's Law: a handful of meets are buttons; a long season is one list, soonest first */}
            {champs.length > 6 ? (
              <select className="select at-pred-champ" aria-label="Championship" style={{ width: 'auto', maxWidth: '100%' }} value={selectedId || ''} onChange={(e) => pickChamp(Number(e.target.value))}>
                {champs.map((c) => <option key={c.id} value={c.id}>{c.name} · {formatDate(c.date)}</option>)}
              </select>
            ) : champs.map((c) => {
              const active = c.id === selectedId
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => pickChamp(c.id)}
                  aria-pressed={active}
                  title={formatDateRange(c.date, c.end_date)}
                  style={{
                    cursor: 'pointer', whiteSpace: 'nowrap', minHeight: 40, flex: 'none',
                    fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 13,
                    padding: '8px 13px', lineHeight: 1,
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
            <Empty label="This prediction could not be loaded" hint="Try again, or pick another championship above.">
              <button type="button" className="btn btn-secondary" onClick={() => loadDetail(selectedId)}>Try again</button>
            </Empty>
          ) : (
            <div className="pd-body">
              {/* header: dates + stage + confidence + updated
                  (Overview has its own hero card with all of this) */}
              {view !== 'overview' && (
              <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
                <span className="kicker">
                  {formatDateRange(champ?.date, champ?.end_date)}
                  {champ?.country ? ` · ${champ.country}` : ''}
                  {champ?.pool ? ` · ${poolWord(champ.pool)}` : ''}
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
              {/* the Overview hero carries this notice itself, as one quiet line */}
              {view !== 'overview' && snap.stage !== 'OFFICIAL' && (
                <div className="pd-notice" role="note">
                  Early prediction: entries are not published yet, so fields are estimated from recent results.
                </div>
              )}
              <div className="pd-view">
                <Seg
                  options={[
                    { value: 'overview', label: 'Overview' },
                    { value: 'original', label: 'Full breakdown' },
                  ]}
                  value={view}
                  onChange={setView}
                />
              </div>

              {view === 'overview' && <OverviewTab snap={snap} champId={selectedId} onChanged={() => loadDetail(selectedId)} />}

              {view === 'original' && (
              <>
              <Section title="Top Gold Candidates" items={sections.top_gold} />
              <Section title="Strongest Medal Chances" items={sections.strongest} />
              <Section title="Podium Challengers" items={sections.challengers} sub="Within reach of the podium — a strong swim changes everything" />
              <Section title="Rising Medal Chances" items={sections.rising} sub="Biggest gains since the previous prediction update" showDelta />

              <TallyTable table={snap.table} isNational={snap.is_national} />

              {/* medal chances by event */}
              <div style={{ marginBottom: 26 }}>
                <SectHead title="Medal Chances by Event" />
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', margin: '4px 0 12px' }}>
                  <Seg
                    options={[{ value: 'M', label: 'Men' }, { value: 'F', label: 'Women' }]}
                    value={gender}
                    onChange={(g) => { setGender(g); setEventKey('') }}
                  />
                  <select
                    className="select pd-select pd-select-inline"
                    aria-label="Event"
                    value={selectedEvent ? evKey(selectedEvent) : ''}
                    onChange={(e) => setEventKey(e.target.value)}
                  >
                    {genderEvents.map((e) => (
                      <option key={evKey(e)} value={evKey(e)}>
                        {e.event}{e.age_group ? ` · ${e.age_group}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                {selectedEvent ? <EventDetail ev={selectedEvent} champId={selectedId} onChanged={() => loadDetail(selectedId)} /> : <Empty label="No events predicted for this selection" hint="Try the other gender." />}
              </div>
              </>
              )}

              {/* the Overview already carries this note in "About the prediction" */}
              {view !== 'overview' && (
                <div className="micro" style={{ borderTop: '1px solid var(--color-divider)', paddingTop: 12, marginTop: 20 }}>
                  These are probabilities, not certainties. Predictions are simulated from recent verified results
                  and update as entry lists, new times and withdrawals come in.
                </div>
              )}

              {/* Cognitive Load: three admin panels stay folded until needed */}
              {isAdmin && (
                <div style={{ borderTop: '2px solid var(--color-text)', marginTop: 28, paddingTop: 12 }}>
                  <button type="button" className="btn btn-secondary" aria-expanded={adminOpen} onClick={() => setAdminOpen((o) => !o)}>
                    {adminOpen ? 'Hide admin tools ↑' : 'Admin tools: exclusions, age categories, entries ↓'}
                  </button>
                </div>
              )}
              {isAdmin && adminOpen && (
                <>
                  <ExclusionsAdmin champId={selectedId} onChanged={() => loadDetail(selectedId)} refreshKey={snap?.updated_at} />
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
