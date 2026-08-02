import { useEffect, useMemo, useState } from 'react'
import { getQualifyingStandards, getQualifyingStandard } from '../api/qualifyingTimes'
import { getEvents } from '../api/core'
import { PageHead, Loading, Empty, Seg } from '../components/ui'

const COMP_LABEL = {
  olympics: 'Olympic Games',
  world_championships: 'World Championships',
}

function StandardTable({ times, gender, pool, sortMap }) {
  // group filtered times by event, cuts as columns
  const rows = useMemo(() => {
    const map = new Map()
    times
      .filter((t) => t.gender === gender && t.pool === pool)
      .forEach((t) => {
        if (!map.has(t.event)) {
          map.set(t.event, { event: t.event, name: t.event_name, cuts: {} })
        }
        map.get(t.event).cuts[t.cut || 'A'] = t.formatted_time
      })
    return [...map.values()].sort(
      (a, b) => (sortMap[a.event] ?? a.event) - (sortMap[b.event] ?? b.event)
    )
  }, [times, gender, pool, sortMap])

  const cutKeys = useMemo(() => {
    const set = new Set()
    rows.forEach((r) => Object.keys(r.cuts).forEach((c) => set.add(c)))
    return [...set].sort()
  }, [rows])

  if (rows.length === 0) {
    return <div className="text-muted" style={{ fontSize: 13 }}>No times for this selection.</div>
  }

  return (
    <div className="table-scroll">
      <table className="table">
        <thead>
          <tr>
            <th>Event</th>
            {cutKeys.map((c) => <th key={c} className="time">{c} cut</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.event}>
              <td style={{ fontWeight: 600 }}>{r.name}</td>
              {cutKeys.map((c) => (
                <td key={c} className="time asw-time">{r.cuts[c] || '—'}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function QualifyingTimes() {
  const [standards, setStandards] = useState([])
  const [sortMap, setSortMap] = useState({})
  const [gender, setGender] = useState('M')
  const [pool, setPool] = useState('LCM')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    async function load() {
      try {
        const [listRes, eventsRes] = await Promise.allSettled([
          getQualifyingStandards(),
          getEvents(),
        ])
        if (!alive) return
        const val = (r) => (r.status === 'fulfilled' ? r.value.data : null)
        const list = (d) => (Array.isArray(d) ? d : d?.results || [])
        const evs = list(val(eventsRes))
        setSortMap(Object.fromEntries(evs.map((e) => [e.id, e.sort_order])))
        // list endpoint has no times — fetch each standard's detail for its times
        const summaries = list(val(listRes))
        const details = await Promise.allSettled(summaries.map((s) => getQualifyingStandard(s.id)))
        if (!alive) return
        setStandards(
          summaries.map((s, i) => ({
            ...s,
            times: details[i].status === 'fulfilled' ? details[i].value.data?.times || [] : [],
          }))
        )
      } finally {
        if (alive) setLoading(false)
      }
    }
    load()
    return () => { alive = false }
  }, [])

  if (loading) return <Loading label="Loading qualifying standards" />

  return (
    <div>
      <PageHead kicker="Data" title="Qualifying times" sub="Entry standards for major international competitions" />

      {/* filter bar */}
      <div className="rule-b" style={{ padding: '14px 32px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <Seg
          options={[{ value: 'M', label: 'Men' }, { value: 'F', label: 'Women' }]}
          value={gender}
          onChange={setGender}
        />
        <Seg
          options={[{ value: 'LCM', label: 'LCM' }, { value: 'SCM', label: 'SCM' }]}
          value={pool}
          onChange={setPool}
        />
      </div>

      {standards.length === 0 && <Empty label="No qualifying standards published" />}

      {standards.map((s) => (
        <div key={s.id} className="rule-b pad">
          <div className="kicker" style={{ marginBottom: 4 }}>
            {COMP_LABEL[s.competition_type] || s.competition_type} {s.year ? `· ${s.year}` : ''}
          </div>
          <h3 style={{ margin: '0 0 14px' }}>{s.name}</h3>
          <StandardTable times={s.times} gender={gender} pool={pool} sortMap={sortMap} />
        </div>
      ))}
    </div>
  )
}
