import { useEffect, useMemo, useState } from 'react'
import {
  getQualifyingStandards, getQualifyingStandard,
  createQualifyingStandard, updateQualifyingStandard, deleteQualifyingStandard,
  uploadQualifyingPdf, addQualifyingTime, deleteQualifyingTime,
} from '../api/qualifyingTimes'
import { getEvents } from '../api/core'
import { PageHead, Loading, Empty, Seg, Modal } from '../components/ui'
import { formatDate, parseTime } from '../utils'
import { useAuth } from '../context/AuthContext'

const COMP_LABEL = {
  olympics: 'Olympic Games',
  world_championships: 'World Championships',
}

// Resolve any competition_type — including custom ones — to a display label
function compLabel(value) {
  if (!value) return 'Standard'
  return COMP_LABEL[value] || String(value).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

const STROKE_ORDER = { Freestyle: 0, Backstroke: 1, Breaststroke: 2, Butterfly: 3, 'Individual Medley': 4 }

const list = (d) => (Array.isArray(d) ? d : d?.results || [])

function StandardTables({ times, gender, pool, isAdmin, onDeleteTime }) {
  // event rows for the selection, cut categories (A/B/C…) as separate columns
  const { byStroke, cutKeys } = useMemo(() => {
    const map = new Map()
    const cuts = new Set()
    ;(times || [])
      .filter((t) => t.gender === gender && t.pool === pool)
      .forEach((t) => {
        if (!map.has(t.event)) {
          map.set(t.event, {
            event: t.event,
            name: t.event_name,
            stroke: t.event_stroke,
            distance: t.event_distance,
            cuts: {},
          })
        }
        map.get(t.event).cuts[t.cut || 'A'] = t.formatted_time
        cuts.add(t.cut || 'A')
      })
    const rows = [...map.values()].sort((a, b) => {
      const sa = STROKE_ORDER[a.stroke] ?? 99
      const sb = STROKE_ORDER[b.stroke] ?? 99
      if (sa !== sb) return sa - sb
      return (a.distance || 0) - (b.distance || 0)
    })
    const grouped = {}
    rows.forEach((r) => {
      const key = r.stroke || 'Events'
      if (!grouped[key]) grouped[key] = []
      grouped[key].push(r)
    })
    return { byStroke: grouped, cutKeys: [...cuts].sort() }
  }, [times, gender, pool])

  const strokes = Object.keys(byStroke)
  if (strokes.length === 0) {
    return <Empty label={`No times for ${gender === 'M' ? 'men' : 'women'} (${pool}) yet`} />
  }

  return (
    // side-by-side stroke tables use the page width instead of one long column
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '4px 28px' }}>
      {strokes.map((stroke) => (
        <div key={stroke} style={{ marginBottom: 18 }}>
          <div className="kicker" style={{ marginBottom: 8 }}>{stroke}</div>
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Event</th>
                  {cutKeys.map((c) => <th key={c} className="time">{c} standard</th>)}
                </tr>
              </thead>
              <tbody>
                {byStroke[stroke].map((r) => (
                  <tr key={r.event}>
                    <td style={{ fontWeight: 600 }}>{r.name}</td>
                    {cutKeys.map((c) => (
                      <td key={c} className="time asw-time">{r.cuts[c] || '—'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}

function StandardModal({ standard, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: standard?.name || '',
    competition_type: standard?.competition_type || '',
    year: standard?.year || new Date().getFullYear(),
    qualifying_period_start: standard?.qualifying_period_start || '',
    qualifying_period_end: standard?.qualifying_period_end || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const submit = async (e) => {
    e.preventDefault()
    if (!form.name) { setError('Name required'); return }
    setSaving(true)
    try {
      if (standard?.id) await updateQualifyingStandard(standard.id, form)
      else await createQualifyingStandard(form)
      onSaved()
    } catch (err) { setError(err.response?.data?.detail || 'Failed'); setSaving(false) }
  }
  return (
    <Modal title={standard?.id ? 'Edit Standard' : 'Create Standard'} onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {error && <div className="error-box">{error}</div>}
        <div className="field"><label>Name *</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="field"><label>Competition type</label><input className="input" value={form.competition_type} onChange={(e) => setForm({ ...form, competition_type: e.target.value })} placeholder="e.g. world_championships" /></div>
          <div className="field"><label>Year</label><input className="input" type="number" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} /></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="field"><label>Qualifying start</label><input className="input" type="date" value={form.qualifying_period_start} onChange={(e) => setForm({ ...form, qualifying_period_start: e.target.value })} /></div>
          <div className="field"><label>Qualifying end</label><input className="input" type="date" value={form.qualifying_period_end} onChange={(e) => setForm({ ...form, qualifying_period_end: e.target.value })} /></div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  )
}

function AddTimeModal({ standardId, onClose, onSaved }) {
  const [events, setEvents] = useState([])
  const [form, setForm] = useState({ event: '', gender: 'M', pool: 'LCM', cut: 'A', time: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { getEvents().then((r) => setEvents(Array.isArray(r.data) ? r.data : r.data?.results || [])).catch(() => {}) }, [])
  const submit = async (e) => {
    e.preventDefault()
    if (!form.event || !form.time) { setError('Event and time required'); return }
    const cs = parseTime(form.time)
    if (!cs) { setError('Invalid time format'); return }
    setSaving(true)
    try {
      await addQualifyingTime(standardId, { event: form.event, gender: form.gender, pool: form.pool, cut: form.cut, time_centiseconds: cs })
      onSaved()
    } catch (err) { setError(err.response?.data?.detail || err.response?.data?.error || 'Failed'); setSaving(false) }
  }
  return (
    <Modal title="Add Qualifying Time" onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {error && <div className="error-box">{error}</div>}
        <div className="field"><label>Event *</label>
          <select className="select" value={form.event} onChange={(e) => setForm({ ...form, event: e.target.value })}>
            <option value="">Select event…</option>
            {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
          <div className="field"><label>Gender</label>
            <select className="select" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
              <option value="M">Men</option><option value="F">Women</option>
            </select>
          </div>
          <div className="field"><label>Pool</label>
            <select className="select" value={form.pool} onChange={(e) => setForm({ ...form, pool: e.target.value })}>
              <option value="LCM">LCM</option><option value="SCM">SCM</option>
            </select>
          </div>
          <div className="field"><label>Cut</label><input className="input" value={form.cut} onChange={(e) => setForm({ ...form, cut: e.target.value })} placeholder="A" /></div>
          <div className="field"><label>Time *</label><input className="input asw-num" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} placeholder="27.45" /></div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Add time'}</button>
        </div>
      </form>
    </Modal>
  )
}

export default function QualifyingTimes() {
  const [standards, setStandards] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [gender, setGender] = useState('M')
  const [pool, setPool] = useState('LCM')
  const { isAdmin } = useAuth()
  const [loading, setLoading] = useState(true)
  const [editModal, setEditModal] = useState(null) // null=closed, {}=create, standard=edit
  const [addTimeModal, setAddTimeModal] = useState(false)
  const [uploadFile, setUploadFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  // Load the complete standards list (follow pagination if present)
  useEffect(() => {
    let alive = true
    async function load() {
      try {
        const all = []
        let page = 1
        // guard against runaway loops
        for (let i = 0; i < 20; i++) {
          const res = await getQualifyingStandards(page > 1 ? { page } : undefined)
          const d = res.data
          all.push(...list(d))
          if (d?.next) page += 1
          else break
        }
        if (!alive) return
        setStandards(all)
        if (all.length > 0) setSelectedId(all[0].id)
      } catch {
        if (alive) setStandards([])
      } finally {
        if (alive) setLoading(false)
      }
    }
    load()
    return () => { alive = false }
  }, [reloadKey])

  // Fetch the selected standard's times
  useEffect(() => {
    if (!selectedId) { setDetail(null); return }
    let alive = true
    setDetailLoading(true)
    getQualifyingStandard(selectedId)
      .then((res) => alive && setDetail(res.data))
      .catch(() => alive && setDetail(null))
      .finally(() => alive && setDetailLoading(false))
    return () => { alive = false }
  }, [selectedId, reloadKey])

  if (loading) return <Loading label="Loading qualifying standards" />

  return (
    <div>
      <PageHead title="Qualifying Times">
        {isAdmin && (
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn btn-primary" onClick={() => setEditModal({})}>Create standard</button>
          </div>
        )}
      </PageHead>

      {standards.length === 0 ? (
        <Empty label="No qualifying standards published" />
      ) : (
        <>
          {/* Competition selector — big and prominent */}
          <div className="rule-b" style={{ padding: '20px 32px' }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
              {standards.map((s) => {
                const active = s.id === selectedId
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelectedId(s.id)}
                    style={{
                      cursor: 'pointer',
                      fontFamily: 'var(--font-heading)', fontWeight: 800,
                      fontSize: active ? 22 : 15,
                      padding: 0, lineHeight: 1.2,
                      background: 'none', border: 'none',
                      color: active ? 'var(--color-accent-800)' : 'var(--color-neutral-500)',
                      borderBottom: active ? '3px solid var(--asw-gold)' : '3px solid transparent',
                      paddingBottom: 4,
                      transition: 'font-size 0.15s ease, color 0.15s ease',
                    }}
                  >
                    {s.name}
                  </button>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Seg
                options={[{ value: 'M', label: 'Men' }, { value: 'F', label: 'Women' }]}
                value={gender}
                onChange={setGender}
              />
              <Seg
                options={[{ value: 'LCM', label: 'LCM' }, { value: 'SCM', label: 'SCM' }]}
                value={pool}
                onChange={setPool}
              />
            </div>
          </div>

          {detailLoading ? (
            <Loading label="Loading standard" />
          ) : !detail ? (
            <Empty label="Standard unavailable" />
          ) : (
            <div style={{ padding: '18px 32px 28px' }}>
              {/* the selected tab already names the standard — only show
                  what it doesn't: competition type + qualifying period */}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
                <span className="kicker">{compLabel(detail.competition_type)}{detail.year ? ` · ${detail.year}` : ''}</span>
                {detail.qualifying_period_start && detail.qualifying_period_end && (
                  <span className="micro" style={{ marginLeft: 'auto' }}>
                    Qualifying period: {formatDate(detail.qualifying_period_start)} — {formatDate(detail.qualifying_period_end)}
                  </span>
                )}
              </div>
              {isAdmin && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                  <button className="btn btn-secondary" onClick={() => setEditModal(detail)}>Edit standard</button>
                  <button className="btn btn-secondary" onClick={() => setAddTimeModal(true)}>Add time</button>
                  <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>
                    Upload PDF
                    <input type="file" accept=".pdf" style={{ display: 'none' }} onChange={async (e) => {
                      const f = e.target.files?.[0]
                      if (!f) return
                      setUploading(true)
                      try {
                        const fd = new FormData(); fd.append('file', f)
                        await uploadQualifyingPdf(selectedId, fd)
                        setReloadKey((k) => k + 1)
                      } catch { window.alert('Upload failed') }
                      setUploading(false)
                      e.target.value = ''
                    }} />
                  </label>
                  {uploading && <span className="micro" style={{ alignSelf: 'center' }}>Uploading…</span>}
                  <button className="btn" style={{ borderColor: 'var(--asw-slow)', color: 'var(--asw-slow)', marginLeft: 'auto' }}
                    onClick={async () => {
                      if (!window.confirm(`Delete "${detail.name}"? All qualifying times in it will be removed.`)) return
                      await deleteQualifyingStandard(selectedId)
                      setSelectedId(null)
                      setReloadKey((k) => k + 1)
                    }}>Delete standard</button>
                </div>
              )}
              <StandardTables times={detail.times || []} gender={gender} pool={pool} isAdmin={isAdmin}
                onDeleteTime={async (timeId) => {
                  await deleteQualifyingTime(selectedId, timeId)
                  setReloadKey((k) => k + 1)
                }} />
            </div>
          )}
        </>
      )}

      {editModal !== null && (
        <StandardModal standard={editModal.id ? editModal : null} onClose={() => setEditModal(null)}
          onSaved={() => { setEditModal(null); setReloadKey((k) => k + 1) }} />
      )}
      {addTimeModal && selectedId && (
        <AddTimeModal standardId={selectedId} onClose={() => setAddTimeModal(false)}
          onSaved={() => { setAddTimeModal(false); setReloadKey((k) => k + 1) }} />
      )}
    </div>
  )
}
