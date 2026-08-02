import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import api from '../api/client'
import { getChampionship, getChampionshipStats, getChampionshipResults } from '../api/championships'
import { getMedalSummary, getMedalClubSummary, getMedalSwimmerSummary } from '../api/medals'
import Flag from '../components/Flag'
import { Loading, Empty, Seg } from '../components/ui'
import { formatDateRange } from '../utils'

const val = (r) => (r.status === 'fulfilled' ? r.value.data : null)
const list = (d) => (Array.isArray(d) ? d : d?.results || [])

function SwimmerCell({ result }) {
  const s = result.swimmer_detail
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Flag code={s?.nationality_detail?.code} name={s?.nationality_detail?.name} />
        <Link to={`/swimmers/${result.swimmer}`} style={{ color: 'inherit', textDecoration: 'none' }}>{s?.name}</Link>
      </div>
      {Array.isArray(result.relay_swimmers) && result.relay_swimmers.length > 0 && (
        <div style={{ fontSize: 11, color: 'var(--color-neutral-700)', marginTop: 3, paddingLeft: 36 }}>
          {result.relay_swimmers.map((rs) => (typeof rs === 'string' ? rs : rs?.name)).filter(Boolean).join(' · ')}
        </div>
      )}
    </div>
  )
}

function ResultsTab({ meetId, events }) {
  const [eventKey, setEventKey] = useState(events[0] ? `${events[0].event_id}|${events[0].gender}` : '')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!eventKey) return
    const [eventId, gender] = eventKey.split('|')
    let alive = true
    setLoading(true)
    getChampionshipResults(meetId, { event: eventId, gender, all_rounds: true })
      .then((res) => { if (alive) setRows(list(res.data)) })
      .catch(() => { if (alive) setRows([]) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [meetId, eventKey])

  // group by round_type then category, keep server order within groups
  const groups = useMemo(() => {
    const map = new Map()
    rows.forEach((r) => {
      const key = `${r.round_type || 'Results'}${r.category ? ` · ${r.category}` : ''}`
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(r)
    })
    return [...map.entries()]
  }, [rows])

  if (events.length === 0) return <Empty label="No events for this meet" />

  return (
    <div className="pad">
      <div style={{ maxWidth: 420, marginBottom: 18 }}>
        <div className="field">
          <label>Event</label>
          <select className="select" value={eventKey} onChange={(e) => setEventKey(e.target.value)}>
            {events.map((ev) => (
              <option key={`${ev.event_id}|${ev.gender}`} value={`${ev.event_id}|${ev.gender}`}>
                {ev.display_name} ({ev.results_count})
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading && <Loading label="Loading results" />}
      {!loading && rows.length === 0 && <Empty label="No results for this event" />}

      {!loading && groups.map(([label, groupRows]) => (
        <div key={label} style={{ marginBottom: 28 }}>
          <div className="kicker" style={{ marginBottom: 8 }}>{label}</div>
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 30 }}>#</th>
                  <th>Swimmer</th>
                  <th>Club</th>
                  <th className="num">Age</th>
                  <th className="time">Time</th>
                  <th className="num">FINA</th>
                </tr>
              </thead>
              <tbody>
                {groupRows.map((r, i) => (
                  <tr key={r.id}>
                    <td className="asw-num">{i + 1}</td>
                    <td><SwimmerCell result={r} /></td>
                    <td className="text-muted">{r.team || r.swimmer_detail?.club || '—'}</td>
                    <td className="num asw-num">{r.age_at_competition ?? '—'}</td>
                    <td className="time asw-time">{r.formatted_time}</td>
                    <td className="num asw-num">{r.fina_points ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}

function MedalsTab({ country, club, swimmer }) {
  const [scope, setScope] = useState('country')
  const rows = scope === 'country' ? country : scope === 'club' ? club : swimmer
  return (
    <div className="pad">
      <div style={{ marginBottom: 16 }}>
        <Seg
          options={[{ value: 'country', label: 'Country' }, { value: 'club', label: 'Club' }, { value: 'swimmer', label: 'Swimmer' }]}
          value={scope}
          onChange={setScope}
        />
      </div>
      {rows.length === 0 ? (
        <Empty label="No medals recorded" />
      ) : (
        <div className="table-scroll">
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
              {rows.map((row, i) => (
                <tr key={i}>
                  <td className="asw-num">{i + 1}</td>
                  <td>
                    {scope === 'country' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Flag code={row.swimmer__nationality__code} name={row.swimmer__nationality__name} />
                        {row.swimmer__nationality__name}
                      </div>
                    )}
                    {scope === 'club' && (row.result__team || '—')}
                    {scope === 'swimmer' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Flag code={row.swimmer__nationality__code} name={row.swimmer__nationality__name} />
                        <Link to={`/swimmers/${row.swimmer__id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{row.swimmer__name}</Link>
                      </div>
                    )}
                  </td>
                  <td className="num asw-num" style={{ fontWeight: 800 }}>{row.gold}</td>
                  <td className="num asw-num">{row.silver}</td>
                  <td className="num asw-num">{row.bronze}</td>
                  <td className="num asw-num">{row.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function TopPerformersTab({ rows }) {
  const max = rows[0]?.fina_points || 1
  return (
    <div className="pad">
      {rows.length === 0 ? (
        <Empty label="No results yet" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 720 }}>
          {rows.map((r, i) => (
            <div key={r.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5, gap: 12 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <span className="asw-num text-muted" style={{ width: 22, flex: 'none' }}>{i + 1}</span>
                  <Flag code={r.swimmer_detail?.nationality_detail?.code} name={r.swimmer_detail?.nationality_detail?.name} />
                  <Link to={`/swimmers/${r.swimmer}`} style={{ color: 'inherit', textDecoration: 'none' }}>{r.swimmer_detail?.name}</Link>
                  <span className="text-muted">· {r.event_detail?.name} · {r.formatted_time}</span>
                </span>
                <span className="asw-num" style={{ fontWeight: 800 }}>{r.fina_points}</span>
              </div>
              <div className="bar">
                <div style={{ width: `${Math.round(((r.fina_points || 0) / max) * 100)}%`, background: i < 3 ? 'var(--color-accent)' : 'var(--color-neutral-800)' }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function MeetDetail() {
  const { id } = useParams()
  const [meet, setMeet] = useState(null)
  const [stats, setStats] = useState(null)
  const [medalCountry, setMedalCountry] = useState([])
  const [medalClub, setMedalClub] = useState([])
  const [medalSwimmer, setMedalSwimmer] = useState([])
  const [topResults, setTopResults] = useState([])
  const [tab, setTab] = useState('results')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(false)
    async function load() {
      try {
        const [meetRes, statsRes, mCountry, mClub, mSwimmer, topRes] = await Promise.allSettled([
          getChampionship(id),
          getChampionshipStats(id),
          getMedalSummary({ championship: id }),
          getMedalClubSummary({ championship: id }),
          getMedalSwimmerSummary({ championship: id }),
          api.get('/results/', { params: { championship: id, ordering: '-fina_points', page_size: 20 } }),
        ])
        if (!alive) return
        const m = val(meetRes)
        if (!m) { setError(true); return }
        setMeet(m)
        setStats(val(statsRes))
        setMedalCountry(list(val(mCountry)))
        setMedalClub(list(val(mClub)))
        setMedalSwimmer(list(val(mSwimmer)))
        setTopResults(list(val(topRes)))
      } finally {
        if (alive) setLoading(false)
      }
    }
    load()
    return () => { alive = false }
  }, [id])

  if (loading) return <Loading label="Loading meet" />
  if (error || !meet) return <Empty label="Meet not found" />

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
              {meet.country_detail ? `, ${meet.country_detail.name}` : ''}
              {' · '}{formatDateRange(meet.date, meet.end_date)}
              {' · '}<span className="tag tag-dark" style={{ verticalAlign: 'middle' }}>{meet.pool}</span>
            </div>
          </div>
        </div>
      </div>

      {/* counts strip */}
      {stats && (
        <div className="counts" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          <div><div className="n">{(stats.total_results ?? 0).toLocaleString('en-US')}</div><div className="l">Results</div></div>
          <div><div className="n">{(stats.total_swimmers ?? 0).toLocaleString('en-US')}</div><div className="l">Swimmers</div></div>
          <div><div className="n">{(stats.total_events ?? 0).toLocaleString('en-US')}</div><div className="l">Events</div></div>
          <div><div className="n">{((stats.male_count ?? 0)).toLocaleString('en-US')} / {(stats.female_count ?? 0).toLocaleString('en-US')}</div><div className="l">Men / Women</div></div>
        </div>
      )}

      {/* tabs */}
      <div className="rule-b" style={{ padding: '14px 32px' }}>
        <Seg
          options={[
            { value: 'results', label: 'Results' },
            { value: 'medals', label: 'Medals' },
            { value: 'top', label: 'Top performers' },
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>

      {tab === 'results' && <ResultsTab meetId={id} events={events} />}
      {tab === 'medals' && <MedalsTab country={medalCountry} club={medalClub} swimmer={medalSwimmer} />}
      {tab === 'top' && <TopPerformersTab rows={topResults} />}
    </div>
  )
}
