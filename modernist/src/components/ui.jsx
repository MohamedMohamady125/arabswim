import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'

export function Loading({ label = 'Loading' }) {
  return <div className="loading">{label}…</div>
}

export function Empty({ label = 'No data' }) {
  return <div className="empty">{label}</div>
}

// Section header row: <SectHead title="Medal tally" to="/medals" linkLabel="All medals" />
export function SectHead({ title, to, linkLabel, children }) {
  return (
    <div className="sect-head">
      <h4>{title}</h4>
      {children}
      {to && <Link to={to}>{linkLabel || 'View all'} →</Link>}
    </div>
  )
}

// Page hero: big headline + kicker, sits under the nav
export function PageHead({ kicker, title, sub, children }) {
  return (
    <div className="pad-lg rule-b">
      {kicker && <div className="kicker" style={{ marginBottom: 6 }}>{kicker}</div>}
      <h1 style={{ margin: 0, letterSpacing: '-0.03em' }}>{title}</h1>
      {sub && <div style={{ fontSize: 13, color: 'var(--color-neutral-700)', marginTop: 8 }}>{sub}</div>}
      {children}
    </div>
  )
}

// Segmented control: options [{value,label}]. `tabs` renders a page-level tab
// bar that turns into a swipeable underline strip on phones.
export function Seg({ options, value, onChange, tabs = false }) {
  const wrapRef = useRef(null)
  useEffect(() => {
    if (!tabs) return
    const el = wrapRef.current?.querySelector('.seg-opt.on')
    el?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [tabs, value])
  return (
    <div ref={wrapRef} className={`seg${tabs ? ' seg-tabs' : ''}`}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={`seg-opt${o.value === value ? ' on' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function MedalIcon({ type, size = 18 }) {
  const src = { GOLD: '/medal_gold.png', SILVER: '/medal_silver.png', BRONZE: '/medal_bronze.png' }[
    String(type || '').toUpperCase()
  ]
  if (!src) return null
  return <img src={src} alt={type} width={size} height={size} style={{ display: 'inline-block' }} />
}

export function Pager({ page, pageSize = 25, count, onPage }) {
  const pages = Math.max(1, Math.ceil((count || 0) / pageSize))
  if (pages <= 1) return null
  return (
    <div className="pager">
      <span className="info asw-num">
        Page {page} of {pages} · {count?.toLocaleString('en-US')} entries
      </span>
      <button className="btn btn-secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>← Prev</button>
      <button className="btn btn-secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next →</button>
    </div>
  )
}
