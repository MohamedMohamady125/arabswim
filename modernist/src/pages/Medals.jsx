import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getChampionships, getClassifications } from '../api/championships'
import { getMedalSummary, getMedalClubSummary, getMedalSwimmerSummary } from '../api/medals'
import Flag from '../components/Flag'
import { PageHead, Loading, Empty, Seg, MedalIcon } from '../components/ui'

const list = (d) => (Array.isArray(d) ? d : d?.results || [])

// Category → which tallies make sense. National meets are club-based;
// Arab/GCC meets are country-based.
const CATEGORIES = [
  { value: 'Arab', label: 'Arab' },
  { value: 'GCC', label: 'GCC' },
  { value: 'National', label: 'National' },
]

export default function Medals() {
  const [classifications, setClassifications] = useState([])
  const [category, setCategory] = useState('Arab')
  const [meets, setMeets] = useState([])
  const [championship, setChampionship] = useState('')
  const [gender, setGender] = useState('')
  const [scope, setScope] = useState('country')
  const [summary, setSummary] = useState([])
  const [clubRows, setClubRows] = useState([])
  const [swimmerRows, setSwimmerRows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getClassifications()
      .then((res) => setClassifications(list(res.data)))
      .catch(() => setClassifications([]))
  }, [])

  const classificationId = useMemo(
    () => classifications.find((c) => c.name === category)?.id || null,
    [classifications, category],
  )

  const isNational = category === 'National'

  // Default view per category: club tally for National, country tally otherwise.
  useEffect(() => {
    setChampionship('')
    setScope(isNational ? 'club' : 'country')
  }, [category, isNational])

  useEffect(() => {
    if (!classificationId) { setMeets([]); return }
    getChampionships({ page_size: 300, classification: classificationId })
      .then((res) => setMeets(list(res.data)))
      .catch(() => setMeets([]))
  }, [classificationId])

  useEffect(() => {
    if (!classificationId) return
    let alive = true
    setLoading(true)
    const params = {}
    if (championship) params.championship = championship
    else params.classification = classificationId
    if (gender) params.gender = gender
    Promise.allSettled([
      isNational ? Promise.resolve(null) : getMedalSummary(params),
      isNational ? getMedalClubSummary(params) : Promise.resolve(null),
      // Full swimmer tally within a championship; capped list globally
      getMedalSwimmerSummary({ ...params, limit: championship ? 'all' : 100 }),
    ]).then(([sRes, cRes, swRes]) => {
      if (!alive) return
      const val = (r) => (r.status === 'fulfilled' && r.value ? list(r.value.data) : [])
      setSummary(val(sRes))
      setClubRows(val(cRes))
      setSwimmerRows(val(swRes))
      setLoading(false)
    })
    return () => { alive = false }
  }, [classificationId, championship, gender, isNational])

  const tallyRows = isNational ? clubRows : summary
  const totalGold = tallyRows.reduce((s, r) => s + (r.gold || 0), 0)
  const totalSilver = tallyRows.reduce((s, r) => s + (r.silver || 0), 0)
  const totalBronze = tallyRows.reduce((s, r) => s + (r.bronze || 0), 0)
  const totalAll = totalGold + totalSilver + totalBronze

  const rows = scope === 'country' ? summary : scope === 'club' ? clubRows : swimmerRows

  const scopeOptions = [
    ...(!isNational ? [{ value: 'country', label: 'Country' }] : []),
    ...(isNational ? [{ value: 'club', label: 'Club' }] : []),
    { value: 'swimmer', label: 'Swimmer' },
  ]

  return (
    <div>
      <PageHead kicker="Competition" title="Medal tables" />

      {/* filter bar */}
      <div className="rule-b" style={{ padding: '14px 32px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <Seg options={CATEGORIES} value={category} onChange={setCategory} />
        <Seg options={scopeOptions} value={scope} onChange={setScope} />
        <select className="select" style={{ width: 260 }} value={championship} onChange={(e) => setChampionship(e.target.value)}>
          <option value="">All {category} championships</option>
          {meets.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <Seg
          options={[{ value: '', label: 'All' }, { value: 'M', label: 'Men' }, { value: 'F', label: 'Women' }]}
          value={gender}
          onChange={setGender}
        />
      </div>

      {/* totals strip */}
      <div className="rule-b" style={{ display: 'flex', flexWrap: 'wrap' }}>
        {[
          { label: 'Gold', value: totalGold, icon: 'GOLD' },
          { label: 'Silver', value: totalSilver, icon: 'SILVER' },
          { label: 'Bronze', value: totalBronze, icon: 'BRONZE' },
          { label: 'Total medals', value: totalAll },
        ].map((s, i) => (
          <div key={s.label} className={i < 3 ? 'rule-r' : undefined} style={{ padding: '14px 32px', flex: '1 1 0', minWidth: 130 }}>
            <div className="card-kicker" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {s.icon && <MedalIcon type={s.icon} size={14} />}{s.label}
            </div>
            <div className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, marginTop: 2 }}>
              {loading ? '—' : s.value.toLocaleString('en-US')}
            </div>
          </div>
        ))}
      </div>

      {loading ? (
        <Loading label="Loading medals" />
      ) : rows.length === 0 ? (
        <Empty label="No medals recorded for this selection" />
      ) : (
        <div className="pad table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 34 }}>#</th>
                <th>{scope === 'country' ? 'Country' : scope === 'club' ? 'Club' : 'Swimmer'}</th>
                <th className="num"><MedalIcon type="GOLD" size={16} /></th>
                <th className="num"><MedalIcon type="SILVER" size={16} /></th>
                <th className="num"><MedalIcon type="BRONZE" size={16} /></th>
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
                  <td className="num asw-num" style={{ fontWeight: 800 }}>{row.total ?? (row.gold || 0) + (row.silver || 0) + (row.bronze || 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
