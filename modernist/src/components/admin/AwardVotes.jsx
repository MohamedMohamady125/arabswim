import { useEffect, useState } from 'react'
import { Copy, ExternalLink, Plus, Trash2, Trophy } from 'lucide-react'
import {
  getPolls, createPoll, updatePoll, deletePoll, announcePoll,
  createNominee, deleteNominee,
} from '../../api/fame'
import { searchSwimmers } from '../../api/swimmers'
import { getCountries } from '../../api/core'
import { CropUpload } from '../ImageCropper'
import { notify, Modal } from '../ui'
import Flag from '../Flag'
import Pic from '../Pic'

const STATUS = { DRAFT: 'Draft — not public yet', OPEN: 'Open — people can vote', CLOSED: 'Closed' }
const linkOf = (p) => `${window.location.origin}/vote/${p.slug}`
const toLocal = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
const errText = (e, fallback) => e.response?.data?.error || Object.values(e.response?.data || {}).flat().join(' ') || fallback

/** Admin: the Arabswim Awards votes — create one, add nominees, share its link, announce the winner. */
export default function AwardVotes({ onAnnounced }) {
  const [polls, setPolls] = useState(null)
  const [form, setForm] = useState({ title: '', year: String(new Date().getFullYear()) })
  const [saving, setSaving] = useState(false)
  const [adding, setAdding] = useState(null) // poll getting a nominee

  const load = () => getPolls().then((r) => setPolls(r.data)).catch(() => setPolls([]))
  useEffect(() => { load() }, [])

  const patch = async (p, data, done) => {
    try { await updatePoll(p.id, data); await load(); if (done) notify(done, 'success') }
    catch (e) { notify(errText(e, 'Could not save the change'), 'error') }
  }

  const add = async (e) => {
    e.preventDefault()
    if (!form.title.trim() || saving) return
    setSaving(true)
    try {
      await createPoll({ title: form.title.trim(), year: form.year })
      setForm((f) => ({ ...f, title: '' }))
      await load()
      notify('Vote created. Add the nominees, then open it.', 'success')
    } catch (e2) { notify(errText(e2, 'Could not create the vote'), 'error') }
    finally { setSaving(false) }
  }

  const copy = async (p) => {
    try { await navigator.clipboard.writeText(linkOf(p)); notify('Link copied', 'success') }
    catch { notify('Could not copy. Select the link and copy it by hand.', 'error') }
  }

  const announce = async (p) => {
    const top = p.nominees[0]
    if (!top || !p.total_votes) { notify('Nobody has voted yet', 'error'); return }
    if (!window.confirm(`Announce ${top.name} as the winner of "${p.title}"?\n\nThe vote closes and ${top.name} is added to the Arabswim Awards.`)) return
    try { await announcePoll(p.id); await load(); onAnnounced?.(); notify(`${top.name} is in the Arabswim Awards`, 'success') }
    catch (e) { notify(errText(e, 'Could not announce the winner'), 'error') }
  }

  const remove = async (p) => {
    if (!window.confirm(`Delete the vote "${p.title}" and its ${p.total_votes} votes? This cannot be undone.`)) return
    try { await deletePoll(p.id); await load() } catch { notify('Could not delete the vote', 'error') }
  }

  const removeNominee = async (p, n) => {
    if (!window.confirm(`Remove ${n.name}${n.votes ? ` and their ${n.votes} votes` : ''}?`)) return
    try { await deleteNominee(n.id); await load() } catch { notify('Could not remove the nominee', 'error') }
  }

  return (
    <section className="rule-b awv">
      <div className="kicker">Voting</div>
      <form onSubmit={add} className="awv-new">
        <input className="input" aria-label="Award name" placeholder="New vote — award name, e.g. Male Swimmer of the Year"
          value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} style={{ flex: '3 1 260px', minWidth: 0 }} />
        <input className="input" type="number" inputMode="numeric" aria-label="Year" placeholder="Year"
          value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} style={{ flex: '0 1 110px', minWidth: 0 }} />
        <button className="btn btn-primary" type="submit" disabled={!form.title.trim() || !form.year || saving}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Plus size={14} /> Create vote</button>
      </form>

      {polls === null ? null : polls.length === 0 ? (
        <p className="text-muted" style={{ fontSize: 13, margin: '10px 0 0' }}>No votes yet. Create one, add its nominees, open it, then share its link.</p>
      ) : polls.map((p) => (
        <article key={p.id} className="awv-poll">
          <header className="awv-poll-head">
            <h3>{p.title} <span className="text-muted asw-num">{p.year}</span></h3>
            <span className={`tag${p.status === 'OPEN' ? ' tag-dark' : ''}`}>{p.is_open || p.status !== 'OPEN' ? STATUS[p.status] : 'Closing time passed'}</span>
          </header>

          {/* Goal-Gradient: the three steps in the order they are done */}
          <div className="awv-row">
            <input className="input awv-link" readOnly aria-label="Vote link" value={linkOf(p)} onFocus={(e) => e.target.select()} />
            <button type="button" className="btn btn-secondary awv-ic" onClick={() => copy(p)}><Copy size={14} /> Copy link</button>
            <a className="btn btn-secondary awv-ic" href={linkOf(p)} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Open</a>
          </div>
          {p.status === 'DRAFT' && <p className="awv-hint">The link works once the vote is open.</p>}

          <div className="awv-row">
            {p.status !== 'OPEN'
              ? <button type="button" className="btn btn-primary" disabled={p.nominees.length < 2} onClick={() => patch(p, { status: 'OPEN' }, 'Voting is open')}>{p.status === 'CLOSED' ? 'Reopen voting' : 'Open voting'}</button>
              : <button type="button" className="btn btn-secondary" onClick={() => patch(p, { status: 'CLOSED' }, 'Voting is closed')}>Close voting</button>}
            <label className="awv-field">
              <span>Closes on its own at</span>
              <input className="input" type="datetime-local" defaultValue={toLocal(p.closes_at)}
                onBlur={(e) => { const v = e.target.value ? new Date(e.target.value).toISOString() : null; if (v !== p.closes_at) patch(p, { closes_at: v }) }} />
            </label>
            <label className="awv-check">
              <input type="checkbox" checked={p.show_results} onChange={(e) => patch(p, { show_results: e.target.checked })} />
              <span>Voters see the standings after they vote</span>
            </label>
          </div>
          {p.status !== 'OPEN' && p.nominees.length < 2 && <p className="awv-hint">Add at least two nominees to open the vote.</p>}

          <div className="awv-count asw-num">
            {p.total_votes} {p.total_votes === 1 ? 'vote' : 'votes'} from {p.networks} {p.networks === 1 ? 'network' : 'networks'}
          </div>
          <ul className="awv-noms">
            {p.nominees.map((n) => (
              <li key={n.id} className={p.winner === n.id ? 'is-winner' : undefined}>
                <span className="awv-thumb">{n.photo_url && <Pic kind="person" w={80} src={n.photo_url} alt="" />}</span>
                <span className="awv-nom-main">
                  <span className="awv-nom-name">
                    <Flag code={n.country_detail?.code} name={n.country_detail?.name} /> {n.name}
                    {p.winner === n.id && <span className="tag tag-dark" style={{ marginLeft: 8 }}>Winner</span>}
                  </span>
                  <span className="vote-bar"><span style={{ width: `${n.percent}%` }} /></span>
                </span>
                <span className="asw-num awv-nom-votes">{n.votes} · {n.percent}%</span>
                <button type="button" className="btn btn-ghost" aria-label={`Remove ${n.name}`} onClick={() => removeNominee(p, n)}><Trash2 size={13} /></button>
              </li>
            ))}
          </ul>

          <div className="awv-row">
            <button type="button" className="btn btn-secondary awv-ic" onClick={() => setAdding(p)}><Plus size={14} /> Add nominee</button>
            <button type="button" className="btn btn-secondary awv-ic" disabled={!p.total_votes} onClick={() => announce(p)}><Trophy size={14} /> Announce winner</button>
            <span style={{ flex: 1 }} />
            <button type="button" className="btn btn-ghost awv-ic" onClick={() => remove(p)}><Trash2 size={13} /> Delete vote</button>
          </div>
        </article>
      ))}

      {adding && <NomineeModal poll={adding} onClose={() => setAdding(null)} onSaved={() => { setAdding(null); load() }} />}
    </section>
  )
}

