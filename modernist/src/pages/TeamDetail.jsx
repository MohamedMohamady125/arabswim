import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getTeamProfile, getTeamMedals, getTeamTimes } from '../api/teams'
import { getArticles } from '../api/news'
import { getAlbums } from '../api/media'
import { getCoaches } from '../api/coaches'
import api from '../api/client'
import Flag from '../components/Flag'
import { Loading, Empty, SectHead, MedalIcon } from '../components/ui'
import { formatDate, formatNumber, formatTime, mediaUrl } from '../utils'

// Not yet in src/api/teams.js — defined locally
const getTeamRecords = (id) => api.get(`/teams/${id}/records/`)
const getTeamStats = (id) => api.get(`/teams/${id}/stats/`)
const getTeamRanking = (id) => api.get(`/teams/${id}/ranking/`)

const list = (d) => (Array.isArray(d) ? d : d?.results || [])

function acronym(name) {
  const words = String(name || '').split(/\s+/).filter(Boolean)
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase()
  return words.slice(0, 3).map((w) => w[0]).join('').toUpperCase()
}

const COACH_LEVELS = {
  HEAD: 'Head Coach',
  ASSISTANT: 'Assistant Coach',
  TECHNIQUE: 'Technique Coach',
  FITNESS: 'Fitness / S&C Coach',
  YOUTH: 'Youth Development',
  PRIVATE: 'Private Coach',
}

