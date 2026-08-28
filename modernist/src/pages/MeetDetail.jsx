import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  getChampionship, getChampionshipStats, getChampionshipResults,
  getMostImproved, getChampionshipComparison, updateResult, deleteResult,
  getMeetProgram, updateChampionship, deleteChampionship, getClassifications, getSubClassifications,
  getRecordsBroken, addChampionshipResult, getQuickStats, getChampionships, getHeadToHead,
  getMeetLive, finishLiveMeet, applyTC, uploadBulletin,
} from '../api/championships'
import { getCountries, getEvents, getFinaPointsPreview } from '../api/core'
import { searchSwimmers } from '../api/swimmers'
import MeetProgramEditor from '../components/MeetProgramEditor'
import ImageCropper from '../components/ImageCropper'
import QuickStatsView from '../components/QuickStatsView'
import { getMedals, getMedalSummary, getMedalClubSummary, getMedalSwimmerSummary } from '../api/medals'
import Flag from '../components/Flag'
import MeetGallery from '../components/meets/MeetGallery'
import { Loading, Empty, Seg, MedalIcon } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { formatDate, formatDateRange, formatNumber, mediaUrl, parseTime, POOL_TYPES } from '../utils'
import { splitTimeToCs, csToSplitTime } from '../components/swimmer/SplitsBreakdown'

const val = (r) => (r.status === 'fulfilled' ? r.value.data : null)
const list = (d) => (Array.isArray(d) ? d : d?.results || [])

// Round display order: finals first, then consolation, prelims, heats
const ROUND_ORDER = ['Finals', 'Consolation', 'Semifinals', 'Prelims', 'Heats', '']
const roundLabel = (r) => {
  if (!r) return 'Timed Finals'
  if (r === 'Finals') return 'Final A'
  if (r === 'Consolation') return 'Final B'
  if (r === 'Semifinals') return 'Semi-Final'
  return r
}

const GENDER_LABEL = { M: 'Men', F: 'Women', X: 'Mixed' }

// Some sources omit the final split (e.g. an 800 recorded only to 700).
// When the official total sits about one lap beyond the last split, append
// a synthetic finish split so the strip reads the full race.
function withFinishSplit(splits, totalCs) {
  if (!totalCs || !splits || splits.length < 2) return splits || []
  const parsed = splits.map((s) => ({ distance: s.distance, cs: splitTimeToCs(s.time) }))
  if (parsed.some((s) => s.cs == null || s.distance == null)) return splits
  const last = parsed[parsed.length - 1]
  const step = last.distance - parsed[parsed.length - 2].distance
  if (step <= 0) return splits
  const sum = parsed.reduce((a, s) => a + s.cs, 0)
  // Whichever interpretation lands closer to the official total wins
  const cumulative = Math.abs(last.cs - totalCs) <= Math.abs(sum - totalCs)
  const lastCum = cumulative ? last.cs : sum
  const finishLap = totalCs - lastCum
  const avgLap = lastCum / parsed.length
  if (finishLap <= avgLap * 0.3 || finishLap >= avgLap * 2) return splits
  return [...splits, {
    distance: last.distance + step,
    time: csToSplitTime(cumulative ? totalCs : finishLap),
  }]
}

// Long names ellipsize instead of stretching the column
const NAME_ELLIPSIS = { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }

function SwimmerLink({ swimmerId, detail, resultNationality, isNational = true }) {
  // Relay teams are clubs at national meets but COUNTRIES at international
  // ones (GCC, Arab, …) — never label a national team as a club there.
  const isCountryTeam = detail?.is_relay_team && !isNational
  // Per-result nationality (from the time of the swim) takes precedence
  // over the swimmer's current nationality
  const nat = resultNationality || detail?.nationality_detail
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: '1 1 auto' }}>
      <Flag code={nat?.code} name={nat?.name} placeholder />
      {detail?.is_relay_team ? (
        // Relay-team placeholders aren't swimmers — no profile to open
        <>
          <span style={NAME_ELLIPSIS}>{detail?.name}</span>
        </>
      ) : (
        <Link to={`/swimmers/${swimmerId}`} style={{ color: 'inherit', textDecoration: 'none', ...NAME_ELLIPSIS }}>{detail?.name}</Link>
      )}
    </div>
  )
}

// Meet-page header artwork: the meet's own logo/photo when uploaded,
// otherwise the ArabSwim logo on a navy tile (the list page keeps flags).
function MeetLogo({ photo, name }) {
  const [failed, setFailed] = useState(false)
  const base = { width: 72, alignSelf: 'stretch', minHeight: 72, flex: 'none', border: '1px solid var(--color-divider)' }
  if (photo && !failed) {
    return (
      <img src={mediaUrl(photo)} alt={name || ''} onError={() => setFailed(true)}
        style={{ ...base, objectFit: 'cover', background: '#fff' }} />
    )
  }
  return (
    <span style={{
      ...base, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--color-accent-800)', borderColor: 'var(--color-accent-800)',
    }}>
      <img src="/logo.png" alt="ArabSwim" style={{ width: 48, height: 48, objectFit: 'contain' }} />
    </span>
  )
}

// Fixed-size round club logo; falls back to an initials monogram so every
// row in the club tally stays perfectly aligned.
function ClubLogo({ logo, name, size = 26 }) {
  const [failed, setFailed] = useState(false)
  const initials = (name || '')
    .split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?'
  const base = {
    width: size, height: size, flex: 'none', borderRadius: '50%',
    border: '1px solid var(--color-neutral-300)',
  }
  if (logo && !failed) {
    return (
      <img src={mediaUrl(logo)} alt="" width={size} height={size}
        onError={() => setFailed(true)}
        style={{ ...base, objectFit: 'contain', background: '#fff' }} />
    )
  }
  return (
    <span style={{
      ...base, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.38, fontWeight: 700, letterSpacing: '.02em',
      background: 'var(--color-neutral-200)', color: 'var(--color-neutral-600)',
    }}>{initials}</span>
  )
}

