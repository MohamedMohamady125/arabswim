import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Waves } from 'lucide-react'
import { Empty, Loading, Seg } from './ui'
import Pic from './Pic'
import SwimmerPhotoButton from './SwimmerPhotoButton'
import { getCountrySquad } from '../api/core'

// Postel's Law: the squad search ignores case and accents
const fold = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
const ROSTER_FIRST = 24

/* The swimmers of ONE season of a club, academy or federation.
   A squad is always shown by year (Jakob's Law: every sports site lists a
   squad per season) and opens on the latest one (Hick's Law: a default, not a
   question). A big squad is found by name or narrowed by gender, and opens on
   the first 24 cards (Miller's Law); the count says what is on screen. */
export default function RosterGrid({ roster, years = [], year, onYear, isAdmin, canManage, loading = false }) {
  const [fresh, setFresh] = useState({})   // photos uploaded just now, by swimmer id
  const [q, setQ] = useState('')
  const [sex, setSex] = useState('')
  const [all, setAll] = useState(false)
  const men = roster.filter((s) => s.sex === 'M').length
  const women = roster.filter((s) => s.sex === 'F').length
  const both = men > 0 && women > 0
  const pick = both ? sex : ''
  const matched = roster.filter((s) => (!pick || s.sex === pick) && (!q.trim() || fold(s.name).includes(fold(q))))
  const shown = all || q.trim() ? matched : matched.slice(0, ROSTER_FIRST)
  return (
    <>
      {(years.length > 0 || roster.length > 12) && (
        <div className="roster-bar">
          {years.length > 0 && (
            <label className="roster-season">
              <span>Season</span>
              <select className="input" value={year ?? ''} onChange={(e) => onYear?.(Number(e.target.value))} disabled={years.length < 2}>
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </label>
          )}
          {roster.length > 12 && (
            <input className="input roster-find" type="search" aria-label="Find a swimmer in this squad" placeholder="Find a swimmer…" value={q} onChange={(e) => setQ(e.target.value)} />
          )}
          {both && (
            <Seg options={[{ value: '', label: `All (${roster.length})` }, { value: 'M', label: `Men (${men})` }, { value: 'F', label: `Women (${women})` }]} value={sex} onChange={setSex} />
          )}
          <span className="asw-num roster-count" aria-live="polite">
            {loading ? 'Loading…' : `Showing ${shown.length} of ${matched.length}`}
          </span>
        </div>
      )}
      {loading ? <Loading /> : matched.length === 0 ? (
        roster.length === 0
          ? <Empty label={year ? `No swimmers in the ${year} squad` : 'No swimmers yet'} />
          : (
            <Empty label="No swimmer matches" hint="Check the spelling or clear the search.">
              <button type="button" className="btn btn-secondary" onClick={() => { setQ(''); setSex('') }}>Show the whole squad</button>
            </Empty>
          )
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
          {shown.map((s) => {
            const photo = fresh[s.id] || s.photo
            return (
              <div key={s.id} style={{ borderRadius: 0, overflow: 'hidden', textAlign: 'center', background: '#fff', border: '1px solid var(--color-neutral-300)', padding: '16px 10px 12px', display: 'flex', flexDirection: 'column' }}>
                <div style={{ width: 140, height: 140, borderRadius: '50%', background: 'var(--color-accent-100)', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 48, color: 'var(--color-neutral-700)', border: '3px solid var(--color-accent-800)', overflow: 'hidden' }}>
                  {photo ? <Pic kind="person" w={160} src={photo} /> : <Waves size={22} aria-hidden="true" />}
                </div>
                <div style={{ padding: '10px 2px 0' }}>
                  <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--color-accent-800)', marginBottom: 5, lineHeight: 1.25 }}>
                    <Link to={`/swimmers/${s.id}`} style={{ color: 'inherit', textDecoration: 'none', fontWeight: 600, padding: '7px 0' }}>{s.name}</Link>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--color-neutral-800)', fontWeight: 600, lineHeight: 1.5 }}>
                    {s.sex === 'F' ? "Women's" : "Men's"}{s.birth_year ? ` · ${s.birth_year}` : ''}
                  </div>
                </div>
                <div style={{ marginTop: 'auto', paddingTop: 2, borderTop: '1px solid var(--color-neutral-200)' }}>
                  <Link to={`/swimmers/${s.id}`} aria-label={`View profile of ${s.name}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 32, fontSize: 12, color: 'var(--color-accent-800)', fontWeight: 700, textDecoration: 'none', padding: '0 2px' }}>
                    <span>View Profile</span><span style={{ color: 'var(--color-accent-800)' }}>→</span>
                  </Link>
                  {canManage && (
                    <SwimmerPhotoButton swimmer={s} hasPhoto={!!photo} onSaved={(url) => url && setFresh((m) => ({ ...m, [s.id]: url }))} />
                  )}
                  {isAdmin && (
                    <Link to={`/swimmers/${s.id}?edit=1`} className="btn btn-secondary" style={{ fontSize: 11, marginTop: 8, display: 'inline-block', textDecoration: 'none' }}>Edit</Link>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
      {!loading && !q.trim() && matched.length > ROSTER_FIRST && (
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <button type="button" className="btn btn-secondary" style={{ fontSize: 13, minHeight: 40, padding: '0 16px' }} aria-expanded={all} onClick={() => setAll((v) => !v)}>
            {all ? `Show the first ${ROSTER_FIRST} only` : `Show all ${matched.length} swimmers`}
          </button>
        </div>
      )}
    </>
  )
}

/* A federation's squad: the swimmers who raced for the country in the chosen
   season, best first. One season is fetched at a time (a country can have
   thousands of swimmers over the years). */
export function FederationSquad({ countryId, isAdmin, canManage }) {
  const [year, setYear] = useState(null)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let alive = true
    setLoading(true)
    getCountrySquad(countryId, year ? { year } : {})
      .then((res) => { if (alive) { setData(res.data); setFailed(false) } })
      .catch(() => { if (alive) setFailed(true) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [countryId, year])
  if (failed && !data) return <Empty label="The squad could not be loaded" hint="Check the connection and open the tab again." />
  if (!data) return <Loading />
  if (!data.years.length) return <Empty label="No swimmers" hint="Swimmers appear here once this federation has results in the database." />
  return (
    <RosterGrid key={data.year} roster={data.swimmers} years={data.years} year={year ?? data.year} onYear={setYear}
      isAdmin={isAdmin} canManage={canManage} loading={loading} />
  )
}
