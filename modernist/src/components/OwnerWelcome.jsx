import { useSearchParams } from 'react-router-dom'

/**
 * Shown once, right after an owner creates their account from an invite link
 * (they land on their own page with ?welcome=1).
 * Goal-Gradient + Zeigarnik: say what is already done and what is still
 * missing, with one button that opens the form. Dismissing it (or leaving the
 * page) removes it for good — it never nags.
 *   show   — the viewer manages this page
 *   items  — [{ label, done }]
 */
export default function OwnerWelcome({ show, name, items = [], actionLabel = 'Fill in your page', onAction }) {
  const [sp, setSp] = useSearchParams()
  if (!show || sp.get('welcome') !== '1') return null
  const close = () => setSp((prev) => { const n = new URLSearchParams(prev); n.delete('welcome'); return n }, { replace: true })
  const done = items.filter((i) => i.done).length
  return (
    <div className="owner-welcome" role="status">
      <div className="owner-welcome-head">
        <div>
          <div className="kicker" style={{ marginBottom: 4 }}>Your account is ready</div>
          <div className="owner-welcome-title">This is {name ? `the ${name} page` : 'your page'}. Only you and ArabSwim can edit it.</div>
        </div>
        <button type="button" className="btn btn-ghost" onClick={close} aria-label="Close this guide">Close</button>
      </div>
      {items.length > 0 && (
        <>
          <div className="owner-welcome-count asw-num">{done} of {items.length} done</div>
          <ul className="owner-welcome-list">
            {items.map((i) => (
              <li key={i.label} className={i.done ? 'done' : undefined}>
                <span aria-hidden="true">{i.done ? '✓' : '○'}</span>
                <span>{i.label}</span>
                <span className="sr-only">{i.done ? ' — done' : ' — still to add'}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {onAction && (
        <button type="button" className="btn btn-primary" style={{ height: 44 }} onClick={onAction}>{actionLabel}</button>
      )}
    </div>
  )
}
