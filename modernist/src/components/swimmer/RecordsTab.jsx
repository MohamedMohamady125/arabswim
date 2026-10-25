import { useEffect, useState } from 'react'
import { getHeldRecords, getRecordGaps } from '../../api/records'
import { Loading, Empty, Seg } from '../ui'

// Compress age categories: ['U14','U15','U16','OPEN'] -> ['U14–U16', 'OPEN']
export function compressCategories(cats) {
  if (!cats || cats.length === 0) return ['OPEN']
  const hasOpen = cats.includes('OPEN')
  const ages = cats.filter((c) => c !== 'OPEN').map((c) => parseInt(c.slice(1))).sort((a, b) => a - b)
  const out = []
  let start = null
  let prev = null
  ages.forEach((n) => {
    if (start === null) { start = prev = n; return }
    if (n === prev + 1) { prev = n; return }
    out.push(start === prev ? `U${start}` : `U${start}\u2013U${prev}`)
    start = prev = n
  })
  if (start !== null) out.push(start === prev ? `U${start}` : `U${start}\u2013U${prev}`)
  if (hasOpen) out.push('OPEN')
  return out
}

// Motivation tiers based on % away from the record — each with its own color
export function gapMotivation(pct) {
  const p = parseFloat(pct)
  if (isNaN(p) || p < 0) return null
  if (p <= 1) return { badge: 'RECORD IN SIGHT', color: 'var(--asw-fast)', msg: 'Less than 1% away — one great swim and it\u2019s yours!' }
  if (p <= 2) return { badge: 'SO CLOSE', color: 'var(--color-accent)', msg: 'Under 2% off the record — keep attacking!' }
  if (p <= 5) return { badge: 'CLOSING IN', color: 'var(--color-accent-2)', msg: 'Within 5% of the record — it\u2019s getting nervous.' }
  if (p <= 10) return { badge: 'ON THE HUNT', color: '#a05f2c', msg: 'Within 10% — stay on this trajectory and it will fall.' }
  return { badge: 'BUILDING', color: 'var(--color-neutral-500)', msg: 'Every swim closes the gap — keep pushing.' }
}

// Scope → signature color (flat theme palette)
export const SCOPE_COLORS = {
  WORLD: '#b98a1e',
  ASIAN: '#a05f2c',
  ISLAMIC: '#0d7a52',
  MEDITERRANEAN: '#4a8fc0',
  AFRICAN: '#a8402f',
  ARAB: '#1c4e86',
  GCC: '#7d8a99',
  NATIONAL: 'var(--color-accent-800)',
}

// Flat progress bar: swimmer's best toward a target time.
// Animates its fill from 0 on mount; `pct` (0–100 closeness) preferred,
// legacy `barPct` kept for QualifyingTab.
export function GapBar({ done, barPct, pct, color, leftLabel, rightLabel }) {
  const target = done ? 100 : pct != null ? Math.max(4, Math.min(100, pct)) : Math.max(100 - barPct * 0.6, 15)
  const [w, setW] = useState(0)
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setW(target)))
    return () => cancelAnimationFrame(id)
  }, [target])
  return (
    <div>
      <div className="micro" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span>{leftLabel}</span>
        <span>{rightLabel}</span>
      </div>
      <div className="bar" style={{ height: 10 }}>
        <div style={{
          width: `${w}%`,
          height: '100%',
          background: done ? 'var(--asw-fast)' : color || 'var(--color-accent)',
          transition: 'width 0.9s cubic-bezier(0.2, 0.8, 0.2, 1)',
        }} />
      </div>
    </div>
  )
}

const SCOPE_LABELS = {
  national: 'NATIONAL', gcc: 'GCC', arab: 'ARAB',
  african: 'AFRICAN', asian: 'ASIAN', mediterranean: 'MEDITERRANEAN',
}
const SECTION_ORDER = ['WORLD', 'ASIAN', 'ISLAMIC', 'MEDITERRANEAN', 'AFRICAN', 'ARAB', 'GCC', 'NATIONAL']

