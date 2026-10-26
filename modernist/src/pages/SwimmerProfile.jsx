import { useEffect, useMemo, useState, useRef, Fragment } from 'react'
import { Link, useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { AtSign, ExternalLink, X, BadgeCheck } from 'lucide-react'
import {
  getSwimmer,
  updateSwimmer,
  uploadSwimmerPhoto,
  deleteSwimmerPhoto,
  getSwimmerEvents,
  getSwimmerEventHistory,
  getSwimmerProfileStats,
  getSwimmerProgression,
  getSwimmerRankings,
  getSwimmerTransferHistory,
  searchSwimmers,
} from '../api/swimmers'
import { createClaim, getMyClaims, submitPhotoRequest } from '../api/claims'
import { mergeSwimmers } from '../api/importer'
import { getCountries } from '../api/core'
import { getHeldRecords } from '../api/records'
import { getSwimmerDna, getSwimmerChase } from '../api/lab'
import { useAuth } from '../context/AuthContext'
import { useFeatures } from '../context/FeaturesContext'
import Flag from '../components/Flag'
import { Loading, Empty, Seg, Modal } from '../components/ui'
import ImageCropper from '../components/ImageCropper'
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
import { MiniHBars, CHART_COLORS } from '../components/MiniCharts'

const list = (d) => (Array.isArray(d) ? d : d?.results || [])

// Modal imported from ui.jsx — shared component with Escape key + ARIA

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
    <Modal title="Claim This Profile" onClose={onClose}>
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
  const [cropFile, setCropFile] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const [photoSubmitted, setPhotoSubmitted] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await updateSwimmer(swimmer.id, form)
      if (photo) {
        const fd = new FormData()
        fd.append('photo', photo)
        await submitPhotoRequest(fd)
        setPhotoSubmitted(true)
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
    <Modal title="Edit My Profile" onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {error && (
          <div style={{ border: '1px solid var(--asw-slow)', color: 'var(--asw-slow)', padding: '10px 12px', fontSize: 13 }}>{error}</div>
        )}
        {photoSubmitted && (
          <div style={{ border: '1px solid var(--asw-fast)', color: 'var(--asw-fast)', padding: '10px 12px', fontSize: 13 }}>
            Photo submitted for review — it will appear once approved by an admin.
          </div>
        )}
        <label style={{ display: 'block' }}>
          <div className="card-kicker" style={{ marginBottom: 4 }}>Profile photo</div>
          <div className="micro" style={{ marginBottom: 4, color: 'var(--color-neutral-700)', textTransform: 'none', letterSpacing: 0, fontSize: 12 }}>
            Photo changes require admin approval
          </div>
          <input className="input" type="file" accept="image/jpeg,image/png,image/webp"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) setCropFile(f) }} />
          {photo && <div className="micro" style={{ marginTop: 4, color: 'var(--asw-fast)' }}>Cropped photo ready — will be sent for review</div>}
        </label>
        {cropFile && (
          <ImageCropper file={cropFile} aspect={4 / 5}
            onDone={(f) => { setPhoto(f); setCropFile(null) }}
            onCancel={() => setCropFile(null)} />
        )}
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

function AdminEditSwimmerModal({ swimmer, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: swimmer.name || '',
    date_of_birth: swimmer.date_of_birth || '',
    birth_year: swimmer.birth_year != null ? String(swimmer.birth_year) : '',
    nationality: swimmer.nationality != null ? String(swimmer.nationality) : '',
    sex: swimmer.sex || '',
    club: swimmer.club || '',
    email: swimmer.email || '',
    phone: swimmer.phone || '',
    instagram_url: swimmer.instagram_url || '',
    facebook_url: swimmer.facebook_url || '',
    nicknames: (swimmer.nicknames || []).map((n) => n.nickname).join(', '),
    is_retired: !!swimmer.is_retired,
  })
  const [countries, setCountries] = useState([])
  const [photo, setPhoto] = useState(null)
  const [cropFile, setCropFile] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    getCountries({ page_size: 500 })
      .then((res) => setCountries(list(res.data))) // API order: Arab nations first
      .catch(() => setCountries([]))
  }, [])

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const payload = {
        name: form.name.trim(),
        date_of_birth: form.date_of_birth || null,
        birth_year: form.birth_year ? Number(form.birth_year) : null,
        nationality: form.nationality ? Number(form.nationality) : null,
        sex: form.sex || null,
        club: form.club.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        instagram_url: form.instagram_url.trim(),
        facebook_url: form.facebook_url.trim(),
        nicknames: form.nicknames.split(',').map((s) => s.trim()).filter(Boolean),
        is_retired: form.is_retired,
      }
      await updateSwimmer(swimmer.id, payload)
      if (photo) {
        const fd = new FormData()
        fd.append('photo', photo)
        await uploadSwimmerPhoto(swimmer.id, fd)
      }
      onSaved()
    } catch (err) {
      const data = err.response?.data
      setError(
        data?.error ||
        (data && typeof data === 'object' ? Object.entries(data).map(([k, v]) => `${k}: ${v}`).join(' · ') : '') ||
        'Could not save the changes'
      )
    } finally {
      setLoading(false)
    }
  }

  const field = (label, key, type = 'text', props = {}) => (
    <label style={{ display: 'block' }}>
      <div className="card-kicker" style={{ marginBottom: 4 }}>{label}</div>
      <input className="input" type={type} value={form[key]} style={{ width: '100%' }}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })} {...props} />
    </label>
  )

  return (
    <Modal title="Edit Swimmer" onClose={onClose} width={620}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {error && (
          <div style={{ border: '1px solid var(--asw-slow)', color: 'var(--asw-slow)', padding: '10px 12px', fontSize: 13 }}>{error}</div>
        )}
        {field('Full name', 'name', 'text', { required: true })}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {field('Date of birth', 'date_of_birth', 'date')}
          {field('Birth year (if DOB unknown)', 'birth_year', 'number', { min: 1900, max: 2100 })}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <label style={{ display: 'block' }}>
            <div className="card-kicker" style={{ marginBottom: 4 }}>Nationality</div>
            <select className="select" value={form.nationality} style={{ width: '100%' }}
              onChange={(e) => setForm({ ...form, nationality: e.target.value })}>
              <option value="">— none —</option>
              {countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label style={{ display: 'block' }}>
            <div className="card-kicker" style={{ marginBottom: 4 }}>Sex</div>
            <select className="select" value={form.sex} style={{ width: '100%' }}
              onChange={(e) => setForm({ ...form, sex: e.target.value })}>
              <option value="">— unknown —</option>
              <option value="M">Male</option>
              <option value="F">Female</option>
            </select>
          </label>
        </div>
        {field('Club', 'club')}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {field('Email', 'email', 'email')}
          {field('Phone', 'phone')}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {field('Instagram URL', 'instagram_url', 'url')}
          {field('Facebook URL', 'facebook_url', 'url')}
        </div>
        {field('Nicknames (comma-separated)', 'nicknames', 'text', { placeholder: 'e.g. Hamada, Mido' })}
        <label style={{ display: 'block' }}>
          <div className="card-kicker" style={{ marginBottom: 4 }}>Profile photo</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input className="input" type="file" accept="image/jpeg,image/png,image/webp" style={{ flex: 1 }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) setCropFile(f) }} />
            {swimmer.photo && (
              <button type="button" className="btn" style={{ borderColor: 'var(--asw-slow)', color: 'var(--asw-slow)', fontSize: 12, whiteSpace: 'nowrap' }}
                onClick={async () => {
                  if (!window.confirm('Delete this swimmer\'s photo?')) return
                  try {
                    await deleteSwimmerPhoto(swimmer.id)
                    onSaved()
                  } catch { window.alert('Failed to delete photo') }
                }}>
                Delete photo
              </button>
            )}
          </div>
          {photo && <div className="micro" style={{ marginTop: 4, color: 'var(--asw-fast)' }}>Cropped photo ready</div>}
        </label>
        {cropFile && (
          <ImageCropper file={cropFile} aspect={4 / 5}
            onDone={(f) => { setPhoto(f); setCropFile(null) }}
            onCancel={() => setCropFile(null)} />
        )}
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          <input type="checkbox" checked={form.is_retired}
            onChange={(e) => setForm({ ...form, is_retired: e.target.checked })} />
          Retired
        </label>
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

