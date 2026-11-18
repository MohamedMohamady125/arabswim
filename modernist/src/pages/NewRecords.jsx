import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getRecords, createRecord, deleteRecord, importRecordsExcel, getRecordsImportTemplate } from '../api/records'
import { searchSwimmers } from '../api/swimmers'
import { getEvents, getCountries } from '../api/core'
import Flag from '../components/Flag'
import { PageHead, Loading, Empty, Seg, FilterBar, notify } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { formatDate, RECORD_TYPES, mediaUrl, parseTime, recordEventLabel } from '../utils'
import Pic from '../components/Pic'

const TYPE_LABEL = Object.fromEntries(RECORD_TYPES.map((t) => [t.value, t.label]))
const SCOPE_ORDER = ['NATIONAL', 'ARAB', 'GCC', 'AFRICAN', 'ASIAN', 'MEDITERRANEAN', 'ISLAMIC', 'WORLD']

const AGE_CATEGORIES = ['OPEN', 'U10', 'U11', 'U12', 'U13', 'U14', 'U15', 'U16', 'U17', 'U18']
const ageCategoryLabel = (v) => (!v || v === 'OPEN' ? 'Open' : v)

const SCOPE_OPTIONS = [
  { value: 'NATIONAL', label: 'National' },
  { value: 'ARAB', label: 'Arab' },
  { value: 'GCC', label: 'GCC' },
]
// cards fetched per step; older API builds answer with 25 regardless, so the
// page always trusts `count` and `next` from the response, never this number
const PAGE_SIZE = 60

