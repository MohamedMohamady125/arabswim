import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getRecords, createRecord } from '../api/records'
import { searchSwimmers } from '../api/swimmers'
import { getEvents } from '../api/core'
import Flag from '../components/Flag'
import { PageHead, Loading, Empty } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { formatDate, RECORD_TYPES, mediaUrl, parseTime } from '../utils'

const TYPE_LABEL = Object.fromEntries(RECORD_TYPES.map((t) => [t.value, t.label]))
const SCOPE_ORDER = ['NATIONAL', 'ARAB', 'GCC', 'AFRICAN', 'ASIAN', 'MEDITERRANEAN', 'ISLAMIC', 'WORLD']

const SCOPE_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'NATIONAL', label: 'National' },
  { value: 'ARAB', label: 'Arab' },
  { value: 'GCC', label: 'GCC' },
]

function AddRecordModal({ onClose, onCreated }) {
  const [events, setEvents] = useState([])
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [sel, setSel] = useState(null)
  const [form, setForm] = useState({
    event: '', record_type: 'NATIONAL', pool: 'LCM', time: '',
    result_date: '', meet_name: '', location: '', is_new: true,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getEvents().then((res) => setEvents(Array.isArray(res.data) ? res.data : res.data?.results || [])).catch(() => {})
  }, [])

  useEffect(() => {
    if (sel || q.trim().length < 2) { setResults([]); return }
    const t = setTimeout(() => {
      searchSwimmers(q.trim())
        .then((res) => setResults((Array.isArray(res.data) ? res.data : res.data?.results || []).slice(0, 8)))
        .catch(() => setResults([]))
    }, 250)
    return () => clearTimeout(t)
  }, [q, sel])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  const cs = parseTime(form.time.trim())
  const canSave = sel && form.event && form.record_type && cs != null && cs > 0 && form.result_date && !saving

  const submit = async (e) => {
    e.preventDefault()
    if (!canSave) return
    setSaving(true)
    setError('')
    try {
      await createRecord({
        swimmer: sel.id,
        event: Number(form.event),
        record_type: form.record_type,
        pool: form.pool,
        time_centiseconds: cs,
        result_date: form.result_date,
        meet_name: form.meet_name.trim(),
        location: form.location.trim(),
        is_new: form.is_new,
        ...(sel.nationality ? { country: sel.nationality } : {}),
      })
      onCreated()
    } catch (err) {
      const d = err?.response?.data
      setError(d ? (typeof d === 'string' ? d : Object.entries(d).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(' ') : v}`).join(' · ')) : 'Could not save the record')
      setSaving(false)
    }
  }

  const label = { display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }
  const input = { width: '100%', padding: '9px 10px', border: '1px solid var(--color-neutral-300)', background: 'var(--color-bg)', fontSize: 14, fontFamily: 'inherit' }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(8,24,44,0.6)', zIndex: 100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '6vh 16px', overflowY: 'auto' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <form onSubmit={submit} style={{ width: 520, maxWidth: '100%', background: 'var(--color-bg)', borderTop: '4px solid var(--color-accent)' }}>
        <div className="rule-b" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 24px' }}>
          <strong style={{ fontFamily: 'var(--font-heading)', fontSize: 17 }}>Add Record</strong>
          <button type="button" className="btn-ghost" onClick={onClose} aria-label="Close" style={{ fontSize: 20, lineHeight: 1, border: 'none', background: 'none', cursor: 'pointer' }}>×</button>
        </div>

        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* swimmer search */}
          <div style={{ position: 'relative' }}>
            <label style={label}>Swimmer</label>
            {sel ? (
              <div style={{ ...input, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Flag code={sel.nationality_detail?.code} name={sel.nationality_detail?.name} />
                <span style={{ fontWeight: 600, flex: 1 }}>{sel.name}</span>
                <button type="button" onClick={() => { setSel(null); setQ('') }} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 16 }} aria-label="Clear swimmer">×</button>
              </div>
            ) : (
              <>
                <input style={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search swimmer by name…" autoFocus />
                {results.length > 0 && (
                  <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', zIndex: 5, background: 'var(--color-bg)', border: '1px solid var(--color-neutral-300)', borderTop: 'none', maxHeight: 260, overflowY: 'auto' }}>
                    {results.map((s) => (
                      <button
                        key={s.id} type="button"
                        onClick={() => { setSel(s); setResults([]) }}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '9px 10px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 14 }}
                      >
                        <Flag code={s.nationality_detail?.code} name={s.nationality_detail?.name} />
                        <span style={{ fontWeight: 600, flex: 1 }}>{s.name}</span>
                        {s.birth_year && <span className="micro asw-num">{s.birth_year}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
            <div>
              <label style={label}>Event</label>
              <select style={input} value={form.event} onChange={set('event')}>
                <option value="">Select event…</option>
                {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
              </select>
            </div>
            <div>
              <label style={label}>Record scope</label>
              <select style={input} value={form.record_type} onChange={set('record_type')}>
                {RECORD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 16 }}>
            <div>
              <label style={label}>Pool</label>
              <select style={input} value={form.pool} onChange={set('pool')}>
                <option value="LCM">LCM (50m)</option>
                <option value="SCM">SCM (25m)</option>
              </select>
            </div>
            <div>
              <label style={label}>Time</label>
              <input style={input} className="asw-num" value={form.time} onChange={set('time')} placeholder="M:SS.hh" />
            </div>
            <div>
              <label style={label}>Date</label>
              <input style={input} className="asw-num" type="date" value={form.result_date} onChange={set('result_date')} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
            <div>
              <label style={label}>Meet name</label>
              <input style={input} value={form.meet_name} onChange={set('meet_name')} placeholder="e.g. Arab Championships" />
            </div>
            <div>
              <label style={label}>Location</label>
              <input style={input} value={form.location} onChange={set('location')} placeholder="City, Country" />
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.is_new} onChange={set('is_new')} />
            Mark as new record (shows on this page)
          </label>

          {form.time.trim() && !(cs > 0) && (
            <div className="micro" style={{ color: 'var(--color-accent)' }}>Time must look like 27.45 or 1:56.30</div>
          )}
          {error && <div style={{ fontSize: 13, color: 'var(--asw-slow)' }}>{error}</div>}
        </div>

        <div className="rule-t" style={{ padding: '14px 24px', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={!canSave}>{saving ? 'Saving…' : 'Save record'}</button>
        </div>
      </form>
    </div>
  )
}

export default function NewRecords() {
  const { isAdmin } = useAuth()
  const [records, setRecords] = useState([])
  const [scope, setScope] = useState('')
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    let alive = true
    setLoading(true)
    const params = { is_new: 'true' }
    if (scope) params.record_type = scope
    getRecords(params)
      .then((res) => {
        if (!alive) return
        const d = res.data
        setRecords(Array.isArray(d) ? d : d?.results || [])
      })
      .catch(() => { if (alive) setRecords([]) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [scope, refresh])

  const groups = useMemo(() => {
    const map = new Map()
    records.forEach((r) => {
      const key = r.record_type || 'OTHER'
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(r)
    })
    // Fixed scope order: national first, then regional and continental books
    return [...map.entries()].sort(([a], [b]) => {
      const ai = SCOPE_ORDER.indexOf(a)
      const bi = SCOPE_ORDER.indexOf(b)
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
    })
  }, [records])

  return (
    <div>
      <PageHead title="New Records" />

      {/* scope filter */}
      <div className="rule-b" style={{ padding: '14px 32px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <select className="select" style={{ width: 170 }} value={scope} onChange={(e) => setScope(e.target.value)}>
          {SCOPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label === 'All' ? 'All scopes' : o.label}</option>)}
        </select>
        {isAdmin && (
          <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={() => setAddOpen(true)}>
            + Add Record
          </button>
        )}
      </div>

      {addOpen && (
        <AddRecordModal
          onClose={() => setAddOpen(false)}
          onCreated={() => { setAddOpen(false); setRefresh((n) => n + 1) }}
        />
      )}

      {loading ? (
        <Loading label="Loading new records" />
      ) : records.length === 0 ? (
        <Empty label="No new records match this scope" />
      ) : (
        groups.map(([type, rows]) => (
          <div key={type} className="rule-b pad">
            <div className="sect-head">
              <h4 style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {TYPE_LABEL[type] || type} records
              </h4>
              <span className="micro asw-num">{rows.length} record{rows.length !== 1 ? 's' : ''}</span>
            </div>
            {/* National records are per-country books: sub-group them so each
                country's new records sit under their own flag heading */}
            {type === 'NATIONAL' ? (
              subGroupByCountry(rows).map(([country, sub]) => (
                <div key={country} style={{ marginBottom: 18 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '14px 0 10px' }}>
                    <Flag code={sub[0].swimmer_detail?.nationality_detail?.code} name={country} />
                    <strong style={{ fontFamily: 'var(--font-heading)', fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{country}</strong>
                    <span className="micro asw-num">{sub.length}</span>
                  </div>
                  <RecordCards rows={sub} />
                </div>
              ))
            ) : (
              <RecordCards rows={rows} />
            )}
          </div>
        ))
      )}
    </div>
  )
}

function subGroupByCountry(rows) {
  const map = new Map()
  rows.forEach((r) => {
    const key = r.swimmer_detail?.nationality_detail?.name || 'Other'
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(r)
  })
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
}

function RecordCards({ rows }) {
  return (
    <div className="record-cards">
      {rows.map((r) => (
                <div key={r.id}>
                  {r.swimmer_detail?.photo ? (
                    <img
                      src={mediaUrl(r.swimmer_detail.photo)}
                      alt={r.swimmer_detail?.name}
                      className="grayscale"
                      style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', objectPosition: 'center top', display: 'block', marginBottom: 10 }}
                    />
                  ) : (
                    <div
                      style={{
                        width: '100%', aspectRatio: '1 / 1', marginBottom: 10,
                        background: 'var(--color-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 30, color: 'var(--color-accent)',
                      }}
                    >
                      {(r.swimmer_detail?.name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('')}
                    </div>
                  )}
                  <div className="card-kicker" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span>{r.record_type} record</span>
                    {r.result_date && <span style={{ fontWeight: 600 }}>{formatDate(r.result_date)}</span>}
                    <span className="tag tag-accent-2" style={{ fontSize: 9, padding: '1px 6px' }}>{r.pool}</span>
                  </div>
                  <div className="asw-num rec-time" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 22, margin: '4px 0 2px' }}>
                    {r.formatted_time}
                  </div>
                  <div className="rec-event" style={{ fontSize: 13 }}>
                    {r.event_detail?.name} · {r.swimmer_detail?.sex === 'F' ? 'Women' : 'Men'}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                    <Flag code={r.swimmer_detail?.nationality_detail?.code} name={r.swimmer_detail?.nationality_detail?.name} />
                    {r.swimmer && !r.swimmer_detail?.is_relay_team ? (
                      <Link to={`/swimmers/${r.swimmer}`} className="rec-name" style={{ color: 'inherit', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
                        {r.swimmer_detail?.name}
                      </Link>
                    ) : (
                      <span className="rec-name" style={{ fontSize: 13, fontWeight: 600 }}>{r.swimmer_detail?.name}</span>
                    )}
                  </div>
                  <div className="rec-meta" style={{ fontSize: 12, color: 'var(--color-neutral-700)', marginTop: 6 }}>
                    {[r.meet_name, r.location].filter(Boolean).join(' · ')}
                    {r.result_date ? ` · ${formatDate(r.result_date)}` : ''}
                  </div>
        </div>
      ))}
    </div>
  )
}
