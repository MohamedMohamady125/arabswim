import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { X } from 'lucide-react'
import { getTeamProfile, getTeamMedals, getTeamTimes, updateTeam } from '../api/teams'
import { getArticles, createArticle } from '../api/news'
import { getAlbums, createAlbum } from '../api/media'
import { getCoaches, createCoach, updateCoach, deleteCoach } from '../api/coaches'
import { createSwimmer, updateSwimmer } from '../api/swimmers'
import { getCountries } from '../api/core'
import api from '../api/client'
import Flag from '../components/Flag'
import { useAuth } from '../context/AuthContext'
import { Loading, Empty, SectHead, MedalIcon, Seg } from '../components/ui'
import { formatDate, formatNumber, formatTime, mediaUrl } from '../utils'

// Not yet in src/api/teams.js — defined locally
const getTeamRecords = (id) => api.get(`/teams/${id}/records/`)
const getTeamStats = (id) => api.get(`/teams/${id}/stats/`)
const getTeamRanking = (id) => api.get(`/teams/${id}/ranking/`)
const getTeamPrediction = (id, params) => api.get(`/teams/${id}/prediction/`, { params })

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

const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'news', label: 'News' },
  { value: 'team', label: 'Team' },
  { value: 'swimmers', label: 'Swimmers' },
  { value: 'stats', label: 'Stats' },
  { value: 'ranking', label: 'Ranking' },
  { value: 'records', label: 'Records' },
  { value: 'gallery', label: 'Gallery' },
  { value: 'prediction', label: 'Prediction' },
]

