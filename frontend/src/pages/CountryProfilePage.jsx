import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  ArrowLeft, Users, Trophy, Medal, Timer, ListChecks, Shield, Award,
} from 'lucide-react'
import { getCountryProfile, getCountryProgression } from '../api/core'
import ProgressionChart from '../components/common/ProgressionChart'
import MedalIcon from '../components/common/MedalIcon'
import { CODE_TO_ALPHA2 } from '../components/common/CountryFlag'

const REGION_STYLES = {
  ARAB: 'bg-blue-100 text-blue-700',
  GCC: 'bg-emerald-100 text-emerald-700',
  OTHER: 'bg-gray-100 text-gray-600',
}

function StatCard({ icon: Icon, label, value, sub }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
      <div className="flex items-center gap-2 text-gray-500 text-xs uppercase font-medium">
        <Icon size={14} className="text-blue-600" /> {label}
      </div>
      <div className="text-2xl font-bold mt-1">{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  )
}

function Section({ title, children, count }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 font-semibold flex items-center gap-2">
        {title}
        {count !== undefined && <span className="text-gray-400 font-normal text-sm">({count})</span>}
      </div>
      {children}
    </div>
  )
}

export default function CountryProfilePage() {
  const { id } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState(false)
  const [btSex, setBtSex] = useState('')
  const [btPool, setBtPool] = useState('')
  const [progStroke, setProgStroke] = useState('Freestyle')
  const [progPool, setProgPool] = useState('LCM')
  const [progLines, setProgLines] = useState([])
  const [progLoading, setProgLoading] = useState(false)

  useEffect(() => {
    setData(null)
    getCountryProfile(id).then((res) => setData(res.data)).catch(() => setError(true))
  }, [id])

  useEffect(() => {
    if (!data) return
    setProgLoading(true)
    getCountryProgression(id, { stroke: progStroke, pool: progPool })
      .then(res => setProgLines(res.data))
      .catch(() => setProgLines([]))
      .finally(() => setProgLoading(false))
  }, [id, data, progStroke, progPool])

  if (error) return <div className="text-center text-gray-400 py-20">Failed to load country profile</div>
  if (!data) return <div className="text-center text-gray-400 py-20">Loading…</div>

  const { country, stats, medals, top_swimmers, top_medalists, best_times, records, championships_hosted, championships_participated, teams } = data
  const [openChamp, setOpenChamp] = useState(null)
  const [showSwimmers, setShowSwimmers] = useState(null)
  const alpha2 = country.flag_url || CODE_TO_ALPHA2[country.code?.toUpperCase()] || (country.code || '').toLowerCase().slice(0, 2)
  const filteredBest = best_times.filter((b) =>
    (!btSex || b.sex === btSex) && (!btPool || b.pool === btPool))
  const currentRecords = records.filter((r) => !r.is_new)
  const newRecords = records.filter((r) => r.is_new)

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <Link to="/countries" className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800">
        <ArrowLeft size={14} /> Countries
      </Link>

      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 flex items-center gap-5">
        <img
          src={`https://flagcdn.com/w160/${alpha2}.png`}
          alt={country.name}
          className="w-24 h-16 object-cover border border-gray-200 shadow-sm"
          onError={(e) => { e.target.style.display = 'none' }}
        />
        <div>
          <h1 className="text-3xl font-bold">{country.name}</h1>
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-gray-500 text-sm font-medium">{country.code}</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${REGION_STYLES[country.region] || REGION_STYLES.OTHER}`}>
              {country.region}
            </span>
          </div>
        </div>
        {/* Medal summary */}
        <div className="ml-auto flex items-center gap-4">
          {[['GOLD', medals.gold], ['SILVER', medals.silver], ['BRONZE', medals.bronze]].map(([t, n]) => (
            <div key={t} className="text-center">
              <MedalIcon type={t} />
              <div className="font-bold text-lg">{n}</div>
            </div>
          ))}
          <div className="text-center pl-3 border-l border-gray-200">
            <div className="text-xs text-gray-400 uppercase">Total</div>
            <div className="font-bold text-lg">{medals.total}</div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard icon={Users} label="Swimmers" value={stats.swimmers}
          sub={`${stats.swimmers_male} M · ${stats.swimmers_female} F`} />
        <StatCard icon={ListChecks} label="Results" value={stats.results} />
        <StatCard icon={Medal} label="Medals" value={stats.medals} />
        <StatCard icon={Timer} label="Records" value={stats.records} />
        <StatCard icon={Trophy} label="Hosted" value={stats.championships_hosted} />
        <StatCard icon={Shield} label="Teams" value={stats.teams} />
      </div>

      {/* Performance Progression */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3 flex-wrap">
          <span className="font-semibold">Performance Progression</span>
          <div className="flex gap-1 ml-auto">
            {['Freestyle', 'Backstroke', 'Breaststroke', 'Butterfly', 'Individual Medley'].map(s => (
              <button key={s} onClick={() => setProgStroke(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  progStroke === s ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}>
                {s === 'Individual Medley' ? 'IM' : s}
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            {['LCM', 'SCM'].map(p => (
              <button key={p} onClick={() => setProgPool(p)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  progPool === p ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}>
                {p}
              </button>
            ))}
          </div>
        </div>
        <div className="p-4">
          {progLoading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            </div>
          ) : (
            <ProgressionChart lines={progLines} showSwimmer />
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Top swimmers by FINA */}
        <Section title="Top Swimmers by FINA" count={top_swimmers.length}>
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-2">Swimmer</th>
                <th className="px-4 py-2">Best Event</th>
                <th className="px-4 py-2">Time</th>
                <th className="px-4 py-2 text-right">FINA</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {top_swimmers.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2">
                    <Link to={`/swimmers/${s.id}`} className="font-medium text-blue-600 hover:underline">{s.name}</Link>
                    <span className="text-gray-400 ml-1 text-xs">{s.sex}</span>
                  </td>
                  <td className="px-4 py-2 text-gray-600">{s.best_event}</td>
                  <td className="px-4 py-2 font-mono">{s.best_time}</td>
                  <td className="px-4 py-2 text-right font-semibold">{s.best_fina}</td>
                </tr>
              ))}
              {top_swimmers.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">No results yet</td></tr>
              )}
            </tbody>
          </table>
        </Section>

        {/* Top medalists */}
        <Section title="Top Medalists" count={top_medalists.length}>
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-2">Swimmer</th>
                <th className="px-4 py-2 text-center">🥇</th>
                <th className="px-4 py-2 text-center">🥈</th>
                <th className="px-4 py-2 text-center">🥉</th>
                <th className="px-4 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {top_medalists.map((m) => (
                <tr key={m.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2">
                    <Link to={`/swimmers/${m.id}`} className="font-medium text-blue-600 hover:underline">{m.name}</Link>
                  </td>
                  <td className="px-4 py-2 text-center">{m.gold}</td>
                  <td className="px-4 py-2 text-center">{m.silver}</td>
                  <td className="px-4 py-2 text-center">{m.bronze}</td>
                  <td className="px-4 py-2 text-right font-semibold">{m.total}</td>
                </tr>
              ))}
              {top_medalists.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No medals yet</td></tr>
              )}
            </tbody>
          </table>
        </Section>
      </div>

      {/* National best times */}
      <Section title="National Best Times" count={filteredBest.length}>
        <div className="px-4 py-2.5 border-b border-gray-100 flex gap-2">
          <select value={btSex} onChange={(e) => setBtSex(e.target.value)}
            className="border rounded-lg px-2 py-1 text-sm bg-white">
            <option value="">All</option>
            <option value="M">Men</option>
            <option value="F">Women</option>
          </select>
          <select value={btPool} onChange={(e) => setBtPool(e.target.value)}
            className="border rounded-lg px-2 py-1 text-sm bg-white">
            <option value="">All Pools</option>
            <option value="LCM">LCM (50m)</option>
            <option value="SCM">SCM (25m)</option>
          </select>
        </div>
        <div className="max-h-[28rem] overflow-y-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase sticky top-0">
              <tr>
                <th className="px-4 py-2">Event</th>
                <th className="px-4 py-2">Sex</th>
                <th className="px-4 py-2">Pool</th>
                <th className="px-4 py-2">Time</th>
                <th className="px-4 py-2">FINA</th>
                <th className="px-4 py-2">Swimmer</th>
                <th className="px-4 py-2">Age</th>
                <th className="px-4 py-2">Championship</th>
                <th className="px-4 py-2">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredBest.map((b, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium">{b.event}</td>
                  <td className="px-4 py-2 text-gray-500">{b.sex}</td>
                  <td className="px-4 py-2 text-gray-500">{b.pool}</td>
                  <td className="px-4 py-2 font-mono font-semibold">{b.time}</td>
                  <td className="px-4 py-2 text-gray-600">{b.fina ?? '—'}</td>
                  <td className="px-4 py-2">
                    <Link to={`/swimmers/${b.swimmer_id}`} className="text-blue-600 hover:underline">{b.swimmer}</Link>
                  </td>
                  <td className="px-4 py-2 text-gray-500">{b.age_at_competition || '-'}</td>
                  <td className="px-4 py-2 text-gray-500">{b.championship}</td>
                  <td className="px-4 py-2 text-gray-500">{b.date}</td>
                </tr>
              ))}
              {filteredBest.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">No times yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Records */}
      {[['Records Held', currentRecords], ['New Records', newRecords]].map(([title, list]) => (
        list.length > 0 && (
          <Section title={title} count={list.length} key={title}>
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-4 py-2">Type</th>
                  <th className="px-4 py-2">Event</th>
                  <th className="px-4 py-2">Sex</th>
                  <th className="px-4 py-2">Time</th>
                  <th className="px-4 py-2">Swimmer</th>
                  <th className="px-4 py-2">Location</th>
                  <th className="px-4 py-2">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {list.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                        <Award size={12} /> {r.record_type}
                      </span>
                    </td>
                    <td className="px-4 py-2 font-medium">{r.event}</td>
                    <td className="px-4 py-2 text-gray-500">{r.sex}</td>
                    <td className="px-4 py-2 font-mono font-semibold">{r.time}</td>
                    <td className="px-4 py-2">
                      <Link to={`/swimmers/${r.swimmer_id}`} className="text-blue-600 hover:underline">{r.swimmer}</Link>
                    </td>
                    <td className="px-4 py-2 text-gray-500">{r.location || '—'}</td>
                    <td className="px-4 py-2 text-gray-500">{r.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )
      ))}

      {/* Championships participated */}
      {championships_participated && championships_participated.length > 0 && (
        <Section title="Championships Participated" count={championships_participated.length}>
          <div className="divide-y divide-gray-100">
            {championships_participated.map((c) => {
              const isOpen = openChamp === c.id
              return (
                <div key={c.id}>
                  <button
                    onClick={() => setOpenChamp(isOpen ? null : c.id)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 text-sm text-left"
                  >
                    <div className="flex-1">
                      <div className="font-medium">{c.name}</div>
                      <div className="text-gray-400 text-xs mt-0.5">{c.date} · {c.pool} {c.location ? `· ${c.location}` : ''}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={(e) => { e.stopPropagation(); setShowSwimmers(showSwimmers === c.id ? null : c.id) }}
                        className="text-xs text-blue-600 hover:underline font-medium"
                      >{c.swimmers_count} swimmers</button>
                      <span className="text-xs text-gray-500">· {c.results_count} results</span>
                      {c.medals.total > 0 && (
                        <span className="flex items-center gap-1.5">
                          {c.medals.gold > 0 && <span className="flex items-center gap-0.5"><MedalIcon type="gold" size={16} /><span className="text-xs font-semibold">{c.medals.gold}</span></span>}
                          {c.medals.silver > 0 && <span className="flex items-center gap-0.5"><MedalIcon type="silver" size={16} /><span className="text-xs font-semibold">{c.medals.silver}</span></span>}
                          {c.medals.bronze > 0 && <span className="flex items-center gap-0.5"><MedalIcon type="bronze" size={16} /><span className="text-xs font-semibold">{c.medals.bronze}</span></span>}
                        </span>
                      )}
                      <svg
                        className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-3 pt-1 bg-gray-50 border-t border-gray-100">
                      <Link to={`/meets/${c.id}`} className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline">
                        View full meet details →
                      </Link>
                    </div>
                  )}
                  {showSwimmers === c.id && c.swimmers && (
                    <div className="px-4 pb-3 pt-2 bg-blue-50 border-t border-blue-100">
                      <div className="text-xs font-semibold text-gray-600 mb-2">Athletes ({c.swimmers.length})</div>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-1">
                        {c.swimmers.map(s => (
                          <Link key={s.id} to={`/swimmers/${s.id}`}
                            className="text-sm text-blue-600 hover:underline px-2 py-1 rounded hover:bg-blue-100">
                            {s.name} <span className="text-gray-400 text-xs">{s.sex}</span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </Section>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Championships hosted */}
        <Section title="Championships Hosted" count={stats.championships_hosted}>
          <div className="divide-y divide-gray-100">
            {championships_hosted.map((c) => (
              <Link key={c.id} to={`/meets/${c.id}`}
                className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 text-sm">
                <div>
                  <div className="font-medium text-blue-600">{c.name}</div>
                  <div className="text-gray-400 text-xs">{c.location}</div>
                </div>
                <div className="text-right text-gray-500 text-xs">
                  <div>{c.date}</div>
                  <div>{c.pool}</div>
                </div>
              </Link>
            ))}
            {championships_hosted.length === 0 && (
              <div className="px-4 py-8 text-center text-gray-400 text-sm">No championships hosted</div>
            )}
          </div>
        </Section>

        {/* Teams */}
        <Section title="Teams" count={teams.length}>
          <div className="divide-y divide-gray-100">
            {teams.map((t) => (
              <Link key={t.id} to={`/teams/${t.id}`}
                className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 text-sm">
                <span className="font-medium text-blue-600">{t.name}</span>
                {t.is_national_team && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">National Team</span>
                )}
              </Link>
            ))}
            {teams.length === 0 && (
              <div className="px-4 py-8 text-center text-gray-400 text-sm">No teams</div>
            )}
          </div>
        </Section>
      </div>
    </div>
  )
}
