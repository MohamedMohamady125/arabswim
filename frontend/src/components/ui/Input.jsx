import clsx from 'clsx'
import { Search } from 'lucide-react'

const FIELD =
  'h-10 w-full rounded-sm border border-ink-200 bg-white px-3 text-body-sm text-ink-900 ' +
  'placeholder:text-ink-400 focus:border-aqua-500 focus:ring-2 focus:ring-aqua-500/40 focus:outline-none ' +
  'disabled:opacity-50 disabled:cursor-not-allowed'

export function Input({ className, ...props }) {
  return <input className={clsx(FIELD, className)} {...props} />
}

export function Select({ className, children, ...props }) {
  return (
    <select className={clsx(FIELD, 'pe-8', className)} {...props}>
      {children}
    </select>
  )
}

export function SearchInput({ className, ...props }) {
  return (
    <div className={clsx('relative', className)}>
      <Search size={16} className="absolute start-3 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none" />
      <input type="search" className={clsx(FIELD, 'ps-9')} {...props} />
    </div>
  )
}

export function Textarea({ className, rows = 3, ...props }) {
  return (
    <textarea rows={rows} className={clsx(FIELD, 'h-auto py-2', className)} {...props} />
  )
}

export function FieldLabel({ children, required, className }) {
  return (
    <label className={clsx('block text-label text-ink-500 mb-1.5', className)}>
      {children}
      {required && <span className="text-neg ms-0.5">*</span>}
    </label>
  )
}
