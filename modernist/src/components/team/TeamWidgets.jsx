/* Club / academy profile widgets (TeamDetail): adaptive logo badge, the
   medals-by-meet dropdown, the Squad Depth tab and the Records tab.
   Colours come from theme.css tokens only. */

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../../api/client'
import Flag from '../Flag'
import { Loading, Empty, Seg, MedalIcon } from '../ui'
import { formatDate, formatTime, mediaUrl } from '../../utils'

const INK = 'var(--color-accent-800)'
const MUTED = 'var(--color-neutral-700)'
const SOFT = 'var(--color-neutral-600)'
const LINE = 'var(--color-neutral-300)'
const HEAD = 'var(--font-heading)'

export function acronym(name) {
  const words = String(name || '').split(/\s+/).filter(Boolean)
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase()
  return words.slice(0, 3).map((w) => w[0]).join('').toUpperCase()
}

const Chevron = ({ open, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    style={{ flex: 'none', transition: 'transform .18s ease', transform: open ? 'rotate(180deg)' : 'none' }}>
    <path d="m6 9 6 6 6-6" />
  </svg>
)

/* ── Logo badge ───────────────────────────────────────────────
   Club logos arrive in every shape: transparent marks, wordmarks on a
   solid square, photos. The badge reads the artwork's own corner colour:
   a solid-background logo fills the whole circle with that colour (no
   boxed square floating in a white disc); a transparent mark sits on
   white with breathing room. */
export function ClubLogo({ src, name, size = 148, ring = 'var(--color-accent-900)' }) {
  const [fit, setFit] = useState({ bg: '#fff', scale: 0.8 })
  const url = src ? mediaUrl(src) : null

  useEffect(() => {
    if (!url) return undefined
    let alive = true
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const c = document.createElement('canvas')
        const w = (c.width = img.naturalWidth), h = (c.height = img.naturalHeight)
        const ctx = c.getContext('2d')
        ctx.drawImage(img, 0, 0)
        const pts = [[1, 1], [w - 2, 1], [1, h - 2], [w - 2, h - 2]].map(([x, y]) => ctx.getImageData(x, y, 1, 1).data)
        const opaque = pts.every((p) => p[3] > 250)
        const same = pts.every((p) => Math.abs(p[0] - pts[0][0]) + Math.abs(p[1] - pts[0][1]) + Math.abs(p[2] - pts[0][2]) < 36)
        if (!alive) return
        if (opaque && same) {
          const [r, g, b] = pts[0]
          // solid backdrop → flood the circle with it; a square canvas is
          // inscribed so its corners (same colour) are the only thing clipped
          setFit({ bg: `rgb(${r}, ${g}, ${b})`, scale: w / h > 1.25 || h / w > 1.25 ? 0.86 : 1 })
        } else {
          setFit({ bg: '#fff', scale: 0.78 })
        }
      } catch {
        /* canvas tainted (no CORS) → keep the neutral default */
      }
    }
    img.src = url
    return () => { alive = false }
  }, [url])

  return (
    <div className="fed-hero-flag" style={{
      width: size, height: size, borderRadius: '50%', background: url ? fit.bg : '#fff', flexShrink: 0,
      border: `4px solid ${ring}`, boxShadow: '0 0 0 6px #fff, 0 6px 24px color-mix(in srgb, var(--color-accent-900) 18%, transparent)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    }}>
      {url ? (
        <img src={url} alt={name} style={{ width: `${fit.scale * 100}%`, height: `${fit.scale * 100}%`, objectFit: 'contain', display: 'block' }} />
      ) : (
        <span style={{ fontFamily: HEAD, fontWeight: 900, fontSize: size * 0.23, color: INK }}>{acronym(name)}</span>
      )}
    </div>
  )
}

/* ── Medals: one swimmer's medals, grouped by meet ────────────
   Level 1 lists the meets (date, place, G/S/B); opening a meet shows
   every medal there with its event, age group, round and time. */
export function SwimmerMedalsByMeet({ medals }) {
  const meets = useMemo(() => {
    const by = new Map()
    medals.forEach((m) => {
      const k = m.championship_id ?? `${m.championship_name}|${m.championship_date}`
      if (!by.has(k)) {
        by.set(k, {
          key: k, id: m.championship_id, name: m.championship_name, date: m.championship_date,
          place: [m.championship_location, m.championship_country].filter(Boolean).join(', '),
          pool: m.championship_pool, gold: 0, silver: 0, bronze: 0, items: [],
        })
      }
      const g = by.get(k)
      g[m.medal_type === 'GOLD' ? 'gold' : m.medal_type === 'SILVER' ? 'silver' : 'bronze']++
      g.items.push(m)
    })
    const order = { GOLD: 0, SILVER: 1, BRONZE: 2 }
    const out = [...by.values()].sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    out.forEach((g) => g.items.sort((a, b) => order[a.medal_type] - order[b.medal_type] || (a.event_name || '').localeCompare(b.event_name || '')))
    return out
  }, [medals])
  // a single meet opens straight away — nothing to choose between
  const [open, setOpen] = useState(() => (meets.length === 1 ? meets[0].key : null))

  if (!meets.length) return null
  return (
    <div style={{ padding: '10px 14px 14px', display: 'grid', gap: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: SOFT, padding: '2px 2px 0' }}>
        {meets.length} {meets.length === 1 ? 'meet' : 'meets'} · choose one to see the medals
      </div>
      {meets.map((g) => {
        const isOpen = open === g.key
        return (
          <div key={g.key} style={{ border: `1px solid ${isOpen ? 'var(--color-accent-400)' : LINE}`, borderRadius: 10, background: '#fff', overflow: 'hidden' }}>
            <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : g.key)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', minHeight: 48, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', color: INK }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontWeight: 800, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name || 'Meet'}</span>
                <span style={{ display: 'block', fontSize: 12, color: MUTED, marginTop: 2 }}>
                  {[formatDate(g.date), g.place, g.pool].filter(Boolean).join(' · ')}
                </span>
              </span>
              <span className="asw-num" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontSize: 12.5, fontWeight: 800, flex: 'none' }}>
                {[['GOLD', g.gold], ['SILVER', g.silver], ['BRONZE', g.bronze]].filter(([, n]) => n > 0).map(([t, n]) => (
                  <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><MedalIcon type={t} size={15} />{n}</span>
                ))}
              </span>
              <Chevron open={isOpen} />
            </button>
            {isOpen && (
              <div style={{ borderTop: `1px solid ${LINE}`, background: 'var(--color-neutral-100)' }}>
                {g.items.map((m, i) => (
                  <div key={m.id ?? i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderTop: i ? `1px solid ${LINE}` : 'none' }}>
                    <MedalIcon type={m.medal_type} size={20} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontWeight: 700, fontSize: 13.5, color: INK }}>{m.event_name || '—'}</span>
                      <span style={{ display: 'block', fontSize: 11.5, color: MUTED, marginTop: 1 }}>
                        {[m.category, m.round_type, m.is_relay ? 'Relay' : null].filter(Boolean).join(' · ') || ' '}
                      </span>
                    </span>
                    {m.fina_points ? <span className="asw-num" style={{ fontSize: 11.5, fontWeight: 700, color: MUTED, flex: 'none' }}>{m.fina_points} pts</span> : null}
                    <span className="asw-num asw-time" style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 15, color: INK, flex: 'none', minWidth: 64, textAlign: 'right' }}>{m.time || '—'}</span>
                  </div>
                ))}
                {g.id ? (
                  <div style={{ padding: '9px 14px', borderTop: `1px solid ${LINE}`, textAlign: 'right' }}>
                    <Link to={`/championships/${g.id}`} onClick={(e) => e.stopPropagation()} style={{ fontSize: 12, fontWeight: 700, color: INK, textDecoration: 'none' }}>Open meet results →</Link>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ── Squad Depth ──────────────────────────────────────────────
   Answers the questions a head coach asks of a roster: which events are
   covered, how many swimmers stand behind the #1, how big the drop-off
   is, and where the gaps are. */
const STROKES = [
  ['Freestyle', 'Free'], ['Backstroke', 'Back'], ['Breaststroke', 'Breast'], ['Butterfly', 'Fly'], ['Medley', 'IM'],
]
const DISTANCES = [50, 100, 200, 400, 800, 1500]
const VALID = {
  Freestyle: [50, 100, 200, 400, 800, 1500], Backstroke: [50, 100, 200], Breaststroke: [50, 100, 200],
  Butterfly: [50, 100, 200], Medley: [200, 400],
}
const strokeKey = (s) => {
  const v = String(s || '').toLowerCase()
  if (v.includes('medley') || v === 'im') return 'Medley'
  if (v.includes('free')) return 'Freestyle'
  if (v.includes('back')) return 'Backstroke'
  if (v.includes('breast')) return 'Breaststroke'
  if (v.includes('fly')) return 'Butterfly'
  return s
}
const depthLevel = (n) => (n >= 8 ? ['Deep', 'var(--asw-fast)'] : n >= 4 ? ['Solid', 'var(--color-accent-500)'] : n >= 2 ? ['Thin', 'var(--asw-gold)'] : ['Single', 'var(--asw-slow)'])
const gapStr = (cs) => (cs <= 0 ? '' : `+${cs >= 6000 ? formatTime(cs) : (cs / 100).toFixed(2)}`)

export function DepthTab({ id, kind = 'club' }) {
  const [pool, setPool] = useState(null) // decided once both pools are known
  const [gender, setGender] = useState('')
  const [data, setData] = useState(null) // { LCM: [], SCM: [] }
  const [focus, setFocus] = useState(null)

  useEffect(() => {
    let alive = true
    setData(null)
    const q = (p) => api.get(`/teams/${id}/depth/`, { params: { pool: p, ...(gender ? { gender } : {}) } })
      .then((r) => (Array.isArray(r.data) ? r.data : [])).catch(() => [])
    Promise.all([q('LCM'), q('SCM')]).then(([LCM, SCM]) => {
      if (!alive) return
      setData({ LCM, SCM })
      // land on the pool the squad actually races in most
      const entries = (rows) => rows.reduce((n, e) => n + e.swimmer_count, 0)
      setPool((cur) => cur || (entries(SCM) > entries(LCM) ? 'SCM' : 'LCM'))
    })
    return () => { alive = false }
  }, [id, gender])

  const rows = data && pool ? data[pool] : null
  const summary = useMemo(() => {
    if (!rows) return null
    const cell = {}
    rows.forEach((e) => { cell[`${strokeKey(e.stroke)}|${e.distance}`] = e })
    const programme = Object.entries(VALID).flatMap(([s, ds]) => ds.map((d) => `${s}|${d}`))
    const covered = programme.filter((k) => cell[k]).length
    const deepest = [...rows].sort((a, b) => b.swimmer_count - a.swimmer_count)[0]
    const thin = rows.filter((e) => e.swimmer_count <= 1).length + (programme.length - covered)
    const avg = rows.length ? rows.reduce((n, e) => n + e.swimmer_count, 0) / rows.length : 0
    const max = Math.max(1, ...rows.map((e) => e.swimmer_count))
    return { cell, programme: programme.length, covered, deepest, thin, avg, max }
  }, [rows])

  const tile = (label, value, sub) => (
    <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderTop: '3px solid var(--color-box-top)', borderRadius: 10, padding: '14px 16px', minWidth: 0 }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: SOFT }}>{label}</div>
      <div className="asw-num" style={{ fontFamily: HEAD, fontWeight: 900, fontSize: 26, color: INK, lineHeight: 1.15, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
      <div style={{ fontSize: 12, color: MUTED, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</div>
    </div>
  )

  return (
    <div className="pad-lg" style={{ background: 'var(--color-neutral-100)' }}>
      <div style={{ textAlign: 'center', marginBottom: 6 }}>
        <h2 style={{ fontFamily: HEAD, fontWeight: 900, fontSize: 24, letterSpacing: '0.1em', textTransform: 'uppercase', color: INK, margin: 0 }}>Squad Depth</h2>
        <div style={{ fontSize: 13, color: MUTED, marginTop: 6 }}>
          How many swimmers stand behind the fastest in every event, and where the {kind} has gaps
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', margin: '16px 0 20px' }}>
        <Seg options={[{ value: 'LCM', label: `LCM · 50m${data ? ` (${data.LCM.length})` : ''}` }, { value: 'SCM', label: `SCM · 25m${data ? ` (${data.SCM.length})` : ''}` }]} value={pool || 'LCM'} onChange={(v) => { setPool(v); setFocus(null) }} />
        <Seg options={[{ value: '', label: 'All' }, { value: 'M', label: 'Men' }, { value: 'F', label: 'Women' }]} value={gender} onChange={(v) => { setGender(v); setFocus(null) }} />
      </div>

      {!rows ? <Loading label="Loading squad depth" /> : rows.length === 0 ? <Empty label="No times for this selection" /> : (<>
        {/* Headline numbers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 16 }}>
          {tile('Events covered', `${summary.covered} / ${summary.programme}`, 'of the individual programme')}
          {tile('Deepest event', summary.deepest.swimmer_count, summary.deepest.event_name)}
          {tile('Average depth', summary.avg.toFixed(1), 'swimmers per covered event')}
          {tile('Thin spots', summary.thin, 'events with one swimmer or none')}
        </div>

        {/* Depth map: stroke × distance */}
        <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 12, padding: '16px 16px 14px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
            <div style={{ fontFamily: HEAD, fontWeight: 900, fontSize: 13, letterSpacing: '0.06em', textTransform: 'uppercase', color: INK }}>Depth map</div>
            <div style={{ fontSize: 12, color: MUTED }}>Swimmers with a time in each event · tap a cell to jump to it</div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: `76px repeat(${DISTANCES.length}, minmax(64px, 1fr))`, gap: 6, minWidth: 520 }}>
              <span />
              {DISTANCES.map((d) => <span key={d} className="asw-num" style={{ fontSize: 11.5, fontWeight: 800, color: SOFT, textAlign: 'center' }}>{d}m</span>)}
              {STROKES.map(([s, short]) => (
                [<span key={`${s}-l`} style={{ fontSize: 12.5, fontWeight: 800, color: INK, alignSelf: 'center' }}>{short}</span>,
                  ...DISTANCES.map((d) => {
                    const valid = VALID[s].includes(d)
                    const e = summary.cell[`${s}|${d}`]
                    if (!valid && !e) return <span key={`${s}-${d}`} />
                    if (!e) {
                      return (
                        <span key={`${s}-${d}`} title="No swimmer with a time" style={{ height: 44, borderRadius: 8, border: `1.5px dashed ${LINE}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: SOFT }}>Gap</span>
                      )
                    }
                    const pct = 14 + Math.round((e.swimmer_count / summary.max) * 78)
                    const sel = focus === e.event_id
                    return (
                      <button key={`${s}-${d}`} type="button" title={`${e.event_name}: ${e.swimmer_count} swimmers`}
                        onClick={() => { setFocus(e.event_id); document.getElementById(`depth-ev-${e.event_id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }}
                        className="asw-num"
                        style={{ height: 44, borderRadius: 8, cursor: 'pointer', fontFamily: HEAD, fontWeight: 900, fontSize: 16,
                          border: sel ? `2px solid ${INK}` : '1px solid transparent',
                          background: `color-mix(in srgb, var(--color-accent-500) ${pct}%, #fff)`,
                          color: pct > 55 ? '#fff' : INK }}>
                        {e.swimmer_count}
                      </button>
                    )
                  })]
              ))}
            </div>
          </div>
        </div>

        {/* Event by event */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 12 }}>
          {rows.map((e) => {
            const [label, tone] = depthLevel(e.swimmer_count)
            const lead = e.top[0]?.time_cs || 0
            return (
              <div key={e.event_id} id={`depth-ev-${e.event_id}`} style={{ background: '#fff', border: `1px solid ${focus === e.event_id ? INK : LINE}`, borderRadius: 12, padding: '14px 16px', boxShadow: focus === e.event_id ? '0 0 0 3px var(--color-accent-200)' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 15, color: INK, flex: 1, minWidth: 0 }}>{e.event_name}</span>
                  <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: tone }}>{label}</span>
                  <span className="asw-num" style={{ fontSize: 12.5, fontWeight: 800, color: INK }}>{e.swimmer_count} {e.swimmer_count === 1 ? 'swimmer' : 'swimmers'}</span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: 'var(--color-neutral-200)', margin: '10px 0 8px', overflow: 'hidden' }}>
                  <div style={{ width: `${Math.max((e.swimmer_count / summary.max) * 100, 4)}%`, height: '100%', background: tone, borderRadius: 3 }} />
                </div>
                {e.top.map((s, i) => (
                  <div key={s.swimmer_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderTop: i ? `1px solid var(--color-neutral-200)` : 'none', fontSize: 13 }}>
                    <span className="asw-num" style={{ width: 16, fontWeight: 800, color: SOFT, flex: 'none' }}>{i + 1}</span>
                    <Link to={`/swimmers/${s.swimmer_id}`} style={{ flex: 1, minWidth: 0, color: INK, fontWeight: 600, textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</Link>
                    <span className="asw-num" style={{ width: 58, textAlign: 'right', fontSize: 11.5, color: MUTED, flex: 'none' }}>{i ? gapStr(s.time_cs - lead) : (s.fina_points ? `${s.fina_points} pts` : '')}</span>
                    <span className="asw-num asw-time" style={{ width: 66, textAlign: 'right', fontWeight: 800, color: INK, flex: 'none' }}>{s.time}</span>
                  </div>
                ))}
                {e.swimmer_count > e.top.length && (
                  <div style={{ fontSize: 11.5, color: SOFT, paddingTop: 6 }}>+ {e.swimmer_count - e.top.length} more with a time</div>
                )}
              </div>
            )
          })}
        </div>
      </>)}
    </div>
  )
}

