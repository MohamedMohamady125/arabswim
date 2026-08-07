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
          location: r.championship_name,
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
        options={[{ value: 'records', label: 'Records held' }, { value: 'gaps', label: 'Record gaps' }]}
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

  return (
    <div>
      {subTabs}
      {/* Scope summary strip */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 24 }}>
        {sections.map((type) => {
          const c = SCOPE_COLORS[type] || 'var(--color-accent)'
          const active = scopeFilter === type
          const dimmed = scopeFilter && !active
          return (
            <button key={type} type="button" className="asw-fade-up"
              onClick={() => setScopeFilter(active ? null : type)}
              style={{ background: c, color: '#fff', padding: '10px 16px', minWidth: 100, border: 0, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', opacity: dimmed ? 0.4 : 1, outline: active ? '3px solid var(--color-accent-2)' : 'none', outlineOffset: 2, transition: 'opacity 0.2s' }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', opacity: 0.75 }}>{type}</div>
              <div className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 26, lineHeight: 1.1 }}>{byType[type].length}</div>
            </button>
          )
        })}
      </div>

      {(scopeFilter ? sections.filter((t) => t === scopeFilter) : sections).map((type) => {
        const rows = byType[type]
        const c = SCOPE_COLORS[type] || 'var(--color-accent)'
        return (
          <div key={type} style={{ marginBottom: 28 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, paddingBottom: 6, borderBottom: `2px solid ${c}` }}>
              <span className="tag" style={{ background: c, color: '#fff', border: 0 }}>{type} RECORDS</span>
              <span className="micro asw-num">{rows.length} record{rows.length !== 1 ? 's' : ''}</span>
            </div>
            {rows.map((r, i) => (
              <div key={i} className="hair-b asw-fade-up"
                style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 0 12px 12px', borderLeft: `4px solid ${c}`, animationDelay: `${Math.min(i * 50, 400)}ms` }}>
                <div className="asw-num" style={{ width: 30, height: 30, flex: 'none', background: c, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 13 }}>
                  {i + 1}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 15, textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                    {r.event_detail?.name || r.event_name}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--color-accent)', marginTop: 2 }}>{r.location}</div>
                  <div className="asw-num" style={{ fontSize: 12, color: 'var(--color-neutral-700)', marginTop: 2 }}>{fmtDate(r.result_date)}</div>
                  <div className="show-mobile-flex" style={{ gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                    {compressCategories(r.categories).map((cat) => (
                      <span key={cat} className="tag tag-neutral">{cat}</span>
                    ))}
                    <span className={`tag ${r.pool === 'SCM' ? 'tag-accent-2' : 'tag-accent'}`}>{r.pool}</span>
                  </div>
                </div>
                <div className="hide-mobile" style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 'none' }}>
                  {compressCategories(r.categories).map((cat) => (
                    <span key={cat} className="tag tag-neutral">{cat}</span>
                  ))}
                  <span className={`tag ${r.pool === 'SCM' ? 'tag-accent-2' : 'tag-accent'}`}>{r.pool}</span>
                </div>
                <div className="asw-time" style={{ fontSize: 20, fontWeight: 700, flex: 'none', minWidth: 90, textAlign: 'right', color: c }}>
                  {r.formatted_time}
                </div>
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
