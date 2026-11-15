import { Fragment, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { getRecords, getComputedRecords } from '../api/records'
import { getCountries } from '../api/core'
import Flag from '../components/Flag'
import { PageHead, Loading, Empty, Seg, FilterBar } from '../components/ui'
import { AGE_GROUPS, formatDate } from '../utils'

// Computed scopes are calculated live from the results database;
// the rest are curated manual record books.
const COMPUTED_SCOPES = ['arab', 'gcc', 'national']
// Hick's Law + Pareto: the three books this site computes itself are one tap
// away; the continental and world books sit behind "More record books".
const MAIN_SCOPES = [
  { value: 'arab', label: 'Arab' },
  { value: 'gcc', label: 'GCC' },
  { value: 'national', label: 'National' },
]
const SCOPE_OPTIONS = [
  ...MAIN_SCOPES,
  { value: 'AFRICAN', label: 'African' },
  { value: 'ASIAN', label: 'Asian' },
  { value: 'MEDITERRANEAN', label: 'Mediterranean' },
  { value: 'ISLAMIC', label: 'Islamic' },
  { value: 'WORLD', label: 'World' },
]

export const sortByEvent = (a, b) =>
  (a.isRelay - b.isRelay) || (a.sortOrder - b.sortOrder) || (a.distance - b.distance)

// Normalize computed + manual record rows into one shape.
export function normalizeComputed(r) {
  return {
    key: `${r.event_id}-${r.gender}-${r.swimmer_id}-${r.time_centiseconds}`,
    // deep link to the exact swim (row expanded with splits) in the meet —
    // a split record's parent swim is filed under the longer source event
    link: r.championship_id && r.result_id
      ? `/meets/${r.championship_id}?tab=results&event=${r.source_event_id || r.event_id}&gender=${r.gender}&result=${r.result_id}`
      : null,
    eventName: r.event_name,
    sortOrder: r.event_sort_order ?? 99,
    distance: r.event_distance ?? 0,
    gender: r.gender,
    isRelay: !!r.is_relay,
    time: r.time,
    fina: r.fina_points,
    swimmerId: r.is_relay_team ? null : r.swimmer_id,
    swimmerName: r.swimmer_name,
    natCode: r.nationality_code,
    natName: r.nationality,
    meet: r.championship_name,
    location: r.championship_country,
    date: r.date,
    // record set by a lead-in split of a longer race (first 50 of a 100…)
    fromSplit: !!r.from_split,
    sourceEvent: r.source_event_name || '',
  }
}

function normalizeManual(r) {
  return {
    key: `m-${r.id}`,
    eventName: r.event_detail?.name,
    sortOrder: r.event_detail?.sort_order ?? 99,
    distance: r.event_detail?.distance ?? 0,
    gender: r.swimmer_detail?.sex,
    isRelay: !!r.event_detail?.is_relay,
    time: r.formatted_time,
    fina: null,
    swimmerId: r.swimmer_detail?.is_relay_team ? null : r.swimmer,
    swimmerName: r.swimmer_detail?.name,
    natCode: r.swimmer_detail?.nationality_detail?.code,
    natName: r.swimmer_detail?.nationality_detail?.name,
    meet: r.meet_name,
    location: r.location,
    date: r.result_date,
  }
}

// "50 M Freestyle" / "4x100 M Medley Relay" → the stroke it belongs to
const strokeOf = (name) => String(name || '').replace(/^\s*(\d+\s*x\s*)?\d+\s*M\s+/i, '') || 'Other'
// Chunking: a long book reads as stroke blocks (Freestyle, Backstroke…), not 17 loose rows
function byStroke(rows, grouped) {
  if (!grouped || rows.length <= 9) return [{ stroke: null, rows }]
  const out = []
  rows.forEach((r) => {
    const stroke = strokeOf(r.eventName)
    const last = out[out.length - 1]
    if (last && last.stroke === stroke) last.rows.push(r)
    else out.push({ stroke, rows: [r] })
  })
  return out.length > 1 ? out : [{ stroke: null, rows }]
}
const whereWhen = (r) => [r.location, r.date ? formatDate(r.date) : ''].filter(Boolean).join(' · ')

// Jakob's Law: a row that opens a swim behaves like a link (Enter/Space, focus ring)
const rowKeyNav = (go) => (e) => {
  if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); go() }
}

