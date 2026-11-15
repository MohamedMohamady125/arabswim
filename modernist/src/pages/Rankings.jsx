import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { getRankings } from '../api/rankings'
import { getCountries, getEvents } from '../api/core'
import Flag from '../components/Flag'
import { PageHead, Loading, Empty, Seg, Pager, FilterBar } from '../components/ui'
import { formatDate, AGE_GROUPS } from '../utils'

// The API serves 50 rows a page; asking for 25 was ignored, so the pager
// counted twice as many pages as existed and the second half came back empty.
const PAGE_SIZE = 50
const SCOPE_LABEL = { national: 'National', arab: 'Arab', gcc: 'GCC' }
const POOL_LABEL = { LCM: 'LCM (50m pool)', SCM: 'SCM (25m pool)', OW: 'Open water' }
// Working Memory: the selection lives in the address bar, so coming back from
// a swim (or sharing the link) lands on the same ranking, not the defaults.
const DEFAULTS = { scope: 'arab', country: '', gender: 'M', pool: 'LCM', year: '', age: 'OPEN', event: '', page: '1' }
const STROKE_ORDER = ['Freestyle', 'Backstroke', 'Breaststroke', 'Butterfly', 'Individual Medley', 'Freestyle Relay', 'Medley Relay', 'Open Water']

