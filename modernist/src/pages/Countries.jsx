import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getCountries } from '../api/core'
import Flag from '../components/Flag'
import { PageHead, Loading, Empty, SectHead, MedalIcon } from '../components/ui'
import { formatNumber } from '../utils'

function CountryTable({ countries }) {
  return (
    <div className="table-scroll">
      <table className="table">
        <thead>
          <tr>
            <th>Federation</th>
            <th className="num">Swimmers</th>
            <th className="num"><MedalIcon type="GOLD" size={16} /></th>
            <th className="num"><MedalIcon type="SILVER" size={16} /></th>
            <th className="num"><MedalIcon type="BRONZE" size={16} /></th>
          </tr>
        </thead>
        <tbody>
          {countries.map((c) => (
            <tr key={c.id}>
              <td>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Flag code={c.code} name={c.name} large />
                  <Link to={`/countries/${c.id}`} style={{ color: 'inherit', textDecoration: 'none', fontWeight: 600 }}>
                    {c.name}
                  </Link>
                </div>
              </td>
              <td className="num asw-num">{formatNumber(c.swimmers_count)}</td>
              <td className="num asw-num" style={{ fontWeight: 800 }}>{c.gold || 0}</td>
              <td className="num asw-num">{c.silver || 0}</td>
              <td className="num asw-num">{c.bronze || 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function Countries() {
  const [countries, setCountries] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    getCountries({ with_stats: 1 })
      .then((res) => {
        if (!alive) return
        const d = res.data
        setCountries(Array.isArray(d) ? d : d?.results || [])
      })
      .catch(() => alive && setCountries([]))
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [])

  const bySwimmers = (a, b) =>
    (b.swimmers_count || 0) - (a.swimmers_count || 0) || String(a.name).localeCompare(String(b.name))

  const q = search.trim().toLowerCase()
  const matches = (c) =>
    !q || String(c.name).toLowerCase().includes(q) || String(c.code).toLowerCase().includes(q)

  const arab = useMemo(
    () => countries.filter((c) => (c.region === 'ARAB' || c.region === 'GCC') && matches(c)).sort(bySwimmers),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [countries, q]
  )
  const others = useMemo(
    () => countries.filter((c) => c.region === 'OTHER' && (c.swimmers_count || 0) > 0 && matches(c)).sort(bySwimmers),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [countries, q]
  )

  return (
    <div>
      <PageHead title="Federations" />
      <div className="rule-b records-filters" style={{ padding: '12px 32px', display: 'flex', gap: 10, flexWrap: 'nowrap', alignItems: 'center' }}>
        <input
          className="input"
          style={{ flex: '2 1 160px', width: 'auto', minWidth: 0, maxWidth: 320 }}
          placeholder="Search federations…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search federations"
        />
      </div>
      {loading ? (
        <Loading label="Loading federations" />
      ) : countries.length === 0 ? (
        <Empty label="No federations found" />
      ) : (
        <>
          <div className="pad">
            {/* medal columns tally Arab-championship podiums only */}
            <div className="micro" style={{ marginBottom: 10 }}>
              Medals won at Arab championships
            </div>
            {arab.length === 0 ? <Empty label="No federations match" /> : <CountryTable countries={arab} />}
          </div>
          {others.length > 0 && (
            <div className="rule-t pad">
              <SectHead title="Other countries in the database" />
              <CountryTable countries={others} />
            </div>
          )}
        </>
      )}
    </div>
  )
}
