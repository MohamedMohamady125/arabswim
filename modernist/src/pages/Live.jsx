import { useState, useEffect, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { getLiveMeets, getChampionships, getMeetProgram, getMeetLive, getChampionshipResults, getMeetDocuments, uploadMeetDocument, deleteMeetDocument } from '../api/championships'
import { useAuth } from '../context/AuthContext'
import { getMedalSummary, getMedalClubSummary, getMedalSwimmerSummary } from '../api/medals'
import { resultsByCategory, normCategory } from '../utils'
import { formatDateRange, formatNumber, formatDate, mediaUrl, nameInitials, displayCategory, poolLabel, formatPoints } from '../utils'
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

const SESSION_LABEL = { HEATS: 'Heats', SEMIS: 'Semifinals', FINALS: 'Finals' }
const GENDER_STYLE = {
  M: { label: 'Men', color: 'var(--color-accent)', bg: 'var(--color-accent-100)' },
  F: { label: 'Women', color: 'var(--color-accent-2-700)', bg: 'var(--color-accent-2-100)' },
  X: { label: 'Mixed', color: 'var(--color-neutral-700)', bg: 'var(--color-neutral-200)' },
}

/* ───────────────────────── the live board ─────────────────────────
   The live endpoint says, per event / gender / age category / round, whether
   results are in, and lists every decided podium. Each program line reads
   its own state from it, so a final is never marked "Results" because the
   heats of that event (or another age category's final) are in. */
const PRELIM_ROUNDS = new Set(['Prelims', 'Heats'])
const SEMI_ROUNDS = new Set(['Semifinals', 'Semis', 'Swim-off'])
const roundKey = (rt) => (PRELIM_ROUNDS.has(rt) ? 'HEATS' : SEMI_ROUNDS.has(rt) ? 'SEMIS' : 'FINALS')
const ROUND_ORDER = { HEATS: 0, SEMIS: 1, FINALS: 2 }

function buildBoard(live) {
  const status = new Map()
  const podiums = new Map()
  const put = (map, row) => {
    const k = `${row.event}|${row.gender}`
    if (!map.has(k)) map.set(k, [])
    map.get(k).push(row)
  }
  for (const s of live?.status || []) put(status, s)
  for (const p of live?.podiums || []) put(podiums, p)
  return { status, podiums }
}

// rows of one age category; data with no categories at all belongs to every line
const ofCategory = (rows, category) => {
  const want = normCategory(category)
  if (!want || !rows.some((r) => normCategory(r.category))) return rows
  return rows.filter((r) => normCategory(r.category) === want)
}

/* What one program line has to show:
     in        — its own round has results
     waiting   — an earlier round is in, this one is still to come
     scheduled — nothing yet */
function lineState(board, item) {
  const rows = ofCategory(board.status.get(`${item.event}|${item.gender}`) || [], item.age_category)
  const of = (k) => rows.filter((r) => r.round === k)
  const pack = (state, round, list) => ({
    state, round,
    count: list.reduce((n, r) => n + r.count, 0),
    stamp: list.reduce((n, r) => Math.max(n, r.last), 0),
  })
  const want = item.session || ''
  if (!want) {
    const best = ['FINALS', 'SEMIS', 'HEATS'].find((k) => of(k).length)
    return best ? pack('in', best, of(best)) : { state: 'scheduled' }
  }
  if (of(want).length) return pack('in', want, of(want))
  const earlier = ['SEMIS', 'HEATS'].find((k) => ROUND_ORDER[k] < ROUND_ORDER[want] && of(k).length)
  return earlier ? pack('waiting', earlier, of(earlier)) : { state: 'scheduled' }
}

const FINAL_BLOCKS = ['Finals', '', 'Junior Final', 'Consolation', 'Final C', 'Final D']
const FINAL_LABEL = { Consolation: 'Final B', 'Junior Final': 'Junior final', 'Final C': 'Final C', 'Final D': 'Final D' }
// Imported forfeits/DQs keep the federation file's wording in the data
// ("Frf n.d.", "Disqual.", "Abandon"). Jakob's Law: every meet shows the same
// short code, with the source wording as a tooltip (same table as MeetDetail).
const STATUS_CODES = [
  [/^(frf|forf|dns|abs)/i, 'DNS', 'Did not start'],
  [/^(dis|dsq|dq)/i, 'DQ', 'Disqualified'],
  [/^(aband|dnf)/i, 'DNF', 'Did not finish'],
  [/^tld/i, 'TLD', 'Time limit exceeded'],
  [/^(h\.?\s?c|exh)/i, 'HC', 'Hors concours'],
]
const statusCode = (raw) => {
  const text = String(raw || '').trim()
  if (!text) return { code: '—', title: undefined }
  const hit = STATUS_CODES.find(([re]) => re.test(text))
  if (!hit) return { code: text, title: undefined }
  const [, code, meaning] = hit
  return { code, title: text.toUpperCase() === code ? meaning : `${meaning} — in the results file: “${text}”` }
}
const hasTime = (r) => r.time_centiseconds > 0 && !(r.hc_type && !['HC', 'TLD'].includes(statusCode(r.hc_type).code))

/* The results of one program line, opened in place.
   `round` is the round to show (the line's own, or the earlier one while the
   final is still to come); `stamp` changes when new results arrive, so an
   open list refreshes by itself. */
function InlineResults({ meetId, meet, item, round, stamp, waiting }) {
  const [rows, setRows] = useState(null)
  const [athlete, setAthlete] = useState(null)
  const [failed, setFailed] = useState(false)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    let alive = true
    setFailed(false)
    getChampionshipResults(meetId, { event: item.event, gender: item.gender, all_rounds: 1 })
      .then((res) => { if (alive) setRows(Array.isArray(res.data) ? res.data : res.data?.results || []) })
      .catch(() => { if (alive) { setRows((cur) => cur || []); setFailed(true) } })
    return () => { alive = false }
  }, [meetId, item.event, item.gender, stamp, retry])

  const isNational = ['National', 'Other'].includes(meet?.classification_name)
  const blocks = useMemo(() => {
    if (!rows) return []
    const mine = rows.filter((r) => roundKey(r.round_type) === round)
    const out = []
    resultsByCategory(mine, item.age_category).forEach((g) => {
      // a category can hold an A final and a B final: each is its own ranking
      const kinds = [...new Set(g.rows.map((r) => r.round_type || ''))]
        .sort((a, b) => (FINAL_BLOCKS.indexOf(a) + 99) % 99 - (FINAL_BLOCKS.indexOf(b) + 99) % 99)
      kinds.forEach((kind) => {
        const list = g.rows.filter((r) => (r.round_type || '') === kind)
        const timed = list.filter(hasTime).sort((a, b) => (a.original_rank || 9999) - (b.original_rank || 9999) || a.time_centiseconds - b.time_centiseconds)
        const rest = list.filter((r) => !hasTime(r))
        // medals follow the meet's rules: finals only, a B final only at national meets that award it
        const medals = round === 'FINALS' && (kind !== 'Consolation' || (isNational && !meet?.b_final_no_medals))
        const head = [
          (kinds.length > 1 || FINAL_LABEL[kind]) && round === 'FINALS' ? (FINAL_LABEL[kind] || 'Final A') : '',
          !item.age_category && g.category ? displayCategory(g.category) : '',
        ].filter(Boolean).join(' · ')
        out.push({
          key: `${g.key}-${kind}`, head, medals,
          rows: [
            // equal times share the better place (and its medal), even when
            // the sheet numbered a dead heat 1, 2 — mirrors medals/utils
            ...timed.map((r) => ({
              r,
              rank: r.original_rank
                ? Math.min(...timed.filter((x) => x.original_rank && x.time_centiseconds === r.time_centiseconds).map((x) => x.original_rank))
                : 1 + timed.filter((x) => x.time_centiseconds < r.time_centiseconds).length,
            })),
            ...rest.map((r) => ({ r, rank: null })),
          ],
        })
      })
    })
    return out
  }, [rows, round, item.age_category, isNational, meet?.b_final_no_medals])

  if (rows === null) return <div className="lv-res"><Loading label="Loading results" /></div>
  if (failed && rows.length === 0) {
    return (
      <div className="lv-res lv-res-note" role="alert">
        These results could not be loaded.
        <button type="button" className="btn btn-secondary" onClick={() => { setRows(null); setRetry((n) => n + 1) }}>Try again</button>
      </div>
    )
  }

  return (
    <div className="lv-res live-fade-in">
      {athlete && (
        <AthleteMeetCard swimmer={athlete} meet={{ id: meetId, name: meet?.name }} onClose={() => setAthlete(null)} />
      )}
      {waiting && (
        <div className="lv-res-wait">The {SESSION_LABEL[item.session]?.toLowerCase() || 'final'} has not been swum yet. These are the {SESSION_LABEL[round].toLowerCase()}.</div>
      )}
      {blocks.length === 0 && <div className="lv-res-note">No results uploaded for this race yet.</div>}
      <div className="lv-res-scroll">
        {blocks.map((b) => [
          b.head && <div key={`h-${b.key}`} className="live-cat-head">{b.head}</div>,
          ...b.rows.map(({ r, rank }) => {
            const team = r.swimmer_detail?.is_relay_team
            const clickable = r.swimmer_detail && !team
            const legs = team ? (r.relay_swimmers_detail || r.relay_swimmers || []) : []
            const nat = r.nationality_detail || r.swimmer_detail?.nationality_detail
            const medal = b.medals && !r.is_hc && rank && rank <= 3
            return (
              <div key={r.id} className={`lv-res-row${medal ? ' podium' : ''}${rank ? '' : ' out'}`}>
                <span className="lv-res-rank">
                  {medal ? <MedalIcon type={['GOLD', 'SILVER', 'BRONZE'][rank - 1]} size={18} style={{ display: 'block' }} />
                    : r.is_hc && rank ? <span className="lv-res-code" title={statusCode(r.hc_type || 'HC').title}>{statusCode(r.hc_type || 'HC').code}</span>
                    : <span className="asw-num">{rank || '–'}</span>}
                </span>
                <Flag code={nat?.code} name={nat?.name} />
                <span className="lv-res-who">
                  {clickable ? (
                    <button type="button" className="lv-res-name row-link" onClick={() => setAthlete(r.swimmer_detail)}>{r.swimmer_detail.name}</button>
                  ) : (
                    <span className="lv-res-name">{team ? (nat?.name || r.swimmer_detail?.name) : r.swimmer_detail?.name}</span>
                  )}
                  {legs.length > 0 && (
                    <span className="lv-res-legs">
                      {legs.map((leg, i) => {
                        const name = typeof leg === 'string' ? leg : leg.name
                        const id = typeof leg === 'string' ? null : leg.swimmer_id
                        return id ? (
                          <button key={i} type="button" className="row-link" onClick={() => setAthlete({ id, name, nationality_detail: nat })}>{name}</button>
                        ) : <span key={i}>{name}</span>
                      })}
                    </span>
                  )}
                </span>
                {r.reaction_time && hasTime(r) && (
                  <span className="lv-res-rt asw-num hide-mobile">RT {Number(r.reaction_time).toFixed(2)}</span>
                )}
                {hasTime(r)
                  ? <span className="lv-res-time asw-time">{r.formatted_time}</span>
                  : <span className="lv-res-time lv-res-code" title={statusCode(r.hc_type).title}>{statusCode(r.hc_type).code}</span>}
                <span className="lv-res-pts asw-num hide-mobile">{hasTime(r) && r.fina_points ? formatPoints(r.fina_points) : ''}</span>
              </div>
            )
          }),
        ])}
      </div>
      <div className="lv-res-foot">
        <Link to={`/meets/${meetId}?tab=results&event=${item.event}&gender=${item.gender}&day=${item.day}&session=${item.session}`}>
          Splits, heats and more ›
        </Link>
      </div>
    </div>
  )
}

