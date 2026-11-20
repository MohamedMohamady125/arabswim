import { useState, useEffect, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { getLiveMeets, getChampionships, getMeetProgram, getMeetLive, getChampionshipStats, getChampionshipResults, getMeetDocuments, uploadMeetDocument, deleteMeetDocument } from '../api/championships'
import { useAuth } from '../context/AuthContext'
import { getMedalSummary, getMedalClubSummary, getMedalSwimmerSummary } from '../api/medals'
import { resultsByCategory } from '../utils'
import { formatDateRange, formatNumber, formatDate, mediaUrl, nameInitials } from '../utils'
import Flag from '../components/Flag'
import { PageHead, Loading, Empty, MedalIcon, Seg } from '../components/ui'
import MeetProgramEditor from '../components/MeetProgramEditor'
import AthleteMeetCard from '../components/meets/AthleteMeetCard'
import MedalStandings from '../components/MedalStandings'
import Pic from '../components/Pic'

const LIVE_RED = 'var(--asw-slow)'
const POLL_MS = 60000

// Days elapsed within the meet window (1-based), clamped to [1, total]
function dayProgress(meet) {
  const start = new Date(meet.date?.split('/').reverse().join('-') || meet.date)
  let end = new Date(meet.end_date ? meet.end_date.split('/').reverse().join('-') : start)
  if (Number.isNaN(start.getTime())) return null
  // Guard against corrupt end dates (end before start, or an implausible
  // span). Swim meets run a handful of days, never months — treat anything
  // outside a sane window as a single-day meet rather than show "Day 126 of 178".
  const spanDays = Math.round((end - start) / 86400000)
  if (Number.isNaN(end.getTime()) || spanDays < 0 || spanDays > 31) {
    end = start
  }
  const total = Math.max(1, Math.round((end - start) / 86400000) + 1)
  const current = Math.min(total, Math.max(1, Math.floor((Date.now() - start.getTime()) / 86400000) + 1))
  return { current, total }
}

function LivePill({ small = false }) {
  return (
    <span style={{
      background: LIVE_RED, color: '#fff', display: 'inline-flex', alignItems: 'center',
      gap: 6, fontSize: small ? 10.5 : 11, fontWeight: 800, letterSpacing: '0.08em',
      padding: small ? '3px 9px' : '4px 12px', borderRadius: 0,
    }}>
      <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', background: '#fff', animation: 'pulse 1.4s ease-in-out infinite' }} />
      LIVE
    </span>
  )
}

/* Small medal trio — real medal icons instead of flat dots */
function MedalDots({ size = 12, gap = 1 }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap }}>
      <MedalIcon type="GOLD" size={size} />
      <MedalIcon type="SILVER" size={size} />
      <MedalIcon type="BRONZE" size={size} />
    </span>
  )
}

const SESSION_LABEL = { HEATS: 'Heats', SEMIS: 'Semifinals', FINALS: 'Finals' }
const GENDER_STYLE = {
  M: { label: 'Men', color: 'var(--color-accent)', bg: 'var(--color-accent-100)' },
  F: { label: 'Women', color: 'var(--color-accent-2-700)', bg: 'var(--color-accent-2-100)' },
  X: { label: 'Mixed', color: 'var(--color-neutral-700)', bg: 'var(--color-neutral-200)' },
}