export default function RecordsTab({ swimmerId }) {
  const [records, setRecords] = useState([])
  const [gaps, setGaps] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('records')
  const [gapScope, setGapScope] = useState(null)
  const [gapPool, setGapPool] = useState('LCM')
  const [scopeFilter, setScopeFilter] = useState(null)

  useEffect(() => {
    let alive = true
    Promise.all([
      getHeldRecords({ swimmer: swimmerId }),
      getRecordGaps({ swimmer: swimmerId }),
    ]).then(([res, gapsRes]) => {
      if (!alive) return
      // One entry per age category — even when the same swim holds the record
      // in several categories, list each separately.
      const all = (res.data || []).flatMap((r) =>
        ((r.categories && r.categories.length > 0) ? r.categories : ['OPEN']).map((cat) => ({
          ...r,
          record_type: (r.scope || '').toUpperCase(),
          formatted_time: r.time,
          meet_name: r.championship_name,
          location: r.championship_location,
          fina_points: r.fina_points,
          result_date: r.date,
          categories: [cat],
        }))
      )
      setRecords(all)
      setGaps(gapsRes.data || [])
    }).catch(() => {}).finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [swimmerId])

  if (loading) return <Loading label="Loading records" />

  const availableScopes = Object.keys(SCOPE_LABELS).filter((s) => gaps.some((g) => g.scope === s))
  const activeScope = gapScope && availableScopes.includes(gapScope) ? gapScope : availableScopes[0]

  const subTabs = (
    <div style={{ marginBottom: 20 }}>
      <Seg
        options={[{ value: 'records', label: 'Records Held' }, { value: 'gaps', label: 'Record Gaps' }]}
        value={view}
        onChange={setView}
      />
    </div>
  )

  /* ── Gaps view ── */
  if (view === 'gaps') {
    const filteredGaps = gaps.filter((g) => g.scope === activeScope && g.pool === gapPool)
    return (
      <div>
        {subTabs}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
          {availableScopes.length > 0 && (
            <Seg
              options={availableScopes.map((s) => ({ value: s, label: SCOPE_LABELS[s] }))}
              value={activeScope}
              onChange={setGapScope}
            />
          )}
          <Seg
            options={[{ value: 'LCM', label: 'LCM' }, { value: 'SCM', label: 'SCM' }]}
            value={gapPool}
            onChange={setGapPool}
          />
        </div>
        <div className="micro" style={{ marginBottom: 14 }}>
          Distance between all-time bests and current {SCOPE_LABELS[activeScope] || ''} records
        </div>
        {filteredGaps.length === 0 ? (
          <Empty label={`No record gaps for ${SCOPE_LABELS[activeScope] || ''} ${gapPool}`} />
        ) : (
          <div className="rule-t">
            {filteredGaps.map((g, gi) => {
              const motiv = gapMotivation(g.gap_pct)
              const tierColor = g.holds ? '#b98a1e' : motiv?.color || 'var(--color-accent)'
              const closeness = 100 - parseFloat(g.gap_pct || 0)
              return (
                <div key={`${g.event_id}-${g.pool}`} className="hair-b asw-fade-up"
                  style={{ padding: '16px 0 16px 14px', borderLeft: `4px solid ${tierColor}`, animationDelay: `${Math.min(gi * 60, 480)}ms` }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 15, textTransform: 'uppercase' }}>{g.event_name}</span>
                      <span className={`tag ${g.pool === 'SCM' ? 'tag-accent-2' : 'tag-accent'}`}>{g.pool}</span>
                      <span className="tag tag-neutral">{SCOPE_LABELS[g.scope]}</span>
                    </div>
                    {g.holds ? (
                      <span className="tag" style={{ background: '#b98a1e', color: '#fff', border: 0 }}>RECORD HOLDER</span>
                    ) : (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        {motiv && <span className="tag" style={{ background: tierColor, color: '#fff', border: 0 }}>{motiv.badge}</span>}
                        <span className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 17, color: tierColor }}>+{g.gap_pct}%</span>
                      </span>
                    )}
                  </div>
                  <GapBar done={g.holds} pct={closeness} color={tierColor} leftLabel="Your best" rightLabel="Record" />
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 8 }}>
                    <span className="asw-time" style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-accent)' }}>{g.swimmer_best}</span>
                    <span className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 15, color: g.holds ? 'var(--asw-fast)' : tierColor }}>
                      {g.holds ? 'RECORD' : `+${g.gap_time} to break`}
                    </span>
                    <span className="asw-time" style={{ fontSize: 18 }}>{g.record_time}</span>
                  </div>
                  {!g.holds && motiv && (
                    <div className="micro" style={{ marginTop: 6, color: tierColor, fontWeight: 700 }}>{motiv.msg}</div>
                  )}
                  {!g.holds && g.record_holder && (
                    <div style={{ fontSize: 12, color: 'var(--color-neutral-700)', marginTop: 4, textAlign: 'right' }}>
                      Record: {g.record_holder}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  /* ── Held records view ── */
  const byType = {}
  records.forEach((r) => {
    const type = r.record_type || 'OTHER'
    if (!byType[type]) byType[type] = []
    byType[type].push(r)
  })
  const sections = [...SECTION_ORDER, ...Object.keys(byType).filter((t) => !SECTION_ORDER.includes(t))]
    .filter((t, i, arr) => arr.indexOf(t) === i && (byType[t] || []).length > 0)

  if (records.length === 0) {
    return (
      <div>
        {subTabs}
        <Empty label="No records held" />
      </div>
    )
  }

  const fmtDate = (d) => {
    if (!d) return ''
    const parts = String(d).split('-')
    if (parts.length === 3 && parts[0].length === 4) return `${parts[2]}-${parts[1]}-${parts[0]}`
    return d
  }

  // Exactly one classification shown at a time — buttons act as filters,
  // defaulting to the most prestigious scope the athlete holds.
  const activeType = scopeFilter && sections.includes(scopeFilter) ? scopeFilter : sections[0]
  const activeRows = byType[activeType] || []
  const activeColor = SCOPE_COLORS[activeType] || 'var(--color-accent)'

  return (
    <div>
      {subTabs}
      {/* Classification filter buttons */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 22 }}>
        {sections.map((type) => {
          const c = SCOPE_COLORS[type] || 'var(--color-accent)'
          const active = type === activeType
          return (
            <button key={type} type="button"
              onClick={() => setScopeFilter(type)}
              style={{
                background: active ? c : 'var(--color-surface)',
                color: active ? '#fff' : c,
                border: `2px solid ${c}`,
                padding: '8px 16px',
                cursor: 'pointer',
                fontFamily: 'var(--font-heading)',
                fontWeight: 800,
                fontSize: 12,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                transition: 'background 0.2s, color 0.2s',
              }}>
              {type}
              <span className="asw-num" style={{
                background: active ? 'rgba(255,255,255,0.22)' : c,
                color: '#fff',
                fontSize: 11,
                fontWeight: 800,
                padding: '1px 7px',
              }}>{byType[type].length}</span>
            </button>
          )
        })}
      </div>

      {/* Record cards — key on scope so the fade-up replays on filter change */}
      <div key={activeType} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
        {activeRows.map((r, i) => (
          /* Arab Swim navy cards (same gradient as the profile stat cards) */
          <div key={i} className="card asw-fade-up"
            style={{ borderTop: `3px solid ${activeColor}`, background: 'linear-gradient(150deg, var(--color-accent-600), var(--color-accent-900))', color: '#fff', animationDelay: `${Math.min(i * 45, 450)}ms` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span className="card-kicker" style={{ color: 'rgba(255,255,255,0.75)' }}>{activeType} RECORD</span>
              <span className="tag" style={{ background: 'rgba(255,255,255,0.14)', color: r.pool === 'SCM' ? 'var(--asw-gold)' : '#fff' }}>{r.pool}</span>
            </div>
            <div className="card-title" style={{ textTransform: 'uppercase', fontSize: 15, color: '#fff' }}>
              {r.event_detail?.name || r.event_name}
            </div>
            <div className="asw-time" style={{ fontSize: 26, fontWeight: 800, color: '#fff', lineHeight: 1 }}>
              {r.formatted_time}
            </div>
            <div className="card-meta asw-num" style={{ color: 'rgba(255,255,255,0.8)' }}>
              <span>{fmtDate(r.result_date)}</span>
              {r.fina_points != null && (
                <span style={{ fontWeight: 700, color: 'var(--asw-gold)' }}>{r.fina_points} FINA</span>
              )}
            </div>
            {(r.meet_name || r.location) && (
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', fontWeight: 600 }}>
                {r.meet_name}{r.meet_name && r.location ? ' — ' : ''}{r.location}
              </div>
            )}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 'auto' }}>
              {compressCategories(r.categories).map((cat) => (
                <span key={cat} className="tag" style={{ background: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.85)' }}>{cat}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
