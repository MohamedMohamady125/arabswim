import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getCountries } from '../api/core'
import Flag from '../components/Flag'
import { PageHead, Loading, Empty, SectHead } from '../components/ui'
import { formatNumber } from '../utils'

function CountryTable({ countries, showRegion = true }) {
  return (
    <div className="table-scroll">
      <table className="table">
        <thead>
          <tr>
            <th style={{ width: 50 }}>Flag</th>
            <th>Country</th>
            <th>Code</th>
            {showRegion && <th>Region</th>}
            <th className="num">Swimmers</th>
          </tr>
        </thead>
        <tbody>
          {countries.map((c) => (
            <tr key={c.id}>
              <td><Flag code={c.code} name={c.name} large /></td>
              <td>
                <Link to={`/countries/${c.id}`} style={{ color: 'inherit', textDecoration: 'none', fontWeight: 600 }}>
                  {c.name}
                </Link>
              </td>
              <td className="text-muted">{c.code}</td>
              {showRegion && (
                <td>
                  {c.region === 'GCC' ? (
                    <span className="tag tag-dark">GCC</span>
                  ) : (
                    <span className="tag tag-accent">Arab</span>
                  )}
                </td>
              )}
              <td className="num asw-num">{formatNumber(c.swimmers_count)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function Countries() {
  const [countries, setCountries] = useState([])
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

  const arab = useMemo(
    () => countries.filter((c) => c.region === 'ARAB' || c.region === 'GCC').sort(bySwimmers),
    [countries]
  )
  const others = useMemo(
    () => countries.filter((c) => c.region === 'OTHER' && (c.swimmers_count || 0) > 0).sort(bySwimmers),
    [countries]
  )

  return (
    <div>
      <PageHead kicker="Data" title="Countries" sub="Arab swimming federations and their databases" />
      {loading ? (
        <Loading label="Loading countries" />
      ) : countries.length === 0 ? (
        <Empty label="No countries found" />
      ) : (
        <>
          <div className="pad-lg">
            <SectHead title={`Arab federations · ${arab.length}`} />
            <CountryTable countries={arab} />
          </div>
          {others.length > 0 && (
            <div className="rule-t pad-lg">
              <SectHead title="Other countries in the database" />
              <div className="micro" style={{ marginBottom: 12 }}>
                Non-Arab countries with swimmers on record
              </div>
              <CountryTable countries={others} showRegion={false} />
            </div>
          )}
        </>
      )}
    </div>
  )
}
