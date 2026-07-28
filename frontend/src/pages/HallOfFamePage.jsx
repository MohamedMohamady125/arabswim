import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Crown, Plus, Pencil, Trash2, User, ExternalLink } from 'lucide-react'
import { getInductees, deleteInductee } from '../api/fame'
import CountryFlag from '../components/common/CountryFlag'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'
import { Button, Badge, SearchInput, EmptyState, ConfirmDialog, CardsSkeleton, PageHeader } from '../components/ui'

export default function HallOfFamePage() {
  const navigate = useNavigate()
  const toast = useToast()
  const { token } = useAuth()
  const isAdmin = !!token
  const [inductees, setInductees] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [pendingDelete, setPendingDelete] = useState(null)

  useEffect(() => {
    getInductees({ search: search || undefined }).then((res) => {
      setInductees(Array.isArray(res.data) ? res.data : res.data.results || [])
    }).catch(() => {}).finally(() => setLoading(false))
  }, [search])

  const handleDelete = async (i) => {
    try {
      await deleteInductee(i.id)
      setInductees((prev) => prev.filter((x) => x.id !== i.id))
      toast.success('Inductee removed')
    } catch {
      toast.error('Failed to remove inductee')
    } finally {
      setPendingDelete(null)
    }
  }

  return (
    <div className="max-w-7xl mx-auto animate-fade-up">
      <PageHeader
        title="Hall of Fame"
        subtitle={`${inductees.length} legend${inductees.length === 1 ? '' : 's'} of Arab swimming`}
        action={isAdmin && (
          <Button variant="secondary" size="sm" icon={Plus} onClick={() => navigate('/hall-of-fame/new')}>
            Add Inductee
          </Button>
        )}
      />

      <SearchInput placeholder="Search inductees..." value={search}
        onChange={(e) => setSearch(e.target.value)} className="mb-5 max-w-md" />

      {loading ? (
        <CardsSkeleton count={6} />
      ) : inductees.length === 0 ? (
        <div className="bg-white rounded-md shadow-card border border-ink-100">
          <EmptyState icon={Crown} title="No inductees yet" hint="The legends of Arab swimming will be honored here." />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {inductees.map((i) => {
            const photo = i.photo || i.swimmer_detail?.photo
            return (
              <article key={i.id}
                className="bg-white rounded-md shadow-card border border-ink-100 overflow-hidden transition-colors hover:border-aqua-500/40">
                <div className="border-t-2 border-gold p-5 flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-ink-50 ring-2 ring-gold/50 overflow-hidden flex items-center justify-center shrink-0">
                    {photo ? (
                      <img src={photo} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <User size={24} className="text-ink-200" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-title text-ink-900 flex items-center gap-1.5 min-w-0">
                      <Crown size={15} className="text-gold shrink-0" aria-hidden="true" />
                      <span className="truncate">{i.name}</span>
                    </h3>
                    <div className="text-body-sm text-ink-500 mt-0.5 min-w-0">
                      {i.country_detail && (
                        <CountryFlag code={i.country_detail.code} flagUrl={i.country_detail.flag_url} name={i.country_detail.name} className="max-w-full" />
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-1.5">
                      {i.era && <Badge variant="medal">{i.era}</Badge>}
                      {i.inducted_year && <span className="text-label text-ink-400 tnum">Inducted {i.inducted_year}</span>}
                    </div>
                  </div>
                </div>
                <div className="px-5 pb-4">
                  {i.achievements && <p className="text-body-sm text-ink-500 line-clamp-3">{i.achievements}</p>}
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-ink-100 min-h-10">
                    {i.swimmer ? (
                      <button onClick={() => navigate(`/swimmers/${i.swimmer}`)}
                        className="text-aqua-600 hover:text-ink-900 text-body-sm flex items-center gap-1 min-h-10">
                        <ExternalLink size={13} /> Swimmer profile
                      </button>
                    ) : <span className="text-label text-ink-400">Standalone legend</span>}
                    {isAdmin && (
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" icon={Pencil} aria-label="Edit inductee"
                          onClick={() => navigate(`/hall-of-fame/${i.id}/edit`)} />
                        <Button variant="ghost" size="sm" icon={Trash2} aria-label="Remove inductee"
                          className="hover:text-neg" onClick={() => setPendingDelete(i)} />
                      </div>
                    )}
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        title="Remove inductee"
        message={pendingDelete ? `Remove "${pendingDelete.name}" from the Hall of Fame?` : ''}
        destructive
        confirmLabel="Remove"
        onConfirm={() => handleDelete(pendingDelete)}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}
