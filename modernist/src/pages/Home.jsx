import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Search, X } from 'lucide-react'
import api from '../api/client'
import { getCountries } from '../api/core'
import { getChampionships, getMostImproved } from '../api/championships'
import { getMedalSummary } from '../api/medals'
import { getNewRecords, getComputedRecords } from '../api/records'
import { getInductees } from '../api/fame'
import { getArticles } from '../api/news'
import { getAlbums } from '../api/media'
import { getRankings } from '../api/rankings'
import { searchSwimmers, getSwimmerBirthdays } from '../api/swimmers'
import Flag from '../components/Flag'
import { SectHead, Loading, Pager } from '../components/ui'
import { formatDate, formatNumber, mediaUrl, formatDateRange } from '../utils'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

// Debounced swimmer search input with a dropdown of matches.
function SwimmerSearchInput({ placeholder, onPick, dark = false }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const timer = useRef(null)
  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return }
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      searchSwimmers(q.trim())
        .then((res) => {
          const l = Array.isArray(res.data) ? res.data : res.data?.results || []
          setResults(l.slice(0, 6))
        })
        .catch(() => setResults([]))
    }, 250)
    return () => clearTimeout(timer.current)
  }, [q])
  return (
    <div style={{ position: 'relative' }}>
      <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: dark ? 'rgba(255,255,255,0.5)' : 'var(--color-neutral-600)', pointerEvents: 'none' }} />
      <input
        className="input"
        style={{ width: '100%', paddingLeft: 32, ...(dark ? { background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff' } : {}) }}
        placeholder={placeholder}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {results.length > 0 && (
        <div style={{ position: 'absolute', zIndex: 30, left: 0, right: 0, background: '#fff', border: '2px solid var(--color-divider)', borderTop: 0, boxShadow: 'var(--shadow-md)' }}>
          {results.map((s) => (
            <button key={s.id} type="button" className="hair-b"
              onClick={() => { onPick(s); setQ(''); setResults([]) }}
              style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 12px', border: 0, background: 'transparent', cursor: 'pointer', font: 'inherit', textAlign: 'left', color: 'var(--color-text)' }}>
              <Flag code={s.nationality_detail?.code || s.nationality_code} name={s.nationality_detail?.name || s.nationality} />
              <span style={{ fontWeight: 600, fontSize: 13 }}>{s.name}</span>
              {s.birth_year && <span className="text-muted" style={{ fontSize: 12, marginLeft: 'auto' }}>{s.birth_year}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}


function parseMeetDate(d) {
  if (!d) return null
  const m = String(d).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (m) return new Date(+m[3], +m[2] - 1, +m[1])
  const dt = new Date(d)
  return Number.isNaN(dt.getTime()) ? null : dt
}

function Countdown({ target }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(t)
  }, [])
  const diff = Math.max(0, target - now)
  const days = Math.floor(diff / 86400000)
  const hrs = Math.floor((diff % 86400000) / 3600000)
  const min = Math.floor((diff % 3600000) / 60000)
  const cells = [[days, 'Days'], [String(hrs).padStart(2, '0'), 'Hrs'], [String(min).padStart(2, '0'), 'Min']]
  return (
    <div style={{ display: 'flex', gap: 1, background: 'var(--color-divider)', marginTop: 14 }}>
      {cells.map(([v, l]) => (
        <div key={l} style={{ flex: 1, background: 'var(--color-bg)', padding: '8px 10px' }}>
          <div className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24 }}>{v}</div>
          <div className="micro" style={{ fontSize: 10 }}>{l}</div>
        </div>
      ))}
    </div>
  )
}

export default function Home() {
  const [counts, setCounts] = useState(null)
  const [meets, setMeets] = useState([])
  const [topResults, setTopResults] = useState([])
  const [topPage, setTopPage] = useState(1)
  const [medalTally, setMedalTally] = useState([])
  const [newRecords, setNewRecords] = useState([])
  const [inductees, setInductees] = useState([])
  const [articles, setArticles] = useState([])
  const [albums, setAlbums] = useState([])
  const [arabCountries, setArabCountries] = useState([])
  const [heroRecords, setHeroRecords] = useState([]) // marquee Arab records for the hero showcase
  const [leaders, setLeaders] = useState([]) // season leaders strip
  const [leadersYear, setLeadersYear] = useState(null)
  const [improved, setImproved] = useState([])
  const [birthdays, setBirthdays] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()
  const [cmpA, setCmpA] = useState(null)
  const [cmpB, setCmpB] = useState(null)

  useEffect(() => {
    let alive = true
    async function load() {
      try {
        const now = new Date()
        const year = now.getFullYear()
        const leaderSpecs = [
          { event: 1, gender: 'M', label: '50 Free · Men' },
          { event: 1, gender: 'F', label: '50 Free · Women' },
          { event: 2, gender: 'M', label: '100 Free · Men' },
          { event: 2, gender: 'F', label: '100 Free · Women' },
        ]
        const [swimmersRes, meetsRes, resultsRes, recordsRes, countriesRes, newRecRes, fameRes, newsRes, albumsRes, topRes, bdayRes, ...leaderRes] =
          await Promise.allSettled([
            api.get('/swimmers/', { params: { page_size: 1 } }),
            getChampionships({ page_size: 50 }),
            api.get('/results/', { params: { page_size: 1 } }),
            api.get('/records/', { params: { page_size: 1 } }),
            getCountries(),
            getNewRecords(),
            getInductees(),
            getArticles({ page_size: 6, status: 'PUBLISHED' }),
            getAlbums({ page_size: 8 }),
            getComputedRecords({ scope: 'arab', pool: 'LCM', age_group: 'OPEN' }),
            getSwimmerBirthdays(now.getMonth() + 1),
            ...leaderSpecs.map((s) =>
              getRankings({ scope: 'arab', gender: s.gender, pool: 'LCM', event: s.event, age_group: 'OPEN', year, page_size: 1 })),
          ])
        if (!alive) return
        const val = (r) => (r.status === 'fulfilled' ? r.value.data : null)
        const list = (d) => (Array.isArray(d) ? d : d?.results || [])

        const countries = list(val(countriesRes))
        const arab = countries.filter((c) => c.region === 'ARAB' || c.region === 'GCC')
        setArabCountries(arab)
        const meetList = list(val(meetsRes))
        setMeets(meetList)
        setCounts({
          swimmers: val(swimmersRes)?.count,
          meets: val(meetsRes)?.count ?? meetList.length,
          results: val(resultsRes)?.count,
          records: val(recordsRes)?.count,
          federations: arab.length || 22,
        })
        setNewRecords(list(val(newRecRes)).slice(0, 3))
        setInductees(list(val(fameRes)).slice(0, 4))
        setArticles(list(val(newsRes)))
        setAlbums(list(val(albumsRes)).slice(0, 4))
        // Hero showcase: strongest Arab records by FINA, one per event/gender, individuals only
        const recs = list(val(topRes))
          .filter((r) => !r.is_relay && !r.is_relay_team && r.fina_points)
          .sort((a, b) => b.fina_points - a.fina_points)
        const topM = recs.filter((r) => r.gender === 'M')
        const topF = recs.filter((r) => r.gender === 'F')
        setHeroRecords([topM[0], topF[0], topM[1] || topF[1]].filter(Boolean))

        // Birthdays: sane ages, upcoming this month first
        const today = now.getDate()
        const bdays = list(val(bdayRes))
          .filter((b) => b.age > 4 && b.age < 70)
          .sort((a, b) => {
            const au = a.day >= today ? 0 : 1
            const bu = b.day >= today ? 0 : 1
            return au - bu || a.day - b.day
          })
        setBirthdays(bdays.slice(0, 4))

        // Season leaders: current year, fall back to all-time if the season is empty
        let leaderRows = leaderRes.map((r, i) => ({ ...leaderSpecs[i], row: list(val(r))[0] || null }))
        if (leaderRows.every((l) => !l.row)) {
          const retry = await Promise.allSettled(leaderSpecs.map((s) =>
            getRankings({ scope: 'arab', gender: s.gender, pool: 'LCM', event: s.event, age_group: 'OPEN', page_size: 1 })))
          if (!alive) return
          leaderRows = retry.map((r, i) => ({ ...leaderSpecs[i], row: list(val(r))[0] || null }))
          setLeadersYear(null)
        } else {
          setLeadersYear(year)
        }
        setLeaders(leaderRows.filter((l) => l.row))

        // latest meet → headline results + medal tally
        const latest = meetList[0]
        if (latest) {
          const [resTop, medals] = await Promise.allSettled([
            api.get('/results/', { params: { championship: latest.id, ordering: '-fina_points', page_size: 50 } }),
            getMedalSummary({ championship: latest.id }),
          ])
          if (!alive) return
          // one row per swimmer — their best swim of the meet
          const seen = new Set()
          setTopResults(list(val(resTop)).filter((r) => {
            if (seen.has(r.swimmer)) return false
            seen.add(r.swimmer)
            return true
          }))
          setMedalTally(list(val(medals)).slice(0, 6))
          getMostImproved(latest.id)
            .then((res) => {
              if (!alive) return
              const seen = new Set()
              const rows = (Array.isArray(res.data) ? res.data : []).filter((r) => {
                if (r.is_new_entry || seen.has(r.swimmer_id)) return false
                seen.add(r.swimmer_id)
                return true
              })
              setImproved(rows.slice(0, 3))
            })
            .catch(() => {})
        }
      } finally {
        if (alive) setLoading(false)
      }
    }
    load()
    return () => { alive = false }
  }, [])

  const latest = meets[0]
  const upcoming = useMemo(() => {
    const today = new Date()
    return meets
      .map((m) => ({ m, d: parseMeetDate(m.date) }))
      .filter((x) => x.d && x.d > today)
      .sort((a, b) => a.d - b.d)[0]
  }, [meets])

  if (loading) return <Loading label="Loading the database" />
  const featured = upcoming?.m || latest

  return (
    <div>
      {/* hero — identity + instant search + rotating spotlight */}
      <div className="rule-b" style={{ background: 'var(--color-accent-800)', color: '#fff' }}>
        <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 380px' }}>
          <div style={{ padding: '44px 32px 40px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div className="kicker" style={{ color: 'var(--asw-gold)', marginBottom: 10 }}>The record of Arab swimming</div>
            <h1 style={{ margin: 0, color: '#fff', letterSpacing: '-0.03em', lineHeight: 1.05 }}>
              Every meet. Every swimmer.<br />One home.
            </h1>
            <p style={{ margin: '14px 0 22px', fontSize: 14, lineHeight: 1.6, color: 'rgba(255,255,255,0.72)', maxWidth: 460 }}>
              {formatNumber(counts?.results)} swims, {formatNumber(counts?.swimmers)} swimmers and every record across{' '}
              {counts?.federations} federations — updated with every championship.
            </p>
            <div style={{ maxWidth: 380 }}>
              <SwimmerSearchInput dark placeholder="Find a swimmer by name…" onPick={(s) => navigate(`/swimmers/${s.id}`)} />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
              <Link className="btn btn-primary" to="/rankings" style={{ background: 'var(--asw-gold)', borderColor: 'var(--asw-gold)' }}>Explore rankings</Link>
              <Link className="btn" to="/records" style={{ color: '#fff', border: '1px solid rgba(255,255,255,0.4)', background: 'transparent' }}>Record books</Link>
              <Link className="btn" to="/compare" style={{ color: '#fff', border: '1px solid rgba(255,255,255,0.4)', background: 'transparent' }}>Head-to-head</Link>
            </div>
          </div>

          {/* Arab records showcase — the fastest ever, front and center */}
          {heroRecords.length > 0 && (
            <div style={{ borderLeft: '1px solid rgba(255,255,255,0.15)', padding: '28px', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
                <span className="kicker" style={{ color: 'var(--asw-gold)' }}>Arab records</span>
                <span style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)' }}>Long course</span>
              </div>
              <div>
                {heroRecords.map((r, i) => (
                  <div key={`${r.event_id}-${r.gender}`} style={{ padding: '13px 0', borderTop: i === 0 ? 'none' : '1px solid rgba(255,255,255,0.12)' }}>
                    <div style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.55)' }}>
                      {r.event_name} · {r.gender === 'F' ? 'Women' : 'Men'}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 3, flexWrap: 'wrap' }}>
                      <span className="asw-time" style={{ fontSize: 27, color: 'var(--asw-gold)' }}>{r.time}</span>
                      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{r.fina_points} FINA</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 4 }}>
                      <Flag code={r.nationality_code} name={r.nationality} />
                      {r.swimmer_id ? (
                        <Link to={`/swimmers/${r.swimmer_id}`} style={{ color: '#fff', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>{r.swimmer_name}</Link>
                      ) : (
                        <span style={{ fontSize: 13, fontWeight: 700 }}>{r.swimmer_name}</span>
                      )}
                      {r.date && <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>{new Date(r.date).getFullYear()}</span>}
                    </div>
                  </div>
                ))}
              </div>
              <Link to="/records" style={{ marginTop: 'auto', paddingTop: 14, fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--asw-gold)', textDecoration: 'none' }}>
                All record books →
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* counts strip */}
      <div className="counts">
        <div><div className="n">{formatNumber(counts?.swimmers)}</div><div className="l">Swimmers</div></div>
        <div><div className="n">{formatNumber(counts?.meets)}</div><div className="l">Meets</div></div>
        <div><div className="n">{formatNumber(counts?.results)}</div><div className="l">Results</div></div>
        <div><div className="n">{formatNumber(counts?.records)}</div><div className="l">Records</div></div>
        <div><div className="n">{formatNumber(counts?.federations)}</div><div className="l">Federations</div></div>
      </div>

      {/* main grid */}
      <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 380px' }}>
        {/* left: latest results */}
        <div className="rule-r">
          <div style={{ padding: '28px 32px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
              <h1 style={{ margin: 0, letterSpacing: '-0.03em' }}>Latest results</h1>
              {latest && <span className="tag tag-accent" style={{ marginBottom: 8 }}>TOP SWIMS</span>}
            </div>
            {latest && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, fontSize: 13, color: 'var(--color-neutral-700)' }}>
                <Flag code={latest.country_detail?.code} name={latest.country_detail?.name} />
                <span>
                  <Link to={`/meets/${latest.id}`} style={{ color: 'inherit' }}>{latest.name}</Link>
                  {' — '}{latest.location} · {formatDateRange(latest.date, latest.end_date)} · {latest.pool}
                </span>
              </div>
            )}
          </div>

          <div style={{ padding: '0 32px 28px' }} className="table-scroll">
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
                {topResults.slice((topPage - 1) * 10, topPage * 10).map((r, i) => (
                  <tr key={r.id}>
                    <td className="asw-num">{(topPage - 1) * 10 + i + 1}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Flag code={r.swimmer_detail?.nationality_detail?.code} name={r.swimmer_detail?.nationality_detail?.name} />
                        <Link to={`/swimmers/${r.swimmer}`} style={{ color: 'inherit', textDecoration: 'none' }}>{r.swimmer_detail?.name}</Link>
                      </div>
                    </td>
                    <td className="text-muted">{r.event_detail?.name}</td>
                    <td className="time asw-time">{r.formatted_time}</td>
                    <td className="num asw-num">{r.fina_points ?? '—'}</td>
                  </tr>
                ))}
                {topResults.length === 0 && (
                  <tr><td colSpan={5} className="text-muted" style={{ textAlign: 'center', padding: 24 }}>No results yet</td></tr>
                )}
              </tbody>
            </table>
            <Pager page={topPage} pageSize={10} count={topResults.length} onPage={setTopPage} />
            {latest && (
              <div style={{ display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap' }}>
                <Link className="btn btn-secondary" to={`/meets/${latest.id}`}>All results from this meet</Link>
                <Link className="btn btn-ghost" to="/rankings">Rankings →</Link>
              </div>
            )}
          </div>

          {/* season leaders */}
          {leaders.length > 0 && (
            <div className="rule-t" style={{ padding: '24px 32px 28px' }}>
              <SectHead title={leadersYear ? `${leadersYear} season leaders · LCM` : 'All-time leaders · LCM'} to="/rankings" linkLabel="Full rankings" />
              <div className="cellgrid" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(160px, 1fr))` }}>
                {leaders.map((l) => (
                  <Link key={l.label} to="/rankings" style={{ color: 'inherit', textDecoration: 'none' }}>
                    <div className="card-kicker">{l.label}</div>
                    <div className="asw-time" style={{ fontSize: 24, margin: '6px 0 4px' }}>{l.row.time}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Flag code={l.row.nationality_code} name={l.row.nationality} />
                      <span style={{ fontSize: 12, fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.row.swimmer_name}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* new records */}
          <div className="rule-t" style={{ padding: '24px 32px 30px' }}>
            <SectHead title="New records" to="/new-records" linkLabel="Record books" />
            {newRecords.length === 0 ? (
              <div className="text-muted" style={{ fontSize: 13 }}>No new records yet.</div>
            ) : (
              <div className="cellgrid grid-3" style={{ gridTemplateColumns: `repeat(${Math.min(3, newRecords.length)}, 1fr)` }}>
                {newRecords.map((r) => (
                  <div key={r.id}>
                    <div className="card-kicker">{r.record_type} record</div>
                    <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 22, margin: '4px 0 2px' }} className="asw-num">{r.formatted_time}</div>
                    <div style={{ fontSize: 12 }}>{r.event_detail?.name} · {r.swimmer_detail?.sex === 'F' ? 'Women' : 'Men'} · {r.pool}</div>
                    <div style={{ fontSize: 12, color: 'var(--color-neutral-700)', marginTop: 4 }}>
                      {r.swimmer_detail?.name} · {r.swimmer_detail?.nationality_detail?.code}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* right rail */}
        <div>
          <div className="rule-b" style={{ padding: '28px 28px 22px' }}>
            <div className="kicker" style={{ marginBottom: 8 }}>{upcoming ? 'Next championship' : 'Latest championship'}</div>
            {featured ? (
              <>
                <Link to={`/meets/${featured.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                  <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 20, lineHeight: 1.15 }}>
                    {featured.name}
                  </div>
                </Link>
                <div style={{ fontSize: 12, color: 'var(--color-neutral-700)', marginTop: 4 }}>
                  {featured.location}
                  {featured.country_detail ? `, ${featured.country_detail.name}` : ''}
                  {' · '}{formatDateRange(featured.date, featured.end_date)} · {featured.pool}
                </div>
                {upcoming && <Countdown target={upcoming.d.getTime()} />}
              </>
            ) : (
              <div className="text-muted" style={{ fontSize: 13 }}>Nothing scheduled.</div>
            )}
          </div>

          {/* medal tally */}
          <div className="rule-b" style={{ padding: '24px 28px' }}>
            <SectHead title="Medal tally" to="/medals" linkLabel="All medals" />
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 24 }}>#</th>
                  <th>Team</th>
                  <th className="num">G</th>
                  <th className="num">S</th>
                  <th className="num">B</th>
                  <th className="num">Σ</th>
                </tr>
              </thead>
              <tbody>
                {medalTally.map((row, i) => (
                  <tr key={i}>
                    <td className="asw-num">{i + 1}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Flag code={row.swimmer__nationality__code} name={row.swimmer__nationality__name} />
                        {row.swimmer__nationality__name}
                      </div>
                    </td>
                    <td className="num asw-num" style={{ fontWeight: 800 }}>{row.gold}</td>
                    <td className="num asw-num">{row.silver}</td>
                    <td className="num asw-num">{row.bronze}</td>
                    <td className="num asw-num">{row.total}</td>
                  </tr>
                ))}
                {medalTally.length === 0 && (
                  <tr><td colSpan={6} className="text-muted" style={{ textAlign: 'center', padding: 20 }}>No medals yet</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* most improved — progress stories */}
          {improved.length > 0 && (
            <div className="rule-b" style={{ padding: '24px 28px' }}>
              <SectHead title="Most improved" to={latest ? `/meets/${latest.id}?tab=most-improved` : '/championships'} linkLabel="More" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {improved.map((r, i) => (
                  <div key={`${r.swimmer_id}-${r.event_name}`} style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 12, borderBottom: i < improved.length - 1 ? '1px solid var(--color-divider)' : 'none' }}>
                    <Flag code={r.nationality_code} name={r.nationality} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <Link to={`/swimmers/${r.swimmer_id}`} style={{ color: 'inherit', textDecoration: 'none', fontWeight: 600, fontSize: 13 }}>{r.swimmer_name}</Link>
                      <div className="text-muted" style={{ fontSize: 11, marginTop: 1 }}>{r.event_name} · {r.previous_best} → {r.current_time}</div>
                    </div>
                    <span className="asw-num" style={{ fontWeight: 800, fontSize: 15, color: 'var(--asw-fast)', flex: 'none' }}>−{r.improvement}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* birthdays this month */}
          {birthdays.length > 0 && (
            <div className="rule-b" style={{ padding: '24px 28px' }}>
              <SectHead title={`Birthdays · ${MONTHS[new Date().getMonth()]}`} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {birthdays.map((b, i) => (
                  <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 10, borderBottom: i < birthdays.length - 1 ? '1px solid var(--color-divider)' : 'none' }}>
                    <Flag code={b.nationality_code} name={b.nationality} />
                    <Link to={`/swimmers/${b.id}`} style={{ color: 'inherit', textDecoration: 'none', fontSize: 13, fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.name}</Link>
                    <span className="text-muted" style={{ fontSize: 12, flex: 'none' }}>
                      turns {b.age + (b.day >= new Date().getDate() ? 1 : 0)} · {b.day} {MONTHS[new Date().getMonth()].slice(0, 3)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* head-to-head teaser */}
          <div style={{ padding: '24px 28px' }}>
            <SectHead title="Head-to-head" />
            <div className="micro" style={{ marginBottom: 12, textTransform: 'none', letterSpacing: 0, fontSize: 12 }}>
              Pick two swimmers and see who wins, event by event.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[{ v: cmpA, set: setCmpA, ph: 'First swimmer…' }, { v: cmpB, set: setCmpB, ph: 'Second swimmer…' }].map(({ v, set, ph }, i) =>
                v ? (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--color-divider)', padding: '8px 10px' }}>
                    <Flag code={v.nationality_detail?.code || v.nationality_code} name={v.nationality_detail?.name || v.nationality} />
                    <span style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>{v.name}</span>
                    <button type="button" onClick={() => set(null)} aria-label="Remove"
                      style={{ border: 0, background: 'transparent', cursor: 'pointer', padding: 0, display: 'inline-flex', color: 'var(--color-neutral-700)' }}>
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <SwimmerSearchInput key={i} placeholder={ph} onPick={set} />
                )
              )}
              <button
                type="button"
                className="btn btn-primary"
                disabled={!cmpA || !cmpB}
                style={{ opacity: cmpA && cmpB ? 1 : 0.45, cursor: cmpA && cmpB ? 'pointer' : 'default' }}
                onClick={() => cmpA && cmpB && navigate(`/compare?ids=${cmpA.id},${cmpB.id}`)}>
                Compare →
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* news + media/HOF */}
      <div className="grid-2 rule-t" style={{ display: 'grid', gridTemplateColumns: '1fr 380px' }}>
        <div className="rule-r" style={{ padding: '28px 32px 32px' }}>
          <SectHead title="Featured" to="/news" linkLabel="All news" />
          {articles.length === 0 ? (
            <div className="text-muted" style={{ fontSize: 13 }}>No published articles yet.</div>
          ) : (
            <>
              {articles[0]?.cover_image && (
                <Link to={`/news/${articles[0].id}`}>
                  <div className="grayscale" style={{ width: '100%', height: 340, overflow: 'hidden' }}>
                    <img src={mediaUrl(articles[0].cover_image)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                </Link>
              )}
              <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginTop: 18 }}>
                <div>
                  <div className="card-kicker">Latest story</div>
                  <Link to={`/news/${articles[0].id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                    <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 26, lineHeight: 1.08, letterSpacing: '-0.02em', margin: '6px 0 8px' }}>
                      {articles[0].title}
                    </div>
                  </Link>
                  <p style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--color-neutral-800)', margin: '0 0 12px' }}>
                    {String(articles[0].body || '').slice(0, 220)}…
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 12, borderTop: '1px solid var(--color-divider)', fontSize: 13, color: 'var(--color-neutral-700)' }}>
                    {articles[0].country_detail && <Flag code={articles[0].country_detail.code} name={articles[0].country_detail.name} />}
                    <span>{formatDate(articles[0].published_at || articles[0].created_at)}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {articles.slice(1, 4).map((a) => (
                    <Link key={a.id} to={`/news/${a.id}`} style={{ display: 'flex', gap: 12, paddingBottom: 14, borderBottom: '1px solid var(--color-divider)', color: 'inherit', textDecoration: 'none' }}>
                      {a.cover_image && (
                        <div className="grayscale" style={{ width: 84, height: 60, flex: 'none', overflow: 'hidden' }}>
                          <img src={mediaUrl(a.cover_image)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </div>
                      )}
                      <div style={{ fontSize: 13, lineHeight: 1.35 }}>{a.title}</div>
                    </Link>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <div style={{ padding: '28px 28px 32px' }}>
          <SectHead title="Media" to="/media" linkLabel="Albums" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {albums.map((al) => (
              <Link key={al.id} to={`/media/albums/${al.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className="grayscale" style={{ aspectRatio: '1/1', background: 'var(--color-surface)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {al.cover ? (
                    <img src={mediaUrl(al.cover)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <span className="micro" style={{ padding: 8, textAlign: 'center' }}>{al.title}</span>
                  )}
                </div>
              </Link>
            ))}
          </div>

          <div className="rule-t" style={{ marginTop: 24, paddingTop: 20 }}>
            <SectHead title="Hall of Fame" to="/hall-of-fame" linkLabel="Inductees" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {inductees.map((p, i) => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 10, borderBottom: i < inductees.length - 1 ? '1px solid var(--color-divider)' : 'none' }}>
                  <Flag code={p.country_detail?.code} name={p.country_detail?.name} />
                  <span style={{ fontSize: 13, flex: 1 }}>{p.name}</span>
                  <span style={{ fontSize: 12, color: 'var(--color-neutral-700)' }}>Class of {p.inducted_year}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* federations */}
      <div className="rule-t" style={{ padding: '26px 32px 30px' }}>
        <SectHead title={`Federations · ${arabCountries.length} countries`} to="/countries" linkLabel="All countries" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: '16px 12px' }}>
          {arabCountries.map((c) => (
            <Link key={c.id} to={`/countries/${c.id}`} style={{ display: 'flex', flexDirection: 'column', gap: 6, textDecoration: 'none', color: 'inherit' }}>
              <Flag code={c.code} name={c.name} large />
              <span style={{ fontSize: 11, lineHeight: 1.15 }}>{c.name}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
