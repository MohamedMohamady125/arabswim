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

// Shared modal: Escape key, click-outside close, ARIA, consistent styling.
// Replaces per-page Modal functions that drifted in padding/border/width.
export function Modal({ title, onClose, children, width = 580 }) {
  const ref = useRef(null)
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    // trap focus: prevent background scroll
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handler)
      document.body.style.overflow = prev
    }
  }, [onClose])
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{ position: 'fixed', inset: 0, background: 'rgba(20,24,31,0.55)', zIndex: 100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '6vh 16px', overflowY: 'auto' }}
      onClick={onClose}
    >
      <div
        ref={ref}
        style={{ background: 'var(--color-bg)', border: '2px solid var(--color-text)', width: '100%', maxWidth: width }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="rule-b" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px' }}>
          <div className="kicker">{title}</div>
          <button type="button" className="btn btn-secondary btn-icon" onClick={onClose} aria-label="Close" style={{ width: 30, height: 30, fontSize: 16 }}>×</button>
        </div>
        <div style={{ padding: 20 }}>{children}</div>
      </div>
    </div>
  )
}

export function MedalIcon({ type, size = 18, style }) {
  const src = { GOLD: '/medal_gold.png', SILVER: '/medal_silver.png', BRONZE: '/medal_bronze.png' }[
    String(type || '').toUpperCase()
  ]
  if (!src) return null
  return (
    <img
      src={src}
      alt={type}
      width={size}
      height={size}
      style={{
        display: 'inline-block',
        verticalAlign: 'middle',
        // Lock the square footprint so the global `img { max-width: 100% }`
        // rule can't shrink the width inside a narrow column (e.g. the rank
        // cell on phones) and distort the medal into a squished sliver.
        width: size,
        height: size,
        minWidth: size,
        maxWidth: size,
        flexShrink: 0,
        objectFit: 'contain',
        ...style,
      }}
    />
  )
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
