import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, User, Trophy, X } from 'lucide-react'
import { searchSwimmers } from '../../api/swimmers'
import { getChampionships } from '../../api/championships'
import CountryFlag from '../common/CountryFlag'

/**
 * Universal search overlay (Cmd+K / Ctrl+K).
 * Searches swimmers + championships with debounced typeahead.
 */
export default function SearchCommand({ open, onClose }) {
  const navigate = useNavigate()
  const inputRef = useRef(null)
  const [query, setQuery] = useState('')
  const [swimmers, setSwimmers] = useState([])
  const [meets, setMeets] = useState([])
  const [loading, setLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const timerRef = useRef(null)

  // Auto-focus input on open
  useEffect(() => {
    if (open) {
      setQuery('')
      setSwimmers([])
      setMeets([])
      setActiveIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  // Debounced search
  const doSearch = useCallback((q) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (!q.trim()) {
      setSwimmers([])
      setMeets([])
      setLoading(false)
      return
    }
    setLoading(true)
    timerRef.current = setTimeout(async () => {
      try {
        const [s, m] = await Promise.all([
          searchSwimmers(q).catch(() => ({ data: [] })),
          getChampionships({ search: q, page_size: 5 }).catch(() => ({ data: { results: [] } })),
        ])
        setSwimmers((s.data || []).slice(0, 5))
        const meetResults = Array.isArray(m.data) ? m.data : (m.data?.results || [])
        setMeets(meetResults.slice(0, 5))
        setActiveIndex(0)
      } catch {
        // silent
      } finally {
        setLoading(false)
      }
    }, 300)
  }, [])

  useEffect(() => {
    doSearch(query)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [query, doSearch])

  // Build flat list for keyboard nav
  const allItems = [
    ...swimmers.map(s => ({ type: 'swimmer', data: s })),
    ...meets.map(m => ({ type: 'meet', data: m })),
  ]

  const go = (item) => {
    onClose()
    if (item.type === 'swimmer') navigate(`/swimmers/${item.data.id}`)
    else navigate(`/meets/${item.data.id}`)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') { onClose(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(i => Math.min(i + 1, allItems.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex(i => Math.max(i - 1, 0)) }
    if (e.key === 'Enter' && allItems[activeIndex]) { e.preventDefault(); go(allItems[activeIndex]) }
  }

  if (!open) return null

  let itemIndex = 0

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center pt-[15vh] bg-ink-950/60 backdrop-blur-sm"
      onClick={onClose}>
      <div className="bg-white rounded-lg shadow-dropdown w-full max-w-lg mx-4 overflow-hidden animate-fade-up"
        onClick={e => e.stopPropagation()} onKeyDown={handleKeyDown}>
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-ink-100">
          <Search size={18} className="text-ink-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search swimmers, championships..."
            className="flex-1 text-body text-ink-900 placeholder:text-ink-400 outline-none bg-transparent"
          />
          {query && (
            <button onClick={() => setQuery('')} className="p-1 text-ink-400 hover:text-ink-700">
              <X size={14} />
            </button>
          )}
          <kbd className="hidden sm:inline-flex h-6 px-1.5 items-center rounded border border-ink-200 text-[11px] text-ink-400 font-mono">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto overscroll-contain">
          {loading && query.trim() && (
            <div className="px-4 py-6 text-center text-body-sm text-ink-400">Searching...</div>
          )}

          {!loading && query.trim() && allItems.length === 0 && (
            <div className="px-4 py-6 text-center text-body-sm text-ink-400">
              No results for "{query}"
            </div>
          )}

          {!loading && swimmers.length > 0 && (
            <div>
              <div className="px-4 pt-3 pb-1 text-label text-ink-400">Swimmers</div>
              {swimmers.map((s) => {
                const idx = itemIndex++
                return (
                  <button key={s.id}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-start transition-colors ${idx === activeIndex ? 'bg-aqua-50' : 'hover:bg-ink-50'}`}
                    onClick={() => go({ type: 'swimmer', data: s })}
                    onMouseEnter={() => setActiveIndex(idx)}>
                    <div className="w-8 h-8 rounded-full bg-ink-100 flex items-center justify-center shrink-0">
                      {s.photo ? (
                        <img src={s.photo} alt="" className="w-8 h-8 rounded-full object-cover" />
                      ) : (
                        <User size={14} className="text-ink-400" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-body-sm font-medium text-ink-900 truncate">{s.name}</div>
                      <div className="text-body-sm text-ink-400 flex items-center gap-1">
                        {s.nationality_detail?.flag_url && (
                          <CountryFlag code={s.nationality_detail.code} url={s.nationality_detail.flag_url} size={12} />
                        )}
                        {s.nationality_detail?.name || ''}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {!loading && meets.length > 0 && (
            <div>
              <div className="px-4 pt-3 pb-1 text-label text-ink-400">Championships</div>
              {meets.map((m) => {
                const idx = itemIndex++
                return (
                  <button key={m.id}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-start transition-colors ${idx === activeIndex ? 'bg-aqua-50' : 'hover:bg-ink-50'}`}
                    onClick={() => go({ type: 'meet', data: m })}
                    onMouseEnter={() => setActiveIndex(idx)}>
                    <div className="w-8 h-8 rounded-full bg-ink-100 flex items-center justify-center shrink-0">
                      <Trophy size={14} className="text-ink-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-body-sm font-medium text-ink-900 truncate">{m.name}</div>
                      <div className="text-body-sm text-ink-400">{m.date || ''} {m.country_name ? `· ${m.country_name}` : ''}</div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer hint */}
        {allItems.length > 0 && (
          <div className="px-4 py-2 border-t border-ink-100 text-body-sm text-ink-400 flex items-center gap-3">
            <span><kbd className="font-mono text-[11px]">↑↓</kbd> navigate</span>
            <span><kbd className="font-mono text-[11px]">↵</kbd> select</span>
          </div>
        )}
      </div>
    </div>
  )
}
