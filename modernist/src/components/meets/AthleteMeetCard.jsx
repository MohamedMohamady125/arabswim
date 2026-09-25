import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { X } from 'lucide-react'
import { getResults } from '../../api/championships'
import { getMedals } from '../../api/medals'
import Flag from '../Flag'
import { Loading, MedalIcon } from '../ui'
import { mediaUrl } from '../../utils'

const list = (d) => (Array.isArray(d) ? d : d?.results || [])

// Round display order inside the card: finals first
const ROUND_RANK = { Finals: 0, 'Junior Final': 1, Consolation: 2, 'Final C': 3, 'Final D': 4, Semifinals: 5, Semis: 5, Prelims: 6, Heats: 6, 'Swim-off': 7, '': 8 }
const roundTag = (r) => {
  if (!r) return 'Timed final'
  if (r === 'Prelims' || r === 'Heats') return 'Heats'
  if (r === 'Semis') return 'Semifinals'
  return r
}

/**
 * App-style athlete pop-over: everything this swimmer has done at one meet.
 * Opens from any result row inside the live meet view.
 */
export default function AthleteMeetCard({ swimmer, meet, onClose }) {
  const [rows, setRows] = useState(null)
  const [medals, setMedals] = useState([])

  useEffect(() => {
    getResults({ swimmer: swimmer.id, championship: meet.id })
      .then((r) => setRows(list(r.data)))
      .catch(() => setRows([]))
    getMedals({ swimmer: swimmer.id, championship: meet.id })
      .then((r) => setMedals(list(r.data)))
      .catch(() => {})
  }, [swimmer.id, meet.id])

  // close on Escape
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [onClose])

  // medal per result id (and per event as fallback for relays)
  const medalByResult = useMemo(() => {
    const m = {}
    for (const md of medals) if (md.result) m[md.result] = md.medal_type
    return m
  }, [medals])

  const counts = useMemo(() => ({
    GOLD: medals.filter((m) => m.medal_type === 'GOLD').length,
    SILVER: medals.filter((m) => m.medal_type === 'SILVER').length,
    BRONZE: medals.filter((m) => m.medal_type === 'BRONZE').length,
  }), [medals])

  const sorted = useMemo(() => {
    if (!rows) return null
    return [...rows].sort((a, b) => {
      const ev = (a.event_detail?.sort_order ?? 0) - (b.event_detail?.sort_order ?? 0)
        || (a.event_detail?.distance ?? 0) - (b.event_detail?.distance ?? 0)
      if (ev !== 0) return ev
      return (ROUND_RANK[a.round_type] ?? 8) - (ROUND_RANK[b.round_type] ?? 8)
    })
  }, [rows])

  // best swim = highest FINA points
  const bestId = useMemo(() => {
    if (!rows || rows.length < 2) return null
    const best = rows.reduce((a, b) => ((b.fina_points || 0) > (a.fina_points || 0) ? b : a))
    return best.fina_points ? best.id : null
  }, [rows])

  const nat = swimmer.nationality_detail
  const initials = (swimmer.name || '?').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()

  return createPortal(
    <div
      className="athlete-card-overlay"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(8, 24, 44, .58)',
        backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        className="athlete-card-pop"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 480, maxHeight: 'min(84vh, 720px)', display: 'flex', flexDirection: 'column',
          borderRadius: 18, overflow: 'hidden', background: '#fff',
          boxShadow: '0 24px 64px rgba(4, 12, 24, .45)',
        }}
      >
        {/* ── header ── */}
        <div style={{
          background: 'linear-gradient(140deg, var(--color-accent-700), var(--color-accent-900))',
          color: '#fff', padding: '18px 20px 16px', position: 'relative', flex: 'none',
        }}>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              position: 'absolute', top: 12, right: 12, width: 30, height: 30, borderRadius: '50%',
              border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(255,255,255,.14)', color: '#fff',
            }}
          >
            <X size={16} />
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {swimmer.photo ? (
              <img
                src={mediaUrl(swimmer.photo)}
                alt=""
                style={{ width: 62, height: 62, borderRadius: '50%', objectFit: 'cover', border: '2.5px solid rgba(255,255,255,.35)', flex: 'none' }}
              />
            ) : (
              <span style={{
                width: 62, height: 62, borderRadius: '50%', flex: 'none', display: 'flex', alignItems: 'center',
                justifyContent: 'center', background: 'rgba(255,255,255,.14)', border: '2.5px solid rgba(255,255,255,.25)',
                fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 20,
              }}>
                {initials}
              </span>
            )}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 19, lineHeight: 1.2, letterSpacing: '-0.01em' }}>
                {swimmer.name}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 5, fontSize: 12.5, color: 'rgba(255,255,255,.78)', fontWeight: 600, flexWrap: 'wrap' }}>
                {nat && <Flag code={nat.code} />}
                {nat?.name}
                {swimmer.age ? <><span style={{ opacity: .5 }}>·</span>{swimmer.age} yrs</> : null}
                {swimmer.club ? <><span style={{ opacity: .5 }}>·</span><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>{swimmer.club}</span></> : null}
              </div>
            </div>
          </div>
          {/* medal counts at this meet */}
          {(counts.GOLD + counts.SILVER + counts.BRONZE) > 0 && (
            <div style={{ display: 'flex', gap: 8, marginTop: 13 }}>
              {['GOLD', 'SILVER', 'BRONZE'].map((t) => counts[t] > 0 && (
                <span key={t} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3.5px 11px 3.5px 6px',
                  borderRadius: 999, background: 'rgba(255,255,255,.13)', fontSize: 12.5, fontWeight: 800,
                }}>
                  <MedalIcon type={t} size={17} style={{ display: 'block' }} />
                  <span className="asw-num">{counts[t]}</span>
                </span>
              ))}
            </div>
          )}
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,.55)', marginTop: 12 }}>
            At {meet.name}
          </div>
        </div>

        {/* ── swims ── */}
        <div style={{ overflowY: 'auto', flex: 1, background: 'var(--color-surface)' }}>
          {sorted === null ? (
            <Loading label="Loading swims" />
          ) : sorted.length === 0 ? (
            <div style={{ padding: '26px 20px', textAlign: 'center', fontSize: 13, color: 'var(--color-neutral-600)' }}>
              No swims recorded at this meet yet.
            </div>
          ) : (
            <div style={{ padding: '10px 12px', display: 'grid', gap: 6 }}>
              {sorted.map((r) => {
                const medal = medalByResult[r.id]
                const isBest = r.id === bestId
                return (
                  <div key={r.id} style={{
                    display: 'flex', alignItems: 'center', gap: 11, padding: '10px 12px',
                    background: '#fff', borderRadius: 11,
                    border: `1px solid ${isBest ? 'var(--asw-gold)' : 'var(--color-neutral-200)'}`,
                    boxShadow: '0 1px 3px rgba(12,35,64,.04)',
                  }}>
                    <span style={{ width: 26, flex: 'none', display: 'flex', justifyContent: 'center' }}>
                      {medal ? (
                        <MedalIcon type={medal} size={21} style={{ display: 'block' }} />
                      ) : r.is_hc ? (
                        <span style={{ fontSize: 9.5, fontWeight: 800, color: 'var(--color-neutral-500)' }}>{r.hc_type || 'HC'}</span>
                      ) : (
                        <span className="asw-num" style={{ fontSize: 13, fontWeight: 800, color: 'var(--color-neutral-500)' }}>
                          {r.original_rank || '–'}
                        </span>
                      )}
                    </span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 13.5, lineHeight: 1.25 }}>
                        {r.event_detail?.name || '—'}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                        <span style={{
                          fontSize: 10, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase',
                          padding: '1.5px 7px', borderRadius: 4,
                          background: (r.round_type === 'Finals' || !r.round_type) ? 'var(--color-accent-100)' : 'var(--color-neutral-200)',
                          color: (r.round_type === 'Finals' || !r.round_type) ? 'var(--color-accent)' : 'var(--color-neutral-600)',
                        }}>
                          {roundTag(r.round_type)}
                        </span>
                        {r.category && (
                          <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--color-neutral-500)' }}>{r.category}</span>
                        )}
                        {isBest && (
                          <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '0.06em', color: 'var(--asw-gold)', textTransform: 'uppercase' }}>
                            Top swim
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flex: 'none' }}>
                      <div className="asw-time" style={{ fontWeight: 800, fontSize: 15 }}>
                        {r.time_centiseconds > 0 ? r.formatted_time : (r.hc_type || '—')}
                      </div>
                      {r.fina_points ? (
                        <div className="asw-num" style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--color-neutral-500)', marginTop: 2 }}>
                          {r.fina_points} FINA
                        </div>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── footer ── */}
        <div style={{
          flex: 'none', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px',
          background: '#fff', borderTop: '1px solid var(--color-neutral-200)',
        }}>
          <span style={{ fontSize: 11.5, color: 'var(--color-neutral-500)', fontWeight: 600 }}>
            {sorted ? `${sorted.length} swim${sorted.length === 1 ? '' : 's'} at this meet` : ''}
          </span>
          <Link
            to={`/swimmers/${swimmer.id}`}
            className="btn btn-primary"
            style={{ marginLeft: 'auto', fontSize: 12.5 }}
          >
            Full profile ›
          </Link>
        </div>
      </div>
    </div>,
    document.body,
  )
}
