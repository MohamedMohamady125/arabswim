/* One event of a club's Squad Depth, on a page of its own: every swimmer
   with a time in the event, how far each stands behind the fastest, and
   where the squad's quality falls away. Opened from the expand button on
   a Squad Depth event card. Colours are theme.css tokens only. */

import { Fragment, useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import api from '../api/client'
import { Empty, Seg, Skeleton, BackLink } from '../components/ui'
import { formatDate, formatTime, mediaUrl } from '../utils'

const INK = 'var(--color-accent-800)'
const MUTED = 'var(--color-neutral-700)'
const SOFT = 'var(--color-neutral-700)'
const LINE = 'var(--color-neutral-300)'
const HEAD = 'var(--font-heading)'

const initials = (name) => String(name || '?').split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase()
const fmt = (cs) => (cs >= 6000 ? formatTime(cs) : (cs / 100).toFixed(2))
// Postel's Law: the name search ignores case and accents
const fold = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
const FIRST = 24 // rows shown before "Show all" — three heats of eight
const gap = (cs) => (cs <= 0 ? '—' : `+${fmt(cs)}`)

function Avatar({ s, size = 40 }) {
  return (
    <span style={{ width: size, height: size, borderRadius: '50%', flex: 'none', overflow: 'hidden', background: 'var(--color-accent-100)', border: `1px solid ${LINE}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: HEAD, fontWeight: 800, fontSize: size * 0.34, color: INK }}>
      {s.photo ? <img src={mediaUrl(s.photo)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} /> : initials(s.name)}
    </span>
  )
}

/* Depth curve: time against squad rank. A flat line is a deep squad; a
   steep one means quality drops quickly behind the leaders. */
function DepthCurve({ swimmers }) {
  const W = 1000, H = 240, P = { l: 64, r: 20, t: 16, b: 34 }
  const n = swimmers.length
  const min = swimmers[0].time_cs, max = swimmers[n - 1].time_cs
  const span = Math.max(max - min, 1)
  const x = (i) => P.l + (n === 1 ? 0.5 : i / (n - 1)) * (W - P.l - P.r)
  const y = (cs) => P.t + ((cs - min) / span) * (H - P.t - P.b)
  const line = swimmers.map((s, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(s.time_cs).toFixed(1)}`).join(' ')
  const area = `${line} L${x(n - 1).toFixed(1)},${H - P.b} L${x(0).toFixed(1)},${H - P.b} Z`
  const ticks = [0, 0.5, 1].map((f) => min + f * span)
  const marks = [1, 8, 16, n].filter((r, i, a) => r <= n && a.indexOf(r) === i)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Times from fastest (${fmt(min)}) to slowest (${fmt(max)}) across ${n} swimmers`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} stroke="var(--color-neutral-200)" strokeWidth="1" />
          <text x={P.l - 10} y={y(t) + 4} textAnchor="end" fontSize="13" fontWeight="700" fill="var(--color-neutral-700)" className="asw-num">{fmt(Math.round(t))}</text>
        </g>
      ))}
      <path d={area} fill="var(--color-accent-100)" />
      <path d={line} fill="none" stroke="var(--color-accent-500)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
      {marks.map((r) => (
        <g key={r}>
          <circle cx={x(r - 1)} cy={y(swimmers[r - 1].time_cs)} r="6" fill="#fff" stroke="var(--color-accent-800)" strokeWidth="3" />
          <text x={x(r - 1)} y={H - 10} textAnchor={r === 1 ? 'start' : r === n ? 'end' : 'middle'} fontSize="13" fontWeight="700" fill="var(--color-neutral-700)">#{r}</text>
        </g>
      ))}
    </svg>
  )
}

export default function TeamEventDepth() {
  const { id, eventId } = useParams()
  const [params, setParams] = useSearchParams()
  const pool = params.get('pool') === 'SCM' ? 'SCM' : 'LCM'
  // Mental Model: swimming ranks men and women separately, so the page opens
  // on one gender (Men, or Women when the squad has no men in this event).
  // "Everyone" stays available as the last option.
  const gParam = params.get('gender')
  const gender = gParam === 'F' ? 'F' : gParam === 'ALL' ? '' : 'M'
  const [data, setData] = useState(null)
  const [q, setQ] = useState('')
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    let alive = true
    setData(null)
    api.get(`/teams/${id}/depth/`, { params: { event: eventId, pool, ...(gender ? { gender } : {}) } })
      .then((r) => {
        if (!alive) return
        // no explicit choice and no men with a time → show the women instead
        if (!gParam && !(r.data?.swimmers || []).length) {
          const next = new URLSearchParams(params); next.set('gender', 'F'); setParams(next, { replace: true })
          return
        }
        setData(r.data)
      })
      .catch(() => alive && setData({ swimmers: [], failed: true }))
    return () => { alive = false }
  }, [id, eventId, pool, gender])

  const set = (k, v) => {
    const next = new URLSearchParams(params)
    if (v) next.set(k, v); else next.delete(k)
    setParams(next, { replace: true })
  }

  const swimmers = data?.swimmers || []
  const stats = useMemo(() => {
    if (!swimmers.length) return null
    const lead = swimmers[0]
    const at = (r) => swimmers[Math.min(r, swimmers.length) - 1]
    const median = swimmers[Math.floor((swimmers.length - 1) / 2)]
    const pts = swimmers.filter((s) => s.fina_points)
    return {
      lead, median,
      top8: at(8), top8n: Math.min(8, swimmers.length),
      avgPts: pts.length ? Math.round(pts.reduce((n, s) => n + s.fina_points, 0) / pts.length) : null,
    }
  }, [swimmers])
  const matched = q.trim() ? swimmers.filter((s) => fold(s.name).includes(fold(q))) : swimmers
  // Miller's Law: three heats first, the rest on request (a search looks through everyone)
  const shown = q.trim() || showAll ? matched : matched.slice(0, FIRST)
  const rankOf = useMemo(() => new Map(swimmers.map((s, i) => [s.swimmer_id, i + 1])), [swimmers])

  const team = data?.team
  const kind = team?.is_national_team ? 'team' : team?.is_academy ? 'academy' : 'club'
  const back = `/teams/${id}?tab=depth`

  const tile = (label, value, sub) => (
    <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderTop: '3px solid var(--color-box-top)', borderRadius: 10, padding: '14px 16px', minWidth: 0 }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: SOFT }}>{label}</div>
      <div className="asw-num" style={{ fontFamily: HEAD, fontWeight: 900, fontSize: 28, color: INK, lineHeight: 1.15, marginTop: 4 }}>{value}</div>
      <div style={{ fontSize: 12.5, color: MUTED, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</div>
    </div>
  )

  return (
    <div className="m-zoom" style={{ background: 'var(--color-neutral-100)', minHeight: '60vh' }}>
      {/* Header */}
      <div className="rule-b m-pad" style={{ background: '#fff', padding: '18px 32px 20px' }}>
        <BackLink to={back}>{team?.name ? `${team.name} squad depth` : 'Squad depth'}</BackLink>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginTop: 4 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: SOFT }}>Squad depth · event</div>
            <h1 style={{ margin: '2px 0 0', fontFamily: HEAD, fontWeight: 900, fontSize: 'clamp(26px, 4vw, 38px)', letterSpacing: '-0.02em', lineHeight: 1.08, color: INK }}>
              {data?.event?.name || 'Event'}
            </h1>
            <div style={{ fontSize: 13.5, color: MUTED, marginTop: 6 }}>
              {swimmers.length ? `${swimmers.length} ${gender === 'M' ? (swimmers.length === 1 ? 'man' : 'men') : gender === 'F' ? (swimmers.length === 1 ? 'woman' : 'women') : (swimmers.length === 1 ? 'swimmer' : 'swimmers')} of this ${kind} with a time · ${pool === 'SCM' ? '25m pool' : '50m pool'} · best swim each` : ' '}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Seg options={[{ value: 'M', label: 'Men' }, { value: 'F', label: 'Women' }, { value: '', label: 'Everyone' }]} value={gender} onChange={(v) => { setShowAll(false); set('gender', v || 'ALL') }} />
            <Seg options={[{ value: 'LCM', label: '50m pool' }, { value: 'SCM', label: '25m pool' }]} value={pool} onChange={(v) => { setShowAll(false); set('pool', v) }} />
          </div>
        </div>
      </div>

      <div className="m-pad" style={{ padding: '20px 32px 40px', maxWidth: 1180, margin: '0 auto' }}>
        {!data ? <Skeleton rows={8} height={44} /> : !stats ? (data.failed
          ? <Empty label="Could not load this event" hint="Check your connection and reload the page."><Link to={back} className="btn btn-secondary">Back to squad depth</Link></Empty>
          : <Empty label={`No ${gender === 'M' ? "men's " : gender === 'F' ? "women's " : ''}times in this event in the ${pool === 'SCM' ? '25m' : '50m'} pool`} hint="Try the other pool or the other gender.">
              <button type="button" className="btn btn-secondary" onClick={() => set('pool', pool === 'SCM' ? 'LCM' : 'SCM')}>Show the {pool === 'SCM' ? '50m' : '25m'} pool</button>
            </Empty>
        ) : (<>
          {!gender && (
            <div style={{ fontSize: 12.5, color: MUTED, marginBottom: 10 }}>Men and women are ranked together by time here. Choose Men or Women for a ranking of one gender.</div>
          )}
          {/* Headline numbers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
            {tile('Swimmers', swimmers.length, 'with a time in this event')}
            {tile('Fastest', stats.lead.time, stats.lead.name)}
            {tile(`Top ${stats.top8n} spread`, gap(stats.top8.time_cs - stats.lead.time_cs), `#1 to #${stats.top8n} — smaller is deeper`)}
            {tile('Median time', stats.median.time, 'half the squad is faster')}
            {stats.avgPts != null && tile('Average FINA', stats.avgPts, 'points across the squad')}
          </div>

          {/* Podium */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginTop: 14 }}>
            {swimmers.slice(0, 3).map((s, i) => (
              <Link key={s.swimmer_id} to={`/swimmers/${s.swimmer_id}`} style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#fff', border: `1px solid ${LINE}`, borderRadius: 12, padding: '14px 16px', textDecoration: 'none', color: INK, minWidth: 0 }}>
                <span className="asw-num" style={{ fontFamily: HEAD, fontWeight: 900, fontSize: 26, color: i === 0 ? 'var(--asw-gold)' : i === 1 ? 'var(--asw-silver)' : 'var(--asw-bronze)', width: 22, flex: 'none' }}>{i + 1}</span>
                <Avatar s={s} size={52} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: 800, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                  <span className="asw-num" style={{ display: 'block', fontSize: 12, color: MUTED, marginTop: 2 }}>{[s.fina_points ? `${s.fina_points} pts` : null, i ? gap(s.time_cs - stats.lead.time_cs) : 'Squad best'].filter(Boolean).join(' · ')}</span>
                </span>
                <span className="asw-num asw-time" style={{ fontFamily: HEAD, fontWeight: 900, fontSize: 22, flex: 'none' }}>{s.time}</span>
              </Link>
            ))}
          </div>

          {/* Depth curve */}
          {swimmers.length >= 4 && (
            <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 12, padding: '16px 18px 10px', marginTop: 14 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
                <div style={{ fontFamily: HEAD, fontWeight: 900, fontSize: 13, letterSpacing: '0.06em', textTransform: 'uppercase', color: INK }}>Depth curve</div>
                <div style={{ fontSize: 12.5, color: MUTED }}>Best time by squad rank · a flatter line means a deeper squad</div>
              </div>
              <DepthCurve swimmers={swimmers} />
            </div>
          )}

          {/* Full ranking */}
          <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 12, marginTop: 14, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '14px 16px', borderBottom: `1px solid ${LINE}` }}>
              <div style={{ fontFamily: HEAD, fontWeight: 900, fontSize: 13, letterSpacing: '0.06em', textTransform: 'uppercase', color: INK }}>
                Full ranking · {q.trim() ? `${matched.length} of ${swimmers.length}` : swimmers.length}
              </div>
              {swimmers.length > 10 && (
                <input className="input" type="search" aria-label="Find a swimmer" placeholder="Find a swimmer…" value={q} onChange={(e) => setQ(e.target.value)}
                  style={{ width: 'auto', flex: '0 1 240px', minWidth: 0, minHeight: 40 }} />
              )}
            </div>
            {shown.length === 0 ? <Empty label="No swimmer matches" hint="Check the spelling or clear the search." /> : (
              <div className="table-scroll">
                <table className="table" style={{ marginBottom: 0 }}>
                  <thead>
                    <tr>
                      <th style={{ width: 44 }}>#</th>
                      <th>Swimmer</th>
                      {!gender && <th className="hide-mobile">Gender</th>}
                      <th className="hide-mobile">Born</th>
                      <th style={{ textAlign: 'right' }}>Time</th>
                      <th style={{ textAlign: 'right' }}>Gap</th>
                      <th style={{ textAlign: 'right' }} className="hide-mobile">FINA</th>
                      <th className="hide-mobile">Set at</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((s) => {
                      const rank = rankOf.get(s.swimmer_id)
                      // Chunking: the ranking reads in heats of eight — a final,
                      // a B final, then the rest of the squad
                      const head = !q.trim() && swimmers.length > 8 && (rank === 1 ? 'Top 8 · a full final' : rank === 9 ? '9 to 16 · the B final' : rank === 17 ? `17 to ${swimmers.length} · the rest of the squad` : null)
                      return (<Fragment key={s.swimmer_id}>
                        {head && (
                          <tr><td colSpan={8} style={{ background: 'var(--color-neutral-100)', fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: SOFT, padding: '8px 12px' }}>{head}</td></tr>
                        )}
                        <tr>
                          <td className="asw-num" style={{ fontWeight: 800, color: rank <= 3 ? INK : SOFT }}>{rank}</td>
                          <td>
                            <Link to={`/swimmers/${s.swimmer_id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 10, color: INK, fontWeight: 600, textDecoration: 'none', minHeight: 40 }}>
                              <Avatar s={s} size={30} />{s.name}
                            </Link>
                          </td>
                          {!gender && <td className="hide-mobile text-muted">{s.sex === 'F' ? 'Women' : 'Men'}</td>}
                          <td className="asw-num hide-mobile text-muted">{s.birth_year || '—'}</td>
                          <td className="asw-num asw-time" style={{ textAlign: 'right', fontWeight: 800, color: INK }}>{s.time}</td>
                          <td className="asw-num" style={{ textAlign: 'right', color: MUTED }}>{gap(s.time_cs - stats.lead.time_cs)}</td>
                          <td className="asw-num hide-mobile" style={{ textAlign: 'right', color: MUTED }}>{s.fina_points || '—'}</td>
                          <td className="hide-mobile text-muted" style={{ fontSize: 12.5 }}>
                            {s.meet_id ? <Link to={`/championships/${s.meet_id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{s.meet_name}</Link> : s.meet_name}
                            {s.date ? <span className="asw-num"> · {formatDate(s.date)}</span> : null}
                          </td>
                        </tr>
                      </Fragment>)
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {!q.trim() && matched.length > FIRST && (
              <div style={{ textAlign: 'center', padding: '12px 16px', borderTop: `1px solid ${LINE}` }}>
                <button type="button" className="btn btn-secondary" style={{ minHeight: 40, padding: '0 18px' }} aria-expanded={showAll} onClick={() => setShowAll((v) => !v)}>
                  {showAll ? `Show the top ${FIRST} only` : `Show all ${matched.length} swimmers`}
                </button>
              </div>
            )}
          </div>
        </>)}
      </div>
    </div>
  )
}