export default function Rankings() {
  const navigate = useNavigate()
  const [countries, setCountries] = useState([])
  const [events, setEvents] = useState([])
  const [sp, setSp] = useSearchParams()
  const param = (k) => sp.get(k) || DEFAULTS[k]
  const scope = SCOPE_LABEL[param('scope')] ? param('scope') : DEFAULTS.scope
  const country = param('country')
  const gender = param('gender') === 'F' ? 'F' : 'M'
  const pool = POOL_LABEL[param('pool')] ? param('pool') : DEFAULTS.pool
  const year = param('year')
  const ageGroup = AGE_GROUPS.includes(param('age')) ? param('age') : DEFAULTS.age
  const page = Math.max(1, parseInt(param('page'), 10) || 1)
  // any filter change goes back to page 1; defaults stay out of the URL
  const update = (patch) => setSp((prev) => {
    const next = new URLSearchParams(prev)
    if (!('page' in patch)) next.delete('page')
    Object.entries(patch).forEach(([k, v]) => {
      if (v === '' || v == null || String(v) === DEFAULTS[k]) next.delete(k)
      else next.set(k, String(v))
    })
    return next
  }, { replace: true })
  const setScope = (v) => update({ scope: v })
  const setCountry = (v) => update({ country: v })
  const setGender = (v) => update({ gender: v })
  const setPool = (v) => update({ pool: v })
  const setYear = (v) => update({ year: v })
  const setEvent = (v) => update({ event: v })
  const setAgeGroup = (v) => update({ age: v })
  const topRef = useRef(null)
  const setPage = (n) => {
    update({ page: n })
    // Jakob's Law: a new page starts at its first row, not at the pager
    topRef.current?.scrollIntoView({ block: 'start' })
  }
  const [eventsLoaded, setEventsLoaded] = useState(false)
  const [rows, setRows] = useState([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)

  const years = useMemo(() => {
    const cur = new Date().getFullYear()
    const out = []
    for (let y = cur; y >= 2000; y--) out.push(y)
    return out
  }, [])

  useEffect(() => {
    let alive = true
    Promise.allSettled([getCountries({ has_swimmers: true }), getEvents({ has_results: true })]).then(([cRes, eRes]) => {
      if (!alive) return
      const val = (r) => (r.status === 'fulfilled' ? r.value.data : null)
      const list = (d) => (Array.isArray(d) ? d : d?.results || [])
      setCountries(list(val(cRes)).filter((c) => c.region === 'ARAB' || c.region === 'GCC'))
      setEvents(list(val(eRes)))
      setEventsLoaded(true)
    })
    return () => { alive = false }
  }, [])

  // 100 IM only exists in SCM; group by stroke, distance-sorted within group.
  // Open Water is its own "course" — it only lists OW events, and the pool
  // courses exclude OW so open-water swims never mix with pool times.
  const eventGroups = useMemo(() => {
    let filtered
    if (pool === 'OW') {
      filtered = events.filter((e) => e.stroke === 'Open Water')
    } else {
      filtered = events.filter((e) => e.stroke !== 'Open Water')
      if (pool === 'LCM') {
        filtered = filtered.filter((e) => !(e.stroke === 'Individual Medley' && e.distance === 100))
      }
    }
    const grouped = {}
    for (const e of filtered) {
      let stroke = e.stroke || 'Other'
      // Relays (incl. mixed) group under the relay strokes, not among
      // the individual events — a 4x50 free relay is not a 200 free.
      const isRelay = e.is_relay || /relay/i.test(e.name || '')
      if (isRelay && !/relay/i.test(stroke)) {
        stroke = stroke === 'Individual Medley' || /medley/i.test(e.name || '') ? 'Medley Relay' : `${stroke} Relay`
      }
      if (!grouped[stroke]) grouped[stroke] = []
      grouped[stroke].push(e)
    }
    Object.values(grouped).forEach((arr) => arr.sort((a, b) =>
      (a.distance - b.distance) || String(a.name).localeCompare(String(b.name))))
    const strokes = Object.keys(grouped).sort((a, b) => {
      const ai = STROKE_ORDER.indexOf(a)
      const bi = STROKE_ORDER.indexOf(b)
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
    })
    return strokes.map((stroke) => ({ stroke, events: grouped[stroke] }))
  }, [events, pool])

  // Tesler's Law: nobody has to pick an event before seeing a ranking — the
  // first one (50 Free) is shown, and an event that does not exist in the
  // chosen pool (100 IM in a 50m pool) falls back the same way.
  const event = useMemo(() => {
    const wanted = sp.get('event') || ''
    const valid = eventGroups.some((g) => g.events.some((e) => String(e.id) === wanted))
    if (valid) return wanted
    const first = eventGroups.find((g) => !/relay/i.test(g.stroke))?.events[0] || eventGroups[0]?.events[0]
    return first ? String(first.id) : ''
  }, [sp, eventGroups])

  useEffect(() => {
    if (!event) { setRows([]); setCount(0); setLoading(!eventsLoaded); return }
    if (scope === 'national' && !country) { setRows([]); setCount(0); setLoading(false); return }
    let alive = true
    setLoading(true)
    const params = {
      scope, gender, event,
      age_group: ageGroup,
      // `limit` is the name the rankings API reads; page_size kept for parity
      page, limit: PAGE_SIZE, page_size: PAGE_SIZE,
    }
    // Open Water is a virtual course: OW swims live in LCM/SCM-tagged meets,
    // so don't constrain by championship pool — the OW event id is enough.
    if (pool !== 'OW') params.pool = pool
    if (year) params.year = year
    if (scope === 'national') params.country = country
    getRankings(params)
      .then((res) => {
        if (!alive) return
        const d = res.data
        setRows(Array.isArray(d) ? d : d?.results || [])
        setCount(Array.isArray(d) ? d.length : d?.count || 0)
      })
      .catch(() => { if (alive) { setRows([]); setCount(0) } })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [scope, country, gender, pool, year, event, ageGroup, page, eventsLoaded])

  const filtersChanged = scope !== DEFAULTS.scope || gender !== DEFAULTS.gender || pool !== DEFAULTS.pool
    || !!year || ageGroup !== DEFAULTS.age
  // back to the default ranking, keeping the event being looked at
  const clearFilters = () => setSp(sp.get('event') ? { event: sp.get('event') } : {}, { replace: true })
  const countryName = countries.find((c) => String(c.id) === country)?.name
  const needsCountry = scope === 'national' && !country
  const showTable = !needsCountry && !!event && rows.length > 0

  const selectedEvent = events.find((e) => String(e.id) === event)

  return (
    <div>
      <PageHead title="Rankings" />

      {/* Common Region + Working Memory: one bar holds every filter, the size
          of the list and the way back to the default ranking. Segments first
          (who / which pool), dropdowns below (what / when) — same order as Records. */}
      <FilterBar count={showTable ? count : null} noun={count === 1 ? 'swimmer' : 'swimmers'} active={filtersChanged} onClear={clearFilters}>
        <div className="records-filters results-filters" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <Seg
              options={[{ value: 'arab', label: 'Arab' }, { value: 'gcc', label: 'GCC' }, { value: 'national', label: 'National' }]}
              value={scope}
              onChange={setScope}
            />
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
            {scope === 'national' && (
              <select className="select" aria-label="Country" style={{ flex: '2 1 140px', width: 'auto', minWidth: 0, maxWidth: 260 }} value={country} onChange={(e) => setCountry(e.target.value)}>
                <option value="">Select country…</option>
                {countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
            <select className="select" aria-label="Event" style={{ flex: '3 1 170px', width: 'auto', minWidth: 0, maxWidth: 420 }} value={event} onChange={(e) => setEvent(e.target.value)}>
              {!event && <option value="">Select event…</option>}
              {eventGroups.map((g) => (
                <optgroup key={g.stroke} label={g.stroke}>
                  {g.events.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
                </optgroup>
              ))}
            </select>
            <select className="select" aria-label="Season" style={{ flex: '1 1 90px', width: 'auto', minWidth: 0, maxWidth: 160 }} value={year} onChange={(e) => setYear(e.target.value)}>
              <option value="">All-time</option>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <select className="select" aria-label="Age group" style={{ flex: '1 1 84px', width: 'auto', minWidth: 0, maxWidth: 150 }} value={ageGroup} onChange={(e) => setAgeGroup(e.target.value)}>
              {AGE_GROUPS.map((g) => <option key={g} value={g}>{g === 'OPEN' ? 'All ages' : g}</option>)}
            </select>
          </div>
        </div>
      </FilterBar>

      {needsCountry ? (
        <Empty label="Select a country to view national rankings" hint="Pick a federation from the country list above, or switch to the Arab ranking." />
      ) : !event ? (
        eventsLoaded
          ? <Empty label="No events with results yet" hint="Rankings appear as soon as meet results are published." />
          : <Loading label="Loading rankings" />
      ) : loading && rows.length === 0 ? (
        <Loading label="Loading rankings" />
      ) : rows.length === 0 ? (
        <Empty
          label={`No ${selectedEvent?.name || ''} rankings for this selection`.replace('  ', ' ')}
          hint={year ? `Nothing swum in ${year} matches. Try All-time, or another pool or age group.` : 'Try the other pool, another age group or a wider scope.'}
        >
          {filtersChanged && <button type="button" className="btn btn-secondary" onClick={clearFilters}>Clear filters</button>}
        </Empty>
      ) : (
        // Doherty Threshold: the old list stays (dimmed) while the next one
        // loads, instead of the page collapsing to a spinner on every change
        <div className="pad" ref={topRef} aria-busy={loading} style={{ scrollMarginTop: 12, opacity: loading ? 0.45 : 1, transition: 'opacity 0.15s ease' }}>
          {selectedEvent && (
            <div style={{ marginBottom: 14, display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '4px 10px' }}>
              <h2 style={{ margin: 0, fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 20, letterSpacing: '0.01em' }}>
                {selectedEvent.name}
              </h2>
              {/* Working Memory: the heading repeats every choice that shaped this list */}
              <span className="kicker">
                {scope === 'national' ? (countryName || 'National') : SCOPE_LABEL[scope]} · {gender === 'M' ? "Men's" : "Women's"} · {POOL_LABEL[pool]} · {year || 'All-time'}{ageGroup !== 'OPEN' ? ` · ${ageGroup}` : ''}
              </span>
            </div>
          )}
          <div className="table-scroll">
            <table className="table rankings-table">
              <thead>
                <tr>
                  <th style={{ width: 34 }}>#</th>
                  <th>Swimmer</th>
                  <th className="num">Age</th>
                  <th className="time">Time</th>
                  <th className="num">FINA</th>
                  <th className="hide-mobile">Meet</th>
                  <th className="hide-mobile">Date</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const prevCs = i > 0 ? rows[i - 1].time_centiseconds : null
                  const isTied = prevCs !== null && r.time_centiseconds === prevCs
                  // deep link to the exact swim (expanded with splits) in the meet
                  const swimLink = r.championship_id && r.result_id
                    ? `/meets/${r.championship_id}?tab=results&event=${event}&gender=${gender}&result=${r.result_id}`
                    : null
                  return (
                    <tr
                      key={`${r.rank}-${r.swimmer_id}`}
                      onClick={() => { if (swimLink) navigate(swimLink) }}
                      className={swimLink ? 'row-link' : undefined}
                      role={swimLink ? 'link' : undefined}
                      tabIndex={swimLink ? 0 : undefined}
                      onKeyDown={swimLink ? (e) => {
                        // Jakob's Law: the row is a link, so Enter/Space open it
                        if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); navigate(swimLink) }
                      } : undefined}
                      title={swimLink ? 'View this swim' : undefined}
                    >
                      <td className="asw-num" style={{ fontWeight: 800 }}>{isTied ? '=' : r.rank}</td>
                      <td className="swimmer-cell">
                        {/* one line always — long names ellipsize instead of wrapping */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                          <Flag code={r.nationality_code} name={r.nationality} />
                          {/* whole row goes to the swim; profile stays a click away via the meet page */}
                          {swimLink
                            ? <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.swimmer_name}</span>
                            : <Link to={`/swimmers/${r.swimmer_id}`} style={{ color: 'inherit', textDecoration: 'none', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.swimmer_name}</Link>}
                        </div>
                      </td>
                      <td className="num asw-num">{r.age_at_competition ?? '—'}</td>
                      <td className="time asw-time">
                        {r.time}
                      </td>
                      <td className="num asw-num">{r.fina_points ?? '—'}</td>
                      {/* one line — long meet names ellipsize so rows stay short */}
                      <td className="text-muted hide-mobile"
                        style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 300 }}
                        title={`${r.championship_name}${r.championship_location ? ` · ${r.championship_location.split(',').pop().trim()}` : ''}`}>
                        {r.championship_name}
                        {r.championship_location ? ` · ${r.championship_location.split(',').pop().trim()}` : ''}
                      </td>
                      <td className="hide-mobile" style={{ whiteSpace: 'nowrap' }}>{formatDate(r.date)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <Pager page={page} pageSize={PAGE_SIZE} count={count} onPage={setPage} />
        </div>
      )}
    </div>
  )
}
