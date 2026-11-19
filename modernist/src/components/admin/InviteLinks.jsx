import { useCallback, useEffect, useRef, useState } from 'react'
import { createInvite, deleteInvite, getCountries, getInvites, revokeInvite } from '../../api/core'
import { getAcademies } from '../../api/academies'
import { getTeams } from '../../api/teams'
import { getSwimmers } from '../../api/swimmers'
import { Empty, Loading, Seg, notify } from '../ui'
import { formatDate } from '../../utils'

const KINDS = [
  { value: 'ACADEMY', label: 'Academy' },
  { value: 'CLUB', label: 'Club' },
  { value: 'FEDERATION', label: 'Federation' },
  { value: 'ATHLETE', label: 'Swimmer' },
]
const STATUS = {
  PENDING: ['Waiting for them', 'tag-accent'],
  USED: ['Account created', 'tag-dark'],
  EXPIRED: ['Expired', 'tag-neutral'],
  REVOKED: ['Cancelled', 'tag-neutral'],
}
const asList = (d) => (Array.isArray(d) ? d : d?.results || [])
export const inviteUrl = (token) => `${window.location.origin}/join/${token}`

/**
 * Admin: pick ONE academy / club / federation / swimmer, get a link, send it.
 * Whoever opens the link creates the account that owns that page.
 * Tesler's Law: the system carries the complexity (who the account belongs to);
 * the admin only chooses the entity and copies one link.
 */
