import { useEffect, useRef, useState } from 'react'
import { getNameMatchCountries, getNameMatchList, applyNameMatch, createNameMatchProfile } from '../api/swimmers'
import { getCountries } from '../api/core'
import { PageHead, SectHead, Loading, Empty, Pager, Done, BackLink } from '../components/ui'
import { CropUpload } from '../components/ImageCropper'

function NewProfileForm({ sw, countryId, allCountries, onSubmit, busy }) {
  const [name, setName] = useState('')
  const [sex, setSex] = useState(sw.sex || '')
  const [dob, setDob] = useState(sw.date_of_birth || '')
  const [yob, setYob] = useState(sw.birth_year || '')
  const [nationality, setNationality] = useState(String(countryId))
  const [club, setClub] = useState(sw.club || '')
  const [photo, setPhoto] = useState(null)

  const submit = () => {
    const fd = new FormData()
    fd.append('arabic_id', sw.id)
    fd.append('new_name', name.trim())
    if (sex) fd.append('sex', sex)
    if (dob) fd.append('date_of_birth', dob)
    if (yob) fd.append('birth_year', yob)
    if (nationality) fd.append('nationality', nationality)
    fd.append('club', club.trim())
    if (photo) fd.append('photo', photo)
    onSubmit(fd)
  }

  const fld = { fontSize: 13 }
  const label = { fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', opacity: 0.7, marginBottom: 3, display: 'block' }

  return (
    <div style={{ marginTop: 10, padding: 12, border: '1px solid var(--color-divider)', background: 'var(--color-neutral-100)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={label} htmlFor={`nm-name-${sw.id}`}>English name *</label>
          <input id={`nm-name-${sw.id}`} type="text" autoComplete="off" value={name} onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Mohamed Ali" className="input" style={fld} />
        </div>
        <div>
          <label style={label} htmlFor={`nm-sex-${sw.id}`}>Gender</label>
          <select id={`nm-sex-${sw.id}`} className="select" value={sex} onChange={(e) => setSex(e.target.value)} style={fld}>
            <option value="">—</option>
            <option value="M">Male</option>
            <option value="F">Female</option>
          </select>
        </div>
        <div>
          <label style={label} htmlFor={`nm-dob-${sw.id}`}>Date of birth</label>
          <input id={`nm-dob-${sw.id}`} type="date" value={dob} onChange={(e) => setDob(e.target.value)} className="input" style={fld} />
        </div>
        <div>
          <label style={label} htmlFor={`nm-yob-${sw.id}`}>Year of birth</label>
          <input id={`nm-yob-${sw.id}`} inputMode="numeric" type="number" value={yob} onChange={(e) => setYob(e.target.value)}
            placeholder="e.g. 2005" className="input" style={fld} />
        </div>
        <div>
          <label style={label} htmlFor={`nm-nat-${sw.id}`}>Nationality</label>
          <select id={`nm-nat-${sw.id}`} className="select" value={nationality} onChange={(e) => setNationality(e.target.value)} style={fld}>
            {allCountries.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={label} htmlFor={`nm-club-${sw.id}`}>Club</label>
          <input id={`nm-club-${sw.id}`} autoComplete="off" type="text" value={club} onChange={(e) => setClub(e.target.value)} className="input" style={fld} />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <span style={label}>Photo (drag to position / zoom to resize)</span>
          <CropUpload aspect={1} onChange={(f) => setPhoto(f)} />
          {photo && <span className="micro" style={{ color: 'var(--asw-fast)' }}>✓ photo ready</span>}
        </div>
      </div>
      <button type="button" className="btn btn-primary" disabled={busy || name.trim().length < 2} onClick={submit}
        style={{ height: 36, padding: '0 16px', marginTop: 10, opacity: (busy || name.trim().length < 2) ? 0.5 : 1 }}>
        {busy ? 'Saving…' : 'Create profile'}
      </button>
    </div>
  )
}

function Row({ sw, countryId, allCountries, onDone }) {
  const [sel, setSel] = useState('')          // chosen english candidate id, or 'NEW'
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(null)      // message after apply
  const [err, setErr] = useState('')          // shown next to the row, in plain words

  const merge = async () => {
    setBusy(true); setErr('')
    try {
      const res = await applyNameMatch({ arabic_id: sw.id, english_id: Number(sel) })
      setDone(res.data?.message || 'Done')
      onDone?.(sw.id)
    } catch (err) {
      setErr(err.response?.data?.error || 'This could not be saved. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  const createProfile = async (formData) => {
    setBusy(true); setErr('')
    try {
      const res = await createNameMatchProfile(formData)
      setDone(res.data?.message || 'Done')
      onDone?.(sw.id)
    } catch (err) {
      setErr(err.response?.data?.error || 'This could not be saved. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className="hair-b" style={{ padding: '12px 0', fontSize: 13 }}>
        <span style={{ fontWeight: 700 }} dir="rtl">{sw.name}</span>
        <span className="micro" role="status" style={{ marginInlineStart: 10, color: 'var(--asw-fast)' }}>✓ {done}</span>
      </div>
    )
  }

  return (
    <div className="hair-b" style={{ padding: '14px 0' }}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 240px', minWidth: 200 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }} dir="rtl">{sw.name}</div>
          <div className="micro" style={{ marginTop: 3 }}>
            {[sw.club, sw.date_of_birth || sw.birth_year, sw.sex, `${sw.result_count} swims`]
              .filter(Boolean).join(' · ')}
          </div>
        </div>
        <div style={{ flex: '2 1 320px', minWidth: 260 }}>
          <select className="select" value={sel} onChange={(e) => setSel(e.target.value)} aria-label={`English profile for ${sw.name}`}
            style={{ fontSize: 13 }}>
            <option value="">— pick an English profile —</option>
            {sw.candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}  ({c.reasons.join(', ') || `score ${c.score}`})
              </option>
            ))}
            <option value="NEW">+ Create a new English profile…</option>
          </select>
          {sw.candidates.length === 0 && (
            <div className="micro" style={{ marginTop: 5 }}>No automatic matches — create a new profile.</div>
          )}
        </div>
        {sel && sel !== 'NEW' && (
          <button type="button" className="btn btn-primary" disabled={busy} onClick={merge}
>
            {busy ? 'Merging…' : 'Merge'}
          </button>
        )}
      </div>
      {err && <div role="alert" className="error-box" style={{ marginTop: 10 }}>{err}</div>}
      {sel === 'NEW' && (
        <NewProfileForm sw={sw} countryId={countryId} allCountries={allCountries}
          onSubmit={createProfile} busy={busy} />
      )}
    </div>
  )
}

export default function NameMatch() {
  const [countries, setCountries] = useState(null)
  const [allCountries, setAllCountries] = useState([])
  const [country, setCountry] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [doneIds, setDoneIds] = useState(new Set())
  const [sessionDone, setSessionDone] = useState(0)
  const reqId = useRef(0)

  useEffect(() => {
    getNameMatchCountries()
      .then((res) => {
        const list = res.data || []
        setCountries(list)
        // Tesler's Law: start on the country with the most names left instead
        // of an empty page that waits for a choice
        const top = [...list].sort((a, b) => (b.arabic_count || 0) - (a.arabic_count || 0))[0]
        if (top) { setCountry(String(top.id)); load(String(top.id), 1, '') }
      })
      .catch(() => setCountries([]))
    getCountries({ page_size: 500 })
      .then((res) => setAllCountries(Array.isArray(res.data) ? res.data : res.data?.results || []))
      .catch(() => setAllCountries([]))
  }, [])

  const load = (c = country, p = page, query = q) => {
    if (!c) return
    // Guard against out-of-order responses: a quick country switch or repeated
    // search can resolve stale requests last and clobber the current results.
    const id = ++reqId.current
    setDoneIds(new Set())
    setLoading(true)
    getNameMatchList({ country: c, page: p, q: query })
      .then((res) => { if (id === reqId.current) setData(res.data) })
      .catch(() => { if (id === reqId.current) setData({ results: [], total: 0 }) })
      .finally(() => { if (id === reqId.current) setLoading(false) })
  }

  const pickCountry = (c) => {
    setCountry(c)
    setPage(1)
    setQ('')
    load(c, 1, '')
  }

  // The finished row stays in place showing its "✓ merged" line (it used to
  // vanish the moment it was saved, so there was no confirmation at all).
  const onDone = (id) => {
    setDoneIds((prev) => new Set(prev).add(id))
    setSessionDone((n) => n + 1)
    setCountries((list) => list && list.map((c) => (String(c.id) === String(country)
      ? { ...c, arabic_count: Math.max(0, (c.arabic_count || 0) - 1) } : c)))
  }

  if (!countries) return <Loading label="Loading countries" />

  return (
    <div>
      <div className="pad" style={{ paddingBottom: 0 }}><BackLink to="/admin">Dashboard</BackLink></div>
      <PageHead kicker="Admin" title="Name Matching"
        sub="For each Arabic name, pick the English profile it belongs to and press Merge — or create a new profile. Each one takes a few seconds." />

      <div className="pad rule-b">
        <SectHead title="Country">
          {/* Goal-Gradient Effect: what is left, and what this session has done */}
          <span className="micro asw-num" style={{ textTransform: 'none', letterSpacing: 0 }}>
            {countries.reduce((n, c) => n + (c.arabic_count || 0), 0).toLocaleString('en-US')} names left
            {sessionDone > 0 && <strong style={{ color: 'var(--asw-fast)', marginInlineStart: 10 }}>✓ {sessionDone} done this session</strong>}
          </span>
        </SectHead>
        {countries.length === 0 ? (
          <Empty label="No Arabic names left to reconcile" hint="Every Arabic-named swimmer already has an English profile." />
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {countries.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={country === String(c.id)}
                className={`btn ${country === String(c.id) ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => pickCountry(String(c.id))}
                style={{ height: 34, padding: '0 14px', fontSize: 13 }}
              >
                {c.name} <span className="micro" style={{ marginInlineStart: 6 }}>{c.arabic_count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {country && (
        <div className="pad">
          <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { setPage(1); load(country, 1, q) } }}
              placeholder="Search Arabic name…"
              aria-label="Search Arabic name"
              className="input"
              style={{ flex: '1 1 200px', maxWidth: 420 }}
              dir="rtl"
            />
            <button type="button" className="btn btn-secondary" disabled={loading} onClick={() => { setPage(1); load(country, 1, q) }}
>Search</button>
            {q && <button type="button" className="btn btn-ghost" onClick={() => { setQ(''); setPage(1); load(country, 1, '') }}>Clear</button>}
          </div>

          {loading ? (
            <Loading label="Loading swimmers" />
          ) : !data || data.results.length === 0 ? (
            <Empty label="No Arabic-named swimmers here" hint={q ? 'Try a shorter search, or clear it and press Search.' : 'Pick another country above.'} />
          ) : (
            <>
              <div className="micro asw-num" style={{ marginBottom: 8 }}>
                {Math.max(0, (data.total || 0) - doneIds.size).toLocaleString('en-US')} left in this country · {doneIds.size} of {data.results.length} done on this page
              </div>
              {data.results.map((sw) => (
                <Row key={sw.id} sw={sw} countryId={country} allCountries={allCountries} onDone={onDone} />
              ))}
              {/* Peak-End Rule: a finished page says so and offers the next one */}
              {doneIds.size > 0 && doneIds.size === data.results.length && (
                <div style={{ margin: '16px 0' }}>
                  <Done title="This page is finished">
                    <button type="button" className="btn btn-primary" style={{ marginTop: 8 }} onClick={() => { setPage(1); load(country, 1, q) }}>Load the next names →</button>
                  </Done>
                </div>
              )}
              <Pager
                page={data.page}
                pageSize={data.page_size}
                count={data.total}
                onPage={(p) => { setPage(p); load(country, p, q) }}
              />
            </>
          )}
        </div>
      )}
    </div>
  )
}