// Header photo with graceful fallback: a broken/missing upload never shows
// as raw alt text — it falls back to the navy initials block.
function HeaderPhoto({ swimmer }) {
  const [failed, setFailed] = useState(false)
  const frame = { flex: 'none', borderTop: '4px solid var(--asw-gold)' }
  if (swimmer.photo && !failed) {
    return (
      <div className="grayscale swimmer-photo" style={{ ...frame, overflow: 'hidden' }}>
        <img
          src={mediaUrl(swimmer.photo)}
          alt={swimmer.name}
          onError={() => setFailed(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      </div>
    )
  }
  return (
    <div className="swimmer-photo" style={{ ...frame, background: 'var(--color-accent-800)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-heading)', fontWeight: 800 }}>
      {initials(swimmer.name)}
    </div>
  )
}

const finaColor = (points) =>
  points >= 900 ? 'var(--asw-gold)'
  : points >= 800 ? 'var(--asw-fast)'
  : points >= 700 ? 'var(--color-accent-2)'
  : points >= 600 ? 'var(--color-text)'
  : 'var(--color-neutral-600)'

/* ── Times tab ─────────────────────────────────────────────────────────── */

function EventList({ events, selected, onSelect, detail }) {
  const lcm = events.filter((e) => e.pool === 'LCM' && !e.is_relay)
  const scm = events.filter((e) => e.pool === 'SCM' && !e.is_relay)
  // Open water is its own course (individual + OW relay together).
  const ow = events.filter((e) => e.pool === 'OW')
  // Deduplicate relays: same event_id across pools → keep one entry.
  // Open-water relays sit in the Open Water section, not here.
  const relayMap = new Map()
  events.filter((e) => e.is_relay && e.pool !== 'OW').forEach((e) => {
    const key = e.event_id
    if (!relayMap.has(key) || e.times_count > relayMap.get(key).times_count) relayMap.set(key, e)
  })
  const relays = [...relayMap.values()]

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
            <Fragment key={`${e.event_id}-${e.pool}`}>
            <button type="button" onClick={() => onSelect(e)}
              className="hair-b"
              style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                padding: '9px 10px', border: 0, cursor: 'pointer', font: 'inherit', textAlign: 'left',
                background: isSel ? 'var(--color-accent-100)' : 'transparent',
              }}>
              <span style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: 13, color: isSel ? 'var(--color-accent)' : 'inherit', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {e.event_name}
              </span>
              <span className="asw-time" style={{ flex: 'none', fontSize: 13 }}>{e.best_time}</span>
              <span className="micro asw-num" style={{ flex: 'none', width: 34, textAlign: 'right' }}>{e.times_count}x</span>
            </button>
              {/* phone: the time history opens right under the tapped event */}
              {isSel && detail && (
                <div className="show-mobile" style={{ padding: '10px 0 16px' }}>{detail}</div>
              )}
            </Fragment>
          )
        })}
      </div>
    )
  }

  return (
    <div>
      {section('Long course', lcm)}
      {section('Short course', scm)}
      {section('Open water', ow)}
      {section('Relay Splits', relays)}
      {events.length === 0 && <Empty label="No competition results yet" />}
    </div>
  )
}

