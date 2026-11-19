import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getCountries } from '../../api/core'
import { getTeams, updateTeam } from '../../api/teams'
import { Empty, Loading, notify } from '../ui'

const asList = (d) => (Array.isArray(d) ? d : d?.results || [])

/**
 * Admin: turn a club into an academy, or an academy back into a club.
 * An academy keeps everything the club had (swimmers, results, board, coaches,
 * its account); what changes is how it is labelled and where it is listed:
 * the Academies page, "Academy" on its own page, "My academy" for its owner.
 * Occam's Razor: one picker and one button; the current academies are listed
 * underneath with the way back.
 */
export default function ClubKind({ onChanged }) {
  const [teams, setTeams] = useState(null)
  const [countries, setCountries] = useState([])
  const [country, setCountry] = useState('')
  const [teamId, setTeamId] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    getTeams({ ordering: 'name' }).then((res) => setTeams(asList(res.data))).catch(() => setTeams([]))
  }, [])
  useEffect(() => {
    load()
    getCountries().then((res) => setCountries(asList(res.data).filter((c) => c.region === 'ARAB' || c.region === 'GCC'))).catch(() => {})
  }, [load])

  const change = async (team, toAcademy) => {
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('is_academy', toAcademy ? 'true' : 'false')
      await updateTeam(team.id, fd)
      notify(toAcademy ? `${team.name} is now an academy` : `${team.name} is a club again`, 'success')
      setTeamId('')
      load()
      onChanged?.()
    } catch (err) {
      notify(err?.response?.data?.error || 'Could not save the change. Try again.', 'error')
    } finally {
      setBusy(false)
    }
  }

  if (teams === null) return <Loading label="Loading clubs" />

  const clubs = teams.filter((t) => !t.is_academy && !t.is_national_team)
    .filter((t) => !country || String(t.country) === String(country))
  const academies = teams.filter((t) => t.is_academy)
  const picked = teams.find((t) => String(t.id) === String(teamId))

  return (
    <div className="invites">
      <div className="invites-form">
        <div className="invites-pick">
          <div className="field">
            <label htmlFor="kind-country">Country</label>
            <select id="kind-country" className="select" value={country} onChange={(e) => { setCountry(e.target.value); setTeamId('') }}>
              <option value="">All countries</option>
              {countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="kind-club">Club</label>
            <select id="kind-club" className="select" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
              <option value="">Select club…</option>
              {clubs.map((t) => <option key={t.id} value={t.id}>{t.name}{t.swimmers_count ? ` · ${t.swimmers_count} swimmers` : ''}</option>)}
            </select>
          </div>
        </div>
        <div>
          <button type="button" className="btn btn-primary" style={{ height: 44 }} disabled={busy || !picked} onClick={() => change(picked, true)}>
            {busy ? 'Saving…' : picked ? `Make ${picked.name} an academy` : 'Make it an academy'}
          </button>
        </div>
        <div className="invites-note" style={{ marginTop: 0, maxWidth: 620 }}>
          Nothing is lost: its swimmers, results, board, coaches and account stay as they are. It moves to the
          Academies page, its page says "Academy", and its owner sees "My academy".
        </div>
      </div>

      <div className="invites-list">
        <div className="kicker" style={{ marginBottom: 8 }}>Academies now · {academies.length}</div>
        {academies.length === 0 ? (
          <Empty label="No academies yet" hint="Pick a club above to turn it into an academy." />
        ) : (
          <div className="table-scroll">
            <table className="table" style={{ fontSize: 13 }}>
              <thead><tr><th>Academy</th><th className="hide-mobile">Country</th><th className="num">Swimmers</th><th aria-label="Actions" /></tr></thead>
              <tbody>
                {academies.map((t) => (
                  <tr key={t.id}>
                    <td style={{ fontWeight: 600 }}><Link to={`/teams/${t.id}`} style={{ color: 'inherit' }}>{t.name}</Link></td>
                    <td className="text-muted hide-mobile">{t.country_detail?.name || '—'}</td>
                    <td className="num asw-num">{t.swimmers_count ?? '—'}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => change(t, false)}>Make it a club again</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
