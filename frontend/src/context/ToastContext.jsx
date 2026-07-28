import { createContext, useCallback, useContext, useState } from 'react'
import { CheckCircle, XCircle } from 'lucide-react'

const ToastContext = createContext(null)

let nextId = 1

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const remove = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id))
  }, [])

  const push = useCallback((type, message) => {
    const id = nextId++
    setToasts((t) => [...t, { id, type, message }])
    setTimeout(() => remove(id), 3500)
  }, [remove])

  const toast = {
    success: (msg) => push('success', msg),
    error: (msg) => push('error', msg),
  }

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="fixed bottom-4 inset-x-0 sm:inset-x-auto sm:end-6 sm:bottom-6 z-[100] flex flex-col items-center sm:items-end gap-2 px-4 sm:px-0 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            onClick={() => remove(t.id)}
            className="pointer-events-auto flex items-center gap-2.5 ps-3 pe-4 py-3 rounded-md shadow-pop bg-white border border-ink-100 text-body-sm text-ink-900 cursor-pointer animate-fade-up max-w-sm"
          >
            {t.type === 'success'
              ? <CheckCircle size={18} className="text-pos shrink-0" />
              : <XCircle size={18} className="text-neg shrink-0" />}
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  // Fallback no-op so pages work even if provider is missing
  return ctx || { success: () => {}, error: () => {} }
}
