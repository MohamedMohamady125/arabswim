import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getChampionships, getClassifications } from '../api/championships'
import { getMedalSummary, getMedalClubSummary, getMedalSwimmerSummary } from '../api/medals'
import { getCountries } from '../api/core'
import Flag from '../components/Flag'
import { PageHead, Loading, Empty, Seg, MedalIcon } from '../components/ui'
import { mediaUrl } from '../utils'

const list = (d) => (Array.isArray(d) ? d : d?.results || [])

function ClubLogo({ logo, name, size = 24 }) {
  const [failed, setFailed] = useState(false)
  const initials = (name || '')
    .split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?'
  const base = {
    width: size, height: size, flex: 'none', borderRadius: '50%',
    border: '1px solid var(--color-neutral-300)',
  }
  if (logo && !failed) {
    return (
      <img src={mediaUrl(logo)} alt="" width={size} height={size}
        onError={() => setFailed(true)}
        style={{ ...base, objectFit: 'contain', background: '#fff' }} />
    )
  }
  return (
    <span style={{
      ...base, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.38, fontWeight: 700, letterSpacing: '.02em',
      background: 'var(--color-neutral-200)', color: 'var(--color-neutral-600)',
    }}>{initials}</span>
  )
}

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
  const [country, setCountry] = useState('')
  const [countries, setCountries] = useState([])
  const [summary, setSummary] = useState([])
  const [clubRows, setClubRows] = useState([])
  const [swimmerRows, setSwimmerRows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getClassifications()
      .then((res) => setClassifications(list(res.data)))
      .catch(() => setClassifications([]))
    getCountries()
      .then((res) => setCountries(list(res.data).filter((c) => c.region === 'ARAB' || c.region === 'GCC')))
      .catch(() => setCountries([]))
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
    // National mixes every federation's championships → filter by host
    // country; Arab/GCC tallies → medals won by that nation's swimmers
    if (country) params[isNational ? 'host_country' : 'country'] = country
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
  }, [classificationId, championship, gender, country, isNational])

  const tallyRows = isNational ? clubRows : summary
  const totalGold = tallyRows.reduce((s, r) => s + (r.gold || 0), 0)
  const totalSilver = tallyRows.reduce((s, r) => s + (r.silver || 0), 0)
  const totalBronze = tallyRows.reduce((s, r) => s + (r.bronze || 0), 0)
  const totalAll = totalGold + totalSilver + totalBronze

  const rows = scope === 'country' ? summary : scope === 'club' ? clubRows : swimmerRows

  // National + country filter → only show that federation's meets in the picker
  const visibleMeets = useMemo(
    () => (isNational && country
      ? meets.filter((m) => String(m.country?.id ?? m.country) === String(country))
      : meets),
    [meets, isNational, country],
  )

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
        <Seg
          options={[{ value: '', label: 'All' }, { value: 'M', label: 'Men' }, { value: 'F', label: 'Women' }]}
          value={gender}
          onChange={setGender}
        />
        <select
          className="select" style={{ flex: '1 1 150px', width: 'auto' }} value={country}
          onChange={(e) => { setCountry(e.target.value); setChampionship('') }}
        >
          <option value="">All countries</option>
          {countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="select" style={{ flex: '2 1 220px', width: 'auto' }} value={championship} onChange={(e) => setChampionship(e.target.value)}>
          <option value="">All {category} championships</option>
          {visibleMeets.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </div>

      {/* totals cards */}
      <div className="rule-b medal-totals" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14, padding: '20px 32px' }}>
        {[
          { label: 'Gold', value: totalGold, icon: 'GOLD', accent: 'var(--asw-gold)' },
          { label: 'Silver', value: totalSilver, icon: 'SILVER', accent: 'var(--asw-silver)' },
          { label: 'Bronze', value: totalBronze, icon: 'BRONZE', accent: 'var(--asw-bronze)' },
          { label: 'Total medals', value: totalAll, accent: 'var(--color-accent)' },
        ].map((s) => (
          <div
            key={s.label}
            className="card elev-sm"
            style={{
              alignItems: 'center', textAlign: 'center', gap: 6,
              padding: '18px 12px',
              border: '1px solid var(--color-divider)',
              borderTop: `3px solid ${s.accent}`,
            }}
          >
            {s.icon
              ? <MedalIcon type={s.icon} size={26} />
              : <span className="asw-num" style={{ fontSize: 20, fontWeight: 800, lineHeight: '26px', color: 'var(--color-accent)' }}>Σ</span>}
            <div className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 28, lineHeight: 1 }}>
              {loading ? '—' : s.value.toLocaleString('en-US')}
            </div>
            <div className="card-kicker">{s.label}</div>
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
                    {scope === 'club' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <ClubLogo logo={row.team_logo} name={row.result__team} />
                        {row.team_id
                          ? <Link to={`/teams/${row.team_id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{row.result__team || '—'}</Link>
                          : (row.result__team || '—')}
                      </div>
                    )}
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