/* One program line: the race and whether its results are in. Occam's Razor:
   nothing else on the line — the results open in place.
   Fitts's Law: the whole 48px row opens it. */
function ProgramRow({ item, meetId, meet, board, last, grouped = false }) {
  const [open, setOpen] = useState(false)
  const st = lineState(board, item)
  const g = GENDER_STYLE[item.gender] || GENDER_STYLE.X
  const inner = (
    <div className={`lv-row is-${st.state}${last ? ' last' : ''}${open ? ' open' : ''}`}>
      <div className="lv-row-main">
        <span className="lv-row-title">{grouped ? (displayCategory(item.age_category) || 'Open') : item.event_name}</span>
        {!grouped && <span className="lv-row-gender" style={{ background: g.bg, color: g.color }}>{g.label}</span>}
        {!grouped && item.age_category && <span className="lv-row-cat">{displayCategory(item.age_category)}</span>}
        {item.session && <span className="lv-row-round">{SESSION_LABEL[item.session]}</span>}
      </div>
      <span className="lv-row-status">
        {/* the status says what you get: the results, the heats only so far, or nothing yet */}
        {st.state === 'in' && 'Results'}
        {st.state === 'waiting' && `${SESSION_LABEL[st.round]} results`}
        {st.state === 'scheduled' && 'Scheduled'}
        {st.state !== 'scheduled' && <span className="live-chevron" aria-hidden="true" style={{ transform: open ? 'rotate(90deg)' : 'none' }}>›</span>}
      </span>
    </div>
  )
  if (st.state === 'scheduled') return inner
  return (
    <div>
      <div
        className="lv-row-link row-link"
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen((v) => !v) } }}
      >
        {inner}
      </div>
      {open && <InlineResults meetId={meetId} meet={meet} item={item} round={st.round} stamp={st.stamp} waiting={st.state === 'waiting'} />}
    </div>
  )
}

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