/* Inline result list inside an expanded program row — app style, no navigation */
function InlineResults({ meetId, meet, item }) {
  const [rows, setRows] = useState(null)
  const [athlete, setAthlete] = useState(null)
  const [failed, setFailed] = useState(false)
  const [retry, setRetry] = useState(0)
  const isFinal = item.session === 'FINALS'

  useEffect(() => {
    const params = { event: item.event, gender: item.gender }
    if (item.session === 'HEATS') params.round_type = 'Prelims'
    setFailed(false)
    getChampionshipResults(meetId, params)
      .then((res) => setRows(Array.isArray(res.data) ? res.data : res.data?.results || []))
      .catch(() => { setRows([]); setFailed(true) })
  }, [meetId, item.event, item.gender, item.session, retry])

  if (rows === null) return <div style={{ padding: '6px 0' }}><Loading label="Loading results" /></div>
  // a failed load is not "no results yet"
  if (failed) {
    return (
      <div role="alert" style={{ padding: '12px 16px', fontSize: 13, color: 'var(--color-neutral-700)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        These results could not be loaded.
        <button type="button" className="btn btn-secondary" onClick={() => { setRows(null); setRetry((n) => n + 1) }}>Try again</button>
      </div>
    )
  }
  if (rows.length === 0) {
    return <div style={{ padding: '12px 16px', fontSize: 13, color: 'var(--color-neutral-700)' }}>No results uploaded yet.</div>
  }
  // DQ / DNS rows go last inside their own category
  const noTime = (r) => !r.time_centiseconds || (r.hc_type && r.hc_type !== 'HC' && r.hc_type !== 'TLD')
  const groups = resultsByCategory(rows, item.age_category)
    .map((g) => ({ ...g, rows: [...g.rows.filter((r) => !noTime(r)), ...g.rows.filter(noTime)] }))
  return (
    <div className="live-fade-in" style={{ background: 'var(--color-surface)', borderTop: '1px solid var(--color-neutral-200)' }}>
      {athlete && (
        <AthleteMeetCard swimmer={athlete} meet={{ id: meetId, name: meet?.name }} onClose={() => setAthlete(null)} />
      )}
      <div style={{ maxHeight: 430, overflowY: 'auto' }}>
        {/* Each age category is its own race with its own podium: a program
            line shows only its category; a line with no category shows every
            category as a separate block — never one mixed ranking. */}
        {groups.length === 0 && (
          <div style={{ padding: '12px 16px', fontSize: 13, color: 'var(--color-neutral-700)' }}>No results uploaded for this category yet.</div>
        )}
        {groups.map((g) => [
          (groups.length > 1 || (!item.age_category && g.category)) && (
            <div key={`h-${g.key}`} className="live-cat-head">{g.category || 'Open'}</div>
          ),
          ...g.rows.map((r, i) => {
          const clickable = r.swimmer_detail && !r.swimmer_detail.is_relay_team
          return (
            <div
              key={r.id}
              role={clickable ? 'button' : undefined}
              tabIndex={clickable ? 0 : undefined}
              onClick={() => clickable && setAthlete(r.swimmer_detail)}
              onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && clickable) { e.preventDefault(); setAthlete(r.swimmer_detail) } }}
              className={clickable ? 'live-result-row row-link' : undefined}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px',
                borderBottom: '1px solid var(--color-neutral-200)', background: '#fff',
                cursor: clickable ? 'pointer' : 'default',
              }}
            >
              <span style={{ width: 24, flex: 'none', display: 'flex', justifyContent: 'center' }}>
                {r.is_hc ? (
                  <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--color-neutral-500)' }}>{r.hc_type || 'HC'}</span>
                ) : isFinal && i <= 2 ? (
                  <MedalIcon type={['GOLD', 'SILVER', 'BRONZE'][i]} size={18} style={{ display: 'block' }} />
                ) : (
                  <span className="asw-num" style={{ fontSize: 13, fontWeight: 800, color: 'var(--color-neutral-500)' }}>
                    {r.original_rank || i + 1}
                  </span>
                )}
              </span>
              <Flag code={r.nationality_detail?.code || r.swimmer_detail?.nationality_detail?.code} />
              <span style={{
                flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {r.swimmer_detail?.name}
              </span>
              {r.reaction_time && (
                <span className="asw-num hide-mobile" style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-neutral-500)', flex: 'none' }}>
                  RT {Number(r.reaction_time).toFixed(2)}
                </span>
              )}
              <span className="asw-time" style={{ fontWeight: 800, fontSize: 14, flex: 'none' }}>
                {r.formatted_time}
              </span>
              <span className="asw-num hide-mobile" style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-neutral-500)', width: 34, textAlign: 'right', flex: 'none' }}>
                {r.fina_points || '—'}
              </span>
            </div>
          )
          }),
        ])}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 16px' }}>
        <Link
          to={`/meets/${meetId}?tab=results&event=${item.event}&gender=${item.gender}&day=${item.day}&session=${item.session}`}
          style={{ display: 'inline-flex', alignItems: 'center', minHeight: 32 /* Fitts's Law; strip stays the same height */, fontSize: 12, fontWeight: 800, textDecoration: 'none', color: 'var(--color-accent)' }}
        >
          Heats, splits & more ›
        </Link>
      </div>
    </div>
  )
}

/* One program entry — order no, event name, gender, chips. Official rows expand in place. */
// `grouped`: the row sits under its event's heading and is named by its age category
function ProgramRow({ item, seq, meetId, meet, hasResults, last, grouped = false }) {
  const [open, setOpen] = useState(false)
  const isFinal = item.session === 'FINALS'
  const g = GENDER_STYLE[item.gender] || GENDER_STYLE.X
  const inner = (
    <div className="live-row" style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
      borderBottom: last ? 'none' : '1px solid var(--color-neutral-200)',
      background: '#fff',
    }}>
      <span className="asw-num" style={{
        width: 30, height: 30, borderRadius: '50%', flex: 'none', display: 'inline-flex', alignItems: 'center',
        justifyContent: 'center', fontSize: 13, fontWeight: 800,
        background: isFinal ? 'var(--color-accent-800)' : '#fff',
        color: isFinal ? '#fff' : 'var(--color-neutral-700)',
        border: isFinal ? 'none' : '1.5px solid var(--color-neutral-300)',
      }}>
        {/* under an event heading the rows are numbered 1..n in their own order */}
        {grouped ? seq : (item.order || seq)}
      </span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 14, lineHeight: 1.3 }}>
            {grouped ? (item.age_category || 'Open') : item.event_name}
          </span>
          {!grouped && (
            <span style={{
              fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase',
              padding: '2px 8px', borderRadius: 0, background: g.bg, color: g.color, flex: 'none',
            }}>
              {g.label}
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, color: 'var(--color-neutral-700)', marginTop: 3, fontWeight: 600 }}>
          {SESSION_LABEL[item.session] || item.session}
          {!grouped && item.age_category ? ` · ${item.age_category}` : ''}
        </div>
      </div>
      {isFinal && (
        <span className="hide-mobile" style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800,
          letterSpacing: '0.08em', padding: '4px 12px', borderRadius: 0,
          border: '1px solid color-mix(in srgb, var(--asw-gold) 55%, #fff)', color: 'var(--color-accent-900)',
          background: 'color-mix(in srgb, var(--asw-gold) 18%, #fff)', flex: 'none',
        }}>
          <MedalDots size={13} /> MEDAL
        </span>
      )}
      {hasResults ? (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 4, flex: 'none',
          fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', padding: '4px 12px', borderRadius: 0,
          background: 'var(--color-accent-800)', color: '#fff',
        }}>
          OFFICIAL
          <span className="live-chevron" style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s ease' }}>›</span>
        </span>
      ) : (
        <span style={{
          fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', padding: '4px 12px', borderRadius: 0, flex: 'none',
          border: '1px solid var(--color-neutral-300)', color: 'var(--color-neutral-500)', background: '#fff',
        }}>
          SCHEDULED
        </span>
      )}
    </div>
  )
  if (!hasResults) return inner
  return (
    <div>
      <div
        className="live-row-link row-link"
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen((v) => !v) } }}
        style={{ cursor: 'pointer' }}
      >
        {inner}
      </div>
      {open && <InlineResults meetId={meetId} meet={meet} item={item} />}
    </div>
  )
}