function AddRecordModal({ onClose, onCreated }) {
  const [events, setEvents] = useState([])
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [sel, setSel] = useState(null)
  const [form, setForm] = useState({
    event: '', record_type: 'NATIONAL', age_category: 'OPEN', pool: 'LCM', time: '',
    result_date: '', meet_name: '', location: '', is_new: true, country: '',
  })
  const [countries, setCountries] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Jakob's Law: Escape closes a dialog
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    getEvents().then((res) => setEvents(Array.isArray(res.data) ? res.data : res.data?.results || [])).catch(() => {})
    getCountries().then((res) => setCountries(Array.isArray(res.data) ? res.data : res.data?.results || [])).catch(() => {})
  }, [])

  // A national record belongs to one federation's book. Tesler's Law: the
  // swimmer's own country is filled in, and can be changed.
  const isNational = form.record_type === 'NATIONAL'
  const pickSwimmer = (s) => {
    setSel(s)
    setResults([])
    setForm((f) => (f.country || !s.nationality ? f : { ...f, country: String(s.nationality) }))
  }

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
  const canSave = sel && form.event && form.record_type && cs != null && cs > 0 && form.result_date && (!isNational || form.country) && !saving

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
        age_category: form.age_category,
        pool: form.pool,
        time_centiseconds: cs,
        result_date: form.result_date,
        meet_name: form.meet_name.trim(),
        location: form.location.trim(),
        is_new: form.is_new,
        // national: the country chosen in the form; other scopes: the swimmer's own
        ...(isNational ? { country: Number(form.country) } : sel.nationality ? { country: sel.nationality } : {}),
      })
      onCreated()
    } catch (err) {
      const d = err?.response?.data
      setError(d ? (typeof d === 'string' ? d : Object.entries(d).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(' ') : v}`).join(' · ')) : 'Could not save the record')
      setSaving(false)
    }
  }

  const label = { display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }
  const input = { width: '100%', padding: '8px 10px', border: '1px solid var(--color-neutral-300)', background: 'var(--color-bg)', fontSize: 14, fontFamily: 'inherit' }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(8,24,44,0.6)', zIndex: 100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '6vh 16px', overflowY: 'auto' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <form onSubmit={submit} role="dialog" aria-modal="true" aria-label="Add record" style={{ width: 520, maxWidth: '100%', background: 'var(--color-bg)', borderTop: '4px solid var(--color-box-top)' }}>
        <div className="rule-b" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px' }}>
          <strong style={{ fontFamily: 'var(--font-heading)', fontSize: 16 }}>Add Record</strong>
          <button type="button" className="btn-ghost" onClick={onClose} aria-label="Close" title="Close" style={{ fontSize: 20, lineHeight: 1, border: 'none', background: 'none', cursor: 'pointer', minWidth: 36, minHeight: 36 }}>×</button>
        </div>

        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* swimmer search */}
          <div style={{ position: 'relative' }}>
            <label style={label}>Swimmer</label>
            {sel ? (
              <div style={{ ...input, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Flag code={sel.nationality_detail?.code} name={sel.nationality_detail?.name} />
                <span style={{ fontWeight: 600, flex: 1 }}>{sel.name}</span>
                <button type="button" onClick={() => { setSel(null); setQ(''); setForm((f) => ({ ...f, country: '' })) }} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 16, minWidth: 32, minHeight: 32, margin: '-6px -6px -6px 0' }} aria-label="Clear swimmer" title="Clear swimmer">×</button>
              </div>
            ) : (
              <>
                <input type="search" aria-label="Swimmer" style={{ ...input, appearance: 'none', WebkitAppearance: 'none' }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search swimmer by name…" autoFocus />
                {results.length > 0 && (
                  <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', zIndex: 5, background: 'var(--color-bg)', border: '1px solid var(--color-neutral-300)', borderTop: 'none', maxHeight: 260, overflowY: 'auto' }}>
                    {results.map((s) => (
                      <button
                        key={s.id} type="button"
                        onClick={() => pickSwimmer(s)}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 10px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 14 }}
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
              <select aria-label="Event" style={input} value={form.event} onChange={set('event')}>
                <option value="">Select event…</option>
                {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
              </select>
            </div>
            <div>
              <label style={label}>Record scope</label>
              <select aria-label="Record scope" style={input} value={form.record_type} onChange={set('record_type')}>
                {RECORD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            {isNational && (
              <div>
                <label style={label}>Country</label>
                <select aria-label="Country of the national record" style={input} value={form.country} onChange={set('country')}>
                  <option value="">Select country…</option>
                  {countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}
            <div>
              <label style={label}>Pool</label>
              <select aria-label="Pool" style={input} value={form.pool} onChange={set('pool')}>
                <option value="LCM">LCM (50m)</option>
                <option value="SCM">SCM (25m)</option>
              </select>
            </div>
            <div>
              <label style={label}>Age category</label>
              <select aria-label="Age category" style={input} value={form.age_category} onChange={set('age_category')}>
                {AGE_CATEGORIES.map((a) => <option key={a} value={a}>{ageCategoryLabel(a)}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 16 }}>
            <div>
              <label style={label}>Time</label>
              <input aria-label="Time" style={input} className="asw-num" value={form.time} onChange={set('time')} placeholder="M:SS.hh" />
            </div>
            <div>
              <label style={label}>Date</label>
              <input aria-label="Date" style={input} className="asw-num" type="date" value={form.result_date} onChange={set('result_date')} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
            <div>
              <label style={label}>Meet name</label>
              <input aria-label="Meet name" style={input} value={form.meet_name} onChange={set('meet_name')} placeholder="e.g. Arab Championships" />
            </div>
            <div>
              <label style={label}>Location</label>
              <input aria-label="Location" style={input} value={form.location} onChange={set('location')} placeholder="City, Country" />
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.is_new} onChange={set('is_new')} />
            Mark as new record (shows on this page)
          </label>

          {form.time.trim() && !(cs > 0) && (
            <div className="micro" style={{ color: 'var(--color-accent)' }}>Time must look like 27.45 or 1:56.30</div>
          )}
          {error && <div role="alert" style={{ fontSize: 13, color: 'var(--asw-slow)' }}>{error}</div>}
        </div>

        <div className="rule-t" style={{ padding: '16px 24px', display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          {/* Paradox of the Active User: a greyed-out Save says what is still missing */}
          {!canSave && !saving && (
            <span className="micro" style={{ marginRight: 'auto', alignSelf: 'center' }}>
              Still needed: {[!sel && 'swimmer', !form.event && 'event', isNational && !form.country && 'country', !(cs > 0) && 'time', !form.result_date && 'date'].filter(Boolean).join(', ')}
            </span>
          )}
          <button type="submit" className="btn btn-primary" disabled={!canSave}>{saving ? 'Saving…' : 'Save record'}</button>
        </div>
      </form>
    </div>
  )
}

/* Excel import: records-only sheets (no results) — pick the file, every
   valid row becomes a record, broken rows come back listed with their row
   number and reason. */
function ImportRecordsModal({ onClose, onImported }) {
  const [file, setFile] = useState(null)
  const [scope, setScope] = useState('')
  const [country, setCountry] = useState('')
  const [countries, setCountries] = useState([])
  useEffect(() => {
    getCountries().then((res) => setCountries(Array.isArray(res.data) ? res.data : res.data?.results || [])).catch(() => {})
  }, [])
  const needCountry = scope === 'NATIONAL' && !country
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const downloadTemplate = async () => {
    try {
      const r = await getRecordsImportTemplate()
      const url = URL.createObjectURL(r.data)
      const a = document.createElement('a')
      a.href = url
      a.download = 'records-import-template.xlsx'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setError('Could not download the template')
    }
  }

  const upload = async () => {
    if (!file || busy || needCountry) return
    setBusy(true)
    setError('')
    try {
      const r = await importRecordsExcel(file, { scope, country })
      setResult(r.data)
      if (r.data.created > 0) onImported()
    } catch (err) {
      const d = err?.response?.data
      setError(d?.error || 'Import failed — check the file and try again')
    } finally {
      setBusy(false)
    }
  }

  const label = { display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(8,24,44,0.6)', zIndex: 100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '6vh 16px', overflowY: 'auto' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div role="dialog" aria-modal="true" aria-label="Import records from Excel" style={{ width: 560, maxWidth: '100%', background: 'var(--color-bg)', borderTop: '4px solid var(--color-box-top)' }}>
        <div className="rule-b" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px' }}>
          <strong style={{ fontFamily: 'var(--font-heading)', fontSize: 16 }}>Import Records from Excel</strong>
          <button type="button" onClick={onClose} aria-label="Close" title="Close" style={{ fontSize: 20, lineHeight: 1, border: 'none', background: 'none', cursor: 'pointer', minWidth: 36, minHeight: 36 }}>×</button>
        </div>

        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--color-neutral-700)' }}>
            One row per record. Required columns: <strong>Swimmer</strong> (exact name as on the site),{' '}
            <strong>Event</strong> (e.g. 50 M Freestyle or 50 Free), <strong>Time</strong> (27.45 or 1:56.30),{' '}
            <strong>Scope</strong> (National / Arab / GCC…), <strong>Date</strong>.
            Optional: Pool (LCM/SCM), Age Category (Open/U17…), Meet, Location, Country (for a national record, the country whose book it goes in; left empty, the swimmer's own country is used).
            Imported records are marked new, so they show on this page right away.
          </div>
          <button type="button" className="btn btn-secondary" style={{ alignSelf: 'flex-start', fontSize: 12 }} onClick={downloadTemplate}>
            ⬇ Download Excel template
          </button>

          {/* Tesler's Law: pick the scope once here instead of typing it on every row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            <div>
              <label style={label}>Record scope</label>
              <select className="select" aria-label="Record scope for this file" style={{ width: '100%' }} value={scope} onChange={(e) => { setScope(e.target.value); setResult(null) }}>
                <option value="">As written in the sheet</option>
                {RECORD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            {scope === 'NATIONAL' && (
              <div>
                <label style={label}>Country</label>
                <select className="select" aria-label="Country these national records belong to" style={{ width: '100%' }} value={country} onChange={(e) => { setCountry(e.target.value); setResult(null) }}>
                  <option value="">Select country…</option>
                  {countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}
          </div>
          {scope && (
            <div style={{ fontSize: 12, color: 'var(--color-neutral-700)', marginTop: -8 }}>
              {scope === 'NATIONAL'
                ? 'Every row in the file is saved as a national record of the country you choose.'
                : 'Every row in the file is saved with this scope; the Scope column is not needed.'}
            </div>
          )}

          <div>
            <label style={label}>Excel file (.xlsx)</label>
            <input
              type="file"
              aria-label="Excel file (.xlsx)"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => { setFile(e.target.files?.[0] || null); setResult(null); setError('') }}
            />
          </div>

          {result && (
            <div role="status" style={{ border: '1px solid var(--color-divider)', padding: '12px 16px', fontSize: 13 }}>
              <div style={{ fontWeight: 800, color: result.created > 0 ? 'var(--asw-fast)' : 'var(--color-text)' }}>
                {result.created} record{result.created !== 1 ? 's' : ''} imported
                {result.duplicates > 0 && ` · ${result.duplicates} duplicate${result.duplicates !== 1 ? 's' : ''} skipped`}
              </div>
              {result.errors?.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontWeight: 700, color: 'var(--asw-slow)', marginBottom: 4 }}>
                    {result.errors.length} row{result.errors.length !== 1 ? 's' : ''} need fixing:
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {result.errors.map((e, i) => (
                      <li key={i}>Row {e.row}: {e.error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          {error && <div role="alert" style={{ fontSize: 13, color: 'var(--asw-slow)' }}>{error}</div>}
        </div>

        <div className="rule-t" style={{ padding: '16px 24px', display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>{result ? 'Done' : 'Cancel'}</button>
          {needCountry && <span className="micro" style={{ marginRight: 'auto', alignSelf: 'center' }}>Still needed: country</span>}
          <button type="button" className="btn btn-primary" disabled={!file || busy || needCountry} onClick={upload}>
            {busy ? 'Importing…' : 'Import records'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function NewRecords() {
  const { isAdmin } = useAuth()
  const [records, setRecords] = useState([])
  const [scope, setScope] = useState('NATIONAL')
  const [country, setCountry] = useState('')
  const [countries, setCountries] = useState([])
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [pageNo, setPageNo] = useState(1)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const [saved, setSaved] = useState(false) // Peak-End Rule: confirm the save

  useEffect(() => {
    if (!saved) return
    const t = setTimeout(() => setSaved(false), 5000)
    return () => clearTimeout(t)
  }, [saved])

  // National books are per country: the country list narrows them to one federation
  useEffect(() => {
    getCountries({ has_swimmers: true })
      .then((res) => {
        const all = Array.isArray(res.data) ? res.data : res.data?.results || []
        setCountries(all.filter((c) => c.region === 'ARAB' || c.region === 'GCC'))
      })
      .catch(() => setCountries([]))
  }, [])

  const isNational = scope === 'NATIONAL'
  const fetchPage = (page) => {
    const params = { is_new: 'true', page, page_size: PAGE_SIZE }
    if (scope) params.record_type = scope
    // country by country, newest first inside each — so "Show more" appends
    // whole federations instead of reshuffling the groups already on screen
    if (isNational) params.ordering = 'country__name,-result_date,-id'
    if (isNational && country) params.country = country
    return getRecords(params).then((res) => {
      const d = res.data
      const rows = Array.isArray(d) ? d : d?.results || []
      return { rows, total: Array.isArray(d) ? rows.length : d?.count ?? rows.length, more: !Array.isArray(d) && !!d?.next }
    })
  }

  useEffect(() => {
    let alive = true
    setLoading(true)
    fetchPage(1)
      .then((r) => {
        if (!alive) return
        setRecords(r.rows); setTotal(r.total); setHasMore(r.more); setPageNo(1)
      })
      .catch(() => { if (alive) { setRecords([]); setTotal(0); setHasMore(false) } })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, country, refresh])

  const removeRecord = (r) => {
    if (!window.confirm(`Remove this record?\n\n${r.swimmer_detail?.name || ''} · ${r.event_detail?.name || ''} · ${r.formatted_time}\n\nIt will disappear from New Records and from the record books.`)) return
    deleteRecord(r.id)
      .then(() => { notify('Record removed'); setRefresh((n) => n + 1) })
      .catch(() => notify('Could not remove the record', 'error'))
  }

  const loadMore = () => {
    if (loadingMore) return
    setLoadingMore(true)
    fetchPage(pageNo + 1)
      .then((r) => {
        setRecords((cur) => {
          const seen = new Set(cur.map((x) => x.id))
          return cur.concat(r.rows.filter((x) => !seen.has(x.id)))
        })
        setTotal(r.total); setHasMore(r.more); setPageNo((n) => n + 1)
      })
      .catch(() => setHasMore(false))
      .finally(() => setLoadingMore(false))
  }

  // the country filter also applies to rows already loaded (older API builds ignore ?country=)
  const shown = useMemo(() => (
    isNational && country ? records.filter((r) => String(r.country ?? r.swimmer_detail?.nationality ?? '') === String(country)) : records
  ), [records, isNational, country])
  const allLoaded = !hasMore
  const shownTotal = allLoaded ? shown.length : total

  const groups = useMemo(() => {
    const map = new Map()
    shown.forEach((r) => {
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
  }, [shown])

  return (
    <div>
      <PageHead title="New Records" sub="National, Arab and GCC records broken at the most recent meets.">
        {/* admin actions sit with the page title, away from the public filters (Common Region) */}
        {isAdmin && (
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-primary" onClick={() => setAddOpen(true)}>
              + Add Record
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setImportOpen(true)}>
              ⬆ Import Excel
            </button>
          </div>
        )}
      </PageHead>

      {/* Hick's Law + Fitts's Law: three books, all visible, one tap each */}
      <FilterBar
        count={loading ? null : shownTotal}
        noun={shownTotal === 1 ? 'new record' : 'new records'}
        active={scope !== 'NATIONAL' || !!country}
        onClear={() => { setScope('NATIONAL'); setCountry('') }}
      >
        <div className="records-filters results-filters" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <Seg options={SCOPE_OPTIONS} value={scope} onChange={(v) => { setScope(v); if (v !== 'NATIONAL') setCountry('') }} />
          {isNational && (
            <select className="select" aria-label="Country" style={{ flex: '1 1 150px', width: 'auto', minWidth: 0, maxWidth: 220 }} value={country} onChange={(e) => setCountry(e.target.value)}>
              <option value="">All countries</option>
              {countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
        </div>
      </FilterBar>

      {addOpen && (
        <AddRecordModal
          onClose={() => setAddOpen(false)}
          onCreated={() => { setAddOpen(false); setSaved(true); setRefresh((n) => n + 1) }}
        />
      )}
      {saved && (
        <div role="status" className="rule-b" style={{ padding: '10px 32px', fontSize: 13, fontWeight: 700, color: 'var(--asw-fast)' }}>
          Record saved. It appears under its own scope below.
        </div>
      )}
      {importOpen && (
        <ImportRecordsModal
          onClose={() => setImportOpen(false)}
          onImported={() => setRefresh((n) => n + 1)}
        />
      )}

      {loading ? (
        <Loading label="Loading new records" />
      ) : shown.length === 0 ? (
        <Empty
          label={country ? `No new national records for ${countries.find((c) => String(c.id) === String(country))?.name || 'this country'}` : `No new ${TYPE_LABEL[scope] || ''} records right now`}
          hint={country ? 'Pick another country, or see every federation.' : 'Records appear here as soon as one is broken at a meet.'}
        >
          {country
            ? <button type="button" className="btn btn-secondary" onClick={() => setCountry('')}>All countries</button>
            : <Link to="/records" className="btn btn-secondary">Open the record books</Link>}
        </Empty>
      ) : (
        <>
        {groups.map(([type, rows]) => (
          <div key={type} className="rule-b pad">
            <div className="sect-head">
              <h4 style={{ textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {TYPE_LABEL[type] || type} records
              </h4>
              {/* Working Memory: say how much of the list is on screen */}
              <span className="micro asw-num">
                {allLoaded ? `${rows.length} record${rows.length !== 1 ? 's' : ''}` : `Showing ${rows.length} of ${total.toLocaleString('en-US')}`}
              </span>
            </div>
            {/* National records are per-country books: sub-group them so each
                country's new records sit under their own flag heading */}
            {type === 'NATIONAL' ? (
              subGroupByCountry(rows).map(([countryName, sub], gi, arr) => (
                <div key={countryName} style={{ marginBottom: 18 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '14px 0 10px' }}>
                    <Flag code={(sub[0].country_detail || sub[0].swimmer_detail?.nationality_detail)?.code} name={countryName} />
                    <strong style={{ fontFamily: 'var(--font-heading)', fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{countryName}</strong>
                    {/* the last federation may still be loading — no count until it is whole */}
                    {(allLoaded || gi < arr.length - 1) && <span className="micro asw-num">{sub.length}</span>}
                  </div>
                  <RecordCards rows={sub} onRemove={isAdmin ? removeRecord : null} />
                </div>
              ))
            ) : (
              <RecordCards rows={rows} onRemove={isAdmin ? removeRecord : null} />
            )}
          </div>
        ))}
        {/* Goal-Gradient: how far through the list, and one large target to go on */}
        {hasMore && (
          <div className="results-more">
            <span className="asw-num">Showing {records.length.toLocaleString('en-US')} of {total.toLocaleString('en-US')} new records</span>
            <div className="results-more-track" aria-hidden="true"><span style={{ width: `${Math.min(100, (records.length / Math.max(total, 1)) * 100)}%` }} /></div>
            <button type="button" className="btn btn-secondary" style={{ minWidth: 200 }} disabled={loadingMore} onClick={loadMore}>
              {loadingMore ? 'Loading…' : 'Show more records'}
            </button>
          </div>
        )}
        </>
      )}
    </div>
  )
}

function subGroupByCountry(rows) {
  const map = new Map()
  rows.forEach((r) => {
    // the record's own book (a national record belongs to a federation), then the swimmer's flag
    const key = r.country_detail?.name || r.swimmer_detail?.nationality_detail?.name || 'Other'
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(r)
  })
  // alphabetical, records without a federation last
  return [...map.entries()].sort(([a], [b]) => (a === 'Other') - (b === 'Other') || a.localeCompare(b))
}

function RecordCards({ rows, onRemove }) {
  return (
    <div className="record-cards">
      {rows.map((r) => (
                <div key={r.id}>
                  {r.swimmer_detail?.photo ? (
                    <Pic kind="person" w={256}
                      src={r.swimmer_detail.photo}
                      alt={r.swimmer_detail?.name}
                      className="grayscale"
                      style={{ width: '100%', aspectRatio: '1 / 1', marginBottom: 10 }}
                    />
                  ) : (
                    <div
                      style={{
                        width: '100%', aspectRatio: '1 / 1', marginBottom: 10,
                        background: 'var(--color-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 32, color: 'var(--color-accent)',
                      }}
                    >
                      {(r.swimmer_detail?.name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('')}
                    </div>
                  )}
                  {/* 1 — scope + age category (Open / under-age) */}
                  <div className="card-kicker" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    {/* each separator travels with the item after it, so a wrapped line never ends on a dot */}
                    <span style={{ whiteSpace: 'nowrap' }}>{TYPE_LABEL[r.record_type] || r.record_type} record</span>
                    <span style={{ whiteSpace: 'nowrap' }}><span style={{ opacity: 0.5 }}>· </span>{ageCategoryLabel(r.age_category)}</span>
                    <span style={{ whiteSpace: 'nowrap' }}><span style={{ opacity: 0.5 }}>· </span>{r.swimmer_detail?.sex === 'F' ? 'Women' : 'Men'}</span>
                  </div>
                  {/* 2 — the swim, always "100 M Freestyle | LCM" */}
                  <div className="rec-event" style={{ fontSize: 13, fontWeight: 600, marginTop: 4 }}>
                    {recordEventLabel(r.event_detail?.name, r.pool)}
                  </div>
                  {/* 3 — the time */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '6px 0 2px' }}>
                    <span className="asw-num rec-time" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24 }}>
                      {r.formatted_time}
                    </span>
                  </div>
                  {/* 4 — swimmer name + flag */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                    <Flag code={r.swimmer_detail?.nationality_detail?.code} name={r.swimmer_detail?.nationality_detail?.name} />
                    {r.swimmer && !r.swimmer_detail?.is_relay_team ? (
                      <Link to={`/swimmers/${r.swimmer}`} className="rec-name" style={{ padding: '8px 0', margin: '-7px 0' /* Fitts's Law: taller hit area, same card height */, color: 'inherit', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
                        {r.swimmer_detail?.name}
                      </Link>
                    ) : (
                      <span className="rec-name" style={{ fontSize: 13, fontWeight: 600 }}>{r.swimmer_detail?.name}</span>
                    )}
                  </div>
                  {/* 5 — meet name */}
                  {(r.meet_name || r.location) && (
                    <div className="rec-meta" style={{ fontSize: 12, color: 'var(--color-neutral-700)', marginTop: 6 }}>
                      {[r.meet_name, r.location].filter(Boolean).join(' · ')}
                    </div>
                  )}
                  {/* 6 — date of meet */}
                  {r.result_date && (
                    <div className="rec-meta" style={{ fontSize: 12, color: 'var(--color-neutral-700)', marginTop: 2 }}>
                      {formatDate(r.result_date)}
                    </div>
                  )}
                  {/* hand-entered records have no meet behind them, so this is the only place to take one back */}
                  {onRemove && r.source && r.source !== 'AUTO' && (
                    <button type="button" className="btn btn-ghost" style={{ marginTop: 8, fontSize: 12, color: 'var(--asw-slow)' }} onClick={() => onRemove(r)}>
                      Remove record
                    </button>
                  )}
        </div>
      ))}
    </div>
  )
}
