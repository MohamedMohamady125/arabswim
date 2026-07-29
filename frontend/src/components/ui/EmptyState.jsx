export default function EmptyState({ icon: Icon, title, hint, action }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-10 sm:py-14 px-4">
      {Icon && (
        <span className="w-14 h-14 rounded-full bg-aqua-50 text-aqua-600 flex items-center justify-center mb-4">
          <Icon size={26} />
        </span>
      )}
      <h3 className="text-title text-ink-900">{title}</h3>
      {hint && <p className="text-body-sm text-ink-400 mt-1.5 max-w-sm">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
