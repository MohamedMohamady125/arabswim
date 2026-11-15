import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getCountries } from '../api/core'
import Flag from '../components/Flag'
import { PageHead, Loading, Empty, SectHead, MedalIcon, FilterBar, ShowMore } from '../components/ui'
import { formatNumber } from '../utils'

// Postel's Law: search ignores case, accents and extra spaces, and knows the
// names people actually type for a few federations.
const norm = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
const ALIASES = {
  UAE: 'united arab emirates emirates',
  KSA: 'saudi arabia ksa',
  GBR: 'uk united kingdom england britain',
  USA: 'usa america united states',
  PLE: 'palestine',
  MAR: 'morocco maroc',
  ALG: 'algeria algerie',
  TUN: 'tunisia tunisie',
}

// `cols` = which optional columns carry any data. All-zero columns are left
// out (Cognitive Load): three columns of 0 say nothing.
function CountryTable({ countries, cols, startRank = 1 }) {
  const navigate = useNavigate()
  return (
    <div className="table-scroll" style={{ maxWidth: 880 }}>
      <table className="table">
        <thead>
          <tr>
            <th style={{ width: 28 }} aria-label="Rank by swimmers">#</th>
            <th>Federation</th>
            <th className="num">Swimmers</th>
            {cols.clubs && <th className="num">Clubs</th>}
            {cols.medals && <th className="num"><MedalIcon type="GOLD" size={16} /></th>}
            {cols.medals && <th className="num"><MedalIcon type="SILVER" size={16} /></th>}
            {cols.medals && <th className="num"><MedalIcon type="BRONZE" size={16} /></th>}
          </tr>
        </thead>
        <tbody>
          {countries.map((c, i) => (
            // Fitts's Law: the whole row opens the federation, not just the name
            <tr key={c.id} className="row-link" onClick={() => navigate(`/countries/${c.id}`)}>
              <td className="asw-num" style={{ color: 'var(--color-neutral-700)' }}>{startRank + i}</td>
              <td>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Flag code={c.code} name={c.name} flagUrl={c.flag_url} placeholder large />
                  <Link to={`/countries/${c.id}`} onClick={(e) => e.stopPropagation()} style={{ color: 'inherit', textDecoration: 'none', fontWeight: 600 }}>
                    {c.name}
                  </Link>
                </div>
              </td>
              <td className="num asw-num">{formatNumber(c.swimmers_count || 0)}</td>
              {cols.clubs && <td className="num asw-num">{formatNumber(c.clubs_count || 0)}</td>}
              {cols.medals && <td className="num asw-num" style={{ fontWeight: 800 }}>{c.gold || 0}</td>}
              {cols.medals && <td className="num asw-num">{c.silver || 0}</td>}
              {cols.medals && <td className="num asw-num">{c.bronze || 0}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const OTHERS_FIRST = 10 // Miller's Law: the long tail of other countries opens on request

export default function Countries() {
  const [countries, setCountries] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [tryKey, setTryKey] = useState(0)

  useEffect(() => {
    let alive = true
    setLoading(true); setFailed(false)
    getCountries({ with_stats: 1 })
      .then((res) => {
        if (!alive) return
        const d = res.data
        setCountries(Array.isArray(d) ? d : d?.results || [])
      })
      .catch(() => { if (alive) { setCountries([]); setFailed(true) } })
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [tryKey])

  const q = norm(search)
  const { active, dormant, others, cols } = useMemo(() => {
    const bySwimmers = (a, b) =>
      (b.swimmers_count || 0) - (a.swimmers_count || 0) || String(a.name).localeCompare(String(b.name))
    const matches = (c) => !q || `${norm(c.name)} ${norm(c.code)} ${ALIASES[c.code] || ''}`.includes(q)
    const medals = (c) => (c.gold || 0) + (c.silver || 0) + (c.bronze || 0)
    const arab = countries.filter((c) => (c.region === 'ARAB' || c.region === 'GCC') && matches(c)).sort(bySwimmers)
    const hasData = (c) => (c.swimmers_count || 0) > 0 || medals(c) > 0
    const act = arab.filter(hasData)
    return {
      active: act,
      // Chunking: federations with nothing in the database yet are a separate, compact group
      dormant: arab.filter((c) => !hasData(c)).sort((a, b) => String(a.name).localeCompare(String(b.name))),
      others: countries.filter((c) => c.region === 'OTHER' && (c.swimmers_count || 0) > 0 && matches(c)).sort(bySwimmers),
      cols: {
        medals: countries.some((c) => medals(c) > 0),
        clubs: countries.some((c) => (c.clubs_count || 0) > 0),
      },
    }
  }, [countries, q])

  const shown = active.length + dormant.length + others.length

  return (
    <div>
      <PageHead title="Federations" sub="Arab national federations first, then every other country with swimmers in the database." />
      <FilterBar count={loading || failed ? null : shown} noun={shown === 1 ? 'federation' : 'federations'} active={!!search} onClear={() => setSearch('')}>
        <input
          className="input"
          type="search"
          style={{ flex: '1 1 220px', width: 'auto', minWidth: 0, maxWidth: 320 }}
          autoComplete="off"
          placeholder="Search by country or code (e.g. Egypt, KSA)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search federations"
        />
      </FilterBar>
      {loading ? (
        <Loading label="Loading federations" />
      ) : failed ? (
        <Empty label="Could not load federations" hint="Check your connection and try again.">
          <button type="button" className="btn btn-secondary" onClick={() => setTryKey((k) => k + 1)}>Try again</button>
        </Empty>
      ) : countries.length === 0 ? (
        <Empty label="No federations found" />
      ) : shown === 0 ? (
        <Empty label={`No federation matches "${search.trim()}"`} hint="Try a shorter name or the three-letter country code.">
          <button type="button" className="btn btn-secondary" onClick={() => setSearch('')}>Clear search</button>
        </Empty>
      ) : (
        <>
          {active.length > 0 && (
            <div className="pad">
              <SectHead title={`Arab federations · ${active.length}`} />
              <div className="micro" style={{ marginBottom: 10 }}>
                Ranked by swimmers in the database{cols.medals ? ' · medals won at Arab & GCC championships' : ''}
              </div>
              <CountryTable countries={active} cols={cols} />
            </div>
          )}
          {dormant.length > 0 && (
            <div className="rule-t pad">
              <SectHead title={`No swimmers in the database yet · ${dormant.length}`} />
              <div className="fed-chips">
                {dormant.map((c) => (
                  <Link key={c.id} to={`/countries/${c.id}`} className="fed-chip">
                    <Flag code={c.code} name={c.name} flagUrl={c.flag_url} placeholder />
                    {c.name}
                  </Link>
                ))}
              </div>
            </div>
          )}
          {others.length > 0 && (
            <div className="rule-t pad">
              <SectHead title={`Other countries · ${others.length}`} />
              <div className="micro" style={{ marginBottom: 10 }}>Countries whose swimmers raced at meets in the database</div>
              {q || others.length <= OTHERS_FIRST + 3 ? (
                <CountryTable countries={others} cols={{ ...cols, medals: false }} />
              ) : (
                <>
                  <CountryTable countries={others.slice(0, OTHERS_FIRST)} cols={{ ...cols, medals: false }} />
                  <ShowMore label={`Show all ${others.length} countries`} lessLabel={`Show top ${OTHERS_FIRST} only`}>
                    <CountryTable countries={others.slice(OTHERS_FIRST)} cols={{ ...cols, medals: false }} startRank={OTHERS_FIRST + 1} />
                  </ShowMore>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
