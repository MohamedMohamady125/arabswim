import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { X } from 'lucide-react'
import { getTeamProfile, getTeamMedals, getTeamTimes, updateTeam, getBoardMembers, createBoardMember, updateBoardMember, deleteBoardMember, getTeams } from '../api/teams'
import { getArticles, createArticle } from '../api/news'
import { getAlbums, createAlbum } from '../api/media'
import { getCoaches, createCoach, updateCoach, deleteCoach } from '../api/coaches'
import { createSwimmer, updateSwimmer } from '../api/swimmers'
import { getCountries } from '../api/core'
import api from '../api/client'
import Flag from '../components/Flag'
import { useAuth } from '../context/AuthContext'
import { Loading, Empty, Seg, Modal } from '../components/ui'
import { FedHeroPhoto, SubTabs, TabHeading } from './CountryProfile'
import { formatDate, formatNumber, formatTime, mediaUrl } from '../utils'

// Not yet in src/api/teams.js — defined locally
const getTeamRecords = (id) => api.get(`/teams/${id}/records/`)
const getTeamStats = (id) => api.get(`/teams/${id}/stats/`)
const getTeamRanking = (id) => api.get(`/teams/${id}/ranking/`)
const getTeamPrediction = (id, params) => api.get(`/teams/${id}/prediction/`, { params })
const getTeamProgression = (id, params) => api.get(`/teams/${id}/progression/`, { params })

const list = (d) => (Array.isArray(d) ? d : d?.results || [])

function acronym(name) {
  const words = String(name || '').split(/\s+/).filter(Boolean)
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase()
  return words.slice(0, 3).map((w) => w[0]).join('').toUpperCase()
}

const COACH_LEVELS = {
  HEAD: 'Head Coach',
  ASSISTANT: 'Assistant Coach',
  TECHNIQUE: 'Technique Coach',
  FITNESS: 'Fitness / S&C Coach',
  YOUTH: 'Youth Development',
  PRIVATE: 'Private Coach',
}

const CLASS_COLORS = {
  Arab: '#1c4e86', GCC: '#7d8a99', African: '#a8402f', Asian: '#a05f2c',
  Mediterranean: '#4a8fc0', Islamic: '#0d7a52', World: '#b98a1e', Olympic: '#0c2340',
  National: '#2e6b4f', University: '#6b4f8a', Other: '#5a6572',
}

const REC_TYPE_LABELS = {
  NATIONAL: 'National', ARAB: 'Arab', GCC: 'GCC', AFRICAN: 'African',
  ASIAN: 'Asian', MEDITERRANEAN: 'Mediterranean', ISLAMIC: 'Islamic', WORLD: 'World',
}
const REC_TYPE_ORDER = ['NATIONAL', 'ARAB', 'GCC', 'AFRICAN', 'ASIAN', 'MEDITERRANEAN', 'ISLAMIC', 'WORLD']
const REC_TYPE_COLORS = {
  NATIONAL: '#1a56a0', ARAB: '#b98a1e', GCC: '#0d7a52', AFRICAN: '#a8402f',
  ASIAN: '#a05f2c', MEDITERRANEAN: '#4a8fc0', ISLAMIC: '#0d7a52', WORLD: '#0c2340',
}

const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'news', label: 'News' },
  { value: 'board', label: 'Board' },
  { value: 'team', label: 'Team' },
  { value: 'statistics', label: 'Statistics' },
  { value: 'progression', label: 'Progression' },
  { value: 'records', label: 'Records' },
  { value: 'ranking', label: 'Ranking' },
  { value: 'medals', label: 'Medals' },
  { value: 'compare', label: 'Compare' },
  { value: 'prediction', label: 'Prediction' },
  { value: 'multimedia', label: 'Multimedia' },
]

function SwimmerLink({ id, name }) {
  if (!id) return <span style={{ fontWeight: 600 }}>{name}</span>
  return <Link to={`/swimmers/${id}`} style={{ color: 'inherit', textDecoration: 'none', fontWeight: 600 }}>{name}</Link>
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'block', marginBottom: 12 }}>
      <div className="card-kicker" style={{ marginBottom: 4 }}>{label}</div>
      {children}
    </label>
  )
}

