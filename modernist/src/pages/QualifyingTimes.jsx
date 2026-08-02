import { useEffect, useMemo, useState } from 'react'
import { getQualifyingStandards, getQualifyingStandard } from '../api/qualifyingTimes'
import { PageHead, Loading, Empty, Seg } from '../components/ui'
import { formatDate } from '../utils'

const COMP_LABEL = {
  olympics: 'Olympic Games',
  world_championships: 'World Championships',
}

// Resolve any competition_type — including custom ones — to a display label
function compLabel(value) {
  if (!value) return 'Standard'
  return COMP_LABEL[value] || String(value).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

const STROKE_ORDER = { Freestyle: 0, Backstroke: 1, Breaststroke: 2, Butterfly: 3, 'Individual Medley': 4 }

const list = (d) => (Array.isArray(d) ? d : d?.results || [])

function StandardTables({ times, gender, pool }) {
  // event rows for the selection, cut categories (A/B/C…) as separate columns
  const { byStroke, cutKeys } = useMemo(() => {
    const map = new Map()
    const cuts = new Set()
    ;(times || [])
      .filter((t) => t.gender === gender && t.pool === pool)
      .forEach((t) => {
        if (!map.has(t.event)) {
          map.set(t.event, {
            event: t.event,
            name: t.event_name,
            stroke: t.event_stroke,
            distance: t.event_distance,
            cuts: {},
          })
        }
        map.get(t.event).cuts[t.cut || 'A'] = t.formatted_time
        cuts.add(t.cut || 'A')
      })
    const rows = [...map.values()].sort((a, b) => {
      const sa = STROKE_ORDER[a.stroke] ?? 99
      const sb = STROKE_ORDER[b.stroke] ?? 99
      if (sa !== sb) return sa - sb
      return (a.distance || 0) - (b.distance || 0)
    })
    const grouped = {}
    rows.forEach((r) => {
      const key = r.stroke || 'Events'
      if (!grouped[key]) grouped[key] = []
      grouped[key].push(r)
    })
    return { byStroke: grouped, cutKeys: [...cuts].sort() }
  }, [times, gender, pool])

  const strokes = Object.keys(byStroke)
  if (strokes.length === 0) {
    return <Empty label={`No times for ${gender === 'M' ? 'men' : 'women'} (${pool}) yet`} />
  }

  return (
    <div>
      {strokes.map((stroke) => (
        <div key={stroke} style={{ marginBottom: 24 }}>
          <div className="kicker" style={{ marginBottom: 8 }}>{stroke}</div>
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Event</th>
                  {cutKeys.map((c) => <th key={c} className="time">{c} standard</th>)}
                </tr>
              </thead>
              <tbody>
                {byStroke[stroke].map((r) => (
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
        </div>
      ))}
    </div>
  )
}

export default function QualifyingTimes() {
  const [standards, setStandards] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [gender, setGender] = useState('M')
  const [pool, setPool] = useState('LCM')
  const [loading, setLoading] = useState(true)

  // Load the complete standards list (follow pagination if present)
  useEffect(() => {
    let alive = true
    async function load() {
      try {
        const all = []
        let page = 1
        // guard against runaway loops
        for (let i = 0; i < 20; i++) {
          const res = await getQualifyingStandards(page > 1 ? { page } : undefined)
          const d = res.data
          all.push(...list(d))
          if (d?.next) page += 1
          else break
        }
        if (!alive) return
        setStandards(all)
        if (all.length > 0) setSelectedId(all[0].id)
      } catch {
        if (alive) setStandards([])
      } finally {
        if (alive) setLoading(false)
      }
    }
    load()
    return () => { alive = false }
  }, [])

  // Fetch the selected standard's times
  useEffect(() => {
    if (!selectedId) { setDetail(null); return }
    let alive = true
    setDetailLoading(true)
    getQualifyingStandard(selectedId)
      .then((res) => alive && setDetail(res.data))
      .catch(() => alive && setDetail(null))
      .finally(() => alive && setDetailLoading(false))
    return () => { alive = false }
  }, [selectedId])

  if (loading) return <Loading label="Loading qualifying standards" />

  return (
    <div>
      <PageHead kicker="Data" title="Qualifying times" sub="Entry standards for major international competitions" />

      {standards.length === 0 ? (
        <Empty label="No qualifying standards published" />
      ) : (
        <>
          {/* standard selection */}
          <div className="rule-b" style={{ padding: '14px 32px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {standards.map((s) => (
              <button
                key={s.id}
                type="button"
                className={s.id === selectedId ? 'btn btn-primary' : 'btn btn-secondary'}
                onClick={() => setSelectedId(s.id)}
              >
                {s.name}
                {s.times_count != null && (
                  <span className="asw-num" style={{ fontSize: 11, opacity: 0.7 }}>· {s.times_count}</span>
                )}
              </button>
            ))}
          </div>

          {/* filter bar */}
          <div className="rule-b" style={{ padding: '14px 32px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <Seg
              options={[{ value: 'M', label: 'Men' }, { value: 'F', label: 'Women' }]}
              value={gender}
              onChange={setGender}
            />
            <Seg
              options={[{ value: 'LCM', label: 'LCM 50m' }, { value: 'SCM', label: 'SCM 25m' }]}
              value={pool}
              onChange={setPool}
            />
          </div>

          {detailLoading ? (
            <Loading label="Loading standard" />
          ) : !detail ? (
            <Empty label="Standard unavailable" />
          ) : (
            <div className="pad">
              <div className="kicker" style={{ marginBottom: 4 }}>
                {compLabel(detail.competition_type)} {detail.year ? `· ${detail.year}` : ''}
              </div>
              <h3 style={{ margin: '0 0 6px' }}>{detail.name}</h3>
              {detail.qualifying_period_start && detail.qualifying_period_end && (
                <div className="micro" style={{ marginBottom: 14 }}>
                  Qualifying period: {formatDate(detail.qualifying_period_start)} — {formatDate(detail.qualifying_period_end)}
                </div>
              )}
              <StandardTables times={detail.times || []} gender={gender} pool={pool} />
            </div>
          )}
        </>
      )}
    </div>
  )
}
