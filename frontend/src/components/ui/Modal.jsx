import { useEffect } from 'react'
import clsx from 'clsx'
import { X, AlertTriangle } from 'lucide-react'
import Button from './Button'

export default function Modal({ open, onClose, title, size = 'md', children, footer }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink-950/60 backdrop-blur-sm p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={clsx(
          'bg-white rounded-t-lg sm:rounded-lg shadow-pop w-full max-w-[100vw] max-h-[92vh] overflow-y-auto overscroll-contain animate-fade-up',
          size === 'sm' && 'sm:max-w-sm',
          size === 'md' && 'sm:max-w-md',
          size === 'lg' && 'sm:max-w-2xl',
          size === 'xl' && 'sm:max-w-4xl',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {(title || onClose) && (
          <header className="flex items-center justify-between gap-3 px-4 sm:px-5 py-4 border-b border-ink-100 sticky top-0 bg-white rounded-t-lg">
            <h2 className="text-title text-ink-900 min-w-0 truncate">{title}</h2>
            {onClose && (
              <button onClick={onClose} aria-label="Close" className="p-2 -me-2 min-h-10 min-w-10 flex items-center justify-center shrink-0 text-ink-400 hover:text-ink-900 rounded-sm">
                <X size={18} />
              </button>
            )}
          </header>
        )}
        <div className="p-4 sm:p-5 min-w-0">{children}</div>
        {footer && <footer className="px-4 sm:px-5 py-3 sm:py-4 border-t border-ink-100 flex justify-end gap-2">{footer}</footer>}
      </div>
    </div>
  )
}

/**
 * Styled replacement for window.confirm. Usage:
 *   <ConfirmDialog open={!!pending} title="Delete meet"
 *     message="This cannot be undone." destructive
 *     onConfirm={...} onCancel={...} />
 */
export function ConfirmDialog({ open, title, message, confirmLabel, destructive = false, loading = false, onConfirm, onCancel }) {
  return (
    <Modal open={open} onClose={onCancel} size="sm">
      <div className="flex items-start gap-3">
        {destructive && (
          <span className="shrink-0 w-10 h-10 rounded-full bg-neg/10 text-neg flex items-center justify-center">
            <AlertTriangle size={20} />
          </span>
        )}
        <div className="min-w-0">
          <h2 className="text-title text-ink-900">{title}</h2>
          {message && <p className="text-body-sm text-ink-500 mt-1.5">{message}</p>}
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button variant={destructive ? 'danger' : 'primary'} loading={loading} onClick={onConfirm}>
          {confirmLabel || (destructive ? 'Delete' : 'Confirm')}
        </Button>
      </div>
    </Modal>
  )
}