function CountrySelect({ value, onChange, countries }) {
  return (
    <select className="select" style={{ width: '100%' }} value={value || ''} onChange={(e) => onChange(e.target.value)}>
      <option value="">— Country —</option>
      {countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
    </select>
  )
}

// ── Admin modals ─────────────────────────────────────────────

function EditClubModal({ team, countries, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: team.name || '',
    country: team.country || '',
    founded_year: team.founded_year || '',
    description: team.description || '',
    website: team.website || '',
    email: team.email || '',
    phone: team.phone || '',
    address: team.address || '',
    is_national_team: !!team.is_national_team,
  })
  const [logo, setLogo] = useState(null)
  const [trophies, setTrophies] = useState((team.trophies || []).map((t) => ({ name: t.name, year: t.year })))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const save = async () => {
    if (!form.name.trim()) { setErr('Name is required'); return }
    setBusy(true); setErr('')
    try {
      const fd = new FormData()
      Object.entries(form).forEach(([k, v]) => fd.append(k, v))
      if (logo) fd.append('logo', logo)
      fd.append('trophies_data', JSON.stringify(trophies.filter((t) => t.name && t.year)))
      await updateTeam(team.id, fd)
      onSaved()
    } catch (e) {
      setErr(e.response?.data ? JSON.stringify(e.response.data) : 'Save failed')
      setBusy(false)
    }
  }

  return (
    <Modal title="Edit Club" onClose={onClose}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Club name"><input className="input" style={{ width: '100%' }} value={form.name} onChange={set('name')} /></Field>
        <Field label="Country">
          <select className="select" style={{ width: '100%' }} value={form.country} onChange={set('country')}>
            <option value="">Select country…</option>
            {(countries || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Logo"><input className="input" type="file" accept="image/jpeg,image/png,image/webp" style={{ width: '100%' }} onChange={(e) => setLogo(e.target.files?.[0] || null)} /></Field>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, margin: '2px 0 10px' }}>
        <input type="checkbox" checked={form.is_national_team}
          onChange={(e) => setForm((f) => ({ ...f, is_national_team: e.target.checked }))} />
        National team
      </label>
      <Field label="Founded year"><input className="input" style={{ width: '100%' }} type="number" value={form.founded_year} onChange={set('founded_year')} /></Field>
      <Field label="Description"><textarea className="input" rows={5} style={{ width: '100%', resize: 'vertical' }} value={form.description} onChange={set('description')} /></Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Website"><input className="input" style={{ width: '100%' }} value={form.website} onChange={set('website')} /></Field>
        <Field label="Email"><input className="input" style={{ width: '100%' }} value={form.email} onChange={set('email')} /></Field>
        <Field label="Phone"><input className="input" style={{ width: '100%' }} value={form.phone} onChange={set('phone')} /></Field>
        <Field label="Address"><input className="input" style={{ width: '100%' }} value={form.address} onChange={set('address')} /></Field>
      </div>
      <div className="card-kicker" style={{ margin: '10px 0 6px' }}>Trophies</div>
      {trophies.map((t, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input className="input" style={{ flex: 1 }} placeholder="Trophy / meet name" value={t.name}
            onChange={(e) => setTrophies((l) => l.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
          <input className="input" style={{ width: 90 }} type="number" placeholder="Year" value={t.year}
            onChange={(e) => setTrophies((l) => l.map((x, j) => (j === i ? { ...x, year: e.target.value } : x)))} />
          <button className="btn btn-secondary btn-icon" onClick={() => setTrophies((l) => l.filter((_, j) => j !== i))}><X size={13} /></button>
        </div>
      ))}
      <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => setTrophies((l) => [...l, { name: '', year: '' }])}>+ Add trophy</button>
      {err && <div style={{ color: 'var(--asw-slow)', fontSize: 12, marginTop: 10 }}>{err}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <button className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </Modal>
  )
}

function CoachModal({ coach, team, countries, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: coach?.name || '',
    level: coach?.level || '',
    years_experience: coach?.years_experience || '',
    nationality: coach?.nationality || team.country,
    email: coach?.email || '',
    phone: coach?.phone || '',
    bio: coach?.bio || '',
  })
  const [photo, setPhoto] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const save = async () => {
    if (!form.name.trim() || !form.nationality) { setErr('Name and country are required'); return }
    setBusy(true); setErr('')
    try {
      const fd = new FormData()
      fd.append('name', form.name.trim())
      fd.append('level', form.level)
      fd.append('nationality', form.nationality)
      fd.append('team', team.id)
      fd.append('current_club', team.name)
      fd.append('email', form.email)
      fd.append('phone', form.phone)
      fd.append('bio', form.bio)
      if (form.years_experience) fd.append('years_experience', form.years_experience)
      if (photo) fd.append('photo', photo)
      if (coach) await updateCoach(coach.id, fd)
      else await createCoach(fd)
      onSaved()
    } catch (e) {
      setErr(e.response?.data ? JSON.stringify(e.response.data) : 'Save failed')
      setBusy(false)
    }
  }

  return (
    <Modal title={coach ? 'Edit coach' : 'Add coach'} onClose={onClose}>
      <Field label="Name"><input className="input" style={{ width: '100%' }} value={form.name} onChange={set('name')} /></Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Role">
          <select className="select" style={{ width: '100%' }} value={form.level} onChange={set('level')}>
            <option value="">— Role —</option>
            {Object.entries(COACH_LEVELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Country"><CountrySelect value={form.nationality} onChange={(v) => setForm((f) => ({ ...f, nationality: v }))} countries={countries} /></Field>
        <Field label="Years experience"><input className="input" style={{ width: '100%' }} type="number" value={form.years_experience} onChange={set('years_experience')} /></Field>
        <Field label="Photo"><input type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files?.[0] || null)} /></Field>
        <Field label="Email"><input className="input" style={{ width: '100%' }} value={form.email} onChange={set('email')} /></Field>
        <Field label="Phone"><input className="input" style={{ width: '100%' }} value={form.phone} onChange={set('phone')} /></Field>
      </div>
      <Field label="Bio"><textarea className="input" rows={3} style={{ width: '100%', resize: 'vertical' }} value={form.bio} onChange={set('bio')} /></Field>
      {err && <div style={{ color: 'var(--asw-slow)', fontSize: 12, marginTop: 6 }}>{err}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <button className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </Modal>
  )
}

function BoardModal({ member, team, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: member?.name || '',
    role: member?.role || '',
    email: member?.email || '',
    phone: member?.phone || '',
    bio: member?.bio || '',
  })
  const [photo, setPhoto] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const save = async () => {
    if (!form.name.trim()) { setErr('Name is required'); return }
    setBusy(true); setErr('')
    try {
      const fd = new FormData()
      fd.append('name', form.name.trim())
      fd.append('role', form.role)
      fd.append('team', team.id)
      fd.append('email', form.email)
      fd.append('phone', form.phone)
      fd.append('bio', form.bio)
      if (photo) fd.append('photo', photo)
      if (member) await updateBoardMember(member.id, fd)
      else await createBoardMember(fd)
      onSaved()
    } catch (e) {
      setErr(e.response?.data ? JSON.stringify(e.response.data) : 'Save failed')
      setBusy(false)
    }
  }

  return (
    <Modal title={member ? 'Edit board member' : 'Add board member'} onClose={onClose}>
      <Field label="Name"><input className="input" style={{ width: '100%' }} value={form.name} onChange={set('name')} /></Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Role"><input className="input" style={{ width: '100%' }} placeholder="e.g. President, Secretary General" value={form.role} onChange={set('role')} /></Field>
        <Field label="Photo"><input type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files?.[0] || null)} /></Field>
        <Field label="Email"><input className="input" style={{ width: '100%' }} value={form.email} onChange={set('email')} /></Field>
        <Field label="Phone"><input className="input" style={{ width: '100%' }} value={form.phone} onChange={set('phone')} /></Field>
      </div>
      <Field label="Bio"><textarea className="input" rows={3} style={{ width: '100%', resize: 'vertical' }} value={form.bio} onChange={set('bio')} /></Field>
      {err && <div style={{ color: 'var(--asw-slow)', fontSize: 12, marginTop: 6 }}>{err}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <button className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </Modal>
  )
}

function SwimmerModal({ swimmer, team, countries, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: swimmer?.name || '',
    birth_year: swimmer?.birth_year || '',
    sex: swimmer?.sex || 'M',
    nationality: swimmer?.nationality_detail?.id || swimmer?.nationality || team.country,
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const save = async () => {
    if (!form.name.trim() || !form.nationality) { setErr('Name and country are required'); return }
    setBusy(true); setErr('')
    try {
      const payload = {
        name: form.name.trim(),
        birth_year: form.birth_year || null,
        sex: form.sex,
        nationality: form.nationality,
        club: team.name,
      }
      if (swimmer) await updateSwimmer(swimmer.id, payload)
      else await createSwimmer(payload)
      onSaved()
    } catch (e) {
      setErr(e.response?.data ? JSON.stringify(e.response.data) : 'Save failed')
      setBusy(false)
    }
  }

  return (
    <Modal title={swimmer ? 'Edit swimmer' : 'Add swimmer'} onClose={onClose} width={480}>
      <Field label="Name"><input className="input" style={{ width: '100%' }} value={form.name} onChange={set('name')} /></Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Birth year"><input className="input" style={{ width: '100%' }} type="number" value={form.birth_year} onChange={set('birth_year')} /></Field>
        <Field label="Sex">
          <select className="select" style={{ width: '100%' }} value={form.sex} onChange={set('sex')}>
            <option value="M">Men</option>
            <option value="F">Women</option>
          </select>
        </Field>
      </div>
      <Field label="Country"><CountrySelect value={form.nationality} onChange={(v) => setForm((f) => ({ ...f, nationality: v }))} countries={countries} /></Field>
      {err && <div style={{ color: 'var(--asw-slow)', fontSize: 12, marginTop: 6 }}>{err}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <button className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </Modal>
  )
}

function ArticleModal({ team, onClose, onSaved }) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [cover, setCover] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const save = async () => {
    if (!title.trim()) { setErr('Title is required'); return }
    setBusy(true); setErr('')
    try {
      const fd = new FormData()
      fd.append('title', title.trim())
      fd.append('body', body)
      fd.append('team', team.id)
      fd.append('status', 'PUBLISHED')
      fd.append('published_at', new Date().toISOString().slice(0, 10))
      if (cover) fd.append('cover_image', cover)
      await createArticle(fd)
      onSaved()
    } catch (e) {
      setErr(e.response?.data ? JSON.stringify(e.response.data) : 'Save failed')
      setBusy(false)
    }
  }

  return (
    <Modal title="Add Club News" onClose={onClose}>
      <Field label="Title"><input className="input" style={{ width: '100%' }} value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
      <Field label="Body"><textarea className="input" rows={7} style={{ width: '100%', resize: 'vertical' }} value={body} onChange={(e) => setBody(e.target.value)} /></Field>
      <Field label="Cover image"><input type="file" accept="image/*" onChange={(e) => setCover(e.target.files?.[0] || null)} /></Field>
      {err && <div style={{ color: 'var(--asw-slow)', fontSize: 12, marginTop: 6 }}>{err}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <button className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Publishing…' : 'Publish'}</button>
      </div>
    </Modal>
  )
}

function AlbumModal({ team, onClose, onSaved }) {
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const save = async () => {
    if (!title.trim()) { setErr('Title is required'); return }
    setBusy(true); setErr('')
    try {
      await createAlbum({ title: title.trim(), team: team.id })
      onSaved()
    } catch (e) {
      setErr(e.response?.data ? JSON.stringify(e.response.data) : 'Save failed')
      setBusy(false)
    }
  }
  return (
    <Modal title="Add Album" onClose={onClose} width={440}>
      <Field label="Album title"><input className="input" style={{ width: '100%' }} value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
      {err && <div style={{ color: 'var(--asw-slow)', fontSize: 12, marginTop: 6 }}>{err}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <button className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Creating…' : 'Create'}</button>
      </div>
    </Modal>
  )
}

// ── Prediction tab ───────────────────────────────────────────

function PredictionTab({ id }) {
  const [pool, setPool] = useState('LCM')
  const [data, setData] = useState(null)

  useEffect(() => {
    let alive = true
    setData(null)
    getTeamPrediction(id, { pool })
      .then((res) => { if (alive) setData(res.data) })
      .catch(() => { if (alive) setData({ items: [] }) })
    return () => { alive = false }
  }, [id, pool])

  const items = data?.items || []
  return (
    <div className="pad-lg">
      <TabHeading title="Next-Season Projection" />
      <div style={{ textAlign: 'center', fontSize: 12.5, color: '#6b7d94', margin: '-8px 0 16px' }}>
        Linear trend over each swimmer's seasonal bests — a forecast, not a promise
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
        <Seg options={[{ value: 'LCM', label: 'LCM' }, { value: 'SCM', label: 'SCM' }]} value={pool} onChange={setPool} />
      </div>
      {data === null ? (
        <Loading label="Crunching seasons" />
      ) : items.length === 0 ? (
        <Empty label="Not enough multi-season data to project" />
      ) : (
        <div className="rule-t">
          {items.map((p, i) => {
            const improving = p.trend === 'improving'
            const declining = p.trend === 'declining'
            const color = improving ? 'var(--asw-fast)' : declining ? 'var(--asw-slow)' : 'var(--color-neutral-500)'
            return (
              <div key={`${p.swimmer_id}-${p.event_id}`} className="hair-b asw-fade-up" style={{ padding: '13px 0', borderLeft: `4px solid ${color}`, paddingLeft: 12, animationDelay: `${Math.min(i * 40, 400)}ms` }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <div>
                    <Link to={`/swimmers/${p.swimmer_id}`} style={{ color: 'inherit', textDecoration: 'none', fontWeight: 700, fontSize: 14 }}>{p.swimmer_name}</Link>
                    <span className="text-muted" style={{ fontSize: 13 }}> · {p.event_name}</span>
                  </div>
                  <span className="tag" style={{ background: color, color: '#fff', border: 0 }}>
                    {improving ? 'IMPROVING' : declining ? 'AT RISK' : 'STEADY'}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 18, marginTop: 6, flexWrap: 'wrap' }}>
                  <span>
                    <span className="micro" style={{ display: 'block' }}>Current best</span>
                    <span className="asw-time" style={{ fontSize: 17 }}>{p.current_best}</span>
                  </span>
                  <span>
                    <span className="micro" style={{ display: 'block' }}>Projected {p.target_year}</span>
                    <span className="asw-time" style={{ fontSize: 17, fontWeight: 800, color }}>{p.predicted}</span>
                  </span>
                  <span className="asw-num" style={{ fontSize: 12, fontWeight: 700, color }}>
                    {p.delta_cs <= 0 ? '−' : '+'}{formatTime(Math.abs(p.delta_cs))} ({Math.abs(p.delta_pct)}%)
                  </span>
                  <span className="micro">{p.seasons.map((s) => `${s.year}: ${s.best}`).join(' · ')}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Progression tab (date-based chart, fed styling) ──────────

const STROKES = [
  { value: 'Freestyle', label: 'Free' },
  { value: 'Backstroke', label: 'Back' },
  { value: 'Breaststroke', label: 'Breast' },
  { value: 'Butterfly', label: 'Fly' },
  { value: 'Individual Medley', label: 'IM' },
]
const LINE_HEX = ['#1c4e86', '#4a8fc0', '#0c2340', '#72a4cf', '#2f6cae', '#12253d', '#aecae4', '#17416f']

function TeamProgressionChart({ lines }) {
  const allPoints = lines.flatMap((l) => l.points || [])
  if (allPoints.length === 0) return <Empty label="No progression data for this stroke" />
  const ts = (d) => new Date(d).getTime()
  const csValues = allPoints.map((p) => p.time_cs).filter(Boolean)
  const minCs = Math.min(...csValues)
  const maxCs = Math.max(...csValues)
  const range = maxCs - minCs || 1
  const dates = allPoints.map((p) => ts(p.date))
  const minD = Math.min(...dates)
  const maxD = Math.max(...dates)
  const spanD = maxD - minD || 1
  const W = 620; const H = 220; const pL = 70; const pR = 20; const pT = 10; const pB = 30
  const x = (d) => pL + ((ts(d) - minD) / spanD) * (W - pL - pR)
  const y = (cs) => pT + ((cs - minCs) / range) * (H - pT - pB)
  const fmtAxis = (cs) => {
    const m = Math.floor(cs / 6000); const s = Math.floor((cs % 6000) / 100); const c = Math.round(cs % 100)
    return m ? `${m}:${String(s).padStart(2, '0')}` : `${s}.${String(c).padStart(2, '0')}`
  }
  const yearLabels = [...new Set(allPoints.map((p) => new Date(p.date).getFullYear()))].sort()
  return (
    <div className="table-scroll">
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: 640, height: 'auto' }}>
        {Array.from({ length: 4 }, (_, i) => {
          const cs = minCs + (range * i) / 3
          const yy = y(cs)
          return <g key={i}><line x1={pL} x2={W - pR} y1={yy} y2={yy} stroke="#e5e9ed" /><text x={pL - 8} y={yy + 4} textAnchor="end" fill="#58687c" fontSize="11" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtAxis(cs)}</text></g>
        })}
        {yearLabels.map((yr) => (
          <text key={yr} x={x(`${yr}-07-01`)} y={H - 4} textAnchor="middle" fill="#58687c" fontSize="10">{yr}</text>
        ))}
        {lines.map((line, li) => {
          const pts = (line.points || []).filter((p) => p.time_cs)
          if (pts.length < 2) return null
          const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.date)},${y(p.time_cs)}`).join(' ')
          return <path key={li} d={d} fill="none" stroke={LINE_HEX[li % LINE_HEX.length]} strokeWidth={2} />
        })}
        {lines.map((line, li) => (line.points || []).filter((p) => p.time_cs).map((p, pi) => (
          <circle key={`${li}-${pi}`} cx={x(p.date)} cy={y(p.time_cs)} r={3} fill={LINE_HEX[li % LINE_HEX.length]}>
            <title>{line.event_name} · {p.time} · {p.swimmer} · {p.meet}</title>
          </circle>
        )))}
      </svg>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', marginTop: 8, justifyContent: 'center' }}>
        {lines.map((l, i) => <span key={i} style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 12, height: 3, background: LINE_HEX[i % LINE_HEX.length], display: 'inline-block' }} />{l.event_name}</span>)}
      </div>
    </div>
  )
}

function ProgressionTab({ id }) {
  const [stroke, setStroke] = useState('Freestyle')
  const [pool, setPool] = useState('LCM')
  const [lines, setLines] = useState(null)

  useEffect(() => {
    let alive = true
    setLines(null)
    getTeamProgression(id, { stroke, pool })
      .then((r) => alive && setLines(Array.isArray(r.data) ? r.data : []))
      .catch(() => alive && setLines([]))
    return () => { alive = false }
  }, [id, stroke, pool])

  return (
    <div className="pad-lg">
      <TabHeading title="Time Progression" />
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 20 }}>
        <Seg options={STROKES} value={stroke} onChange={setStroke} />
        <Seg options={[{ value: 'LCM', label: 'LCM' }, { value: 'SCM', label: 'SCM' }]} value={pool} onChange={setPool} />
      </div>
      {lines === null ? <Loading label="Loading progression" /> : <TeamProgressionChart lines={lines} />}
    </div>
  )
}

// ── Records tab (fed pill filters + card grid) ───────────────

function RecordsTab({ records, photoById, sexById }) {
  const [gender, setGender] = useState('')
  const [pool, setPool] = useState('')

  const typesPresent = REC_TYPE_ORDER.filter((t) => records.some((r) => r.record_type === t))
  const [recType, setRecType] = useState('NATIONAL')
  const activeType = typesPresent.includes(recType) ? recType : (typesPresent[0] || 'NATIONAL')

  const filtered = records.filter((r) => {
    if (r.record_type !== activeType) return false
    if (gender && sexById[r.swimmer_id] !== gender) return false
    if (pool && r.pool !== pool) return false
    return true
  })

  const selStyle = { padding: '10px 20px', border: '1px solid #c0cad8', borderRadius: 6, fontSize: 14, fontWeight: 600, color: '#0b2948', background: '#fff', cursor: 'pointer', minWidth: 180, appearance: 'none', backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'8\'%3E%3Cpath d=\'M1 1l5 5 5-5\' stroke=\'%230b2948\' stroke-width=\'2\' fill=\'none\'/%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }
  const pillBase = { padding: '8px 18px', border: '2px solid #1a56a0', borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'inherit' }

  return (
    <div style={{ padding: '28px 28px', background: '#fff' }}>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{ fontSize: 28, marginBottom: 4 }}>🏅</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <div style={{ width: 60, height: 2, background: '#1a56a0' }} />
          <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 26, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#0b2948', margin: 0 }}>Records</h2>
          <div style={{ width: 60, height: 2, background: '#1a56a0' }} />
        </div>
      </div>

      {records.length === 0 ? <Empty label="No records held by this club" /> : (<>
      {typesPresent.length > 1 && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 20 }}>
          {typesPresent.map((t) => (
            <button key={t} type="button" onClick={() => setRecType(t)}
              style={activeType === t
                ? { ...pillBase, border: `2px solid ${REC_TYPE_COLORS[t]}`, background: REC_TYPE_COLORS[t], color: '#fff' }
                : { ...pillBase, border: `2px solid ${REC_TYPE_COLORS[t]}`, background: '#fff', color: REC_TYPE_COLORS[t] }}>
              {REC_TYPE_LABELS[t]} Records
            </button>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginBottom: 28, flexWrap: 'wrap' }}>
        <select style={selStyle} value={gender} onChange={(e) => setGender(e.target.value)}>
          <option value="">♂ Gender</option>
          <option value="M">♂ Men's</option>
          <option value="F">♀ Women's</option>
        </select>
        <select style={selStyle} value={pool} onChange={(e) => setPool(e.target.value)}>
          <option value="">🏊 Pool</option>
          <option value="LCM">LCM (50m)</option>
          <option value="SCM">SCM (25m)</option>
        </select>
      </div>

      {filtered.length === 0 ? <Empty label="No records for this selection" /> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 18 }}>
          {filtered.map((r, i) => {
            const photo = photoById[r.swimmer_id]
            const sex = sexById[r.swimmer_id]
            return (
              <div key={r.id ?? i} style={{ borderRadius: 16, textAlign: 'center', background: '#fff', border: '1px solid #e2e9f2', boxShadow: '0 2px 12px rgba(11,41,72,.08)', padding: '14px 14px 20px', display: 'flex', flexDirection: 'column' }}>
                <div style={{ width: '100%', aspectRatio: '1 / 1.05', borderRadius: 12, overflow: 'hidden', background: 'linear-gradient(180deg, #e9eef4, #d4dde8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 64, color: '#8a9bb5' }}>
                  {photo ? <img src={mediaUrl(photo)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} /> : '🏊'}
                </div>
                <div style={{ paddingTop: 16 }}>
                  <div style={{ fontWeight: 800, fontSize: 17, color: '#0b2948' }}>
                    <SwimmerLink id={r.swimmer_id} name={r.swimmer_name} />
                  </div>
                  <div style={{ fontSize: 13.5, color: '#1a56a0', fontWeight: 600, marginTop: 6 }}>{r.event_name} | {r.pool}</div>
                  <div className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 30, color: '#0d2d5e', letterSpacing: '-0.02em', marginTop: 6 }}>{typeof r.time === 'number' ? formatTime(r.time) : r.time}</div>
                </div>
                <div style={{ marginTop: 'auto', paddingTop: 12 }}>
                  <div style={{ fontSize: 12, color: '#8a9bb5' }}>{sex ? (sex === 'F' ? "Women's" : "Men's") : ''}{r.date ? `${sex ? ' · ' : ''}${formatDate(r.date)}` : ''}</div>
                </div>
              </div>
            )
          })}
        </div>
      )}
      </>)}
    </div>
  )
}

// ── Statistics tab (fed blue dashboard, computed client-side) ─

const PERF_BAR_COLORS = ['#e63946', '#f4845f', '#f7b731', '#f5d547', '#52c78a', '#27ae60', '#3b9dd6', '#2471a3', '#7d3c98', '#b0bec5']

function StatisticsTab({ team, times, medals, records, stats, ranking, medalBoxes, photoById, sexById }) {
  // Best swim per swimmer (from the times payload, which carries swimmer_sex)
  const bestBySwimmer = useMemo(() => {
    const by = {}
    times.forEach((t) => {
      if (!t.swimmer_id) return
      if (!by[t.swimmer_id] || (t.fina_points || 0) > (by[t.swimmer_id].fina_points || 0)) by[t.swimmer_id] = t
    })
    return Object.values(by).sort((a, b) => (b.fina_points || 0) - (a.fina_points || 0))
  }, [times])
  const maleTop = bestBySwimmer.filter((t) => t.swimmer_sex === 'M').slice(0, 5)
  const femaleTop = bestBySwimmer.filter((t) => t.swimmer_sex === 'F').slice(0, 5)

  // Medal counts per swimmer
  const medalists = useMemo(() => {
    const by = {}
    medals.forEach((m) => {
      if (!m.swimmer_id) return
      if (!by[m.swimmer_id]) by[m.swimmer_id] = { id: m.swimmer_id, name: m.swimmer_name, gold: 0, silver: 0, bronze: 0, total: 0 }
      const k = m.medal_type === 'GOLD' ? 'gold' : m.medal_type === 'SILVER' ? 'silver' : 'bronze'
      by[m.swimmer_id][k]++; by[m.swimmer_id].total++
    })
    return Object.values(by).sort((a, b) => b.gold - a.gold || b.silver - a.silver || b.bronze - a.bronze)
  }, [medals])
  const maleMedalists = medalists.filter((m) => sexById[m.id] === 'M').slice(0, 5)
  const femaleMedalists = medalists.filter((m) => sexById[m.id] === 'F').slice(0, 5)

  const latestRecord = [...records].sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0]
  const recBySwimmer = useMemo(() => {
    const by = {}
    records.forEach((r) => {
      if (!r.swimmer_id) return
      if (!by[r.swimmer_id]) by[r.swimmer_id] = { id: r.swimmer_id, name: r.swimmer_name, count: 0 }
      by[r.swimmer_id].count++
    })
    return Object.values(by).sort((a, b) => b.count - a.count)
  }, [records])
  const topRecordman = recBySwimmer[0]

  const perfTiers = [
    { label: 'World Class', range: '1000+', min: 1000, max: Infinity },
    { label: 'Super Elite', range: '900-999', min: 900, max: 1000 },
    { label: 'Elite', range: '700-799', min: 700, max: 900 },
    { label: 'Excellence', range: '600-699', min: 600, max: 700 },
    { label: 'Advanced', range: '500-599', min: 500, max: 600 },
    { label: 'Competitive', range: '400-499', min: 400, max: 500 },
    { label: 'Developing', range: '300-399', min: 300, max: 400 },
    { label: 'Fondation', range: '200-299', min: 200, max: 300 },
    { label: 'Novice', range: '100-199', min: 100, max: 200 },
    { label: 'Initiation', range: '0-99', min: 0, max: 100 },
  ]
  const perfDist = perfTiers.map((t) => ({
    ...t, count: bestBySwimmer.filter((s) => (s.fina_points || 0) >= t.min && (s.fina_points || 0) < t.max).length,
  }))
  const maxPerf = Math.max(...perfDist.map((d) => d.count), 1)

  // Fed card helpers
  const cardHeader = (title, sub) => (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <span style={{ width: 4, height: 17, background: 'linear-gradient(180deg, #1a56a0, #0b2948)', borderRadius: 2, flexShrink: 0 }} />
        <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 14.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#0b2948' }}>{title}</span>
      </div>
      <div style={{ fontSize: 10.5, color: '#7a8ca0', marginTop: 4, lineHeight: 1.3, paddingLeft: 13 }}>{sub}</div>
    </div>
  )
  const card = (children, extra = {}) => (
    <div style={{ background: '#fff', borderRadius: 6, padding: '14px 16px', boxShadow: '0 1px 4px rgba(0,0,0,.07)', border: '1px solid #dde3ea', ...extra }}>{children}</div>
  )
  const thStyle = { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8a9bb5', paddingBottom: 6, borderBottom: '2px solid #e2e8f0' }
  const rowStyle = (i) => ({ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid #f0f4f8', fontSize: 12.5, background: i % 2 === 1 ? '#fafbfd' : 'transparent' })
  const badge = { width: 24, height: 24, borderRadius: '50%', background: '#1a56a0', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0 }
  const mc = (color) => ({ width: 26, height: 26, borderRadius: '50%', background: color, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0 })

  const topPerfTable = (rows) => (
    <>
      <div style={{ display: 'flex', gap: 8, ...thStyle, padding: '0 0 6px' }}>
        <span style={{ width: 24 }}>#</span>
        <span style={{ flex: 1 }}>Swimmer</span>
        <span style={{ width: 120 }}>Event</span>
        <span style={{ width: 60, textAlign: 'right' }}>Time</span>
        <span style={{ width: 36, textAlign: 'right' }}>Pts</span>
      </div>
      {rows.map((t, i) => (
        <div key={t.swimmer_id} style={rowStyle(i)}>
          <span style={badge}>{i + 1}</span>
          <span style={{ flex: 1, fontWeight: 700, fontSize: 12.5, color: '#0b2948' }}><SwimmerLink id={t.swimmer_id} name={t.swimmer_name} /></span>
          <span style={{ width: 120, color: '#6b7d94', fontSize: 11 }}>{t.event_name}</span>
          <span className="asw-num" style={{ width: 60, textAlign: 'right', fontWeight: 800, color: '#0b2948', fontSize: 12.5 }}>{t.time}</span>
          <span className="asw-num" style={{ width: 36, textAlign: 'right', fontWeight: 900, color: '#1a56a0', fontSize: 13 }}>{t.fina_points ?? '—'}</span>
        </div>
      ))}
    </>
  )

  const decoratedTable = (rows) => (
    <>
      <div style={{ display: 'flex', gap: 8, ...thStyle, padding: '0 0 6px' }}>
        <span style={{ width: 24 }}>#</span>
        <span style={{ flex: 1 }}>Swimmer</span>
        <span style={{ width: 28, textAlign: 'center', color: '#d4af37', fontWeight: 900 }}>G</span>
        <span style={{ width: 28, textAlign: 'center', color: '#a8a9ad', fontWeight: 900 }}>S</span>
        <span style={{ width: 28, textAlign: 'center', color: '#cd7f32', fontWeight: 900 }}>B</span>
        <span style={{ width: 40, textAlign: 'center' }}>Total</span>
      </div>
      {rows.map((m, i) => (
        <div key={m.id ?? i} style={rowStyle(i)}>
          <span style={badge}>{i + 1}</span>
          <span style={{ flex: 1, fontWeight: 700, fontSize: 12.5, color: '#0b2948' }}><SwimmerLink id={m.id} name={m.name} /></span>
          <span style={mc('#d4af37')}>{m.gold}</span>
          <span style={mc('#a8a9ad')}>{m.silver}</span>
          <span style={mc('#cd7f32')}>{m.bronze}</span>
          <span className="asw-num" style={{ width: 40, textAlign: 'center', fontWeight: 900, fontSize: 14, color: '#0b2948' }}>{m.total}</span>
        </div>
      ))}
    </>
  )

  const recCard = (label, sub, content) => (
    <div style={{ background: '#fff', border: '1px solid #dde3ea', borderRadius: 6, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,.07)' }}>
      <div style={{ padding: '10px 12px 7px', borderBottom: '1px solid #f0f3f7' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 4, height: 14, background: 'linear-gradient(180deg, #1a56a0, #0b2948)', borderRadius: 2, flexShrink: 0 }} />
          <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 12, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#0b2948' }}>{label}</span>
        </div>
        <div style={{ fontSize: 9.5, color: '#7a8ca0', marginTop: 3, paddingLeft: 12 }}>{sub}</div>
      </div>
      {content}
    </div>
  )
  const recBody = (photo, name, id, subLabel, bigValue, dateStr) => (
    <div style={{ display: 'flex', alignItems: 'stretch', minHeight: 130 }}>
      <div style={{ width: 100, background: 'linear-gradient(170deg, #0d2d5e 0%, #1a56a0 60%, #3b82c4 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 38, color: 'rgba(255,255,255,0.35)', flexShrink: 0, overflow: 'hidden' }}>
        {photo ? <img src={mediaUrl(photo)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} /> : '🏊'}
      </div>
      <div style={{ padding: '12px 12px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ fontWeight: 800, fontSize: 12.5, color: '#0b2948', lineHeight: 1.2, marginBottom: 4 }}>
          <SwimmerLink id={id} name={name} />
        </div>
        <div style={{ fontSize: 10.5, color: '#7a8ca0', marginBottom: 6 }}>{subLabel}</div>
        <div className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 30, color: '#1a56a0', letterSpacing: '-0.02em', lineHeight: 1 }}>{bigValue}</div>
        {dateStr && <div style={{ fontSize: 10, color: '#9baab8', marginTop: 5 }}>{dateStr}</div>}
      </div>
    </div>
  )
  const recEmpty = <div style={{ padding: '30px', textAlign: 'center', color: '#bbb', fontSize: 13, minHeight: 130, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>—</div>

  const maxTotal = Math.max(...medalBoxes.map((m) => m.total), 1)
  const battle = ranking.slice(0, 10)
  const maxBattle = Math.max(...battle.map((r) => r.total), 1)

  return (
    <div style={{ background: '#f8fafc', padding: '28px 24px' }}>
      <div style={{ textAlign: 'center', marginBottom: 22 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 2, background: '#1a56a0' }} />
          <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 26, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#0b2948' }}>Statistics</span>
          <div style={{ width: 40, height: 2, background: '#1a56a0' }} />
        </div>
      </div>

      {/* Row 0: headline numbers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 10 }}>
        {[['Swimmers', stats?.swimmers, '#0b2948'], ['Race Swims', stats?.results, '#0b2948'], ['Championships', stats?.championships, '#0b2948'],
          ['Gold', stats?.medals?.gold, '#d4af37'], ['Silver', stats?.medals?.silver, '#a8a9ad'], ['Bronze', stats?.medals?.bronze, '#cd7f32']].map(([label, v, color]) => (
          <div key={label} style={{ background: '#fff', border: '1px solid #dde3ea', borderRadius: 6, boxShadow: '0 1px 4px rgba(0,0,0,.07)', padding: '14px 12px', textAlign: 'center' }}>
            <div className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 26, color }}>{formatNumber(v)}</div>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#5a6b80', marginTop: 3 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Row 1: Top Performance Men | Women */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
        {card(<>{cardHeader('Top Performance · Men', `Best Performances by ${team.name} Male Swimmers (FINA Points)`)}{maleTop.length ? topPerfTable(maleTop) : <Empty label="No data" />}</>)}
        {card(<>{cardHeader('Top Performance · Women', `Best Performances by ${team.name} Female Swimmers (FINA Points)`)}{femaleTop.length ? topPerfTable(femaleTop) : <Empty label="No data" />}</>)}
      </div>

      {/* Row 2: Medals by competition | Most Decorated Men | Women */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
        {card(<>
          {cardHeader('Medals', 'Total Medals by Competition')}
          <div style={{ display: 'flex', gap: 12, marginBottom: 10, fontSize: 11 }}>
            {[['Gold', '#d4af37'], ['Silver', '#a8a9ad'], ['Bronze', '#cd7f32']].map(([lbl, c]) => (
              <span key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 11, height: 11, borderRadius: '50%', background: c, display: 'inline-block' }} />{lbl}
              </span>
            ))}
          </div>
          {medalBoxes.length === 0 ? <Empty label="No medals" /> : medalBoxes.map((m) => (
            <div key={m.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', fontSize: 12 }}>
              <span style={{ width: 88, fontSize: 11.5, fontWeight: 700, flexShrink: 0, color: '#374151' }}>{m.name}</span>
              <div style={{ flex: 1, height: 20, display: 'flex', background: '#e8eef6', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${(m.total / maxTotal) * 100}%`, display: 'flex', minWidth: m.total > 0 ? 20 : 0 }}>
                  {[['gold', '#d4af37'], ['silver', '#a8a9ad'], ['bronze', '#cd7f32']].map(([key, color]) =>
                    m[key] > 0 && <div key={key} style={{ flex: m[key], background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 10, minWidth: 14 }} className="asw-num">{m[key]}</div>
                  )}
                </div>
              </div>
              <span className="asw-num" style={{ width: 26, textAlign: 'right', fontWeight: 900, color: '#0b2948', fontSize: 13, flexShrink: 0 }}>{m.total}</span>
            </div>
          ))}
        </>)}
        {card(<>{cardHeader('Most Decorated · Men', `Top 5 ${team.name} Male Swimmers by Total Medals`)}{maleMedalists.length ? decoratedTable(maleMedalists) : <Empty label="No data" />}</>)}
        {card(<>{cardHeader('Most Decorated · Women', `Top 5 ${team.name} Female Swimmers by Total Medals`)}{femaleMedalists.length ? decoratedTable(femaleMedalists) : <Empty label="No data" />}</>)}
      </div>

      {/* Row 3: Latest Record | Top Recordman | Best FINA | Top Medalist */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
        {recCard('Latest Record', `Most Recent ${team.name} Record`,
          latestRecord ? recBody(photoById[latestRecord.swimmer_id], latestRecord.swimmer_name, latestRecord.swimmer_id, latestRecord.event_name, typeof latestRecord.time === 'number' ? formatTime(latestRecord.time) : latestRecord.time, formatDate(latestRecord.date)) : recEmpty)}
        {recCard('Top Recordman', `${team.name} Swimmer Holding the Most Records`,
          topRecordman ? recBody(photoById[topRecordman.id], topRecordman.name, topRecordman.id, 'Total Records', topRecordman.count, null) : recEmpty)}
        {recCard('Highest FINA', `Best FINA Performance in ${team.name} History`,
          stats?.best_fina ? recBody(photoById[stats.best_fina.swimmer_id], stats.best_fina.swimmer_name, stats.best_fina.swimmer_id, stats.best_fina.event_name, stats.best_fina.points, null) : recEmpty)}
        {recCard('Top Medalist', `${team.name} Swimmer with the Most Medals`,
          stats?.top_medalist ? recBody(photoById[stats.top_medalist.swimmer_id], stats.top_medalist.swimmer_name, stats.top_medalist.swimmer_id, 'Total Medals', stats.top_medalist.count, null) : recEmpty)}
      </div>

      {/* Row 4: Performance Index | Club Battle */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
        <div style={{ background: '#fff', borderRadius: 6, padding: '14px 16px', boxShadow: '0 1px 4px rgba(0,0,0,.07)', border: '1px solid #dde3ea' }}>
          {cardHeader('Performance Index', `Distribution of ${team.name} Swimmers by Performance Level`)}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 180, marginTop: 10 }}>
            {perfDist.map((d, i) => (
              <div key={d.label} style={{ flex: 1, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                {d.count > 0 && <div className="asw-num" style={{ fontSize: 11, fontWeight: 900, marginBottom: 4, color: '#0b2948' }}>{d.count}</div>}
                <div style={{ width: '75%', height: `${Math.max(4, (d.count / maxPerf) * 140)}px`, background: PERF_BAR_COLORS[i], borderRadius: '3px 3px 0 0' }} />
                <div style={{ fontSize: 7.5, marginTop: 6, lineHeight: 1.2, color: '#5a6b80', fontWeight: 700, wordBreak: 'break-word' }}>{d.label}</div>
                <div style={{ fontSize: 6.5, color: '#9baab8', marginTop: 1 }}>({d.range})</div>
              </div>
            ))}
          </div>
        </div>
        {card(<>
          {cardHeader('Club Battle', 'Total Medals — Clubs of the Same Country')}
          {battle.length === 0 ? <Empty label="No data" /> : battle.map((r) => {
            const mine = r.is_current
            return (
              <div key={r.team_id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 12 }}>
                <span style={{ width: 110, fontSize: 11.5, fontWeight: mine ? 900 : 600, flexShrink: 0, color: mine ? '#1a56a0' : '#374151', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{r.team_name}</span>
                <div style={{ flex: 1, height: 18, background: '#e8eef6', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${(r.total / maxBattle) * 100}%`, height: '100%', background: mine ? '#1a56a0' : '#9db8d6', borderRadius: 3, minWidth: r.total > 0 ? 8 : 0 }} />
                </div>
                <span className="asw-num" style={{ width: 28, textAlign: 'right', fontWeight: 800, color: '#0b2948', fontSize: 13, flexShrink: 0 }}>{r.total}</span>
              </div>
            )
          })}
        </>)}
      </div>
    </div>
  )
}

// ── Compare tab (club vs club, fed VS table) ─────────────────

function CompareTab({ team, profile, stats, records }) {
  const [clubs, setClubs] = useState([])
  const [otherId, setOtherId] = useState('')
  const [other, setOther] = useState(null) // {profile, stats, records}
  const [loadingOther, setLoadingOther] = useState(false)

  useEffect(() => {
    let alive = true
    getTeams({ country: team.country, page_size: 300 })
      .then((r) => {
        const rows = list(r.data)
        if (alive) setClubs(rows.filter((t) => t.id !== team.id).sort((a, b) => a.name.localeCompare(b.name)))
      })
      .catch(() => alive && setClubs([]))
    return () => { alive = false }
  }, [team.id, team.country])

  useEffect(() => {
    if (!otherId) { setOther(null); return }
    let alive = true; setLoadingOther(true)
    Promise.allSettled([getTeamProfile(otherId), getTeamStats(otherId), getTeamRecords(otherId)])
      .then(([p, s, r]) => {
        if (!alive) return
        setOther({
          profile: p.status === 'fulfilled' ? p.value.data : null,
          stats: s.status === 'fulfilled' ? s.value.data : null,
          records: r.status === 'fulfilled' ? list(r.value.data) : [],
        })
      })
      .finally(() => alive && setLoadingOther(false))
    return () => { alive = false }
  }, [otherId])

  const rows = other ? [
    ['Swimmers', stats?.swimmers ?? 0, other.stats?.swimmers ?? 0],
    ['Race Swims', stats?.results ?? 0, other.stats?.results ?? 0],
    ['Championships', stats?.championships ?? 0, other.stats?.championships ?? 0],
    ['Gold Medals', stats?.medals?.gold ?? 0, other.stats?.medals?.gold ?? 0],
    ['Silver Medals', stats?.medals?.silver ?? 0, other.stats?.medals?.silver ?? 0],
    ['Bronze Medals', stats?.medals?.bronze ?? 0, other.stats?.medals?.bronze ?? 0],
    ['Medals Total', stats?.medals?.total ?? 0, other.stats?.medals?.total ?? 0],
    ['Best FINA Points', stats?.best_fina?.points ?? 0, other.stats?.best_fina?.points ?? 0],
    ['Records Held', records.length, other.records.length],
  ] : []

  const clubBadge = (t) => (
    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ width: 26, height: 26, borderRadius: '50%', background: '#fff', overflow: 'hidden', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {t?.logo
          ? <img src={mediaUrl(t.logo)} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          : <span style={{ fontSize: 9, fontWeight: 900, color: '#0b2948' }}>{acronym(t?.name)}</span>}
      </span>
      {t?.name}
    </span>
  )

  return (
    <div className="pad-lg">
      <TabHeading title="Club Comparison" />
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 14, margin: '18px 0 26px', flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, color: '#0b2948' }}>{team.name}</span>
        <span style={{ fontWeight: 900, color: '#1a56a0', fontSize: 15 }}>VS</span>
        <select value={otherId} onChange={(e) => setOtherId(e.target.value)} style={{ padding: '9px 14px', border: '2px solid #1a56a0', borderRadius: 6, fontSize: 13.5, fontWeight: 700, color: '#0b2948', background: '#fff', fontFamily: 'inherit' }}>
          <option value="">Choose a club…</option>
          {clubs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      {loadingOther && <Loading label="Loading club" />}
      {!loadingOther && !other && <Empty label="Pick a club to compare against" />}
      {!loadingOther && other && (
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#0b2948', color: '#fff', borderRadius: '8px 8px 0 0', fontWeight: 800, fontSize: 14, gap: 10 }}>
            {clubBadge(team)}
            {clubBadge(other.profile?.team)}
          </div>
          {rows.map(([label, a, b], i) => {
            const winA = a > b; const winB = b > a
            const numStyle = (win) => ({ width: 110, fontWeight: 900, fontSize: 16, color: win ? '#1a56a0' : '#6b7a90' })
            return (
              <div key={label} style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', background: i % 2 ? '#f4f8fc' : '#fff', borderBottom: '1px solid #e3ecf5' }}>
                <span className="asw-num" style={{ ...numStyle(winA), textAlign: 'left' }}>{formatNumber(a)}</span>
                <span style={{ flex: 1, textAlign: 'center', fontSize: 12.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#374151' }}>{label}</span>
                <span className="asw-num" style={{ ...numStyle(winB), textAlign: 'right' }}>{formatNumber(b)}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────

export default function TeamDetail() {
  const { id } = useParams()
  const { isAdmin, managesTeam } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') || 'overview'
  const setTab = (t) => setSearchParams({ tab: t }, { replace: true })

  const [profile, setProfile] = useState(null)
  const [medals, setMedals] = useState([])
  const [times, setTimes] = useState([])
  const [records, setRecords] = useState([])
  const [stats, setStats] = useState(null)
  const [ranking, setRanking] = useState([])
  const [coaches, setCoaches] = useState([])
  const [board, setBoard] = useState([])
  const [articles, setArticles] = useState([])
  const [albums, setAlbums] = useState([])
  const [countries, setCountries] = useState([])
  const [loading, setLoading] = useState(true)
  const [teamSub, setTeamSub] = useState('coaches')
  const [modal, setModal] = useState(null) // {type, payload}

  const load = useCallback(async (alive = { current: true }) => {
    const [profRes, medalsRes, timesRes, recRes, statsRes, rankRes, coachRes, newsRes, albumRes, boardRes] = await Promise.allSettled([
      getTeamProfile(id),
      getTeamMedals(id),
      getTeamTimes(id),
      getTeamRecords(id),
      getTeamStats(id),
      getTeamRanking(id),
      getCoaches({ team: id }),
      getArticles({ team: id, status: 'PUBLISHED', ordering: '-published_at' }),
      getAlbums({ team: id }),
      getBoardMembers({ team: id }),
    ])
    if (!alive.current) return
    const val = (r) => (r.status === 'fulfilled' ? r.value.data : null)
    setProfile(val(profRes))
    setMedals(list(val(medalsRes)))
    setTimes(list(val(timesRes)))
    setRecords(list(val(recRes)))
    setStats(val(statsRes))
    setRanking(list(val(rankRes)))
    setCoaches(list(val(coachRes)))
    setArticles(list(val(newsRes)))
    setAlbums(list(val(albumRes)))
    setBoard(list(val(boardRes)))
  }, [id])

  useEffect(() => {
    const alive = { current: true }
    setLoading(true)
    load(alive).finally(() => { if (alive.current) setLoading(false) })
    return () => { alive.current = false }
  }, [load])

  const canManage = managesTeam(profile?.team)

  useEffect(() => {
    if (!canManage) return
    getCountries({ page_size: 300 }).then((res) => setCountries(list(res.data))).catch(() => {})
  }, [canManage])

  const refresh = () => { setModal(null); load() }

  const team = profile?.team
  const roster = useMemo(() => (profile?.roster || []).filter((s) => !s.is_relay_team), [profile])
  const photoById = useMemo(() => {
    const m = {}
    roster.forEach((s) => { if (s.photo) m[s.id] = s.photo })
    return m
  }, [roster])
  const sexById = useMemo(() => {
    const m = {}
    roster.forEach((s) => { if (s.sex) m[s.id] = s.sex })
    return m
  }, [roster])
  const trophies = team?.trophies || []
  const medalBoxes = useMemo(() => (profile?.classification_breakdown || [])
    .map((c) => ({ name: c.name, gold: c.GOLD || 0, silver: c.SILVER || 0, bronze: c.BRONZE || 0, total: (c.GOLD || 0) + (c.SILVER || 0) + (c.BRONZE || 0) }))
    .sort((a, b) => b.total - a.total), [profile])
  const medalists = useMemo(() => {
    const by = {}
    medals.forEach((m) => {
      if (!m.swimmer_id) return
      if (!by[m.swimmer_id]) by[m.swimmer_id] = { id: m.swimmer_id, name: m.swimmer_name, gold: 0, silver: 0, bronze: 0, total: 0 }
      const k = m.medal_type === 'GOLD' ? 'gold' : m.medal_type === 'SILVER' ? 'silver' : 'bronze'
      by[m.swimmer_id][k]++; by[m.swimmer_id].total++
    })
    return Object.values(by).sort((a, b) => b.gold - a.gold || b.silver - a.silver || b.bronze - a.bronze)
  }, [medals])

  if (loading) return <Loading label="Loading club" />
  if (!team) return <Empty label="Club not found" />

  const navy = '#0c2340'
  const kickerText = team.is_national_team ? 'National Swimming Team' : 'Swimming Club'
  const usDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : ''

  const heroIcon = (d) => (
    <span style={{ width: 28, height: 28, borderRadius: '50%', background: '#1a56a0', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
    </span>
  )
  const contactRow = (ic, content) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14.5, fontWeight: 600, color: navy }}>
      {ic}{content}
    </div>
  )

  const secTitle = (text) => {
    const taperL = { width: 130, height: 3, background: 'linear-gradient(to left, #0d2d5e, rgba(13,45,94,0))', transform: 'skewX(-30deg)' }
    const taperR = { width: 130, height: 3, background: 'linear-gradient(to right, #0d2d5e, rgba(13,45,94,0))', transform: 'skewX(-30deg)' }
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 18, margin: '26px 0 22px' }}>
        <div style={taperL} />
        <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 25, letterSpacing: '0.02em', textTransform: 'uppercase', color: '#123a7d', margin: 0, whiteSpace: 'nowrap' }}>{text}</h3>
        <div style={taperR} />
      </div>
    )
  }

  // Fed news card (overview + news tab)
  const newsCard = (a, i) => {
    const inner = (
      <>
        <div style={{ position: 'relative', margin: 10, height: 200, borderRadius: 8, overflow: 'hidden', background: a?.cover_image ? '#0b2948' : 'linear-gradient(135deg, #c8d8e8, #dde6f0)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, color: '#8a9bb5', flex: 'none' }}>
          {a?.cover_image ? (
            <>
              <img src={mediaUrl(a.cover_image)} alt="" aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(20px)', transform: 'scale(1.15)', opacity: 0.5 }} />
              <img src={mediaUrl(a.cover_image)} alt="" style={{ position: 'relative', width: '100%', height: '100%', objectFit: 'contain' }} />
            </>
          ) : '📷'}
        </div>
        <div style={{ padding: '4px 14px 16px', display: 'flex', flexDirection: 'column', flex: 1, textAlign: 'left' }}>
          <div style={{ fontSize: 12, color: '#1a56a0', fontWeight: 600, marginBottom: 9 }}>{a ? usDate(a.published_at || a.created_at) : 'Coming soon'}</div>
          <div style={{ fontSize: 14.5, color: '#0b2948', fontWeight: 700, lineHeight: 1.5 }}>{a ? a.title : 'Club news will appear here'}</div>
          <div style={{ marginTop: 'auto', paddingTop: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12.5, color: '#0b2948', fontWeight: 700 }}>Read more</span>
            <span style={{ color: '#1a56a0', fontWeight: 800 }}>→</span>
          </div>
        </div>
      </>
    )
    const cardStyle = { borderRadius: 12, overflow: 'hidden', background: '#fdfeff', boxShadow: '0 3px 12px rgba(11,41,72,.07)', display: 'flex', flexDirection: 'column', minHeight: 425, textDecoration: 'none' }
    return a
      ? <Link key={a.id} to={`/news/${a.id}`} style={cardStyle}>{inner}</Link>
      : <div key={`ph-${i}`} style={cardStyle}>{inner}</div>
  }

  // Fed person card (board + coaches) with "Listen to message" footer
  const waveHeights = [7, 12, 5, 15, 9, 17, 6, 13, 8, 16, 5, 11, 14, 7, 18, 10, 5, 13, 7, 15, 9, 6, 12, 8]
  const personCard = ({ role, name, photo, actions }, i) => (
    <div key={i} style={{ borderRadius: 16, textAlign: 'center', background: '#fff', border: '1px solid #e2e9f2', boxShadow: '0 2px 12px rgba(11,41,72,.08)', padding: '14px 14px 20px', display: 'flex', flexDirection: 'column', minHeight: 370 }}>
      <div style={{ width: '100%', aspectRatio: '1 / 1.05', borderRadius: 12, background: photo ? `url(${mediaUrl(photo)}) center/cover` : 'linear-gradient(180deg, #e9eef4, #d4dde8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 64, color: '#8a9bb5' }}>{photo ? '' : '👤'}</div>
      <div style={{ paddingTop: 16 }}>
        <div style={{ fontWeight: 800, fontSize: 17, color: '#0b2948' }}>{name}</div>
        <div style={{ fontSize: 13.5, color: '#1a56a0', fontWeight: 600, marginTop: 6 }}>{role}</div>
      </div>
      <div style={{ marginTop: 'auto', paddingTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#0d2d5e', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'pointer', boxShadow: '0 2px 6px rgba(11,41,72,.25)' }}>
            <div style={{ width: 0, height: 0, borderTop: '6px solid transparent', borderBottom: '6px solid transparent', borderLeft: '10px solid #fff', marginLeft: 3 }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, height: 20 }}>
            {waveHeights.map((h, k) => (
              <span key={k} style={{ width: 2, height: h, background: '#0d2d5e', borderRadius: 2, display: 'inline-block' }} />
            ))}
          </div>
        </div>
        <div style={{ fontSize: 12, color: '#0b2948', fontWeight: 600, marginTop: 8 }}>Listen to message</div>
        {actions && <div style={{ display: 'flex', gap: 6, marginTop: 10, justifyContent: 'center' }}>{actions}</div>}
      </div>
    </div>
  )

  const medalBadge = (type) => {
    const map = { GOLD: ['G', 'var(--asw-gold)'], SILVER: ['S', 'var(--asw-silver)'], BRONZE: ['B', '#c88a4d'] }
    const [letter, bg] = map[type] || ['?', '#999']
    return <span className="asw-num" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: '50%', background: bg, color: '#fff', fontWeight: 900, fontSize: 12 }}>{letter}</span>
  }

  return (
    <div>
      {/* ===== ISF-style club header ===== */}
      <div className="rule-b" style={{ position: 'relative', overflow: 'hidden', background: 'linear-gradient(120deg, #eef5fc 0%, #f6fafe 45%, #dcecf9 100%)' }}>
        <style>{`
          @media (max-width: 760px) {
            .fed-hero-photo { display: none; }
            .fed-hero-flag { width: 108px !important; height: 108px !important; }
          }
        `}</style>
        <FedHeroPhoto candidates={roster.map((s) => s.photo)} extras={articles.map((a) => a?.cover_image)} />
        <div style={{ position: 'relative', padding: '20px 32px 30px' }}>
          <Link to="/teams" style={{ fontSize: 12, textDecoration: 'none', fontWeight: 700, color: '#1a56a0' }}>← All clubs</Link>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 26, marginTop: 16, flexWrap: 'wrap' }}>
            {/* Circular club logo */}
            <div className="fed-hero-flag" style={{
              width: 148, height: 148, borderRadius: '50%', background: '#fff', flexShrink: 0,
              border: `4px solid ${navy}`, boxShadow: '0 0 0 6px #fff, 0 6px 24px rgba(12,35,64,0.18)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
            }}>
              {team.logo ? (
                <img src={mediaUrl(team.logo)} alt={team.name} style={{ width: '84%', height: '84%', objectFit: 'contain' }} />
              ) : (
                <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 34, color: navy }}>{acronym(team.name)}</span>
              )}
            </div>
            <div style={{ minWidth: 260, maxWidth: 560 }}>
              <h1 style={{
                margin: 0, fontFamily: 'var(--font-heading)', fontWeight: 900,
                fontSize: 'clamp(28px, 4vw, 42px)', lineHeight: 1.04, letterSpacing: '-0.02em',
                color: navy, textTransform: 'uppercase',
              }}>
                {team.name}
              </h1>
              <div style={{ marginTop: 6, fontSize: 15, fontWeight: 700, color: '#1a56a0', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <Flag code={team.country_detail?.code} name={team.country_detail?.name} />
                <span>{kickerText}{team.country_detail?.name ? ` · ${team.country_detail.name}` : ''}{team.founded_year ? ` · Est. ${team.founded_year}` : ''}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 16 }}>
                {team.phone && contactRow(
                  heroIcon(<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />),
                  <span className="asw-num">{team.phone}</span>)}
                {team.email && contactRow(
                  heroIcon(<><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></>),
                  <span>{team.email}</span>)}
                {team.website && contactRow(
                  heroIcon(<><circle cx="12" cy="12" r="10" /><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" /><path d="M2 12h20" /></>),
                  <a href={/^https?:/.test(team.website) ? team.website : `https://${team.website}`}
                    target="_blank" rel="noreferrer" style={{ color: navy, textDecoration: 'none' }}>
                    {team.website.replace(/^https?:\/\//, '')}
                  </a>)}
                {contactRow(
                  heroIcon(<><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" /><circle cx="12" cy="10" r="3" /></>),
                  <span>{team.address || team.country_detail?.name || '—'}</span>)}
              </div>
              {canManage && (
                <button className="btn btn-secondary" style={{ fontSize: 12, marginTop: 14 }} onClick={() => setModal({ type: 'club' })}>Edit club</button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="rule-b" style={{ padding: '0 32px', display: 'flex', gap: 0, overflowX: 'auto' }}>
        {TABS.map((t) => (
          <button key={t.value} type="button" onClick={() => setTab(t.value)}
            style={{
              padding: '12px 16px', background: 'none', border: 'none', borderBottom: tab === t.value ? '3px solid var(--color-accent)' : '3px solid transparent',
              cursor: 'pointer', fontFamily: 'var(--font-heading)', fontWeight: tab === t.value ? 800 : 600,
              fontSize: 13, color: tab === t.value ? 'var(--color-accent)' : 'var(--color-text)', whiteSpace: 'nowrap',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ===== OVERVIEW ===== */}
      {tab === 'overview' && (() => {
        const bestPerf = (() => {
          let best = null
          times.forEach((t) => { if (!best || (t.fina_points || 0) > (best.fina_points || 0)) best = t })
          return best
        })()
        const topMedalist = medalists[0]
        const newestRecord = [...records].sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0]
        // 5+ distinct record holders, varied events, LCM first — like the fed ticker
        const seenHolders = new Set(); const seenEvents = new Set()
        const pickHolders = (requireNewEvent) => {
          const out = []
          const ordered = [...records].sort((a, b) => (a.pool === 'LCM' ? 0 : 1) - (b.pool === 'LCM' ? 0 : 1))
          for (const r of ordered) {
            if (!r.swimmer_id) continue
            if (seenHolders.has(r.swimmer_id)) continue
            if (requireNewEvent && seenEvents.has(r.event_name)) continue
            seenHolders.add(r.swimmer_id); seenEvents.add(r.event_name); out.push(r)
          }
          return out
        }
        const topRecords = [...pickHolders(true), ...pickHolders(false)].slice(0, 12)
        const hCard = { background: '#fff', borderRadius: 14, display: 'flex', gap: 14, padding: 10, boxShadow: '0 3px 12px rgba(11,41,72,.08)', position: 'relative' }
        const hPhoto = { width: 150, height: 152, borderRadius: 10, background: 'linear-gradient(135deg, #d6e4f0, #e2eaf3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 46, color: '#8a9bb5', flexShrink: 0, overflow: 'hidden' }
        const hBody = { padding: '12px 8px 10px 2px', flex: 1, display: 'flex', flexDirection: 'column' }
        const hTitle = { fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 15, letterSpacing: '0.02em', textTransform: 'uppercase', color: '#0b2948', marginBottom: 7, lineHeight: 1.3 }
        const hBig = { fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 29, color: '#1a56a0', letterSpacing: '-0.02em', lineHeight: 1.1 }
        const hSub = { fontSize: 12.5, color: '#33415c', marginTop: 4 }
        const barsIcon = (
          <span style={{ position: 'absolute', right: 16, bottom: 14, display: 'inline-flex', alignItems: 'flex-end', gap: 2.5 }}>
            {[7, 12, 17, 22].map((h, k) => <span key={k} style={{ width: 4.5, height: h, background: '#1a56a0', borderRadius: 1.5, display: 'inline-block' }} />)}
          </span>
        )
        const infoCell = (label, value) => (
          <div key={label}>
            <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#7a8ca0' }}>{label}</div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0b2948', marginTop: 3, overflowWrap: 'anywhere' }}>{value || '—'}</div>
          </div>
        )
        const newsItems = articles.length > 0 ? articles.slice(0, 4) : [null, null, null, null]
        return (
          <div style={{ padding: '0 28px 32px', background: '#eaf1f9' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 352px', gap: 24, alignItems: 'start', paddingTop: 18 }}>
              {/* LEFT: Latest News + About/Info */}
              <div>
                <div style={{ textAlign: 'center', marginBottom: 2 }}><span style={{ fontSize: 22, color: '#123a7d' }}>🏊</span></div>
                {secTitle('Latest News')}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
                  {newsItems.map(newsCard)}
                </div>

                {/* About + Club Information — fills the gap below the news cards */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 14 }}>
                  <div style={{ borderRadius: 12, background: '#fdfeff', boxShadow: '0 3px 12px rgba(11,41,72,.07)', padding: '20px 22px' }}>
                    <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 13, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#123a7d', marginBottom: 8 }}>About the Club</div>
                    {team.description
                      ? <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.7, color: '#33415c', whiteSpace: 'pre-line' }}>{team.description}</p>
                      : <div style={{ fontSize: 13, color: '#8a9bb5' }}>No description yet.</div>}
                  </div>
                  <div style={{ borderRadius: 12, background: '#fdfeff', boxShadow: '0 3px 12px rgba(11,41,72,.07)', padding: '20px 22px' }}>
                    <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 13, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#123a7d', marginBottom: 12 }}>Club Information</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                      {infoCell('Founded', team.founded_year)}
                      {infoCell('Country', team.country_detail?.name)}
                      {infoCell('Swimmers', formatNumber(roster.length))}
                      {infoCell('Records Held', formatNumber(records.length))}
                      {infoCell('Championships', formatNumber(stats?.championships))}
                      {infoCell('Total Medals', formatNumber(stats?.medals?.total ?? medals.length))}
                    </div>
                  </div>
                </div>

                {/* Trophies */}
                {trophies.length > 0 && (
                  <div style={{ borderRadius: 12, background: '#fdfeff', boxShadow: '0 3px 12px rgba(11,41,72,.07)', padding: '20px 22px', marginTop: 14 }}>
                    <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 13, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#123a7d', marginBottom: 12 }}>Trophies · {trophies.length}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                      {trophies.map((t, i) => (
                        <div key={t.id ?? i} style={{ border: '1px solid #e2e9f2', borderLeft: '4px solid var(--asw-gold)', borderRadius: 8, padding: '12px 14px', background: '#fff' }}>
                          <div style={{ fontWeight: 700, fontSize: 13, color: '#0b2948' }}>🏆 {t.name}</div>
                          <div className="asw-num" style={{ fontWeight: 800, fontSize: 13, marginTop: 4, color: '#5a6b80' }}>{t.year}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* RIGHT: Highlight cards */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Best Performance */}
                <div style={hCard}>
                  <div style={hPhoto}>
                    {photoById[bestPerf?.swimmer_id] ? <img src={mediaUrl(photoById[bestPerf.swimmer_id])} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} /> : '🏊'}
                  </div>
                  <div style={hBody}>
                    <div style={hTitle}>Best<br />Performance</div>
                    <div style={hBig}>{bestPerf?.time || '—'}</div>
                    <div style={hSub}>{bestPerf?.event_name || ''}</div>
                    <div style={{ ...hSub, fontWeight: 700, color: '#0b2948' }}>{bestPerf?.swimmer_name || ''}</div>
                    {bestPerf?.fina_points && <div style={{ ...hSub, color: '#5a6b80' }}>{bestPerf.fina_points} FINA pts</div>}
                  </div>
                  {barsIcon}
                </div>

                {/* Most Decorated Swimmer */}
                <div style={hCard}>
                  <div style={hPhoto}>
                    {photoById[topMedalist?.id] ? <img src={mediaUrl(photoById[topMedalist.id])} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} /> : '🏊'}
                  </div>
                  <div style={hBody}>
                    <div style={hTitle}>Most Decorated<br />Swimmer</div>
                    <div style={hBig}>{topMedalist?.total || 0}</div>
                    <div style={hSub}>Total Medals</div>
                    <div style={{ ...hSub, fontWeight: 700, color: '#0b2948' }}>{topMedalist?.name || '—'}</div>
                  </div>
                  <span style={{ position: 'absolute', right: 14, bottom: 12, fontSize: 24 }}>🏆</span>
                </div>

                {/* New Record */}
                <div style={hCard}>
                  <div style={hPhoto}>
                    {photoById[newestRecord?.swimmer_id] ? <img src={mediaUrl(photoById[newestRecord.swimmer_id])} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} /> : '🏊'}
                  </div>
                  <div style={hBody}>
                    <div style={hTitle}>New Record</div>
                    <div style={hBig}>{newestRecord ? (typeof newestRecord.time === 'number' ? formatTime(newestRecord.time) : newestRecord.time) : '—'}</div>
                    <div style={hSub}>{newestRecord?.event_name || ''}</div>
                    <div style={{ ...hSub, fontWeight: 700, color: '#0b2948' }}>{newestRecord?.swimmer_name || ''}</div>
                    {newestRecord?.date && <div style={hSub}>{usDate(newestRecord.date)}</div>}
                  </div>
                  {newestRecord && <span style={{ position: 'absolute', right: 14, bottom: 14, fontSize: 11, fontWeight: 800, background: '#0d2d5e', color: '#fff', padding: '4px 12px', borderRadius: 14, letterSpacing: '0.04em' }}>NEW</span>}
                </div>

                {/* Quick Stats */}
                <div style={hCard}>
                  <div style={hPhoto}>🏊</div>
                  <div style={hBody}>
                    <div style={hTitle}>Quick Stats</div>
                    <div style={hBig}>{formatNumber(stats?.swimmers ?? roster.length)}</div>
                    <div style={hSub}>Total Swimmers</div>
                    <div style={{ ...hSub, marginTop: 6 }}>{formatNumber(stats?.medals?.total ?? medals.length)} Medals · {formatNumber(records.length)} Records</div>
                  </div>
                  {barsIcon}
                </div>
              </div>
            </div>

            {/* Record Holders ticker */}
            {topRecords.length > 0 && (<>
              {secTitle('Record Holders')}
              <div className="asw-ticker" style={{ overflow: 'hidden', padding: '4px 0 10px' }}>
                <div className="asw-ticker-track" style={{ display: 'flex', width: 'max-content', animationDuration: `${Math.max(topRecords.length * 5, 25)}s` }}>
                {[...topRecords, ...topRecords].map((r, i) => (
                  <div key={i} style={{ width: 235, marginRight: 18, flexShrink: 0, borderRadius: 12, overflow: 'hidden', textAlign: 'center', background: '#fdfeff', boxShadow: '0 3px 12px rgba(11,41,72,.07)', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ padding: '24px 0 8px' }}>
                      <div style={{ width: 165, height: 165, borderRadius: '50%', background: 'linear-gradient(180deg, #dfe8f1, #c6d4e2)', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 52, color: '#8a9bb5', border: '4px solid #0d2d5e', boxShadow: '0 3px 10px rgba(0,0,0,.12)', overflow: 'hidden' }}>
                        {photoById[r.swimmer_id] ? <img src={mediaUrl(photoById[r.swimmer_id])} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} /> : '🏊'}
                      </div>
                    </div>
                    <div style={{ padding: '12px 12px 0' }}>
                      <div style={{ fontWeight: 800, fontSize: 17, color: '#0b2948' }}><SwimmerLink id={r.swimmer_id} name={r.swimmer_name} /></div>
                      <div style={{ fontSize: 13.5, color: '#33415c', marginTop: 8, lineHeight: 1.55, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <span>{r.event_name}</span>
                        <span style={{ color: '#c6d4e2' }}>|</span>
                        <span>{r.pool === 'SCM' ? 'Short Course' : 'Long Course'}</span>
                      </div>
                    </div>
                    <div style={{ background: '#123a7d', color: '#fff', padding: '13px 10px 15px', margin: '18px 10px 10px', marginTop: 'auto', borderRadius: 8 }}>
                      <div className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 25, letterSpacing: '-0.01em' }}>{typeof r.time === 'number' ? formatTime(r.time) : r.time}</div>
                      <div style={{ fontSize: 12.5, fontWeight: 600, marginTop: 3, opacity: 0.92 }}>{REC_TYPE_LABELS[r.record_type] || r.record_type} Record</div>
                    </div>
                  </div>
                ))}
                </div>
              </div>
            </>)}
          </div>
        )
      })()}

      {/* ===== NEWS ===== */}
      {tab === 'news' && (
        <div className="pad-lg">
          <TabHeading title={`${team.name} News`} />
          {canManage && (
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
              <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => setModal({ type: 'article' })}>+ Add news</button>
            </div>
          )}
          {articles.length === 0 ? <Empty label="No news from this club yet" /> : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
              {articles.map((a) => (
                <Link key={a.id} to={`/news/${a.id}`} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden', textDecoration: 'none', color: 'inherit', display: 'flex', flexDirection: 'column', boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}>
                  <div style={{ position: 'relative', height: 175, overflow: 'hidden', background: 'linear-gradient(135deg, #0b2948, #1a56a0)', flex: 'none' }}>
                    {a.cover_image && (
                      <>
                        <img src={mediaUrl(a.cover_image)} alt="" aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(20px)', transform: 'scale(1.15)', opacity: 0.5 }} />
                        <img src={mediaUrl(a.cover_image)} alt="" style={{ position: 'relative', width: '100%', height: '100%', objectFit: 'contain' }} />
                      </>
                    )}
                  </div>
                  <div style={{ padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', flex: 1 }}>
                    <div className="micro" style={{ marginBottom: 6 }}>{formatDate(a.published_at || a.created_at)}</div>
                    <div style={{ fontWeight: 800, fontSize: 15.5, lineHeight: 1.3, color: '#0b2948', marginBottom: 8 }}>{a.title}</div>
                    <div style={{ fontSize: 12.5, color: '#58687c', lineHeight: 1.5, marginBottom: 12 }}>{(a.body || '').replace(/<[^>]+>/g, '').slice(0, 110)}{(a.body || '').length > 110 ? '…' : ''}</div>
                    <span style={{ marginTop: 'auto', color: '#1a56a0', fontWeight: 700, fontSize: 13 }}>Read more →</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===== BOARD ===== */}
      {tab === 'board' && (
        <div style={{ padding: '0 28px 28px', background: '#fff' }}>
          <div style={{ textAlign: 'center', marginTop: 24, marginBottom: 4 }}>
            <span style={{ fontSize: 24 }}>👥</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 10 }}>
            <div style={{ width: 50, height: 2, background: '#1a56a0' }} />
            <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 24, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#0b2948', margin: 0 }}>Board of Directors</h2>
            <div style={{ width: 50, height: 2, background: '#1a56a0' }} />
          </div>
          <p style={{ textAlign: 'center', fontSize: 13, color: '#6b7d94', maxWidth: 500, margin: '0 auto 18px', lineHeight: 1.5 }}>
            The Board of Directors is responsible for the strategic direction, governance, and overall leadership of {team.name}.
          </p>
          {canManage && (
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
              <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => setModal({ type: 'board' })}>+ Add member</button>
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 18 }}>
            {(board.length
              ? board.map((m) => ({
                  role: m.role || 'Member', name: m.name, photo: m.photo,
                  actions: canManage ? (<>
                    <button className="btn btn-secondary" style={{ fontSize: 11 }} onClick={() => setModal({ type: 'board', payload: m })}>Edit</button>
                    <button className="btn btn-secondary" style={{ fontSize: 11 }} onClick={async () => { if (window.confirm(`Remove ${m.name} from the board?`)) { await deleteBoardMember(m.id); load() } }}>Remove</button>
                  </>) : null,
                }))
              : ['President', 'Vice President', 'Treasurer', 'Secretary General'].map((role) => ({ role, name: '—', photo: null }))
            ).map(personCard)}
          </div>
        </div>
      )}

      {/* ===== TEAM (Coaches / Swimmers) ===== */}
      {tab === 'team' && (
        <div style={{ padding: '0 28px 28px', background: '#eef3f9' }}>
          <SubTabs options={[['coaches', 'Coaches'], ['swimmers', 'Swimmers']]} value={teamSub} onChange={setTeamSub} />
          {teamSub === 'coaches' && (<>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, margin: '10px 0 22px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 22 }}>👤</span>
                <div style={{ width: 50, height: 2, background: '#1a56a0' }} />
              </div>
              <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 22, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#0b2948', margin: 0 }}>Coaches</h3>
              <div style={{ width: 50, height: 2, background: '#1a56a0' }} />
            </div>
            {canManage && (
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
                <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => setModal({ type: 'coach' })}>+ Add coach</button>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 18 }}>
              {(coaches.length
                ? coaches.map((c) => ({
                    role: COACH_LEVELS[c.level] || c.level || 'Coach', name: c.name, photo: c.photo,
                    actions: canManage ? (<>
                      <button className="btn btn-secondary" style={{ fontSize: 11 }} onClick={() => setModal({ type: 'coach', payload: c })}>Edit</button>
                      <button className="btn btn-secondary" style={{ fontSize: 11 }} onClick={async () => { if (window.confirm(`Remove coach ${c.name}?`)) { await deleteCoach(c.id); load() } }}>Remove</button>
                    </>) : null,
                  }))
                : ['Head Coach', 'Assistant Coach', 'Swimming Coach', 'Conditioning Coach'].map((role) => ({ role, name: '—', photo: null }))
              ).map(personCard)}
            </div>
          </>)}
          {teamSub === 'swimmers' && (<>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, margin: '10px 0 22px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 22 }}>🏊</span>
                <div style={{ width: 50, height: 2, background: '#1a56a0' }} />
              </div>
              <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 22, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#0b2948', margin: 0 }}>Swimmers</h3>
              <div style={{ width: 50, height: 2, background: '#1a56a0' }} />
            </div>
            {isAdmin && (
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
                <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => setModal({ type: 'swimmer' })}>+ Add swimmer</button>
              </div>
            )}
            {roster.length === 0 ? <Empty label="No swimmers on roster" /> : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
                {roster.map((s) => (
                  <div key={s.id} style={{ borderRadius: 12, overflow: 'hidden', textAlign: 'center', background: '#fff', border: '1px solid #e2e9f2', boxShadow: '0 2px 12px rgba(11,41,72,.08)', padding: '14px 10px 12px', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ width: 140, height: 140, borderRadius: '50%', background: 'linear-gradient(180deg, #dfe8f1, #c6d4e2)', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 46, color: '#8a9bb5', border: '3px solid #0d2d5e', boxShadow: '0 3px 10px rgba(11,41,72,.14)', overflow: 'hidden' }}>
                      {s.photo ? <img src={mediaUrl(s.photo)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} /> : '🏊'}
                    </div>
                    <div style={{ padding: '10px 2px 0' }}>
                      <div style={{ fontWeight: 800, fontSize: 14.5, color: '#0b2948', marginBottom: 5, lineHeight: 1.25 }}>
                        <SwimmerLink id={s.id} name={s.name} />
                      </div>
                      <div style={{ fontSize: 11.5, color: '#33415c', fontWeight: 500, lineHeight: 1.5 }}>
                        {s.sex === 'F' ? "Women's" : "Men's"}{s.birth_year ? ` · b. ${s.birth_year}` : ''}
                      </div>
                    </div>
                    <div style={{ marginTop: 'auto', paddingTop: 9, borderTop: '1px solid #eef2f7' }}>
                      <Link to={`/swimmers/${s.id}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11.5, color: '#0b2948', fontWeight: 700, textDecoration: 'none', padding: '0 2px' }}>
                        <span>View Profile</span><span style={{ color: '#1a56a0' }}>→</span>
                      </Link>
                      {isAdmin && (
                        <button className="btn btn-secondary" style={{ fontSize: 11, marginTop: 8 }} onClick={() => setModal({ type: 'swimmer', payload: s })}>Edit</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>)}
        </div>
      )}

      {/* ===== STATISTICS ===== */}
      {tab === 'statistics' && <StatisticsTab
        team={team} times={times} medals={medals} records={records}
        stats={stats} ranking={ranking} medalBoxes={medalBoxes}
        photoById={photoById} sexById={sexById}
      />}

      {/* ===== PROGRESSION ===== */}
      {tab === 'progression' && <ProgressionTab id={id} />}

      {/* ===== RECORDS ===== */}
      {tab === 'records' && <RecordsTab records={records} photoById={photoById} sexById={sexById} />}

      {/* ===== RANKING ===== */}
      {tab === 'ranking' && (
        <div className="pad-lg">
          <TabHeading title="Club Ranking" />
          <div style={{ textAlign: 'center', fontSize: 12.5, color: '#6b7d94', margin: '-8px 0 18px' }}>
            Clubs of {team.country_detail?.name || 'the same country'} ranked by medals won
          </div>
          {ranking.length === 0 ? <Empty label="No ranking data" /> : (
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>#</th>
                    <th>Club</th>
                    <th className="num">Gold</th>
                    <th className="num">Silver</th>
                    <th className="num">Bronze</th>
                    <th className="num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {ranking.map((r) => (
                    <tr key={r.team_id} style={r.is_current ? { background: 'var(--color-accent-100)', fontWeight: 600 } : undefined}>
                      <td><span className="asw-num" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: '50%', background: '#0b2948', color: '#fff', fontWeight: 800, fontSize: 12 }}>{r.rank}</span></td>
                      <td>
                        {r.team_id !== Number(id) ? (
                          <Link to={`/teams/${r.team_id}`} style={{ color: 'inherit', textDecoration: 'none', fontWeight: 600 }}>{r.team_name}</Link>
                        ) : (
                          <span style={{ fontWeight: 700 }}>{r.team_name} <span className="tag tag-dark">This club</span></span>
                        )}
                      </td>
                      <td className="num asw-num" style={{ fontWeight: 800, color: 'var(--asw-gold)' }}>{r.gold}</td>
                      <td className="num asw-num">{r.silver}</td>
                      <td className="num asw-num">{r.bronze}</td>
                      <td className="num asw-num" style={{ fontWeight: 800 }}>{r.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ===== MEDALS ===== */}
      {tab === 'medals' && (
        <div className="pad-lg">
          <TabHeading title="Medals" />
          {/* Tally by competition classification */}
          {medalBoxes.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 24, justifyContent: 'center' }}>
              {medalBoxes.map((m) => (
                <div key={m.name} style={{ background: CLASS_COLORS[m.name] || 'var(--color-accent)', color: '#fff', padding: '12px 18px', minWidth: 150, flex: '1 1 150px', maxWidth: 240 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', opacity: 0.75 }}>{m.name}</div>
                  <div className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 28, lineHeight: 1.1, marginTop: 2 }}>{formatNumber(m.total)}</div>
                  <div className="asw-num" style={{ display: 'flex', gap: 10, marginTop: 6, fontSize: 12, fontWeight: 700 }}>
                    <span style={{ color: 'var(--asw-gold)' }}>{m.gold}G</span>
                    <span style={{ color: 'var(--asw-silver)' }}>{m.silver}S</span>
                    <span style={{ color: '#e3a869' }}>{m.bronze}B</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Top medalists */}
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 15, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#0b2948', margin: '8px 0 10px' }}>Top Medalists · {medalists.length}</div>
          {medalists.length === 0 ? <Empty label="No medals" /> : (
            <div className="table-scroll" style={{ marginBottom: 26 }}>
              <table className="table">
                <thead><tr><th style={{ width: 30 }}>#</th><th>Swimmer</th><th className="num">G</th><th className="num">S</th><th className="num">B</th><th className="num">Total</th></tr></thead>
                <tbody>
                  {medalists.slice(0, 15).map((m, i) => (
                    <tr key={m.id ?? i}>
                      <td className="asw-num">{i + 1}</td>
                      <td><SwimmerLink id={m.id} name={m.name} /></td>
                      <td className="num asw-num" style={{ fontWeight: 800, color: 'var(--asw-gold)' }}>{m.gold}</td>
                      <td className="num asw-num">{m.silver}</td>
                      <td className="num asw-num">{m.bronze}</td>
                      <td className="num asw-num" style={{ fontWeight: 800 }}>{m.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* All medals */}
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 15, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#0b2948', margin: '8px 0 10px' }}>All Medals · {medals.length}</div>
          {medals.length === 0 ? <Empty label="No medals" /> : (
            <div className="table-scroll">
              <table className="table">
                <thead><tr><th style={{ width: 40 }}></th><th>Event</th><th>Swimmer</th><th>Championship</th><th>Date</th></tr></thead>
                <tbody>
                  {[...medals].sort((a, b) => (b.championship_date || '').localeCompare(a.championship_date || '')).map((m) => (
                    <tr key={m.id}>
                      <td>{medalBadge(m.medal_type)}</td>
                      <td style={{ fontWeight: 600 }}>{m.event_name || '—'}</td>
                      <td><SwimmerLink id={m.swimmer_id} name={m.swimmer_name} /></td>
                      <td className="text-muted">{m.championship_name || '—'}</td>
                      <td className="text-muted">{formatDate(m.championship_date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ===== COMPARE ===== */}
      {tab === 'compare' && <CompareTab team={team} profile={profile} stats={stats} records={records} />}

      {/* ===== PREDICTION ===== */}
      {tab === 'prediction' && <PredictionTab id={id} />}

      {/* ===== MULTIMEDIA ===== */}
      {tab === 'multimedia' && (
        <div className="pad-lg">
          <TabHeading title={`${team.name} Multimedia`} />
          {canManage && (
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
              <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => setModal({ type: 'album' })}>+ Add album</button>
            </div>
          )}
          {albums.length === 0 ? <Empty label="No photo or video albums yet" /> : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
              {albums.map((a) => (
                <Link key={a.id} to={`/media/albums/${a.id}`} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden', textDecoration: 'none', color: 'inherit', boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}>
                  <div style={{ height: 160, background: a.cover ? `url(${mediaUrl(a.cover)}) center/cover` : 'linear-gradient(135deg, #0b2948, #1a56a0)', display: 'flex', alignItems: 'flex-end' }}>
                    <span style={{ background: 'rgba(13,45,94,.85)', color: '#fff', fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: '0 8px 0 0' }} className="asw-num">{a.items_count || 0} items</span>
                  </div>
                  <div style={{ padding: '12px 14px' }}>
                    <div style={{ fontWeight: 800, fontSize: 14, color: '#0b2948', lineHeight: 1.3 }}>{a.title}</div>
                    <div className="micro" style={{ marginTop: 4 }}>{formatDate(a.created_at)}</div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* admin modals */}
      {modal?.type === 'club' && <EditClubModal team={team} countries={countries} onClose={() => setModal(null)} onSaved={refresh} />}
      {modal?.type === 'coach' && <CoachModal coach={modal.payload} team={team} countries={countries} onClose={() => setModal(null)} onSaved={refresh} />}
      {modal?.type === 'board' && <BoardModal member={modal.payload} team={team} onClose={() => setModal(null)} onSaved={refresh} />}
      {modal?.type === 'swimmer' && <SwimmerModal swimmer={modal.payload} team={team} countries={countries} onClose={() => setModal(null)} onSaved={refresh} />}
      {modal?.type === 'article' && <ArticleModal team={team} onClose={() => setModal(null)} onSaved={refresh} />}
      {modal?.type === 'album' && <AlbumModal team={team} onClose={() => setModal(null)} onSaved={refresh} />}
    </div>
  )
}