function TimeHistoryPanel({ selectedEvent, history, loadingHistory }) {
  const [expandedSplits, setExpandedSplits] = useState(null)

  if (!selectedEvent) return <Empty label="Select an event to view full time history" />
  if (loadingHistory) return <Loading label="Loading history" />

  // PB = fastest official swim; ignore HC rows and status rows (DNS/DQ/DNF
  // are stored with time 0 — without the >0 guard they'd win the min()).
  const officialHistory = history.filter((x) => !x.is_hc && x.time_centiseconds > 0)
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
              <th className="hide-mobile">Round</th>
              <th className="hide-mobile">Team</th>
              <th>Meet</th>
              <th>Date</th>
              <th className="num">FINA</th>
            </tr>
          </thead>
          <tbody>
            {history.map((h, i) => {
              const isBest = bestCs != null && !h.is_hc && h.time_centiseconds === bestCs
              const splits = h.splits || []
              const relayLegs = h.is_relay ? (h.relay_swimmers || []).filter((s) => s && typeof s === 'object') : []
              const showSplits = expandedSplits === h.id
              return (
                <Fragment key={h.id}>
                  <tr>
                    <td className="asw-num text-muted">{i + 1}</td>
                    <td className="time" style={{ whiteSpace: 'nowrap' }}>
                      {/* badges sit LEFT of the time so the time digits stay
                          column-aligned on the right edge for every row */}
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                        {splits.length > 0 && (
                          <button type="button"
                            onClick={(e) => { e.stopPropagation(); setExpandedSplits(showSplits ? null : h.id) }}
                            className={showSplits ? 'tag tag-dark' : 'tag tag-outline'}
                            style={{ cursor: 'pointer', border: showSplits ? 0 : undefined, font: 'inherit', fontSize: 9, padding: '1px 6px' }}
                            title="Show split times">
                            Splits {showSplits ? '−' : '+'}
                          </button>
                        )}
                        {relayLegs.length > 0 && (
                          <button type="button"
                            onClick={(e) => { e.stopPropagation(); setExpandedSplits(showSplits ? null : h.id) }}
                            className={showSplits ? 'tag tag-dark' : 'tag tag-outline'}
                            style={{ cursor: 'pointer', border: showSplits ? 0 : undefined, font: 'inherit', fontSize: 9, padding: '1px 6px' }}
                            title="Show relay lineup">
                            Lineup {showSplits ? '−' : '+'}
                          </button>
                        )}
                        {h.is_relay && h.leg_order && (
                          <span className="tag tag-accent" title={`Swam leg ${h.leg_order} of this relay`}>
                            Leg {h.leg_order}
                          </span>
                        )}
                        {h.represented && (
                          <span title={`Swum representing ${h.represented.name}`}
                            style={{ display: 'inline-flex', alignItems: 'center' }}>
                            <Flag code={h.represented.code} name={`Swum representing ${h.represented.name}`}
                              flagUrl={h.represented.flag_url} />
                          </span>
                        )}
                        {h.is_hc && (
                          <span className="tag tag-neutral" title={h.hc_type === 'TLD' ? 'Time limit exceeded – does not count in rankings' : 'Hors concours – does not count in rankings'}>
                            {h.hc_type || 'HC'}
                          </span>
                        )}
                        {!h.is_relay && isBest && (
                          <span className="tag tag-dark" title="Personal best"
                            style={{ justifyContent: 'center', lineHeight: 1, minWidth: 30, padding: '4px 8px', fontSize: 10, fontWeight: 800, letterSpacing: '0.08em' }}>
                            PB
                          </span>
                        )}
                        <span className="asw-time" style={{ color: isBest ? 'var(--asw-fast)' : 'inherit' }}>
                          {h.is_relay && h.split_time ? h.split_time : (h.time_centiseconds > 0 ? h.time : '—')}
                        </span>
                      </span>
                    </td>
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
                    <td className="asw-num" style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{formatDate(h.championship_date)}</td>
                    <td className="num asw-num" style={{ fontWeight: 700, color: h.fina_points ? finaColor(h.fina_points) : 'var(--color-neutral-500)' }}>
                      {h.fina_points || '—'}
                    </td>
                  </tr>
                  {showSplits && relayLegs.length > 0 && (
                    <tr>
                      <td colSpan={7} style={{ background: 'var(--color-neutral-100)', padding: '12px 16px' }}>
                        <div className="kicker" style={{ marginBottom: 8 }}>Relay lineup — {h.team}</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {relayLegs.map((leg, li) => {
                            const order = leg.order || li + 1
                            const mine = h.leg_order && order === h.leg_order
                            return (
                              <div key={li} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: mine ? 700 : 400 }}>
                                <span className="asw-num" style={{ width: 44, color: mine ? 'var(--color-accent)' : 'var(--color-neutral-600)' }}>Leg {order}</span>
                                <span style={{ flex: 1, color: mine ? 'var(--color-accent)' : 'inherit' }}>{leg.name || '—'}</span>
                                <span className="asw-time" style={{ fontSize: 13 }}>{leg.split_time || '—'}</span>
                              </div>
                            )
                          })}
                        </div>
                        {relayLegs.length < 4 && (
                          <div className="micro text-muted" style={{ marginTop: 8 }}>
                            Only the legs tracked in the source file are listed.
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                  {showSplits && relayLegs.length === 0 && (() => {
                    // sibling round (prelims vs finals) from the same meet, if it has splits
                    const sibling = h.round_type ? history.find((x) =>
                      x.id !== h.id && x.championship_id === h.championship_id &&
                      x.round_type && x.round_type !== h.round_type && (x.splits || []).length > 0
                    ) : null
                    return (
                      <tr>
                        <td colSpan={7} style={{ background: 'var(--color-neutral-100)', padding: '14px 16px' }}>
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
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24 }} className="text-muted">No times recorded</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ── Swimmer DNA radar (custom SVG, brand tokens only) ─────────────────── */

function DnaRadar({ axes, size = 260 }) {
  const R = size / 2 - 50
  const cx = size / 2
  const cy = size / 2
  const n = axes.length
  const pt = (i, r) => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n
    return [cx + r * Math.cos(ang), cy + r * Math.sin(ang)]
  }
  const poly = axes.map((a, i) => pt(i, R * (Math.max(0, a.percentile) / 100)).join(',')).join(' ')
  const rings = [0.25, 0.5, 0.75, 1]
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ maxWidth: '100%' }}>
      {rings.map((f) => (
        <polygon key={f} points={axes.map((_, i) => pt(i, R * f).join(',')).join(' ')}
          fill="none" stroke="var(--color-neutral-200)" strokeWidth="1" />
      ))}
      {axes.map((_, i) => {
        const [x, y] = pt(i, R)
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--color-neutral-200)" strokeWidth="1" />
      })}
      <polygon points={poly} fill="var(--color-accent)" fillOpacity="0.2" stroke="var(--color-accent)" strokeWidth="2" />
      {axes.map((a, i) => {
        const [x, y] = pt(i, R * (Math.max(0, a.percentile) / 100))
        return <circle key={i} cx={x} cy={y} r="3.5" fill="var(--color-accent)" />
      })}
      {axes.map((a, i) => {
        const [x, y] = pt(i, R + 20)
        return (
          <text key={i} x={x} y={y} textAnchor="middle" dominantBaseline="middle"
            fontSize="10.5" fontWeight="700" fill="var(--color-text)">
            {a.stroke.replace('Individual Medley', 'IM')}
          </text>
        )
      })}
    </svg>
  )
}

function ChaseStat({ label, value, sub }) {
  return (
    <div style={{ border: '1px solid var(--color-divider)', padding: '12px 14px', flex: '1 1 120px' }}>
      <div className="kicker">{label}</div>
      <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, lineHeight: 1.1 }}>{value}</div>
      {sub && <div className="text-muted" style={{ fontSize: 11.5, marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function DnaSection({ swimmerId }) {
  const [dna, setDna] = useState(null)

  useEffect(() => {
    let alive = true
    setDna(null)
    getSwimmerDna(swimmerId)
      .then((r) => { if (alive) setDna(r.data) })
      .catch(() => { if (alive) setDna(null) })
    return () => { alive = false }
  }, [swimmerId])

  const hasDna = dna && dna.axes.some((a) => a.event_id)
  if (!hasDna) return null

  return (
    <>
      {/* Swimmer DNA */}
      <div>
        <div className="sect-head">
          <h4>Swimmer DNA</h4>
          <span className="micro">Specialty {dna.specialty || '—'} · Versatility {dna.versatility}</span>
        </div>
        <div className="rule-t" style={{ paddingTop: 12, display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
          <DnaRadar axes={dna.axes} />
          <div style={{ flex: '1 1 240px' }}>
            {dna.axes.map((a) => (
              <div key={a.stroke} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0', borderBottom: '1px solid var(--color-neutral-200)' }}>
                <span style={{ flex: '0 0 130px', fontWeight: 600, fontSize: 13 }}>{a.stroke}</span>
                <div style={{ flex: 1, height: 8, background: 'var(--color-neutral-200)' }}>
                  <div style={{ width: `${Math.max(0, a.percentile)}%`, height: '100%', background: 'var(--color-accent)' }} />
                </div>
                <span className="asw-num" style={{ flex: '0 0 46px', textAlign: 'right', fontSize: 12 }}>
                  {a.event_id ? `${a.percentile}%` : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}

export function ChaseSection({ swimmerId }) {
  const [dna, setDna] = useState(null)
  const [chase, setChase] = useState(null)
  const [eventId, setEventId] = useState('')

  useEffect(() => {
    let alive = true
    setDna(null); setChase(null); setEventId('')
    getSwimmerDna(swimmerId)
      .then((r) => {
        if (!alive) return
        setDna(r.data)
        const specialty = r.data.axes.find((a) => a.stroke === r.data.specialty && a.event_id)
        const firstEv = specialty || r.data.axes.find((a) => a.event_id)
        setEventId(firstEv ? String(firstEv.event_id) : '')
      })
      .catch(() => { if (alive) setDna(null) })
    return () => { alive = false }
  }, [swimmerId])

  useEffect(() => {
    if (!eventId) { setChase(null); return }
    let alive = true
    getSwimmerChase(swimmerId, { event: eventId })
      .then((r) => { if (alive) setChase(r.data) })
      .catch(() => { if (alive) setChase(null) })
    return () => { alive = false }
  }, [swimmerId, eventId])

  const eventOptions = (dna?.axes || []).filter((a) => a.event_id)

  return (
    <>
      {/* The Chase */}
      {chase && chase.my_rank && (
        <div>
          <div className="sect-head">
            <h4>The Chase</h4>
            {eventOptions.length > 1 && (
              <select className="select" style={{ width: 'auto', fontSize: 12, height: 30 }}
                value={eventId} onChange={(e) => setEventId(e.target.value)}>
                {eventOptions.map((a) => <option key={a.event_id} value={a.event_id}>{a.event_name}</option>)}
              </select>
            )}
          </div>
          <div className="rule-t" style={{ paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <ChaseStat label="Arab rank" value={`#${chase.my_rank}`} sub={`of ${chase.field_size}`} />
              {chase.national_rank && (
                <ChaseStat label="National rank" value={`#${chase.national_rank}`} sub={`of ${chase.national_field_size}`} />
              )}
              {chase.percentile != null && (
                <ChaseStat label="Percentile" value={`${chase.percentile}%`} sub="vs Arab field" />
              )}
              <ChaseStat label="Best time" value={chase.my_time} />
              {chase.leader && (
                <ChaseStat label="Off the leader" value={`+${chase.gap_to_leader}`} sub={chase.leader.swimmer_name} />
              )}
            </div>

            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 280px' }}>
                <div className="kicker" style={{ marginBottom: 6 }}>Next targets ahead</div>
                {chase.next_targets.length === 0 ? <div className="text-muted" style={{ fontSize: 13 }}>Top of the field.</div> : (
                  <table className="table"><tbody>
                    {chase.next_targets.map((t) => (
                      <tr key={t.swimmer_id}>
                        <td className="asw-num" style={{ width: 34, fontWeight: 800 }}>#{t.rank}</td>
                        <td><Link to={`/swimmers/${t.swimmer_id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{t.swimmer_name}</Link></td>
                        <td className="asw-time">{t.time}</td>
                        <td className="asw-num" style={{ color: 'var(--asw-slow)', textAlign: 'right' }}>-{t.gap}</td>
                      </tr>
                    ))}
                  </tbody></table>
                )}
              </div>
              <div style={{ flex: '1 1 280px' }}>
                <div className="kicker" style={{ marginBottom: 6 }}>Who's chasing you</div>
                {chase.chasing_you.length === 0 ? <div className="text-muted" style={{ fontSize: 13 }}>Nobody right behind.</div> : (
                  <table className="table"><tbody>
                    {chase.chasing_you.map((t) => (
                      <tr key={t.swimmer_id}>
                        <td className="asw-num" style={{ width: 34, fontWeight: 800 }}>#{t.rank}</td>
                        <td><Link to={`/swimmers/${t.swimmer_id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{t.swimmer_name}</Link></td>
                        <td className="asw-time">{t.time}</td>
                        <td className="asw-num" style={{ color: 'var(--asw-fast)', textAlign: 'right' }}>+{t.gap}</td>
                      </tr>
                    ))}
                  </tbody></table>
                )}
              </div>
            </div>

            {chase.unlock_history.length > 0 && (
              <div>
                <div className="kicker" style={{ marginBottom: 6 }}>Unlock history — time to reach each rank</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {chase.unlock_history.map((u) => (
                    <div key={u.rank} style={{ border: '1px solid var(--color-divider)', padding: '8px 12px', minWidth: 96 }}>
                      <div style={{ fontWeight: 800, fontFamily: 'var(--font-heading)' }}>Top {u.rank}</div>
                      <div className="asw-time" style={{ fontSize: 13 }}>{u.time}</div>
                      <div className="text-muted asw-num" style={{ fontSize: 11 }}>drop {u.drop}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
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
        <h4>Best Rankings</h4>
        <button type="button" className="btn btn-ghost" style={{ fontSize: 12 }} onClick={onViewAll}>View all →</button>
      </div>
      <div className="rule-t">
        {top.map((r, i) => (
          <div key={i} className="hair-b" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0' }}>
            <div style={{ background: 'var(--color-accent)', color: '#fff', minWidth: 48, height: 48, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 8px' }}>
              <span className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: r.rank >= 1000 ? 14 : r.rank >= 100 ? 16 : 22, lineHeight: 1 }}>{r.rank}</span>
              <span style={{ fontSize: r.rank >= 100 ? 8 : 10, fontWeight: 800, marginTop: 1 }}>{ordSuffix(r.rank)}</span>
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
  { min: 900, max: null, label: 'World-Class' },
  { min: 800, max: 900, label: 'International Elite' },
  { min: 700, max: 800, label: 'High Performance' },
  { min: 600, max: 700, label: 'Advanced' },
  { min: 500, max: 600, label: 'Competitive' },
  { min: 400, max: 500, label: 'Developing' },
  { min: 300, max: 400, label: 'Foundation' },
  { min: 200, max: 300, label: 'Novice' },
  { min: 100, max: 200, label: 'Entry Level' },
]

function OverallTab({ stats, swimmerId, onViewRankings }) {
  // Computed held records (same source as the Records tab) — the stats
  // endpoint only counts manually-stored Record rows, which many swimmers
  // don't have even though they hold computed national/GCC/Arab records.
  const [heldRecords, setHeldRecords] = useState(null)
  useEffect(() => {
    let alive = true
    getHeldRecords({ swimmer: swimmerId })
      .then((r) => { if (alive) setHeldRecords(r.data || []) })
      .catch(() => { if (alive) setHeldRecords([]) })
    return () => { alive = false }
  }, [swimmerId])
  if (!stats) return <Empty label="No stats available" />
  const {
    medals, total_championships, total_records, best_fina,
    season_best_fina, best_event, top_personal_bests, records, fina_distribution,
    championships, medals_by_level, medals_hierarchy, career_summary,
  } = stats
  const intlRecords = (records || []).filter((r) => r.record_type !== 'NATIONAL')
  // Held records not covered by the Record table (national/gcc/arab computed)
  const heldCount = (heldRecords || []).length
  const officialExtra = (records || []).filter((r) => !['NATIONAL', 'GCC', 'ARAB'].includes(r.record_type)).length
  const recordsTotal = Math.max(heldCount + officialExtra, total_records ?? (records || []).length)
  const md = medals || { gold: 0, silver: 0, bronze: 0, total: 0 }
  const bestEventPb = (top_personal_bests || []).find((pb) => pb.event_name === best_event)

  const cardStyle = {
    background: 'linear-gradient(150deg, var(--color-accent-600), var(--color-accent-900))',
    color: '#fff', padding: '14px 12px', textAlign: 'center',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
  }
  const cardNum = { fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 22, color: '#fff', lineHeight: 1.1 }
  const cardLabel = { fontSize: 9.5, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.7)' }
  const cardSub = { fontSize: 10, color: 'rgba(255,255,255,0.6)', marginTop: 2 }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {/* Stat cards lead the Overall tab — same gradient style as home page */}
      <div className="swimmer-stat-cards">
        <div style={cardStyle}>
          <span className="asw-num" style={cardNum}>{total_championships ?? 0}</span>
          <span style={cardLabel}>Meets</span>
        </div>
        <div style={cardStyle}>
          <span className="asw-num" style={{ ...cardNum, color: 'var(--asw-gold)' }}>{md.total}</span>
          <span style={cardLabel}>Medals</span>
          <span className="asw-num" style={{ fontSize: 11, display: 'flex', gap: 6 }}>
            <span style={{ color: 'var(--asw-gold)', fontWeight: 700 }}>{md.gold}G</span>
            <span style={{ color: 'var(--asw-silver)', fontWeight: 700 }}>{md.silver}S</span>
            <span style={{ color: 'var(--asw-bronze)', fontWeight: 700 }}>{md.bronze}B</span>
          </span>
        </div>
        <div style={cardStyle}>
          <span className="asw-num" style={cardNum}>{recordsTotal}</span>
          <span style={cardLabel}>Records</span>
        </div>
        <div style={cardStyle}>
          <span className="asw-num" style={cardNum}>{best_fina?.points || '—'}</span>
          <span style={cardLabel}>Best FINA</span>
          {best_fina?.event_name && <span style={cardSub}>{best_fina.event_name}</span>}
        </div>
        <div style={cardStyle}>
          <span className="asw-num" style={cardNum}>{season_best_fina?.points || '—'}</span>
          <span style={cardLabel}>Season FINA</span>
          {season_best_fina?.event_name && <span style={cardSub}>{season_best_fina.event_name}</span>}
        </div>
        <div style={cardStyle}>
          <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 15, color: '#fff', lineHeight: 1.2, textTransform: 'uppercase' }}>
            {best_event || '—'}
          </span>
          <span style={cardLabel}>Fastest Event</span>
          {bestEventPb && <span className="asw-time" style={{ fontSize: 13, color: '#fff' }}>{bestEventPb.time}</span>}
        </div>
      </div>

      {/* Career summary — only substantive career facts, each tile gated so
          sparse profiles never show degenerate trivia (1 season, 0.3 km, …) */}
      {career_summary && (() => {
        const cs = career_summary
        // parse date-only strings as local time ('2023-09-08' via new Date()
        // is UTC midnight and renders as the previous day west of UTC)
        const fmtDate = (d) => d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
        const tile = { border: '1px solid var(--color-divider)', background: '#fff', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }
        const tLabel = { fontSize: 9.5, fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--color-neutral-500)' }
        const tVal = { fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 17, lineHeight: 1.2 }
        const tSub = { fontSize: 11, color: 'var(--color-neutral-600)' }
        // Biggest title: most prestigious classification with golds (else the
        // best medal colour at the highest level), from the medal hierarchy
        const PRESTIGE = ['OLYMPIC', 'WORLD', 'AFRICAN', 'ASIAN', 'MEDITERRANEAN', 'ARAB', 'GCC', 'NATIONAL']
        const rankOf = (n) => { const i = PRESTIGE.indexOf((n || '').toUpperCase()); return i === -1 ? PRESTIGE.length : i }
        const flat = (medals_hierarchy || []).flatMap((cat) => cat.classifications || [])
          .sort((a, b) => rankOf(a.name) - rankOf(b.name))
        const golds = flat.find((c) => c.gold > 0)
        const any = flat.find((c) => c.silver > 0 || c.bronze > 0)
        const biggest = golds
          ? { name: golds.name, medal: 'Gold', count: golds.gold, color: 'var(--asw-gold)' }
          : any
            ? (any.silver > 0
              ? { name: any.name, medal: 'Silver', count: any.silver, color: 'var(--asw-silver)' }
              : { name: any.name, medal: 'Bronze', count: any.bronze, color: 'var(--asw-bronze)' })
            : null
        const multiYear = cs.years_active >= 2
        return (
          <div>
            <div className="sect-head">
              <h4>Career Summary</h4>
              {multiYear && <span className="micro">{fmtDate(cs.first_date)} → {fmtDate(cs.last_date)}</span>}
            </div>
            <div className="rule-t" style={{ paddingTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(165px, 1fr))', gap: 10 }}>
              <div style={tile}>
                <span style={tLabel}>Debut</span>
                <span style={tVal}>{fmtDate(cs.debut?.date)}</span>
                <span style={tSub}>{cs.debut?.meet}{cs.debut?.age != null ? ` · age ${cs.debut.age}` : ''}</span>
              </div>
              {multiYear && (
                <div style={tile}>
                  <span style={tLabel}>Career Span</span>
                  <span className="asw-num" style={tVal}>{cs.years_active} yrs</span>
                  <span style={tSub}>{cs.seasons} season{cs.seasons !== 1 ? 's' : ''} active · {cs.total_swims} swims</span>
                </div>
              )}
              {biggest && (
                <div style={tile}>
                  <span style={tLabel}>Biggest Title</span>
                  <span style={tVal}>{biggest.name} <span style={{ color: biggest.color }}>{biggest.medal}</span></span>
                  <span style={tSub}>won ×{biggest.count} · highest-level medal</span>
                </div>
              )}
              {cs.specialty_stroke && cs.total_swims >= 10 && (
                <div style={tile}>
                  <span style={tLabel}>Specialty</span>
                  <span style={tVal}>{cs.specialty_range} · {cs.specialty_stroke}</span>
                  <span style={tSub}>most-raced distance &amp; stroke</span>
                </div>
              )}
              {cs.top_meet && cs.top_meet.medals >= 3 && (
                <div style={tile}>
                  <span style={tLabel}>Most Decorated Meet</span>
                  <span style={{ ...tVal, fontSize: 14 }}>{cs.top_meet.name}</span>
                  <span style={tSub}>{cs.top_meet.medals} medals at one meet</span>
                </div>
              )}
              {cs.improvement && (
                <div style={tile}>
                  <span style={tLabel}>Career Drop · {cs.improvement.event_name}</span>
                  <span className="asw-num" style={{ ...tVal, color: 'var(--asw-fast)' }}>−{cs.improvement.seconds}s</span>
                  <span style={tSub}>
                    {cs.improvement.from_time} ({cs.improvement.from_year}) → {cs.improvement.to_time} · {cs.improvement.percent}% faster
                    {cs.pb_age != null ? ` · best form at age ${cs.pb_age}` : ''}
                  </span>
                </div>
              )}
            </div>
          </div>
        )
      })()}

      {/* Swimmer DNA (The Chase lives in the Rankings tab) */}
      <DnaSection swimmerId={swimmerId} />

      {/* Performance index */}
      {(best_fina?.points || 0) > 0 && (
        <div>
          <div className="sect-head"><h4>Performance Index</h4><span className="micro">FINA points · career best {best_fina.points}</span></div>
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
                  background: isCurrent ? 'var(--color-accent)' : 'transparent',
                  color: isCurrent ? '#fff' : 'inherit',
                  borderLeft: `4px solid ${isCurrent ? 'var(--asw-gold)' : reached ? 'var(--color-accent)' : 'var(--color-divider)'}`,
                }}>
                  <span className="asw-num" style={{ width: 52, flex: 'none', fontWeight: 800, fontSize: 14, opacity: reached ? 1 : 0.5 }}>{t.min}+</span>
                  <span style={{ flex: 1, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', opacity: reached ? 1 : 0.5 }}>{t.label}</span>
                  {isCurrent && <span className="tag" style={{ background: 'var(--asw-gold)', color: '#fff', border: 0 }}>CAREER BEST</span>}
                  {isSeason && <span className="tag tag-accent">THIS SEASON</span>}
                  {count > 0 && <span className="asw-num micro" style={{ opacity: isCurrent ? 1 : 0.6, color: isCurrent ? 'rgba(255,255,255,0.9)' : undefined }}>{count} PB{count !== 1 ? 's' : ''}</span>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Top personal bests */}
      {top_personal_bests?.length > 0 && (
        <div>
          <div className="sect-head"><h4>Top Personal Bests</h4></div>
          <div className="rule-t">
            {top_personal_bests.map((pb, i) => (
              <div key={i} className="hair-b" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0' }}>
                <span className="asw-num" style={{ width: 30, height: 30, flex: 'none', background: 'var(--color-accent-800)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 13 }}>
                  {i + 1}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, textTransform: 'uppercase' }}>{pb.event_name}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-neutral-700)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {pb.meet_name}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                    {pb.meet_date && <span style={{ fontSize: 11, color: 'var(--color-neutral-600)' }}>{formatDate(pb.meet_date)}</span>}
                    {pb.pool && <span className="tag tag-accent-2" style={{ fontSize: 9, padding: '1px 6px' }}>{pb.pool}</span>}
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

      {/* Career activity — meets entered per year */}
      {championships?.length > 0 && (() => {
        const byYear = {}
        championships.forEach((c) => {
          const y = c.date ? String(c.date).slice(0, 4) : null
          if (y) byYear[y] = (byYear[y] || 0) + 1
        })
        const years = Object.keys(byYear).sort()
        if (years.length < 2) return null
        const maxY = Math.max(...years.map((y) => byYear[y]), 1)
        const totalMeets = years.reduce((n, y) => n + byYear[y], 0)
        return (
          <div>
            <div className="sect-head"><h4>Career Activity</h4><span className="micro">Meets entered per year · {totalMeets} total</span></div>
            <div className="rule-t" style={{ paddingTop: 16, display: 'flex', alignItems: 'flex-end', gap: 6, height: 160 }}>
              {years.map((y) => (
                <div key={y} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%', minWidth: 0 }}>
                  <span className="asw-num" style={{ fontSize: 11, fontWeight: 800, color: 'var(--color-accent)', marginBottom: 4 }}>{byYear[y]}</span>
                  <div style={{ width: '70%', maxWidth: 36, height: `${Math.max(4, (byYear[y] / maxY) * 110)}px`, background: 'linear-gradient(180deg, var(--color-accent-500), var(--color-accent-800))', borderRadius: '3px 3px 0 0' }} />
                  <span className="asw-num" style={{ fontSize: 10, color: 'var(--color-neutral-600)', marginTop: 6 }}>{y}</span>
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      {/* Competition level mix — meets entered per classification level */}
      {championships?.length > 0 && (() => {
        const byLevel = {}
        championships.forEach((c) => {
          const lvl = c.classification || c.category || 'Other'
          byLevel[lvl] = (byLevel[lvl] || 0) + 1
        })
        const rows = Object.entries(byLevel)
          .map(([label, value]) => ({ label, value }))
          .sort((a, b) => b.value - a.value)
        if (rows.length < 2) return null
        return (
          <div>
            <div className="sect-head"><h4>Competition Level Mix</h4><span className="micro">Meets entered per competition level</span></div>
            <div className="rule-t" style={{ paddingTop: 14 }}>
              <MiniHBars rows={rows} color={CHART_COLORS.NAVY} labelWidth={130} />
            </div>
          </div>
        )
      })()}

      {/* Medals by competition level */}
      {(() => {
        // Group by classification name — the same source the Medals tab's
        // "By Level" cards use. medals_by_level groups by classification
        // category, which buckets uncategorised meets as "UNCATEGORIZED"
        // while the Medals tab calls the very same medals "National".
        const byCls = {}
        ;(medals_hierarchy || []).forEach((c) => (c.classifications || []).forEach((cls) => {
          if (!byCls[cls.name]) byCls[cls.name] = { category: cls.name, gold: 0, silver: 0, bronze: 0 }
          byCls[cls.name].gold += cls.gold
          byCls[cls.name].silver += cls.silver
          byCls[cls.name].bronze += cls.bronze
        }))
        const source = Object.keys(byCls).length ? Object.values(byCls) : (medals_by_level || [])
        const rows = source.filter((m) => (m.gold + m.silver + m.bronze) > 0)
          .sort((a, b) => (b.gold + b.silver + b.bronze) - (a.gold + a.silver + a.bronze))
        if (rows.length === 0) return null
        const maxT = Math.max(...rows.map((m) => m.gold + m.silver + m.bronze), 1)
        return (
          <div>
            <div className="sect-head"><h4>Medals by Level</h4><span className="micro">Gold · Silver · Bronze per competition level</span></div>
            <div className="rule-t" style={{ paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {rows.map((m) => {
                const tot = m.gold + m.silver + m.bronze
                return (
                  <div key={m.category} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 110, flex: 'none', fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-neutral-700)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.category}</span>
                    <div style={{ flex: 1, height: 22, display: 'flex', background: 'var(--color-neutral-200)', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ width: `${(tot / maxT) * 100}%`, display: 'flex', minWidth: 20 }}>
                        {[['gold', 'var(--asw-gold)'], ['silver', 'var(--asw-silver)'], ['bronze', 'var(--asw-bronze)']].map(([k, c]) => m[k] > 0 && (
                          <div key={k} className="asw-num" style={{ flex: m[k], background: c, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, minWidth: 16 }}>{m[k]}</div>
                        ))}
                      </div>
                    </div>
                    <span className="asw-num" style={{ width: 28, textAlign: 'right', fontWeight: 900, fontSize: 14 }}>{tot}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* Best rankings preview */}
      <RankingsPreview swimmerId={swimmerId} onViewAll={onViewRankings} />

      {/* International records */}
      {intlRecords.length > 0 && (
        <div>
          <div className="sect-head">
            <h4>International Records</h4>
            <span className="micro asw-num">{intlRecords.length}</span>
          </div>
          <div className="rule-t">
            {intlRecords.map((r) => (
              <div key={r.id} className="hair-b" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0' }}>
                <span className={`tag ${r.record_type === 'ARAB' ? 'tag-dark' : r.record_type === 'GCC' ? 'tag-accent' : 'tag-outline'}`} style={{ flex: 'none', minWidth: 40, textAlign: 'center' }}>{r.record_type}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, textTransform: 'uppercase' }}>{r.event_name}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-neutral-700)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.meet_name || r.location}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                    {r.date && <span style={{ fontSize: 11, color: 'var(--color-neutral-600)' }}>{formatDate(r.date)}</span>}
                    {r.pool && <span className="tag tag-accent-2" style={{ fontSize: 9, padding: '1px 6px' }}>{r.pool}</span>}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flex: 'none' }}>
                  <div className="asw-time" style={{ fontSize: 16 }}>{r.time}</div>
                </div>
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
          options={[{ value: 'LCM', label: 'Long Course' }, { value: 'SCM', label: 'Short Course' }]}
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
  { value: 'transfers', label: 'Representations' },
  { value: 'gallery', label: 'Gallery' },
]

/* ── Main page ─────────────────────────────────────────────────────────── */

function MergeModal({ swimmer, onClose, onMerged }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [selected, setSelected] = useState(null)
  const [merging, setMerging] = useState(false)
  const debounce = useRef(null)

  const search = (q) => {
    setQuery(q)
    if (debounce.current) clearTimeout(debounce.current)
    if (q.length < 2) { setResults([]); return }
    debounce.current = setTimeout(() => {
      searchSwimmers(q, { include_all: true })
        .then((res) => {
          const list = Array.isArray(res.data) ? res.data : res.data?.results || []
          setResults(list.filter((s) => s.id !== swimmer.id))
        })
        .catch(() => setResults([]))
    }, 300)
  }

  const handleMerge = async () => {
    if (!selected) return
    if (!window.confirm(`Merge "${selected.name}" into "${swimmer.name}"?\n\nAll results, medals, and records from "${selected.name}" will be moved to this profile. "${selected.name}" will be deleted.\n\nThis cannot be undone.`)) return
    setMerging(true)
    try {
      await mergeSwimmers(swimmer.id, [selected.id])
      onMerged()
    } catch (err) {
      const msg = err?.response?.data?.error || err?.response?.data?.detail
        || (err?.response?.status === 401 || err?.response?.status === 403
          ? 'You must be signed in as an admin to merge swimmers.'
          : 'Merge failed — please try again.')
      window.alert(msg)
      setMerging(false)
    }
  }

  return (
    <Modal title="Merge Duplicate Swimmer" onClose={onClose} width={600}>
      <div className="micro" style={{ marginBottom: 12, textTransform: 'none', letterSpacing: 0, fontSize: 12, color: 'var(--color-neutral-700)' }}>
        Search for the duplicate profile to merge INTO this swimmer ({swimmer.name}). The duplicate's results, medals, and records will be transferred here.
      </div>
      <input className="input" placeholder="Search duplicate swimmer…" value={query} onChange={(e) => search(e.target.value)} style={{ marginBottom: 8 }} />
      {results.length > 0 && !selected && (
        <div style={{ border: '1px solid var(--color-divider)', maxHeight: 250, overflowY: 'auto', marginBottom: 12 }}>
          {results.map((s) => (
            <button key={s.id} type="button" style={{ width: '100%', textAlign: 'left', padding: '10px 14px', border: 0, borderBottom: '1px solid var(--color-divider)', background: 'transparent', cursor: 'pointer', font: 'inherit', fontSize: 13 }}
              onClick={() => setSelected(s)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Flag code={s.nationality_detail?.code} name={s.nationality_detail?.name} />
                <div>
                  <div style={{ fontWeight: 700 }}>{s.name}</div>
                  <div className="micro" style={{ textTransform: 'none', letterSpacing: 0 }}>
                    {s.nationality_detail?.name || ''}{s.birth_year ? ` · Born ${s.birth_year}` : ''}{s.club ? ` · ${s.club}` : ''}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
      {selected && (
        <div style={{ border: '2px solid var(--color-accent)', padding: 16, marginBottom: 12 }}>
          <div className="kicker" style={{ marginBottom: 10 }}>Merge preview</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 12, alignItems: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontWeight: 800, fontSize: 15 }}>{swimmer.name}</div>
              <div className="micro">{swimmer.nationality_detail?.name}{swimmer.birth_year ? ` · ${swimmer.birth_year}` : ''}</div>
              <span className="tag tag-accent" style={{ marginTop: 6 }}>Keep this profile</span>
            </div>
            <div style={{ fontSize: 20, color: 'var(--color-neutral-500)' }}>←</div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontWeight: 800, fontSize: 15 }}>{selected.name}</div>
              <div className="micro">{selected.nationality_detail?.name}{selected.birth_year ? ` · ${selected.birth_year}` : ''}</div>
              <span className="tag" style={{ marginTop: 6, background: 'var(--asw-slow)', color: '#fff' }}>Will be deleted</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 14 }}>
            <button className="btn btn-secondary" onClick={() => setSelected(null)}>Change</button>
            <button className="btn btn-primary" onClick={handleMerge} disabled={merging}>
              {merging ? 'Merging…' : 'Confirm merge'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}

export default function SwimmerProfile() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { isAdmin, isAuthed, mySwimmerId, refreshUser } = useAuth()
  const { flag } = useFeatures()
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = searchParams.get('tab') || 'overall'
  const setActiveTab = (tab) => setSearchParams({ tab }, { replace: true })

  const [swimmer, setSwimmer] = useState(null)
  const [claimOpen, setClaimOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [adminEditOpen, setAdminEditOpen] = useState(false)
  const [mergeOpen, setMergeOpen] = useState(false)
  const [myClaims, setMyClaims] = useState([])
  const [events, setEvents] = useState([])
  const [stats, setStats] = useState(null)
  const [clubHistory, setClubHistory] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [history, setHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  // ?edit=1 deep link (e.g. from a club roster) auto-opens the admin editor
  useEffect(() => {
    if (isAdmin && swimmer && searchParams.get('edit')) {
      setAdminEditOpen(true)
      searchParams.delete('edit')
      setSearchParams(searchParams, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, swimmer])

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
      const evts = list(val(eRes))
      setSwimmer(val(sRes))
      setEvents(evts)
      setStats(val(stRes))
      setClubHistory(val(tRes)?.clubs || [])
      setLoaded(true)
      // Desktop: preselect the first event so the Times tab's history panel
      // isn't a dead empty column on load. Phones (≤900px) keep the
      // tap-to-open flow — history there renders under the tapped row.
      if (evts.length > 0 && window.matchMedia('(min-width: 901px)').matches) {
        const first = evts.find((e) => e.pool === 'LCM' && !e.is_relay)
          || evts.find((e) => !e.is_relay) || evts[0]
        setSelectedEvent(first)
        setLoadingHistory(true)
        getSwimmerEventHistory(id, first.event_id, first.pool)
          .then((res) => { if (alive) setHistory(list(res.data)) })
          .catch(() => { if (alive) setHistory([]) })
          .finally(() => { if (alive) setLoadingHistory(false) })
      }
    })
    return () => { alive = false }
  }, [id])

  useEffect(() => {
    if (!isAuthed || isAdmin || mySwimmerId) { setMyClaims([]); return }
    getMyClaims().then((res) => setMyClaims(list(res.data))).catch(() => setMyClaims([]))
  }, [id, isAuthed, isAdmin, mySwimmerId])

  const handleEventClick = async (event) => {
    // clicking the open event again collapses it
    if (selectedEvent?.event_id === event.event_id && selectedEvent?.pool === event.pool) {
      setSelectedEvent(null)
      setHistory([])
      return
    }
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
  // Admin visibility toggles: hidden tabs vanish for visitors, stay (dimmed)
  // for admins. Overall is always available and is the fallback.
  const tabHidden = (v) => v !== 'overall' && !flag(`swimmer.tab.${v}`)
  const visibleTabs = TABS
    .filter((t) => !isNonArab || !['records', 'rankings'].includes(t.value))
    .filter((t) => isAdmin || !tabHidden(t.value))
  const effectiveTab = (() => {
    if (isNonArab && ['records', 'rankings'].includes(activeTab)) return 'times'
    return visibleTabs.some((t) => t.value === activeTab) ? activeTab : 'overall'
  })()

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
        <HeaderPhoto swimmer={swimmer} />
        <div className="swimmer-head-info" style={{ flex: 1 }}>
          <div className="kicker" style={{ marginBottom: 6 }}>Swimmer profile</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0, letterSpacing: '-0.03em', overflowWrap: 'anywhere', fontSize: (swimmer.name || '').length > 25 ? 'clamp(20px, 4vw, 32px)' : undefined }}>{swimmer.name}</h1>
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
              ? chip('Born', isAdmin ? formatDate(swimmer.date_of_birth) : swimmer.date_of_birth.split('-')[0])
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
            <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              {swimmer.nicknames.map((n, i) => (
                <span key={i} className="tag tag-accent-2">{n.nickname}</span>
              ))}
              {isAdmin && (
                <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 8px' }}
                  onClick={async () => {
                    if (!window.confirm('Remove all name variants? They will be cleared from this profile.')) return
                    await updateSwimmer(id, { nicknames: [] })
                    setSwimmer({ ...swimmer, nicknames: [] })
                  }}>
                  Clear all
                </button>
              )}
            </div>
          )}
        </div>
        {(() => {
          const isMine = mySwimmerId != null && Number(id) === mySwimmerId
          const pendingHere = myClaims.some((c) => c.swimmer === Number(id) && c.status === 'PENDING')
          const declinedHere = myClaims.find((c) => c.swimmer === Number(id) && c.status === 'DECLINED')
          const canClaim = isAuthed && !isAdmin && !isMine && mySwimmerId == null &&
            !swimmer.is_verified && !swimmer.is_relay_team
          if (!isAdmin && !isMine && !canClaim && !pendingHere && !declinedHere) return null
          return (
            <div className="swimmer-hero-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center' }}>
              {isAdmin && (
                <>
                  <button type="button" className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => setAdminEditOpen(true)}>
                    Edit swimmer
                  </button>
                  <button type="button" className="btn btn-secondary" style={{ fontSize: 12 }}
                    onClick={async () => {
                      const next = !swimmer.is_retired
                      await updateSwimmer(id, { is_retired: next })
                      setSwimmer({ ...swimmer, is_retired: next })
                    }}>
                    {swimmer.is_retired ? 'Mark active' : 'Mark retired'}
                  </button>
                  <button type="button" className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => setMergeOpen(true)}>
                    Merge duplicate
                  </button>
                </>
              )}
              {isMine && (
                <button type="button" className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => setEditOpen(true)}>
                  Edit my profile
                </button>
              )}
              {pendingHere && <span className="tag tag-neutral">Claim pending review</span>}
              {declinedHere && !pendingHere && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                  <span className="tag" style={{ background: 'var(--asw-slow)', color: '#fff' }}>
                    Claim declined{declinedHere.note ? `: ${declinedHere.note}` : ''}
                  </span>
                  <button type="button" className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => setClaimOpen(true)}>
                    Resubmit claim
                  </button>
                </div>
              )}
              {canClaim && !pendingHere && !declinedHere && (
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
      {adminEditOpen && (
        <AdminEditSwimmerModal
          swimmer={swimmer}
          onClose={() => setAdminEditOpen(false)}
          onSaved={async () => {
            setAdminEditOpen(false)
            const res = await getSwimmer(id).catch(() => null)
            if (res) setSwimmer(res.data)
          }}
        />
      )}
      {mergeOpen && (
        <MergeModal
          swimmer={swimmer}
          onClose={() => setMergeOpen(false)}
          onMerged={() => {
            setMergeOpen(false)
            // The kept profile keeps the same id, so tab fetches keyed on id
            // won't re-run — reload to surface the transferred results/medals.
            window.location.reload()
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
      <div className="rule-b tabbar tabbar-sticky" style={{ padding: '14px 32px', overflowX: 'auto' }}>
        <Seg
          tabs
          options={visibleTabs.map((t) => tabHidden(t.value)
            ? { ...t, label: <span style={{ opacity: 0.4 }} title="Hidden from visitors (admin visibility settings)">{t.label}</span> }
            : t)}
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
            <EventList
              events={events}
              selected={selectedEvent}
              onSelect={handleEventClick}
              detail={<TimeHistoryPanel selectedEvent={selectedEvent} history={history} loadingHistory={loadingHistory} />}
            />
            <div className="hide-mobile">
              <TimeHistoryPanel selectedEvent={selectedEvent} history={history} loadingHistory={loadingHistory} />
            </div>
          </div>
        )}
        {effectiveTab === 'meets' && <MeetsTab stats={stats} />}
        {effectiveTab === 'medals' && <MedalsTab stats={stats} />}
        {effectiveTab === 'rankings' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
            <RankingsTab swimmerId={id} swimmer={swimmer} />
            <ChaseSection swimmerId={id} />
          </div>
        )}
        {effectiveTab === 'records' && <RecordsTab swimmerId={id} />}
        {effectiveTab === 'qualifying' && <QualifyingTab swimmerId={id} />}
        {effectiveTab === 'progression' && <ProgressionTab swimmerId={id} />}
        {effectiveTab === 'compare' && <CompareTab swimmerId={id} />}
        {effectiveTab === 'transfers' && <TransfersTab swimmerId={id} currentCountryId={swimmer.nationality_detail?.id ?? swimmer.nationality} />}
        {effectiveTab === 'gallery' && <GalleryTab swimmerId={id} />}
      </div>
    </div>
  )
}
