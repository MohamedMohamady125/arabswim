import clsx from 'clsx'
import { Loader2 } from 'lucide-react'

const VARIANTS = {
  primary: 'bg-aqua-600 text-white shadow-sm hover:bg-aqua-500 hover:shadow-md disabled:hover:bg-aqua-600',
  secondary: 'bg-white text-ink-900 border border-ink-200 hover:border-aqua-500/40 hover:bg-aqua-50',
  ghost: 'bg-transparent text-ink-500 hover:text-ink-900 hover:bg-ink-50',
  danger: 'bg-neg text-white hover:opacity-90',
}

const SIZES = {
  sm: 'h-8 px-3 text-body-sm gap-1.5',
  md: 'h-10 px-4 text-body-sm font-medium gap-2',
}

export default function Button({
  variant = 'primary',
  size = 'md',
  icon: Icon,
  loading = false,
  className,
  children,
  ...props
}) {
  return (
    <button
      className={clsx(
        'inline-flex items-center justify-center rounded-sm font-medium transition-all select-none active:scale-[0.98]',
        'disabled:opacity-50 disabled:cursor-not-allowed min-w-10',
        VARIANTS[variant], SIZES[size], className,
      )}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading ? (
        <Loader2 size={16} className="animate-spin" />
      ) : Icon ? (
        <Icon size={16} />
      ) : null}
      {children}
    </button>
  )
}
