import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { getSwimmerTransferHistory, changeSwimmerNationality } from '../../api/swimmers'
import { getCountries } from '../../api/core'
import { useAuth } from '../../context/AuthContext'
import Flag from '../Flag'
import { Loading, Empty } from '../ui'
import { formatDate } from '../../utils'

function ChangeNationalityModal({ swimmerId, currentCountryId, onClose, onSaved }) {
  const [countries, setCountries] = useState([])
  const [country, setCountry] = useState('')
  const [fromCountry, setFromCountry] = useState(currentCountryId ? String(currentCountryId) : '')
  const [recordOnly, setRecordOnly] = useState(false)
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getCountries({ page_size: 500 })
      .then((res) => {
        const d = res.data
        setCountries(Array.isArray(d) ? d : d?.results || [])
      })
      .catch(() => setCountries([]))
  }, [])

  const submit = async (e) => {
    e.preventDefault()
    if (!country) { setError('Pick a country'); return }
    setSaving(true)
    setError('')
    try {
      await changeSwimmerNationality(swimmerId, {
        country,
        from_country: fromCountry || null,
        effective_date: date,
        notes,
        record_only: recordOnly,
      })
      onSaved()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to change nationality')
      setSaving(false)
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(20,24,31,0.55)', zIndex: 100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '6vh 16px', overflowY: 'auto' }}
      onClick={onClose}
    >
      <div
        style={{ background: 'var(--color-bg, #fff)', border: '2px solid var(--color-text)', width: '100%', maxWidth: 460 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="rule-b" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px' }}>
          <div className="kicker">Change nationality</div>
          <button className="btn btn-secondary btn-icon" onClick={onClose} aria-label="Close"><X size={14} /></button>
        </div>
        <form onSubmit={submit} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="field">
            <label>Old nationality</label>
            <select className="select" value={fromCountry} onChange={(e) => setFromCountry(e.target.value)}>
              <option value="">— none / unknown —</option>
              {countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>New nationality</label>
            <select className="select" value={country} onChange={(e) => setCountry(e.target.value)}>
              <option value="">— pick country —</option>
              {countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Effective date</label>
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={recordOnly} onChange={(e) => setRecordOnly(e.target.checked)} />
            Past change — record in history only, don't update current nationality
          </label>
          <div className="field">
            <label>Notes (optional)</label>
            <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. sports citizenship change" />
          </div>
          {error && <div style={{ color: 'var(--asw-slow)', fontSize: 13 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Change nationality'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function fmtMonthYear(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d)) return dateStr
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

export default function TransfersTab({ swimmerId, currentCountryId }) {
  const [data, setData] = useState(undefined)
  const [showChange, setShowChange] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const { isAdmin } = useAuth()

  useEffect(() => {
    let alive = true
    getSwimmerTransferHistory(swimmerId)
      .then((res) => { if (alive) setData(res.data) })
      .catch(() => { if (alive) setData(null) })
    return () => { alive = false }
  }, [swimmerId, reloadKey])

  if (data === undefined) return <Loading label="Loading transfer history" />
  if (data === null) return <Empty label="Failed to load transfer history" />

  const changes = (data.nationality_changes || []).filter((ch) => ch.from_country !== ch.to_country)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {/* Club history timeline */}
      <div>
        <div className="sect-head">
          <h4>Club History</h4>
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
      {((data.nationality_meet_counts || []).length > 0 || isAdmin) && (
        <div>
          <div className="sect-head">
            <h4>Nationality</h4>
            {isAdmin && (
              <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => setShowChange(true)}>
                Change nationality
              </button>
            )}
          </div>
          <div className="cellgrid" style={{ gridTemplateColumns: `repeat(${Math.max(1, Math.min(2, data.nationality_meet_counts.length))}, 1fr)` }}>
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
          <div className="sect-head"><h4>Nationality Changes</h4></div>
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

      {showChange && (
        <ChangeNationalityModal
          swimmerId={swimmerId}
          currentCountryId={currentCountryId}
          onClose={() => setShowChange(false)}
          onSaved={() => { setShowChange(false); setReloadKey((k) => k + 1) }}
        />
      )}
    </div>
  )
}