/* ── Admin: add one manual result from inside the results tab ── */
function AddResultModal({ meetId, defaultEventId, onClose, onAdded }) {
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState([])
  const [swimmer, setSwimmer] = useState(null)
  const [allEvents, setAllEvents] = useState([])
  const [form, setForm] = useState({
    event: defaultEventId ? String(defaultEventId) : '',
    time: '', fina: '', team: '', category: '', round_type: 'Finals', medal: '', open_medal: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const searchDebounce = React.useRef(null)
  const finaDebounce = React.useRef(null)

  useEffect(() => {
    getEvents().then((r) => setAllEvents(Array.isArray(r.data) ? r.data : r.data?.results || [])).catch(() => {})
  }, [])

  const search = (q) => {
    setQuery(q)
    clearTimeout(searchDebounce.current)
    if (q.length < 2) { setOptions([]); return }
    searchDebounce.current = setTimeout(() => {
      searchSwimmers(q).then((r) => setOptions(Array.isArray(r.data) ? r.data : [])).catch(() => setOptions([]))
    }, 300)
  }

  // FINA points auto-fill from time + event + swimmer sex
  useEffect(() => {
    clearTimeout(finaDebounce.current)
    const cs = form.time ? parseTime(form.time) : null
    if (!cs || !form.event) return
    finaDebounce.current = setTimeout(() => {
      getFinaPointsPreview({ time_cs: cs, event: form.event, gender: swimmer?.sex || 'M' })
        .then((r) => { if (r.data.points > 0) setForm((f) => ({ ...f, fina: String(r.data.points) })) })
        .catch(() => {})
    }, 400)
  }, [form.time, form.event, swimmer]) // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    const cs = parseTime(form.time)
    if (!swimmer || !form.event || !cs) {
      setError('Swimmer, event and a valid time are required (e.g. 1:02.30)')
      return
    }
    setSaving(true)
    setError('')
    try {
      await addChampionshipResult(meetId, {
        swimmer: swimmer.id,
        event: form.event,
        time_centiseconds: cs,
        team: form.team || '',
        category: form.category || '',
        round_type: form.round_type || '',
        fina_points: form.fina ? parseInt(form.fina) : null,
        medal: form.medal || '',
        open_medal: form.open_medal || '',
      })
      onAdded()
    } catch (err) {
      const d = err.response?.data
      setError(d ? (typeof d === 'string' ? d : JSON.stringify(d)) : 'Could not add result')
      setSaving(false)
    }
  }

  const medalSelect = (label, key) => (
    <div className="field">
      <label>{label}</label>
      <select className="select" value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })}>
        <option value="">No medal</option>
        <option value="GOLD">Gold</option>
        <option value="SILVER">Silver</option>
        <option value="BRONZE">Bronze</option>
      </select>
    </div>
  )

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(8, 24, 44, 0.6)', zIndex: 100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '48px 16px', overflowY: 'auto' }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--color-bg)', width: 520, maxWidth: '100%', borderTop: '4px solid var(--color-accent)' }}>
        <div className="rule-b" style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <h4 style={{ margin: 0 }}>Add Result</h4>
          <button className="btn btn-ghost" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {error && <div style={{ border: '1px solid var(--asw-slow)', color: 'var(--asw-slow)', padding: '8px 12px', fontSize: 13 }}>{error}</div>}
          <div className="field">
            <label>Swimmer *</label>
            {swimmer ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--color-accent-100)', padding: '8px 12px' }}>
                <span style={{ flex: 1, fontWeight: 700, fontSize: 13 }}>
                  {swimmer.name}
                  <span className="text-muted" style={{ fontWeight: 400, marginLeft: 8, fontSize: 12 }}>
                    {swimmer.nationality_detail?.name || ''} · {swimmer.sex}
                  </span>
                </span>
                <button className="btn btn-secondary" onClick={() => setSwimmer(null)}>Change</button>
              </div>
            ) : (
              <div style={{ position: 'relative' }}>
                <input className="input" type="text" placeholder="Search swimmers by name…" value={query} onChange={(e) => search(e.target.value)} />
                {options.length > 0 && (
                  <div style={{ position: 'absolute', zIndex: 10, width: '100%', background: 'var(--color-bg)', border: '1px solid var(--color-divider)', marginTop: 2, boxShadow: 'var(--shadow-md)', maxHeight: 200, overflowY: 'auto' }}>
                    {options.map((s) => (
                      <button key={s.id} type="button"
                        style={{ width: '100%', textAlign: 'left', padding: '8px 12px', border: 0, cursor: 'pointer', background: 'transparent', font: 'inherit', fontSize: 13, display: 'flex', justifyContent: 'space-between', gap: 10 }}
                        onClick={() => { setSwimmer(s); setOptions([]); setQuery('') }}>
                        <span style={{ fontWeight: 600 }}>{s.name}</span>
                        <span className="text-muted" style={{ fontSize: 12 }}>{s.nationality_detail?.name || ''} · {s.sex}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="field">
            <label>Event *</label>
            <select className="select" value={form.event} onChange={(e) => setForm({ ...form, event: e.target.value })}>
              <option value="">Select event</option>
              {allEvents.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="field">
              <label>Time * (e.g. 1:02.30)</label>
              <input className="input asw-num" type="text" placeholder="0:00.00" value={form.time}
                onChange={(e) => setForm({ ...form, time: e.target.value })} />
            </div>
            <div className="field">
              <label>FINA (auto)</label>
              <input className="input asw-num" type="number" value={form.fina}
                style={{ background: 'var(--color-accent-100)', fontWeight: 600 }}
                onChange={(e) => setForm({ ...form, fina: e.target.value })} />
            </div>
            <div className="field">
              <label>Team / club</label>
              <input className="input" type="text" value={form.team} onChange={(e) => setForm({ ...form, team: e.target.value })} />
            </div>
            <div className="field">
              <label>Round</label>
              <select className="select" value={form.round_type} onChange={(e) => setForm({ ...form, round_type: e.target.value })}>
                <option value="Finals">Final</option>
                <option value="Semifinals">Semi-Final</option>
                <option value="Heats">Heats</option>
                <option value="Prelims">Prelims</option>
                <option value="Consolation">Consolation (Final B)</option>
                <option value="">Unknown</option>
              </select>
            </div>
            <div className="field">
              <label>Category (optional)</label>
              <input className="input" type="text" placeholder="e.g. Cadets" value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })} />
            </div>
            {medalSelect('Medal — category podium', 'medal')}
            {medalSelect('Medal — open / TC podium', 'open_medal')}
          </div>
          <div className="micro" style={{ textTransform: 'none', letterSpacing: 0 }}>
            Double-podium meets can award both: pick a category medal and an open (TC) medal for the same swim.
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={saving} onClick={submit}>{saving ? 'Adding…' : 'Add result'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Admin: full edit of one result — everything except FINA points,
      which are always recomputed automatically from time + event ── */
function EditResultModal({ result, isRelay, onClose, onSaved }) {
  const [allEvents, setAllEvents] = useState([])
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState([])
  const [swimmer, setSwimmer] = useState(result.swimmer_detail || null)
  const [form, setForm] = useState(() => ({
    event: String(result.event),
    round_type: result.round_type || '',
    category: result.category || '',
    team: result.team || '',
    time: result.formatted_time || '',
    age: result.age_at_competition != null ? String(result.age_at_competition) : '',
    original_rank: result.original_rank != null ? String(result.original_rank) : '',
    hc: result.is_hc ? (result.hc_type || 'HC') : '',
    is_manual: !!result.is_manual,
    splitsText: (result.splits || []).map((s) => `${s.distance} ${s.time}`).join('\n'),
    relayText: (result.relay_swimmers || []).map((s) => `${s.name}${s.split_time ? ` | ${s.split_time}` : ''}`).join('\n'),
  }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const searchDebounce = React.useRef(null)

  useEffect(() => {
    getEvents().then((r) => setAllEvents(Array.isArray(r.data) ? r.data : r.data?.results || [])).catch(() => {})
  }, [])

  const search = (q) => {
    setQuery(q)
    clearTimeout(searchDebounce.current)
    if (q.length < 2) { setOptions([]); return }
    searchDebounce.current = setTimeout(() => {
      searchSwimmers(q).then((r) => setOptions(Array.isArray(r.data) ? r.data : [])).catch(() => setOptions([]))
    }, 300)
  }

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const TIME_RE = /^\d{1,2}:\d{2}\.\d{2}$|^\d{1,3}\.\d{2}$/

  const submit = async () => {
    const cs = parseTime(form.time)
    if (!cs) { setError('Invalid time — use 1:02.34 or 28.75'); return }

    const payload = {
      event: form.event,
      round_type: form.round_type,
      category: form.category,
      team: form.team,
      time_centiseconds: cs,
      age_at_competition: form.age === '' ? null : parseInt(form.age),
      original_rank: form.original_rank === '' ? null : parseInt(form.original_rank),
      is_hc: !!form.hc,
      hc_type: form.hc || '',
      is_manual: form.is_manual,
    }
    if (swimmer?.id) payload.swimmer = swimmer.id

    if (isRelay) {
      const legs = form.relayText.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
        const [name, time] = l.split('|').map((p) => p.trim())
        if (time && !TIME_RE.test(time)) return null
        return { name: name || '', split_time: time || '' }
      })
      if (legs.some((l) => l === null)) { setError('Relay legs: use "Name | 1:03.63" — one swimmer per line'); return }
      payload.relay_swimmers = legs.length ? legs : null
    } else {
      const splits = form.splitsText.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
        const m = l.match(/^(\d+)\s*m?\s+(\S+)$/)
        if (!m || !TIME_RE.test(m[2])) return null
        return { distance: parseInt(m[1]), time: m[2] }
      })
      if (splits.some((s) => s === null)) { setError('Splits: use "50 31.36" (distance then cumulative time), one per line'); return }
      payload.splits = splits.length ? splits : null
    }

    setSaving(true)
    setError('')
    try {
      await updateResult(result.id, payload)
      onSaved()
    } catch (err) {
      const d = err.response?.data
      setError(d ? (typeof d === 'string' ? d : JSON.stringify(d)) : 'Could not save the result')
      setSaving(false)
    }
  }

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(8, 24, 44, 0.6)', zIndex: 100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '48px 16px', overflowY: 'auto' }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--color-bg)', width: 560, maxWidth: '100%', borderTop: '4px solid var(--color-accent)' }}>
        <div className="rule-b" style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <h4 style={{ margin: 0 }}>Edit Result</h4>
          <button className="btn btn-ghost" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {error && <div style={{ border: '1px solid var(--asw-slow)', color: 'var(--asw-slow)', padding: '8px 12px', fontSize: 13 }}>{error}</div>}
          <div className="field">
            <label>{isRelay ? 'Relay team (placeholder swimmer)' : 'Swimmer'}</label>
            {swimmer ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--color-accent-100)', padding: '8px 12px' }}>
                <span style={{ flex: 1, fontWeight: 700, fontSize: 13 }}>
                  {swimmer.name}
                  <span className="text-muted" style={{ fontWeight: 400, marginLeft: 8, fontSize: 12 }}>
                    {swimmer.nationality_detail?.name || ''}{swimmer.sex ? ` · ${swimmer.sex}` : ''}
                  </span>
                </span>
                {!isRelay && <button className="btn btn-secondary" onClick={() => setSwimmer(null)}>Change</button>}
              </div>
            ) : (
              <div style={{ position: 'relative' }}>
                <input className="input" type="text" placeholder="Search swimmers by name…" value={query} onChange={(e) => search(e.target.value)} />
                {options.length > 0 && (
                  <div style={{ position: 'absolute', zIndex: 10, width: '100%', background: 'var(--color-bg)', border: '1px solid var(--color-divider)', marginTop: 2, boxShadow: 'var(--shadow-md)', maxHeight: 200, overflowY: 'auto' }}>
                    {options.map((s) => (
                      <button key={s.id} type="button"
                        style={{ width: '100%', textAlign: 'left', padding: '8px 12px', border: 0, cursor: 'pointer', background: 'transparent', font: 'inherit', fontSize: 13, display: 'flex', justifyContent: 'space-between', gap: 10 }}
                        onClick={() => { setSwimmer(s); setOptions([]); setQuery('') }}>
                        <span style={{ fontWeight: 600 }}>{s.name}</span>
                        <span className="text-muted" style={{ fontSize: 12 }}>{s.nationality_detail?.name || ''} · {s.sex}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>Event</label>
              <select className="select" value={form.event} onChange={set('event')}>
                {allEvents.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Time (e.g. 1:02.30)</label>
              <input className="input asw-num" type="text" value={form.time} onChange={set('time')} />
            </div>
            <div className="field">
              <label>Round</label>
              <select className="select" value={form.round_type} onChange={set('round_type')}>
                <option value="">Unknown</option>
                <option value="Finals">Finals</option>
                <option value="Semifinals">Semi-Final</option>
                <option value="Prelims">Prelims</option>
                <option value="Heats">Heats</option>
                <option value="Consolation">Consolation (Final B)</option>
              </select>
            </div>
            <div className="field">
              <label>Team / club</label>
              <input className="input" type="text" value={form.team} onChange={set('team')} />
            </div>
            <div className="field">
              <label>Category</label>
              <input className="input" type="text" placeholder="e.g. Cadets" value={form.category} onChange={set('category')} />
            </div>
            <div className="field">
              <label>Age at competition</label>
              <input className="input asw-num" type="number" value={form.age} onChange={set('age')} />
            </div>
            <div className="field">
              <label>Original rank (from PDF)</label>
              <input className="input asw-num" type="number" value={form.original_rank} onChange={set('original_rank')} />
            </div>
            <div className="field">
              <label>Ranking status</label>
              <select className="select" value={form.hc} onChange={set('hc')}>
                <option value="">Ranked normally</option>
                <option value="HC">HC — hors concours</option>
                <option value="TLD">TLD — time limit exceeded</option>
              </select>
            </div>
            <div className="field">
              <label>FINA points</label>
              <input className="input asw-num" value={result.fina_points ?? '—'} disabled title="Recomputed automatically from time and event" />
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.is_manual} onChange={(e) => setForm((f) => ({ ...f, is_manual: e.target.checked }))} />
            Manual result — excluded from automatic medal awards
          </label>
          {isRelay ? (
            <div className="field">
              <label>Relay legs — one per line: Name | leg time (time optional)</label>
              <textarea className="input" rows={4} value={form.relayText} onChange={set('relayText')}
                placeholder={'Abdallah TARAWNEH | 1:03.63\nHaya AL MASSARWEH | 1:09.79'} style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 13 }} />
            </div>
          ) : (
            <div className="field">
              <label>Splits — one per line: distance then cumulative time</label>
              <textarea className="input" rows={4} value={form.splitsText} onChange={set('splitsText')}
                placeholder={'50 31.36\n100 1:05.20'} style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 13 }} />
            </div>
          )}
          <div className="micro" style={{ textTransform: 'none', letterSpacing: 0 }}>
            FINA points are always recomputed from the time, event and pool — they can't be edited.
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={saving} onClick={submit}>{saving ? 'Saving…' : 'Save result'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────── Results tab ─────────────────────────── */

function ResultsTab({ meetId, events, isNational, isAdmin, hasOpenPodium, hasDoublePodium, hostCode, bFinalNoMedals, onDataChanged, presetEvent, presetEventKey }) {
  const navigate = useNavigate()
  const [initParams] = useSearchParams()
  // deep link from Records: ?event=&gender=&result= opens that exact swim
  const initialResult = React.useRef(initParams.get('result'))
  const [genderFilter, setGenderFilter] = useState(initParams.get('gender') || '')
  const [eventKey, setEventKey] = useState(() => {
    const e = initParams.get('event')
    const g = initParams.get('gender')
    return e && g ? `${e}|${g}` : ''
  })
  // When a program event is clicked from the live day view
  useEffect(() => {
    if (presetEvent && events.length) {
      // Try exact match first, then any gender
      const match = events.find((e) => String(e.event_id) === String(presetEvent))
      if (match) {
        setEventKey(`${match.event_id}|${match.gender}`)
      }
    }
  }, [presetEvent, presetEventKey])
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState('ALL')
  const [selectedRound, setSelectedRound] = useState(null)
  const [expandedRow, setExpandedRow] = useState(null)
  // deep-linked swim: gold-tinted and scrolled into view on arrival
  const [highlightId, setHighlightId] = useState(null)

  useEffect(() => {
    if (!highlightId) return
    const el = document.querySelector(`[data-result-id="${highlightId}"]`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const t = setTimeout(() => setHighlightId(null), 4000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightId, loading])
  const [editMode, setEditMode] = useState(false)
  const [editingRow, setEditingRow] = useState(null)
  const [showAddResult, setShowAddResult] = useState(false)

  const filteredEvents = useMemo(
    () => events.filter((e) => !genderFilter || e.gender === genderFilter),
    [events, genderFilter],
  )

  // no "All" option — default to the first gender that has events (Men first)
  useEffect(() => {
    if (events.length === 0) return
    if (!genderFilter || !events.some((e) => e.gender === genderFilter)) {
      const first = ['M', 'F', 'X'].find((g) => events.some((e) => e.gender === g))
      if (first) setGenderFilter(first)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events])

  // keep a valid event selected whenever the gender filter changes the list
  useEffect(() => {
    if (filteredEvents.length === 0) { setEventKey(''); return }
    if (!filteredEvents.some((e) => `${e.event_id}|${e.gender}` === eventKey)) {
      setEventKey(`${filteredEvents[0].event_id}|${filteredEvents[0].gender}`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredEvents])

  const selectedEvent = filteredEvents.find((e) => `${e.event_id}|${e.gender}` === eventKey)
    || events.find((e) => `${e.event_id}|${e.gender}` === eventKey)

  const loadResults = () => {
    if (!eventKey) return
    const [eventId, gender] = eventKey.split('|')
    setLoading(true)
    getChampionshipResults(meetId, { event: eventId, gender, all_rounds: true })
      .then((res) => {
        const data = list(res.data)
        setRows(data)
        const rounds = [...new Set(data.map((r) => r.round_type || ''))]
        rounds.sort((a, b) => ROUND_ORDER.indexOf(a) - ROUND_ORDER.indexOf(b))
        // deep-linked swim: jump to its round and open its splits
        const target = initialResult.current
          && data.find((r) => String(r.id) === String(initialResult.current))
        if (target) {
          initialResult.current = null
          setSelectedRound(target.round_type || '')
          setSelectedCategory('ALL')
          setExpandedRow(target.id)
          setHighlightId(target.id)
        } else {
          setSelectedRound(rounds[0] ?? '')
          setSelectedCategory('ALL')
          setExpandedRow(null)
        }
        setEditingRow(null)
      })
      .catch(() => setRows([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadResults() }, [meetId, eventKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // categories present in this event, ordered by first appearance in the data
  // (which mirrors the original imported file order via ascending result id)
  const categories = useMemo(() => {
    const seen = new Map()
    rows.forEach((r) => {
      const cat = r.category || ''
      if (!seen.has(cat)) seen.set(cat, r.id ?? Infinity)
    })
    return [...seen.keys()].sort((a, b) => (seen.get(a) ?? Infinity) - (seen.get(b) ?? Infinity))
  }, [rows])
  const hasCategories = categories.filter((c) => c !== '').length > 0 && categories.length > 1

  // "General" view on TC meets: the open classification — every category
  // pooled, ranked by time only (this is what the OPEN medals are based on)
  const isOpenView = selectedCategory === 'OPEN'

  // rounds available for the selected category (open view pools A/B finals,
  // so it has no round picker)
  const rounds = useMemo(() => {
    if (isOpenView) return []
    const catRows = selectedCategory === 'ALL' ? rows : rows.filter((r) => (r.category || '') === selectedCategory)
    const rs = [...new Set(catRows.map((r) => r.round_type || ''))]
    rs.sort((a, b) => ROUND_ORDER.indexOf(a) - ROUND_ORDER.indexOf(b))
    return rs
  }, [rows, selectedCategory, isOpenView])

  useEffect(() => {
    if (rounds.length > 0 && !rounds.includes(selectedRound)) setSelectedRound(rounds[0])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rounds])

  // rows for the selected round + category, grouped by category
  const roundsPresent = new Set(rows.map((r) => r.round_type || ''))
  // National meets run Finale A/B/C — each finale has its own podium, so
  // Final B (Consolation) rows also carry medals (matches backend recompute)
  const showMedals = isOpenView
    ? (roundsPresent.has('Finals') || roundsPresent.size <= 1)
    : (selectedRound === 'Finals'
      || (isNational && selectedRound === 'Consolation' && !bFinalNoMedals)
      || roundsPresent.size <= 1)
  // Small categories (e.g. Benjamins) often swim heats only — that heats
  // classement IS their podium, so their rows medal even in the Heats view.
  const finalsCats = useMemo(() => new Set(
    rows.filter((r) => r.round_type === 'Finals' || r.round_type === 'Consolation')
      .map((r) => r.category || '')), [rows])
  const grouped = useMemo(() => {
    let sel
    if (isOpenView) {
      // Open classification: pool Finale A/B across all categories (mirrors
      // the backend's OPEN medal pass), rank purely by time.
      const hasFinals = rows.some((r) => r.round_type === 'Finals')
      // b_final_no_medals meets: the open/TC podium pools Finale A only
      sel = hasFinals
        ? rows.filter((r) => r.round_type === 'Finals'
            || (r.round_type === 'Consolation' && !bFinalNoMedals))
        : rows
    } else {
      sel = rows.filter((r) => (r.round_type || '') === (selectedRound ?? ''))
      if (selectedCategory !== 'ALL') sel = sel.filter((r) => (r.category || '') === selectedCategory)
    }
    // HC results sink to the bottom of each category, times ascending otherwise
    const sorted = [...sel].sort((a, b) => {
      if (a.is_hc !== b.is_hc) return a.is_hc ? 1 : -1
      return (a.time_centiseconds || 0) - (b.time_centiseconds || 0)
    })
    if (isOpenView) return sorted.length ? [['OPEN', sorted]] : []
    const order = []
    const byCat = new Map()
    sorted.forEach((r) => {
      const cat = r.category || ''
      if (!byCat.has(cat)) { byCat.set(cat, []); order.push(cat) }
      byCat.get(cat).push(r)
    })
    // Preserve file order: sort categories by the lowest result id seen for
    // each category (import writes rows sequentially, so id tracks file order)
    const minId = new Map()
    rows.forEach((r) => {
      const cat = r.category || ''
      const cur = minId.get(cat)
      if (cur === undefined || (r.id != null && r.id < cur)) minId.set(cat, r.id ?? Infinity)
    })
    order.sort((a, b) => (minId.get(a) ?? Infinity) - (minId.get(b) ?? Infinity))
    return order.map((cat) => [cat, byCat.get(cat)])
  }, [rows, selectedRound, selectedCategory, isOpenView, bFinalNoMedals])

  useEffect(() => { setExpandedRow(null) }, [eventKey, selectedRound, selectedCategory])
  // full list — every swimmer in the selection, no pagination
  const pageGroups = grouped
  const fullByCat = useMemo(() => new Map(grouped), [grouped])

  const isRelay = selectedEvent?.event_name?.toLowerCase().includes('relay')
    || selectedEvent?.display_name?.toLowerCase().includes('relay')

  const startEditRow = (r) => setEditingRow(r)

  // Duplicate rank: give this swimmer the same rank as the one above,
  // then renumber everyone below with dense ranking (1,1,2,3,4 not 1,1,3,4,5)
  const duplicateRank = async (r, arr) => {
    const ranked = arr.filter((x) => !x.is_hc)
    const idx = ranked.findIndex((x) => x.id === r.id)
    if (idx <= 0) return // can't dup the first row
    const aboveRank = ranked[idx - 1].original_rank || idx // rank of row above
    try {
      // Set this result's rank to match the one above
      await updateResult(r.id, { original_rank: aboveRank })
      // Renumber everyone below: dense ranking from (aboveRank + 1)
      let nextRank = aboveRank + 1
      for (let j = idx + 1; j < ranked.length; j++) {
        await updateResult(ranked[j].id, { original_rank: nextRank })
        nextRank++
      }
      loadResults()
      onDataChanged?.()
    } catch {
      window.alert('Failed to duplicate rank')
    }
  }

  const removeRow = async (r) => {
    if (!window.confirm(`Delete ${r.swimmer_detail?.name}'s result (${r.formatted_time})? This cannot be undone.`)) return
    try {
      await deleteResult(r.id)
      loadResults()
      onDataChanged?.()
    } catch {
      window.alert('Failed to delete the result')
    }
  }

  if (events.length === 0) {
    return (
      <div className="pad">
        <Empty label="No events for this meet" />
        {isAdmin && (
          <div style={{ textAlign: 'center', marginTop: -24, paddingBottom: 24 }}>
            <Link className="btn btn-primary" to={`/import?championship=${meetId}`}>Import results</Link>
          </div>
        )}
      </div>
    )
  }

  const colCount = 6 + (isNational ? 1 : 0) + (editMode ? 1 : 0)

  // Double podium (Tunisian-style meets with foreign guests): guests medal
  // from their source placements, host-country swimmers from a host-only
  // ranking — a guest gold AND a host gold can coexist in the same event
  // (mirrors medals/utils.recompute_medals on the backend).
  const medalRank = (r, ranked, overall) => {
    if (!hasDoublePodium || !hostCode) return overall
    const isHost = (x) => x.swimmer_detail?.nationality_detail?.code === hostCode
    const hosts = ranked.filter(isHost)
    const guests = ranked.filter((x) => !isHost(x))
    if (hosts.length === 0 || guests.length === 0) return overall
    if (!isHost(r)) {
      if (guests.some((x) => x.original_rank)) return r.original_rank || 0
      return guests.findIndex((x) => x.time_centiseconds === r.time_centiseconds) + 1
    }
    return hosts.findIndex((x) => x.time_centiseconds === r.time_centiseconds) + 1
  }

  const renderRow = (r, arr) => {
    // competition ranking: prefer the source placement (original_rank) so a
    // partially-imported meet (e.g. only one Arab swimmer present) shows his
    // real place, not "1st of the rows we have"; tied times share a rank
    // (1,2,2,4); HC unranked. Open/TC pooled view re-ranks by time, so the
    // per-category source rank doesn't apply there.
    const ranked = arr.filter((x) => !x.is_hc)
    const computedRank = r.is_hc ? 0 : ranked.findIndex((x) => x.time_centiseconds === r.time_centiseconds) + 1
    const rank = !r.is_hc && !isOpenView && r.original_rank ? r.original_rank : computedRank
    const mRank = r.is_hc ? 0 : medalRank(r, ranked, rank)
    const heatsOnlyCat = !isOpenView && !!r.category && !finalsCats.has(r.category)
    const medalOnRow = (showMedals || heatsOnlyCat) && !r.is_manual && !r.is_hc && mRank >= 1 && mRank <= 3
      // b_final_no_medals meets: Finale B rows never medal, even in the
      // pooled open/TC view (matches backend recompute_medals)
      && !(bFinalNoMedals && r.round_type === 'Consolation')
    const swimmers = r.relay_swimmers || []
    const splits = withFinishSplit(r.splits || [], r.time_centiseconds)
    const hasSub = (isRelay && swimmers.length > 0) || (!isRelay && splits.length > 0)
    const isExpanded = expandedRow === r.id
    return (
      <React.Fragment key={r.id}>
        <tr
          data-result-id={r.id}
          style={{
            cursor: editMode ? 'default' : 'pointer',
            background: highlightId === r.id ? 'color-mix(in srgb, var(--asw-gold) 18%, transparent)' : undefined,
            transition: 'background 0.6s',
          }}
          onClick={() => {
            if (editMode) return
            if (hasSub) setExpandedRow(isExpanded ? null : r.id)
            // Relay-team placeholders are clubs, not swimmers — no profile to open
            else if (!r.swimmer_detail?.is_relay_team) navigate(`/swimmers/${r.swimmer_detail?.id || r.swimmer}`)
          }}
        >
          <td className="asw-num">
            {r.is_hc ? (
              <span className="tag tag-neutral" title={r.hc_type === 'TLD' ? 'Time limit exceeded' : 'Hors concours'}>{r.hc_type || 'HC'}</span>
            ) : medalOnRow ? (
              /* block display kills the inline baseline gap so the medal sits
                 on the exact vertical center of the row, level with the flag */
              <MedalIcon type={mRank === 1 ? 'GOLD' : mRank === 2 ? 'SILVER' : 'BRONZE'} size={18} style={{ display: 'block' }} />
            ) : (
              rank || '—'
            )}
          </td>
          <td className="swimmer-cell">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <SwimmerLink swimmerId={r.swimmer_detail?.id || r.swimmer} detail={r.swimmer_detail} resultNationality={r.nationality_detail} isNational={isNational} />
              {!isRelay && (r.team || '').toUpperCase() === 'LP' && (
                <span className="tag tag-outline" title="No club — transferring (libre passage)">LP</span>
              )}
              {hasSub && (
                // marginLeft auto pins every SPLITS/TEAM badge to the cell's
                // right edge so they line up in one column across all rows
                <span
                  className="splits-chip"
                  style={{
                    flex: 'none', marginLeft: 'auto',
                    display: 'inline-flex', alignItems: 'center', gap: 3,
                    padding: '2px 5px', cursor: 'pointer',
                    fontSize: 9, fontWeight: 800, letterSpacing: '0.04em',
                    fontFamily: 'var(--font-heading)',
                    border: `1px solid ${isExpanded ? 'var(--color-accent-800)' : 'var(--asw-gold)'}`,
                    background: isExpanded ? 'var(--color-accent-800)' : 'color-mix(in srgb, var(--asw-gold) 14%, transparent)',
                    color: isExpanded ? '#fff' : 'var(--color-accent-800)',
                  }}
                >
                  {isRelay ? 'TEAM' : 'SPLITS'} {isExpanded ? '▲' : '▼'}
                </span>
              )}
            </div>
          </td>
          <td className="num asw-num hide-mobile">{r.age_at_competition ?? '—'}</td>
          {isNational && (
            <td className="text-muted hide-mobile">
              {/* single line + ellipsis so long club names never stretch
                  row heights (keeps every meet's table looking the same) */}
              <span title={r.team || undefined} style={{ display: 'inline-block', maxWidth: 160, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', verticalAlign: 'bottom' }}>
                {r.team || '—'}
              </span>
            </td>
          )}
          <td className="time asw-time">{r.formatted_time}</td>
          <td className="num asw-num">{r.fina_points ?? '—'}</td>
          {editMode && (
            <td className="num" style={{ whiteSpace: 'nowrap' }}>
              <span style={{ display: 'inline-flex', gap: 6 }}>
                <button className="btn btn-ghost" style={{ padding: '3px 8px', fontSize: 12 }} title="Give same rank as swimmer above (shift below)" onClick={(e) => { e.stopPropagation(); duplicateRank(r, arr) }}>Dup ↑</button>
                <button className="btn btn-ghost" style={{ padding: '3px 8px', fontSize: 12 }} onClick={(e) => { e.stopPropagation(); startEditRow(r) }}>Edit</button>
                <button className="btn btn-ghost" style={{ padding: '3px 8px', fontSize: 12, color: 'var(--asw-slow)' }} onClick={(e) => { e.stopPropagation(); removeRow(r) }}>Delete</button>
              </span>
            </td>
          )}
        </tr>
        {isExpanded && !isRelay && splits.length > 0 && (
          <tr style={{ background: 'var(--color-surface)' }}>
            <td colSpan={colCount} style={{ padding: '10px 12px' }}>
              {/* one continuous strip — stays on a single line and scrolls
                  sideways for long events instead of wrapping */}
              <div style={{ overflowX: 'auto' }}>
                <div style={{ display: 'inline-flex', alignItems: 'stretch', border: '1px solid var(--color-divider)', background: 'var(--color-bg)' }}>
                  {splits.map((s, j) => (
                    <div key={j} style={{ padding: '5px 12px', textAlign: 'center', whiteSpace: 'nowrap', borderRight: j < splits.length - 1 ? '1px solid var(--color-divider)' : 'none' }}>
                      <div className="micro" style={{ fontSize: 9, marginBottom: 2 }}>{s.distance ? `${s.distance}m` : `#${j + 1}`}</div>
                      <div className="asw-num" style={{ fontSize: 13, fontWeight: 700 }}>{s.time}</div>
                    </div>
                  ))}
                </div>
              </div>
            </td>
          </tr>
        )}
        {isExpanded && isRelay && (r.relay_swimmers_detail || swimmers).map((s, j) => {
          const name = typeof s === 'string' ? s : s?.name
          const swId = s?.swimmer_id
          const splitTime = typeof s === 'object' ? (s?.split_time || '—') : '—'
          return (
            <tr key={`${r.id}-${j}`} style={{ background: 'var(--color-surface)', cursor: swId ? 'pointer' : 'default' }}
              onClick={() => { if (swId) navigate(`/swimmers/${swId}`) }}>
              <td className="asw-num text-muted num" style={{ fontSize: 12 }}>{j + 1}</td>
              <td style={{ paddingLeft: 36, fontSize: 13 }}>
                {swId ? (
                  <Link to={`/swimmers/${swId}`} style={{ color: 'inherit', textDecoration: 'none', fontWeight: 600 }}
                    onClick={(e) => e.stopPropagation()}>{name}</Link>
                ) : name}
              </td>
              <td className="hide-mobile" />
              {isNational && <td className="hide-mobile" />}
              <td className="time asw-num text-muted">{splitTime}</td>
              <td colSpan={editMode ? 2 : 1} />
            </tr>
          )
        })}
      </React.Fragment>
    )
  }

  return (
    <div className="pad">
      {/* filters row */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 16 }}>
        <div className="field" style={{ width: 320, maxWidth: '100%' }}>
          <label>Event</label>
          <select className="select" value={eventKey} onChange={(e) => setEventKey(e.target.value)}>
            {filteredEvents.map((ev) => (
              <option key={`${ev.event_id}|${ev.gender}`} value={`${ev.event_id}|${ev.gender}`}>
                {(ev.display_name || ev.event_name || '').replace(/\s*[—–-]\s*(Men|Women|Mixed)\s*$/i, '')}
              </option>
            ))}
          </select>
        </div>
        {hasCategories && (
          <div className="field" style={{ width: 180, maxWidth: '100%' }}>
            <label>Category</label>
            <select
              className="select"
              value={selectedCategory}
              onChange={(e) => { setSelectedCategory(e.target.value); setExpandedRow(null) }}
            >
              <option value="ALL">All categories</option>
              {hasOpenPodium && <option value="OPEN">TC</option>}
              {categories.map((c) => (
                <option key={c || '_general'} value={c}>{c || 'General'}</option>
              ))}
            </select>
          </div>
        )}
        <Seg
          options={[
            { value: 'M', label: 'Men' },
            { value: 'F', label: 'Women' },
            { value: 'X', label: 'Mixed' },
          ].filter((o) => events.some((e) => e.gender === o.value))}
          value={genderFilter}
          onChange={setGenderFilter}
        />
        {isAdmin && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button
              className={`btn ${editMode ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => { setEditMode((m) => !m); setEditingRow(null) }}
            >
              {editMode ? 'Done editing' : 'Edit results'}
            </button>
            <button className="btn btn-secondary" onClick={() => setShowAddResult(true)}>Add result</button>
            <Link className="btn btn-secondary" to={`/import?championship=${meetId}`}>Add results</Link>
          </div>
        )}
      </div>

      {isAdmin && showAddResult && (
        <AddResultModal
          meetId={meetId}
          defaultEventId={selectedEvent?.event_id}
          onClose={() => setShowAddResult(false)}
          onAdded={() => { setShowAddResult(false); loadResults(); if (onDataChanged) onDataChanged() }}
        />
      )}

      {isAdmin && editingRow && (
        <EditResultModal
          result={editingRow}
          isRelay={isRelay}
          onClose={() => setEditingRow(null)}
          onSaved={() => { setEditingRow(null); loadResults(); if (onDataChanged) onDataChanged() }}
        />
      )}

      {/* round filter */}
      {rounds.length > 1 && (
        <div style={{ marginBottom: 16, overflowX: 'auto' }}>
          <Seg
            options={rounds.map((r) => ({ value: r, label: roundLabel(r) }))}
            value={selectedRound}
            onChange={(r) => { setSelectedRound(r); setExpandedRow(null) }}
          />
        </div>
      )}

      {loading && <Loading label="Loading results" />}
      {!loading && grouped.length === 0 && <Empty label="No results for this selection" />}

      {!loading && grouped.length > 0 && (
        <div className="table-scroll">
          <table className="table results-table">
            <thead>
              <tr>
                <th className="rank-col"><span className="hide-mobile">Rank</span><span className="show-mobile">R</span></th>
                <th>Swimmer</th>
                <th className="num hide-mobile">Age</th>
                {isNational && <th className="hide-mobile">Team</th>}
                <th className="time">Time</th>
                <th className="num">FINA</th>
                {editMode && <th className="num">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {pageGroups.map(([cat, catRows], gi) => (
                <React.Fragment key={`${cat || '_general'}-${gi}`}>
                  {isOpenView && gi === 0 && (
                    <tr style={{ background: 'var(--color-surface)' }}>
                      <td colSpan={colCount} className="kicker" style={{ padding: '8px 8px' }}>TC — all categories, ranked by time</td>
                    </tr>
                  )}
                  {selectedCategory === 'ALL' && hasCategories && (
                    <tr style={{ background: 'var(--color-surface)' }}>
                      <td colSpan={colCount} className="kicker" style={{ padding: '8px 8px' }}>{cat || 'General'}</td>
                    </tr>
                  )}
                  {catRows.map((r) => renderRow(r, fullByCat.get(cat) || catRows))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/* ──────────────────────── Featured #1 cards ─────────────────────── */

// Special card with photo for the top male and top female athlete of a
// tab (PBs, Top performances, Most improved, Most decorated).
function FeaturedCards({ picks }) {
  const navigate = useNavigate()
  const shown = picks.filter(Boolean)
  if (shown.length === 0) return null
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 12, marginBottom: 22, maxWidth: 680 }}>
      {shown.map((p) => (
        <div
          key={p.tag}
          onClick={p.swimmer_id ? () => navigate(`/swimmers/${p.swimmer_id}`) : undefined}
          style={{
            border: '1px solid var(--color-divider)', background: 'var(--color-surface)',
            borderTop: '3px solid var(--asw-gold)', display: 'flex', gap: 12,
            cursor: p.swimmer_id ? 'pointer' : 'default', overflow: 'hidden',
          }}
        >
          <div className="grayscale" style={{ width: 84, alignSelf: 'stretch', minHeight: 96, flex: 'none', background: 'var(--color-accent-800)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 28, overflow: 'hidden' }}>
            {p.photo
              ? <img src={mediaUrl(p.photo)} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : (p.name || '?').charAt(0)}
          </div>
          <div style={{ flex: 1, minWidth: 0, padding: '10px 12px 10px 0', display: 'flex', flexDirection: 'column', gap: 3, justifyContent: 'center' }}>
            <div className="micro" style={{ color: 'var(--color-accent-800)', fontWeight: 700 }}>#1 · {p.tag}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
              <Flag code={p.nationality_code} name={p.name} />
              <span style={{ fontWeight: 800, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
            </div>
            {p.sub && <div className="micro" style={{ fontSize: 10, textTransform: 'none', letterSpacing: 0 }}>{p.sub}</div>}
            {p.value && (
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 20, lineHeight: 1 }}>{p.value}</span>
                {p.valueLabel && <span className="micro" style={{ fontSize: 10 }}>{p.valueLabel}</span>}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

/* ─────────────────────────── Medals tab ─────────────────────────── */

function MedalsTab({ meetId, isNational }) {
  const navigate = useNavigate()
  const [loaded, setLoaded] = useState(false)
  const [medals, setMedals] = useState([])
  const [country, setCountry] = useState([])
  const [club, setClub] = useState([])
  const [swimmer, setSwimmer] = useState([])
  const [scope, setScope] = useState(isNational ? 'club' : 'country')
  const [swimmerGender, setSwimmerGender] = useState('ALL')
  const [medalFilter, setMedalFilter] = useState('ALL')

  useEffect(() => {
    let alive = true
    Promise.allSettled([
      getMedals({ championship: meetId, page_size: 500 }),
      getMedalSummary({ championship: meetId }),
      getMedalClubSummary({ championship: meetId }),
      getMedalSwimmerSummary({ championship: meetId, limit: 'all' }),
    ]).then(([m, c, cl, s]) => {
      if (!alive) return
      setMedals(list(val(m)))
      setCountry(list(val(c)))
      setClub(list(val(cl)))
      setSwimmer(list(val(s)))
      setLoaded(true)
    })
    return () => { alive = false }
  }, [meetId])

  if (!loaded) return <Loading label="Loading medals" />

  const goldCount = medals.filter((m) => m.medal_type === 'GOLD').length
  const silverCount = medals.filter((m) => m.medal_type === 'SILVER').length
  const bronzeCount = medals.filter((m) => m.medal_type === 'BRONZE').length

  if (medals.length === 0 && country.length === 0 && club.length === 0 && swimmer.length === 0) {
    return <Empty label="No medals yet — medals are computed from results" />
  }

  // International meets NEVER show a club tally — only country + swimmer.
  const scopeOptions = [
    !isNational && country.length > 0 && { value: 'country', label: 'Country Tally' },
    isNational && club.length > 0 && { value: 'club', label: 'Club Tally' },
    swimmer.length > 0 && { value: 'swimmer', label: 'Swimmer Tally' },
  ].filter(Boolean)

  // Keep the selected scope valid for this meet type
  const activeScope = scopeOptions.some((o) => o.value === scope)
    ? scope : (scopeOptions[0]?.value || 'swimmer')

  let tallyRows = activeScope === 'country' ? country : activeScope === 'club' ? club : swimmer
  if (activeScope === 'swimmer' && swimmerGender !== 'ALL') {
    tallyRows = tallyRows.filter((r) => r.swimmer__sex === swimmerGender)
  }

  // Most decorated: top male + female athletes by medal tally
  const decoratedPick = (sex, tag) => {
    const r = swimmer.find((x) => x.swimmer__sex === sex)
    if (!r) return null
    return {
      tag,
      swimmer_id: r.swimmer__id,
      name: r.swimmer__name,
      nationality_code: r.swimmer__nationality__code,
      photo: r.swimmer__photo,
      sub: 'Most decorated',
      value: `${r.gold || 0}G · ${r.silver || 0}S · ${r.bronze || 0}B`,
    }
  }

  const filteredMedals = medalFilter === 'ALL'
    ? [...medals].sort((a, b) => {
        const order = { GOLD: 0, SILVER: 1, BRONZE: 2 }
        return (order[a.medal_type] ?? 3) - (order[b.medal_type] ?? 3)
      })
    : medals.filter((m) => m.medal_type === medalFilter)

  return (
    <div>
      {/* medal counts strip */}
      {medals.length > 0 && (
        <div className="counts rule-b" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          {[
            ['GOLD', goldCount, 'Gold', 'var(--asw-gold)'],
            ['SILVER', silverCount, 'Silver', 'var(--asw-silver)'],
            ['BRONZE', bronzeCount, 'Bronze', 'var(--asw-bronze)'],
          ].map(([type, n, label, color]) => (
            <div key={type}>
              <div className="n" style={{ color, display: 'flex', alignItems: 'center', gap: 10 }}>
                <MedalIcon type={type} size={24} />{n}
              </div>
              <div className="l">{label}</div>
            </div>
          ))}
        </div>
      )}

      <div className="pad">
        <FeaturedCards picks={[decoratedPick('M', 'Men'), decoratedPick('F', 'Women')]} />
        {/* tally */}
        {scopeOptions.length > 0 && (
          <>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
              <Seg options={scopeOptions} value={activeScope} onChange={setScope} />
              {activeScope === 'swimmer' && (
                <Seg
                  options={[{ value: 'ALL', label: 'All' }, { value: 'M', label: 'Men' }, { value: 'F', label: 'Women' }]}
                  value={swimmerGender}
                  onChange={setSwimmerGender}
                />
              )}
            </div>
            {tallyRows.length === 0 ? (
              <Empty label="No medals recorded" />
            ) : (
              <div className="table-scroll" style={{ marginBottom: 28 }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ width: 30 }}>#</th>
                      <th>{activeScope === 'country' ? 'Country' : activeScope === 'club' ? 'Club' : 'Swimmer'}</th>
                      <th className="num">G</th>
                      <th className="num">S</th>
                      <th className="num">B</th>
                      <th className="num">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tallyRows.map((row, i) => (
                      <tr
                        key={i}
                        style={{ cursor: activeScope === 'swimmer' ? 'pointer' : 'default' }}
                        onClick={() => activeScope === 'swimmer' && row.swimmer__id && navigate(`/swimmers/${row.swimmer__id}`)}
                      >
                        <td className="asw-num">{i + 1}</td>
                        <td>
                          {activeScope === 'country' && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <Flag code={row.swimmer__nationality__code} name={row.swimmer__nationality__name} />
                              {row.swimmer__nationality__name}
                            </div>
                          )}
                          {activeScope === 'club' && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                              <ClubLogo logo={row.team_logo} name={row.result__team} />
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {row.result__team || '—'}
                              </span>
                            </div>
                          )}
                          {activeScope === 'swimmer' && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <Flag code={row.swimmer__nationality__code} name={row.swimmer__nationality__name} />
                              {row.swimmer__name}
                            </div>
                          )}
                        </td>
                        <td className="num asw-num" style={{ fontWeight: 800 }}>{row.gold || 0}</td>
                        <td className="num asw-num">{row.silver || 0}</td>
                        <td className="num asw-num">{row.bronze || 0}</td>
                        <td className="num asw-num">{row.total ?? ((row.gold || 0) + (row.silver || 0) + (row.bronze || 0))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* all medals */}
        {medals.length > 0 && (
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
              <div className="kicker">All medals ({filteredMedals.length})</div>
              <Seg
                options={[
                  { value: 'ALL', label: `All (${medals.length})` },
                  { value: 'GOLD', label: `Gold (${goldCount})` },
                  { value: 'SILVER', label: `Silver (${silverCount})` },
                  { value: 'BRONZE', label: `Bronze (${bronzeCount})` },
                ]}
                value={medalFilter}
                onChange={setMedalFilter}
              />
            </div>
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>Medal</th>
                    <th>Swimmer</th>
                    <th>Event</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMedals.map((m, i) => (
                    // Relay-team placeholders are clubs, not swimmers — no profile to open
                    <tr
                      key={m.id || i}
                      style={{ cursor: m.swimmer_detail?.is_relay_team ? 'default' : 'pointer' }}
                      onClick={m.swimmer_detail?.is_relay_team ? undefined : () => navigate(`/swimmers/${m.swimmer_detail?.id || m.swimmer}`)}
                    >
                      <td><MedalIcon type={m.medal_type} size={18} style={{ display: 'block' }} /></td>
                      <td style={{ paddingLeft: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                          <Flag code={m.swimmer_detail?.nationality_detail?.code} name={m.swimmer_detail?.nationality_detail?.name} />
                          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 'min(48vw, 340px)' }}>
                            {m.swimmer_detail?.name}
                          </span>
                          {m.swimmer_detail?.is_relay_team && (
                            <span className="tag tag-neutral" style={{ flex: 'none' }}>{isNational ? 'Club' : 'Country'}</span>
                          )}
                        </div>
                      </td>
                      <td>{m.event_detail?.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ────────────────────────── Statistics tab ────────────────────────── */

function PersonalBestsTab({ stats }) {
  const navigate = useNavigate()

  // Only swims that actually improved a previous best — first-ever swims
  // in an event are not "personal bests achieved".
  const pbs = (stats?.personal_bests || []).filter((s) => s.previous_best)
  const hasPbs = pbs.length > 0
  if (!hasPbs) return <Empty label="No personal bests yet" />

  // #1 male and female by FINA points (list is FINA-sorted)
  const pbPick = (sex, tag) => {
    const s = pbs.find((x) => x.gender === sex)
    if (!s) return null
    return {
      tag,
      swimmer_id: s.swimmer_id,
      name: s.swimmer_name,
      nationality_code: s.nationality_code,
      photo: s.photo,
      sub: s.event_name,
      value: s.time,
      valueLabel: s.fina_points ? `${s.fina_points} FINA` : '',
    }
  }

  return (
    <div className="pad">
      <FeaturedCards picks={[pbPick('M', 'Men'), pbPick('F', 'Women')]} />
      {/* personal bests achieved */}
      {hasPbs && (
        <div style={{ marginBottom: 28 }}>
          <div className="kicker" style={{ marginBottom: 4 }}>Personal bests achieved</div>
          <div className="micro" style={{ marginBottom: 10, textTransform: 'none', letterSpacing: 0, fontSize: 12 }}>Swimmers who improved their all-time best at this meet</div>
          <div className="rule-t">
            {pbs.map((s, i) => (
              <div
                key={i}
                className="hair-b asw-fade-up"
                style={{ padding: '12px 0', cursor: 'pointer', animationDelay: `${Math.min(i * 30, 300)}ms` }}
                onClick={() => navigate(`/swimmers/${s.swimmer_id}`)}
              >
                {/* Line 1 — rank + swimmer + new time */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="asw-num" style={{ width: 26, height: 26, flex: 'none', background: 'var(--color-accent-800)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 12 }}>
                    {i + 1}
                  </span>
                  <Flag code={s.nationality_code} name={s.swimmer_name} />
                  <span style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.swimmer_name}
                  </span>
                  <span className="asw-time asw-fast" style={{ fontSize: 18, fontWeight: 700, flex: 'none' }}>{s.time}</span>
                </div>
                {/* Line 2 — event + FINA */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, paddingLeft: 36 }}>
                  <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                    {s.event_name}
                  </span>
                  {s.fina_points != null && <span className="tag tag-neutral asw-num" style={{ flex: 'none' }}>{s.fina_points} FINA</span>}
                </div>
                {/* Line 3 — previous PB */}
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4, paddingLeft: 36, fontSize: 12, color: 'var(--color-neutral-700)' }}>
                  <span className="micro" style={{ flex: 'none' }}>Previous</span>
                  <span className="asw-time" style={{ fontWeight: 700 }}>{s.previous_best}</span>
                  {s.improvement_cs > 0 && (
                    <span className="asw-num" style={{ color: 'var(--asw-fast, #1a7f37)', fontWeight: 700 }}>
                      −{(s.improvement_cs / 100).toFixed(2)}s
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ──────────────────────── Top performances tab ─────────────────────── */

function TopPerformancesTab({ stats }) {
  const navigate = useNavigate()
  const [perfGender, setPerfGender] = useState('overall')

  const all = stats?.top_performers || []
  if (all.length === 0) return <Empty label="No top performances yet" />

  const performers = all
    .filter((t) => perfGender === 'overall' || t.gender === perfGender)
    .slice(0, 30)
  const maxFina = performers[0]?.fina_points || 1

  // #1 male and female by FINA points
  const perfPick = (sex, tag) => {
    const t = all.find((x) => x.gender === sex)
    if (!t) return null
    return {
      tag,
      swimmer_id: t.swimmer_id,
      name: t.swimmer_name,
      nationality_code: t.nationality_code,
      photo: t.photo,
      sub: t.event_name,
      value: String(t.fina_points || ''),
      valueLabel: 'FINA points',
    }
  }

  return (
    <div className="pad">
      <FeaturedCards picks={[perfPick('M', 'Men'), perfPick('F', 'Women')]} />
      {(
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
            <div className="kicker">Top performances — highest FINA points</div>
            <Seg
              options={[{ value: 'overall', label: 'Overall' }, { value: 'M', label: 'Men' }, { value: 'F', label: 'Women' }]}
              value={perfGender}
              onChange={setPerfGender}
            />
          </div>
          {performers.length === 0 ? (
            <Empty label="No performances for this filter" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 760 }}>
              {performers.map((t, i) => (
                <div key={i} style={{ cursor: 'pointer' }} onClick={() => navigate(`/swimmers/${t.swimmer_id}`)}>
                  <div style={{ display: 'grid', gridTemplateColumns: '22px auto minmax(0, 1.2fr) minmax(0, 1fr) auto', alignItems: 'center', gap: 8, fontSize: 15, marginBottom: 4 }}>
                    <span className="asw-num text-muted">{i + 1}</span>
                    <Flag code={t.nationality_code} name={t.swimmer_name} />
                    <span style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.swimmer_name}</span>
                    <span className="text-muted" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.event_name}</span>
                    <span className="asw-num" style={{ fontWeight: 800, textAlign: 'right' }}>{t.fina_points}</span>
                  </div>
                  <div className="bar">
                    <div style={{ width: `${Math.round(((t.fina_points || 0) / maxFina) * 100)}%`, background: i < 3 ? 'var(--color-accent)' : 'var(--color-neutral-800)' }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function OverviewTab({ meetId, stats }) {
  const navigate = useNavigate()
  const [comparison, setComparison] = useState([])
  const [qs, setQs] = useState(null)
  const [qsLoading, setQsLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setQsLoading(true)
    getQuickStats(meetId)
      .then((res) => { if (alive) setQs(res.data) })
      .catch(() => { if (alive) setQs(null) })
      .finally(() => { if (alive) setQsLoading(false) })
    getChampionshipComparison(meetId)
      .then((res) => { if (alive) setComparison(list(res.data)) })
      .catch(() => {})
    return () => { alive = false }
  }, [meetId])

  if (qsLoading) return <Loading label="Loading overview" />
  if (!qs?.championship) return <Empty label="No overview available yet" />

  return (
    <div>
      {/* home-page style quick statistics + busiest swimmers widget */}
      <QuickStatsView data={qs} busiest={stats?.busiest_swimmers} />

      {/* comparison with previous editions */}
      {comparison.length > 1 && (
        <div className="pad">
          <div className="kicker" style={{ marginBottom: 4 }}>Compare with previous editions</div>
          <div className="micro" style={{ marginBottom: 10, textTransform: 'none', letterSpacing: 0, fontSize: 12 }}>Same classification, same pool type</div>
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Championship</th>
                  <th>Host</th>
                  <th className="num">Year</th>
                  <th className="num">Swimmers</th>
                  <th className="num">Countries</th>
                  <th className="num">Events</th>
                  <th className="num">Results</th>
                  <th className="num">Best FINA</th>
                </tr>
              </thead>
              <tbody>
                {comparison.map((ch) => (
                  <tr
                    key={ch.id}
                    style={{ cursor: ch.is_current ? 'default' : 'pointer', background: ch.is_current ? 'var(--color-accent-100)' : undefined }}
                    onClick={() => !ch.is_current && navigate(`/meets/${ch.id}?tab=statistics`)}
                  >
                    <td style={{ fontWeight: ch.is_current ? 700 : 400 }}>
                      {ch.name}
                      {ch.is_current && <span className="tag tag-accent" style={{ marginLeft: 8 }}>Current</span>}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Flag code={ch.country_code} name={ch.country} />
                        <span className="hide-mobile">{ch.country}</span>
                      </div>
                    </td>
                    <td className="num asw-num">{ch.year}</td>
                    <td className="num asw-num">{ch.total_swimmers}</td>
                    <td className="num asw-num">{ch.countries_count}</td>
                    <td className="num asw-num">{ch.total_events}</td>
                    <td className="num asw-num">{ch.total_results}</td>
                    <td className="num asw-num" style={{ fontWeight: 800 }}>{ch.best_fina || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

/* ───────────────────────── Most improved tab ───────────────────────── */

function MostImprovedTab({ meetId }) {
  const navigate = useNavigate()
  const [rows, setRows] = useState(null)
  const [gender, setGender] = useState('overall')

  useEffect(() => {
    let alive = true
    getMostImproved(meetId)
      .then((res) => { if (alive) setRows(list(res.data)) })
      .catch(() => { if (alive) setRows([]) })
    return () => { alive = false }
  }, [meetId])

  if (rows === null) return <Loading label="Loading most improved" />

  // Only genuine improvements — swimmers with no previous time never appear
  const improvements = rows.filter((s) => !s.is_new_entry)
  const filtered = improvements.filter((s) => gender === 'overall' || s.gender === gender)

  // #1 male and female by time drop (list is sorted by improvement)
  const improvedPick = (sex, tag) => {
    const s = improvements.find((x) => x.gender === sex)
    if (!s) return null
    return {
      tag,
      swimmer_id: s.swimmer_id,
      name: s.swimmer_name,
      nationality_code: s.nationality_code,
      photo: s.photo,
      sub: s.event_name,
      value: `−${s.improvement}s`,
      valueLabel: `${s.previous_best} → ${s.current_time}`,
    }
  }

  return (
    <div className="pad">
      <FeaturedCards picks={[improvedPick('M', 'Men'), improvedPick('F', 'Women')]} />
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <div className="kicker">Most improved swimmers</div>
          <div className="micro" style={{ textTransform: 'none', letterSpacing: 0, fontSize: 12, marginTop: 4 }}>Biggest time drops vs previous personal best</div>
        </div>
        <Seg
          options={[{ value: 'overall', label: 'Overall' }, { value: 'M', label: 'Men' }, { value: 'F', label: 'Women' }]}
          value={gender}
          onChange={setGender}
        />
      </div>
      {filtered.length === 0 ? (
        <Empty label="No improvements recorded for this meet" />
      ) : (() => {
        const maxDrop = Math.max(0.01, ...filtered.map((s) => parseFloat(s.improvement) || 0))
        return (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(235px, 1fr))', gap: 10 }}>
            {filtered.map((s, i) => {
              const drop = parseFloat(s.improvement) || 0
              const top3 = i < 3
              return (
                <div
                  key={i}
                  onClick={() => navigate(`/swimmers/${s.swimmer_id}`)}
                  style={{
                    border: '1px solid var(--color-divider)', background: 'var(--color-surface)',
                    borderTop: `3px solid ${top3 ? 'var(--asw-gold)' : 'var(--color-accent-800)'}`,
                    padding: '10px 12px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 7,
                  }}
                >
                  {/* rank + swimmer + headline drop */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="asw-num" style={{
                      width: 22, height: 22, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 11,
                      background: top3 ? 'var(--asw-gold)' : 'var(--color-accent-800)', color: '#fff',
                    }}>{i + 1}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Flag code={s.nationality_code} name={s.swimmer_name} />
                        <span style={{ fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.swimmer_name}</span>
                      </div>
                      <div className="micro" style={{ marginTop: 1, fontSize: 10 }}>{s.event_name}</div>
                    </div>
                    <span className="asw-num" style={{ flex: 'none', fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 18, lineHeight: 1, color: 'var(--asw-fast)' }}>
                      −{s.improvement}s
                    </span>
                  </div>

                  {/* time journey + relative drop bar */}
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                    <span className="asw-num" style={{ fontSize: 13, color: 'var(--color-neutral-600)', textDecoration: 'line-through' }}>{s.previous_best}</span>
                    <span style={{ color: 'var(--asw-fast)', fontWeight: 700, fontSize: 12 }}>→</span>
                    <span className="asw-time" style={{ fontSize: 16 }}>{s.current_time}</span>
                  </div>
                  <div className="bar" style={{ height: 4 }}>
                    <div style={{ width: `${Math.max(4, Math.round((drop / maxDrop) * 100))}%`, background: 'var(--asw-fast)' }} />
                  </div>
                </div>
              )
            })}
          </div>
        )
      })()}
    </div>
  )
}

/* ───────────────────────── Broken records tab ───────────────────────── */

const BROKEN_SCOPE_LABEL = { arab: 'Arab records', gcc: 'GCC records', national: 'National records' }
const BROKEN_SCOPE_COLOR = { arab: '#1c4e86', gcc: '#7d8a99', national: 'var(--color-accent-800)' }

function RecordsBrokenTab({ meetId }) {
  const navigate = useNavigate()
  const [rows, setRows] = useState(null)
  const [gender, setGender] = useState('ALL')

  useEffect(() => {
    let alive = true
    getRecordsBroken(meetId)
      .then((res) => { if (alive) setRows(list(res.data)) })
      .catch(() => { if (alive) setRows([]) })
    return () => { alive = false }
  }, [meetId])

  if (rows === null) return <Loading label="Computing broken records" />
  if (rows.length === 0) return <Empty label="No records were broken at this meet" />

  const genderOptions = [
    { value: 'ALL', label: 'All' },
    ...['M', 'F', 'X'].filter((g) => rows.some((r) => r.gender === g))
      .map((g) => ({ value: g, label: GENDER_LABEL[g] || 'Mixed' })),
  ]
  const filtered = gender === 'ALL' ? rows : rows.filter((r) => r.gender === gender)

  // Group: Arab → GCC → National (one block per country)
  const groups = []
  filtered.forEach((r) => {
    const key = r.scope === 'national' ? `national-${r.country_code}` : r.scope
    let g = groups.find((x) => x.key === key)
    if (!g) {
      g = {
        key,
        scope: r.scope,
        label: r.scope === 'national'
          ? `${r.country} national records`
          : BROKEN_SCOPE_LABEL[r.scope] || r.scope,
        rows: [],
      }
      groups.push(g)
    }
    g.rows.push(r)
  })

  return (
    <div className="pad">
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Seg options={genderOptions} value={gender} onChange={setGender} />
      </div>
      <div className="micro" style={{ marginBottom: 18, textTransform: 'none', letterSpacing: 0, fontSize: 12 }}>
        Individual and relay records — computed automatically by comparing this meet's swims against the best times on record before the meet (same pool).
      </div>
      {filtered.length === 0 && <Empty label="No records broken for this filter" />}
      {groups.map((g) => {
        const c = BROKEN_SCOPE_COLOR[g.scope] || 'var(--color-accent)'
        return (
          <div key={g.key} style={{ marginBottom: 32 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, paddingBottom: 6, borderBottom: `2px solid ${c}`, marginBottom: 2 }}>
              <span className="tag" style={{ background: c, color: '#fff', border: 0 }}>{g.label.toUpperCase()}</span>
              <span className="micro asw-num">{g.rows.length} record{g.rows.length !== 1 ? 's' : ''}</span>
            </div>
            {g.rows.map((r, i) => (
              <div
                key={i}
                className="hair-b asw-fade-up"
                style={{
                  padding: '12px 0 12px 12px', borderLeft: `4px solid ${c}`,
                  cursor: r.is_relay_team ? 'default' : 'pointer',
                  animationDelay: `${Math.min(i * 40, 320)}ms`,
                }}
                onClick={r.is_relay_team ? undefined : () => navigate(`/swimmers/${r.swimmer_id}`)}
              >
                {/* Line 1 — event + gender + new time */}
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 15, textTransform: 'uppercase', letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>
                      {r.event_name}
                    </span>
                    <span className={`tag ${r.gender === 'F' ? 'tag-accent-2' : r.gender === 'X' ? 'tag-neutral' : 'tag-accent'}`} style={{ flex: 'none' }}>
                      {GENDER_LABEL[r.gender] || 'Mixed'}
                    </span>
                    {r.is_relay_team && <span className="tag tag-outline" style={{ flex: 'none' }}>Relay</span>}
                  </div>
                  <span className="asw-time asw-fast" style={{ fontSize: 20, fontWeight: 700, flex: 'none' }}>{r.time}</span>
                </div>
                {/* Line 2 — swimmer / team */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                  <Flag code={r.nationality_code} name={r.swimmer_name} />
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{r.swimmer_name}</span>
                </div>
                {/* Line 3 — previous record */}
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginTop: 6, fontSize: 12, color: 'var(--color-neutral-700)' }}>
                  <span className="micro" style={{ flex: 'none' }}>Previous</span>
                  <span className="asw-time" style={{ fontWeight: 700 }}>{r.previous_time}</span>
                  <span className="asw-num" style={{ color: 'var(--asw-fast, #1a7f37)', fontWeight: 700 }}>
                    −{(r.improvement_centiseconds / 100).toFixed(2)}s
                  </span>
                  {r.previous_holder && (
                    <span style={{ minWidth: 0 }}>
                      {r.previous_holder}{r.previous_date ? ` · ${formatDate(r.previous_date)}` : ''}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}

/* ─────────────────────────── Program tab ─────────────────────────── */

const PROGRAM_GENDER = { M: 'Men', F: 'Women', X: 'Mixed' }

const PROGRAM_SESSION = { HEATS: 'Heats', SEMIS: 'Semifinals', FINALS: 'Finals' }
const SESSION_SORT = ['HEATS', 'SEMIS', 'FINALS', '']

function ProgramTab({ meetId, isAdmin, resultEvents }) {
  const [, setSearchParams] = useSearchParams()
  const [days, setDays] = useState(null)

  const load = () => {
    getMeetProgram(meetId)
      .then((res) => setDays(res.data?.days || []))
      .catch(() => setDays([]))
  }
  useEffect(load, [meetId])

  if (days === null) return <Loading label="Loading program" />
  const hasItems = days.some((d) => d.items.length > 0)

  // an item links to Results only when that event+gender actually has results
  const hasResults = (it) => (resultEvents || []).some(
    (e) => String(e.event_id) === String(it.event) && e.gender === it.gender,
  )
  const openResults = (it) => setSearchParams({ tab: 'results', event: String(it.event), gender: it.gender })

  // group a day's items into sessions (Heats → Semifinals → Finals → unscheduled)
  const sessionsOf = (d) => {
    const groups = new Map()
    d.items.forEach((it) => {
      const key = it.session || ''
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(it)
    })
    return [...groups.entries()].sort((a, b) => SESSION_SORT.indexOf(a[0]) - SESSION_SORT.indexOf(b[0]))
  }

  return (
    <div className="pad-lg">
      {hasItems ? (
        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', marginBottom: isAdmin ? 26 : 0 }}>
          {days.map((d) => (
            <div key={d.day} style={{ border: '1px solid var(--color-divider)', background: 'var(--color-surface)' }}>
              <div style={{ padding: '10px 14px', borderBottom: '2px solid var(--asw-gold)', display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 15 }}>Day {d.day}</span>
                <span className="micro">{formatDate(d.date)}</span>
              </div>
              {d.items.length > 0 ? (
                <div style={{ padding: '6px 0' }}>
                  {sessionsOf(d).map(([session, items]) => (
                    <div key={session || 'none'}>
                      {session && (
                        <div className="micro" style={{ padding: '7px 14px 3px', color: 'var(--color-accent-800)', fontWeight: 700 }}>
                          {PROGRAM_SESSION[session]}
                        </div>
                      )}
                      {items.map((it, i) => {
                        const linked = hasResults(it)
                        return (
                          <div
                            key={it.id || `${it.event}-${i}`}
                            onClick={linked ? () => openResults(it) : undefined}
                            title={linked ? 'View results' : undefined}
                            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 14px', fontSize: 13, cursor: linked ? 'pointer' : 'default' }}
                          >
                            <span className="asw-num" style={{ width: 20, color: 'var(--color-neutral-400)', flex: 'none' }}>{i + 1}</span>
                            <span style={{ fontWeight: 600, textDecoration: linked ? 'underline' : 'none', textDecorationColor: 'var(--color-neutral-300)', textUnderlineOffset: 3 }}>
                              {it.event_name}
                            </span>
                            {it.age_category && <span className="tag tag-neutral" style={{ flex: 'none' }}>{it.age_category}</span>}
                            <span className="micro" style={{ marginLeft: 'auto' }}>{PROGRAM_GENDER[it.gender]}</span>
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="micro" style={{ padding: '10px 14px', textTransform: 'none', letterSpacing: 0 }}>Rest day / no events</div>
              )}
            </div>
          ))}
        </div>
      ) : (
        !isAdmin && <Empty label="The day-by-day program has not been published for this meet" />
      )}
      {isAdmin && <MeetProgramEditor champId={meetId} onSaved={load} />}
    </div>
  )
}

/* ────────────────────────── Admin: edit meet ─────────────────────── */

function MeetEditPanel({ meet, onSaved, onClose }) {
  const navigate = useNavigate()
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    const results = meet.results_count ?? ''
    const msg = results
      ? `Delete "${meet.name}" and its ${results} results? This cannot be undone.`
      : `Delete "${meet.name}"? This cannot be undone.`
    if (!window.confirm(msg)) return
    setDeleting(true)
    try {
      await deleteChampionship(meet.id)
      navigate('/meets')
    } catch {
      window.alert('Failed to delete the championship')
      setDeleting(false)
    }
  }
  const [form, setForm] = useState({
    name: meet.name || '',
    date: meet.date || '',
    end_date: meet.end_date || '',
    pool: meet.pool || 'LCM',
    location: meet.location || '',
    country: meet.country || '',
    classification: meet.classification || '',
    sub_classification: meet.sub_classification || '',
    website: meet.website || '',
    live_results_url: meet.live_results_url || '',
    registration_url: meet.registration_url || '',
    has_double_podium: !!meet.has_double_podium,
    b_final_no_medals: !!meet.b_final_no_medals,
  })
  const [photo, setPhoto] = useState(null)
  const [cropFile, setCropFile] = useState(null)
  const [countries, setCountries] = useState([])
  const [classifications, setClassifications] = useState([])
  const [subClassifications, setSubClassifications] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getCountries().then((res) => setCountries(list(res.data))).catch(() => {})
    getClassifications().then((res) => setClassifications(list(res.data))).catch(() => {})
  }, [])

  useEffect(() => {
    if (!form.classification) { setSubClassifications([]); return }
    getSubClassifications(form.classification)
      .then((res) => setSubClassifications(list(res.data)))
      .catch(() => setSubClassifications([]))
  }, [form.classification])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const save = async () => {
    if (!form.name.trim() || !form.date) { setError('Name and start date are required'); return }
    if (form.end_date && form.end_date < form.date) { setError('End date cannot be before the start date'); return }
    setSaving(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('name', form.name.trim())
      fd.append('date', form.date)
      fd.append('end_date', form.end_date || '')
      fd.append('pool', form.pool)
      fd.append('location', form.location.trim())
      fd.append('country', form.country || '')
      fd.append('classification', form.classification || '')
      fd.append('sub_classification', form.sub_classification || '')
      fd.append('website', form.website.trim())
      fd.append('live_results_url', form.live_results_url.trim())
      fd.append('registration_url', form.registration_url.trim())
      fd.append('has_double_podium', form.has_double_podium ? 'true' : 'false')
      fd.append('b_final_no_medals', form.b_final_no_medals ? 'true' : 'false')
      if (photo) fd.append('meet_photo', photo)
      const res = await updateChampionship(meet.id, fd)
      onSaved(res.data)
    } catch (err) {
      const d = err.response?.data
      const k = d && typeof d === 'object' ? Object.keys(d)[0] : null
      setError(k && Array.isArray(d[k]) ? `${k}: ${d[k][0]}` : (d?.detail || 'Failed to save changes'))
      setSaving(false)
    }
  }

  return (
    <div className="rule-b" style={{ padding: '18px 32px', background: 'var(--color-surface)' }}>
      <div className="kicker" style={{ marginBottom: 14 }}>Edit meet</div>
      {error && (
        <div style={{ border: '1px solid var(--asw-slow)', color: 'var(--asw-slow)', padding: '8px 12px', fontSize: 13, marginBottom: 12 }}>
          {error}
        </div>
      )}
      <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, maxWidth: 760 }}>
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label>Meet name *</label>
          <input className="input" type="text" value={form.name} onChange={set('name')} />
        </div>
        <div className="field">
          <label>Start date *</label>
          <input className="input" type="date" value={form.date} onChange={set('date')} />
        </div>
        <div className="field">
          <label>End date</label>
          <input className="input" type="date" value={form.end_date} min={form.date || undefined} onChange={set('end_date')} />
        </div>
        <div className="field">
          <label>Pool</label>
          <select className="select" value={form.pool} onChange={set('pool')}>
            {POOL_TYPES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Country</label>
          <select className="select" value={form.country} onChange={set('country')}>
            <option value="">—</option>
            {countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label>Location (city / venue)</label>
          <input className="input" type="text" value={form.location} onChange={set('location')} />
        </div>
        <div className="field">
          <label>Classification</label>
          <select className="select" value={form.classification}
            onChange={(e) => setForm((f) => ({ ...f, classification: e.target.value, sub_classification: '' }))}>
            <option value="">—</option>
            {classifications.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Sub classification</label>
          <select className="select" value={form.sub_classification} disabled={!subClassifications.length} onChange={set('sub_classification')}>
            <option value="">—</option>
            {subClassifications.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Website</label>
          <input className="input" type="url" value={form.website} onChange={set('website')} placeholder="https://…" />
        </div>
        <div className="field">
          <label>Live results URL</label>
          <input className="input" type="url" value={form.live_results_url} onChange={set('live_results_url')} placeholder="https://…" />
        </div>
        <div className="field">
          <label>Registration URL</label>
          <input className="input" type="url" value={form.registration_url} onChange={set('registration_url')} placeholder="https://…" />
        </div>
        <div className="field">
          <label>Meet photo {meet.meet_photo ? '(replace)' : ''}</label>
          <input className="input" type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) setCropFile(f) }} />
          {photo && <div className="micro" style={{ marginTop: 4, color: 'var(--asw-fast)' }}>Cropped photo ready</div>}
        </div>
        {cropFile && (
          <ImageCropper file={cropFile} aspect={1}
            onDone={(f) => { setPhoto(f); setCropFile(null) }}
            onCancel={() => setCropFile(null)} />
        )}
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={form.has_double_podium}
              onChange={(e) => setForm((f) => ({ ...f, has_double_podium: e.target.checked }))}
            />
            Double podium — foreign guest swimmers keep their medals AND host-country swimmers get their own parallel podium (medals recompute on save)
          </label>
        </div>
        {(countries.find((c) => String(c.id) === String(form.country))?.code === 'TUN' || form.b_final_no_medals) && (
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={form.b_final_no_medals}
                onChange={(e) => setForm((f) => ({ ...f, b_final_no_medals: e.target.checked }))}
              />
              Finale B gets no medals — Tunisian TC LCM nationals rule: only Finale A and the open/TC podium award medals (medals recompute on save)
            </label>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-primary" onClick={save} disabled={saving || deleting}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving || deleting}>Cancel</button>
        <button type="button" className="btn btn-secondary" style={{ color: 'var(--asw-slow)', marginLeft: 'auto' }}
          onClick={handleDelete} disabled={saving || deleting}>
          {deleting ? 'Deleting…' : 'Delete meet'}
        </button>
      </div>
    </div>
  )
}

/* ───────────────────────── Compare meets modal ─────────────────────── */

function CompareMeetsModal({ meet, onClose }) {
  const [candidates, setCandidates] = useState([])
  const [otherId, setOtherId] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Only meets in the same pool are comparable — LCM and SCM times
  // measure different things, so cross-pool comparison is meaningless.
  useEffect(() => {
    getChampionships({ page_size: 500 })
      .then((res) => {
        const all = list(res.data)
        setCandidates(all.filter((c) => c.pool === meet.pool && String(c.id) !== String(meet.id)))
      })
      .catch(() => setCandidates([]))
  }, [meet.id, meet.pool])

  useEffect(() => {
    if (!otherId) { setData(null); return }
    let alive = true
    setLoading(true)
    setError('')
    getHeadToHead(meet.id, otherId)
      .then((res) => { if (alive) setData(res.data) })
      .catch((err) => {
        if (!alive) return
        setData(null)
        setError(err?.response?.data?.detail || 'Could not compare these meets')
      })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [meet.id, otherId])

  const a = data?.a
  const b = data?.b
  const metricRows = a && b ? [
    ['Swimmers', a.swimmers, b.swimmers],
    ['Male / Female', `${a.male} / ${a.female}`, `${b.male} / ${b.female}`, true],
    ['Countries', a.countries, b.countries],
    ['Clubs / Teams', a.clubs, b.clubs],
    ['Events swum', a.events, b.events],
    ['Results', a.results, b.results],
    ['Medals awarded', a.medals, b.medals],
    ['Records broken', a.records_broken, b.records_broken],
    ['Average age', a.avg_age ?? '—', b.avg_age ?? '—', true],
    ['Best FINA points', a.best_fina ?? '—', b.best_fina ?? '—'],
  ] : []

  const genders = [['M', 'Men'], ['F', 'Women'], ['X', 'Mixed']]

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(8,24,44,0.6)', zIndex: 100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '4vh 16px', overflowY: 'auto' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ width: 860, maxWidth: '100%', background: 'var(--color-bg)', borderTop: '4px solid var(--color-accent)' }}>
        <div className="rule-b" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 24px' }}>
          <strong style={{ fontFamily: 'var(--font-heading)', fontSize: 17 }}>Compare meets</strong>
          <button type="button" onClick={onClose} aria-label="Close" style={{ fontSize: 20, lineHeight: 1, border: 'none', background: 'none', cursor: 'pointer' }}>×</button>
        </div>

        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <div className="micro" style={{ marginBottom: 6 }}>
              Comparing <strong>{meet.name}</strong> with · same pool only ({meet.pool})
            </div>
            <select className="select" style={{ width: '100%', maxWidth: 460 }} value={otherId} onChange={(e) => setOtherId(e.target.value)}>
              <option value="">Choose a meet…</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {(c.date || '').slice(-4)}
                </option>
              ))}
            </select>
          </div>

          {error && <div style={{ fontSize: 13, color: 'var(--asw-slow)' }}>{error}</div>}
          {loading && <Loading label="Comparing meets" />}

          {a && b && !loading && (
            <>
              {/* summary head-to-head */}
              <div className="table-scroll">
                <table className="table">
                  <thead>
                    <tr>
                      <th />
                      <th style={{ whiteSpace: 'normal', minWidth: 120 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Flag code={a.country_code} name={a.country} />
                          <span>{a.name} <span className="asw-num text-muted">({a.year})</span></span>
                        </div>
                      </th>
                      <th style={{ whiteSpace: 'normal', minWidth: 120 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Flag code={b.country_code} name={b.country} />
                          <span>{b.name} <span className="asw-num text-muted">({b.year})</span></span>
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {metricRows.map(([label, va, vb, neutral]) => {
                      const na = Number(va); const nb = Number(vb)
                      const comparable = !neutral && Number.isFinite(na) && Number.isFinite(nb) && na !== nb
                      return (
                        <tr key={label}>
                          <td style={{ fontWeight: 600 }}>{label}</td>
                          <td className="asw-num" style={comparable && na > nb ? { fontWeight: 800, color: 'var(--color-accent-800)' } : {}}>{va}</td>
                          <td className="asw-num" style={comparable && nb > na ? { fontWeight: 800, color: 'var(--color-accent-800)' } : {}}>{vb}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* fastest swims, event by event */}
              {(data.events || []).length > 0 && (
                <div>
                  <div className="kicker" style={{ marginBottom: 4 }}>Fastest swim per event</div>
                  <div className="micro" style={{ marginBottom: 10, textTransform: 'none', letterSpacing: 0, fontSize: 12 }}>
                    Only events swum at both meets · Δ = first meet minus second (negative = faster at {a.name})
                  </div>
                  {genders.map(([g, glabel]) => {
                    const rows = data.events.filter((e) => e.gender === g)
                    if (!rows.length) return null
                    return (
                      <div key={g} style={{ marginBottom: 16 }}>
                        <div className="micro" style={{ marginBottom: 6 }}>{glabel}</div>
                        <div className="table-scroll">
                          <table className="table">
                            <thead>
                              <tr>
                                <th>Event</th>
                                <th className="time">{a.year}</th>
                                <th className="hide-mobile">Swimmer</th>
                                <th className="time">{b.year}</th>
                                <th className="hide-mobile">Swimmer</th>
                                <th className="num">Δ (s)</th>
                              </tr>
                            </thead>
                            <tbody>
                              {rows.map((e) => (
                                <tr key={`${e.event_id}-${e.gender}`}>
                                  <td style={{ fontWeight: 600 }}>{e.event}</td>
                                  <td className="time asw-time" style={e.diff_seconds < 0 ? { color: 'var(--asw-gold)', fontWeight: 700 } : {}}>{e.a_time}</td>
                                  <td className="hide-mobile" style={{ fontSize: 13 }}>
                                    {e.a_swimmer_id && !e.a_is_relay
                                      ? <Link to={`/swimmers/${e.a_swimmer_id}`} style={{ color: 'inherit' }}>{e.a_swimmer}</Link>
                                      : e.a_swimmer}
                                  </td>
                                  <td className="time asw-time" style={e.diff_seconds > 0 ? { color: 'var(--asw-gold)', fontWeight: 700 } : {}}>{e.b_time}</td>
                                  <td className="hide-mobile" style={{ fontSize: 13 }}>
                                    {e.b_swimmer_id && !e.b_is_relay
                                      ? <Link to={`/swimmers/${e.b_swimmer_id}`} style={{ color: 'inherit' }}>{e.b_swimmer}</Link>
                                      : e.b_swimmer}
                                  </td>
                                  <td className="num asw-num" style={{ fontWeight: 700, color: e.diff_seconds === 0 ? 'inherit' : (e.diff_seconds < 0 ? 'var(--asw-fast, #1e7d3c)' : 'var(--asw-slow, #b3261e)') }}>
                                    {e.diff_seconds > 0 ? '+' : ''}{e.diff_seconds.toFixed(2)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────────── Page ─────────────────────────────── */

/* ────────────────────────── Live results panel ──────────────────────────
   Admin cockpit during a live meet: one tile per meet day; upload a PDF or
   scraped link per session through the normal import pipeline (aimed at
   this meet), watch sessions land, then press "Finish meet". */
// ── Live results day-by-day view ──────────────────────────────────────
function LiveDayView({ meetId, meet, events, isNational, isAdmin }) {
  const [selectedDay, setSelectedDay] = useState(null)
  const [selectedEvent, setSelectedEvent] = useState('')
  const [eventClickCount, setEventClickCount] = useState(0)
  const [showProgram, setShowProgram] = useState(false)
  const [program, setProgram] = useState(null)

  // Fetch the meet program
  useEffect(() => {
    getMeetProgram(meetId).then((res) => setProgram(res.data)).catch(() => setProgram(null))
  }, [meetId])

  // Force local timezone by appending T00:00:00 (bare ISO dates are UTC)
  const start = new Date(meet.date + 'T00:00:00')
  const end = new Date((meet.end_date || meet.date) + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const nDays = Math.max(1, Math.round((end - start) / 86400000) + 1)
  const days = Array.from({ length: nDays }, (_, i) => {
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    return { num: i + 1, date: d, isToday: d.toDateString() === today.toDateString(), isPast: d < today }
  })

  // Auto-select today or last past day
  useEffect(() => {
    const todayDay = days.find((d) => d.isToday)
    if (todayDay) setSelectedDay(todayDay.num)
    else {
      const past = days.filter((d) => d.isPast)
      if (past.length) setSelectedDay(past[past.length - 1].num)
      else setSelectedDay(1)
    }
  }, [])

  // Events for the selected day from the program
  const dayProgram = useMemo(() => {
    if (!program?.days || !selectedDay) return null
    const dayData = program.days.find((d) => d.day === selectedDay)
    return dayData?.items || null
  }, [program, selectedDay])

  // Build event list: program events for the day (even without results) + any results events
  const dayEvents = useMemo(() => {
    if (!selectedDay) return events
    if (!dayProgram || dayProgram.length === 0) return events // no program → show all
    // Get event IDs from the program for this day
    const programEventIds = new Set(dayProgram.map((p) => p.event))
    return events.filter((e) => programEventIds.has(e.id))
  }, [selectedDay, events, dayProgram])

  const fmtDay = (d) => d.date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })

  return (
    <div>
      {/* Admin: import + program buttons */}
      {isAdmin && (
        <div className="rule-b" style={{ padding: '12px 32px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', background: 'var(--color-surface)' }}>
          <Link className="btn btn-primary" to={`/import?championship=${meetId}`}>Import results</Link>
          <button className="btn btn-secondary" onClick={() => setShowProgram((v) => !v)}>
            {showProgram ? 'Hide program' : 'Edit program'}
          </button>
          <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>
            Upload bulletin
            <input type="file" accept=".pdf" style={{ display: 'none' }} onChange={async (e) => {
              const f = e.target.files?.[0]
              if (!f) return
              try {
                const fd = new FormData(); fd.append('file', f)
                const res = await uploadBulletin(meetId, fd)
                window.alert(`Bulletin parsed: ${res.data.items_detected} events detected, ${res.data.program_items_created} program items created`)
              } catch { window.alert('Failed to parse bulletin') }
              e.target.value = ''
            }} />
          </label>
          <span className="micro" style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--color-neutral-700)' }}>
            Set which events on which days, then import results
          </span>
        </div>
      )}
      {isAdmin && showProgram && (
        <div className="rule-b pad">
          <MeetProgramEditor champId={meetId} />
        </div>
      )}

      {/* Day selector */}
      <div className="rule-b" style={{ padding: '16px 32px', overflowX: 'auto' }}>
        <div style={{ display: 'flex', gap: 10 }}>
          {days.map((d) => (
            <button
              key={d.num}
              type="button"
              onClick={() => { setSelectedDay(d.num); setSelectedEvent('') }}
              style={{
                cursor: 'pointer', border: 'none', padding: '12px 18px', textAlign: 'center',
                background: selectedDay === d.num
                  ? 'linear-gradient(150deg, var(--color-accent-600), var(--color-accent-900))'
                  : d.isToday ? 'var(--color-accent-100)' : 'var(--color-surface)',
                color: selectedDay === d.num ? '#fff' : 'var(--color-text)',
                fontFamily: 'var(--font-heading)', fontWeight: 800,
                minWidth: 90, flex: 'none',
                borderBottom: d.isToday && selectedDay !== d.num ? '3px solid var(--asw-gold)' : '3px solid transparent',
              }}
            >
              <div style={{ fontSize: 18, lineHeight: 1 }}>Day {d.num}</div>
              <div style={{ fontSize: 11, fontWeight: 600, marginTop: 4, opacity: 0.8 }}>{fmtDay(d)}</div>
              {d.isToday && <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', marginTop: 3, color: selectedDay === d.num ? 'var(--asw-gold)' : 'var(--asw-fast)' }}>TODAY</div>}
            </button>
          ))}
        </div>
      </div>

      {/* Program events for the day — grouped by session */}
      {dayProgram && dayProgram.length > 0 && (() => {
        const sessions = {}
        dayProgram.forEach((p) => {
          const s = p.session || 'OTHER'
          if (!sessions[s]) sessions[s] = []
          sessions[s].push(p)
        })
        const sessionOrder = ['HEATS', 'SEMIS', 'FINALS', 'OTHER']
        const sessionLabel = { HEATS: 'Heats', SEMIS: 'Semi-Finals', FINALS: 'Finals', OTHER: 'Events' }
        return (
          <div className="pad rule-b" style={{ background: 'var(--color-surface)' }}>
            <div className="kicker" style={{ marginBottom: 12 }}>Day {selectedDay} Program</div>
            {sessionOrder.filter((s) => sessions[s]).map((s) => (
              <div key={s} style={{ marginBottom: 14 }}>
                <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 13, color: s === 'FINALS' ? 'var(--color-accent)' : 'var(--color-neutral-700)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {sessionLabel[s]}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {sessions[s].map((p, i) => (
                    <div key={i}
                      onClick={() => { setSelectedEvent(String(p.event)); setEventClickCount((c) => c + 1) }}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', cursor: 'pointer',
                        background: String(selectedEvent) === String(p.event) ? 'var(--color-accent-100)' : 'transparent',
                        borderLeft: String(selectedEvent) === String(p.event) ? '3px solid var(--color-accent)' : '3px solid transparent',
                      }}
                      className="hair-b">
                      <span style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>{p.event_name}</span>
                      <span className="tag tag-neutral" style={{ fontSize: 10 }}>{p.gender === 'M' ? 'Men' : p.gender === 'F' ? 'Women' : 'Mixed'}</span>
                      <span style={{ color: 'var(--color-neutral-500)', fontSize: 12 }}>→</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      })()}

      {/* Results for the selected day */}
      <ResultsTab
        meetId={meetId} events={dayEvents} isNational={isNational} isAdmin={isAdmin}
        hasOpenPodium={!!meet.has_open_podium} hasDoublePodium={!!meet.has_double_podium}
        hostCode={meet.country_detail?.code} bFinalNoMedals={!!meet.b_final_no_medals}
        onDataChanged={() => {}} presetEvent={selectedEvent} presetEventKey={eventClickCount}
      />
    </div>
  )
}

// Admin sees the live panel from the day before the meet until 3 days after
// the last day (detail serializer dates are ISO YYYY-MM-DD).
function isWithinLiveWindow(meet) {
  const start = new Date(meet.date + 'T00:00:00')
  const end = new Date((meet.end_date || meet.date) + 'T00:00:00')
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false
  const now = Date.now()
  return now >= start.getTime() - 86400000 && now <= end.getTime() + 3 * 86400000
}

function LivePanel({ meet, onFinished }) {
  const [data, setData] = useState(null)
  const [finishing, setFinishing] = useState(false)

  const load = () => {
    getMeetLive(meet.id).then((res) => setData(res.data)).catch(() => setData(null))
  }
  useEffect(load, [meet.id])

  const finish = async () => {
    if (!window.confirm('Finish this meet? It becomes a normal championship (medals recomputed, LIVE badge removed).')) return
    setFinishing(true)
    try {
      await finishLiveMeet(meet.id)
      onFinished()
    } catch {
      window.alert('Failed to finish the meet')
    } finally {
      setFinishing(false)
    }
  }

  if (!data) return null
  return (
    <div className="rule-b" style={{ padding: '16px 32px', background: 'var(--color-neutral-50, #fafafa)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <span className="kicker">Live results</span>
        <span className="micro">
          {formatNumber(data.total_results)} results so far — upload each session below; re-uploading a corrected file never duplicates.
        </span>
        <span style={{ flex: 1 }} />
        {meet.is_live && (
          <button className="btn btn-primary" onClick={finish} disabled={finishing}>
            {finishing ? 'Finishing…' : 'Finish meet'}
          </button>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
        {data.days.map((d) => (
          <div key={d.day} style={{
            border: d.is_today ? '2px solid var(--color-accent-800)' : '1px solid var(--color-neutral-200)',
            borderRadius: 8, padding: '12px 14px',
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
              <span style={{ fontWeight: 800, fontFamily: 'var(--font-heading)' }}>Day {d.day}</span>
              <span className="micro">{formatDate(d.date)}</span>
              {d.is_today && <span className="tag tag-dark" style={{ fontSize: 10 }}>TODAY</span>}
            </div>
            {d.sessions.length === 0 ? (
              <div className="micro" style={{ marginBottom: 10 }}>No sessions uploaded yet</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                {d.sessions.map((s) => (
                  <div key={s.id} style={{ fontSize: 12, lineHeight: 1.4 }}>
                    <span style={{ fontWeight: 700 }}>{s.round_summary || (s.source === 'LINK' ? 'Scraped' : 'PDF')}</span>
                    {' — '}+{formatNumber(s.results_added)} results
                    {s.label && (
                      <div className="micro" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={s.label}>
                        {s.label}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            <Link className="btn btn-secondary" style={{ height: 30, fontSize: 12, display: 'inline-flex', alignItems: 'center' }}
              to={`/import?championship=${meet.id}&live_day=${d.day}`}>
              Upload session
            </Link>
          </div>
        ))}
      </div>
    </div>
  )
}

const LIVE_BADGE = (
  <span className="tag" style={{
    verticalAlign: 'middle', background: '#c0392b', color: '#fff',
    display: 'inline-flex', alignItems: 'center', gap: 5,
  }}>
    <span style={{
      width: 7, height: 7, borderRadius: '50%', background: '#fff',
      animation: 'pulse 1.4s ease-in-out infinite',
    }} />
    LIVE
  </span>
)

export default function MeetDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { isAdmin } = useAuth()
  const [meet, setMeet] = useState(null)
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [editing, setEditing] = useState(false)
  const [comparing, setComparing] = useState(false)

  const rawTab = searchParams.get('tab') || 'statistics'
  const tab = ['results', 'program', 'medals', 'records', 'pbs', 'top', 'statistics', 'improved', 'gallery'].includes(rawTab) ? rawTab : 'statistics'
  const setTab = (t) => setSearchParams({ tab: t }, { replace: true })

  const refreshStats = () => {
    getChampionshipStats(id).then((res) => setStats(res.data)).catch(() => {})
  }

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(false)
    Promise.allSettled([getChampionship(id), getChampionshipStats(id)]).then(([meetRes, statsRes]) => {
      if (!alive) return
      const m = val(meetRes)
      if (!m) { setError(true); setLoading(false); return }
      setMeet(m)
      setStats(val(statsRes))
      setLoading(false)
    })
    return () => { alive = false }
  }, [id])

  if (loading) return <Loading label="Loading meet" />
  if (error || !meet) return <Empty label="Meet not found" />

  // National/Other meets show team column + club tally; strictly classification-driven
  const isNational = ['National', 'Other'].includes(meet.classification_name)
  const events = stats?.events || []

  // Live mode: meet is currently happening (today is within date range)
  const meetStart = meet.date ? new Date(meet.date + 'T00:00:00') : null
  const meetEnd = meet.end_date ? new Date(meet.end_date + 'T00:00:00') : meetStart
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const isLiveMode = meet.is_live || (meetStart && meetEnd && today >= meetStart && today <= new Date(meetEnd.getTime() + 86400000))
  // Meet is finished: last day has passed
  const isFinished = meetEnd && today > new Date(meetEnd.getTime() + 86400000)

  return (
    <div>
      {/* header */}
      <div className="pad-lg rule-b">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <MeetLogo photo={meet.meet_photo} name={meet.name} />
          {/* minWidth 0 keeps the title beside the logo on phones; long names
              scale down instead of wrapping to three lines */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 className={`meet-title${(meet.name || '').length > 38 ? ' meet-title-long' : ''}`}
              style={{ margin: 0, letterSpacing: '-0.03em' }}>{meet.name}</h1>
            <div style={{ fontSize: 13, color: 'var(--color-neutral-700)', marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span>{formatDateRange(meet.date, meet.end_date)}</span>
              <span className="tag tag-dark" style={{ fontSize: 10 }}>{meet.pool}</span>
              {meet.country_detail && <><span style={{ color: 'var(--color-neutral-400)' }}>·</span><span>{meet.country_detail.name}</span></>}
              {meet.is_live && LIVE_BADGE}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {isAdmin && (
              <>
                <button type="button" className="btn btn-secondary" onClick={() => setEditing((v) => !v)}>
                  {editing ? 'Close editor' : 'Edit meet'}
                </button>
                <Link className="btn btn-secondary" to={`/import?championship=${id}`}>Import results</Link>
                {meet.classification_name === 'National' && meet.country_detail?.code === 'TUN' && !meet.b_final_no_medals && (
                  <button type="button" className="btn btn-secondary" onClick={async () => {
                    if (!window.confirm('Apply TC rules?\n\n• No medals for Final B (only Final A)\n• Open podium across all categories (fastest 3 overall)\n• Relays unaffected\n\nMedals will be recomputed.')) return
                    try {
                      const res = await applyTC(id)
                      setMeet({ ...meet, has_open_podium: true, b_final_no_medals: true })
                      refreshStats()
                      window.alert(`TC applied: ${res.data.medals_awarded} medals awarded, ${res.data.categories_inferred} categories inferred`)
                    } catch { window.alert('Failed to apply TC rules') }
                  }}>
                    Apply TC rules
                  </button>
                )}
                <button type="button" className={`btn ${meet.is_published ? 'btn-secondary' : 'btn-primary'}`}
                  style={{ fontSize: 12 }}
                  onClick={async () => {
                    try {
                      await updateChampionship(id, { is_published: !meet.is_published })
                      setMeet({ ...meet, is_published: !meet.is_published })
                    } catch { window.alert('Failed to update') }
                  }}>
                  {meet.is_published ? 'Unpublish' : 'Publish'}
                </button>
                <button type="button" className="btn" style={{ borderColor: 'var(--asw-slow)', color: 'var(--asw-slow)' }} onClick={async () => {
                  if (!window.confirm(`Delete "${meet.name}" and all its results, medals, and records? This cannot be undone.`)) return
                  try {
                    await deleteChampionship(id)
                    navigate('/championships')
                  } catch { window.alert('Failed to delete meet') }
                }}>
                  Delete meet
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {comparing && <CompareMeetsModal meet={meet} onClose={() => setComparing(false)} />}

      {isAdmin && (meet.is_live || isWithinLiveWindow(meet)) && (
        <LivePanel meet={meet} onFinished={() => {
          setMeet({ ...meet, is_live: false })
          refreshStats()
        }} />
      )}

      {isAdmin && editing && (
        <MeetEditPanel
          meet={meet}
          onSaved={(m) => { setMeet(m); setEditing(false) }}
          onClose={() => setEditing(false)}
        />
      )}

      {/* Live mode: day-by-day results only */}
      {isLiveMode && !isFinished ? (
        <LiveDayView meetId={id} meet={meet} events={events} isNational={isNational} isAdmin={isAdmin} />
      ) : (
        <>
          {/* Normal mode: full tabs */}
          <div className="rule-b tabbar tabbar-sticky" style={{ padding: '14px 32px', overflowX: 'auto' }}>
            <Seg
              tabs
              options={[
                { value: 'statistics', label: 'Overview' },
                { value: 'results', label: 'Results' },
                { value: 'medals', label: 'Medals' },
                { value: 'records', label: 'Broken Records' },
                { value: 'pbs', label: 'Personal Bests' },
                { value: 'top', label: 'Top Performances' },
                { value: 'improved', label: 'Most Improved' },
                { value: 'program', label: 'Program' },
                { value: 'compare', label: 'Compare' },
              ]}
              value={tab}
              onChange={(v) => { if (v === 'compare') setComparing(true); else setTab(v) }}
            />
          </div>

          {tab === 'results' && (
            <ResultsTab meetId={id} events={events} isNational={isNational} isAdmin={isAdmin} hasOpenPodium={!!meet.has_open_podium}
              hasDoublePodium={!!meet.has_double_podium} hostCode={meet.country_detail?.code}
              bFinalNoMedals={!!meet.b_final_no_medals} onDataChanged={refreshStats} />
          )}
          {tab === 'program' && <ProgramTab meetId={id} isAdmin={isAdmin} resultEvents={events} />}
          {tab === 'medals' && <MedalsTab meetId={id} isNational={isNational} />}
          {tab === 'records' && <RecordsBrokenTab meetId={id} />}
          {tab === 'pbs' && <PersonalBestsTab stats={stats} />}
          {tab === 'top' && <TopPerformancesTab stats={stats} />}
          {tab === 'statistics' && <OverviewTab meetId={id} stats={stats} />}
          {tab === 'improved' && <MostImprovedTab meetId={id} />}
          {tab === 'gallery' && <MeetGallery meetId={id} isAdmin={isAdmin} />}
        </>
      )}
    </div>
  )
}
