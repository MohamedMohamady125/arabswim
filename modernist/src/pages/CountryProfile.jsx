import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getCountryProfile } from '../api/core'
import Flag from '../components/Flag'
import { Loading, Empty, SectHead } from '../components/ui'
import { formatDate, formatNumber } from '../utils'

export default function CountryProfile() {
  const { id } = useParams()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    getCountryProfile(id)
      .then((res) => alive && setProfile(res.data))
      .catch(() => alive && setProfile(null))
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [id])

  if (loading) return <Loading label="Loading country profile" />
  if (!profile?.country) return <Empty label="Country not found" />

  const { country, stats, medals } = profile
  const topSwimmers = profile.top_swimmers || []
  const topMedalists = profile.top_medalists || []
  const bestTimes = profile.best_times || []
  const records = profile.records || []

  const countCells = [
    ['Swimmers', stats?.swimmers],
    ['Results', stats?.results],
    ['Meets hosted', stats?.championships_hosted],
    ['Teams', stats?.teams],
    ['Records', stats?.records],
    ['Medals', stats?.medals],
  ].filter(([, v]) => v != null)

  return (
    <div>
      {/* header */}
      <div className="pad-lg rule-b">
        <Link to="/countries" style={{ fontSize: 12, textDecoration: 'none' }}>← All countries</Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 16, flexWrap: 'wrap' }}>
          <Flag code={country.code} name={country.name} large />
          <h1 style={{ margin: 0, letterSpacing: '-0.03em' }}>{country.name}</h1>
          {country.region === 'GCC' ? (
            <span className="tag tag-dark">GCC</span>
          ) : country.region === 'ARAB' ? (
            <span className="tag tag-accent">Arab</span>
          ) : (
            <span className="tag tag-neutral">{country.region}</span>
          )}
          <span className="micro">{country.code}</span>
        </div>
      </div>

      {/* counts strip */}
      {countCells.length > 0 && (
        <div className="counts" style={{ gridTemplateColumns: `repeat(${countCells.length}, 1fr)` }}>
          {countCells.map(([l, n]) => (
            <div key={l}>
              <div className="n">{formatNumber(n)}</div>
              <div className="l">{l}</div>
            </div>
          ))}
        </div>
      )}

      {/* top swimmers */}
      <div className="pad-lg">
        <SectHead title="Top swimmers" />
        {topSwimmers.length === 0 ? (
          <Empty label="No swimmers on record" />
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 30 }}>#</th>
                  <th>Swimmer</th>
                  <th>Club</th>
                  <th>Best event</th>
                  <th className="time">Time</th>
                  <th className="num">FINA</th>
                </tr>
              </thead>
              <tbody>
                {topSwimmers.map((s, i) => (
                  <tr key={s.id}>
                    <td className="asw-num">{i + 1}</td>
                    <td>
                      <Link to={`/swimmers/${s.id}`} style={{ color: 'inherit', textDecoration: 'none', fontWeight: 600 }}>
                        {s.name}
                      </Link>
                      <span className="text-muted" style={{ fontSize: 12 }}> · {s.sex === 'F' ? 'W' : 'M'}</span>
                    </td>
                    <td className="text-muted">{s.club || '—'}</td>
                    <td>{s.best_event || '—'}</td>
                    <td className="time asw-time">{s.best_time || '—'}</td>
                    <td className="num asw-num">{s.best_fina ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* best times */}
      <div className="rule-t pad-lg">
        <SectHead title="Best times" />
        {bestTimes.length === 0 ? (
          <Empty label="No times on record" />
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Sex</th>
                  <th>Pool</th>
                  <th className="time">Time</th>
                  <th className="num">FINA</th>
                  <th>Swimmer</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {bestTimes.map((t, i) => (
                  <tr key={i}>
                    <td>{t.event}</td>
                    <td className="text-muted">{t.sex === 'F' ? 'Women' : 'Men'}</td>
                    <td className="text-muted">{t.pool}</td>
                    <td className="time asw-time">{t.time}</td>
                    <td className="num asw-num">{t.fina ?? '—'}</td>
                    <td>
                      {t.swimmer_id ? (
                        <Link to={`/swimmers/${t.swimmer_id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{t.swimmer}</Link>
                      ) : (
                        t.swimmer
                      )}
                    </td>
                    <td className="text-muted">{formatDate(t.date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* records */}
      <div className="rule-t pad-lg">
        <SectHead title="Records" />
        {records.length === 0 ? (
          <Empty label="No records held" />
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Event</th>
                  <th>Sex</th>
                  <th>Pool</th>
                  <th className="time">Time</th>
                  <th>Swimmer</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r, i) => (
                  <tr key={r.id ?? i}>
                    <td><span className="tag tag-outline">{r.record_type || r.type || '—'}</span></td>
                    <td>{r.event_detail?.name || r.event || '—'}</td>
                    <td className="text-muted">{r.sex === 'F' ? 'Women' : r.sex === 'M' ? 'Men' : '—'}</td>
                    <td className="text-muted">{r.pool || '—'}</td>
                    <td className="time asw-time">{r.formatted_time || r.time || '—'}</td>
                    <td>{r.swimmer_detail?.name || r.swimmer || '—'}</td>
                    <td className="text-muted">{formatDate(r.date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* medals */}
      <div className="rule-t pad-lg">
        <SectHead title="Medals" />
        {!medals || !medals.total ? (
          <Empty label="No medals yet" />
        ) : (
          <>
            <div className="cellgrid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 24 }}>
              {[
                ['Gold', medals.gold, 'var(--asw-gold)'],
                ['Silver', medals.silver, 'var(--asw-silver)'],
                ['Bronze', medals.bronze, 'var(--asw-bronze)'],
                ['Total', medals.total, 'var(--color-text)'],
              ].map(([l, n, color]) => (
                <div key={l}>
                  <div className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 30, color }}>
                    {formatNumber(n)}
                  </div>
                  <div className="micro" style={{ marginTop: 4 }}>{l}</div>
                </div>
              ))}
            </div>
            {topMedalists.length > 0 && (
              <div className="table-scroll">
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ width: 30 }}>#</th>
                      <th>Swimmer</th>
                      <th className="num">G</th>
                      <th className="num">S</th>
                      <th className="num">B</th>
                      <th className="num">Σ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topMedalists.map((m, i) => (
                      <tr key={m.id ?? i}>
                        <td className="asw-num">{i + 1}</td>
                        <td>
                          {m.id ? (
                            <Link to={`/swimmers/${m.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{m.name}</Link>
                          ) : (
                            m.name
                          )}
                        </td>
                        <td className="num asw-num" style={{ fontWeight: 800 }}>{m.gold}</td>
                        <td className="num asw-num">{m.silver}</td>
                        <td className="num asw-num">{m.bronze}</td>
                        <td className="num asw-num">{m.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
