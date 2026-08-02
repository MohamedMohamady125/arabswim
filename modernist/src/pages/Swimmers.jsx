import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { getSwimmers } from '../api/swimmers'
import { getCountries } from '../api/core'
import Flag from '../components/Flag'
import { PageHead, Loading, Empty, Pager, Seg } from '../components/ui'

const PAGE_SIZE = 50

export default function Swimmers() {
  const [searchParams] = useSearchParams()
  const [search, setSearch] = useState(searchParams.get('search') || '')
  const [query, setQuery] = useState(searchParams.get('search') || '')
  const [country, setCountry] = useState('')
  const [sex, setSex] = useState('')
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState([])
  const [count, setCount] = useState(0)
  const [countries, setCountries] = useState([])
  const [loading, setLoading] = useState(true)
  const debounceRef = useRef(null)

  // header search box navigates here with ?search=
  useEffect(() => {
    const s = searchParams.get('search') || ''
    setSearch(s)
    setQuery(s)
    setPage(1)
  }, [searchParams])

  // countries once — Arab/GCC regions first
  useEffect(() => {
    let alive = true
    getCountries()
      .then((res) => {
        if (!alive) return
        const list = Array.isArray(res.data) ? res.data : res.data?.results || []
        const arab = list.filter((c) => c.region === 'ARAB' || c.region === 'GCC')
        const rest = list.filter((c) => c.region !== 'ARAB' && c.region !== 'GCC')
        setCountries([...arab, ...rest])
      })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  // debounce the search input
  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setQuery(search)
      setPage(1)
    }, 400)
    return () => clearTimeout(debounceRef.current)
  }, [search])

  useEffect(() => {
    let alive = true
    setLoading(true)
    const params = { page, page_size: PAGE_SIZE }
    if (query) params.search = query
    if (country) params.nationality = country
    if (sex) params.sex = sex
    getSwimmers(params)
      .then((res) => {
        if (!alive) return
        setRows(res.data?.results || [])
        setCount(res.data?.count || 0)
      })
      .catch(() => { if (alive) { setRows([]); setCount(0) } })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [query, country, sex, page])

  const visible = useMemo(() => rows.filter((s) => !s.is_relay_team), [rows])
  const arabCount = countries.filter((c) => c.region === 'ARAB' || c.region === 'GCC').length

  return (
    <div>
      <PageHead kicker="People" title="Swimmers" sub="Every swimmer in the ArabSwiM database." />

      {/* filter bar */}
      <div className="rule-b" style={{ padding: '16px 32px', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          className="input"
          style={{ maxWidth: 320 }}
          placeholder="Search by name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="select"
          style={{ maxWidth: 220 }}
          value={country}
          onChange={(e) => { setCountry(e.target.value); setPage(1) }}
        >
          <option value="">All countries</option>
          {countries.map((c, i) => (
            <option key={c.id} value={c.id}>
              {i === arabCount && arabCount > 0 ? '— ' : ''}{c.name}
            </option>
          ))}
        </select>
        <Seg
          options={[{ value: '', label: 'All' }, { value: 'M', label: 'Men' }, { value: 'F', label: 'Women' }]}
          value={sex}
          onChange={(v) => { setSex(v); setPage(1) }}
        />
      </div>

      {loading ? (
        <Loading label="Loading swimmers" />
      ) : visible.length === 0 ? (
        <Empty label="No swimmers found" />
      ) : (
        <div className="pad">
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Swimmer</th>
                  <th className="num">Born</th>
                  <th className="num">Age</th>
                  <th>Club</th>
                  <th>Country</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Flag code={s.nationality_detail?.code} name={s.nationality_detail?.name} />
                        <Link to={`/swimmers/${s.id}`} style={{ color: 'inherit', textDecoration: 'none', fontWeight: 600 }}>
                          {s.name}
                        </Link>
                        {s.is_retired && <span className="tag tag-neutral">Retired</span>}
                      </div>
                    </td>
                    <td className="num asw-num">{s.birth_year ?? '—'}</td>
                    <td className="num asw-num">{s.age ?? '—'}</td>
                    <td className="text-muted">{s.club || '—'}</td>
                    <td className="text-muted">{s.nationality_detail?.name || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={page} pageSize={PAGE_SIZE} count={count} onPage={setPage} />
        </div>
      )}
    </div>
  )
}
