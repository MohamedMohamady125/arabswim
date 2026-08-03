import { useEffect, useMemo, useState, Fragment } from 'react'
import { Link, useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { AtSign, ExternalLink, X, BadgeCheck } from 'lucide-react'
import {
  getSwimmer,
  updateSwimmer,
  uploadSwimmerPhoto,
  getSwimmerEvents,
  getSwimmerEventHistory,
  getSwimmerProfileStats,
  getSwimmerProgression,
  getSwimmerRankings,
  getSwimmerTransferHistory,
} from '../api/swimmers'
import { createClaim, getMyClaims } from '../api/claims'
import { useAuth } from '../context/AuthContext'
import Flag from '../components/Flag'
import { Loading, Empty, Seg } from '../components/ui'
import { formatDate, mediaUrl } from '../utils'
import SplitsBreakdown from '../components/swimmer/SplitsBreakdown'
import CompareTab from '../components/swimmer/CompareTab'
import ProgressionChart from '../components/charts/ProgressionChart'
import MeetsTab from '../components/swimmer/MeetsTab'
import MedalsTab from '../components/swimmer/MedalsTab'
import RankingsTab, { ordSuffix } from '../components/swimmer/RankingsTab'
import RecordsTab from '../components/swimmer/RecordsTab'
import QualifyingTab from '../components/swimmer/QualifyingTab'
import TransfersTab from '../components/swimmer/TransfersTab'
import GalleryTab from '../components/swimmer/GalleryTab'

const list = (d) => (Array.isArray(d) ? d : d?.results || [])

function Modal({ title, onClose, children, width = 520 }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(20,24,31,0.55)', zIndex: 100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '6vh 16px', overflowY: 'auto' }}
      onClick={onClose}
    >
      <div
        style={{ background: 'var(--color-bg, #fff)', border: '2px solid var(--color-text)', width: '100%', maxWidth: width }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="rule-b" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px' }}>
          <div className="kicker">{title}</div>
          <button className="btn btn-secondary btn-icon" onClick={onClose} aria-label="Close"><X size={14} /></button>
        </div>
        <div style={{ padding: 20 }}>{children}</div>
      </div>
    </div>
  )
}

function ClaimModal({ swimmer, onClose, onSubmitted }) {
  const [file, setFile] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (!file) return
    setLoading(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('swimmer', swimmer.id)
      fd.append('id_document', file)
      await createClaim(fd)
      onSubmitted()
    } catch (err) {
      setError(err.response?.data?.error || 'Could not submit the claim')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal title="Claim this profile" onClose={onClose}>
      <div style={{ fontSize: 13, color: 'var(--color-neutral-700)', marginBottom: 14, lineHeight: 1.5 }}>
        To verify that you are <strong>{swimmer.name}</strong>, upload a photo of your
        passport or national ID. Our team reviews every claim manually — the document is
        only visible to admins.
      </div>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {error && (
          <div style={{ border: '1px solid var(--asw-slow)', color: 'var(--asw-slow)', padding: '10px 12px', fontSize: 13 }}>{error}</div>
        )}
        <input
          className="input"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          required
        />
        <button type="submit" className="btn btn-primary" disabled={loading || !file} style={{ height: 40 }}>
          {loading ? 'Submitting…' : 'Submit claim'}
        </button>
      </form>
    </Modal>
  )
}

function EditMyProfileModal({ swimmer, onClose, onSaved }) {
  const [form, setForm] = useState({
    email: swimmer.email || '',
    phone: swimmer.phone || '',
    instagram_url: swimmer.instagram_url || '',
    facebook_url: swimmer.facebook_url || '',
  })
  const [photo, setPhoto] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await updateSwimmer(swimmer.id, form)
      if (photo) {
        const fd = new FormData()
        fd.append('photo', photo)
        await uploadSwimmerPhoto(swimmer.id, fd)
      }
      onSaved()
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save the changes')
    } finally {
      setLoading(false)
    }
  }

  const field = (label, key, type = 'text') => (
    <label style={{ display: 'block' }}>
      <div className="card-kicker" style={{ marginBottom: 4 }}>{label}</div>
      <input className="input" type={type} value={form[key]} style={{ width: '100%' }}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
    </label>
  )

  return (
    <Modal title="Edit my profile" onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {error && (
          <div style={{ border: '1px solid var(--asw-slow)', color: 'var(--asw-slow)', padding: '10px 12px', fontSize: 13 }}>{error}</div>
        )}
        <label style={{ display: 'block' }}>
          <div className="card-kicker" style={{ marginBottom: 4 }}>Profile photo</div>
          <input className="input" type="file" accept="image/jpeg,image/png,image/webp"
            onChange={(e) => setPhoto(e.target.files?.[0] || null)} />
        </label>
        {field('Email', 'email', 'email')}
        {field('Phone', 'phone')}
        {field('Instagram URL', 'instagram_url', 'url')}
        {field('Facebook URL', 'facebook_url', 'url')}
        <button type="submit" className="btn btn-primary" disabled={loading} style={{ height: 40 }}>
          {loading ? 'Saving…' : 'Save changes'}
        </button>
      </form>
    </Modal>
  )
}

