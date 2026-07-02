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
      <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            onClick={() => remove(t.id)}
            className={`flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm text-white cursor-pointer ${
              t.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'
            }`}
          >
            {t.type === 'success' ? <CheckCircle size={16} /> : <XCircle size={16} />}
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
