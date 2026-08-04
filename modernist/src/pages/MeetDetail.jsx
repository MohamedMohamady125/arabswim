import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  getChampionship, getChampionshipStats, getChampionshipResults,
  getMostImproved, getChampionshipComparison, updateResult, deleteResult,
} from '../api/championships'
import { getMedals, getMedalSummary, getMedalClubSummary, getMedalSwimmerSummary } from '../api/medals'
import Flag from '../components/Flag'
import MeetGallery from '../components/meets/MeetGallery'
import { Loading, Empty, Seg, MedalIcon } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { formatDateRange, formatNumber, mediaUrl, parseTime } from '../utils'

const val = (r) => (r.status === 'fulfilled' ? r.value.data : null)
const list = (d) => (Array.isArray(d) ? d : d?.results || [])

// Display categories oldest → youngest (Seniors → Poussins). Named categories
// have fixed ranks; numeric ones sort by their highest age, descending.
const NAMED_RANKS = { 'Seniors/Juniors': 0, Seniors: 1, Juniors: 2, Cadets: 3, Minimes: 4, Benjamins: 5, Poussins: 6 }
const catRank = (c) => {
  if (!c) return 9999
  const named = NAMED_RANKS[c]
  if (named !== undefined) return named
  if (/open/i.test(c)) return -1
  const nums = c.match(/\d+/g)
  if (nums) return -Math.max(...nums.map(Number))
  return 9998
}

// Round display order: finals first, then consolation, prelims, heats
const ROUND_ORDER = ['Finals', 'Consolation', 'Prelims', 'Heats', '']
const roundLabel = (r) => {
  if (!r) return 'Timed Finals'
  if (r === 'Finals') return 'Final A'
  if (r === 'Consolation') return 'Final B'
  return r
}

const GENDER_LABEL = { M: 'Men', F: 'Women', X: 'Mixed' }

// Long names ellipsize instead of stretching the column
const NAME_ELLIPSIS = { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }

function SwimmerLink({ swimmerId, detail }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: '1 1 auto' }}>
      <Flag code={detail?.nationality_detail?.code} name={detail?.nationality_detail?.name} />
      {detail?.is_relay_team ? (
        // Relay-team placeholders are clubs, not swimmers — no profile to open
        <>
          <span style={NAME_ELLIPSIS}>{detail?.name}</span>
          <span className="tag tag-neutral" style={{ flex: 'none' }}>Club</span>
        </>
      ) : (
        <Link to={`/swimmers/${swimmerId}`} style={{ color: 'inherit', textDecoration: 'none', ...NAME_ELLIPSIS }}>{detail?.name}</Link>
      )}
    </div>
  )
}

// Fixed-size round club logo; falls back to an initials monogram so every
// row in the club tally stays perfectly aligned.
function ClubLogo({ logo, name, size = 26 }) {
  const [failed, setFailed] = useState(false)
  const initials = (name || '')
    .split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?'
  const base = {
    width: size, height: size, flex: 'none', borderRadius: '50%',
    border: '1px solid var(--color-neutral-300)',
  }
  if (logo && !failed) {
    return (
      <img src={mediaUrl(logo)} alt="" width={size} height={size}
        onError={() => setFailed(true)}
        style={{ ...base, objectFit: 'contain', background: '#fff' }} />
    )
  }
  return (
    <span style={{
      ...base, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.38, fontWeight: 700, letterSpacing: '.02em',
      background: 'var(--color-neutral-200)', color: 'var(--color-neutral-600)',
    }}>{initials}</span>
  )
}

/* ─────────────────────────── Results tab ─────────────────────────── */