/* ── Records ──────────────────────────────────────────────────
   Every card carries the same five facts in the same order — event · pool,
   time, whose record it is (nation / region + age group + gender), date and
   meet — so no card reads differently from its neighbour. */
const AGE_ORDER = ['OPEN', 'U18', 'U17', 'U16', 'U15', 'U14', 'U13', 'U12', 'U11', 'U10']
const ageLabel = (a) => (!a || a === 'OPEN' ? 'Open' : a)

export function RecordsTab({ records, photoById, sexById, typeOrder, typeLabels, typeColors, kind = 'club' }) {
  const [gender, setGender] = useState('')
  const [pool, setPool] = useState('')
  const [age, setAge] = useState('')
  const typesPresent = typeOrder.filter((t) => records.some((r) => r.record_type === t))
  const [recType, setRecType] = useState('NATIONAL')
  const activeType = typesPresent.includes(recType) ? recType : (typesPresent[0] || 'NATIONAL')

  const sexOf = (r) => r.sex || sexById[r.swimmer_id] || ''
  const ofType = records.filter((r) => r.record_type === activeType)
  const agesPresent = AGE_ORDER.filter((a) => ofType.some((r) => (r.age_category || 'OPEN') === a))
  const filtered = ofType.filter((r) => (
    (!gender || sexOf(r) === gender) && (!pool || r.pool === pool) && (!age || (r.age_category || 'OPEN') === age)
  ))
  const withPhotos = filtered.some((r) => r.photo || photoById[r.swimmer_id])

  const chip = { fontSize: 11, fontWeight: 800, letterSpacing: '0.04em', padding: '3px 8px', borderRadius: 6, background: 'var(--color-accent-100)', color: INK, whiteSpace: 'nowrap' }
  const pillBase = { padding: '9px 18px', minHeight: 40, borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }

  return (
    <div className="m-pad" style={{ padding: '28px 28px 36px', background: 'var(--color-neutral-100)' }}>
      <div style={{ textAlign: 'center', marginBottom: 18 }}>
        <h2 style={{ fontFamily: HEAD, fontWeight: 900, fontSize: 24, letterSpacing: '0.1em', textTransform: 'uppercase', color: INK, margin: 0 }}>Records</h2>
        <div style={{ fontSize: 13, color: MUTED, marginTop: 6 }}>Records currently held by swimmers of this {kind}</div>
      </div>

      {records.length === 0 ? <Empty label={`No records held by this ${kind}`} /> : (<>
        {typesPresent.length > 1 && (
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
            {typesPresent.map((t) => {
              const n = records.filter((r) => r.record_type === t).length
              const on = activeType === t
              return (
                <button key={t} type="button" onClick={() => { setRecType(t); setAge('') }} aria-pressed={on}
                  style={{ ...pillBase, border: `2px solid ${typeColors[t]}`, background: on ? typeColors[t] : '#fff', color: on ? '#fff' : typeColors[t] }}>
                  {typeLabels[t]} Records <span className="asw-num" style={{ opacity: 0.85 }}>· {n}</span>
                </button>
              )
            })}
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
          <Seg options={[{ value: '', label: 'All' }, { value: 'M', label: 'Men' }, { value: 'F', label: 'Women' }]} value={gender} onChange={setGender} />
          <Seg options={[{ value: '', label: 'Both pools' }, { value: 'LCM', label: 'LCM · 50m' }, { value: 'SCM', label: 'SCM · 25m' }]} value={pool} onChange={setPool} />
          {agesPresent.length > 1 && (
            <Seg options={[{ value: '', label: 'All ages' }, ...agesPresent.map((a) => ({ value: a, label: ageLabel(a) }))]} value={age} onChange={setAge} />
          )}
        </div>
        <div className="asw-num" style={{ textAlign: 'center', fontSize: 12.5, color: MUTED, marginBottom: 18 }}>
          {filtered.length} {filtered.length === 1 ? 'record' : 'records'}
        </div>

        {filtered.length === 0 ? <Empty label="No records for this selection" /> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 14 }}>
            {filtered.map((r, i) => {
              const photo = r.photo || photoById[r.swimmer_id]
              const sex = sexOf(r)
              const scope = activeType === 'NATIONAL' && r.country_name ? `${r.country_name} National` : typeLabels[activeType]
              return (
                <div key={r.id ?? i} style={{ borderRadius: 14, background: '#fff', border: `1px solid ${LINE}`, borderTop: `3px solid ${typeColors[activeType]}`, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {withPhotos && (
                    <div style={{ width: '100%', aspectRatio: '4 / 3', borderRadius: 10, overflow: 'hidden', background: 'var(--color-neutral-200)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {photo
                        ? <img src={mediaUrl(photo)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} />
                        : <span style={{ fontFamily: HEAD, fontWeight: 900, fontSize: 30, color: SOFT }}>{acronym(r.swimmer_name)}</span>}
                    </div>
                  )}
                  {/* 1 · event + pool */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 14.5, color: INK, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.event_name}</span>
                    <span className="asw-num" style={chip}>{r.pool}</span>
                  </div>
                  {/* 2 · time */}
                  <div className="asw-num asw-time" style={{ fontFamily: HEAD, fontWeight: 900, fontSize: 32, color: INK, letterSpacing: '-0.02em', lineHeight: 1 }}>
                    {typeof r.time === 'number' ? formatTime(r.time) : r.time}
                  </div>
                  {/* 3 · holder */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0, minHeight: 20 }}>
                    {r.country_code ? <Flag code={r.country_code} name={r.country_name} /> : null}
                    {r.swimmer_id
                      ? <Link to={`/swimmers/${r.swimmer_id}`} style={{ fontWeight: 700, fontSize: 14, color: INK, textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.swimmer_name}</Link>
                      : <span style={{ fontWeight: 700, fontSize: 14, color: INK }}>{r.swimmer_name}</span>}
                  </div>
                  {/* 4 · whose record */}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <span style={chip}>{scope}</span>
                    <span style={chip}>{ageLabel(r.age_category)}</span>
                    {sex ? <span style={chip}>{sex === 'F' ? 'Women' : 'Men'}{r.is_relay ? ' · Relay' : ''}</span> : (r.is_relay ? <span style={chip}>Relay</span> : null)}
                  </div>
                  {/* 5 · when + where */}
                  <div style={{ marginTop: 'auto', paddingTop: 10, borderTop: `1px solid var(--color-neutral-200)`, fontSize: 12, color: MUTED, lineHeight: 1.45 }}>
                    <div className="asw-num" style={{ fontWeight: 700, color: INK }}>{r.date ? formatDate(r.date) : 'Date not recorded'}</div>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{[r.meet_name, r.location].filter(Boolean).join(' · ') || 'Meet not recorded'}</div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </>)}
    </div>
  )
}
