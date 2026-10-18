import { useEffect, useState } from 'react'
import { getNameMatchCountries, getNameMatchList, applyNameMatch } from '../api/swimmers'
import { PageHead, SectHead, Loading, Empty, Pager } from '../components/ui'

function Row({ sw, onDone }) {
  const [sel, setSel] = useState('')          // chosen english candidate id, or 'NEW'
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(null)      // message after apply

  const apply = async () => {
    if (!sel) return
    setBusy(true)
    try {
      const body = sel === 'NEW'
        ? { arabic_id: sw.id, new_name: newName.trim() }
        : { arabic_id: sw.id, english_id: Number(sel) }
      const res = await applyNameMatch(body)
      setDone(res.data?.message || 'Done')
      onDone?.(sw.id)
    } catch (err) {
      window.alert(err.response?.data?.error || 'Failed')
    } finally {
      setBusy(false)
    }
  }

  const canApply = sel === 'NEW' ? newName.trim().length > 1 : !!sel

  if (done) {
    return (
      <div className="hair-b" style={{ padding: '12px 0', fontSize: 13 }}>
        <span style={{ fontWeight: 700 }} dir="rtl">{sw.name}</span>
        <span className="micro" style={{ marginInlineStart: 10, color: 'var(--color-asw-fast, green)' }}>✓ {done}</span>
      </div>
    )
  }

  return (
    <div className="hair-b" style={{ display: 'flex', gap: 14, alignItems: 'flex-start', padding: '14px 0', flexWrap: 'wrap' }}>
      <div style={{ flex: '1 1 240px', minWidth: 200 }}>
        <div style={{ fontWeight: 700, fontSize: 15 }} dir="rtl">{sw.name}</div>
        <div className="micro" style={{ marginTop: 3 }}>
          {[sw.club, sw.date_of_birth || sw.birth_year, sw.sex, `${sw.result_count} swims`]
            .filter(Boolean).join(' · ')}
        </div>
      </div>
      <div style={{ flex: '2 1 320px', minWidth: 260 }}>
        <select
          value={sel}
          onChange={(e) => setSel(e.target.value)}
          style={{ width: '100%', height: 38, padding: '0 8px', fontSize: 13 }}
        >
          <option value="">— pick an English profile —</option>
          {sw.candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}  ({c.reasons.join(', ') || `score ${c.score}`})
            </option>
          ))}
          <option value="NEW">+ Create a new English profile…</option>
        </select>
        {sel === 'NEW' && (
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New English name (e.g. Mohamed Ali)"
            style={{ width: '100%', height: 38, marginTop: 8, padding: '0 8px', fontSize: 13 }}
          />
        )}
        {sw.candidates.length === 0 && (
          <div className="micro" style={{ marginTop: 5 }}>No automatic matches — create a new profile.</div>
        )}
      </div>
      <button
        className="btn btn-primary"
        disabled={!canApply || busy}
        onClick={apply}
        style={{ height: 38, padding: '0 16px', opacity: (!canApply || busy) ? 0.5 : 1 }}
      >
        {busy ? '…' : (sel === 'NEW' ? 'Rename' : 'Merge')}
      </button>
    </div>
  )
}

export default function NameMatch() {
  const [countries, setCountries] = useState(null)
  const [country, setCountry] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    getNameMatchCountries()
      .then((res) => setCountries(res.data || []))
      .catch(() => setCountries([]))
  }, [])

  const load = (c = country, p = page, query = q) => {
    if (!c) return
    setLoading(true)
    getNameMatchList({ country: c, page: p, q: query })
      .then((res) => setData(res.data))
      .catch(() => setData({ results: [], total: 0 }))
      .finally(() => setLoading(false))
  }

  const pickCountry = (c) => {
    setCountry(c)
    setPage(1)
    setQ('')
    load(c, 1, '')
  }

  const onDone = (id) => {
    // Drop the resolved row from the current view.
    setData((d) => d && { ...d, results: d.results.filter((r) => r.id !== id) })
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
                <Row key={sw.id} sw={sw} onDone={onDone} />
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