export default function TeamDetail() {
  const { id } = useParams()
  const [profile, setProfile] = useState(null)
  const [medals, setMedals] = useState([])
  const [times, setTimes] = useState([])
  const [records, setRecords] = useState([])
  const [stats, setStats] = useState(null)
  const [ranking, setRanking] = useState([])
  const [coaches, setCoaches] = useState([])
  const [articles, setArticles] = useState([])
  const [albums, setAlbums] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    async function load() {
      try {
        const [profRes, medalsRes, timesRes, recRes, statsRes, rankRes, coachRes, newsRes, albumRes] = await Promise.allSettled([
          getTeamProfile(id),
          getTeamMedals(id),
          getTeamTimes(id),
          getTeamRecords(id),
          getTeamStats(id),
          getTeamRanking(id),
          getCoaches({ team: id }),
          getArticles({ team: id, status: 'PUBLISHED' }),
          getAlbums({ team: id }),
        ])
        if (!alive) return
        const val = (r) => (r.status === 'fulfilled' ? r.value.data : null)
        setProfile(val(profRes))
        setMedals(list(val(medalsRes)))
        setTimes(list(val(timesRes)).slice(0, 20))
        setRecords(list(val(recRes)))
        setStats(val(statsRes))
        setRanking(list(val(rankRes)))
        setCoaches(list(val(coachRes)))
        setArticles(list(val(newsRes)))
        setAlbums(list(val(albumRes)))
      } finally {
        if (alive) setLoading(false)
      }
    }
    load()
    return () => { alive = false }
  }, [id])

  const team = profile?.team
  const roster = useMemo(() => (profile?.roster || []).filter((s) => !s.is_relay_team), [profile])
  const medalCounts = profile?.medal_counts
  const trophies = team?.trophies || []
  const totalMedals = useMemo(() => {
    let n = 0
    for (const scope of Object.values(medalCounts || {})) {
      for (const v of Object.values(scope || {})) n += v || 0
    }
    return n
  }, [medalCounts])

  if (loading) return <Loading label="Loading club" />
  if (!team) return <Empty label="Club not found" />

  return (
    <div>
      {/* header */}
      <div className="pad-lg rule-b" style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
        {team.logo ? (
          <div className="grayscale" style={{ width: 96, height: 96, flex: 'none', overflow: 'hidden', border: '1px solid var(--color-divider)' }}>
            <img src={mediaUrl(team.logo)} alt={team.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
        ) : (
          <div style={{ width: 96, height: 96, flex: 'none', background: 'var(--color-accent-800)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 26 }}>
            {acronym(team.name)}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 260 }}>
          <div className="kicker" style={{ marginBottom: 6 }}>{team.is_national_team ? 'National team' : 'Club'}</div>
          <h1 style={{ margin: 0, letterSpacing: '-0.03em' }}>{team.name}</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, fontSize: 13, color: 'var(--color-neutral-700)', flexWrap: 'wrap' }}>
            <Flag code={team.country_detail?.code} name={team.country_detail?.name} />
            <span>{team.country_detail?.name}</span>
            {team.founded_year && <><span>·</span><span className="asw-num">Founded {team.founded_year}</span></>}
            {team.address && <><span>·</span><span>{team.address}</span></>}
          </div>
          {(team.website || team.email || team.phone) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6, fontSize: 13, flexWrap: 'wrap' }}>
              {team.website && <a href={team.website} target="_blank" rel="noreferrer">{team.website}</a>}
              {team.email && <a href={`mailto:${team.email}`}>{team.email}</a>}
              {team.phone && <a className="asw-num" href={`tel:${team.phone}`}>{team.phone}</a>}
            </div>
          )}
        </div>
      </div>

      {/* counts strip */}
      <div className="counts">
        <div><div className="n">{formatNumber(roster.length)}</div><div className="l">Swimmers</div></div>
        <div><div className="n">{formatNumber(totalMedals || medals.length)}</div><div className="l">Medals</div></div>
        <div><div className="n">{formatNumber(stats?.championships)}</div><div className="l">Championships</div></div>
        <div><div className="n">{formatNumber(stats?.best_fina?.points ?? profile?.best_swimmers?.[0]?.fina_points)}</div><div className="l">Best FINA</div></div>
        <div><div className="n">{formatNumber(records.length ? records.length : null)}</div><div className="l">Records held</div></div>
      </div>

      <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 380px' }}>
        {/* left: roster */}
        <div className="rule-r pad">
          <SectHead title={`Roster · ${roster.length}`} />
          {roster.length === 0 ? (
            <Empty label="No swimmers on roster" />
          ) : (
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>Swimmer</th>
                    <th className="num">Born</th>
                    <th className="num">Age</th>
                    <th>Sex</th>
                  </tr>
                </thead>
                <tbody>
                  {roster.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <Flag code={s.nationality_detail?.code} name={s.nationality_detail?.name} />
                          <Link to={`/swimmers/${s.id}`} style={{ color: 'inherit', textDecoration: 'none', fontWeight: 600 }}>
                            {s.name}
                          </Link>
                        </div>
                      </td>
                      <td className="num asw-num">{s.birth_year ?? '—'}</td>
                      <td className="num asw-num">{s.age ?? '—'}</td>
                      <td className="text-muted">{s.sex === 'F' ? 'W' : 'M'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* coaches */}
          {coaches.length > 0 && (
            <div className="rule-t" style={{ marginTop: 24, paddingTop: 24 }}>
              <SectHead title={`Coaching staff · ${coaches.length}`} to="/coaches" linkLabel="All coaches" />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
                {coaches.map((c) => (
                  <div key={c.id} style={{ border: '1px solid var(--color-divider)', padding: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
                    {c.photo ? (
                      <div className="grayscale" style={{ width: 36, height: 36, flex: 'none', overflow: 'hidden' }}>
                        <img src={mediaUrl(c.photo)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      </div>
                    ) : (
                      <div style={{ width: 36, height: 36, flex: 'none', background: 'var(--color-neutral-200)', color: 'var(--color-neutral-800)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 12 }}>
                        {acronym(c.name)}
                      </div>
                    )}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{c.name}</div>
                      {c.level && <div className="text-muted" style={{ fontSize: 12 }}>{COACH_LEVELS[c.level] || c.level}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* right rail: top swimmers + medal breakdown + medals + trophies */}
        <div>
          <div className="rule-b" style={{ padding: '24px 28px' }}>
            <SectHead title="Top swimmers · FINA" />
            {(profile?.best_swimmers || []).length === 0 ? (
              <div className="text-muted" style={{ fontSize: 13 }}>No data yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {profile.best_swimmers.slice(0, 6).map((sw, i) => {
                  const max = profile.best_swimmers[0]?.fina_points || 1
                  return (
                    <div key={sw.swimmer_id}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}>
                        <span>
                          <Link to={`/swimmers/${sw.swimmer_id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{sw.name}</Link>
                          <span className="text-muted"> · {sw.nationality_code}</span>
                        </span>
                        <span className="asw-num" style={{ fontWeight: 800 }}>{sw.fina_points}</span>
                      </div>
                      <div className="bar">
                        <div style={{ width: `${Math.round(((sw.fina_points || 0) / max) * 100)}%`, background: i < 2 ? 'var(--color-accent)' : 'var(--color-neutral-800)' }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* medal breakdown + top medalist */}
          <div className="rule-b" style={{ padding: '24px 28px' }}>
            <SectHead title="Medal breakdown" />
            {totalMedals === 0 ? (
              <div className="text-muted" style={{ fontSize: 13 }}>No medals yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {['international', 'national'].map((scope) => {
                  const c = medalCounts?.[scope]
                  if (!c) return null
                  const total = (c.GOLD || 0) + (c.SILVER || 0) + (c.BRONZE || 0)
                  if (!total) return null
                  return (
                    <div key={scope}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}>
                        <span style={{ textTransform: 'capitalize', fontWeight: 600 }}>{scope}</span>
                        <span className="asw-num" style={{ fontWeight: 800 }}>{total}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 12, fontSize: 13 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><MedalIcon type="GOLD" size={15} /> <span className="asw-num">{c.GOLD || 0}</span></span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><MedalIcon type="SILVER" size={15} /> <span className="asw-num">{c.SILVER || 0}</span></span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><MedalIcon type="BRONZE" size={15} /> <span className="asw-num">{c.BRONZE || 0}</span></span>
                      </div>
                    </div>
                  )
                })}
                {stats?.top_medalist && (
                  <div style={{ borderTop: '1px solid var(--color-divider)', paddingTop: 12, fontSize: 13 }}>
                    <div className="micro" style={{ textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Most decorated</div>
                    <Link to={`/swimmers/${stats.top_medalist.swimmer_id}`} style={{ color: 'inherit', textDecoration: 'none', fontWeight: 600 }}>
                      {stats.top_medalist.swimmer_name}
                    </Link>
                    <span className="text-muted"> · <span className="asw-num">{stats.top_medalist.count}</span> medals</span>
                  </div>
                )}
                {stats?.best_fina && (
                  <div style={{ borderTop: '1px solid var(--color-divider)', paddingTop: 12, fontSize: 13 }}>
                    <div className="micro" style={{ textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Highest FINA points</div>
                    <Link to={`/swimmers/${stats.best_fina.swimmer_id}`} style={{ color: 'inherit', textDecoration: 'none', fontWeight: 600 }}>
                      {stats.best_fina.swimmer_name}
                    </Link>
                    <span className="text-muted"> · <span className="asw-num" style={{ fontWeight: 800 }}>{stats.best_fina.points}</span> · {stats.best_fina.event_name}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="rule-b" style={{ padding: '24px 28px' }}>
            <SectHead title="Medals" />
            {medals.length === 0 ? (
              <div className="text-muted" style={{ fontSize: 13 }}>No medals recorded.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {medals.slice(0, 12).map((m, i) => (
                  <div key={m.id ?? i} style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 10, borderBottom: '1px solid var(--color-divider)', fontSize: 13 }}>
                    <MedalIcon type={m.medal_type} />
                    <span style={{ flex: 1 }}>
                      {m.event_detail?.name || m.event_name || '—'}
                      {(m.swimmer_detail?.name || m.swimmer_name) && (
                        <span className="text-muted"> · {m.swimmer_detail?.name || m.swimmer_name}</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* trophies */}
          <div style={{ padding: '24px 28px' }}>
            <SectHead title={`Trophies · ${trophies.length}`} />
            {trophies.length === 0 ? (
              <div className="text-muted" style={{ fontSize: 13 }}>No trophies yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {trophies.map((t, i) => (
                  <div key={t.id ?? i} style={{ display: 'flex', alignItems: 'baseline', gap: 10, paddingBottom: 10, borderBottom: '1px solid var(--color-divider)', fontSize: 13 }}>
                    <span style={{ flex: 1, fontWeight: 600 }}>{t.name}</span>
                    <span className="asw-num text-muted" style={{ fontWeight: 800 }}>{t.year}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* records held */}
      <div className="rule-t pad">
        <SectHead title={`Records held · ${records.length}`} />
        {records.length === 0 ? (
          <Empty label="No records held" />
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Event</th>
                  <th>Swimmer</th>
                  <th className="time">Time</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r, i) => (
                  <tr key={r.id ?? i}>
                    <td><span className={r.record_type === 'ARAB' ? 'tag tag-dark' : 'tag tag-accent'}>{r.record_type}</span></td>
                    <td style={{ fontWeight: 600 }}>{r.event_name}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Flag code={r.nationality_code} name={r.swimmer_name} />
                        {r.swimmer_id ? (
                          <Link to={`/swimmers/${r.swimmer_id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{r.swimmer_name}</Link>
                        ) : (
                          <span>{r.swimmer_name}</span>
                        )}
                      </div>
                    </td>
                    <td className="time asw-time">{typeof r.time === 'number' ? formatTime(r.time) : r.time}</td>
                    <td className="asw-num" style={{ whiteSpace: 'nowrap' }}>{formatDate(r.date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* club ranking */}
      {ranking.length > 0 && (
        <div className="rule-t pad">
          <SectHead title="Club ranking" />
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th className="num">#</th>
                  <th>Club</th>
                  <th className="num">Gold</th>
                  <th className="num">Silver</th>
                  <th className="num">Bronze</th>
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((r) => (
                  <tr key={r.team_id} style={r.is_current ? { background: 'var(--color-accent-100)', fontWeight: 600 } : undefined}>
                    <td className="num asw-num" style={{ fontWeight: 800 }}>{r.rank}</td>
                    <td>
                      {r.team_id !== Number(id) ? (
                        <Link to={`/teams/${r.team_id}`} style={{ color: 'inherit', textDecoration: 'none', fontWeight: 600 }}>{r.team_name}</Link>
                      ) : (
                        <span style={{ fontWeight: 700 }}>{r.team_name} <span className="tag tag-dark">This club</span></span>
                      )}
                    </td>
                    <td className="num asw-num">{r.gold}</td>
                    <td className="num asw-num">{r.silver}</td>
                    <td className="num asw-num">{r.bronze}</td>
                    <td className="num asw-num" style={{ fontWeight: 800 }}>{r.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* best times */}
      <div className="rule-t pad">
        <SectHead title="Best times" />
        {times.length === 0 ? (
          <Empty label="No times recorded" />
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Swimmer</th>
                  <th className="time">Time</th>
                  <th className="num">FINA</th>
                  <th>Meet</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {times.map((t) => (
                  <tr key={t.id}>
                    <td style={{ fontWeight: 600 }}>{t.event_name} <span className="text-muted" style={{ fontWeight: 400, fontSize: 12 }}>{t.pool}</span></td>
                    <td>
                      <Link to={`/swimmers/${t.swimmer_id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{t.swimmer_name}</Link>
                    </td>
                    <td className="time asw-time">{t.time}</td>
                    <td className="num asw-num">{t.fina_points ?? '—'}</td>
                    <td className="text-muted">{t.championship_name}</td>
                    <td className="asw-num" style={{ whiteSpace: 'nowrap' }}>{formatDate(t.championship_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* news */}
      {articles.length > 0 && (
        <div className="rule-t pad">
          <SectHead title="News" to="/news" linkLabel="All news" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
            {articles.slice(0, 6).map((a) => (
              <Link key={a.id} to={`/news/${a.id}`} style={{ color: 'inherit', textDecoration: 'none', border: '1px solid var(--color-divider)' }}>
                {a.cover_image && (
                  <div className="grayscale" style={{ height: 140, overflow: 'hidden' }}>
                    <img src={mediaUrl(a.cover_image)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                )}
                <div style={{ padding: 12 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.35 }}>{a.title}</div>
                  {a.published_at && <div className="text-muted asw-num" style={{ fontSize: 12, marginTop: 6 }}>{formatDate(a.published_at)}</div>}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* gallery */}
      {albums.length > 0 && (
        <div className="rule-t pad">
          <SectHead title="Gallery" to="/media" linkLabel="All media" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
            {albums.slice(0, 6).map((a) => (
              <Link key={a.id} to={`/media/albums/${a.id}`} style={{ color: 'inherit', textDecoration: 'none', border: '1px solid var(--color-divider)' }}>
                {a.cover ? (
                  <div className="grayscale" style={{ height: 120, overflow: 'hidden' }}>
                    <img src={mediaUrl(a.cover)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                ) : (
                  <div style={{ height: 120, background: 'var(--color-neutral-200)' }} />
                )}
                <div style={{ padding: 12 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{a.title}</div>
                  <div className="text-muted asw-num" style={{ fontSize: 12, marginTop: 4 }}>{a.items_count || 0} photos</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