// `grouped` adds stroke sub-headings; `detail` adds where/when the record was
// set (both opt-in so other pages that reuse the table keep their layout)
export function RecordTable({ rows, grouped = false, detail = false }) {
  const navigate = useNavigate()
  const groups = byStroke(rows, grouped)
  const allRelay = rows.length > 0 && rows.every((r) => r.isRelay)
  return (
    <>
      {/* Desktop table */}
      <div className="table-scroll hide-mobile">
        <table className="table">
          <thead>
            <tr>
              <th>Event</th>
              <th>{allRelay ? 'Team' : 'Swimmer'}</th>
              <th className="time">Time</th>
              <th>Meet</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <Fragment key={g.stroke || 'all'}>
              {g.stroke && (
                <tr className="results-group-row"><td colSpan={4}>{g.stroke}</td></tr>
              )}
              {g.rows.map((r) => (
              <tr
                key={r.key}
                onClick={() => { if (r.link) navigate(r.link) }}
                className={r.link ? 'row-link' : undefined}
                role={r.link ? 'link' : undefined}
                tabIndex={r.link ? 0 : undefined}
                title={r.link ? 'View this swim' : undefined}
                onKeyDown={r.link ? rowKeyNav(() => navigate(r.link)) : undefined}
              >
                <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                  {r.eventName}
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Flag code={r.natCode} name={r.natName} />
                    {r.swimmerId ? (
                      <Link to={`/swimmers/${r.swimmerId}`} onClick={(e) => e.stopPropagation()} style={{ color: 'inherit', textDecoration: 'none' }}>{r.swimmerName}</Link>
                    ) : r.swimmerName}
                  </div>
                </td>
                <td className="time asw-time">{r.time}</td>
                <td className="text-muted" style={{ whiteSpace: 'nowrap' }}>
                  {r.meet || '—'}
                  {detail && (whereWhen(r) || r.fromSplit) && (
                    <span className="results-sub">
                      {whereWhen(r)}
                      {r.fromSplit && r.sourceEvent ? `${whereWhen(r) ? ' · ' : ''}opening split of the ${r.sourceEvent}` : ''}
                    </span>
                  )}
                </td>
              </tr>
              ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* Phone: compact 2-line cards */}
      <div className="show-mobile" style={{ display: 'flex', flexDirection: 'column' }}>
        {groups.map((g) => (
          <Fragment key={g.stroke || 'all'}>
          {g.stroke && <div className="results-group-row">{g.stroke}</div>}
          {g.rows.map((r) => (
          <div
            key={r.key}
            className={r.link ? 'hair-b row-link' : 'hair-b'}
            onClick={() => { if (r.link) navigate(r.link) }}
            role={r.link ? 'link' : undefined}
            tabIndex={r.link ? 0 : undefined}
            onKeyDown={r.link ? rowKeyNav(() => navigate(r.link)) : undefined}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0' }}
          >
            <Flag code={r.natCode} name={r.natName} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {r.swimmerName}
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-neutral-700)', marginTop: 1 }}>
                {r.eventName}
                {detail && r.date ? <span style={{ fontWeight: 500 }}> · {String(r.date).slice(0, 4)}</span> : null}
              </div>
            </div>
            <div style={{ flex: 'none', textAlign: 'right' }}>
              <div className="asw-time" style={{ fontSize: 15 }}>{r.time}</div>
            </div>
          </div>
          ))}
          </Fragment>
        ))}
      </div>
    </>
  )
}

export function Section({ label, pool, rows, last, grouped = false, detail = false }) {
  return (
    <div className={last ? 'pad' : 'rule-b pad'}>
      <div className="kicker" style={{ marginBottom: 12 }}>{label} · {pool}</div>
      {rows.length === 0 ? (
        <div className="text-muted" style={{ fontSize: 14 }}>No records yet.</div>
      ) : (
        <RecordTable rows={rows} grouped={grouped} detail={detail} />
      )}
    </div>
  )
}

const DEFAULTS = { scope: 'arab', pool: 'LCM', gender: 'M', age: 'OPEN', country: '' }

export default function Records() {
  // Working Memory: the chosen book lives in the address bar, so returning
  // from a swim or a profile (or opening a shared link) shows the same book
  const [sp, setSp] = useSearchParams()
  const param = (k) => sp.get(k) || DEFAULTS[k]
  const scope = SCOPE_OPTIONS.some((o) => o.value === param('scope')) ? param('scope') : DEFAULTS.scope
  const pool = param('pool') === 'SCM' ? 'SCM' : 'LCM'
  const gender = param('gender') === 'F' ? 'F' : 'M'
  const ageGroup = AGE_GROUPS.includes(param('age')) ? param('age') : DEFAULTS.age
  const country = param('country')
  const update = (patch) => setSp((prev) => {
    const next = new URLSearchParams(prev)
    Object.entries(patch).forEach(([k, v]) => {
      if (v === '' || v == null || v === DEFAULTS[k]) next.delete(k)
      else next.set(k, String(v))
    })
    return next
  }, { replace: true })
  const setScope = (v) => update({ scope: v })
  const setPool = (v) => update({ pool: v })
  const setGender = (v) => update({ gender: v })
  const setAgeGroup = (v) => update({ age: v })
  const setCountry = (v) => update({ country: v })
  const [countries, setCountries] = useState([])
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getCountries({ has_swimmers: true })
      .then((res) => {
        const list = Array.isArray(res.data) ? res.data : res.data?.results || []
        setCountries(list.filter((c) => c.region === 'ARAB' || c.region === 'GCC'))
      })
      .catch(() => setCountries([]))
  }, [])

  const isComputed = COMPUTED_SCOPES.includes(scope)
  const needsCountry = scope === 'national'

  useEffect(() => {
    if (needsCountry && !country) { setRows([]); setLoading(false); return }
    let alive = true
    setLoading(true)
    let req
    if (isComputed) {
      const params = { scope, pool, age_group: ageGroup }
      if (needsCountry) params.country = country
      if (gender) params.gender = gender
      req = getComputedRecords(params)
    } else {
      const params = { record_type: scope, pool, page_size: 500 }
      if (gender) params.gender = gender
      req = getRecords(params)
    }
    req
      .then((res) => {
        if (!alive) return
        const data = res.data
        const list = Array.isArray(data) ? data : data?.results || []
        setRows(list.map(isComputed ? normalizeComputed : normalizeManual))
      })
      .catch(() => { if (alive) setRows([]) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [scope, pool, gender, ageGroup, country, isComputed, needsCountry])

  const bySection = useMemo(() => {
    const sorted = [...rows].sort(sortByEvent)
    return {
      menInd: sorted.filter((r) => r.gender === 'M' && !r.isRelay),
      menRelay: sorted.filter((r) => r.gender === 'M' && r.isRelay),
      womenInd: sorted.filter((r) => r.gender === 'F' && !r.isRelay),
      womenRelay: sorted.filter((r) => r.gender === 'F' && r.isRelay),
      mixedRelay: sorted.filter((r) => r.isRelay && r.gender !== 'M' && r.gender !== 'F'),
    }
  }, [rows])

  const filtersChanged = Object.keys(DEFAULTS).some((k) => param(k) !== DEFAULTS[k])
  const showRows = !(needsCountry && !country) && rows.length > 0
  const bookName = scope === 'national'
    ? (countries.find((c) => String(c.id) === country)?.name || 'National')
    : SCOPE_OPTIONS.find((o) => o.value === scope)?.label

  const showMen = !gender || gender === 'M'
  const showWomen = !gender || gender === 'F'

  const sections = []
  if (showMen && bySection.menInd.length > 0) sections.push({ label: 'Men · Individual Records', rows: bySection.menInd })
  if (showMen && bySection.menRelay.length > 0) sections.push({ label: 'Men · Relay Records', rows: bySection.menRelay })
  if (showWomen && bySection.womenInd.length > 0) sections.push({ label: 'Women · Individual Records', rows: bySection.womenInd })
  if (showWomen && bySection.womenRelay.length > 0) sections.push({ label: 'Women · Relay Records', rows: bySection.womenRelay })
  if (bySection.mixedRelay.length > 0) sections.push({ label: 'Mixed Relay Records', rows: bySection.mixedRelay })

  return (
    <div className="records-page">
      <PageHead title="Records" />

      {/* Common Region: one bar — which book (first, it decides everything
          else), whose, which pool; then the narrowing dropdowns. Same order
          as Rankings so the two pages are learned once. */}
      <FilterBar count={showRows ? rows.length : null} noun={rows.length === 1 ? 'record' : 'records'} active={filtersChanged} onClear={() => setSp({}, { replace: true })}>
        <div className="records-filters results-filters" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <Seg options={MAIN_SCOPES} value={scope} onChange={setScope} />
            <Seg
              options={[{ value: 'M', label: "Men's" }, { value: 'F', label: "Women's" }]}
              value={gender}
              onChange={setGender}
            />
            <Seg
              options={[{ value: 'LCM', label: 'LCM 50m' }, { value: 'SCM', label: 'SCM 25m' }]}
              value={pool}
              onChange={setPool}
            />
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            {needsCountry && (
              <select className="select" aria-label="Country" style={{ flex: '1 1 150px', width: 'auto', minWidth: 0, maxWidth: 220 }} value={country} onChange={(e) => setCountry(e.target.value)}>
                <option value="">Select country…</option>
                {countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
            {isComputed && (
              <select className="select" aria-label="Age category" style={{ flex: '0 1 120px', width: 'auto', minWidth: 0 }} value={ageGroup} onChange={(e) => setAgeGroup(e.target.value)}>
                {AGE_GROUPS.map((g) => <option key={g} value={g}>{g === 'OPEN' ? 'All ages' : g}</option>)}
              </select>
            )}
            <select className="select" aria-label="More record books" style={{ flex: '1 1 150px', width: 'auto', minWidth: 0, maxWidth: 210 }} value={isComputed ? '' : scope} onChange={(e) => setScope(e.target.value || DEFAULTS.scope)}>
              <option value="">More record books…</option>
              {SCOPE_OPTIONS.filter((o) => !COMPUTED_SCOPES.includes(o.value)).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>
      </FilterBar>

      {needsCountry && !country ? (
        <Empty label="Select a country to view national records" hint="Pick a federation from the country list above, or switch to the Arab book." />
      ) : loading && rows.length === 0 ? (
        <Loading label="Loading records" />
      ) : rows.length === 0 ? (
        <Empty
          label={`No ${bookName} ${gender === 'F' ? "women's" : "men's"} ${pool} records${isComputed && ageGroup !== 'OPEN' ? ` for ${ageGroup}` : ''} yet`}
          hint={isComputed ? 'Try the other pool or another age category.' : 'This book has not been published here yet. The Arab, GCC and National books are always available.'}
        >
          {filtersChanged && <button type="button" className="btn btn-secondary" onClick={() => setSp({}, { replace: true })}>Back to Arab records</button>}
        </Empty>
      ) : (
        // Doherty Threshold: the current book stays (dimmed) while the next one loads
        <div aria-busy={loading} style={{ opacity: loading ? 0.45 : 1, transition: 'opacity 0.15s ease' }}>
          {sections.map((s, i) => (
            <Section
              key={s.label}
              label={`${bookName} · ${s.label}${isComputed && ageGroup !== 'OPEN' ? ` · ${ageGroup}` : ''}`}
              pool={pool}
              rows={s.rows}
              grouped
              detail
              last={i === sections.length - 1}
            />
          ))}
        </div>
      )}
    </div>
  )
}