function Modal({ title, onClose, children, width = 620 }) {
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

function EditClubModal({ team, onClose, onSaved }) {
  const [form, setForm] = useState({
    founded_year: team.founded_year || '',
    description: team.description || '',
    website: team.website || '',
    email: team.email || '',
    phone: team.phone || '',
    address: team.address || '',
  })
  const [trophies, setTrophies] = useState((team.trophies || []).map((t) => ({ name: t.name, year: t.year })))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const save = async () => {
    setBusy(true); setErr('')
    try {
      const fd = new FormData()
      Object.entries(form).forEach(([k, v]) => fd.append(k, v))
      fd.append('trophies_data', JSON.stringify(trophies.filter((t) => t.name && t.year)))
      await updateTeam(team.id, fd)
      onSaved()
    } catch (e) {
      setErr(e.response?.data ? JSON.stringify(e.response.data) : 'Save failed')
      setBusy(false)
    }
  }

  return (
    <Modal title="Edit club" onClose={onClose}>
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
    <Modal title="Add club news" onClose={onClose}>
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
    <Modal title="Add album" onClose={onClose} width={440}>
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
    <div>
      <div className="sect-head">
        <h4>Next-season projection</h4>
        <span className="micro">Linear trend over each swimmer's seasonal bests — a forecast, not a promise</span>
      </div>
      <div style={{ marginBottom: 16 }}>
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

// ── Page ─────────────────────────────────────────────────────

export default function TeamDetail() {
  const { id } = useParams()
  const { isAdmin } = useAuth()
  const [profile, setProfile] = useState(null)
  const [medals, setMedals] = useState([])
  const [times, setTimes] = useState([])
  const [records, setRecords] = useState([])
  const [stats, setStats] = useState(null)
  const [ranking, setRanking] = useState([])
  const [coaches, setCoaches] = useState([])
  const [articles, setArticles] = useState([])
  const [albums, setAlbums] = useState([])
  const [countries, setCountries] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('overview')
  const [modal, setModal] = useState(null) // {type, payload}

  const load = useCallback(async (alive = { current: true }) => {
    const [profRes, medalsRes, timesRes, recRes, statsRes, rankRes, coachRes, newsRes, albumRes] = await Promise.allSettled([
      getTeamProfile(id),
      getTeamMedals(id),
      getTeamTimes(id),
      getTeamRecords(id),
      getTeamStats(id),
      getTeamRanking(id),
      getCoaches({ team: id }),
      getArticles({ team: id, status: 'PUBLISHED' }),
      getAlbums({ team: id }),
    ])
    if (!alive.current) return
    const val = (r) => (r.status === 'fulfilled' ? r.value.data : null)
    setProfile(val(profRes))
    setMedals(list(val(medalsRes)))
    setTimes(list(val(timesRes)).slice(0, 20))
    setRecords(list(val(recRes)))
    setStats(val(statsRes))
    setRanking(list(val(rankRes)))
    setCoaches(list(val(coachRes)))
    setArticles(list(val(newsRes)))
    setAlbums(list(val(albumRes)))
  }, [id])

  useEffect(() => {
    const alive = { current: true }
    setLoading(true)
    load(alive).finally(() => { if (alive.current) setLoading(false) })
    return () => { alive.current = false }
  }, [load])

  useEffect(() => {
    if (!isAdmin) return
    getCountries({ page_size: 300 }).then((res) => setCountries(list(res.data))).catch(() => {})
  }, [isAdmin])

  const refresh = () => { setModal(null); load() }

  const team = profile?.team
  const roster = useMemo(() => (profile?.roster || []).filter((s) => !s.is_relay_team), [profile])
  const medalCounts = profile?.medal_counts
  const trophies = team?.trophies || []
  const totalMedals = useMemo(() => {
    let n = 0
    for (const scope of Object.values(medalCounts || {})) {
      for (const v of Object.values(scope || {})) n += v || 0
    }
    return n
  }, [medalCounts])

  if (loading) return <Loading label="Loading club" />
  if (!team) return <Empty label="Club not found" />

  return (
    <div>
      {/* header */}
      <div className="pad-lg rule-b" style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
        {team.logo ? (
          <div className="grayscale" style={{ width: 96, height: 96, flex: 'none', overflow: 'hidden', border: '1px solid var(--color-divider)' }}>
            <img src={mediaUrl(team.logo)} alt={team.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
        ) : (
          <div style={{ width: 96, height: 96, flex: 'none', background: 'var(--color-accent-800)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 26 }}>
            {acronym(team.name)}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 260 }}>
          <div className="kicker" style={{ marginBottom: 6 }}>{team.is_national_team ? 'National team' : 'Club'}</div>
          <h1 style={{ margin: 0, letterSpacing: '-0.03em' }}>{team.name}</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, fontSize: 13, color: 'var(--color-neutral-700)', flexWrap: 'wrap' }}>
            <Flag code={team.country_detail?.code} name={team.country_detail?.name} />
            <span>{team.country_detail?.name}</span>
            {team.founded_year && <><span>·</span><span className="asw-num">Founded {team.founded_year}</span></>}
            {team.address && <><span>·</span><span>{team.address}</span></>}
          </div>
        </div>
        {isAdmin && (
          <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => setModal({ type: 'club' })}>Edit club</button>
        )}
      </div>

      {/* counts strip */}
      <div className="counts">
        <div><div className="n">{formatNumber(roster.length)}</div><div className="l">Swimmers</div></div>
        <div><div className="n">{formatNumber(totalMedals || medals.length)}</div><div className="l">Medals</div></div>
        <div><div className="n">{formatNumber(stats?.championships)}</div><div className="l">Championships</div></div>
        <div><div className="n">{formatNumber(stats?.best_fina?.points ?? profile?.best_swimmers?.[0]?.fina_points)}</div><div className="l">Best FINA</div></div>
        <div><div className="n">{formatNumber(records.length ? records.length : null)}</div><div className="l">Records held</div></div>
      </div>

      {/* tabs */}
      <div className="pad" style={{ paddingBottom: 0 }}>
        <Seg options={TABS} value={tab} onChange={setTab} />
      </div>

      <div className="pad">
        {tab === 'overview' && (
          <div className="grid-2 bleed" style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 0 }}>
            <div className="rule-r pad">
              {team.description && (
                <div className="rule-b" style={{ paddingBottom: 20, marginBottom: 20 }}>
                  <SectHead title="About the club" />
                  <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-line' }}>{team.description}</p>
                </div>
              )}

              {/* contact */}
              <SectHead title="Club information" />
              <div className="cellgrid" style={{ marginBottom: 24 }}>
                <div><div className="card-kicker">Founded</div><div className="asw-num" style={{ fontWeight: 800, fontSize: 18 }}>{team.founded_year || '—'}</div></div>
                <div><div className="card-kicker">Country</div><div style={{ fontWeight: 700, fontSize: 14 }}>{team.country_detail?.name || '—'}</div></div>
                <div><div className="card-kicker">Website</div><div style={{ fontSize: 13, overflowWrap: 'anywhere' }}>{team.website ? <a href={team.website} target="_blank" rel="noreferrer">{team.website}</a> : '—'}</div></div>
                <div><div className="card-kicker">Email</div><div style={{ fontSize: 13, overflowWrap: 'anywhere' }}>{team.email ? <a href={`mailto:${team.email}`}>{team.email}</a> : '—'}</div></div>
                <div><div className="card-kicker">Phone</div><div className="asw-num" style={{ fontSize: 13 }}>{team.phone ? <a href={`tel:${team.phone}`}>{team.phone}</a> : '—'}</div></div>
                <div><div className="card-kicker">Address</div><div style={{ fontSize: 13 }}>{team.address || '—'}</div></div>
              </div>

              {/* trophies */}
              <SectHead title={`Trophies · ${trophies.length}`} />
              {trophies.length === 0 ? (
                <div className="text-muted" style={{ fontSize: 13 }}>No trophies yet.</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
                  {trophies.map((t, i) => (
                    <div key={t.id ?? i} className="asw-fade-up" style={{ border: '1px solid var(--color-divider)', borderLeft: '4px solid var(--asw-gold)', padding: '12px 14px', animationDelay: `${Math.min(i * 50, 400)}ms` }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{t.name}</div>
                      <div className="asw-num text-muted" style={{ fontWeight: 800, fontSize: 13, marginTop: 4 }}>{t.year}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* right rail */}
            <div>
              <div className="rule-b" style={{ padding: '24px 28px' }}>
                <SectHead title="Top swimmers · FINA" />
                {(profile?.best_swimmers || []).length === 0 ? (
                  <div className="text-muted" style={{ fontSize: 13 }}>No data yet.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {profile.best_swimmers.slice(0, 6).map((sw, i) => {
                      const max = profile.best_swimmers[0]?.fina_points || 1
                      return (
                        <div key={sw.swimmer_id}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}>
                            <span>
                              <Link to={`/swimmers/${sw.swimmer_id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{sw.name}</Link>
                              <span className="text-muted"> · {sw.nationality_code}</span>
                            </span>
                            <span className="asw-num" style={{ fontWeight: 800 }}>{sw.fina_points}</span>
                          </div>
                          <div className="bar">
                            <div style={{ width: `${Math.round(((sw.fina_points || 0) / max) * 100)}%`, background: i < 2 ? 'var(--color-accent)' : 'var(--color-neutral-800)' }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              <div style={{ padding: '24px 28px' }}>
                <SectHead title="Medal breakdown" />
                {totalMedals === 0 ? (
                  <div className="text-muted" style={{ fontSize: 13 }}>No medals yet.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {['international', 'national'].map((scope) => {
                      const c = medalCounts?.[scope]
                      if (!c) return null
                      const total = (c.GOLD || 0) + (c.SILVER || 0) + (c.BRONZE || 0)
                      if (!total) return null
                      return (
                        <div key={scope}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}>
                            <span style={{ textTransform: 'capitalize', fontWeight: 600 }}>{scope}</span>
                            <span className="asw-num" style={{ fontWeight: 800 }}>{total}</span>
                          </div>
                          <div style={{ display: 'flex', gap: 12, fontSize: 13 }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><MedalIcon type="GOLD" size={15} /> <span className="asw-num">{c.GOLD || 0}</span></span>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><MedalIcon type="SILVER" size={15} /> <span className="asw-num">{c.SILVER || 0}</span></span>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><MedalIcon type="BRONZE" size={15} /> <span className="asw-num">{c.BRONZE || 0}</span></span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {tab === 'news' && (
          <div>
            <div className="sect-head">
              <h4>Club news</h4>
              {isAdmin && <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => setModal({ type: 'article' })}>+ Add news</button>}
            </div>
            {articles.length === 0 ? (
              <Empty label="No news from this club yet" />
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
                {articles.map((a) => (
                  <Link key={a.id} to={`/news/${a.id}`} style={{ color: 'inherit', textDecoration: 'none', border: '1px solid var(--color-divider)' }}>
                    {a.cover_image && (
                      <div className="grayscale" style={{ height: 140, overflow: 'hidden' }}>
                        <img src={mediaUrl(a.cover_image)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      </div>
                    )}
                    <div style={{ padding: 12 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.35 }}>{a.title}</div>
                      {a.published_at && <div className="text-muted asw-num" style={{ fontSize: 12, marginTop: 6 }}>{formatDate(a.published_at)}</div>}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'team' && (
          <div>
            <div className="sect-head">
              <h4>Coaching staff · {coaches.length}</h4>
              {isAdmin && <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => setModal({ type: 'coach' })}>+ Add coach</button>}
            </div>
            {coaches.length === 0 ? (
              <Empty label="No coaches listed" />
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
                {coaches.map((c) => (
                  <div key={c.id} style={{ border: '1px solid var(--color-divider)', padding: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      {c.photo ? (
                        <div className="grayscale" style={{ width: 48, height: 48, flex: 'none', overflow: 'hidden' }}>
                          <img src={mediaUrl(c.photo)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </div>
                      ) : (
                        <div style={{ width: 48, height: 48, flex: 'none', background: 'var(--color-accent-800)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 14 }}>
                          {acronym(c.name)}
                        </div>
                      )}
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{c.name}</div>
                        {c.level && <div className="text-muted" style={{ fontSize: 12 }}>{COACH_LEVELS[c.level] || c.level}</div>}
                        {c.years_experience != null && <div className="micro asw-num">{c.years_experience} yrs experience</div>}
                      </div>
                    </div>
                    {c.bio && <p className="text-muted" style={{ fontSize: 12, lineHeight: 1.5, margin: '10px 0 0' }}>{c.bio.slice(0, 140)}{c.bio.length > 140 ? '…' : ''}</p>}
                    {isAdmin && (
                      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                        <button className="btn btn-secondary" style={{ fontSize: 11 }} onClick={() => setModal({ type: 'coach', payload: c })}>Edit</button>
                        <button className="btn btn-secondary" style={{ fontSize: 11 }} onClick={async () => { if (window.confirm(`Remove coach ${c.name}?`)) { await deleteCoach(c.id); load() } }}>Remove</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'swimmers' && (
          <div>
            <div className="sect-head">
              <h4>Roster · {roster.length}</h4>
              {isAdmin && <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => setModal({ type: 'swimmer' })}>+ Add swimmer</button>}
            </div>
            {roster.length === 0 ? (
              <Empty label="No swimmers on roster" />
            ) : (
              <div className="table-scroll">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Swimmer</th>
                      <th className="num">Born</th>
                      <th className="num">Age</th>
                      <th>Sex</th>
                      {isAdmin && <th />}
                    </tr>
                  </thead>
                  <tbody>
                    {roster.map((s) => (
                      <tr key={s.id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <Flag code={s.nationality_detail?.code} name={s.nationality_detail?.name} />
                            <Link to={`/swimmers/${s.id}`} style={{ color: 'inherit', textDecoration: 'none', fontWeight: 600 }}>
                              {s.name}
                            </Link>
                          </div>
                        </td>
                        <td className="num asw-num">{s.birth_year ?? '—'}</td>
                        <td className="num asw-num">{s.age ?? '—'}</td>
                        <td className="text-muted">{s.sex === 'F' ? 'W' : 'M'}</td>
                        {isAdmin && (
                          <td style={{ textAlign: 'right' }}>
                            <button className="btn btn-secondary" style={{ fontSize: 11 }} onClick={() => setModal({ type: 'swimmer', payload: s })}>Edit</button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === 'stats' && (
          <div>
            <SectHead title="Club statistics" />
            <div className="cellgrid" style={{ marginBottom: 24 }}>
              <div><div className="card-kicker">Swimmers</div><div className="asw-num" style={{ fontWeight: 800, fontSize: 22 }}>{formatNumber(stats?.swimmers)}</div></div>
              <div><div className="card-kicker">Race swims</div><div className="asw-num" style={{ fontWeight: 800, fontSize: 22 }}>{formatNumber(stats?.results)}</div></div>
              <div><div className="card-kicker">Championships</div><div className="asw-num" style={{ fontWeight: 800, fontSize: 22 }}>{formatNumber(stats?.championships)}</div></div>
              <div><div className="card-kicker">Gold</div><div className="asw-num" style={{ fontWeight: 800, fontSize: 22, color: 'var(--asw-gold)' }}>{formatNumber(stats?.medals?.gold)}</div></div>
              <div><div className="card-kicker">Silver</div><div className="asw-num" style={{ fontWeight: 800, fontSize: 22, color: 'var(--asw-silver)' }}>{formatNumber(stats?.medals?.silver)}</div></div>
              <div><div className="card-kicker">Bronze</div><div className="asw-num" style={{ fontWeight: 800, fontSize: 22, color: 'var(--asw-bronze)' }}>{formatNumber(stats?.medals?.bronze)}</div></div>
            </div>

            {(stats?.top_medalist || stats?.best_fina) && (
              <div className="cellgrid" style={{ marginBottom: 24 }}>
                {stats?.top_medalist && (
                  <div>
                    <div className="card-kicker">Most decorated</div>
                    <Link to={`/swimmers/${stats.top_medalist.swimmer_id}`} style={{ color: 'inherit', textDecoration: 'none', fontWeight: 700, fontSize: 15 }}>{stats.top_medalist.swimmer_name}</Link>
                    <div className="text-muted" style={{ fontSize: 13 }}><span className="asw-num">{stats.top_medalist.count}</span> medals</div>
                  </div>
                )}
                {stats?.best_fina && (
                  <div>
                    <div className="card-kicker">Highest FINA</div>
                    <Link to={`/swimmers/${stats.best_fina.swimmer_id}`} style={{ color: 'inherit', textDecoration: 'none', fontWeight: 700, fontSize: 15 }}>{stats.best_fina.swimmer_name}</Link>
                    <div className="text-muted" style={{ fontSize: 13 }}><span className="asw-num" style={{ fontWeight: 800 }}>{stats.best_fina.points}</span> · {stats.best_fina.event_name}</div>
                  </div>
                )}
              </div>
            )}

            <SectHead title="Best times" />
            {times.length === 0 ? (
              <Empty label="No times recorded" />
            ) : (
              <div className="table-scroll">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Event</th>
                      <th>Swimmer</th>
                      <th className="time">Time</th>
                      <th className="num">FINA</th>
                      <th className="hide-mobile">Meet</th>
                      <th className="hide-mobile">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {times.map((t) => (
                      <tr key={t.id}>
                        <td style={{ fontWeight: 600 }}>{t.event_name} <span className="text-muted" style={{ fontWeight: 400, fontSize: 12 }}>{t.pool}</span></td>
                        <td>
                          <Link to={`/swimmers/${t.swimmer_id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{t.swimmer_name}</Link>
                        </td>
                        <td className="time asw-time">{t.time}</td>
                        <td className="num asw-num">{t.fina_points ?? '—'}</td>
                        <td className="text-muted hide-mobile">{t.championship_name}</td>
                        <td className="asw-num hide-mobile" style={{ whiteSpace: 'nowrap' }}>{formatDate(t.championship_date)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === 'ranking' && (
          <div>
            <SectHead title="Club ranking · by medals" />
            {ranking.length === 0 ? (
              <Empty label="No ranking data" />
            ) : (
              <div className="table-scroll">
                <table className="table">
                  <thead>
                    <tr>
                      <th className="num">#</th>
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
                        <td className="num asw-num" style={{ fontWeight: 800 }}>{r.rank}</td>
                        <td>
                          {r.team_id !== Number(id) ? (
                            <Link to={`/teams/${r.team_id}`} style={{ color: 'inherit', textDecoration: 'none', fontWeight: 600 }}>{r.team_name}</Link>
                          ) : (
                            <span style={{ fontWeight: 700 }}>{r.team_name} <span className="tag tag-dark">This club</span></span>
                          )}
                        </td>
                        <td className="num asw-num">{r.gold}</td>
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

        {tab === 'records' && (
          <div>
            <SectHead title={`Records held · ${records.length}`} />
            {records.length === 0 ? (
              <Empty label="No records held" />
            ) : (
              <div className="table-scroll">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Event</th>
                      <th>Swimmer</th>
                      <th className="time">Time</th>
                      <th className="hide-mobile">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((r, i) => (
                      <tr key={r.id ?? i}>
                        <td><span className={r.record_type === 'ARAB' ? 'tag tag-dark' : 'tag tag-accent'}>{r.record_type}</span></td>
                        <td style={{ fontWeight: 600 }}>{r.event_name}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Flag code={r.nationality_code} name={r.swimmer_name} />
                            {r.swimmer_id ? (
                              <Link to={`/swimmers/${r.swimmer_id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{r.swimmer_name}</Link>
                            ) : (
                              <span>{r.swimmer_name}</span>
                            )}
                          </div>
                        </td>
                        <td className="time asw-time">{typeof r.time === 'number' ? formatTime(r.time) : r.time}</td>
                        <td className="asw-num hide-mobile" style={{ whiteSpace: 'nowrap' }}>{formatDate(r.date)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === 'gallery' && (
          <div>
            <div className="sect-head">
              <h4>Gallery</h4>
              {isAdmin && <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => setModal({ type: 'album' })}>+ Add album</button>}
            </div>
            {albums.length === 0 ? (
              <Empty label="No albums yet" />
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
                {albums.map((a) => (
                  <Link key={a.id} to={`/media/albums/${a.id}`} style={{ color: 'inherit', textDecoration: 'none', border: '1px solid var(--color-divider)' }}>
                    {a.cover ? (
                      <div className="grayscale" style={{ height: 120, overflow: 'hidden' }}>
                        <img src={mediaUrl(a.cover)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      </div>
                    ) : (
                      <div style={{ height: 120, background: 'var(--color-neutral-200)' }} />
                    )}
                    <div style={{ padding: 12 }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{a.title}</div>
                      <div className="text-muted asw-num" style={{ fontSize: 12, marginTop: 4 }}>{a.items_count || 0} photos</div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'prediction' && <PredictionTab id={id} />}
      </div>

      {/* admin modals */}
      {modal?.type === 'club' && <EditClubModal team={team} onClose={() => setModal(null)} onSaved={refresh} />}
      {modal?.type === 'coach' && <CoachModal coach={modal.payload} team={team} countries={countries} onClose={() => setModal(null)} onSaved={refresh} />}
      {modal?.type === 'swimmer' && <SwimmerModal swimmer={modal.payload} team={team} countries={countries} onClose={() => setModal(null)} onSaved={refresh} />}
      {modal?.type === 'article' && <ArticleModal team={team} onClose={() => setModal(null)} onSaved={refresh} />}
      {modal?.type === 'album' && <AlbumModal team={team} onClose={() => setModal(null)} onSaved={refresh} />}
    </div>
  )
}