function ResultsTab({ meetId, events, isNational, isAdmin, hasOpenPodium, onDataChanged }) {
  const navigate = useNavigate()
  const [genderFilter, setGenderFilter] = useState('')
  const [eventKey, setEventKey] = useState('')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState('ALL')
  const [selectedRound, setSelectedRound] = useState(null)
  const [expandedRow, setExpandedRow] = useState(null)
  const [editMode, setEditMode] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editValues, setEditValues] = useState({ time: '', team: '' })

  const filteredEvents = useMemo(
    () => events.filter((e) => !genderFilter || e.gender === genderFilter),
    [events, genderFilter],
  )

  // no "All" option — default to the first gender that has events (Men first)
  useEffect(() => {
    if (events.length === 0) return
    if (!genderFilter || !events.some((e) => e.gender === genderFilter)) {
      const first = ['M', 'F', 'X'].find((g) => events.some((e) => e.gender === g))
      if (first) setGenderFilter(first)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events])

  // keep a valid event selected whenever the gender filter changes the list
  useEffect(() => {
    if (filteredEvents.length === 0) { setEventKey(''); return }
    if (!filteredEvents.some((e) => `${e.event_id}|${e.gender}` === eventKey)) {
      setEventKey(`${filteredEvents[0].event_id}|${filteredEvents[0].gender}`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredEvents])

  const selectedEvent = filteredEvents.find((e) => `${e.event_id}|${e.gender}` === eventKey)
    || events.find((e) => `${e.event_id}|${e.gender}` === eventKey)

  const loadResults = () => {
    if (!eventKey) return
    const [eventId, gender] = eventKey.split('|')
    setLoading(true)
    getChampionshipResults(meetId, { event: eventId, gender, all_rounds: true })
      .then((res) => {
        const data = list(res.data)
        setRows(data)
        const rounds = [...new Set(data.map((r) => r.round_type || ''))]
        rounds.sort((a, b) => ROUND_ORDER.indexOf(a) - ROUND_ORDER.indexOf(b))
        setSelectedRound(rounds[0] ?? '')
        setSelectedCategory('ALL')
        setExpandedRow(null)
        setEditingId(null)
      })
      .catch(() => setRows([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadResults() }, [meetId, eventKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // categories present in this event, ordered Seniors → Poussins
  const categories = useMemo(() => {
    const cats = [...new Set(rows.map((r) => r.category || ''))]
    cats.sort((a, b) => catRank(a) - catRank(b))
    return cats
  }, [rows])
  const hasCategories = categories.filter((c) => c !== '').length > 0 && categories.length > 1

  // "General" view on TC meets: the open classification — every category
  // pooled, ranked by time only (this is what the OPEN medals are based on)
  const isOpenView = selectedCategory === 'OPEN'

  // rounds available for the selected category (open view pools A/B finals,
  // so it has no round picker)
  const rounds = useMemo(() => {
    if (isOpenView) return []
    const catRows = selectedCategory === 'ALL' ? rows : rows.filter((r) => (r.category || '') === selectedCategory)
    const rs = [...new Set(catRows.map((r) => r.round_type || ''))]
    rs.sort((a, b) => ROUND_ORDER.indexOf(a) - ROUND_ORDER.indexOf(b))
    return rs
  }, [rows, selectedCategory, isOpenView])

  useEffect(() => {
    if (rounds.length > 0 && !rounds.includes(selectedRound)) setSelectedRound(rounds[0])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rounds])

  // rows for the selected round + category, grouped by category
  const roundsPresent = new Set(rows.map((r) => r.round_type || ''))
  // National meets run Finale A/B/C — each finale has its own podium, so
  // Final B (Consolation) rows also carry medals (matches backend recompute)
  const showMedals = isOpenView
    ? (roundsPresent.has('Finals') || roundsPresent.size <= 1)
    : (selectedRound === 'Finals'
      || (isNational && selectedRound === 'Consolation')
      || roundsPresent.size <= 1)
  // Small categories (e.g. Benjamins) often swim heats only — that heats
  // classement IS their podium, so their rows medal even in the Heats view.
  const finalsCats = useMemo(() => new Set(
    rows.filter((r) => r.round_type === 'Finals' || r.round_type === 'Consolation')
      .map((r) => r.category || '')), [rows])
  const grouped = useMemo(() => {
    let sel
    if (isOpenView) {
      // Open classification: pool Finale A/B across all categories (mirrors
      // the backend's OPEN medal pass), rank purely by time.
      const hasFinals = rows.some((r) => r.round_type === 'Finals')
      sel = hasFinals
        ? rows.filter((r) => r.round_type === 'Finals' || r.round_type === 'Consolation')
        : rows
    } else {
      sel = rows.filter((r) => (r.round_type || '') === (selectedRound ?? ''))
      if (selectedCategory !== 'ALL') sel = sel.filter((r) => (r.category || '') === selectedCategory)
    }
    // HC results sink to the bottom of each category, times ascending otherwise
    const sorted = [...sel].sort((a, b) => {
      if (a.is_hc !== b.is_hc) return a.is_hc ? 1 : -1
      return (a.time_centiseconds || 0) - (b.time_centiseconds || 0)
    })
    if (isOpenView) return sorted.length ? [['OPEN', sorted]] : []
    const order = []
    const byCat = new Map()
    sorted.forEach((r) => {
      const cat = r.category || ''
      if (!byCat.has(cat)) { byCat.set(cat, []); order.push(cat) }
      byCat.get(cat).push(r)
    })
    order.sort((a, b) => catRank(a) - catRank(b))
    return order.map((cat) => [cat, byCat.get(cat)])
  }, [rows, selectedRound, selectedCategory, isOpenView])

  useEffect(() => { setExpandedRow(null) }, [eventKey, selectedRound, selectedCategory])
  // full list — every swimmer in the selection, no pagination
  const pageGroups = grouped
  const fullByCat = useMemo(() => new Map(grouped), [grouped])

  const isRelay = selectedEvent?.event_name?.toLowerCase().includes('relay')
    || selectedEvent?.display_name?.toLowerCase().includes('relay')

  const startEditRow = (r) => {
    setEditingId(r.id)
    setEditValues({ time: r.formatted_time || '', team: r.team || '' })
  }

  const saveEditRow = async (r) => {
    const cs = parseTime(editValues.time)
    if (!cs) { window.alert('Invalid time — use 1:02.34 or 28.75'); return }
    try {
      await updateResult(r.id, { time_centiseconds: cs, team: editValues.team })
      setEditingId(null)
      loadResults()
      onDataChanged?.()
    } catch {
      window.alert('Failed to save the result')
    }
  }

  const removeRow = async (r) => {
    if (!window.confirm(`Delete ${r.swimmer_detail?.name}'s result (${r.formatted_time})? This cannot be undone.`)) return
    try {
      await deleteResult(r.id)
      loadResults()
      onDataChanged?.()
    } catch {
      window.alert('Failed to delete the result')
    }
  }

  if (events.length === 0) {
    return (
      <div className="pad">
        <Empty label="No events for this meet" />
        {isAdmin && (
          <div style={{ textAlign: 'center', marginTop: -24, paddingBottom: 24 }}>
            <Link className="btn btn-primary" to={`/import?championship=${meetId}`}>Import results</Link>
          </div>
        )}
      </div>
    )
  }

  const colCount = 6 + (isNational ? 1 : 0) + (editMode ? 1 : 0)

  const renderRow = (r, arr) => {
    // competition ranking: tied times share a rank (1,2,2,4); HC unranked
    const ranked = arr.filter((x) => !x.is_hc)
    const rank = r.is_hc ? 0 : ranked.findIndex((x) => x.time_centiseconds === r.time_centiseconds) + 1
    const heatsOnlyCat = !isOpenView && !!r.category && !finalsCats.has(r.category)
    const medalOnRow = (showMedals || heatsOnlyCat) && !r.is_manual && !r.is_hc && rank >= 1 && rank <= 3
    const swimmers = r.relay_swimmers || []
    const splits = r.splits || []
    const hasSub = (isRelay && swimmers.length > 0) || (!isRelay && splits.length > 0)
    const isExpanded = expandedRow === r.id
    const isEditing = editingId === r.id
    return (
      <React.Fragment key={r.id}>
        <tr
          style={{ cursor: editMode ? 'default' : 'pointer', background: isEditing ? 'var(--color-accent-100)' : undefined }}
          onClick={() => {
            if (editMode) return
            if (hasSub) setExpandedRow(isExpanded ? null : r.id)
            // Relay-team placeholders are clubs, not swimmers — no profile to open
            else if (!r.swimmer_detail?.is_relay_team) navigate(`/swimmers/${r.swimmer_detail?.id || r.swimmer}`)
          }}
        >
          <td className="asw-num">
            {r.is_hc ? (
              <span className="tag tag-neutral" title={r.hc_type === 'TLD' ? 'Time limit exceeded' : 'Hors concours'}>{r.hc_type || 'HC'}</span>
            ) : medalOnRow ? (
              <MedalIcon type={rank === 1 ? 'GOLD' : rank === 2 ? 'SILVER' : 'BRONZE'} size={18} />
            ) : (
              rank || '—'
            )}
          </td>
          <td className="swimmer-cell">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <SwimmerLink swimmerId={r.swimmer_detail?.id || r.swimmer} detail={r.swimmer_detail} />
              {!isRelay && (r.team || '').toUpperCase() === 'LP' && (
                <span className="tag tag-outline" title="No club — transferring (libre passage)">LP</span>
              )}
              {hasSub && (
                // marginLeft auto pins every SPLITS/TEAM badge to the cell's
                // right edge so they line up in one column across all rows
                <span
                  style={{
                    flex: 'none', marginLeft: 'auto',
                    display: 'inline-flex', alignItems: 'center', gap: 2,
                    padding: '1px 4px', cursor: 'pointer',
                    fontSize: 8, fontWeight: 800, letterSpacing: '0.03em',
                    fontFamily: 'var(--font-heading)',
                    border: `1px solid ${isExpanded ? 'var(--color-accent-800)' : 'var(--asw-gold)'}`,
                    background: isExpanded ? 'var(--color-accent-800)' : 'color-mix(in srgb, var(--asw-gold) 14%, transparent)',
                    color: isExpanded ? '#fff' : 'var(--color-accent-800)',
                  }}
                >
                  <span className="hide-mobile">{isRelay ? 'TEAM' : 'SPLITS'}</span> {isExpanded ? '▲' : '▼'}
                </span>
              )}
            </div>
          </td>
          <td className="num asw-num hide-mobile">{r.age_at_competition ?? '—'}</td>
          {isNational && (
            <td className="text-muted hide-mobile">
              {isEditing ? (
                <input
                  className="input"
                  value={editValues.team}
                  onChange={(e) => setEditValues((v) => ({ ...v, team: e.target.value }))}
                  placeholder="Club"
                  style={{ width: 120, minHeight: 30 }}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (r.team || '—')}
            </td>
          )}
          <td className="time asw-time">
            {isEditing ? (
              <input
                className="input asw-num"
                value={editValues.time}
                onChange={(e) => setEditValues((v) => ({ ...v, time: e.target.value }))}
                onKeyDown={(e) => { if (e.key === 'Enter') saveEditRow(r); if (e.key === 'Escape') setEditingId(null) }}
                style={{ width: 100, minHeight: 30, textAlign: 'right' }}
                autoFocus
                onClick={(e) => e.stopPropagation()}
              />
            ) : r.formatted_time}
          </td>
          <td className="num asw-num">{r.fina_points ?? '—'}</td>
          {editMode && (
            <td className="num" style={{ whiteSpace: 'nowrap' }}>
              {isEditing ? (
                <span style={{ display: 'inline-flex', gap: 6 }}>
                  <button className="btn btn-primary" style={{ padding: '3px 10px', fontSize: 12 }} onClick={(e) => { e.stopPropagation(); saveEditRow(r) }}>Save</button>
                  <button className="btn btn-secondary" style={{ padding: '3px 10px', fontSize: 12 }} onClick={(e) => { e.stopPropagation(); setEditingId(null) }}>Cancel</button>
                </span>
              ) : (
                <span style={{ display: 'inline-flex', gap: 6 }}>
                  <button className="btn btn-ghost" style={{ padding: '3px 8px', fontSize: 12 }} onClick={(e) => { e.stopPropagation(); startEditRow(r) }}>Edit</button>
                  <button className="btn btn-ghost" style={{ padding: '3px 8px', fontSize: 12, color: 'var(--asw-slow)' }} onClick={(e) => { e.stopPropagation(); removeRow(r) }}>Delete</button>
                </span>
              )}
            </td>
          )}
        </tr>
        {isExpanded && !isRelay && splits.length > 0 && (
          <tr style={{ background: 'var(--color-surface)' }}>
            <td colSpan={colCount} style={{ padding: '8px 12px' }}>
              {/* chips flow left→right and wrap only when the line is full,
                  so all available width is used on phone and laptop */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {splits.map((s, j) => (
                  <span key={j} style={{ display: 'inline-flex', alignItems: 'baseline', gap: 8, whiteSpace: 'nowrap', border: '1px solid var(--color-divider)', background: 'var(--color-bg)', padding: '3px 8px' }}>
                    <span className="micro" style={{ fontSize: 10 }}>{s.distance ? `${s.distance}m` : `#${j + 1}`}</span>
                    <span className="asw-num" style={{ fontSize: 13, fontWeight: 700 }}>{s.time}</span>
                  </span>
                ))}
              </div>
            </td>
          </tr>
        )}
        {isExpanded && isRelay && swimmers.map((s, j) => (
          <tr key={`${r.id}-${j}`} style={{ background: 'var(--color-surface)' }}>
            <td className="asw-num text-muted num" style={{ fontSize: 12 }}>{j + 1}</td>
            <td style={{ paddingLeft: 36, fontSize: 13 }}>{typeof s === 'string' ? s : s?.name}</td>
            <td className="hide-mobile" />
            {isNational && <td className="hide-mobile" />}
            <td className="time asw-num text-muted">{typeof s === 'object' ? (s?.split_time || '—') : '—'}</td>
            <td colSpan={editMode ? 2 : 1} />
          </tr>
        ))}
      </React.Fragment>
    )
  }

  return (
    <div className="pad">
      {/* filters row */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 16 }}>
        <div className="field" style={{ width: 320, maxWidth: '100%' }}>
          <label>Event</label>
          <select className="select" value={eventKey} onChange={(e) => setEventKey(e.target.value)}>
            {filteredEvents.map((ev) => (
              <option key={`${ev.event_id}|${ev.gender}`} value={`${ev.event_id}|${ev.gender}`}>
                {(ev.display_name || ev.event_name || '').replace(/\s*[—–-]\s*(Men|Women|Mixed)\s*$/i, '')}
              </option>
            ))}
          </select>
        </div>
        {hasCategories && (
          <div className="field" style={{ width: 180, maxWidth: '100%' }}>
            <label>Category</label>
            <select
              className="select"
              value={selectedCategory}
              onChange={(e) => { setSelectedCategory(e.target.value); setExpandedRow(null) }}
            >
              <option value="ALL">All categories</option>
              {hasOpenPodium && <option value="OPEN">TC</option>}
              {categories.map((c) => (
                <option key={c || '_general'} value={c}>{c || 'General'}</option>
              ))}
            </select>
          </div>
        )}
        <Seg
          options={[
            { value: 'M', label: 'Men' },
            { value: 'F', label: 'Women' },
            { value: 'X', label: 'Mixed' },
          ].filter((o) => events.some((e) => e.gender === o.value))}
          value={genderFilter}
          onChange={setGenderFilter}
        />
        {isAdmin && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button
              className={`btn ${editMode ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => { setEditMode((m) => !m); setEditingId(null) }}
            >
              {editMode ? 'Done editing' : 'Edit results'}
            </button>
            <Link className="btn btn-secondary" to={`/import?championship=${meetId}`}>Add results</Link>
          </div>
        )}
      </div>

      {/* round filter */}
      {rounds.length > 1 && (
        <div style={{ marginBottom: 16, overflowX: 'auto' }}>
          <Seg
            options={rounds.map((r) => ({ value: r, label: roundLabel(r) }))}
            value={selectedRound}
            onChange={(r) => { setSelectedRound(r); setExpandedRow(null) }}
          />
        </div>
      )}

      {loading && <Loading label="Loading results" />}
      {!loading && grouped.length === 0 && <Empty label="No results for this selection" />}

      {!loading && grouped.length > 0 && (
        <div className="table-scroll">
          <table className="table results-table">
            <thead>
              <tr>
                <th className="rank-col">Rank</th>
                <th>Swimmer</th>
                <th className="num hide-mobile">Age</th>
                {isNational && <th className="hide-mobile">Team</th>}
                <th className="time">Time</th>
                <th className="num">FINA</th>
                {editMode && <th className="num">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {pageGroups.map(([cat, catRows], gi) => (
                <React.Fragment key={`${cat || '_general'}-${gi}`}>
                  {isOpenView && gi === 0 && (
                    <tr style={{ background: 'var(--color-surface)' }}>
                      <td colSpan={colCount} className="kicker" style={{ padding: '8px 8px' }}>TC — all categories, ranked by time</td>
                    </tr>
                  )}
                  {selectedCategory === 'ALL' && grouped.some(([c]) => c !== '') && (
                    <tr style={{ background: 'var(--color-surface)' }}>
                      <td colSpan={colCount} className="kicker" style={{ padding: '8px 8px' }}>{cat || 'General'}</td>
                    </tr>
                  )}
                  {catRows.map((r) => renderRow(r, fullByCat.get(cat) || catRows))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/* ─────────────────────────── Medals tab ─────────────────────────── */

function MedalsTab({ meetId, isNational }) {
  const navigate = useNavigate()
  const [loaded, setLoaded] = useState(false)
  const [medals, setMedals] = useState([])
  const [country, setCountry] = useState([])
  const [club, setClub] = useState([])
  const [swimmer, setSwimmer] = useState([])
  const [scope, setScope] = useState(isNational ? 'club' : 'country')
  const [swimmerGender, setSwimmerGender] = useState('ALL')
  const [tallyFilter, setTallyFilter] = useState('ALL')
  const [medalFilter, setMedalFilter] = useState('ALL')

  useEffect(() => {
    let alive = true
    Promise.allSettled([
      getMedals({ championship: meetId, page_size: 500 }),
      getMedalSummary({ championship: meetId }),
      getMedalClubSummary({ championship: meetId }),
      getMedalSwimmerSummary({ championship: meetId, limit: 'all' }),
    ]).then(([m, c, cl, s]) => {
      if (!alive) return
      setMedals(list(val(m)))
      setCountry(list(val(c)))
      setClub(list(val(cl)))
      setSwimmer(list(val(s)))
      setLoaded(true)
    })
    return () => { alive = false }
  }, [meetId])

  if (!loaded) return <Loading label="Loading medals" />

  const goldCount = medals.filter((m) => m.medal_type === 'GOLD').length
  const silverCount = medals.filter((m) => m.medal_type === 'SILVER').length
  const bronzeCount = medals.filter((m) => m.medal_type === 'BRONZE').length

  if (medals.length === 0 && country.length === 0 && club.length === 0 && swimmer.length === 0) {
    return <Empty label="No medals yet — medals are computed from results" />
  }

  const scopeOptions = [
    !isNational && country.length > 0 && { value: 'country', label: 'Country tally' },
    club.length > 0 && { value: 'club', label: 'Club tally' },
    swimmer.length > 0 && { value: 'swimmer', label: 'Swimmer tally' },
  ].filter(Boolean)

  let tallyRows = scope === 'country' ? country : scope === 'club' ? club : swimmer
  if (scope === 'country' && tallyFilter === 'ARAB') {
    tallyRows = tallyRows.filter((r) => ['ARAB', 'GCC'].includes(r.swimmer__nationality__region))
  }
  if (scope === 'swimmer' && swimmerGender !== 'ALL') {
    tallyRows = tallyRows.filter((r) => r.swimmer__sex === swimmerGender)
  }

  const filteredMedals = medalFilter === 'ALL'
    ? [...medals].sort((a, b) => {
        const order = { GOLD: 0, SILVER: 1, BRONZE: 2 }
        return (order[a.medal_type] ?? 3) - (order[b.medal_type] ?? 3)
      })
    : medals.filter((m) => m.medal_type === medalFilter)

  return (
    <div>
      {/* medal counts strip */}
      {medals.length > 0 && (
        <div className="counts rule-b" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          {[
            ['GOLD', goldCount, 'Gold', 'var(--asw-gold)'],
            ['SILVER', silverCount, 'Silver', 'var(--asw-silver)'],
            ['BRONZE', bronzeCount, 'Bronze', 'var(--asw-bronze)'],
          ].map(([type, n, label, color]) => (
            <div key={type}>
              <div className="n" style={{ color, display: 'flex', alignItems: 'center', gap: 10 }}>
                <MedalIcon type={type} size={24} />{n}
              </div>
              <div className="l">{label}</div>
            </div>
          ))}
        </div>
      )}

      <div className="pad">
        {/* tally */}
        {scopeOptions.length > 0 && (
          <>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
              <Seg options={scopeOptions} value={scope} onChange={setScope} />
              {scope === 'country' && (
                <Seg
                  options={[{ value: 'ALL', label: 'Overall' }, { value: 'ARAB', label: 'Arab' }]}
                  value={tallyFilter}
                  onChange={setTallyFilter}
                />
              )}
              {scope === 'swimmer' && (
                <Seg
                  options={[{ value: 'ALL', label: 'All' }, { value: 'M', label: 'Men' }, { value: 'F', label: 'Women' }]}
                  value={swimmerGender}
                  onChange={setSwimmerGender}
                />
              )}
            </div>
            {tallyRows.length === 0 ? (
              <Empty label="No medals recorded" />
            ) : (
              <div className="table-scroll" style={{ marginBottom: 28 }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ width: 30 }}>#</th>
                      <th>{scope === 'country' ? 'Country' : scope === 'club' ? 'Club' : 'Swimmer'}</th>
                      <th className="num">G</th>
                      <th className="num">S</th>
                      <th className="num">B</th>
                      <th className="num">Σ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tallyRows.map((row, i) => (
                      <tr
                        key={i}
                        style={{ cursor: scope === 'swimmer' ? 'pointer' : 'default' }}
                        onClick={() => scope === 'swimmer' && row.swimmer__id && navigate(`/swimmers/${row.swimmer__id}`)}
                      >
                        <td className="asw-num">{i + 1}</td>
                        <td>
                          {scope === 'country' && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <Flag code={row.swimmer__nationality__code} name={row.swimmer__nationality__name} />
                              {row.swimmer__nationality__name}
                            </div>
                          )}
                          {scope === 'club' && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                              <ClubLogo logo={row.team_logo} name={row.result__team} />
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {row.result__team || '—'}
                              </span>
                            </div>
                          )}
                          {scope === 'swimmer' && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <Flag code={row.swimmer__nationality__code} name={row.swimmer__nationality__name} />
                              {row.swimmer__name}
                            </div>
                          )}
                        </td>
                        <td className="num asw-num" style={{ fontWeight: 800 }}>{row.gold || 0}</td>
                        <td className="num asw-num">{row.silver || 0}</td>
                        <td className="num asw-num">{row.bronze || 0}</td>
                        <td className="num asw-num">{row.total ?? ((row.gold || 0) + (row.silver || 0) + (row.bronze || 0))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* all medals */}
        {medals.length > 0 && (
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
              <div className="kicker">All medals ({filteredMedals.length})</div>
              <Seg
                options={[
                  { value: 'ALL', label: `All (${medals.length})` },
                  { value: 'GOLD', label: `Gold (${goldCount})` },
                  { value: 'SILVER', label: `Silver (${silverCount})` },
                  { value: 'BRONZE', label: `Bronze (${bronzeCount})` },
                ]}
                value={medalFilter}
                onChange={setMedalFilter}
              />
            </div>
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 50 }}>Medal</th>
                    <th>Swimmer</th>
                    <th>Event</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMedals.map((m, i) => (
                    // Relay-team placeholders are clubs, not swimmers — no profile to open
                    <tr
                      key={m.id || i}
                      style={{ cursor: m.swimmer_detail?.is_relay_team ? 'default' : 'pointer' }}
                      onClick={m.swimmer_detail?.is_relay_team ? undefined : () => navigate(`/swimmers/${m.swimmer_detail?.id || m.swimmer}`)}
                    >
                      <td><MedalIcon type={m.medal_type} size={18} /></td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <Flag code={m.swimmer_detail?.nationality_detail?.code} name={m.swimmer_detail?.nationality_detail?.name} />
                          {m.swimmer_detail?.name}
                          {m.swimmer_detail?.is_relay_team && (
                            <span className="tag tag-neutral" style={{ flex: 'none' }}>Club</span>
                          )}
                        </div>
                      </td>
                      <td>{m.event_detail?.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ────────────────────────── Statistics tab ────────────────────────── */

function StatisticsTab({ meetId, stats }) {
  const navigate = useNavigate()
  const [comparison, setComparison] = useState([])
  const [perfGender, setPerfGender] = useState('overall')

  useEffect(() => {
    let alive = true
    getChampionshipComparison(meetId)
      .then((res) => { if (alive) setComparison(list(res.data)) })
      .catch(() => {})
    return () => { alive = false }
  }, [meetId])

  if (!stats) return <Empty label="No statistics available" />

  const total = (stats.male_count || 0) + (stats.female_count || 0)
  const malePct = total ? Math.round(((stats.male_count || 0) / total) * 100) : 0
  const performers = (stats.top_performers || []).filter((t) => perfGender === 'overall' || t.gender === perfGender)
  const maxFina = performers[0]?.fina_points || 1

  return (
    <div className="pad">
      {/* overview counts */}
      <div className="cellgrid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', marginBottom: 28 }}>
        {[
          ['Swimmers', stats.total_swimmers],
          ['Results', stats.total_results],
          ['Events', stats.total_events ?? stats.events?.length],
          ['Male', stats.male_count],
          ['Female', stats.female_count],
          ...(stats.clubs?.length ? [['Clubs', stats.clubs.length]] : []),
        ].map(([l, n]) => (
          <div key={l}>
            <div className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 26, lineHeight: 1 }}>{formatNumber(n ?? 0)}</div>
            <div className="micro" style={{ marginTop: 6 }}>{l}</div>
          </div>
        ))}
      </div>

      {/* gender breakdown bar */}
      {total > 0 && (
        <div style={{ maxWidth: 520, marginBottom: 28 }}>
          <div className="kicker" style={{ marginBottom: 8 }}>Gender split</div>
          <div className="bar" style={{ height: 10 }}>
            <div style={{ width: `${malePct}%` }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--color-neutral-700)', marginTop: 6 }}>
            <span><span className="asw-num" style={{ color: 'var(--color-text)', fontWeight: 700 }}>{formatNumber(stats.male_count ?? 0)}</span> men · {malePct}%</span>
            <span><span className="asw-num" style={{ color: 'var(--color-text)', fontWeight: 700 }}>{formatNumber(stats.female_count ?? 0)}</span> women · {100 - malePct}%</span>
          </div>
        </div>
      )}

      {/* countries breakdown */}
      {(stats.countries || []).length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div className="kicker" style={{ marginBottom: 10 }}>Countries ({stats.countries.length})</div>
          <div className="table-scroll" style={{ maxHeight: 420, overflowY: 'auto' }}>
            <table className="table">
              <thead>
                <tr><th>Country</th><th className="num">Swimmers</th></tr>
              </thead>
              <tbody>
                {stats.countries.map((c, i) => (
                  <tr key={c.swimmer__nationality__id ?? i}>
                    <td style={{ fontSize: 15, fontWeight: 600 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Flag code={c.swimmer__nationality__code} name={c.swimmer__nationality__name} />
                        {c.swimmer__nationality__name}
                      </div>
                    </td>
                    <td className="num asw-num">{c.swimmers_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* clubs breakdown (national meets) */}
      {(stats.clubs || []).length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div className="kicker" style={{ marginBottom: 10 }}>Clubs ({stats.clubs.length})</div>
          <div className="table-scroll" style={{ maxHeight: 420, overflowY: 'auto' }}>
            <table className="table">
              <thead>
                <tr><th>Club</th><th className="num">Swimmers</th></tr>
              </thead>
              <tbody>
                {stats.clubs.map((c, i) => (
                  <tr key={i}>
                    <td style={{ fontSize: 15, fontWeight: 600 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                        <ClubLogo logo={c.team_logo} name={c.team || c.result__team} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.team || c.result__team || '—'}
                        </span>
                      </div>
                    </td>
                    <td className="num asw-num">{c.swimmers_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* top performances */}
      {(stats.top_performers || []).length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
            <div className="kicker">Top performances — highest FINA points</div>
            <Seg
              options={[{ value: 'overall', label: 'Overall' }, { value: 'M', label: 'Men' }, { value: 'F', label: 'Women' }]}
              value={perfGender}
              onChange={setPerfGender}
            />
          </div>
          {performers.length === 0 ? (
            <Empty label="No performances for this filter" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 760 }}>
              {performers.map((t, i) => (
                <div key={i} style={{ cursor: 'pointer' }} onClick={() => navigate(`/swimmers/${t.swimmer_id}`)}>
                  <div style={{ display: 'grid', gridTemplateColumns: '22px auto minmax(0, 1.2fr) minmax(0, 1fr) auto', alignItems: 'center', gap: 8, fontSize: 15, marginBottom: 4 }}>
                    <span className="asw-num text-muted">{i + 1}</span>
                    <Flag code={t.nationality_code} name={t.swimmer_name} />
                    <span style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.swimmer_name}</span>
                    <span className="text-muted" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.event_name}</span>
                    <span className="asw-num" style={{ fontWeight: 800, textAlign: 'right' }}>{t.fina_points}</span>
                  </div>
                  <div className="bar">
                    <div style={{ width: `${Math.round(((t.fina_points || 0) / maxFina) * 100)}%`, background: i < 3 ? 'var(--color-accent)' : 'var(--color-neutral-800)' }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* personal bests achieved */}
      {(stats.personal_bests || []).length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div className="kicker" style={{ marginBottom: 4 }}>Personal bests achieved</div>
          <div className="micro" style={{ marginBottom: 10, textTransform: 'none', letterSpacing: 0, fontSize: 12 }}>Swimmers who set their all-time best at this meet</div>
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 30 }}>#</th>
                  <th>Swimmer</th>
                  <th>Event</th>
                  <th className="time">Time</th>
                  <th className="num">FINA</th>
                </tr>
              </thead>
              <tbody>
                {stats.personal_bests.map((s, i) => (
                  <tr key={i} style={{ cursor: 'pointer' }} onClick={() => navigate(`/swimmers/${s.swimmer_id}`)}>
                    <td className="asw-num">{i + 1}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Flag code={s.nationality_code} name={s.swimmer_name} />
                        {s.swimmer_name}
                      </div>
                    </td>
                    <td>{s.event_name}</td>
                    <td className="time asw-time asw-fast">{s.time}</td>
                    <td className="num asw-num">{s.fina_points ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* records broken */}
      {(stats.records_broken || []).length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div className="kicker" style={{ marginBottom: 10 }}>Records broken</div>
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 70 }}>Record</th>
                  <th>Swimmer</th>
                  <th>Event</th>
                  <th className="time">Time</th>
                </tr>
              </thead>
              <tbody>
                {stats.records_broken.map((r, i) => (
                  <tr key={i} style={{ cursor: 'pointer' }} onClick={() => navigate(`/swimmers/${r.swimmer_id}`)}>
                    <td><span className="tag tag-dark">{r.record_type}</span></td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Flag code={r.nationality_code} name={r.swimmer_name} />
                        {r.swimmer_name}
                      </div>
                    </td>
                    <td>{r.event_name}</td>
                    <td className="time asw-time" style={{ color: 'var(--asw-gold)' }}>{r.time}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* comparison with previous editions */}
      {comparison.length > 1 && (
        <div>
          <div className="kicker" style={{ marginBottom: 4 }}>Compare with previous editions</div>
          <div className="micro" style={{ marginBottom: 10, textTransform: 'none', letterSpacing: 0, fontSize: 12 }}>Same classification, same pool type</div>
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Championship</th>
                  <th>Host</th>
                  <th className="num">Year</th>
                  <th className="num">Swimmers</th>
                  <th className="num">Countries</th>
                  <th className="num">Events</th>
                  <th className="num">Results</th>
                  <th className="num">Best FINA</th>
                </tr>
              </thead>
              <tbody>
                {comparison.map((ch) => (
                  <tr
                    key={ch.id}
                    style={{ cursor: ch.is_current ? 'default' : 'pointer', background: ch.is_current ? 'var(--color-accent-100)' : undefined }}
                    onClick={() => !ch.is_current && navigate(`/meets/${ch.id}?tab=statistics`)}
                  >
                    <td style={{ fontWeight: ch.is_current ? 700 : 400 }}>
                      {ch.name}
                      {ch.is_current && <span className="tag tag-accent" style={{ marginLeft: 8 }}>Current</span>}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Flag code={ch.country_code} name={ch.country} />
                        <span className="hide-mobile">{ch.country}</span>
                      </div>
                    </td>
                    <td className="num asw-num">{ch.year}</td>
                    <td className="num asw-num">{ch.total_swimmers}</td>
                    <td className="num asw-num">{ch.countries_count}</td>
                    <td className="num asw-num">{ch.total_events}</td>
                    <td className="num asw-num">{ch.total_results}</td>
                    <td className="num asw-num" style={{ fontWeight: 800 }}>{ch.best_fina || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

/* ───────────────────────── Most improved tab ───────────────────────── */

function MostImprovedTab({ meetId }) {
  const navigate = useNavigate()
  const [rows, setRows] = useState(null)
  const [gender, setGender] = useState('overall')

  useEffect(() => {
    let alive = true
    getMostImproved(meetId)
      .then((res) => { if (alive) setRows(list(res.data)) })
      .catch(() => { if (alive) setRows([]) })
    return () => { alive = false }
  }, [meetId])

  if (rows === null) return <Loading label="Loading most improved" />

  // Only genuine improvements — swimmers with no previous time never appear
  const filtered = rows.filter((s) => !s.is_new_entry && (gender === 'overall' || s.gender === gender))

  return (
    <div className="pad">
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <div className="kicker">Most improved swimmers</div>
          <div className="micro" style={{ textTransform: 'none', letterSpacing: 0, fontSize: 12, marginTop: 4 }}>Biggest time drops vs previous personal best</div>
        </div>
        <Seg
          options={[{ value: 'overall', label: 'Overall' }, { value: 'M', label: 'Men' }, { value: 'F', label: 'Women' }]}
          value={gender}
          onChange={setGender}
        />
      </div>
      {filtered.length === 0 ? (
        <Empty label="No improvements recorded for this meet" />
      ) : (() => {
        const maxDrop = Math.max(0.01, ...filtered.map((s) => parseFloat(s.improvement) || 0))
        return (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(235px, 1fr))', gap: 10 }}>
            {filtered.map((s, i) => {
              const drop = parseFloat(s.improvement) || 0
              const top3 = i < 3
              return (
                <div
                  key={i}
                  onClick={() => navigate(`/swimmers/${s.swimmer_id}`)}
                  style={{
                    border: '1px solid var(--color-divider)', background: 'var(--color-surface)',
                    borderTop: `3px solid ${top3 ? 'var(--asw-gold)' : 'var(--color-accent-800)'}`,
                    padding: '10px 12px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 7,
                  }}
                >
                  {/* rank + swimmer + headline drop */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="asw-num" style={{
                      width: 22, height: 22, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 11,
                      background: top3 ? 'var(--asw-gold)' : 'var(--color-accent-800)', color: '#fff',
                    }}>{i + 1}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Flag code={s.nationality_code} name={s.swimmer_name} />
                        <span style={{ fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.swimmer_name}</span>
                      </div>
                      <div className="micro" style={{ marginTop: 1, fontSize: 10 }}>{s.event_name}</div>
                    </div>
                    <span className="asw-num" style={{ flex: 'none', fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 18, lineHeight: 1, color: 'var(--asw-fast)' }}>
                      −{s.improvement}s
                    </span>
                  </div>

                  {/* time journey + relative drop bar */}
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                    <span className="asw-num" style={{ fontSize: 13, color: 'var(--color-neutral-600)', textDecoration: 'line-through' }}>{s.previous_best}</span>
                    <span style={{ color: 'var(--asw-fast)', fontWeight: 700, fontSize: 12 }}>→</span>
                    <span className="asw-time" style={{ fontSize: 16 }}>{s.current_time}</span>
                  </div>
                  <div className="bar" style={{ height: 4 }}>
                    <div style={{ width: `${Math.max(4, Math.round((drop / maxDrop) * 100))}%`, background: 'var(--asw-fast)' }} />
                  </div>
                </div>
              )
            })}
          </div>
        )
      })()}
    </div>
  )
}

/* ─────────────────────────────── Page ─────────────────────────────── */

export default function MeetDetail() {
  const { id } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const { isAdmin } = useAuth()
  const [meet, setMeet] = useState(null)
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const rawTab = searchParams.get('tab') || 'results'
  const tab = ['results', 'medals', 'statistics', 'improved', 'gallery'].includes(rawTab) ? rawTab : 'results'
  const setTab = (t) => setSearchParams({ tab: t }, { replace: false })

  const refreshStats = () => {
    getChampionshipStats(id).then((res) => setStats(res.data)).catch(() => {})
  }

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(false)
    Promise.allSettled([getChampionship(id), getChampionshipStats(id)]).then(([meetRes, statsRes]) => {
      if (!alive) return
      const m = val(meetRes)
      if (!m) { setError(true); setLoading(false); return }
      setMeet(m)
      setStats(val(statsRes))
      setLoading(false)
    })
    return () => { alive = false }
  }, [id])

  if (loading) return <Loading label="Loading meet" />
  if (error || !meet) return <Empty label="Meet not found" />

  // National/Other meets show team column + club tally; strictly classification-driven
  const isNational = ['National', 'Other'].includes(meet.classification_name)
  const events = stats?.events || []

  return (
    <div>
      {/* header */}
      <div className="pad-lg rule-b">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <Flag code={meet.country_detail?.code} name={meet.country_detail?.name} large />
          <div style={{ flex: 1, minWidth: 260 }}>
            <div className="kicker" style={{ marginBottom: 6 }}>
              {meet.classification_name || 'Championship'}
              {meet.sub_classification_name ? ` · ${meet.sub_classification_name}` : ''}
            </div>
            <h1 style={{ margin: 0, letterSpacing: '-0.03em' }}>{meet.name}</h1>
            <div style={{ fontSize: 13, color: 'var(--color-neutral-700)', marginTop: 8 }}>
              {meet.location}
              {meet.country_detail ? `${meet.location ? ', ' : ''}${meet.country_detail.name}` : ''}
              {' · '}{formatDateRange(meet.date, meet.end_date)}
              {' · '}<span className="tag tag-dark" style={{ verticalAlign: 'middle' }}>{meet.pool}</span>
            </div>
          </div>
          {isAdmin && (
            <Link className="btn btn-secondary" to={`/import?championship=${id}`}>Import results</Link>
          )}
        </div>
      </div>

      {/* counts strip */}
      {stats && (
        <div className="counts counts-4">
          <div><div className="n">{formatNumber(stats.total_results ?? 0)}</div><div className="l">Results</div></div>
          <div><div className="n">{formatNumber(stats.total_swimmers ?? 0)}</div><div className="l">Swimmers</div></div>
          <div><div className="n">{formatNumber(stats.total_events ?? events.length)}</div><div className="l">Events</div></div>
          <div><div className="n" style={{ whiteSpace: 'nowrap' }}>{formatNumber(stats.male_count ?? 0)} / {formatNumber(stats.female_count ?? 0)}</div><div className="l" style={{ whiteSpace: 'nowrap' }}>Men / Women</div></div>
        </div>
      )}

      {/* tabs */}
      <div className="rule-b tabbar" style={{ padding: '14px 32px', overflowX: 'auto' }}>
        <Seg
          tabs
          options={[
            { value: 'results', label: 'Results' },
            { value: 'medals', label: 'Medals' },
            { value: 'statistics', label: 'Statistics' },
            { value: 'improved', label: 'Most improved' },
            { value: 'gallery', label: 'Gallery' },
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>

      {tab === 'results' && (
        <ResultsTab meetId={id} events={events} isNational={isNational} isAdmin={isAdmin} hasOpenPodium={!!meet.has_open_podium} onDataChanged={refreshStats} />
      )}
      {tab === 'medals' && <MedalsTab meetId={id} isNational={isNational} />}
      {tab === 'statistics' && <StatisticsTab meetId={id} stats={stats} />}
      {tab === 'improved' && <MostImprovedTab meetId={id} />}
      {tab === 'gallery' && <MeetGallery meetId={id} isAdmin={isAdmin} />}
    </div>
  )
}
