import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Check, Share2, Trophy } from 'lucide-react'
import { getVote, castVote } from '../api/fame'
import { Loading, Empty, notify } from '../components/ui'
import Flag from '../components/Flag'
import Pic from '../components/Pic'
import { formatDate, nameInitials } from '../utils'

// One vote per person: the browser keeps a random id (storage, with a cookie
// as a second copy); the server allows one vote per id and caps each network.
const KEY = 'asw_voter'
function voterId() {
  let id = null
  try { id = localStorage.getItem(KEY) } catch { /* private mode */ }
  if (!id) id = document.cookie.split('; ').find((c) => c.startsWith(`${KEY}=`))?.split('=')[1] || null
  if (!id) {
    id = (crypto.randomUUID ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join(''))
  }
  try { localStorage.setItem(KEY, id) } catch { /* private mode */ }
  document.cookie = `${KEY}=${id}; max-age=31536000; path=/; SameSite=Lax`
  return id
}

export default function Vote() {
  const { slug } = useParams()
  const [poll, setPoll] = useState(null)
  const [missing, setMissing] = useState(false)
  const [choice, setChoice] = useState(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    getVote(slug, voterId())
      .then((r) => alive && setPoll(r.data))
      .catch(() => alive && setMissing(true))
    return () => { alive = false }
  }, [slug])

  useEffect(() => { if (poll) document.title = `${poll.title} ${poll.year} — ArabSwim Awards` }, [poll])

  if (missing) return <Empty label="This vote does not exist" hint="Check the link you were sent." />
  if (!poll) return <Loading label="Loading the vote" />

  const voted = poll.voted_for != null
  const canVote = poll.open && !voted
  const picked = poll.nominees.find((n) => n.id === choice)
  const winner = poll.nominees.find((n) => n.id === poll.winner)

  const submit = async () => {
    if (!picked || sending) return
    setSending(true); setError('')
    try {
      const r = await castVote(slug, picked.id, voterId())
      setPoll(r.data)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e) {
      const d = e.response?.data
      if (d?.poll) setPoll(d.poll)
      setError(e.response?.status === 429 && !d?.error ? 'Too many tries. Wait a minute and try again.' : (d?.error || 'The vote was not saved. Check your connection and try again.'))
    } finally {
      setSending(false)
    }
  }

  const share = async () => {
    const url = window.location.href
    try {
      if (navigator.share) await navigator.share({ title: `${poll.title} — ArabSwim Awards ${poll.year}`, url })
      else { await navigator.clipboard.writeText(url); notify('Link copied', 'success') }
    } catch { /* closed the share sheet */ }
  }

  let status
  if (winner) status = 'The winner has been announced'
  else if (voted) status = poll.open ? 'Your vote is in' : 'Voting is closed — your vote was counted'
  else if (!poll.open) status = 'Voting is closed'
  else status = poll.closes_at ? `Voting closes ${formatDate(poll.closes_at)}` : 'Voting is open'

  return (
    <div className="vote">
      <header className="vote-head">
        <div className="kicker">ArabSwim Awards {poll.year}</div>
        <h1>{poll.title}</h1>
        {poll.description && <p className="vote-desc">{poll.description}</p>}
        <div className={`vote-status${voted || winner ? ' is-done' : ''}`} role="status">
          {(voted || winner) && <Check size={16} aria-hidden="true" />}
          <span>{status}</span>
        </div>
        {/* Hick's Law: one instruction, said once */}
        {canVote && <p className="vote-how">Choose one nominee, then press Vote. You can vote once.</p>}
      </header>

      <div className="vote-grid" role={canVote ? 'radiogroup' : undefined} aria-label="Nominees">
        {poll.nominees.map((n) => {
          const mine = poll.voted_for === n.id
          const won = poll.winner === n.id
          const on = canVote ? choice === n.id : mine
          const body = (
            <>
              <span className="vote-photo">
                {n.photo_url
                  ? <Pic kind="person" w={320} src={n.photo_url} alt="" />
                  : <span className="vote-initials" aria-hidden="true">{nameInitials(n.name)}</span>}
                {won && <span className="vote-badge is-winner"><Trophy size={13} aria-hidden="true" /> Winner</span>}
                {!won && mine && <span className="vote-badge"><Check size={13} aria-hidden="true" /> Your vote</span>}
              </span>
              <span className="vote-name">{n.name}</span>
              {n.country_detail && (
                <span className="vote-country"><Flag code={n.country_detail.code} name={n.country_detail.name} /> {n.country_detail.name}</span>
              )}
              {n.note && <span className="vote-note">{n.note}</span>}
              {poll.results && (
                <span className="vote-result">
                  <span className="vote-bar"><span style={{ width: `${n.percent}%` }} /></span>
                  <span className="asw-num">{n.percent}% · {n.votes} {n.votes === 1 ? 'vote' : 'votes'}</span>
                </span>
              )}
            </>
          )
          return canVote ? (
            <button key={n.id} type="button" role="radio" aria-checked={on}
              className={`vote-card${on ? ' is-on' : ''}`} onClick={() => setChoice(n.id)}>
              {body}
            </button>
          ) : (
            <div key={n.id} className={`vote-card is-static${on ? ' is-on' : ''}${won ? ' is-winner' : ''}`}>{body}</div>
          )
        })}
      </div>

      {error && <div className="vote-error" role="alert">{error}</div>}

      {/* Fitts's Law: the one action stays within thumb reach on phone */}
      <div className="vote-bar-bottom">
        {canVote ? (
          <button type="button" className="btn btn-primary vote-submit" disabled={!picked || sending} onClick={submit}>
            {sending ? 'Sending your vote…' : picked ? `Vote for ${picked.name}` : 'Choose a nominee'}
          </button>
        ) : (
          <button type="button" className="btn btn-primary vote-submit" onClick={share}>
            <Share2 size={16} aria-hidden="true" /> Share this vote
          </button>
        )}
        {poll.results && poll.total_votes != null && (
          <div className="vote-total asw-num">{poll.total_votes} {poll.total_votes === 1 ? 'vote' : 'votes'} in total</div>
        )}
      </div>
    </div>
  )
}
