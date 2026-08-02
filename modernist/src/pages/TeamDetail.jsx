import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getTeamProfile, getTeamMedals, getTeamTimes } from '../api/teams'
import Flag from '../components/Flag'
import { Loading, Empty, SectHead, MedalIcon } from '../components/ui'
import { formatDate, formatNumber, mediaUrl } from '../utils'

const list = (d) => (Array.isArray(d) ? d : d?.results || [])

function acronym(name) {
  const words = String(name || '').split(/\s+/).filter(Boolean)
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase()
  return words.slice(0, 3).map((w) => w[0]).join('').toUpperCase()
}

export default function TeamDetail() {
  const { id } = useParams()
  const [profile, setProfile] = useState(null)
  const [medals, setMedals] = useState([])
  const [times, setTimes] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    async function load() {
      try {
        const [profRes, medalsRes, timesRes] = await Promise.allSettled([
          getTeamProfile(id),
          getTeamMedals(id),
          getTeamTimes(id),
        ])
        if (!alive) return
        const val = (r) => (r.status === 'fulfilled' ? r.value.data : null)
        setProfile(val(profRes))
        setMedals(list(val(medalsRes)))
        setTimes(list(val(timesRes)).slice(0, 20))
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
          </div>
        </div>
      </div>

      {/* counts strip */}
      <div className="counts">
        <div><div className="n">{formatNumber(roster.length)}</div><div className="l">Swimmers</div></div>
        <div><div className="n">{formatNumber(totalMedals || medals.length)}</div><div className="l">Medals</div></div>
        <div><div className="n">{formatNumber(medalCounts?.national ? (medalCounts.national.GOLD || 0) + (medalCounts.international?.GOLD || 0) : null)}</div><div className="l">Gold</div></div>
        <div><div className="n">{formatNumber(profile?.best_swimmers?.[0]?.fina_points)}</div><div className="l">Top FINA</div></div>
        <div><div className="n">{formatNumber(times.length ? times.length : null)}</div><div className="l">Best times listed</div></div>
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
        </div>

        {/* right rail: top swimmers + medals */}
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

          <div style={{ padding: '24px 28px' }}>
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
        </div>
      </div>

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
    </div>
  )
}