const doneCount = (board, items) => items.filter((i) => lineState(board, i).state === 'in').length

/* Program for one day, grouped Morning / Evening as session cards */
function DayProgram({ day, meetId, meet, board, gender = '', category = '' }) {
  if (!day || (day.items || []).length === 0) {
    return <Empty label="No program published for this day yet." hint="Pick another day above, or check back later." />
  }
  // Unnumbered items (order 0/null) go AFTER numbered ones — never a
  // leading "–" row before event 1.
  const bySchedule = (a, b) => (a.order || 9999) - (b.order || 9999) || (a.id || 0) - (b.id || 0)
  const items = [...day.items].sort(bySchedule)
    .filter((i) => !gender || i.gender === gender)
    .filter((i) => !category || normCategory(i.age_category) === normCategory(category))
  if (items.length === 0) {
    return <Empty label="No races match these filters" hint="Choose another gender or age category above." />
  }
  const groups = []
  const morning = items.filter((i) => i.time_of_day === 'MORNING')
  const evening = items.filter((i) => i.time_of_day === 'EVENING')
  const rest = items.filter((i) => i.time_of_day !== 'MORNING' && i.time_of_day !== 'EVENING')
  if (morning.length) groups.push(['Morning session', morning, false])
  if (evening.length) groups.push(['Evening session', evening, true])
  if (rest.length) {
    const allFinals = rest.every((i) => i.session === 'FINALS')
    groups.push([groups.length ? 'Other races' : allFinals ? 'Finals' : 'Races', rest, allFinals])
  }
  return (
    <div className="live-fade-in lv-sessions">
      {groups.map(([label, list, strong]) => {
        const done = doneCount(board, list)
        return (
          <section key={label} className={`lv-session${strong ? ' strong' : ''}`}>
            {/* Goal-Gradient: the bar under the name shows how far along the session is */}
            <header className="lv-session-head">
              <h3>{label}</h3>
              {/* where the session stands, in a word (the bar below shows how far) */}
              <span className={`lv-session-state${done === list.length ? ' done' : done > 0 ? ' live' : ''}`}>
                {done === list.length ? 'Completed' : done > 0 ? 'In progress' : 'Upcoming'}
              </span>
              <span className="lv-session-bar" role="img" aria-label={`${done} of ${list.length} races have results`}><i style={{ width: `${(done / list.length) * 100}%` }} /></span>
            </header>
            {/* Proximity: an event swum by several age categories is named once,
                with its categories under it in a fixed order (heats before
                finals inside each category). On a laptop the blocks sit two
                across, so an event's women and men are side by side. */}
            <div className={`live-clusters${list.some((i) => i.gender === 'F') && list.some((i) => i.gender === 'M') ? ' by-gender' : ''}`}>
              {clusterByEvent(list).map((c) => {
                const row = (item, grouped, last) => (
                  <ProgramRow key={item.id} item={item} meetId={meetId} meet={meet} board={board} last={last} grouped={grouped} />
                )
                const g = GENDER_STYLE[c.gender] || GENDER_STYLE.X
                return (
                  <div key={c.key} className={`live-cluster g-${c.gender}`}>
                    <div className="live-event-head">
                      <span>{c.name}</span>
                      <span style={{ background: g.bg, color: g.color }}>{g.label}</span>
                    </div>
                    {c.items.map((item, i) => row(item, true, i === c.items.length - 1))}
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}

/* Peak-End Rule: the podiums are the moments people come for, so the newest
   ones sit beside the program (a strip to swipe on a phone). */
function LatestPodiums({ podiums, meetId, meetName }) {
  const [athlete, setAthlete] = useState(null)
  const list = podiums.filter((p) => p.round === 'FINALS' && p.round_type !== 'Consolation').slice(0, 6)
  if (list.length === 0) return null
  return (
    <section className="lv-card lv-latest" aria-label="Latest podiums">
      {athlete && <AthleteMeetCard swimmer={athlete} meet={{ id: meetId, name: meetName }} onClose={() => setAthlete(null)} />}
      <h3 className="lv-card-head">Latest podiums</h3>
      <div className="lv-latest-list">
        {list.map((p) => {
          const g = GENDER_STYLE[p.gender] || GENDER_STYLE.X
          return (
            <article key={`${p.event}-${p.gender}-${p.category}-${p.round_type}`} className="lv-pod">
              <Link className="lv-pod-head" to={`/meets/${meetId}?tab=results&event=${p.event}&gender=${p.gender}`}>
                <span className="lv-pod-event">{p.event_name}</span>
                <span className="lv-pod-meta">
                  <span style={{ background: g.bg, color: g.color }}>{g.label}</span>
                  {displayCategory(p.category)}
                </span>
              </Link>
              {p.medals.map((m, i) => (
                <div key={i} className="lv-pod-row">
                  <MedalIcon type={m.type} size={15} style={{ flex: 'none' }} />
                  <Flag code={m.code} />
                  {m.swimmer_id ? (
                    <button type="button" className="lv-pod-name row-link" onClick={() => setAthlete({ id: m.swimmer_id, name: m.name, nationality_detail: { code: m.code } })}>{m.name}</button>
                  ) : <span className="lv-pod-name">{m.name}</span>}
                  <span className="lv-pod-time asw-time">{m.time}</span>
                </div>
              ))}
            </article>
          )
        })}
      </div>
    </section>
  )
}

/* The top of the medal table beside the program; the Medals tab has all of it */
function MedalGlance({ rows, clubRows, isNational, onOpen }) {
  const clubs = (isNational && (clubRows || []).length > 0) || (rows || []).length === 0
  const list = (clubs ? clubRows : rows) || []
  if (list.length === 0) return null
  return (
    <section className="lv-card lv-glance" aria-label="Medal table">
      <h3 className="lv-card-head">Medal table</h3>
      <table className="lv-glance-table">
        <thead>
          <tr>
            <th scope="col"><span className="sr-only">Rank</span></th>
            <th scope="col">{clubs ? 'Club' : 'Country'}</th>
            {['GOLD', 'SILVER', 'BRONZE'].map((t) => <th key={t} scope="col" className="num"><MedalIcon type={t} size={14} /><span className="sr-only">{t.toLowerCase()}</span></th>)}
            <th scope="col" className="num">Total</th>
          </tr>
        </thead>
        <tbody>
          {list.slice(0, 5).map((r, i) => (
            <tr key={clubs ? (r.team_key || r.result__team) : r.swimmer__nationality__code}>
              <td className="asw-num">{i + 1}</td>
              <td>
                <span className="lv-glance-who">
                  {clubs ? null : <Flag code={r.swimmer__nationality__code} />}
                  <span>{clubs ? r.result__team : (r.swimmer__nationality__name || r.swimmer__nationality__code)}</span>
                </span>
              </td>
              <td className="num asw-num">{r.gold}</td>
              <td className="num asw-num">{r.silver}</td>
              <td className="num asw-num">{r.bronze}</td>
              <td className="num asw-num"><strong>{r.total}</strong></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="btn btn-secondary lv-glance-more" onClick={onOpen}>
        Full medal table{list.length > 5 ? ` (${list.length})` : ''}
      </button>
    </section>
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

/* Live hub for one meet: header with the meet's state, then Program / Medals / documents */
function LiveHub({ meet }) {
  const { isAdmin } = useAuth()
  const [tab, setTab] = useState('program') // 'program' | 'medals' | 'startlist' | 'reports'
  // Selective Attention: a parent follows one gender and one age category
  const [fGender, setFGender] = useState('')
  const [fCat, setFCat] = useState('')
  const [program, setProgram] = useState(null)
  const [live, setLive] = useState(null)
  const [medals, setMedals] = useState(null)
  const [clubMedals, setClubMedals] = useState(null)
  const [swimmerMedals, setSwimmerMedals] = useState(null)
  const [editProgram, setEditProgram] = useState(false)
  const [docs, setDocs] = useState([])
  const [selectedDay, setSelectedDay] = useState(null)
  const [updatedAt, setUpdatedAt] = useState(null)
  const [stale, setStale] = useState(false)
  const pollRef = useRef(null)
  const chipsRef = useRef(null)

  // keep the selected day chip in view (phones: today can be off-screen)
  useEffect(() => {
    if (tab !== 'program') return
    const t = setTimeout(() => {
      chipsRef.current?.querySelector('.active')?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
    }, 60)
    return () => clearTimeout(t)
  }, [tab, selectedDay, program])

  const loadProgram = () => getMeetProgram(meet.id).then((r) => setProgram(r.data)).catch(() => setProgram((cur) => cur || { days: [] }))
  const refresh = () => {
    getMeetLive(meet.id)
      .then((r) => { setLive(r.data); setUpdatedAt(new Date()); setStale(false) })
      // a failed refresh keeps what is on screen and says it may be out of date
      .catch(() => { setLive((cur) => cur || {}); setStale(true) })
    getMedalSummary({ championship: meet.id }).then((r) => setMedals(r.data)).catch(() => setMedals((cur) => cur || []))
    getMedalClubSummary({ championship: meet.id }).then((r) => setClubMedals(r.data)).catch(() => setClubMedals((cur) => cur || []))
    getMedalSwimmerSummary({ championship: meet.id, limit: 'all' }).then((r) => setSwimmerMedals(r.data)).catch(() => setSwimmerMedals((cur) => cur || []))
    getMeetDocuments(meet.id).then((r) => setDocs(Array.isArray(r.data) ? r.data : [])).catch(() => {})
  }

  useEffect(() => {
    setProgram(null); setLive(null); setMedals(null); setClubMedals(null); setSwimmerMedals(null); setSelectedDay(null); setTab('program'); setFGender(''); setFCat(''); setEditProgram(false); setDocs([])
    loadProgram()
    refresh()
    // the program can change during a meet too (a final added, an order moved)
    pollRef.current = setInterval(() => { refresh(); loadProgram() }, POLL_MS)
    return () => clearInterval(pollRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meet.id])

  const board = useMemo(() => buildBoard(live), [live])

  const days = program?.days || []
  const prog = dayProgress(meet)
  const todayNum = useMemo(() => {
    const t = (live?.days || []).find((d) => d.is_today)
    if (t) return t.day
    return prog ? prog.current : 1
  }, [live, prog])
  const scheduleDay = days.find((d) => d.day === (selectedDay ?? todayNum)) || days[0]
  const today = days.find((d) => d.day === todayNum)
  const todayItems = today?.items || []

  const loading = !program || !live
  const isNational = ['National', 'Other'].includes(meet.classification_name)

  // Hick's Law: a tab with nothing in it is not offered to the public
  const docCount = (kind) => docs.filter((d) => d.kind === kind).length
  const TABS = [
    { value: 'program', label: 'Program' },
    { value: 'medals', label: 'Medals' },
    (isAdmin || docCount('STARTLIST') > 0) && { value: 'startlist', label: `Start lists${docCount('STARTLIST') ? ` (${docCount('STARTLIST')})` : ''}` },
    (isAdmin || docCount('REPORT') > 0) && { value: 'reports', label: `Reports${docCount('REPORT') ? ` (${docCount('REPORT')})` : ''}` },
  ].filter(Boolean)
  const shownTab = TABS.some((t) => t.value === tab) ? tab : 'program'

  // filter choices come from the day being shown (genders) and the whole meet (categories)
  const dayItems = scheduleDay?.items || []
  const genderOptions = ['M', 'F', 'X'].filter((g) => dayItems.some((i) => i.gender === g))
  const categoryOptions = useMemo(() => {
    const seen = []
    days.forEach((d) => (d.items || []).forEach((i) => {
      if (i.age_category && !seen.some((c) => normCategory(c) === normCategory(i.age_category))) seen.push(i.age_category)
    }))
    return seen
  }, [days])
  const shownRaces = dayItems
    .filter((i) => !fGender || i.gender === fGender)
    .filter((i) => !fCat || normCategory(i.age_category) === normCategory(fCat)).length

  const refreshDocs = () => getMeetDocuments(meet.id).then((r) => setDocs(Array.isArray(r.data) ? r.data : [])).catch(() => {})

  const weekday = (iso) => {
    const d = new Date(iso + 'T00:00:00')
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { weekday: 'short' })
  }

  // Miller's Law: four numbers that answer "where is the meet now"
  const STATS = [
    { label: 'Results in', short: 'Results', value: formatNumber(live?.total_results ?? meet.results_count ?? 0) },
    todayItems.length > 0 && { label: 'Races today', short: 'Today', value: `${doneCount(board, todayItems)}/${todayItems.length}` },
    { label: 'Podiums decided', short: 'Podiums', value: formatNumber(live?.podiums_decided ?? 0) },
    { label: isNational ? 'Clubs with medals' : 'Nations with medals', short: isNational ? 'Clubs' : 'Nations', value: formatNumber(isNational ? (clubMedals || []).length : (live?.medal_nations ?? 0)) },
  ].filter(Boolean)

  const hasRail = (live?.podiums || []).length > 0 || (medals || []).length > 0 || (clubMedals || []).length > 0

  return (
    <div className="lv">
      {/* ── header ── */}
      <header className="lv-hero">
        <div className="lv-hero-top">
          <LivePill />
          {prog && <span className="lv-hero-day">Day {prog.current} of {prog.total}</span>}
          {/* Doherty Threshold: say how fresh the page is */}
          {updatedAt && (
            <span className={`lv-hero-fresh${stale ? ' stale' : ''}`} aria-live="polite">
              {stale ? 'Could not refresh · showing ' : 'Updated '}
              {updatedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
              <span className="hide-mobile"> · refreshes every minute</span>
            </span>
          )}
        </div>
        <h2 className="lv-hero-title">{meet.name}</h2>
        <div className="lv-hero-meta">
          {meet.country_detail && <Flag code={meet.country_detail.code} name={meet.country_detail.name} />}
          <span>{[meet.location, meet.country_detail?.name].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', ')}</span>
          <span aria-hidden="true">·</span>
          <span>{formatDateRange(meet.date, meet.end_date)}</span>
          {meet.pool && <><span aria-hidden="true" className="hide-mobile">·</span><span className="hide-mobile">{poolLabel(meet.pool)}</span></>}
          <Link className="lv-hero-link" to={`/meets/${meet.id}`}>Meet page ›</Link>
        </div>
        {prog && prog.total > 1 && (
          <div className="lv-hero-days" aria-hidden="true">
            {Array.from({ length: prog.total }, (_, i) => (
              <span key={i} className={i + 1 < prog.current ? 'done' : i + 1 === prog.current ? 'now' : ''} />
            ))}
          </div>
        )}
        <dl className="lv-stats">
          {STATS.map((s) => (
            <div key={s.label}>
              {/* a phone shows the four numbers on one line, so the labels are one word there */}
              <dt><span className="lv-long">{s.label}</span><span className="lv-short" aria-hidden="true">{s.short}</span></dt>
              <dd className="asw-num">{loading ? '–' : s.value}</dd>
            </div>
          ))}
        </dl>
      </header>
      {/* Jakob's Law: the same tab strip as every other page, on one line */}
      <div className="live-tabrow">
        <Seg tabs options={TABS} value={shownTab} onChange={setTab} />
      </div>

      {loading ? <Loading label="Loading live data" /> : (
        <div className="lv-body">
          {shownTab === 'program' && (
            <div className={`lv-grid live-fade-in${hasRail ? ' with-rail' : ''}`}>
              <div className="lv-main">
                {/* admin: edit the program in place — add events to days, reorder, sessions */}
                {isAdmin && (
                  <div className="lv-admin">
                    <button type="button" aria-expanded={editProgram}
                      className="btn btn-secondary" /* Von Restorff: the editor's own Save is the one primary */
                      onClick={() => setEditProgram((v) => !v)}>
                      {editProgram ? 'Close program editor' : 'Edit program'}
                    </button>
                    <Link className="btn btn-secondary" to={`/import?championship=${meet.id}&live_day=${scheduleDay?.day || todayNum}`}>
                      Upload results for day {scheduleDay?.day || todayNum}
                    </Link>
                    {editProgram && (
                      <div className="lv-admin-editor">
                        <MeetProgramEditor champId={meet.id} onSaved={loadProgram} />
                      </div>
                    )}
                  </div>
                )}
                {/* day strip — only when the meet has more than one day */}
                {days.length > 1 && (
                  <div ref={chipsRef} className="lv-days" role="group" aria-label="Meet days">
                    {days.map((d) => {
                      const active = d.day === (scheduleDay?.day)
                      const total = (d.items || []).length
                      const done = doneCount(board, d.items || [])
                      return (
                        <button key={d.day} type="button" aria-pressed={active}
                          onClick={() => setSelectedDay(d.day)}
                          className={`lv-day live-daychip${active ? ' active' : ''}${d.day === todayNum ? ' today' : ''}`}>
                          <span className="lv-day-wd">{weekday(d.date) || `Day ${d.day}`}</span>
                          <span className="lv-day-num asw-num">{d.date ? Number(d.date.slice(8, 10)) : d.day}</span>
                          <span className="lv-day-no">{d.day === todayNum ? 'Today' : `Day ${d.day}`}</span>
                          <span className="lv-day-bar" aria-hidden="true"><i style={{ width: total ? `${(done / total) * 100}%` : 0 }} /></span>
                          <span className="lv-day-count asw-num">{total ? `${done}/${total}` : 'No races'}</span>
                        </button>
                      )
                    })}
                  </div>
                )}
                {/* Common Region: the filters sit in one bar right above what they filter */}
                {(genderOptions.length > 1 || categoryOptions.length > 1) && (
                  <div className="live-filters" role="group" aria-label="Filter the program">
                    {genderOptions.length > 1 && (
                      <Seg
                        options={[{ value: '', label: 'All' }, ...genderOptions.map((g) => ({ value: g, label: GENDER_STYLE[g].label }))]}
                        value={genderOptions.includes(fGender) ? fGender : ''}
                        onChange={setFGender}
                      />
                    )}
                    {categoryOptions.length > 1 && (
                      <select className="select" aria-label="Age category" value={fCat} onChange={(e) => setFCat(e.target.value)}>
                        <option value="">All age categories</option>
                        {categoryOptions.map((c) => <option key={c} value={c}>{displayCategory(c)}</option>)}
                      </select>
                    )}
                    <span className="live-filters-count asw-num" aria-live="polite">
                      {shownRaces} {shownRaces === 1 ? 'race' : 'races'}
                      {(fGender || fCat) && (
                        <button type="button" className="btn btn-ghost" onClick={() => { setFGender(''); setFCat('') }}>Clear</button>
                      )}
                    </span>
                  </div>
                )}
                <DayProgram day={scheduleDay} meetId={meet.id} meet={meet} board={board}
                  gender={genderOptions.includes(fGender) ? fGender : ''} category={fCat} />
              </div>
              {hasRail && (
                <aside className="lv-rail">
                  <LatestPodiums podiums={live.podiums || []} meetId={meet.id} meetName={meet.name} />
                  <MedalGlance rows={medals} clubRows={clubMedals} isNational={isNational} onOpen={() => { setTab('medals'); window.scrollTo({ top: 0, behavior: 'smooth' }) }} />
                </aside>
              )}
            </div>
          )}

          {shownTab === 'medals' && <MedalsPanel rows={medals} clubRows={clubMedals} swimmerRows={swimmerMedals} isNational={isNational} />}

          {shownTab === 'startlist' && <DocumentsPanel meetId={meet.id} kind="STARTLIST" docs={docs} onChanged={refreshDocs} />}

          {shownTab === 'reports' && <DocumentsPanel meetId={meet.id} kind="REPORT" docs={docs} onChanged={refreshDocs} />}
        </div>
      )}
    </div>
  )
}

/* Occam's Razor: with several meets live, one slim switch — the header below
   already says which meet is open, so full cards repeating its name are noise. */
function MeetSwitch({ meets, selectedId, onSelect }) {
  const rowRef = useRef(null)
  // the open meet is always in view, even when it is the last chip on a phone
  useEffect(() => {
    rowRef.current?.querySelector('.on')?.scrollIntoView({ inline: 'nearest', block: 'nearest' })
  }, [selectedId, meets.length])
  return (
    <div ref={rowRef} className="live-meets" role="group" aria-label="Live meets">
      {meets.map((m) => {
        const prog = dayProgress(m)
        const active = m.id === selectedId
        return (
          <button key={m.id} type="button" aria-pressed={active} className={`live-meet${active ? ' on' : ''}`} onClick={() => onSelect(m.id)}>
            <span className="live-meet-dot" aria-hidden="true" />
            <span className="live-meet-name">{m.name}</span>
            {prog && <span className="live-meet-day">Day {prog.current}/{prog.total}</span>}
          </button>
        )
      })}
    </div>
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
        title="Live Results"
        sub="Program, results and medals for the meets happening now."
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
          {meets.length > 1 && <MeetSwitch meets={meets} selectedId={selected?.id} onSelect={setSelectedId} />}
          {selected && <LiveHub meet={selected} />}
        </div>
      )}
    </div>
  )
}
