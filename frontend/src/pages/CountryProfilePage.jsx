import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  Users, Trophy, Medal, Timer, ListChecks, Shield, Award, ChevronDown, Globe,
} from 'lucide-react'
import { getCountryProfile, getCountryProgression } from '../api/core'
import ProgressionChart from '../components/common/ProgressionChart'
import DataTable from '../components/common/DataTable'
import { formatDate } from '../utils/constants'
import MedalIcon from '../components/common/MedalIcon'
import { CODE_TO_ALPHA2 } from '../components/common/CountryFlag'
import { Card, Badge, Select, SegmentedControl, StatCard, Skeleton, TableSkeleton, EmptyState } from '../components/ui'
import { TimeDisplay, MedalDot } from '../components/domain'

const STROKES = ['Freestyle', 'Backstroke', 'Breaststroke', 'Butterfly', 'Individual Medley']

function SwimmerLink({ id, name, meta }) {
  return (
    <span>
      <Link to={`/swimmers/${id}`} className="font-medium text-ink-900 hover:text-aqua-600">{name}</Link>
      {meta && <span className="text-ink-400 ms-1 text-body-sm">{meta}</span>}
    </span>
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
  const [openChamp, setOpenChamp] = useState(null)
  const [showSwimmers, setShowSwimmers] = useState(null)

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

  if (error) {
    return (
      <div className="max-w-6xl mx-auto">
        <EmptyState icon={Globe} title="Failed to load country profile" />
      </div>
    )
  }
  if (!data) {
    return (
      <div className="max-w-6xl mx-auto space-y-4 sm:space-y-5">
        <Skeleton className="h-32 w-full rounded-md" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-md" />)}
        </div>
        <TableSkeleton rows={6} />
      </div>
    )
  }

  const { country, stats, medals, top_swimmers, top_medalists, best_times, records, championships_hosted, championships_participated, teams } = data
  const alpha2 = country.flag_url || CODE_TO_ALPHA2[country.code?.toUpperCase()] || (country.code || '').toLowerCase().slice(0, 2)
  const filteredBest = best_times.filter((b) =>
    (!btSex || b.sex === btSex) && (!btPool || b.pool === btPool))
  const currentRecords = records.filter((r) => !r.is_new)
  const newRecords = records.filter((r) => r.is_new)

  const recordColumns = [
    {
      key: 'record_type', label: 'Type',
      render: (r) => <Badge variant="record"><Award size={12} /> {r.record_type}</Badge>,
    },
    { key: 'event', label: 'Event', render: (r) => <span className="font-medium">{r.event}</span> },
    { key: 'sex', label: 'Sex', render: (r) => <span className="text-ink-500">{r.sex}</span> },
    { key: 'time', label: 'Time', numeric: true, render: (r) => <TimeDisplay time={r.time} /> },
    { key: 'swimmer', label: 'Swimmer', render: (r) => <SwimmerLink id={r.swimmer_id} name={r.swimmer} /> },
    { key: 'location', label: 'Location', render: (r) => <span className="text-ink-500">{r.location || '—'}</span> },
    { key: 'date', label: 'Date', render: (r) => <span className="text-ink-500">{formatDate(r.date)}</span> },
  ]

  const recordMobile = (r) => (
    <div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-body-sm font-medium text-ink-900">{r.event} <span className="text-ink-400">{r.sex}</span></span>
        <TimeDisplay time={r.time} />
      </div>
      <div className="text-body-sm text-ink-400 mt-1 flex items-center gap-2 flex-wrap">
        <Badge variant="record">{r.record_type}</Badge>
        <SwimmerLink id={r.swimmer_id} name={r.swimmer} />
        <span>{formatDate(r.date)}</span>
      </div>
    </div>
  )

  return (
    <div className="max-w-6xl mx-auto space-y-4 sm:space-y-5">
      <nav className="flex items-center gap-1 text-body-sm text-ink-400" aria-label="Breadcrumb">
        <Link to="/countries" className="hover:text-aqua-600">Federations</Link>
        <span>/</span>
        <span className="text-ink-500">{country.name}</span>
      </nav>

      {/* Identity header */}
      <Card className="!mt-3">
        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
          <img
            src={`https://flagcdn.com/w160/${alpha2}.png`}
            alt={country.name}
            className="w-20 h-14 sm:w-24 sm:h-16 object-cover rounded-sm border border-ink-100 shadow-card"
            onError={(e) => { e.target.style.display = 'none' }}
          />
          <div>
            <h1 className="text-display text-ink-900">{country.name}</h1>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-body-sm font-medium text-ink-500">{country.code}</span>
              <Badge variant={country.region === 'OTHER' ? 'status' : 'aqua'}>
                {country.region === 'OTHER' ? 'Other' : 'Arab'}
              </Badge>
            </div>
          </div>
          {/* Medal summary */}
          <div className="sm:ms-auto flex flex-wrap items-center gap-2.5 sm:gap-4 min-w-0">
            {[['GOLD', medals.gold], ['SILVER', medals.silver], ['BRONZE', medals.bronze]].map(([t, n]) => (
              <div key={t} className="text-center">
                <MedalIcon type={t} size={20} className="sm:w-6 sm:h-6" />
                <div className="text-[18px] leading-6 sm:text-[24px] sm:leading-7 font-bold tnum text-ink-900">{n}</div>
              </div>
            ))}
            <div className="text-center ps-3 border-s border-ink-100">
              <div className="text-label text-ink-400">Total</div>
              <div className="text-[18px] leading-6 sm:text-[24px] sm:leading-7 font-bold tnum text-ink-900">{medals.total}</div>
            </div>
          </div>
        </div>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
        <StatCard icon={Users} label="Swimmers" value={stats.swimmers} />
        <StatCard icon={ListChecks} label="Results" value={stats.results} />
        <StatCard icon={Medal} label="Medals" value={stats.medals} />
        <StatCard icon={Timer} label="Records" value={stats.records} />
        <StatCard icon={Trophy} label="Hosted" value={stats.championships_hosted} />
        <StatCard icon={Shield} label="Teams" value={stats.teams} />
      </div>
      <div className="text-body-sm text-ink-400 -mt-4">
        {stats.swimmers_male} men · {stats.swimmers_female} women
      </div>

      {/* Performance Progression */}
      <Card title="Performance Progression">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="max-w-full overflow-x-auto scrollbar-hide">
            <SegmentedControl
              options={STROKES.map(s => ({ key: s, label: s === 'Individual Medley' ? 'IM' : s }))}
              value={progStroke}
              onChange={setProgStroke}
            />
          </div>
          <SegmentedControl
            options={[{ key: 'LCM', label: 'LCM' }, { key: 'SCM', label: 'SCM' }]}
            value={progPool}
            onChange={setProgPool}
          />
        </div>
        {progLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <div className="w-full min-w-0 max-w-full overflow-x-auto">
            <ProgressionChart lines={progLines} showSwimmer />
          </div>
        )}
      </Card>

      <div className="grid lg:grid-cols-2 gap-3 sm:gap-4 items-start">
        {/* Top swimmers by FINA */}
        <div>
          <h2 className="text-title text-ink-900 mb-3">
            Top Swimmers by FINA <span className="text-ink-400 font-normal text-body-sm">({top_swimmers.length})</span>
          </h2>
          <DataTable
            emptyMessage="No results yet"
            columns={[
              { key: 'name', label: 'Swimmer', render: (s) => <SwimmerLink id={s.id} name={s.name} meta={s.sex} /> },
              { key: 'best_event', label: 'Best Event', render: (s) => <span className="text-ink-500">{s.best_event}</span> },
              { key: 'best_time', label: 'Time', render: (s) => <TimeDisplay time={s.best_time} /> },
              { key: 'best_fina', label: 'FINA', numeric: true },
            ]}
            data={top_swimmers}
          />
        </div>

        {/* Top medalists */}
        <div>
          <h2 className="text-title text-ink-900 mb-3">
            Top Medalists <span className="text-ink-400 font-normal text-body-sm">({top_medalists.length})</span>
          </h2>
          <DataTable
            emptyMessage="No medals yet"
            columns={[
              { key: 'name', label: 'Swimmer', render: (m) => <SwimmerLink id={m.id} name={m.name} /> },
              { key: 'gold', label: <MedalDot type="gold" />, numeric: true },
              { key: 'silver', label: <MedalDot type="silver" />, numeric: true },
              { key: 'bronze', label: <MedalDot type="bronze" />, numeric: true },
              { key: 'total', label: 'Total', numeric: true, render: (m) => <span className="font-semibold tnum">{m.total}</span> },
            ]}
            data={top_medalists}
          />
        </div>
      </div>

      {/* National best times */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h2 className="text-title text-ink-900">
            National Best Times <span className="text-ink-400 font-normal text-body-sm">({filteredBest.length})</span>
          </h2>
          <div className="flex gap-2">
            <Select value={btSex} onChange={(e) => setBtSex(e.target.value)} className="!h-9 w-auto" aria-label="Sex">
              <option value="">All</option>
              <option value="M">Men</option>
              <option value="F">Women</option>
            </Select>
            <Select value={btPool} onChange={(e) => setBtPool(e.target.value)} className="!h-9 w-auto" aria-label="Pool">
              <option value="">All Pools</option>
              <option value="LCM">LCM (50m)</option>
              <option value="SCM">SCM (25m)</option>
            </Select>
          </div>
        </div>
        <DataTable
          emptyMessage="No times yet"
          columns={[
            { key: 'event', label: 'Event', render: (b) => <span className="font-medium">{b.event}</span> },
            { key: 'sex', label: 'Sex', render: (b) => <span className="text-ink-500">{b.sex}</span> },
            { key: 'pool', label: 'Pool', render: (b) => <span className="text-ink-500">{b.pool}</span> },
            { key: 'time', label: 'Time', render: (b) => <TimeDisplay time={b.time} /> },
            { key: 'fina', label: 'FINA', numeric: true, render: (b) => b.fina ?? '—' },
            { key: 'swimmer', label: 'Swimmer', render: (b) => <SwimmerLink id={b.swimmer_id} name={b.swimmer} /> },
            { key: 'age_at_competition', label: 'Age', numeric: true, render: (b) => b.age_at_competition || '—' },
            { key: 'championship', label: 'Championship', render: (b) => <span className="text-ink-500">{b.championship}</span> },
            { key: 'date', label: 'Date', render: (b) => <span className="text-ink-500">{formatDate(b.date)}</span> },
          ]}
          data={filteredBest}
          mobileRender={(b) => (
            <div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-body-sm font-medium text-ink-900">{b.event} <span className="text-ink-400">{b.sex} · {b.pool}</span></span>
                <TimeDisplay time={b.time} />
              </div>
              <div className="text-body-sm text-ink-400 mt-1 flex items-center gap-2 flex-wrap">
                <SwimmerLink id={b.swimmer_id} name={b.swimmer} />
                {b.fina != null && <span className="tnum">{b.fina} pts</span>}
                <span>{formatDate(b.date)}</span>
              </div>
            </div>
          )}
        />
      </div>

      {/* Records */}
      {[['Records Held', currentRecords], ['New Records', newRecords]].map(([title, list]) => (
        list.length > 0 && (
          <div key={title}>
            <h2 className="text-title text-ink-900 mb-3">
              {title} <span className="text-ink-400 font-normal text-body-sm">({list.length})</span>
            </h2>
            <DataTable columns={recordColumns} data={list} mobileRender={recordMobile} />
          </div>
        )
      ))}

      {/* Championships participated */}
      {championships_participated && championships_participated.length > 0 && (
        <Card
          padding="none"
          title={(
            <>Championships Participated <span className="text-ink-400 font-normal text-body-sm">({championships_participated.length})</span></>
          )}
        >
          <div className="divide-y divide-ink-100">
            {championships_participated.map((c) => {
              const isOpen = openChamp === c.id
              return (
                <div key={c.id}>
                  <button
                    onClick={() => setOpenChamp(isOpen ? null : c.id)}
                    className="w-full flex flex-wrap items-center justify-between gap-2 px-4 md:px-5 py-3 hover:bg-ink-50 text-body-sm text-start min-h-11"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-ink-900">{c.name}</div>
                      <div className="text-ink-400 text-body-sm mt-0.5">{formatDate(c.date)} · {c.pool} {c.location ? `· ${c.location}` : ''}</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); setShowSwimmers(showSwimmers === c.id ? null : c.id) }}
                        className="text-body-sm text-aqua-600 hover:underline font-medium min-h-10"
                      >{c.swimmers_count} swimmers</button>
                      <span className="text-body-sm text-ink-500">· {c.results_count} results</span>
                      {c.medals.total > 0 && (
                        <span className="flex items-center gap-1.5">
                          {c.medals.gold > 0 && <span className="flex items-center gap-1"><MedalDot type="gold" /><span className="text-body-sm font-semibold tnum">{c.medals.gold}</span></span>}
                          {c.medals.silver > 0 && <span className="flex items-center gap-1"><MedalDot type="silver" /><span className="text-body-sm font-semibold tnum">{c.medals.silver}</span></span>}
                          {c.medals.bronze > 0 && <span className="flex items-center gap-1"><MedalDot type="bronze" /><span className="text-body-sm font-semibold tnum">{c.medals.bronze}</span></span>}
                        </span>
                      )}
                      <ChevronDown size={16} className={`text-ink-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                    </div>
                  </button>
                  {isOpen && (
                    <div className="px-4 md:px-5 pb-3 pt-1 bg-ink-50 border-t border-ink-100">
                      <Link to={`/meets/${c.id}`} className="inline-flex items-center gap-1 text-body-sm text-aqua-600 hover:underline">
                        View full meet details →
                      </Link>
                    </div>
                  )}
                  {showSwimmers === c.id && c.swimmers && (
                    <div className="px-4 md:px-5 pb-3 pt-2 bg-aqua-50 border-t border-aqua-100">
                      <div className="text-label text-ink-500 mb-2">Athletes ({c.swimmers.length})</div>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-1">
                        {c.swimmers.map(s => (
                          <Link key={s.id} to={`/swimmers/${s.id}`}
                            className="text-body-sm text-aqua-600 hover:underline px-2 py-1.5 rounded-sm hover:bg-aqua-100">
                            {s.name} <span className="text-ink-400 text-body-sm">{s.sex}</span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </Card>
      )}

      <div className="grid lg:grid-cols-2 gap-3 sm:gap-4 items-start">
        {/* Championships hosted */}
        <Card padding="none" title={(
          <>Championships Hosted <span className="text-ink-400 font-normal text-body-sm">({stats.championships_hosted})</span></>
        )}>
          <div className="divide-y divide-ink-100">
            {championships_hosted.map((c) => (
              <Link key={c.id} to={`/meets/${c.id}`}
                className="flex items-center justify-between px-4 md:px-5 py-3 hover:bg-ink-50 text-body-sm min-h-11">
                <div className="min-w-0">
                  <div className="font-medium text-ink-900 truncate">{c.name}</div>
                  <div className="text-ink-400 text-body-sm">{c.location}</div>
                </div>
                <div className="text-end text-ink-500 text-body-sm shrink-0">
                  <div>{formatDate(c.date)}</div>
                  <div>{c.pool}</div>
                </div>
              </Link>
            ))}
            {championships_hosted.length === 0 && (
              <div className="px-4 py-8 text-center text-ink-400 text-body-sm">No championships hosted</div>
            )}
          </div>
        </Card>

        {/* Teams */}
        <Card padding="none" title={(
          <>Teams <span className="text-ink-400 font-normal text-body-sm">({teams.length})</span></>
        )}>
          <div className="divide-y divide-ink-100">
            {teams.map((t) => (
              <Link key={t.id} to={`/teams/${t.id}`}
                className="flex items-center justify-between px-4 md:px-5 py-3 hover:bg-ink-50 text-body-sm min-h-11">
                <span className="font-medium text-ink-900">{t.name}</span>
                {t.is_national_team && <Badge variant="aqua">National Team</Badge>}
              </Link>
            ))}
            {teams.length === 0 && (
              <div className="px-4 py-8 text-center text-ink-400 text-body-sm">No teams</div>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
