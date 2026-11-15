import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'

export function Loading({ label = 'Loading' }) {
  // Doherty Threshold: announce the wait straight away (spinner is in theme.css)
  return <div className="loading" role="status" aria-live="polite">{label}…</div>
}

// Flow: a notice that does not block the page the way window.alert does.
// Failures stay longer and are announced assertively; tap to dismiss.
export function notify(message, kind) {
  const text = String(message || '').trim()
  if (!text || typeof document === 'undefined') return
  const bad = kind ? kind === 'error' : /fail|could not|couldn't|unable|error|invalid|not allowed|denied/i.test(text)
  let host = document.getElementById('asw-notices')
  if (!host) {
    host = document.createElement('div')
    host.id = 'asw-notices'
    host.className = 'asw-notices'
    document.body.appendChild(host)
  }
  const el = document.createElement('div')
  el.className = 'asw-notice' + (bad ? ' is-error' : '')
  el.setAttribute('role', bad ? 'alert' : 'status')
  el.textContent = text
  const close = () => { if (el.parentNode) el.parentNode.removeChild(el) }
  el.addEventListener('click', close)
  host.appendChild(el)
  setTimeout(close, bad ? 8000 : 4500)
}

// Paradox of the Active User: an empty state can say what to do next.
// `hint` is one plain sentence; children hold an optional action (button/link).
export function Empty({ label = 'No data', hint, children }) {
  return (
    <div className="empty" role="status">
      {label}
      {hint && <span className="empty-hint">{hint}</span>}
      {children && <div className="empty-action">{children}</div>}
    </div>
  )
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
    <div ref={wrapRef} className={`seg${tabs ? ' seg-tabs' : ''}`} role={tabs ? 'tablist' : 'group'}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={`seg-opt${o.value === value ? ' on' : ''}`}
          {...(tabs ? { role: 'tab', 'aria-selected': o.value === value } : { 'aria-pressed': o.value === value })}
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
    // Jakob's Law: focus moves into the dialog and returns to where it was
    const opener = document.activeElement
    if (ref.current && !ref.current.contains(opener)) ref.current.focus()
    return () => {
      document.removeEventListener('keydown', handler)
      document.body.style.overflow = prev
      if (opener && opener.focus && document.contains(opener)) opener.focus()
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
        tabIndex={-1}
        style={{ outline: 'none', background: 'var(--color-bg)', border: '2px solid var(--color-text)', width: '100%', maxWidth: width }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="rule-b" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px' }}>
          <div className="kicker">{title}</div>
          <button type="button" className="btn btn-secondary btn-icon" onClick={onClose} aria-label="Close" style={{ fontSize: 18 }}>×</button>
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
      <button type="button" className="btn btn-secondary" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">← Prev</button>
      <button type="button" className="btn btn-secondary" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">Next →</button>
    </div>
  )
}