function initials(name) {
  return String(name || '')
    .split(/\s+/).filter(Boolean).slice(0, 2)
    .map((w) => w[0]).join('').toUpperCase()
}

const finaColor = (points) =>
  points >= 1000 ? 'var(--asw-gold)'
  : points >= 900 ? 'var(--asw-fast)'
  : points >= 800 ? 'var(--color-accent-2)'
  : points >= 600 ? 'var(--color-text)'
  : 'var(--color-neutral-600)'

/* ── Times tab ─────────────────────────────────────────────────────────── */

function EventList({ events, selected, onSelect }) {
  const lcm = events.filter((e) => e.pool === 'LCM' && !e.is_relay)
  const scm = events.filter((e) => e.pool === 'SCM' && !e.is_relay)
  const relays = events.filter((e) => e.is_relay)

  const section = (label, rows) => {
    if (!rows.length) return null
    return (
      <div style={{ marginBottom: 16 }}>
        <div style={{ background: 'var(--color-accent-800)', padding: '7px 10px', marginBottom: 2 }}>
          <span className="kicker" style={{ color: '#ffffff' }}>{label}</span>
        </div>
        {rows.map((e) => {
          const isSel = selected?.event_id === e.event_id && selected?.pool === e.pool
          return (
            <button key={`${e.event_id}-${e.pool}`} type="button" onClick={() => onSelect(e)}
              className="hair-b"
              style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                padding: '9px 6px', border: 0, cursor: 'pointer', font: 'inherit', textAlign: 'left',
                background: isSel ? 'var(--color-accent-100)' : 'transparent',
              }}>
              <span style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: 13, color: isSel ? 'var(--color-accent)' : 'inherit', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {e.event_name}
              </span>
              <span className="asw-time" style={{ flex: 'none', fontSize: 13 }}>{e.best_time}</span>
              <span className="micro asw-num" style={{ flex: 'none', width: 34, textAlign: 'right' }}>{e.times_count}x</span>
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div>
      {section('Long course', lcm)}
      {section('Short course', scm)}
      {section('Relay', relays)}
      {events.length === 0 && <Empty label="No competition results yet" />}
    </div>
  )
}

function TimeHistoryPanel({ selectedEvent, history, loadingHistory }) {
  const [expandedSplits, setExpandedSplits] = useState(null)

  if (!selectedEvent) return <Empty label="Select an event to view full time history" />
  if (loadingHistory) return <Loading label="Loading history" />

  const officialHistory = history.filter((x) => !x.is_hc)
  const bestCs = officialHistory.length ? Math.min(...officialHistory.map((x) => x.time_centiseconds)) : null

  return (
    <div>
      <div className="sect-head">
        <h4>{selectedEvent.event_name}</h4>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span className="micro asw-num">{history.length} race{history.length !== 1 ? 's' : ''}</span>
          <span className={`tag ${selectedEvent.pool === 'SCM' ? 'tag-accent-2' : 'tag-accent'}`}>{selectedEvent.pool}</span>
          {selectedEvent.is_relay && <span className="tag tag-neutral">Relay</span>}
        </span>
      </div>
      <div className="table-scroll">
        <table className="table" style={{ fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ width: 30 }}>#</th>
              <th className="time">Time</th>
              <th className="num">Age</th>
              <th className="hide-mobile">Round</th>
              <th className="hide-mobile">Team</th>
              <th>Meet</th>
              <th className="hide-mobile">Date</th>
              <th className="num">FINA</th>
            </tr>
          </thead>
          <tbody>
            {history.map((h, i) => {
              const isBest = h.time_centiseconds === bestCs
              const splits = h.splits || []
              const showSplits = expandedSplits === h.id
              return (
                <Fragment key={h.id}>
                  <tr>
                    <td className="asw-num text-muted">{i + 1}</td>
                    <td className="time" style={{ whiteSpace: 'nowrap' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                        <span className="asw-time" style={{ color: isBest ? 'var(--asw-fast)' : 'inherit' }}>{h.time}</span>
                        {!h.is_relay && isBest && <span className="tag tag-dark">PB</span>}
                        {h.is_hc && (
                          <span className="tag tag-neutral" title={h.hc_type === 'TLD' ? 'Time limit exceeded – does not count in rankings' : 'Hors concours – does not count in rankings'}>
                            {h.hc_type || 'HC'}
                          </span>
                        )}
                        {splits.length > 0 && (
                          <button type="button"
                            onClick={(e) => { e.stopPropagation(); setExpandedSplits(showSplits ? null : h.id) }}
                            className={showSplits ? 'tag tag-dark' : 'tag tag-outline'}
                            style={{ cursor: 'pointer', border: showSplits ? 0 : undefined, font: 'inherit', fontSize: 9, padding: '1px 6px' }}
                            title="Show split times">
                            Splits {showSplits ? '−' : '+'}
                          </button>
                        )}
                      </span>
                    </td>
                    <td className="num asw-num">{h.age_at_competition || '—'}</td>
                    <td className="hide-mobile">
                      {h.round_type ? (
                        <span className={`tag ${h.round_type === 'Finals' ? 'tag-accent' : 'tag-neutral'}`}>{h.round_type}</span>
                      ) : <span className="text-muted">—</span>}
                    </td>
                    <td className="hide-mobile text-muted">
                      {(h.team || '').toUpperCase() === 'LP' ? (
                        <span className="tag tag-neutral" title="No club — transferring (libre passage)">LP</span>
                      ) : (h.team || '—')}
                    </td>
                    <td>
                      <Link to={`/meets/${h.championship_id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                        {h.championship_name}
                      </Link>
                    </td>
                    <td className="hide-mobile asw-num" style={{ whiteSpace: 'nowrap' }}>{formatDate(h.championship_date)}</td>
                    <td className="num asw-num" style={{ fontWeight: 700, color: h.fina_points ? finaColor(h.fina_points) : 'var(--color-neutral-500)' }}>
                      {h.fina_points || '—'}
                    </td>
                  </tr>
                  {showSplits && (() => {
                    // sibling round (prelims vs finals) from the same meet, if it has splits
                    const sibling = h.round_type ? history.find((x) =>
                      x.id !== h.id && x.championship_id === h.championship_id &&
                      x.round_type && x.round_type !== h.round_type && (x.splits || []).length > 0
                    ) : null
                    return (
                      <tr>
                        <td colSpan={8} style={{ background: 'var(--color-neutral-100)', padding: '14px 16px' }}>
                          <SplitsBreakdown splits={splits} eventName={selectedEvent.event_name}
                            roundType={h.round_type} totalCs={h.time_centiseconds}
                            compareSplits={sibling?.splits} compareRoundType={sibling?.round_type}
                            compareTotalCs={sibling?.time_centiseconds} />
                        </td>
                      </tr>
                    )
                  })()}
                </Fragment>
              )
            })}
            {history.length === 0 && (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 24 }} className="text-muted">No times recorded</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ── Overall tab ───────────────────────────────────────────────────────── */

function RankingsPreview({ swimmerId, onViewAll }) {
  const [rankings, setRankings] = useState(null)
  const [events, setEvents] = useState([])
  useEffect(() => {
    let alive = true
    Promise.all([getSwimmerRankings(swimmerId), getSwimmerEvents(swimmerId)])
      .then(([r, e]) => { if (alive) { setRankings(r.data); setEvents(e.data || []) } })
      .catch(() => {})
    return () => { alive = false }
  }, [swimmerId])

  if (!rankings || rankings.length === 0) return null

  const eventMap = {}
  for (const e of events) { eventMap[`${e.event_id}-${e.pool}`] = e.event_name; eventMap[`${e.event_id}`] = e.event_name }
  const eventName = (r) => eventMap[`${r.event_id}-${r.pool}`] || eventMap[`${r.event_id}`] || `Event ${r.event_id}`

  // Flatten all scopes, best rank first, dedupe by event, top 3
  const best = []
  for (const r of rankings) {
    for (const [scope, rk] of Object.entries(r.rankings || {})) {
      best.push({ ...rk, scope, event_id: r.event_id, pool: r.pool, best_time: r.best_time })
    }
  }
  best.sort((a, b) => a.rank - b.rank)
  const seen = new Set()
  const top = []
  for (const b of best) {
    const key = `${b.event_id}-${b.pool}`
    if (seen.has(key)) continue
    seen.add(key)
    top.push(b)
    if (top.length >= 3) break
  }
  if (top.length === 0) return null

  const scopeLabel = { arab: 'Arab', gcc: 'GCC', national: 'National' }

  return (
    <div>
      <div className="sect-head">
        <h4>Best rankings</h4>
        <button type="button" className="btn btn-ghost" style={{ fontSize: 12 }} onClick={onViewAll}>View all →</button>
      </div>
      <div className="rule-t">
        {top.map((r, i) => (
          <div key={i} className="hair-b" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0' }}>
            <div style={{ background: 'var(--color-accent)', color: '#fff', width: 48, height: 48, flex: 'none', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 8 }}>
              <span className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 22, lineHeight: 1 }}>{r.rank}</span>
              <span style={{ fontSize: 10, fontWeight: 800, marginTop: 1 }}>{ordSuffix(r.rank)}</span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.03em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {eventName(r)}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
                <span className="tag tag-accent">{scopeLabel[r.scope] || r.scope}</span>
                <span className="micro asw-num">{r.pool}{r.total ? ` · out of ${r.total}` : ''}</span>
              </div>
            </div>
            <span className="asw-time" style={{ fontSize: 16, flex: 'none' }}>{r.best_time}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

const PERFORMANCE_TIERS = [
  { min: 1000, max: null, label: 'World-Class' },
  { min: 900, max: 1000, label: 'International Elite' },
  { min: 800, max: 900, label: 'Elite' },
  { min: 700, max: 800, label: 'High Performance' },
  { min: 600, max: 700, label: 'Advanced' },
  { min: 500, max: 600, label: 'Competitive' },
  { min: 400, max: 500, label: 'Developing' },
  { min: 300, max: 400, label: 'Foundation' },
  { min: 200, max: 300, label: 'Novice' },
  { min: 100, max: 200, label: 'Entry Level' },
]

function OverallTab({ stats, swimmerId, onViewRankings }) {
  if (!stats) return <Empty label="No stats available" />
  const {
    medals, total_championships, total_records, best_fina,
    season_best_fina, best_event, top_personal_bests, records, fina_distribution,
  } = stats
  const intlRecords = (records || []).filter((r) => r.record_type !== 'NATIONAL')
  const md = medals || { gold: 0, silver: 0, bronze: 0, total: 0 }
  const bestEventPb = (top_personal_bests || []).find((pb) => pb.event_name === best_event)

  const bandCell = { padding: '16px 20px', flex: '1 1 0', minWidth: 140, borderLeft: '1px solid rgba(255,255,255,0.15)' }
  const bandNum = { fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 30, lineHeight: 1.1, marginTop: 4, color: '#fff' }
  const bandKicker = { fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.55)' }
  const bandSub = { fontSize: 11, marginTop: 4, color: 'rgba(255,255,255,0.65)' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {/* Season stat band */}
      <div style={{ background: 'var(--color-accent-800)', display: 'flex', flexWrap: 'wrap', margin: '0 -1px' }}>
        <div style={{ ...bandCell, borderLeft: 'none' }}>
          <div style={bandKicker}>Meets</div>
          <div className="asw-num" style={bandNum}>{total_championships ?? 0}</div>
        </div>
        <div style={bandCell}>
          <div style={bandKicker}>Medals</div>
          <div className="asw-num" style={{ ...bandNum, color: 'var(--asw-gold)' }}>{md.total}</div>
          <div className="asw-num" style={{ fontSize: 12, marginTop: 4, display: 'flex', gap: 8 }}>
            <span style={{ color: 'var(--asw-gold)', fontWeight: 700 }}>{md.gold}G</span>
            <span style={{ color: 'var(--asw-silver)', fontWeight: 700 }}>{md.silver}S</span>
            <span style={{ color: 'var(--asw-bronze)', fontWeight: 700 }}>{md.bronze}B</span>
          </div>
        </div>
        <div style={bandCell}>
          <div style={bandKicker}>Records</div>
          <div className="asw-num" style={bandNum}>{total_records ?? (records || []).length}</div>
          {intlRecords.length > 0 && <div className="asw-num" style={bandSub}>{intlRecords.length} international</div>}
        </div>
        <div style={bandCell}>
          <div style={bandKicker}>Best FINA</div>
          <div className="asw-num" style={bandNum}>{best_fina?.points || '—'}</div>
          {best_fina?.event_name && <div style={bandSub}>{best_fina.event_name}</div>}
        </div>
        <div style={bandCell}>
          <div style={bandKicker}>Season best FINA</div>
          <div className="asw-num" style={bandNum}>{season_best_fina?.points || '—'}</div>
          {season_best_fina?.event_name && (
            <div style={bandSub}>{season_best_fina.event_name}{season_best_fina.year ? ` · ${season_best_fina.year}` : ''}</div>
          )}
        </div>
        <div style={bandCell}>
          <div style={bandKicker}>Fastest event</div>
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 18, lineHeight: 1.2, marginTop: 6, color: '#fff', textTransform: 'uppercase' }}>
            {best_event || '—'}
          </div>
          {bestEventPb && <div className="asw-time" style={{ ...bandSub, fontSize: 13, color: '#fff' }}>{bestEventPb.time}</div>}
        </div>
      </div>

      {/* Performance index */}
      {(best_fina?.points || 0) > 0 && (
        <div>
          <div className="sect-head"><h4>Performance index</h4><span className="micro">FINA points · career best {best_fina.points}</span></div>
          <div className="rule-t" style={{ paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {PERFORMANCE_TIERS.map((t) => {
              const isCurrent = best_fina.points >= t.min && (t.max == null || best_fina.points < t.max)
              const isSeason = !isCurrent && season_best_fina?.points != null
                && season_best_fina.points >= t.min && (t.max == null || season_best_fina.points < t.max)
              const count = (fina_distribution || [])
                .filter((d) => d.low >= t.min && (t.max == null || d.low < t.max))
                .reduce((n, d) => n + (d.count || 0), 0)
              const reached = best_fina.points >= t.min
              return (
                <div key={t.min} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '7px 10px',
                  background: isCurrent ? 'var(--color-accent-800)' : 'transparent',
                  color: isCurrent ? '#fff' : 'inherit',
                  borderLeft: `4px solid ${isCurrent ? 'var(--asw-gold)' : reached ? 'var(--color-accent)' : 'var(--color-divider)'}`,
                }}>
                  <span className="asw-num" style={{ width: 52, flex: 'none', fontWeight: 800, fontSize: 14, opacity: reached ? 1 : 0.5 }}>{t.min}+</span>
                  <span style={{ flex: 1, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', opacity: reached ? 1 : 0.5 }}>{t.label}</span>
                  {isCurrent && <span className="tag" style={{ background: 'var(--asw-gold)', color: '#fff', border: 0 }}>CAREER BEST</span>}
                  {isSeason && <span className="tag tag-accent">THIS SEASON</span>}
                  {count > 0 && <span className="asw-num micro" style={{ opacity: isCurrent ? 0.8 : 0.6 }}>{count} PB{count !== 1 ? 's' : ''}</span>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Top personal bests */}
      {top_personal_bests?.length > 0 && (
        <div>
          <div className="sect-head"><h4>Top personal bests</h4></div>
          <div className="rule-t">
            {top_personal_bests.map((pb, i) => (
              <div key={i} className="hair-b" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0' }}>
                <span className="asw-num" style={{ width: 30, height: 30, flex: 'none', background: 'var(--color-accent-800)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 13 }}>
                  {i + 1}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, textTransform: 'uppercase' }}>{pb.event_name}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-neutral-700)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {pb.meet_name}{pb.meet_date ? ` · ${formatDate(pb.meet_date)}` : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flex: 'none' }}>
                  <div className="asw-time" style={{ fontSize: 16 }}>{pb.time}</div>
                  <div className="micro asw-num" style={{ color: 'var(--color-accent)' }}>{pb.fina_points} pts</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Best rankings preview */}
      <RankingsPreview swimmerId={swimmerId} onViewAll={onViewRankings} />

      {/* International records */}
      {intlRecords.length > 0 && (
        <div>
          <div className="sect-head">
            <h4>International records</h4>
            <span className="micro asw-num">{intlRecords.length}</span>
          </div>
          <div className="rule-t">
            {intlRecords.map((r) => (
              <div key={r.id} className="hair-b" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0' }}>
                <span className={`tag ${r.record_type === 'ARAB' ? 'tag-dark' : r.record_type === 'GCC' ? 'tag-accent' : 'tag-outline'}`}>{r.record_type}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, textTransform: 'uppercase' }}>{r.event_name}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-neutral-700)', marginTop: 2 }}>
                    {r.location}{r.location && r.date ? ' · ' : ''}{formatDate(r.date)}
                  </div>
                </div>
                <span className="asw-time" style={{ fontSize: 16, flex: 'none' }}>{r.time}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Progression tab ───────────────────────────────────────────────────── */

function ProgressionTab({ swimmerId }) {
  const [pool, setPool] = useState('LCM')
  const [lines, setLines] = useState(null)

  useEffect(() => {
    let alive = true
    setLines(null)
    getSwimmerProgression(swimmerId, pool)
      .then((res) => { if (alive) setLines(list(res.data)) })
      .catch(() => { if (alive) setLines([]) })
    return () => { alive = false }
  }, [swimmerId, pool])

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <Seg
          options={[{ value: 'LCM', label: 'Long course' }, { value: 'SCM', label: 'Short course' }]}
          value={pool}
          onChange={setPool}
        />
      </div>
      {lines === null ? (
        <Loading label="Loading progression" />
      ) : lines.length === 0 ? (
        <Empty label={`No ${pool === 'LCM' ? 'long course' : 'short course'} progression data`} />
      ) : (
        <ProgressionChart lines={lines} />
      )}
    </div>
  )
}

/* ── Tab config ────────────────────────────────────────────────────────── */

const TABS = [
  { value: 'overall', label: 'Overall' },
  { value: 'times', label: 'Times' },
  { value: 'meets', label: 'Meets' },
  { value: 'medals', label: 'Medals' },
  { value: 'rankings', label: 'Rankings' },
  { value: 'records', label: 'Records' },
  { value: 'qualifying', label: 'Qualifying' },
  { value: 'progression', label: 'Progression' },
  { value: 'compare', label: 'Compare' },
  { value: 'transfers', label: 'Transfers' },
  { value: 'gallery', label: 'Gallery' },
]

/* ── Main page ─────────────────────────────────────────────────────────── */

export default function SwimmerProfile() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { isAdmin, isAuthed, mySwimmerId, refreshUser } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = searchParams.get('tab') || 'overall'
  const setActiveTab = (tab) => setSearchParams({ tab })

  const [swimmer, setSwimmer] = useState(null)
  const [claimOpen, setClaimOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [myClaims, setMyClaims] = useState([])
  const [events, setEvents] = useState([])
  const [stats, setStats] = useState(null)
  const [clubHistory, setClubHistory] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [history, setHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  useEffect(() => {
    let alive = true
    setLoaded(false)
    setSelectedEvent(null)
    setHistory([])
    Promise.allSettled([
      getSwimmer(id),
      getSwimmerEvents(id),
      getSwimmerProfileStats(id),
      getSwimmerTransferHistory(id),
    ]).then(([sRes, eRes, stRes, tRes]) => {
      if (!alive) return
      const val = (r) => (r.status === 'fulfilled' ? r.value.data : null)
      setSwimmer(val(sRes))
      setEvents(list(val(eRes)))
      setStats(val(stRes))
      setClubHistory(val(tRes)?.clubs || [])
      setLoaded(true)
    })
    return () => { alive = false }
  }, [id])

  useEffect(() => {
    if (!isAuthed || isAdmin || mySwimmerId) { setMyClaims([]); return }
    getMyClaims().then((res) => setMyClaims(list(res.data))).catch(() => setMyClaims([]))
  }, [id, isAuthed, isAdmin, mySwimmerId])

  const handleEventClick = async (event) => {
    setSelectedEvent(event)
    setLoadingHistory(true)
    try {
      const res = await getSwimmerEventHistory(id, event.event_id, event.pool)
      setHistory(list(res.data))
    } catch {
      setHistory([])
    } finally {
      setLoadingHistory(false)
    }
  }

  if (!loaded) return <Loading label="Loading swimmer" />
  if (!swimmer) return <Empty label="Swimmer not found" />

  // Non-Arab swimmers keep a normal profile but Records and Rankings are
  // Arab-only features (their scopes are national/Arab/GCC)
  const isNonArab = swimmer.nationality_detail?.region === 'OTHER'
  const visibleTabs = isNonArab ? TABS.filter((t) => !['records', 'rankings'].includes(t.value)) : TABS
  const effectiveTab = isNonArab && ['records', 'rankings'].includes(activeTab) ? 'times' : activeTab

  const chip = (label, value) => (
    <span className="tag tag-neutral" style={{ gap: 6 }}>
      {label && <span className="micro" style={{ letterSpacing: '0.06em' }}>{label}</span>}
      <span className="asw-num" style={{ fontWeight: 700 }}>{value}</span>
    </span>
  )

  return (
    <div>
      {/* ── Header ── */}
      <div className="pad-lg rule-b" style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap', position: 'relative' }}>
        {swimmer.photo ? (
          <div className="grayscale swimmer-photo" style={{ flex: 'none', overflow: 'hidden' }}>
            <img src={mediaUrl(swimmer.photo)} alt={swimmer.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        ) : (
          <div className="swimmer-photo" style={{ flex: 'none', background: 'var(--color-accent-800)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-heading)', fontWeight: 800 }}>
            {initials(swimmer.name)}
          </div>
        )}
        <div className="swimmer-head-info" style={{ flex: 1 }}>
          <div className="kicker" style={{ marginBottom: 6 }}>Swimmer profile</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0, letterSpacing: '-0.03em' }}>{swimmer.name}</h1>
            {swimmer.is_verified && (
              <span className="tag tag-accent-2" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <BadgeCheck size={14} /> Verified athlete
              </span>
            )}
            {swimmer.is_retired && <span className="tag tag-dark">Retired</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, fontSize: 13, color: 'var(--color-neutral-700)' }}>
            <Flag code={swimmer.nationality_detail?.code} name={swimmer.nationality_detail?.name} flagUrl={swimmer.nationality_detail?.flag_url} />
            <span style={{ fontWeight: 600, color: 'var(--color-text)' }}>{swimmer.nationality_detail?.name}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            {swimmer.date_of_birth
              ? chip('DOB', formatDate(swimmer.date_of_birth))
              : swimmer.birth_year ? chip('Born', swimmer.birth_year) : null}
            {swimmer.age != null && chip('Age', swimmer.age)}
            {swimmer.sex && chip('', swimmer.sex === 'M' ? 'Male' : 'Female')}
            {swimmer.instagram_url && (
              <a href={swimmer.instagram_url} target="_blank" rel="noopener noreferrer" title="Instagram" aria-label="Instagram"
                className="btn btn-secondary btn-icon" style={{ width: 30, height: 30 }}>
                <AtSign size={15} />
              </a>
            )}
            {swimmer.facebook_url && (
              <a href={swimmer.facebook_url} target="_blank" rel="noopener noreferrer" title="Facebook" aria-label="Facebook"
                className="btn btn-secondary btn-icon" style={{ width: 30, height: 30 }}>
                <ExternalLink size={15} />
              </a>
            )}
          </div>
          {swimmer.nicknames?.length > 0 && (
            <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
              {swimmer.nicknames.map((n, i) => (
                <span key={i} className="tag tag-accent-2">{n.nickname}</span>
              ))}
            </div>
          )}
        </div>
        {(() => {
          const isMine = mySwimmerId != null && Number(id) === mySwimmerId
          const pendingHere = myClaims.some((c) => c.swimmer === Number(id) && c.status === 'PENDING')
          const canClaim = isAuthed && !isAdmin && !isMine && mySwimmerId == null &&
            !swimmer.is_verified && !swimmer.is_relay_team
          if (!isAdmin && !isMine && !canClaim && !pendingHere) return null
          return (
            <div style={{ position: 'absolute', top: 16, right: 24, display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {isAdmin && (
                <button type="button" className="btn btn-secondary" style={{ fontSize: 12 }}
                  onClick={async () => {
                    const next = !swimmer.is_retired
                    await updateSwimmer(id, { is_retired: next })
                    setSwimmer({ ...swimmer, is_retired: next })
                  }}>
                  {swimmer.is_retired ? 'Mark active' : 'Mark retired'}
                </button>
              )}
              {isMine && (
                <button type="button" className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => setEditOpen(true)}>
                  Edit my profile
                </button>
              )}
              {pendingHere && <span className="tag tag-neutral">Claim pending review</span>}
              {canClaim && !pendingHere && (
                <button type="button" className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => setClaimOpen(true)}>
                  This is me — claim profile
                </button>
              )}
            </div>
          )
        })()}
      </div>

      {claimOpen && (
        <ClaimModal
          swimmer={swimmer}
          onClose={() => setClaimOpen(false)}
          onSubmitted={() => {
            setClaimOpen(false)
            setMyClaims([...myClaims, { swimmer: Number(id), status: 'PENDING' }])
          }}
        />
      )}
      {editOpen && (
        <EditMyProfileModal
          swimmer={swimmer}
          onClose={() => setEditOpen(false)}
          onSaved={async () => {
            setEditOpen(false)
            const res = await getSwimmer(id).catch(() => null)
            if (res) setSwimmer(res.data)
            refreshUser()
          }}
        />
      )}

      {/* ── Tabs ── */}
      <div className="rule-b tabbar" style={{ padding: '14px 32px', overflowX: 'auto' }}>
        <Seg
          tabs
          options={visibleTabs}
          value={effectiveTab}
          onChange={setActiveTab}
        />
      </div>

      {/* ── Tab content ── */}
      <div className="pad">
        {effectiveTab === 'overall' && (
          <OverallTab stats={stats} swimmerId={id} onViewRankings={() => setActiveTab('rankings')} />
        )}
        {effectiveTab === 'times' && (
          <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 32, alignItems: 'start' }}>
            <EventList events={events} selected={selectedEvent} onSelect={handleEventClick} />
            <TimeHistoryPanel selectedEvent={selectedEvent} history={history} loadingHistory={loadingHistory} />
          </div>
        )}
        {effectiveTab === 'meets' && <MeetsTab stats={stats} />}
        {effectiveTab === 'medals' && <MedalsTab stats={stats} />}
        {effectiveTab === 'rankings' && <RankingsTab swimmerId={id} swimmer={swimmer} />}
        {effectiveTab === 'records' && <RecordsTab swimmerId={id} />}
        {effectiveTab === 'qualifying' && <QualifyingTab swimmerId={id} />}
        {effectiveTab === 'progression' && <ProgressionTab swimmerId={id} />}
        {effectiveTab === 'compare' && <CompareTab swimmerId={id} />}
        {effectiveTab === 'transfers' && <TransfersTab swimmerId={id} />}
        {effectiveTab === 'gallery' && <GalleryTab swimmerId={id} />}
      </div>
    </div>
  )
}
