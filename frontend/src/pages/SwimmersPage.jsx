import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { User, Users, Plus, Pencil, Trash2, GitMerge, ArrowLeftRight } from 'lucide-react'
import { getSwimmers, deleteSwimmer, searchSwimmers } from '../api/swimmers'
import { getCountries } from '../api/core'
import { mergeSwimmers } from '../api/importer'
import DataTable from '../components/common/DataTable'
import Pagination from '../components/common/Pagination'
import CountryFlag from '../components/common/CountryFlag'
import { Button, PageHeader, FilterBar, Select, SearchInput, Modal, ConfirmDialog, EmptyState } from '../components/ui'
import { SwimmerCell } from '../components/domain'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'

function Avatar({ photo, size = 'md' }) {
  const cls = size === 'sm' ? 'w-8 h-8' : 'w-10 h-10'
  return (
    <div className={`${cls} rounded-full bg-ink-100 overflow-hidden shrink-0 flex items-center justify-center`}>
      {photo
        ? <img src={photo} alt="" className="w-full h-full object-cover" />
        : <User size={size === 'sm' ? 14 : 16} className="text-ink-400" />}
    </div>
  )
}

export default function SwimmersPage() {
  const [swimmers, setSwimmers] = useState([])
  const [countries, setCountries] = useState([])
  const [pagination, setPagination] = useState({})
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [filterNationality, setFilterNationality] = useState('')
  const [filterSex, setFilterSex] = useState('')
  const navigate = useNavigate()
  const { token } = useAuth()
  const isAdmin = !!token
  const toast = useToast()

  // Merge state
  const [mergeMode, setMergeMode] = useState(false)
  const [mergeStep, setMergeStep] = useState(1) // 1=select primary, 2=select duplicate
  const [primarySwimmer, setPrimarySwimmer] = useState(null)
  const [duplicateSwimmer, setDuplicateSwimmer] = useState(null)
  const [mergeSearch, setMergeSearch] = useState('')
  const [mergeResults, setMergeResults] = useState([])
  const [merging, setMerging] = useState(false)
  const [confirmMerge, setConfirmMerge] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    getCountries().then(res => setCountries(res.data.filter(c => c.region === 'ARAB' || c.region === 'GCC'))).catch(() => {})
  }, [])

  const fetchSwimmers = () => {
    const params = { page, search: search || undefined, nationality: filterNationality || undefined, sex: filterSex || undefined }
    getSwimmers(params).then(res => {
      const data = Array.isArray(res.data) ? res.data : (res.data.results || [])
      setSwimmers(data)
      if (res.data.count !== undefined) {
        setPagination({ count: res.data.count, next: res.data.next, previous: res.data.previous })
      } else {
        setPagination({})
      }
    }).catch(() => {})
  }

  useEffect(fetchSwimmers, [page, search, filterNationality, filterSex])

  const handleDelete = async () => {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      await deleteSwimmer(pendingDelete.id)
      setSwimmers(swimmers.filter(s => s.id !== pendingDelete.id))
      toast.success('Swimmer deleted')
      setPendingDelete(null)
    } catch {
      toast.error('Failed to delete swimmer')
    } finally {
      setDeleting(false)
    }
  }

  // Merge search
  useEffect(() => {
    if (mergeSearch.length >= 2) {
      searchSwimmers(mergeSearch).then(res => setMergeResults(res.data))
    } else {
      setMergeResults([])
    }
  }, [mergeSearch])

  const handleSelectForMerge = (swimmer) => {
    if (mergeStep === 1) {
      setPrimarySwimmer(swimmer)
      setMergeStep(2)
      setMergeSearch('')
      setMergeResults([])
    } else {
      if (swimmer.id === primarySwimmer.id) return
      setDuplicateSwimmer(swimmer)
      setMergeSearch('')
      setMergeResults([])
    }
  }

  const handleMerge = async () => {
    if (!primarySwimmer || !duplicateSwimmer) return
    setMerging(true)
    try {
      await mergeSwimmers(primarySwimmer.id, duplicateSwimmer.id)
      toast.success(`Merged "${duplicateSwimmer.name}" into "${primarySwimmer.name}"`)
      setConfirmMerge(false)
      cancelMerge()
      fetchSwimmers()
    } catch (err) {
      toast.error('Merge failed: ' + (err.response?.data?.error || err.message))
    } finally {
      setMerging(false)
    }
  }

  const cancelMerge = () => {
    setMergeMode(false)
    setMergeStep(1)
    setPrimarySwimmer(null)
    setDuplicateSwimmer(null)
    setMergeSearch('')
    setMergeResults([])
  }

  const swimmerMeta = (s) => [s.club, s.sex === 'M' ? 'Male' : 'Female', s.age ? `Age ${s.age}` : null].filter(Boolean).join(' · ')

  const columns = [
    { key: 'photo', label: '', render: (row) => <Avatar photo={row.photo} /> },
    { key: 'name', label: 'Swimmer', render: (row) => (
      <SwimmerCell name={row.name} countryCode={row.nationality_detail?.code} flagUrl={row.nationality_detail?.flag_url} />
    )},
    { key: 'nationality', label: 'Nationality', render: (row) => row.nationality_detail?.name || '-' },
    { key: 'club', label: 'Club', render: (row) => row.club || '-' },
    { key: 'sex', label: 'Sex', render: (row) => row.sex === 'M' ? 'Male' : 'Female' },
    { key: 'age', label: 'Age', numeric: true },
    ...(isAdmin ? [{ key: 'actions', label: '', render: (row) => (
      <div className="flex gap-1 justify-end">
        <Button variant="ghost" size="sm" icon={Pencil} aria-label="Edit swimmer"
          onClick={(e) => { e.stopPropagation(); navigate(`/swimmers/${row.id}/edit`) }} />
        <Button variant="ghost" size="sm" icon={Trash2} aria-label="Delete swimmer" className="text-neg hover:text-neg"
          onClick={(e) => { e.stopPropagation(); setPendingDelete(row) }} />
      </div>
    )}] : []),
  ]

  const chips = [
    filterNationality && { key: 'nat', label: countries.find(c => String(c.id) === String(filterNationality))?.name || 'Country', onRemove: () => { setFilterNationality(''); setPage(1) } },
    filterSex && { key: 'sex', label: filterSex === 'M' ? 'Men' : 'Women', onRemove: () => { setFilterSex(''); setPage(1) } },
  ].filter(Boolean)

  const mergeSlot = (swimmer, { title, hint, onClear }) => (
    <div className="rounded-md border border-ink-100 bg-ink-50 p-4">
      <div className="text-label text-ink-400 mb-2">{title}</div>
      {swimmer ? (
        <div className="flex items-center gap-3">
          <Avatar photo={swimmer.photo} />
          <div className="min-w-0">
            <div className="text-body font-medium text-ink-900 truncate">{swimmer.name}</div>
            <div className="text-body-sm text-ink-400">
              <CountryFlag code={swimmer.nationality_detail?.code} flagUrl={swimmer.nationality_detail?.flag_url} name={swimmer.nationality_detail?.name} />
            </div>
          </div>
          <Button variant="ghost" size="sm" className="ms-auto" onClick={onClear}>Change</Button>
        </div>
      ) : (
        <div className="text-body-sm text-ink-400 italic min-h-10 flex items-center">{hint}</div>
      )}
    </div>
  )

  return (
    <div>
      <PageHeader
        title="Swimmers"
        subtitle="Browse every swimmer in the database"
        action={
          <div className="flex flex-wrap items-center gap-2 max-w-full min-w-0">
            <Button variant="secondary" size="sm" icon={ArrowLeftRight} onClick={() => navigate('/swimmers/compare')}>
              Compare
            </Button>
            {isAdmin && (
              <>
                <Button variant="ghost" size="sm" icon={GitMerge} onClick={() => setMergeMode(true)}>
                  Merge
                </Button>
                <Button variant="ghost" size="sm" icon={Plus} onClick={() => navigate('/swimmers/new')}>
                  Add
                </Button>
              </>
            )}
          </div>
        }
      />

      {/* Merge wizard (admin) */}
      {isAdmin && (
        <Modal open={mergeMode} onClose={cancelMerge} title="Merge swimmers" size="lg">
          <p className="text-body-sm text-ink-500 mb-4">
            Select the swimmer to <strong className="text-ink-900">keep</strong> (primary), then select the{' '}
            <strong className="text-ink-900">duplicate</strong> to merge into them. All results, records and medals
            from the duplicate will be transferred.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {mergeSlot(primarySwimmer, {
              title: mergeStep === 1 ? 'Step 1 — Keep (primary)' : 'Keeping',
              hint: 'Search and select below...',
              onClear: () => { setPrimarySwimmer(null); setDuplicateSwimmer(null); setMergeStep(1) },
            })}
            {mergeSlot(duplicateSwimmer, {
              title: mergeStep === 2 ? 'Step 2 — Duplicate (deleted)' : 'Duplicate (will be deleted)',
              hint: mergeStep === 1 ? 'Select primary first' : 'Search and select below...',
              onClear: () => setDuplicateSwimmer(null),
            })}
          </div>

          {/* Search for merge */}
          {(mergeStep === 1 || (mergeStep === 2 && !duplicateSwimmer)) && (
            <div className="mt-4">
              <SearchInput
                placeholder={mergeStep === 1 ? 'Search for the swimmer to KEEP...' : 'Search for the DUPLICATE swimmer...'}
                value={mergeSearch}
                onChange={(e) => setMergeSearch(e.target.value)}
                autoFocus
              />
              {mergeResults.length > 0 && (
                <div className="mt-2 bg-white border border-ink-100 rounded-sm max-h-48 overflow-y-auto divide-y divide-ink-100">
                  {mergeResults.filter(s => mergeStep === 1 || s.id !== primarySwimmer?.id).map(s => (
                    <button
                      key={s.id}
                      onClick={() => handleSelectForMerge(s)}
                      className="w-full text-start px-3 py-2.5 min-h-11 hover:bg-ink-50 flex items-center gap-3"
                    >
                      <Avatar photo={s.photo} size="sm" />
                      <div className="min-w-0">
                        <div className="text-body-sm font-medium text-ink-900 truncate">{s.name}</div>
                        <div className="text-body-sm text-ink-400 truncate">
                          {s.nationality_detail?.name} {s.club ? `· ${s.club}` : ''} · Age {s.age}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Merge action */}
          <div className="mt-5 flex flex-col sm:flex-row sm:items-center justify-end gap-3">
            {primarySwimmer && duplicateSwimmer && (
              <span className="text-body-sm text-ink-400">
                This will delete "{duplicateSwimmer.name}" and transfer all their data.
              </span>
            )}
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={cancelMerge}>Cancel</Button>
              <Button
                icon={GitMerge}
                disabled={!primarySwimmer || !duplicateSwimmer}
                loading={merging}
                onClick={() => setConfirmMerge(true)}
              >
                Merge
              </Button>
            </div>
          </div>
        </Modal>
      )}

      <ConfirmDialog
        open={confirmMerge}
        title="Merge swimmers"
        message={primarySwimmer && duplicateSwimmer
          ? `Merge "${duplicateSwimmer.name}" into "${primarySwimmer.name}"? All results, records, and medals will be transferred, and "${duplicateSwimmer.name}" will be deleted. This cannot be undone.`
          : ''}
        confirmLabel="Merge"
        destructive
        loading={merging}
        onConfirm={handleMerge}
        onCancel={() => setConfirmMerge(false)}
      />

      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete swimmer"
        message={pendingDelete ? `Delete "${pendingDelete.name}"? This cannot be undone.` : ''}
        destructive
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />

      <FilterBar
        chips={chips}
        onReset={() => { setFilterNationality(''); setFilterSex(''); setPage(1) }}
      >
        <SearchInput
          placeholder="Search swimmer..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          className="w-full md:w-64"
        />
        <Select value={filterNationality} onChange={(e) => { setFilterNationality(e.target.value); setPage(1) }} className="md:w-44" aria-label="Nationality">
          <option value="">All countries</option>
          {countries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Select value={filterSex} onChange={(e) => { setFilterSex(e.target.value); setPage(1) }} className="md:w-32" aria-label="Sex">
          <option value="">All</option>
          <option value="M">Men</option>
          <option value="F">Women</option>
        </Select>
      </FilterBar>

      {swimmers.length === 0 ? (
        <EmptyState icon={Users} title="No swimmers found" hint="Try adjusting the search or filters." />
      ) : (
        <DataTable
          columns={columns}
          data={swimmers}
          onRowClick={(row) => navigate(`/swimmers/${row.id}`)}
          mobileRender={(row) => (
            <div className="flex items-center gap-3">
              <Avatar photo={row.photo} />
              <div className="min-w-0 flex-1">
                <SwimmerCell
                  name={row.name}
                  countryCode={row.nationality_detail?.code}
                  flagUrl={row.nationality_detail?.flag_url}
                  meta={swimmerMeta(row)}
                />
              </div>
              {isAdmin && (
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="sm" icon={Pencil} aria-label="Edit swimmer"
                    onClick={(e) => { e.stopPropagation(); navigate(`/swimmers/${row.id}/edit`) }} />
                  <Button variant="ghost" size="sm" icon={Trash2} aria-label="Delete swimmer" className="text-neg hover:text-neg"
                    onClick={(e) => { e.stopPropagation(); setPendingDelete(row) }} />
                </div>
              )}
            </div>
          )}
        />
      )}
      {pagination.count > 0 && <Pagination {...pagination} currentPage={page} onPageChange={setPage} pageSize={50} />}
    </div>
  )
}
