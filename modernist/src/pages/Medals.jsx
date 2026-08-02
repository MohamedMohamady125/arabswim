import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getChampionships } from '../api/championships'
import { getMedalSummary, getMedalClubSummary, getMedalSwimmerSummary } from '../api/medals'
import Flag from '../components/Flag'
import { PageHead, Loading, Empty, Seg, MedalIcon } from '../components/ui'

const list = (d) => (Array.isArray(d) ? d : d?.results || [])

export default function Medals() {
  const [meets, setMeets] = useState([])
  const [championship, setChampionship] = useState('')
  const [scope, setScope] = useState('country')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getChampionships({ page_size: 300 })
      .then((res) => setMeets(list(res.data)))
      .catch(() => setMeets([]))
  }, [])

  useEffect(() => {
    let alive = true
    setLoading(true)
    const params = championship ? { championship } : {}
    const fn = scope === 'country' ? getMedalSummary : scope === 'club' ? getMedalClubSummary : getMedalSwimmerSummary
    fn(params)
      .then((res) => { if (alive) setRows(list(res.data)) })
      .catch(() => { if (alive) setRows([]) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [championship, scope])

  return (
    <div>
      <PageHead kicker="Competition" title="Medal tables" sub="Gold-first standings by country, club and swimmer" />

      {/* filter bar */}
      <div className="rule-b" style={{ padding: '14px 32px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <Seg
          options={[{ value: 'country', label: 'Country' }, { value: 'club', label: 'Club' }, { value: 'swimmer', label: 'Swimmer' }]}
          value={scope}
          onChange={setScope}
        />
        <select className="select" style={{ width: 280 }} value={championship} onChange={(e) => setChampionship(e.target.value)}>
          <option value="">All championships</option>
          {meets.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </div>

      {loading ? (
        <Loading label="Loading medals" />
      ) : rows.length === 0 ? (
        <Empty label="No medals recorded" />
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
                  <td className="num asw-num" style={{ fontWeight: 800 }}>{row.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
