import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getSwimmers, deleteSwimmer, searchSwimmers } from '../api/swimmers'
import { getCountries } from '../api/core'
import { mergeSwimmers } from '../api/importer'
import DataTable from '../components/common/DataTable'
import Pagination from '../components/common/Pagination'
import CountryFlag from '../components/common/CountryFlag'

export default function SwimmersPage() {
  const [swimmers, setSwimmers] = useState([])
  const [countries, setCountries] = useState([])
  const [pagination, setPagination] = useState({})
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [filterNationality, setFilterNationality] = useState('')
  const [filterSex, setFilterSex] = useState('')
  const navigate = useNavigate()

  // Merge state
  const [mergeMode, setMergeMode] = useState(false)
  const [mergeStep, setMergeStep] = useState(1) // 1=select primary, 2=select duplicate
  const [primarySwimmer, setPrimarySwimmer] = useState(null)
  const [duplicateSwimmer, setDuplicateSwimmer] = useState(null)
  const [mergeSearch, setMergeSearch] = useState('')
  const [mergeResults, setMergeResults] = useState([])
  const [merging, setMerging] = useState(false)

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

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this swimmer?')) return
    await deleteSwimmer(id)
    setSwimmers(swimmers.filter(s => s.id !== id))
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
    if (!window.confirm(`Merge "${duplicateSwimmer.name}" into "${primarySwimmer.name}"?\n\nAll results, records, and medals from "${duplicateSwimmer.name}" will be transferred to "${primarySwimmer.name}", and "${duplicateSwimmer.name}" will be deleted.\n\nThis cannot be undone.`)) return
    setMerging(true)
    try {
      await mergeSwimmers(primarySwimmer.id, duplicateSwimmer.id)
      cancelMerge()
      fetchSwimmers()
    } catch (err) {
      alert('Merge failed: ' + (err.response?.data?.error || err.message))
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

  const columns = [
    { key: 'photo', label: 'Photo', render: (row) => (
      <div className="w-10 h-10 rounded-full bg-gray-200 overflow-hidden">
        {row.photo ? <img src={row.photo} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">👤</div>}
      </div>
    )},
    { key: 'name', label: 'Swimmer Name' },
    { key: 'nationality', label: 'Nationality', render: (row) => (
      <CountryFlag code={row.nationality_detail?.code} flagUrl={row.nationality_detail?.flag_url} name={row.nationality_detail?.name} />
    )},
    { key: 'club', label: 'Club', render: (row) => row.club || '-' },
    { key: 'sex', label: 'Sex', render: (row) => row.sex === 'M' ? 'Male' : 'Female' },
    { key: 'age', label: 'Age' },
    { key: 'actions', label: '', render: (row) => (
      <div className="flex gap-2">
        <button onClick={(e) => { e.stopPropagation(); navigate(`/swimmers/${row.id}/edit`) }} className="text-blue-600 text-sm hover:underline">Edit</button>
        <button onClick={(e) => { e.stopPropagation(); handleDelete(row.id) }} className="text-red-600 text-sm hover:underline">Delete</button>
      </div>
    )},
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Swimmers</h1>
        <div className="flex gap-2">
          <button onClick={() => navigate('/swimmers/compare')}
            className="px-4 py-2 rounded-lg text-sm border border-sky-500 text-sky-500 hover:bg-sky-50">
            Compare Swimmers
          </button>
          <button
            onClick={() => mergeMode ? cancelMerge() : setMergeMode(true)}
            className={`px-4 py-2 rounded-lg text-sm ${mergeMode ? 'bg-gray-200 text-gray-700' : 'border border-orange-500 text-orange-500 hover:bg-orange-50'}`}
          >
            {mergeMode ? 'Cancel Merge' : 'Merge Swimmers'}
          </button>
          <button onClick={() => navigate('/swimmers/new')} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700">
            + Add Swimmer
          </button>
        </div>
      </div>

      {/* Merge Panel */}
      {mergeMode && (
        <div className="bg-orange-50 border-2 border-orange-200 rounded-lg p-5 mb-6">
          <h3 className="font-semibold text-orange-800 mb-3">Merge Swimmers</h3>
          <p className="text-sm text-orange-700 mb-4">
            Select the swimmer to <strong>keep</strong> (primary), then select the <strong>duplicate</strong> to merge into them. All results and data from the duplicate will be transferred.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 items-start">
            {/* Primary swimmer */}
            <div className="bg-white rounded-lg border p-4">
              <div className="text-xs font-medium text-gray-500 uppercase mb-2">
                {mergeStep === 1 ? 'Step 1: Select swimmer to KEEP' : 'Keeping'}
              </div>
              {primarySwimmer ? (
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-sm shrink-0">
                    {primarySwimmer.photo ? <img src={primarySwimmer.photo} alt="" className="w-full h-full rounded-full object-cover" /> : '👤'}
                  </div>
                  <div>
                    <div className="font-medium">{primarySwimmer.name}</div>
                    <div className="text-xs text-gray-500">
                      <CountryFlag code={primarySwimmer.nationality_detail?.code} flagUrl={primarySwimmer.nationality_detail?.flag_url} name={primarySwimmer.nationality_detail?.name} />
                    </div>
                  </div>
                  <button onClick={() => { setPrimarySwimmer(null); setDuplicateSwimmer(null); setMergeStep(1) }} className="ml-auto text-xs text-gray-400 hover:text-red-500">Change</button>
                </div>
              ) : (
                <div className="text-sm text-gray-400 italic">Search and select below...</div>
              )}
            </div>

            {/* Arrow */}
            <div className="flex items-center justify-center text-2xl text-orange-400 pt-6">←</div>

            {/* Duplicate swimmer */}
            <div className="bg-white rounded-lg border p-4">
              <div className="text-xs font-medium text-gray-500 uppercase mb-2">
                {mergeStep === 2 ? 'Step 2: Select DUPLICATE to merge' : 'Duplicate (will be deleted)'}
              </div>
              {duplicateSwimmer ? (
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-sm shrink-0">
                    {duplicateSwimmer.photo ? <img src={duplicateSwimmer.photo} alt="" className="w-full h-full rounded-full object-cover" /> : '👤'}
                  </div>
                  <div>
                    <div className="font-medium">{duplicateSwimmer.name}</div>
                    <div className="text-xs text-gray-500">
                      <CountryFlag code={duplicateSwimmer.nationality_detail?.code} flagUrl={duplicateSwimmer.nationality_detail?.flag_url} name={duplicateSwimmer.nationality_detail?.name} />
                    </div>
                  </div>
                  <button onClick={() => { setDuplicateSwimmer(null) }} className="ml-auto text-xs text-gray-400 hover:text-red-500">Change</button>
                </div>
              ) : (
                <div className="text-sm text-gray-400 italic">{mergeStep === 1 ? 'Select primary first' : 'Search and select below...'}</div>
              )}
            </div>
          </div>

          {/* Search for merge */}
          {(mergeStep === 1 || (mergeStep === 2 && !duplicateSwimmer)) && (
            <div className="mt-4">
              <input
                type="text"
                placeholder={mergeStep === 1 ? 'Search for the swimmer to KEEP...' : 'Search for the DUPLICATE swimmer...'}
                value={mergeSearch}
                onChange={(e) => setMergeSearch(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm"
                autoFocus
              />
              {mergeResults.length > 0 && (
                <div className="mt-2 bg-white border rounded-lg max-h-48 overflow-y-auto divide-y">
                  {mergeResults.filter(s => mergeStep === 1 || s.id !== primarySwimmer?.id).map(s => (
                    <button
                      key={s.id}
                      onClick={() => handleSelectForMerge(s)}
                      className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-3"
                    >
                      <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs shrink-0">
                        {s.photo ? <img src={s.photo} alt="" className="w-full h-full rounded-full object-cover" /> : '👤'}
                      </div>
                      <div>
                        <div className="text-sm font-medium">{s.name}</div>
                        <div className="text-xs text-gray-500">
                          {s.nationality_detail?.name} {s.club ? `• ${s.club}` : ''} • Age {s.age}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Merge button */}
          {primarySwimmer && duplicateSwimmer && (
            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={handleMerge}
                disabled={merging}
                className="bg-orange-600 text-white px-6 py-2 rounded-lg text-sm hover:bg-orange-700 disabled:opacity-50"
              >
                {merging ? 'Merging...' : `Merge "${duplicateSwimmer.name}" into "${primarySwimmer.name}"`}
              </button>
              <span className="text-xs text-gray-500">This will delete "{duplicateSwimmer.name}" and transfer all their data</span>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-4 mb-4">
        <input type="text" placeholder="Search swimmer by name..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        <select value={filterNationality} onChange={(e) => { setFilterNationality(e.target.value); setPage(1) }} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
          <option value="">All Countries</option>
          {countries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={filterSex} onChange={(e) => { setFilterSex(e.target.value); setPage(1) }} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
          <option value="">All</option>
          <option value="M">Male</option>
          <option value="F">Female</option>
        </select>
      </div>
      <DataTable columns={columns} data={swimmers} onRowClick={(row) => navigate(`/swimmers/${row.id}`)} />
      {pagination.count > 0 && <Pagination {...pagination} currentPage={page} onPageChange={setPage} pageSize={50} />}
    </div>
  )
}
