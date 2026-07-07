import { useState, useEffect } from 'react'
import { uploadFile, matchSwimmers, confirmImport } from '../api/importer'
import { getCountries } from '../api/core'
import { getClassifications, getSubClassifications } from '../api/championships'
import { POOL_TYPES } from '../utils/constants'
import EditableResultsTable from '../components/import/EditableResultsTable'
import ManualEntryForm from '../components/import/ManualEntryForm'

const MAX_FILES = 10

const emptyForm = {
  name: '', date: '', end_date: '', pool: 'LCM', country: '',
  location: '', classification: '', sub_classification: '',
}

export default function ImportPage() {
  const [importMethod, setImportMethod] = useState(null) // null, 'pdf', 'excel', 'html', 'manual'
  const [step, setStep] = useState(0) // 0=method, 1=upload, 2=details+edit, 3=match, 4=done
  const [loading, setLoading] = useState(false)
  const [loadingMsg, setLoadingMsg] = useState('')
  const [error, setError] = useState('')

  // Each uploaded file becomes one "meet" with its own import session
  // { fileName, importId, preview, editedPreview, meetWarnings, champForm,
  //   matches, matchStats, decisions, result, confirmError }
  const [meets, setMeets] = useState([])
  const [active, setActive] = useState(0)

  // Reference data
  const [countries, setCountries] = useState([])
  const [classifications, setClassifications] = useState([])
  const [subClassifications, setSubClassifications] = useState([])

  const meet = meets[active] || null

  const updateMeet = (idx, patch) =>
    setMeets(prev => prev.map((m, i) => (i === idx ? { ...m, ...patch } : m)))

  const setChampForm = (patch) =>
    updateMeet(active, { champForm: { ...meet.champForm, ...patch } })

  useEffect(() => {
    getCountries().then(res => setCountries(res.data)).catch(() => {})
    getClassifications().then(res => setClassifications(res.data)).catch(() => {})
  }, [])

  const activeClassification = meet?.champForm?.classification
  useEffect(() => {
    if (activeClassification) {
      getSubClassifications(activeClassification).then(res => setSubClassifications(res.data)).catch(() => {})
    } else {
      setSubClassifications([])
    }
  }, [activeClassification])

  const selectMethod = (method) => {
    setImportMethod(method)
    setStep(1)
  }

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    if (files.length > MAX_FILES) {
      setError(`You can import at most ${MAX_FILES} files at once — only the first ${MAX_FILES} will be used.`)
      files.length = MAX_FILES
    } else {
      setError('')
    }

    setLoading(true)
    const parsed = []
    const failures = []
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      setLoadingMsg(files.length > 1 ? `Parsing ${i + 1} / ${files.length}: ${file.name}` : 'Parsing...')
      try {
        const formData = new FormData()
        formData.append('file', file)
        const res = await uploadFile(formData)
        const m = res.data.meet
        const inferredCountry = countries.find(c => c.code === m.inferred_country)
        parsed.push({
          fileName: file.name,
          importId: res.data.import_id,
          preview: res.data,
          editedPreview: res.data,
          meetWarnings: res.data.meet_warnings || [],
          champForm: {
            ...emptyForm,
            name: m.name || '',
            date: m.date || _formatDateForInput(m.date) || '',
            end_date: m.date_end || '',
            pool: m.pool || 'LCM',
            country: inferredCountry?.id?.toString() || '',
            location: m.location || '',
          },
          matches: [], matchStats: {}, decisions: {}, result: null, confirmError: '',
        })
      } catch (err) {
        failures.push(`${file.name}: ${err.response?.data?.error || 'failed to parse'}`)
      }
    }
    setLoading(false)
    setLoadingMsg('')

    if (!parsed.length) {
      setError(failures.join(' \u2022 ') || 'Failed to parse file')
      return
    }
    if (failures.length) {
      setError(`Some files could not be parsed: ${failures.join(' \u2022 ')}`)
    }
    setMeets(parsed)
    setActive(0)
    setStep(2)
  }

  const formComplete = (m) => m.champForm.name && m.champForm.country && m.champForm.date
  const allFormsComplete = meets.every(formComplete)

  const handleMatch = async () => {
    setLoading(true)
    setError('')
    try {
      const updated = [...meets]
      for (let i = 0; i < updated.length; i++) {
        setLoadingMsg(updated.length > 1 ? `Matching swimmers ${i + 1} / ${updated.length}...` : 'Matching Swimmers...')
        const res = await matchSwimmers(updated[i].importId)
        const auto = {}
        for (const m of res.data.matches) {
          if (m.match_type === 'exact' || (m.match_type === 'fuzzy' && m.confidence >= 92)) {
            auto[m.parsed_name] = { action: 'match', swimmer_id: m.matched_swimmer?.id }
          } else {
            auto[m.parsed_name] = { action: 'create' }
          }
        }
        updated[i] = { ...updated[i], matches: res.data.matches, matchStats: res.data.stats, decisions: auto }
      }
      setMeets(updated)
      setActive(0)
      setStep(3)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to match swimmers')
    } finally {
      setLoading(false)
      setLoadingMsg('')
    }
  }

  const handleConfirm = async () => {
    setLoading(true)
    setError('')
    const updated = [...meets]
    let anyOk = false
    for (let i = 0; i < updated.length; i++) {
      const m = updated[i]
      setLoadingMsg(updated.length > 1 ? `Importing ${i + 1} / ${updated.length}: ${m.champForm.name}` : 'Importing...')
      try {
        const payload = {
          import_id: m.importId,
          swimmer_decisions: m.decisions,
          championship_details: m.champForm,
        }
        if (m.editedPreview && m.editedPreview !== m.preview) {
          payload.modified_preview = m.editedPreview
        }
        const res = await confirmImport(payload)
        updated[i] = { ...m, result: res.data, confirmError: '' }
        anyOk = true
      } catch (err) {
        updated[i] = { ...m, confirmError: err.response?.data?.error || 'Failed to import' }
      }
    }
    setMeets(updated)
    setLoading(false)
    setLoadingMsg('')
    if (anyOk) {
      setStep(4)
    } else {
      setError(updated.map(m => m.confirmError).filter(Boolean).join(' \u2022 '))
    }
  }

  const updateDecision = (name, action, swimmerId) => {
    updateMeet(active, {
      decisions: { ...meet.decisions, [name]: { action, swimmer_id: swimmerId } },
    })
  }

  const resetAll = () => {
    setImportMethod(null)
    setStep(0)
    setMeets([])
    setActive(0)
    setError('')
  }

  const fileStepLabels = ['Method', 'Upload File', 'Review & Edit', 'Match Swimmers', 'Done']
  const manualStepLabels = ['Method', 'Enter Data', 'Done']
  const stepLabels = importMethod === 'manual' ? manualStepLabels : fileStepLabels

  const acceptTypes = importMethod === 'pdf' ? '.pdf' : importMethod === 'excel' ? '.xlsx,.xls,.csv' : importMethod === 'html' ? '.html,.htm' : '.pdf,.html,.htm,.xlsx,.xls,.csv'
  const allowMultiple = importMethod === 'excel'

  // Tab bar for switching between uploaded meets (steps 2-4)
  const meetTabs = meets.length > 1 && (
    <div className="flex flex-wrap gap-2 mb-4">
      {meets.map((m, i) => (
        <button key={m.importId} onClick={() => setActive(i)}
          className={`px-3 py-1.5 rounded-lg text-sm border transition-colors flex items-center gap-1.5 ${
            i === active
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
          }`}>
          <span className={`w-5 h-5 rounded-full text-xs flex items-center justify-center font-bold ${
            i === active ? 'bg-white/20' : 'bg-gray-100'
          }`}>{i + 1}</span>
          <span className="max-w-[160px] truncate">{m.champForm.name || m.fileName}</span>
          {step === 2 && !formComplete(m) && <span className="w-2 h-2 rounded-full bg-red-400" title="Missing required fields" />}
          {step === 2 && formComplete(m) && <span className={i === active ? 'text-white' : 'text-green-600'}>{'\u2713'}</span>}
          {step === 4 && (m.result ? <span className="text-green-500">{'\u2713'}</span> : <span className="text-red-500">{'\u2715'}</span>)}
        </button>
      ))}
    </div>
  )

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Import Results</h1>

      {/* Progress Steps */}
      <div className="flex items-center gap-2 mb-8">
        {stepLabels.map((label, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
              step > i ? 'bg-green-500 text-white' :
              step === i ? 'bg-blue-600 text-white' :
              'bg-gray-200 text-gray-500'
            }`}>
              {step > i ? '\u2713' : i + 1}
            </div>
            <span className={`text-sm ${step === i ? 'font-semibold' : 'text-gray-500'}`}>{label}</span>
            {i < stepLabels.length - 1 && <div className="w-8 h-0.5 bg-gray-200" />}
          </div>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 p-4 rounded-lg mb-4">{error}</div>
      )}

      {/* Step 0: Method Selection */}
      {step === 0 && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <button onClick={() => selectMethod('pdf')}
            className="bg-white rounded-lg border p-8 text-center hover:border-blue-500 hover:shadow-md transition-all group">
            <div className="text-5xl mb-4">&#x1F4C4;</div>
            <h2 className="text-lg font-semibold mb-2 group-hover:text-blue-600">Upload PDF</h2>
            <p className="text-sm text-gray-500">Import from PDF files (Splash, HY-TEK, FRMN)</p>
          </button>

          <button onClick={() => selectMethod('excel')}
            className="bg-white rounded-lg border p-8 text-center hover:border-green-500 hover:shadow-md transition-all group">
            <div className="text-5xl mb-4">&#x1F4CA;</div>
            <h2 className="text-lg font-semibold mb-2 group-hover:text-green-600">Upload Excel</h2>
            <p className="text-sm text-gray-500">Import from Excel or CSV files — up to {MAX_FILES} meets at once</p>
          </button>

          <button onClick={() => selectMethod('html')}
            className="bg-white rounded-lg border p-8 text-center hover:border-orange-500 hover:shadow-md transition-all group">
            <div className="text-5xl mb-4">&#x1F310;</div>
            <h2 className="text-lg font-semibold mb-2 group-hover:text-orange-600">Upload HTML</h2>
            <p className="text-sm text-gray-500">Import from HTML files (Nat'2i Tunisia format)</p>
          </button>

          <button onClick={() => selectMethod('manual')}
            className="bg-white rounded-lg border p-8 text-center hover:border-purple-500 hover:shadow-md transition-all group">
            <div className="text-5xl mb-4">&#x270D;&#xFE0F;</div>
            <h2 className="text-lg font-semibold mb-2 group-hover:text-purple-600">Manual Entry</h2>
            <p className="text-sm text-gray-500">Add individual results manually by searching athletes</p>
          </button>
        </div>
      )}

      {/* Step 1: Upload (PDF/Excel/HTML) */}
      {step === 1 && importMethod !== 'manual' && (
        <div className="bg-white rounded-lg border p-8 text-center">
          <div className="text-6xl mb-4">{importMethod === 'pdf' ? '\uD83D\uDCC4' : importMethod === 'html' ? '\uD83C\uDF10' : '\uD83D\uDCCA'}</div>
          <h2 className="text-lg font-semibold mb-2">
            Upload {importMethod === 'pdf' ? 'PDF' : importMethod === 'html' ? 'HTML' : 'Excel/CSV'} File{allowMultiple ? 's' : ''}
          </h2>
          <p className="text-gray-500 mb-6">
            {importMethod === 'pdf'
              ? 'Supports Splash, HY-TEK, FRMN and other PDF formats'
              : importMethod === 'html'
              ? "Supports Nat'2i HTML format (Tunisia)"
              : `Supports .xlsx, .xls, and .csv files — select up to ${MAX_FILES} files, one meet per file`}
          </p>
          <label className={`inline-block bg-blue-600 text-white px-6 py-3 rounded-lg cursor-pointer hover:bg-blue-700 ${loading ? 'opacity-50 pointer-events-none' : ''}`}>
            {loading ? (loadingMsg || 'Parsing...') : `Choose File${allowMultiple ? 's' : ''}`}
            <input type="file" accept={acceptTypes} multiple={allowMultiple} onChange={handleUpload} className="hidden" disabled={loading} />
          </label>
          <div className="mt-4">
            <button onClick={resetAll} className="text-sm text-gray-500 hover:text-gray-700">&larr; Back to method selection</button>
          </div>
        </div>
      )}

      {/* Step 1: Manual Entry */}
      {step === 1 && importMethod === 'manual' && (
        <div>
          <div className="mb-4">
            <button onClick={resetAll} className="text-sm text-gray-500 hover:text-gray-700">&larr; Back to method selection</button>
          </div>
          <ManualEntryForm onComplete={resetAll} />
        </div>
      )}

      {/* Step 2: Championship Details + Editable Results */}
      {step === 2 && meet && meet.editedPreview && (
        <div>
          {meetTabs}

          {/* Meet warnings */}
          {meet.meetWarnings.length > 0 && (
            <div className="mb-4 space-y-2">
              {meet.meetWarnings.map((w, i) => (
                <div key={i} className={`p-4 rounded-lg border ${
                  w.type === 'exact_duplicate' ? 'bg-red-50 border-red-300 text-red-800' :
                  w.type === 'partial_new' ? 'bg-yellow-50 border-yellow-300 text-yellow-800' :
                  w.type === 'different_pool' ? 'bg-blue-50 border-blue-300 text-blue-800' :
                  'bg-gray-50 border-gray-300 text-gray-700'
                }`}>
                  <div className="flex items-start gap-2">
                    <span className="text-lg mt-0.5">{
                      w.type === 'exact_duplicate' ? '\u26A0\uFE0F' :
                      w.type === 'partial_new' ? '\uD83D\uDFE1' :
                      '\u2139\uFE0F'
                    }</span>
                    <div>
                      <div className="font-semibold text-sm mb-1">{
                        w.type === 'exact_duplicate' ? 'Duplicate Meet Detected' :
                        w.type === 'partial_new' ? 'Existing Meet — New Events Found' :
                        w.type === 'different_pool' ? 'Same Meet, Different Pool' :
                        'Similar Meet Found'
                      }</div>
                      <div className="text-sm">{w.message}</div>
                      <div className="text-xs mt-1 opacity-75">
                        Existing: {w.db_results} results, {w.db_events} events, {w.db_swimmers} swimmers
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Stats bar */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-blue-50 p-3 rounded-lg text-center">
              <div className="text-2xl font-bold text-blue-600">{meet.editedPreview.stats.total_swimmers}</div>
              <div className="text-xs text-gray-500">Swimmers</div>
            </div>
            <div className="bg-green-50 p-3 rounded-lg text-center">
              <div className="text-2xl font-bold text-green-600">{meet.editedPreview.stats.total_results}</div>
              <div className="text-xs text-gray-500">Results</div>
            </div>
            <div className="bg-purple-50 p-3 rounded-lg text-center">
              <div className="text-2xl font-bold text-purple-600">{meet.editedPreview.stats.total_events}</div>
              <div className="text-xs text-gray-500">Events</div>
            </div>
            <div className="bg-gray-50 p-3 rounded-lg text-center">
              <div className="text-sm font-semibold text-gray-700">{meet.editedPreview.meet.format?.toUpperCase()}</div>
              <div className="text-xs text-gray-500">Format Detected</div>
            </div>
          </div>

          {/* Championship details form */}
          <div className="bg-white rounded-lg border p-6 mb-4">
            <h2 className="text-lg font-semibold mb-1">Championship Details</h2>
            <p className="text-sm text-gray-500 mb-4">Review and complete the championship information. Fields marked with * are required.</p>

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium mb-1">Championship Name *</label>
                <input type="text" value={meet.champForm.name}
                  onChange={(e) => setChampForm({ name: e.target.value })}
                  className={`w-full border rounded-lg px-3 py-2 text-sm ${meet.champForm.name ? 'border-green-300 bg-green-50/30' : 'border-red-300 bg-red-50/30'}`}
                  placeholder="e.g. Championnat du Liban 25 M" required />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Country *</label>
                <select value={meet.champForm.country}
                  onChange={(e) => setChampForm({ country: e.target.value })}
                  className={`w-full border rounded-lg px-3 py-2 text-sm ${meet.champForm.country ? 'border-green-300 bg-green-50/30' : 'border-red-300 bg-red-50/30'}`} required>
                  <option value="">Select country</option>
                  {countries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Pool *</label>
                <select value={meet.champForm.pool}
                  onChange={(e) => setChampForm({ pool: e.target.value })}
                  className={`w-full border rounded-lg px-3 py-2 text-sm ${meet.champForm.pool ? 'border-green-300 bg-green-50/30' : ''}`}>
                  {POOL_TYPES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Start Date *</label>
                <input type="date" value={meet.champForm.date}
                  onChange={(e) => setChampForm({ date: e.target.value })}
                  className={`w-full border rounded-lg px-3 py-2 text-sm ${meet.champForm.date ? 'border-green-300 bg-green-50/30' : 'border-red-300 bg-red-50/30'}`} required />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">End Date</label>
                <input type="date" value={meet.champForm.end_date}
                  onChange={(e) => setChampForm({ end_date: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>

              <div className="col-span-2">
                <label className="block text-sm font-medium mb-1">Location</label>
                <input type="text" value={meet.champForm.location}
                  onChange={(e) => setChampForm({ location: e.target.value })}
                  placeholder="City / Venue"
                  className={`w-full border rounded-lg px-3 py-2 text-sm ${meet.champForm.location ? 'border-green-300 bg-green-50/30' : ''}`} />
              </div>
            </div>

            {/* Classification section */}
            <div className="border-t mt-4 pt-4">
              <h3 className="font-medium mb-3">Classification</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Classification</label>
                  <select value={meet.champForm.classification}
                    onChange={(e) => setChampForm({ classification: e.target.value, sub_classification: '' })}
                    className="w-full border rounded-lg px-3 py-2 text-sm">
                    <option value="">Select...</option>
                    {classifications.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Sub Classification</label>
                  <select value={meet.champForm.sub_classification}
                    onChange={(e) => setChampForm({ sub_classification: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm" disabled={!subClassifications.length}>
                    <option value="">Select...</option>
                    {subClassifications.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Editable Results Table */}
          <div className="mb-4">
            <EditableResultsTable key={meet.importId} preview={meet.editedPreview}
              onPreviewChange={(p) => updateMeet(active, { editedPreview: p })} />
          </div>

          <div className="flex justify-end gap-3 items-center">
            {meets.length > 1 && !allFormsComplete && (
              <span className="text-sm text-amber-600">Complete required fields on every meet tab to continue</span>
            )}
            <button onClick={() => { setStep(1); setMeets([]); setActive(0) }} className="px-4 py-2 border rounded-lg">
              Back
            </button>
            <button onClick={handleMatch}
              disabled={loading || !allFormsComplete}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {loading ? (loadingMsg || 'Matching Swimmers...') : 'Next: Match Swimmers \u2192'}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Match & Confirm */}
      {step === 3 && meet && (
        <div>
          {meetTabs}

          <div className="bg-white rounded-lg border p-6 mb-4">
            <h2 className="text-lg font-semibold mb-4">
              Swimmer Matching{meets.length > 1 ? ` — ${meet.champForm.name || meet.fileName}` : ''}
            </h2>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="bg-green-50 p-3 rounded-lg text-center">
                <div className="text-xl font-bold text-green-600">{meet.matchStats.exact_matches || 0}</div>
                <div className="text-xs text-gray-500">Exact Matches</div>
              </div>
              <div className="bg-yellow-50 p-3 rounded-lg text-center">
                <div className="text-xl font-bold text-yellow-600">{meet.matchStats.fuzzy_matches || 0}</div>
                <div className="text-xs text-gray-500">Fuzzy Matches</div>
              </div>
              <div className="bg-blue-50 p-3 rounded-lg text-center">
                <div className="text-xl font-bold text-blue-600">{meet.matchStats.new_swimmers || 0}</div>
                <div className="text-xs text-gray-500">New Swimmers</div>
              </div>
            </div>
          </div>

          {/* Matches table */}
          <div className="bg-white rounded-lg border overflow-hidden mb-4">
            <div className="max-h-[500px] overflow-y-auto">
              <table className="w-full">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Parsed Name</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Match</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Confidence</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {meet.matches.map((m, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-sm">
                        <div className="font-medium">{m.parsed_name}</div>
                        <div className="text-xs text-gray-400">
                          {m.nationality_code && <span className="mr-2">{m.nationality_code}</span>}
                          {m.birth_year > 0 && <span>Born {m.birth_year}</span>}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-sm">
                        {m.matched_swimmer ? (
                          <div>
                            <div>{m.matched_swimmer.name}</div>
                            <div className="text-xs text-gray-400">{m.matched_swimmer.nationality}</div>
                          </div>
                        ) : (
                          <span className="text-gray-400 italic">No match</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-sm">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          m.confidence >= 90 ? 'bg-green-100 text-green-700' :
                          m.confidence >= 75 ? 'bg-yellow-100 text-yellow-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {m.confidence}%
                        </span>
                      </td>
                      <td className="px-4 py-2 text-sm">
                        <select value={meet.decisions[m.parsed_name]?.action || 'create'}
                          onChange={(e) => updateDecision(m.parsed_name, e.target.value,
                            e.target.value === 'match' ? m.matched_swimmer?.id : undefined)}
                          className="border rounded px-2 py-1 text-sm">
                          {m.matched_swimmer && (
                            <option value="match">Use existing: {m.matched_swimmer.name}</option>
                          )}
                          <option value="create">Create new swimmer</option>
                          <option value="skip">Skip</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <button onClick={() => setStep(2)} className="px-4 py-2 border rounded-lg">Back</button>
            <button onClick={handleConfirm} disabled={loading}
              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
              {loading ? (loadingMsg || 'Importing...')
                : meets.length > 1 ? `Confirm Import (${meets.length} meets) \u2713` : 'Confirm Import \u2713'}
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Done */}
      {step === 4 && (
        <div>
          {meetTabs}
          {meets.map((m, i) => (meets.length === 1 || i === active) && (
            <div key={m.importId} className="bg-white rounded-lg border p-8 text-center mb-4">
              {m.result ? (
                <>
                  <div className="text-6xl mb-4">&#x2705;</div>
                  <h2 className="text-xl font-semibold mb-4">
                    Import Complete{meets.length > 1 ? `: ${m.result.championship_name}` : '!'}
                  </h2>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-2xl mx-auto mb-6">
                    <div className="bg-green-50 p-3 rounded-lg">
                      <div className="text-xl font-bold text-green-600">{m.result.created_results}</div>
                      <div className="text-xs">Results Created</div>
                    </div>
                    <div className="bg-blue-50 p-3 rounded-lg">
                      <div className="text-xl font-bold text-blue-600">{m.result.created_swimmers}</div>
                      <div className="text-xs">New Swimmers</div>
                    </div>
                    <div className="bg-purple-50 p-3 rounded-lg">
                      <div className="text-xl font-bold text-purple-600">{m.result.matched_swimmers}</div>
                      <div className="text-xs">Matched Swimmers</div>
                    </div>
                    <div className="bg-gray-50 p-3 rounded-lg">
                      <div className="text-xl font-bold text-gray-600">{m.result.skipped_results}</div>
                      <div className="text-xs">Skipped (duplicates)</div>
                    </div>
                  </div>
                  <p className="text-sm text-gray-500 mb-4">Championship: {m.result.championship_name}</p>

                  {m.result.skipped_details && m.result.skipped_details.length > 0 && (
                    <details className="text-left max-w-2xl mx-auto mb-4">
                      <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700 font-medium">
                        View {m.result.skipped_details.length} skipped result{m.result.skipped_details.length !== 1 ? 's' : ''}
                      </summary>
                      <div className="mt-2 border rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Swimmer</th>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Event</th>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Round</th>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Reason</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {m.result.skipped_details.map((s, j) => (
                              <tr key={j} className="text-xs">
                                <td className="px-3 py-1.5 font-medium">{s.swimmer}</td>
                                <td className="px-3 py-1.5">{s.event}</td>
                                <td className="px-3 py-1.5">{s.round || '-'}</td>
                                <td className="px-3 py-1.5 text-gray-500">{s.reason}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  )}
                </>
              ) : (
                <>
                  <div className="text-6xl mb-4">&#x274C;</div>
                  <h2 className="text-xl font-semibold mb-2">Import Failed: {m.champForm.name || m.fileName}</h2>
                  <p className="text-sm text-red-600 mb-4">{m.confirmError}</p>
                </>
              )}
            </div>
          ))}
          <div className="text-center">
            <button onClick={resetAll} className="px-6 py-2 bg-blue-600 text-white rounded-lg">
              Import Another File
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function _formatDateForInput(dateStr) {
  if (!dateStr) return ''
  const m1 = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (m1) return `${m1[3]}-${m1[2].padStart(2, '0')}-${m1[1].padStart(2, '0')}`
  const m2 = dateStr.match(/(\d{1,2})-(\d{1,2})-(\d{4})/)
  if (m2) return `${m2[3]}-${m2[2].padStart(2, '0')}-${m2[1].padStart(2, '0')}`
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr
  return ''
}
