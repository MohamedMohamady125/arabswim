import { useEffect, useState } from 'react'
import { getSwimmerTransferHistory } from '../../api/swimmers'
import Flag from '../Flag'
import { Loading, Empty } from '../ui'
import { formatDate } from '../../utils'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function fmtMonthYear(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d)) return dateStr
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

export default function TransfersTab({ swimmerId }) {
  const [data, setData] = useState(undefined)

  useEffect(() => {
    let alive = true
    getSwimmerTransferHistory(swimmerId)
      .then((res) => { if (alive) setData(res.data) })
      .catch(() => { if (alive) setData(null) })
    return () => { alive = false }
  }, [swimmerId])

  if (data === undefined) return <Loading label="Loading transfer history" />
  if (data === null) return <Empty label="Failed to load transfer history" />

  const changes = (data.nationality_changes || []).filter((ch) => ch.from_country !== ch.to_country)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {/* Club history timeline */}
      <div>
        <div className="sect-head">
          <h4>Club history</h4>
          <span className="micro">Based on competition results</span>
        </div>
        {(data.clubs || []).length === 0 ? (
          <Empty label="No club history available" />
        ) : (
          <div className="rule-t">
            {data.clubs.map((club, i) => (
              <div key={i} className="hair-b" style={{ display: 'flex', gap: 16, padding: '14px 0', alignItems: 'flex-start' }}>
                <div style={{ width: 30, height: 30, flex: 'none', background: club.is_current ? 'var(--color-accent)' : 'var(--color-accent-800)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 14 }} className="asw-num">
                  {i + 1}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 16 }}>{club.club}</span>
                    {club.country_code && <Flag code={club.country_code} name={club.country} flagUrl={club.country_flag} />}
                    {club.is_national && <span className="tag tag-accent">National Team</span>}
                    {club.is_current && <span className="tag tag-dark">Current</span>}
                  </div>
                  <div className="asw-num" style={{ fontSize: 12, color: 'var(--color-neutral-700)', marginTop: 4 }}>
                    From <strong style={{ color: 'var(--color-text)' }}>{fmtMonthYear(club.first_meet)}</strong>{' '}
                    to{' '}
                    {club.is_current
                      ? <strong style={{ color: 'var(--asw-fast)' }}>now</strong>
                      : <strong style={{ color: 'var(--color-text)' }}>{fmtMonthYear(club.last_meet)}</strong>}
                  </div>
                </div>
                <div className="asw-num" style={{ textAlign: 'right', flex: 'none', fontSize: 12, color: 'var(--color-neutral-700)' }}>
                  <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 16, color: 'var(--color-text)' }}>{club.meets}</div>
                  <div>meet{club.meets !== 1 ? 's' : ''}</div>
                  <div>{club.results} result{club.results !== 1 ? 's' : ''}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Nationality meet counts */}
      {(data.nationality_meet_counts || []).length > 0 && (
        <div>
          <div className="sect-head"><h4>Nationality</h4></div>
          <div className="cellgrid" style={{ gridTemplateColumns: `repeat(${Math.min(2, data.nationality_meet_counts.length)}, 1fr)` }}>
            {data.nationality_meet_counts.map((n, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Flag code={n.country_code} name={n.country} flagUrl={n.country_flag} />
                <span style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>{n.country}</span>
                <span className="asw-num" style={{ textAlign: 'right' }}>
                  <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 18 }}>{n.meets}</span>
                  <span className="micro" style={{ marginLeft: 6 }}>meet{n.meets !== 1 ? 's' : ''}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Nationality changes */}
      {changes.length > 0 && (
        <div>
          <div className="sect-head"><h4>Nationality changes</h4></div>
          <div className="rule-t">
            {changes.map((ch, i) => (
              <div key={i} className="hair-b" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', flexWrap: 'wrap', fontSize: 13 }}>
                {ch.from_country && (
                  <>
                    <Flag code={ch.from_country_code} name={ch.from_country} flagUrl={ch.from_country_flag} />
                    <span>{ch.from_country}</span>
                    <span style={{ color: 'var(--color-neutral-600)' }}>→</span>
                  </>
                )}
                <Flag code={ch.to_country_code} name={ch.to_country} flagUrl={ch.to_country_flag} />
                <span>{ch.to_country}</span>
                <span className="asw-num" style={{ color: 'var(--color-neutral-700)' }}>{formatDate(ch.effective_date)}</span>
                {ch.notes && <span className="text-muted">({ch.notes})</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
