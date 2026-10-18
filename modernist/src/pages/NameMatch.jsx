import { useEffect, useRef, useState } from 'react'
import { getNameMatchCountries, getNameMatchList, applyNameMatch, createNameMatchProfile } from '../api/swimmers'
import { getCountries } from '../api/core'
import { PageHead, SectHead, Loading, Empty, Pager } from '../components/ui'
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
    fd.append('club', club)
    if (photo) fd.append('photo', photo)
    onSubmit(fd)
  }

  const fld = { height: 36, padding: '0 8px', fontSize: 13, width: '100%' }
  const label = { fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', opacity: 0.7, marginBottom: 3, display: 'block' }

  return (
    <div style={{ marginTop: 10, padding: 12, border: '1px solid var(--color-divider)', borderRadius: 4 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={label}>English name *</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Mohamed Ali" style={fld} />
        </div>
        <div>
          <label style={label}>Gender</label>
          <select value={sex} onChange={(e) => setSex(e.target.value)} style={fld}>
            <option value="">—</option>
            <option value="M">Male</option>
            <option value="F">Female</option>
          </select>
        </div>
        <div>
          <label style={label}>Date of birth</label>
          <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} style={fld} />
        </div>
        <div>
          <label style={label}>Year of birth</label>
          <input type="number" value={yob} onChange={(e) => setYob(e.target.value)}
            placeholder="e.g. 2005" style={fld} />
        </div>
        <div>
          <label style={label}>Nationality</label>
          <select value={nationality} onChange={(e) => setNationality(e.target.value)} style={fld}>
            {allCountries.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={label}>Club</label>
          <input type="text" value={club} onChange={(e) => setClub(e.target.value)} style={fld} />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={label}>Photo (drag to position / zoom to resize)</label>
          <CropUpload aspect={1} onChange={(f) => setPhoto(f)} />
          {photo && <span className="micro" style={{ color: 'var(--color-asw-fast, green)' }}>✓ photo ready</span>}
        </div>
      </div>
      <button className="btn btn-primary" disabled={busy || name.trim().length < 2} onClick={submit}
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

  const merge = async () => {
    setBusy(true)
    try {
      const res = await applyNameMatch({ arabic_id: sw.id, english_id: Number(sel) })
      setDone(res.data?.message || 'Done')
      onDone?.(sw.id)
    } catch (err) {
      window.alert(err.response?.data?.error || 'Failed')
    } finally {
      setBusy(false)
    }
  }

  const createProfile = async (formData) => {
    setBusy(true)
    try {
      const res = await createNameMatchProfile(formData)
      setDone(res.data?.message || 'Done')
      onDone?.(sw.id)
    } catch (err) {
      window.alert(err.response?.data?.error || 'Failed')
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className="hair-b" style={{ padding: '12px 0', fontSize: 13 }}>
        <span style={{ fontWeight: 700 }} dir="rtl">{sw.name}</span>
        <span className="micro" style={{ marginInlineStart: 10, color: 'var(--color-asw-fast, green)' }}>✓ {done}</span>
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
          <select value={sel} onChange={(e) => setSel(e.target.value)}
            style={{ width: '100%', height: 38, padding: '0 8px', fontSize: 13 }}>
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
          <button className="btn btn-primary" disabled={busy} onClick={merge}
            style={{ height: 38, padding: '0 16px', opacity: busy ? 0.5 : 1 }}>
            {busy ? '…' : 'Merge'}
          </button>
        )}
      </div>
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
  const reqId = useRef(0)

  useEffect(() => {
    getNameMatchCountries()
      .then((res) => setCountries(res.data || []))
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

  const onDone = (id) => {
    setData((d) => d && {
      ...d,
      results: d.results.filter((r) => r.id !== id),
      total: Math.max(0, (d.total || 0) - 1),
    })
  }

  if (!countries) return <Loading label="Loading countries" />

  return (
    <div>
      <PageHead kicker="Admin" title="Name Matching"
        sub="Reconcile Arabic-named swimmers with their English profiles." />

      <div className="pad rule-b">
        <SectHead title="Country" />
        {countries.length === 0 ? (
          <Empty label="No Arabic names left to reconcile" />
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {countries.map((c) => (
              <button
                key={c.id}
                className={`btn ${country === String(c.id) ? 'btn-primary' : ''}`}
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
              style={{ flex: '1 1 200px', height: 38, padding: '0 10px', fontSize: 13 }}
              dir="rtl"
            />
            <button className="btn" onClick={() => { setPage(1); load(country, 1, q) }}
              style={{ height: 38, padding: '0 16px' }}>Search</button>
          </div>

          {loading ? (
            <Loading label="Loading swimmers" />
          ) : !data || data.results.length === 0 ? (
            <Empty label="No Arabic-named swimmers here" />
          ) : (
            <>
              <div className="micro" style={{ marginBottom: 8 }}>{data.total} total to reconcile</div>
              {data.results.map((sw) => (
                <Row key={sw.id} sw={sw} countryId={country} allCountries={allCountries} onDone={onDone} />
              ))}
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