function NomineeModal({ poll, onClose, onSaved }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [swimmer, setSwimmer] = useState(null)
  const [countries, setCountries] = useState([])
  const [country, setCountry] = useState('')
  const [note, setNote] = useState('')
  const [photo, setPhoto] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getCountries().then((r) => setCountries(Array.isArray(r.data) ? r.data : r.data?.results || [])).catch(() => {})
  }, [])
  useEffect(() => {
    if (!query.trim() || swimmer) { setResults([]); return }
    const t = setTimeout(() => {
      searchSwimmers(query.trim()).then((r) => setResults(Array.isArray(r.data) ? r.data : [])).catch(() => setResults([]))
    }, 300)
    return () => clearTimeout(t)
  }, [query, swimmer])

  const name = swimmer ? swimmer.name : query.trim()
  const save = async (e) => {
    e.preventDefault()
    if (!name || saving) return
    if (!swimmer && !country) { setError('Choose the country.'); return }
    setSaving(true); setError('')
    try {
      const fd = new FormData()
      fd.append('poll', poll.id)
      fd.append('name', name)
      if (swimmer) fd.append('swimmer', swimmer.id)
      fd.append('country', swimmer ? swimmer.nationality : country)
      if (note.trim()) fd.append('note', note.trim())
      if (photo) fd.append('photo', photo)
      await createNominee(fd)
      onSaved()
    } catch (e2) { setError(errText(e2, 'Could not add the nominee.')) }
    finally { setSaving(false) }
  }

  return (
    <Modal title={`Add a nominee — ${poll.title}`} onClose={onClose} width={480}>
      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label className="awv-field" style={{ position: 'relative' }}>
          <span>Name — search a swimmer, or type any name</span>
          <input className="input" autoFocus value={swimmer ? swimmer.name : query}
            onChange={(e) => { setSwimmer(null); setQuery(e.target.value) }} />
          {results.length > 0 && !swimmer && (
            <div className="awv-results">
              {results.map((s) => (
                <button type="button" key={s.id} onClick={() => { setSwimmer(s); setResults([]) }}>
                  <Flag code={s.nationality_detail?.code} name={s.nationality_detail?.name} /> {s.name}
                </button>
              ))}
            </div>
          )}
        </label>
        {swimmer ? (
          <p className="awv-hint" style={{ margin: 0 }}>Linked to the swimmer's profile: their country and photo are used. Upload a photo below only to use another one.</p>
        ) : (
          <label className="awv-field">
            <span>Country</span>
            <select className="select" value={country} onChange={(e) => setCountry(e.target.value)}>
              <option value="">Select country…</option>
              {countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        )}
        <label className="awv-field">
          <span>Why they are nominated (optional, one line)</span>
          <input className="input" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <div className="awv-field">
          <span>Photo{swimmer ? ' (optional)' : ''}</span>
          <CropUpload kind="person" onChange={setPhoto} />
        </div>
        {error && <div role="alert" style={{ fontSize: 13, color: 'var(--asw-slow)' }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={!name || saving}>{saving ? 'Adding…' : 'Add nominee'}</button>
        </div>
      </form>
    </Modal>
  )
}