const ROUND_ORDER = { HEATS: 0, SEMIS: 1, FINALS: 2 }
// One cluster per event + gender, in program order; inside it the age
// categories keep the order they first appear in, heats before finals.
function clusterByEvent(items) {
  const clusters = []
  items.forEach((it) => {
    const key = `${it.event}|${it.gender}`
    let c = clusters.find((x) => x.key === key)
    if (!c) { c = { key, name: it.event_name, gender: it.gender, items: [], cats: [] }; clusters.push(c) }
    const cat = it.age_category || ''
    if (!c.cats.includes(cat)) c.cats.push(cat)
    c.items.push(it)
  })
  clusters.forEach((c) => {
    c.items = c.items
      .map((it, i) => [it, i])
      .sort((a, b) => (c.cats.indexOf(a[0].age_category || '') - c.cats.indexOf(b[0].age_category || ''))
        || ((ROUND_ORDER[a[0].session] ?? 3) - (ROUND_ORDER[b[0].session] ?? 3)) || (a[1] - b[1]))
      .map(([it]) => it)
  })
  return clusters
}

/* Program for one day, grouped Morning / Evening as session cards */
function DayProgram({ day, meetId, meet, resultKeys }) {
  if (!day || (day.items || []).length === 0) {
    return <Empty label="No program published for this day yet." hint="Pick another day in the Schedule tab, or check back later." />
  }
  // Unnumbered items (order 0/null) go AFTER numbered ones — never a
  // leading "–" row before event 1.
  const bySchedule = (a, b) => (a.order || 9999) - (b.order || 9999) || (a.id || 0) - (b.id || 0)
  const items = [...day.items].sort(bySchedule)
  const groups = []
  const morning = items.filter((i) => i.time_of_day === 'MORNING')
  const evening = items.filter((i) => i.time_of_day === 'EVENING')
  const rest = items.filter((i) => i.time_of_day !== 'MORNING' && i.time_of_day !== 'EVENING')
  if (morning.length) groups.push(['Morning', 'Heats & semifinals', morning, false])
  if (evening.length) groups.push(['Evening', 'Finals session', evening, true])
  if (rest.length) {
    const allFinals = rest.every((i) => i.session === 'FINALS')
    groups.push([allFinals ? 'Finals' : 'Program', allFinals ? 'Medal events' : 'All events', rest, allFinals])
  }
  return (
    <div className="live-fade-in" style={{ display: 'grid', gap: 16 }}>
      {groups.map(([label, sub, items, isFinals]) => (
        <div key={label} style={{
          border: '1px solid var(--color-neutral-200)', borderRadius: 0, overflow: 'hidden',
          border: '1px solid var(--color-divider)',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
            background: isFinals ? 'var(--color-accent-800)' : 'var(--color-surface)',
            borderBottom: '1px solid var(--color-neutral-200)',
          }}>
            <span style={{
              fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 13,
              textTransform: 'uppercase', letterSpacing: '0.08em',
              color: isFinals ? '#fff' : 'var(--color-accent-800)',
            }}>
              {label}
            </span>
            <span style={{ fontSize: 12, fontWeight: 600, color: isFinals ? 'rgba(255,255,255,.65)' : 'var(--color-neutral-600)' }}>
              {sub}
            </span>
            {isFinals && <span style={{ marginLeft: 'auto' }}><MedalDots size={13} /></span>}
            <span style={{
              marginLeft: isFinals ? 10 : 'auto', fontSize: 11, fontWeight: 700,
              color: isFinals ? 'rgba(255,255,255,.65)' : 'var(--color-neutral-500)',
            }}>
              {items.length} {items.length === 1 ? 'event' : 'events'}
            </span>
          </div>
          {/* Proximity: an event swum by several age categories is named once,
              with its categories under it in a fixed order (heats before
              finals inside each category) — not scattered down the list. */}
          {clusterByEvent(items).map((c, ci, all) => {
            const row = (item, i, grouped, last) => (
              <ProgramRow
                key={item.id}
                item={item}
                seq={i + 1}
                meetId={meetId}
                meet={meet}
                hasResults={resultKeys.has(`${item.event}|${item.gender}`)}
                last={last}
                grouped={grouped}
              />
            )
            if (c.items.length === 1) return row(c.items[0], ci, false, ci === all.length - 1)
            const g = GENDER_STYLE[c.gender] || GENDER_STYLE.X
            return (
              <div key={c.key}>
                <div className="live-event-head">
                  <span>{c.name}</span>
                  <span style={{ background: g.bg, color: g.color }}>{g.label}</span>
                  <span className="live-event-count">{c.items.length} races</span>
                </div>
                {c.items.map((item, i) => row(item, i, true, ci === all.length - 1 && i === c.items.length - 1))}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

/* Small club logo / initials badge for club medal rows */
function ClubBadge({ logo, name, size = 22 }) {
  if (logo) {
    return <Pic kind="logo" w={96} src={logo} style={{ width: size, height: size, minWidth: size, borderRadius: '50%', background: '#fff', border: '1px solid var(--color-neutral-200)' }} />
  }
  const initials = nameInitials(name)
  return (
    <span style={{
      width: size, height: size, minWidth: size, borderRadius: '50%', display: 'inline-flex',
      alignItems: 'center', justifyContent: 'center', fontSize: Math.max(10.5, size * 0.38), fontWeight: 800,
      background: 'var(--color-accent-100)', color: 'var(--color-accent-800)',
    }}>{initials}</span>
  )
}

/* Medal standings: shared Olympic-style component (podium cards + bands).
   Two buttons, the same rule as the meet page: the first is Countries at an
   international meet or Clubs at a national one (never both — at an Arab
   championship the "clubs" are the countries again), the second is Swimmers. */
function MedalsPanel({ rows, clubRows, swimmerRows, isNational }) {
  const hasCountries = (rows || []).length > 0
  const hasClubs = (clubRows || []).length > 0
  const hasSwimmers = (swimmerRows || []).length > 0
  // which team table this meet has: clubs for a national meet, countries otherwise
  // (falls back to whichever one has medals)
  const teamScope = (isNational && hasClubs) || !hasCountries ? 'club' : 'country'
  const hasTeam = teamScope === 'club' ? hasClubs : hasCountries
  const [scope, setScope] = useState('team')

  if (!hasCountries && !hasClubs && !hasSwimmers) {
    return <Empty label="Medals will appear here once finals are official." />
  }

  const active = scope === 'swimmer' && hasSwimmers ? 'swimmer' : hasTeam ? 'team' : 'swimmer'
  const showClubs = active === 'team' && teamScope === 'club'

  return (
    <div className="live-fade-in">
      {hasTeam && hasSwimmers && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <Seg
            options={[{ value: 'team', label: teamScope === 'club' ? 'Clubs' : 'Countries' }, { value: 'swimmer', label: 'Swimmers' }]}
            value={active}
            onChange={setScope}
          />
        </div>
      )}
      {active === 'swimmer' ? (
        <MedalStandings
          rows={swimmerRows}
          entityHeader="Swimmer"
          rowKey={(r, i) => r.swimmer__id || i}
          renderPodiumChip={(r) => (
            <>
              <Flag code={r.nationality__code} name={r.nationality__name} />
              <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.swimmer__name}</span>
            </>
          )}
          renderEntity={(r) => (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <Flag code={r.nationality__code} name={r.nationality__name} />
              <Link to={`/swimmers/${r.swimmer__id}`} style={{ fontWeight: 800, color: 'inherit', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.swimmer__name}</Link>
            </span>
          )}
          // long names need the full width on a phone
          stackPodiumOnPhone
        />
      ) : showClubs ? (
        <MedalStandings
          rows={clubRows}
          entityHeader="Club"
          rowKey={(r, i) => r.team_id || r.result__team || i}
          renderPodiumChip={(r) => (
            <>
              <ClubBadge logo={r.team_logo} name={r.result__team} size={20} />
              <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.result__team || '—'}</span>
            </>
          )}
          renderEntity={(r) => (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <ClubBadge logo={r.team_logo} name={r.result__team} />
              {r.team_id ? (
                <Link to={`/teams/${r.team_id}`} style={{ fontWeight: 800, color: 'inherit', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.result__team}</Link>
              ) : (
                <span style={{ fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.result__team || '—'}</span>
              )}
            </span>
          )}
        />
      ) : (
        <MedalStandings
          rows={rows}
          entityHeader="Country"
          rowKey={(r, i) => r.swimmer__nationality__code || i}
          renderPodiumChip={(r) => (
            <>
              <Flag code={r.swimmer__nationality__code} />
              <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 14 }}>{r.swimmer__nationality__code}</span>
            </>
          )}
          renderEntity={(r) => (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Flag code={r.swimmer__nationality__code} />
              <span style={{ fontWeight: 800 }}>{r.swimmer__nationality__code}</span>
              <span className="hide-mobile" style={{ color: 'var(--color-neutral-700)', fontSize: 13 }}>{r.swimmer__nationality__name}</span>
            </span>
          )}
        />
      )}
    </div>
  )
}

/* Start lists / Reports: PDF documents uploaded during the meet.
   Public sees download cards; admins can upload and delete. */
function DocumentsPanel({ meetId, kind, docs, onChanged }) {
  const { isAdmin } = useAuth()
  const [file, setFile] = useState(null)
  const [title, setTitle] = useState('')
  const [day, setDay] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('') // Peak-End Rule: confirm the upload

  const label = kind === 'STARTLIST' ? 'start lists' : 'reports'
  const rows = (docs || []).filter((d) => d.kind === kind)

  const upload = async () => {
    if (!file) return
    setBusy(true); setErr(''); setOk('')
    const fd = new FormData()
    fd.append('file', file)
    fd.append('kind', kind)
    if (title.trim()) fd.append('title', title.trim())
    if (day) fd.append('day', day)
    try {
      await uploadMeetDocument(meetId, fd)
      setFile(null); setTitle(''); setDay('')
      setOk('Uploaded.')
      onChanged()
    } catch (e) {
      setErr(e.response?.data?.error || 'Upload failed. Check the file is a PDF and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="live-fade-in" style={{ display: 'grid', gap: 12 }}>
      {rows.length === 0 && <Empty label={`No ${label} published yet.`} />}
      {rows.length > 0 && (
        <div style={{ border: '1px solid var(--color-neutral-200)', borderRadius: 0, overflow: 'hidden', background: '#fff' }}>
          {rows.map((d, i) => (
            <div key={d.id} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
              borderBottom: i === rows.length - 1 ? 'none' : '1px solid var(--color-neutral-200)',
            }}>
              <span style={{
                width: 34, height: 34, borderRadius: 0, flex: 'none', display: 'inline-flex',
                alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800,
                background: 'var(--color-accent-100)', color: 'var(--color-accent-800)',
              }}>PDF</span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 800, fontFamily: 'var(--font-heading)', fontSize: 14, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {d.title}
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-neutral-700)', fontWeight: 600, marginTop: 2 }}>
                  {d.day ? `Day ${d.day} · ` : ''}{formatDate(d.uploaded_at)}
                </div>
              </div>
              <a
                href={mediaUrl(d.file)} target="_blank" rel="noreferrer"
                aria-label={`Open ${d.title}`}
                style={{
                  display: 'inline-flex', alignItems: 'center', minHeight: 32,
                  flex: 'none', fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase',
                  padding: '8px 16px', borderRadius: 0, textDecoration: 'none',
                  background: 'var(--color-accent-800)', color: '#fff',
                }}
              >
                Open
              </a>
              {isAdmin && (
                <button
                  type="button"
                  aria-label={`Delete ${d.title}`}
                  onClick={() => {
                    // destructive: ask first, and say so if it fails
                    if (!window.confirm(`Delete "${d.title}"? This cannot be undone.`)) return
                    setErr(''); setOk('')
                    deleteMeetDocument(meetId, d.id).then(() => { setOk('Deleted.'); onChanged() }).catch(() => setErr('Could not delete the file. Try again.'))
                  }}
                  style={{ minHeight: 32, flex: 'none', border: '1px solid var(--color-neutral-300)', background: '#fff', color: 'var(--asw-slow)', borderRadius: 0, padding: '6px 12px', fontSize: 11, fontWeight: 800, cursor: 'pointer' }}
                >
                  Delete
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {isAdmin && (
        <div style={{ border: '1px dashed var(--color-neutral-300)', borderRadius: 0, padding: '12px 16px', background: 'var(--color-surface)', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="file" aria-label="PDF file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} style={{ fontSize: 12 }} />
          <input className="input" aria-label="Title (optional)" placeholder="Title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} style={{ flex: '1 1 140px', width: 'auto' }} />
          <input className="input" aria-label="Day" placeholder="Day" type="number" min="1" value={day} onChange={(e) => setDay(e.target.value)} style={{ flex: '0 1 70px', width: 'auto' }} />
          <button type="button" className="btn btn-primary" disabled={!file || busy} onClick={upload}>
            {busy ? 'Uploading…' : `Upload ${kind === 'STARTLIST' ? 'start list' : 'report'}`}
          </button>
          {err && <span role="alert" style={{ fontSize: 12, color: 'var(--asw-slow)', fontWeight: 700 }}>{err}</span>}
          {ok && !err && <span role="status" style={{ fontSize: 12, color: 'var(--asw-fast)', fontWeight: 700 }}>{ok}</span>}
        </div>
      )}
    </div>
  )
}

/* Live hub for one selected meet: TODAY / SCHEDULE / MEDALS */
function LiveHub({ meet }) {
  const { isAdmin } = useAuth()
  const [tab, setTab] = useState('today') // 'today' | 'schedule' | 'medals'
  const [program, setProgram] = useState(null)
  const [live, setLive] = useState(null)
  const [stats, setStats] = useState(null)
  const [medals, setMedals] = useState(null)
  const [clubMedals, setClubMedals] = useState(null)
  const [swimmerMedals, setSwimmerMedals] = useState(null)
  const [editProgram, setEditProgram] = useState(false)
  const [docs, setDocs] = useState([])
  const [selectedDay, setSelectedDay] = useState(null)
  const [updatedAt, setUpdatedAt] = useState(null)
  const pollRef = useRef(null)
  const chipsRef = useRef(null)

  // keep the selected day chip in view (phones: today can be off-screen)
  useEffect(() => {
    if (tab !== 'schedule') return
    const t = setTimeout(() => {
      chipsRef.current?.querySelector('.active')?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
    }, 60)
    return () => clearTimeout(t)
  }, [tab, selectedDay, program])

  const refresh = () => {
    getMeetLive(meet.id).then((r) => { setLive(r.data); setUpdatedAt(new Date()) }).catch(() => setLive((cur) => cur || {})) // a failed fetch must not leave "Loading" forever
    getChampionshipStats(meet.id).then((r) => setStats(r.data)).catch(() => {})
    getMedalSummary({ championship: meet.id }).then((r) => setMedals(r.data)).catch(() => setMedals([]))
    getMedalClubSummary({ championship: meet.id }).then((r) => setClubMedals(r.data)).catch(() => setClubMedals([]))
    getMedalSwimmerSummary({ championship: meet.id, limit: 'all' }).then((r) => setSwimmerMedals(r.data)).catch(() => setSwimmerMedals([]))
    getMeetDocuments(meet.id).then((r) => setDocs(Array.isArray(r.data) ? r.data : [])).catch(() => setDocs([]))
  }

  useEffect(() => {
    setProgram(null); setLive(null); setStats(null); setMedals(null); setClubMedals(null); setSwimmerMedals(null); setSelectedDay(null); setTab('today'); setEditProgram(false)
    getMeetProgram(meet.id).then((r) => setProgram(r.data)).catch(() => setProgram({ days: [] }))
    refresh()
    pollRef.current = setInterval(refresh, POLL_MS)
    return () => clearInterval(pollRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meet.id])

  // events with results uploaded → "Official"
  const resultKeys = useMemo(() => {
    const s = new Set()
    for (const e of stats?.events || []) s.add(`${e.event_id}|${e.gender}`)
    return s
  }, [stats])

  const days = program?.days || []
  const prog = dayProgress(meet)
  const todayNum = useMemo(() => {
    const t = (live?.days || []).find((d) => d.is_today)
    if (t) return t.day
    return prog ? prog.current : 1
  }, [live, prog])
  const todayDay = days.find((d) => d.day === todayNum) || days[0]
  const scheduleDay = days.find((d) => d.day === (selectedDay ?? todayNum)) || days[0]

  const finalsDays = useMemo(
    () => new Set(days.filter((d) => (d.items || []).some((i) => i.session === 'FINALS')).map((d) => d.day)),
    [days],
  )

  const loading = !program || !live

  const TABS = [
    ['today', 'Today'],
    ['schedule', 'Schedule'],
    ['medals', 'Medals'],
    ['startlist', 'Startlist'],
    ['reports', 'Reports'],
  ]

  const refreshDocs = () => getMeetDocuments(meet.id).then((r) => setDocs(Array.isArray(r.data) ? r.data : [])).catch(() => {})

  const weekday = (iso) => {
    const d = new Date(iso + 'T00:00:00')
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { weekday: 'short' })
  }

  return (
    <div style={{ marginTop: 20 }}>
      {/* ── hero card ── */}
      <div style={{
        borderRadius: 0, overflow: 'hidden', marginBottom: 18,
        border: '1px solid var(--color-divider)',
      }}>
        <div style={{
          background: 'var(--color-accent-800)',
          color: '#fff', padding: '20px 22px 16px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <LivePill />
            {prog && (
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(255,255,255,.7)', textTransform: 'uppercase' }}>
                Day {prog.current} of {prog.total}
              </span>
            )}
            <span style={{ marginLeft: 'auto', fontSize: 12, color: 'rgba(255,255,255,.7)', fontWeight: 600 }}>
              <span className="asw-num" style={{ fontWeight: 800, color: '#fff', fontSize: 14 }}>{formatNumber(live?.total_results ?? meet.results_count ?? 0)}</span>
              {' '}results in
            </span>
          </div>
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 'clamp(19px, 3.4vw, 26px)', marginTop: 10, lineHeight: 1.2, letterSpacing: '-0.01em' }}>
            {meet.name}
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,.75)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontWeight: 600 }}>
            {meet.country_detail && <Flag code={meet.country_detail.code} />}
            {meet.location || meet.country_detail?.name}
            <span style={{ opacity: 0.5 }}>·</span>
            {formatDateRange(meet.date, meet.end_date)}
          </div>
          {/* day progress bar */}
          {prog && prog.total > 1 && (
            <div style={{ display: 'flex', gap: 4, marginTop: 14 }}>
              {Array.from({ length: prog.total }, (_, i) => (
                <span key={i} style={{
                  flex: 1, height: 4, borderRadius: 0,
                  background: i + 1 < prog.current ? 'rgba(255,255,255,.85)'
                    : i + 1 === prog.current ? LIVE_RED
                    : 'rgba(255,255,255,.22)',
                }} />
              ))}
            </div>
          )}
        </div>
        {/* pill tabs */}
        <div className="live-tabrow" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', background: '#fff', borderTop: '1px solid rgba(255,255,255,.1)' }}>
          {TABS.map(([key, label]) => {
            const active = tab === key
            return (
              <button
                key={key}
                type="button"
                aria-pressed={active}
                onClick={() => setTab(key)}
                className={`live-tabpill${active ? ' active' : ''}`}
                style={{
                  padding: '8px 22px', borderRadius: 0, fontSize: 12, fontWeight: 800, cursor: 'pointer',
                  letterSpacing: '0.08em', textTransform: 'uppercase', whiteSpace: 'nowrap',
                  background: active ? 'var(--color-accent-800)' : '#fff',
                  color: active ? '#fff' : 'var(--color-neutral-600)',
                  border: `1.5px solid ${active ? 'var(--color-accent-800)' : 'var(--color-neutral-300)'}`,
                }}
              >
                {label}
              </button>
            )
          })}
          <div className="live-tabmeta" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 16, flex: 'none' }}>
            {updatedAt && (
              <span className="hide-mobile" style={{ fontSize: 11, color: 'var(--color-neutral-500)', fontWeight: 600 }}>
                Updated {updatedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} · auto-refreshes
              </span>
            )}
          </div>
        </div>
      </div>

      {loading ? <Loading label="Loading live data" /> : (
        <>
          {tab === 'today' && (
            <DayProgram day={todayDay} meetId={meet.id} meet={meet} resultKeys={resultKeys} />
          )}

          {tab === 'schedule' && (
            <div className="live-fade-in">
              {/* admin: edit the program in place — add events to days, reorder, sessions */}
              {isAdmin && (
                <div style={{ marginBottom: 14 }}>
                  <button
                    type="button"
                    aria-expanded={editProgram}
                    className="btn btn-secondary" /* Von Restorff: the editor's own Save is the one primary */
                    onClick={() => setEditProgram((v) => !v)}
                  >
                    {editProgram ? 'Close program editor' : 'Edit program'}
                  </button>
                  {editProgram && (
                    <div style={{ marginTop: 12 }}>
                      <MeetProgramEditor
                        champId={meet.id}
                        onSaved={() => getMeetProgram(meet.id).then((r) => setProgram(r.data)).catch(() => {})}
                      />
                    </div>
                  )}
                </div>
              )}
              {/* day chips */}
              <div ref={chipsRef} style={{ display: 'flex', gap: 12, overflowX: 'auto', padding: '10px 2px 12px', marginBottom: 14 }}>
                {days.map((d) => {
                  const active = d.day === (selectedDay ?? todayNum)
                  const isToday = d.day === todayNum
                  const hasFinals = finalsDays.has(d.day)
                  return (
                    <button
                      key={d.day}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setSelectedDay(d.day)}
                      className={`live-daychip${active ? ' active' : ''}`}
                      style={{
                        flex: 'none', minWidth: 84, padding: '10px 12px 8px', borderRadius: 0, cursor: 'pointer',
                        textAlign: 'center', position: 'relative',
                        background: active ? 'var(--color-accent-800)' : '#fff',
                        color: active ? '#fff' : 'inherit',
                        border: `1.5px solid ${active ? 'var(--color-accent-800)' : 'var(--color-neutral-300)'}`,
                        boxShadow: active ? '0 4px 14px rgba(12,35,64,.22)' : 'none',
                      }}
                    >
                      {isToday && (
                        <span style={{
                          position: 'absolute', top: -7, left: '50%', transform: 'translateX(-50%)',
                          fontSize: 11, lineHeight: 1.2, fontWeight: 800, letterSpacing: '0.08em', padding: '1px 8px',
                          borderRadius: 0, background: LIVE_RED, color: '#fff',
                        }}>
                          TODAY
                        </span>
                      )}
                      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', opacity: active ? 0.75 : 0.55 }}>
                        {weekday(d.date) || `Day ${d.day}`}
                      </div>
                      <div className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontSize: 20, fontWeight: 800, marginTop: 2, lineHeight: 1 }}>
                        {d.date ? Number(d.date.slice(8, 10)) : d.day}
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 700, marginTop: 3, opacity: active ? 0.75 : 0.55, letterSpacing: '0.08em' }}>
                        DAY {d.day}
                      </div>
                      <div style={{ marginTop: 4, height: 11 }}>
                        {hasFinals && <MedalDots size={11} gap={0} />}
                      </div>
                    </button>
                  )
                })}
              </div>
              <DayProgram day={scheduleDay} meetId={meet.id} meet={meet} resultKeys={resultKeys} />
            </div>
          )}

          {tab === 'medals' && <MedalsPanel rows={medals} clubRows={clubMedals} swimmerRows={swimmerMedals} isNational={['National', 'Other'].includes(meet.classification_name)} />}

          {tab === 'startlist' && <DocumentsPanel meetId={meet.id} kind="STARTLIST" docs={docs} onChanged={refreshDocs} />}

          {tab === 'reports' && <DocumentsPanel meetId={meet.id} kind="REPORT" docs={docs} onChanged={refreshDocs} />}
        </>
      )}
    </div>
  )
}

/* Selectable meet card (when several meets are live at once) */
function MeetCard({ meet, active, onSelect }) {
  const prog = dayProgress(meet)
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onSelect}
      className="live-daychip"
      style={{
        textAlign: 'left', cursor: 'pointer', display: 'block', width: '100%',
        border: `2px solid ${active ? 'var(--color-accent-800)' : 'var(--color-neutral-200)'}`,
        borderRadius: 0, padding: '16px 16px', background: '#fff',
        boxShadow: active ? '0 4px 14px rgba(12,35,64,.16)' : '0 1px 4px rgba(12,35,64,.05)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <LivePill small />
        {prog && <span className="micro">Day {prog.current} of {prog.total}</span>}
      </div>
      <div style={{ fontWeight: 800, fontFamily: 'var(--font-heading)', fontSize: 16, lineHeight: 1.25, marginBottom: 6 }}>
        {meet.name}
      </div>
      <div className="micro" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {meet.country_detail && <Flag code={meet.country_detail.code} />}
        {meet.location || meet.country_detail?.name}
      </div>
    </button>
  )
}

export default function Live() {
  const [meets, setMeets] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [failed, setFailed] = useState(false)
  const [retry, setRetry] = useState(0)
  const [recent, setRecent] = useState([])

  useEffect(() => {
    setFailed(false)
    getLiveMeets().then((res) => {
      const rows = Array.isArray(res.data) ? res.data : res.data?.results || []
      setMeets(rows)
      if (rows.length > 0) setSelectedId(rows[0].id)
      // Paradox of the Active User: with nothing live, the page still leads
      // somewhere — the latest meets that already have results.
      if (rows.length === 0) {
        getChampionships({ page_size: 30, ordering: '-date' })
          .then((r) => {
            const all = Array.isArray(r.data) ? r.data : r.data?.results || []
            setRecent(all.filter((m) => (m.results_count ?? 0) > 0).slice(0, 3))
          })
          .catch(() => {})
      }
    }).catch(() => { setMeets([]); setFailed(true) })
  }, [retry])

  if (!meets) return <Loading label="Loading live meets" />

  const selected = meets.find((m) => m.id === selectedId) || meets[0]

  return (
    <div>
      <PageHead
        title="Live results"
        sub="Meets happening right now — program, results and medal standings, session by session."
      />
      {meets.length === 0 ? (
        <div className="pad-lg">
          {failed ? (
            <Empty label="Live results could not be loaded" hint="Check your connection and try again.">
              <button type="button" className="btn btn-secondary" onClick={() => { setMeets(null); setRetry((n) => n + 1) }}>Try again</button>
            </Empty>
          ) : (
            <Empty label="No meets are live right now" hint="This page fills in during a meet: the day's program, results as they come in and the medal table.">
              <Link to="/calendar" className="btn btn-secondary">See upcoming meets in the calendar</Link>
            </Empty>
          )}
          {!failed && recent.length > 0 && (
            <div style={{ maxWidth: 640, margin: '8px auto 0' }}>
              <div className="kicker" style={{ marginBottom: 8 }}>Latest results</div>
              <div style={{ border: '1px solid var(--color-divider)' }}>
                {recent.map((m, i) => (
                  <Link
                    key={m.id}
                    to={`/meets/${m.id}?tab=results`}
                    className="row-link"
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', minHeight: 48, color: 'inherit', textDecoration: 'none', borderTop: i ? '1px solid var(--color-divider)' : 'none' }}
                  >
                    <Flag code={m.country_detail?.code} name={m.country_detail?.name} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 16, lineHeight: 1.25 }}>{m.name}</span>
                      <span style={{ display: 'block', fontSize: 12, color: 'var(--color-neutral-700)', marginTop: 2 }}>{formatDateRange(m.date, m.end_date)}</span>
                    </span>
                    <span aria-hidden="true" style={{ color: 'var(--color-neutral-700)' }}>→</span>
                  </Link>
                ))}
              </div>
              <div style={{ marginTop: 10 }}>
                <Link to="/championships" style={{ fontSize: 13, fontWeight: 600 }}>All meets →</Link>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="pad-lg">
          {meets.length > 1 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
              {meets.map((m) => (
                <MeetCard key={m.id} meet={m} active={m.id === selected?.id} onSelect={() => setSelectedId(m.id)} />
              ))}
            </div>
          )}
          {selected && <LiveHub meet={selected} />}
        </div>
      )}
    </div>
  )
}