export default function InviteLinks() {
  const [kind, setKind] = useState('ACADEMY')
  const [countries, setCountries] = useState([])
  const [academies, setAcademies] = useState([])
  const [teams, setTeams] = useState([])
  const [country, setCountry] = useState('')      // narrows the academy / club list
  const [target, setTarget] = useState('')        // id of the chosen entity
  const [swimQuery, setSwimQuery] = useState('')
  const [swimHits, setSwimHits] = useState(null)
  const [swimPick, setSwimPick] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [made, setMade] = useState(null)          // the link just created
  const [copied, setCopied] = useState('')
  const [rows, setRows] = useState(null)
  const madeRef = useRef(null)

  const reload = useCallback(() => {
    getInvites().then((res) => setRows(asList(res.data))).catch(() => setRows([]))
  }, [])

  useEffect(() => {
    getCountries().then((res) => setCountries(asList(res.data).filter((c) => c.region === 'ARAB' || c.region === 'GCC'))).catch(() => {})
    getAcademies().then((res) => setAcademies(asList(res.data))).catch(() => {})
    getTeams({ ordering: 'name' }).then((res) => setTeams(asList(res.data))).catch(() => {})
    reload()
  }, [reload])

  // swimmer search (Doherty Threshold: results while typing)
  useEffect(() => {
    const q = swimQuery.trim()
    if (kind !== 'ATHLETE' || swimPick || q.length < 2) { setSwimHits(null); return undefined }
    let alive = true
    const t = setTimeout(() => {
      getSwimmers({ search: q, page_size: 8 })
        .then((res) => { if (alive) setSwimHits(asList(res.data).filter((s) => !s.is_relay_team)) })
        .catch(() => { if (alive) setSwimHits([]) })
    }, 250)
    return () => { alive = false; clearTimeout(t) }
  }, [swimQuery, kind, swimPick])

  const switchKind = (k) => { setKind(k); setTarget(''); setSwimPick(null); setSwimQuery(''); setError(''); setMade(null) }
  const chosen = kind === 'ATHLETE' ? swimPick?.id : target
  // "Academy" lists both kinds of academy: directory entries, and academies that
  // run on the club portal (roster, board, coaches). The second kind is a club
  // account underneath, so its option value carries that.
  const academyOptions = [
    ...teams.filter((t) => t.is_academy).map((t) => ({ value: `CLUB:${t.id}`, name: t.name, country: t.country })),
    ...academies.map((a) => ({ value: `ACADEMY:${a.id}`, name: a.name, country: a.country })),
  ].sort((a, b) => a.name.localeCompare(b.name))
  const clubOptions = teams.filter((t) => !t.is_academy && !t.is_national_team)
    .map((t) => ({ value: `CLUB:${t.id}`, name: t.name, country: t.country }))

  const copy = async (token) => {
    try {
      await navigator.clipboard.writeText(inviteUrl(token))
      setCopied(token)
      notify('Link copied', 'success')
    } catch {
      notify('Could not copy. Select the link and copy it by hand.', 'error')
    }
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!chosen) return
    setBusy(true); setError(''); setMade(null); setCopied('')
    try {
      // academy / club options carry their real account kind ("CLUB:12")
      const [realKind, realId] = String(chosen).includes(':') ? String(chosen).split(':') : [kind, chosen]
      const res = await createInvite(realKind, realId)
      setMade(res.data)
      reload()
      setTimeout(() => madeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 50)
    } catch (err) {
      setError(err?.response?.data?.error || 'Could not create the link. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const cancel = async (row) => {
    try {
      await revokeInvite(row.id)
      if (made?.id === row.id) setMade(null)
      reload()
      notify('Link cancelled', 'success')
    } catch (err) {
      notify(err?.response?.data?.error || 'Could not cancel the link', 'error')
    }
  }

  // Deleting is final, so it is confirmed in plain words first — and it says
  // exactly what goes (the link, the account) and what stays (their work).
  const remove = async (row) => {
    const who = row.target.name
    const text = row.status === 'USED'
      ? `Delete this link and the account ${row.used_by || ''} made from it?\n\n`
        + `${who} will no longer be able to sign in. Everything they added to their page stays as they saved it.`
      : `Delete this link for ${who}?\n\nThe sign-up page behind it will stop working.`
    if (!window.confirm(text)) return
    try {
      const res = await deleteInvite(row.id)
      if (made?.id === row.id) setMade(null)
      reload()
      notify(res.data?.account_deleted ? `Link and account ${res.data.account_deleted} deleted` : 'Link deleted', 'success')
    } catch (err) {
      notify(err?.response?.data?.error || 'Could not delete the link', 'error')
    }
  }

  const inCountry = (list) => (country ? list.filter((x) => String(x.country) === String(country)) : list)

  return (
    <div className="invites">
      <form onSubmit={submit} className="invites-form">
        <div className="field">
          <span className="invites-label">1 · Who is the link for?</span>
          <Seg options={KINDS} value={kind} onChange={switchKind} />
        </div>

        {(kind === 'ACADEMY' || kind === 'CLUB') && (
          <div className="invites-pick">
            <div className="field">
              <label htmlFor="inv-country">Country</label>
              <select id="inv-country" className="select" value={country} onChange={(e) => { setCountry(e.target.value); setTarget('') }}>
                <option value="">All countries</option>
                {countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="inv-target">{kind === 'ACADEMY' ? 'Academy' : 'Club'}</label>
              <select id="inv-target" className="select" value={target} onChange={(e) => setTarget(e.target.value)} required>
                <option value="">Select {kind === 'ACADEMY' ? 'academy' : 'club'}…</option>
                {inCountry(kind === 'ACADEMY' ? academyOptions : clubOptions).map((x) => <option key={x.value} value={x.value}>{x.name}</option>)}
              </select>
            </div>
          </div>
        )}

        {kind === 'FEDERATION' && (
          <div className="field" style={{ maxWidth: 320 }}>
            <label htmlFor="inv-fed">Federation</label>
            <select id="inv-fed" className="select" value={target} onChange={(e) => setTarget(e.target.value)} required>
              <option value="">Select country…</option>
              {countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}

        {kind === 'ATHLETE' && (
          <div className="field" style={{ maxWidth: 420, position: 'relative' }}>
            <label htmlFor="inv-swimmer">Swimmer</label>
            {swimPick ? (
              <div className="invites-picked">
                <strong>{swimPick.name}</strong>
                <span className="text-muted">{swimPick.nationality_detail?.name || ''}{swimPick.birth_year ? ` · ${swimPick.birth_year}` : ''}</span>
                <button type="button" className="btn btn-ghost" onClick={() => { setSwimPick(null); setSwimQuery('') }}>Change</button>
              </div>
            ) : (
              <>
                <input id="inv-swimmer" className="input" type="search" autoComplete="off" placeholder="Type a name"
                  value={swimQuery} onChange={(e) => setSwimQuery(e.target.value)} />
                {swimHits && (
                  <div className="invites-hits" role="listbox" aria-label="Swimmers">
                    {swimHits.length === 0 && <div className="invites-hit-none">No swimmer found. Check the spelling.</div>}
                    {swimHits.map((s) => (
                      <button key={s.id} type="button" role="option" aria-selected="false" onClick={() => { setSwimPick(s); setSwimHits(null) }}>
                        <strong>{s.name}</strong>
                        <span className="text-muted">{s.nationality_detail?.name || ''}{s.birth_year ? ` · ${s.birth_year}` : ''}{s.club ? ` · ${s.club}` : ''}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {error && <div role="alert" className="invites-error">{error}</div>}
        <div>
          <button type="submit" className="btn btn-primary" disabled={busy || !chosen} style={{ height: 44 }}>
            {busy ? 'Creating link…' : '2 · Create link'}
          </button>
        </div>
      </form>

      {made && (
        <div ref={madeRef} className="invites-made" role="status">
          <div className="kicker" style={{ marginBottom: 6 }}>3 · Send this link to {made.target.name}</div>
          <div className="invites-linkrow">
            <input className="input" readOnly value={inviteUrl(made.token)} onFocus={(e) => e.target.select()} aria-label="Invite link" />
            <button type="button" className="btn btn-primary" onClick={() => copy(made.token)}>{copied === made.token ? 'Copied ✓' : 'Copy link'}</button>
          </div>
          <div className="invites-note">
            They open it, choose an email and password, and land on their own page ready to fill in.
            The link works once and expires on {formatDate(made.expires_at)}. Send it only to {made.target.name}.
          </div>
        </div>
      )}

      <div className="invites-list">
        <div className="kicker" style={{ marginBottom: 8 }}>Links you have made</div>
        {rows === null ? <Loading label="Loading links" /> : rows.length === 0 ? (
          <Empty label="No links yet" hint="Create one above and send it to the academy, club, federation or swimmer." />
        ) : (
          <div className="table-scroll">
            <table className="table" style={{ fontSize: 13 }}>
              <thead><tr><th>For</th><th>Type</th><th>Status</th><th className="hide-mobile">Made</th><th aria-label="Actions" /></tr></thead>
              <tbody>
                {rows.map((r) => {
                  const [label, cls] = STATUS[r.status] || [r.status, 'tag-neutral']
                  return (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 600 }}>{r.target.name}</td>
                      <td>{r.kind_label}</td>
                      <td>
                        <span className={`tag ${cls}`}>{label}</span>
                        {r.status === 'USED' && r.used_by && <span className="text-muted" style={{ marginLeft: 8 }}>{r.used_by}</span>}
                      </td>
                      <td className="text-muted hide-mobile" style={{ whiteSpace: 'nowrap' }}>{formatDate(r.created_at)}</td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {r.status === 'PENDING' && (
                          <>
                            <button type="button" className="btn btn-ghost" onClick={() => copy(r.token)}>{copied === r.token ? 'Copied ✓' : 'Copy link'}</button>
                            <button type="button" className="btn btn-ghost" onClick={() => cancel(r)}>Cancel</button>
                          </>
                        )}
                        <button type="button" className="btn btn-ghost" style={{ color: 'var(--asw-slow)' }} onClick={() => remove(r)}
                          aria-label={`Delete the link for ${r.target.name}`}>
                          {r.status === 'USED' ? 'Delete link and account' : 'Delete'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
