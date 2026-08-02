import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getTeams } from '../api/teams'
import { getCountries } from '../api/core'
import Flag from '../components/Flag'
import { PageHead, Loading, Empty, Pager } from '../components/ui'
import { mediaUrl } from '../utils'

const PAGE_SIZE = 25

function acronym(name) {
  const words = String(name || '').split(/\s+/).filter(Boolean)
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase()
  return words.slice(0, 3).map((w) => w[0]).join('').toUpperCase()
}

export default function Teams() {
  const [teams, setTeams] = useState([])
  const [countries, setCountries] = useState([])
  const [search, setSearch] = useState('')
  const [country, setCountry] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    async function load() {
      try {
        const [teamsRes, countriesRes] = await Promise.allSettled([getTeams(), getCountries()])
        if (!alive) return
        const val = (r) => (r.status === 'fulfilled' ? r.value.data : null)
        const list = (d) => (Array.isArray(d) ? d : d?.results || [])
        setTeams(list(val(teamsRes)))
        const all = list(val(countriesRes))
        const arab = all.filter((c) => c.region === 'ARAB' || c.region === 'GCC')
        const rest = all.filter((c) => c.region !== 'ARAB' && c.region !== 'GCC')
        setCountries([...arab, ...rest])
      } finally {
        if (alive) setLoading(false)
      }
    }
    load()
    return () => { alive = false }
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return teams.filter((t) => {
      if (q && !String(t.name || '').toLowerCase().includes(q)) return false
      if (country && String(t.country) !== String(country)) return false
      return true
    })
  }, [teams, search, country])

  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  if (loading) return <Loading label="Loading clubs" />

  return (
    <div>
      <PageHead kicker="People" title="Clubs" sub={`${filtered.length} clubs and national teams.`} />

      {/* filter bar */}
      <div className="rule-b" style={{ padding: '16px 32px', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          className="input"
          style={{ maxWidth: 320 }}
          placeholder="Search clubs…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
        />
        <select
          className="select"
          style={{ maxWidth: 220 }}
          value={country}
          onChange={(e) => { setCountry(e.target.value); setPage(1) }}
        >
          <option value="">All countries</option>
          {countries.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <Empty label="No clubs found" />
      ) : (
        <div className="pad">
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Club</th>
                  <th>Country</th>
                  <th className="num">Swimmers</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        {t.logo ? (
                          <div className="grayscale" style={{ width: 36, height: 36, flex: 'none', overflow: 'hidden', border: '1px solid var(--color-divider)' }}>
                            <img src={mediaUrl(t.logo)} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                          </div>
                        ) : (
                          <div style={{ width: 36, height: 36, flex: 'none', background: 'var(--color-neutral-200)', color: 'var(--color-neutral-800)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 11 }}>
                            {acronym(t.name)}
                          </div>
                        )}
                        <Link to={`/teams/${t.id}`} style={{ color: 'inherit', textDecoration: 'none', fontWeight: 600 }}>
                          {t.name}
                        </Link>
                        {t.is_national_team && <span className="tag tag-accent">National team</span>}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Flag code={t.country_detail?.code} name={t.country_detail?.name} />
                        <span className="text-muted">{t.country_detail?.name || '—'}</span>
                      </div>
                    </td>
                    <td className="num asw-num">{t.swimmers_count ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={page} pageSize={PAGE_SIZE} count={filtered.length} onPage={setPage} />
        </div>
      )}
    </div>
  )
}
