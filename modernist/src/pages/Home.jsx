import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api/client'
import { getCountries } from '../api/core'
import { getChampionships } from '../api/championships'
import { getMedalSummary } from '../api/medals'
import { getNewRecords } from '../api/records'
import { getInductees } from '../api/fame'
import { getArticles } from '../api/news'
import { getAlbums } from '../api/media'
import Flag from '../components/Flag'
import { SectHead, Loading } from '../components/ui'
import { formatDate, formatNumber, mediaUrl, formatDateRange } from '../utils'

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
  const [medalTally, setMedalTally] = useState([])
  const [newRecords, setNewRecords] = useState([])
  const [inductees, setInductees] = useState([])
  const [articles, setArticles] = useState([])
  const [albums, setAlbums] = useState([])
  const [arabCountries, setArabCountries] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    async function load() {
      try {
        const [swimmersRes, meetsRes, resultsRes, recordsRes, countriesRes, newRecRes, fameRes, newsRes, albumsRes] =
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

        // latest meet → headline results + medal tally
        const latest = meetList[0]
        if (latest) {
          const [resTop, medals] = await Promise.allSettled([
            api.get('/results/', { params: { championship: latest.id, ordering: '-fina_points', page_size: 8 } }),
            getMedalSummary({ championship: latest.id }),
          ])
          if (!alive) return
          setTopResults(list(val(resTop)))
          setMedalTally(list(val(medals)).slice(0, 6))
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
                {topResults.map((r, i) => (
                  <tr key={r.id}>
                    <td className="asw-num">{i + 1}</td>
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
            {latest && (
              <div style={{ display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap' }}>
                <Link className="btn btn-secondary" to={`/meets/${latest.id}`}>All results from this meet</Link>
                <Link className="btn btn-ghost" to="/rankings">Rankings →</Link>
              </div>
            )}
          </div>

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

          {/* top performers */}
          <div style={{ padding: '24px 28px' }}>
            <h4 style={{ margin: '0 0 12px' }}>Top performers · FINA points</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {topResults.slice(0, 5).map((r, i) => {
                const max = topResults[0]?.fina_points || 1
                return (
                  <div key={r.id}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}>
                      <span>
                        <Link to={`/swimmers/${r.swimmer}`} style={{ color: 'inherit', textDecoration: 'none' }}>{r.swimmer_detail?.name}</Link>
                        <span className="text-muted"> · {r.swimmer_detail?.nationality_detail?.code}</span>
                      </span>
                      <span className="asw-num" style={{ fontWeight: 800 }}>{r.fina_points}</span>
                    </div>
                    <div className="bar">
                      <div style={{ width: `${Math.round(((r.fina_points || 0) / max) * 100)}%`, background: i < 2 ? 'var(--color-accent)' : 'var(--color-neutral-800)' }} />
                    </div>
                  </div>
                )
              })}
              {topResults.length === 0 && <div className="text-muted" style={{ fontSize: 13 }}>No data yet.</div>}
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
