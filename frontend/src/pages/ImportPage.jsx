import { useState, useEffect } from 'react'
import {
  Check, X, FileText, FileSpreadsheet, Globe, PenLine, Upload,
  AlertTriangle, Info, Users, ListChecks, CalendarDays, CheckCircle2, XCircle,
} from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { uploadFile, matchSwimmers, confirmImport } from '../api/importer'
import { getCountries } from '../api/core'
import { getChampionships, getClassifications, getSubClassifications, getResultsBySwimmer, bulkDeleteResults } from '../api/championships'
import { POOL_TYPES, ARAB_COUNTRY_CODES } from '../utils/constants'
import EditableResultsTable from '../components/import/EditableResultsTable'
import ManualEntryForm from '../components/import/ManualEntryForm'
import { Button, Card, Badge, Input, Select, FieldLabel, StatCard, PageHeader, ConfirmDialog } from '../components/ui'

const MAX_FILES = 200

const emptyForm = {
  name: '', date: '', end_date: '', pool: 'LCM', country: '',
  location: '', classification: '', sub_classification: '',
}

export default function ImportPage() {
  const [searchParams] = useSearchParams()
  // Pre-selected target meet (e.g. arriving from a meet's "Import File" button)
  const presetChampId = searchParams.get('championship') || ''
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
  const [existingMeets, setExistingMeets] = useState([])

  const meet = meets[active] || null

  const updateMeet = (idx, patch) =>
    setMeets(prev => prev.map((m, i) => (i === idx ? { ...m, ...patch } : m)))

  const setChampForm = (patch) =>
    updateMeet(active, { champForm: { ...meet.champForm, ...patch } })

  useEffect(() => {
    getCountries().then(res => setCountries(res.data)).catch(() => {})
    getClassifications().then(res => setClassifications(res.data)).catch(() => {})
    // Existing meets (incl. future/calendar-only) so files can be imported
    // into a manually created meet instead of always creating a new one
    getChampionships({ page_size: 1000, ordering: '-date', include_calendar_only: 1 })
      .then(res => setExistingMeets(res.data?.results || res.data || []))
      .catch(() => {})
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

    const buildMeetEntry = (fileName, meetData) => {
      const m = meetData.meet
      const inferredCountry = countries.find(c => c.code === m.inferred_country)
      return {
        fileName,
        importId: meetData.import_id,
        preview: meetData,
        editedPreview: meetData,
        meetWarnings: meetData.meet_warnings || [],
        champForm: {
          ...emptyForm,
          name: m.name || '',
          date: m.date || _formatDateForInput(m.date) || '',
          end_date: m.date_end || '',
          pool: m.pool || 'LCM',
          country: inferredCountry?.id?.toString() || '',
          location: m.location || '',
        },
        arabOnly: false,
        existingChampId: presetChampId,
        matches: [], matchStats: {}, decisions: {}, result: null, confirmError: '',
      }
    }

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      setLoadingMsg(files.length > 1 ? `Parsing ${i + 1} / ${files.length}: ${file.name}` : 'Parsing...')
      try {
        const formData = new FormData()
        formData.append('file', file)
        const res = await uploadFile(formData)

        if (res.data.meets) {
          // Multi-meet Excel: one file produced multiple meets
          for (const meetData of res.data.meets) {
            const label = res.data.meets.length > 1
              ? `${file.name} — ${meetData.meet.name}`
              : file.name
            parsed.push(buildMeetEntry(label, meetData))
          }
        } else {
          // Single meet
          parsed.push(buildMeetEntry(file.name, res.data))
        }
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

  const toggleArabOnly = (idx) => {
    const m = meets[idx]
    const newVal = !m.arabOnly
    if (newVal) {
      // Filter to Arab swimmers only
      const filtered = {
        ...m.editedPreview,
        events: m.editedPreview.events.map(ev => ({
          ...ev,
          results: ev.results.filter(r =>
            ev.is_relay || ARAB_COUNTRY_CODES.has((r.nationality_code || '').toUpperCase())
          ),
        })).filter(ev => ev.results.length > 0),
      }
      filtered.stats = {
        ...filtered.stats,
        total_results: filtered.events.reduce((s, ev) => s + ev.results.length, 0),
        total_events: filtered.events.length,
      }
      updateMeet(idx, { arabOnly: true, editedPreview: filtered, _fullPreview: m.editedPreview })
    } else {
      // Restore full preview
      updateMeet(idx, { arabOnly: false, editedPreview: m._fullPreview || m.preview })
    }
  }

  const formComplete = (m) => !!m.existingChampId || (m.champForm.name && m.champForm.country && m.champForm.date)
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
        }
        if (m.existingChampId) {
          payload.championship_id = Number(m.existingChampId)
        } else {
          payload.championship_details = m.champForm
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
          className={`min-h-10 px-3 py-1.5 rounded-sm text-body-sm border transition-colors flex items-center gap-1.5 ${
            i === active
              ? 'bg-aqua-600 text-white border-aqua-600'
              : 'bg-white text-ink-700 border-ink-200 hover:border-aqua-500/40'
          }`}>
          <span className={`w-5 h-5 rounded-full text-label flex items-center justify-center ${
            i === active ? 'bg-white/20' : 'bg-ink-50'
          }`}>{i + 1}</span>
          <span className="max-w-[160px] truncate">{m.champForm.name || m.fileName}</span>
          {step === 2 && !formComplete(m) && <span className="w-2 h-2 rounded-full bg-neg" title="Missing required fields" />}
          {step === 2 && formComplete(m) && <Check size={14} className={i === active ? 'text-white' : 'text-pos'} />}
          {step === 4 && (m.result
            ? <Check size={14} className={i === active ? 'text-white' : 'text-pos'} />
            : <X size={14} className={i === active ? 'text-white' : 'text-neg'} />)}
        </button>
      ))}
    </div>
  )

  return (
    <div className="max-w-5xl mx-auto">
      <PageHeader title="Import Results" subtitle="Bring meet results in from PDF, Excel, HTML or manual entry" />

      {/* Wizard step indicator */}
      <div className="flex items-center gap-2 mb-4 sm:mb-5 overflow-x-auto scrollbar-hide pb-1" aria-label="Import progress">
        {stepLabels.map((label, i) => (
          <div key={i} className="flex items-center gap-2 shrink-0">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-body-sm font-bold tnum ${
              step > i ? 'bg-pos text-white' :
              step === i ? 'bg-aqua-600 text-white' :
              'bg-ink-200 text-ink-500'
            }`}>
              {step > i ? <Check size={16} /> : i + 1}
            </div>
            <span className={`text-body-sm whitespace-nowrap ${step === i ? 'font-semibold text-ink-900' : 'text-ink-400'}`}>{label}</span>
            {i < stepLabels.length - 1 && <div className={`w-8 h-0.5 ${step > i ? 'bg-pos' : 'bg-ink-100'}`} />}
          </div>
        ))}
      </div>

      {error && (
        <div className="flex items-start gap-2.5 bg-neg/10 text-neg p-4 rounded-md mb-4 text-body-sm">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Step 0: Method Selection */}
      {step === 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          {[
            { key: 'pdf', icon: FileText, title: 'Upload PDF', hint: 'Import from PDF files (Splash, HY-TEK, FRMN)' },
            { key: 'excel', icon: FileSpreadsheet, title: 'Upload Excel', hint: `Import from Excel or CSV files — up to ${MAX_FILES} meets at once` },
            { key: 'html', icon: Globe, title: 'Upload HTML', hint: "Import from HTML files (Nat'2i Tunisia format)" },
            { key: 'manual', icon: PenLine, title: 'Manual Entry', hint: 'Add individual results manually by searching athletes' },
          ].map(({ key, icon: Icon, title, hint }) => (
            <button key={key} onClick={() => selectMethod(key)}
              className="bg-white rounded-md border border-ink-100 shadow-card p-4 sm:p-5 text-center transition-colors hover:border-aqua-500/40 hover:bg-aqua-50/40 group">
              <span className="mx-auto mb-4 w-12 h-12 rounded-full bg-aqua-50 text-aqua-600 flex items-center justify-center">
                <Icon size={24} />
              </span>
              <h2 className="text-title text-ink-900 mb-2 group-hover:text-aqua-600 transition-colors">{title}</h2>
              <p className="text-body-sm text-ink-400">{hint}</p>
            </button>
          ))}
        </div>
      )}

      {/* Step 1: Upload (PDF/Excel/HTML) */}
      {step === 1 && importMethod !== 'manual' && (
        <Card padding="none">
          <div className="m-3 sm:m-4 md:m-6 rounded-md border-2 border-dashed border-aqua-500/40 bg-aqua-50/50 p-5 sm:p-8 md:p-12 text-center">
            <span className="mx-auto mb-4 w-14 h-14 rounded-full bg-white text-aqua-600 shadow-card flex items-center justify-center">
              <Upload size={26} />
            </span>
            <h2 className="text-title text-ink-900 mb-2">
              Upload {importMethod === 'pdf' ? 'PDF' : importMethod === 'html' ? 'HTML' : 'Excel/CSV'} File{allowMultiple ? 's' : ''}
            </h2>
            <p className="text-body-sm text-ink-500 mb-6 max-w-md mx-auto">
              {importMethod === 'pdf'
                ? 'Supports Splash, HY-TEK, FRMN and other PDF formats'
                : importMethod === 'html'
                ? "Supports Nat'2i HTML format (Tunisia)"
                : `Supports .xlsx, .xls, and .csv files — select up to ${MAX_FILES} files, one meet per file`}
            </p>
            <label className={`inline-flex items-center justify-center gap-2 min-h-10 bg-aqua-600 text-white px-6 py-2.5 rounded-sm text-body-sm font-medium cursor-pointer hover:bg-aqua-500 transition-colors ${loading ? 'opacity-50 pointer-events-none' : ''}`}>
              <Upload size={16} />
              {loading ? (loadingMsg || 'Parsing...') : `Choose File${allowMultiple ? 's' : ''}`}
              <input type="file" accept={acceptTypes} multiple={allowMultiple} onChange={handleUpload} className="hidden" disabled={loading} />
            </label>
            <div className="mt-5">
              <Button variant="ghost" size="sm" onClick={resetAll}>Back to method selection</Button>
            </div>
          </div>
        </Card>
      )}

      {/* Step 1: Manual Entry */}
      {step === 1 && importMethod === 'manual' && (
        <div>
          <div className="mb-4">
            <Button variant="ghost" size="sm" onClick={resetAll}>Back to method selection</Button>
          </div>
          <ManualEntryForm onComplete={resetAll} />
        </div>
      )}

      {/* Step 2: Championship Details + Editable Results */}
      {step === 2 && meet && meet.editedPreview && (
        <div>
          {meetTabs}

          {/* Arab Only Toggle — TOP of page, big and clear */}
          <button type="button"
            className={`w-full mb-4 p-4 sm:p-5 rounded-md border-2 text-center cursor-pointer select-none transition-colors ${
              meet.arabOnly
                ? 'bg-pos/10 border-pos'
                : 'bg-white border-ink-200 hover:border-aqua-500/40'
            }`} onClick={() => toggleArabOnly(active)}>
            <div className="flex items-center justify-center gap-3">
              <span className={`w-8 h-8 rounded-sm flex items-center justify-center text-white ${
                meet.arabOnly ? 'bg-pos' : 'bg-ink-400'
              }`}>
                {meet.arabOnly ? <Check size={18} /> : <X size={18} />}
              </span>
              <span className={`text-title ${meet.arabOnly ? 'text-pos' : 'text-ink-900'}`}>
                {meet.arabOnly ? 'Arab Swimmers Only — ON' : 'Importing ALL Swimmers'}
              </span>
            </div>
            <p className={`mt-2 text-body-sm font-medium ${meet.arabOnly ? 'text-pos' : 'text-ink-500'}`}>
              {meet.arabOnly
                ? `Filtered: only Arab/GCC swimmers kept (${meet.editedPreview.stats.total_results} results)`
                : 'Click here to import ONLY Arab/GCC swimmers from this meet'}
            </p>
          </button>

          {/* Meet warnings */}
          {meet.meetWarnings.length > 0 && (
            <div className="mb-4 space-y-2">
              {meet.meetWarnings.map((w, i) => {
                const isDup = w.type === 'exact_duplicate'
                return (
                  <div key={i} className={`p-4 rounded-md border text-body-sm ${
                    isDup ? 'bg-neg/5 border-neg/40 text-neg' : 'bg-ink-50 border-ink-200 text-ink-700'
                  }`}>
                    <div className="flex items-start gap-2.5">
                      {isDup
                        ? <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                        : <Info size={16} className="shrink-0 mt-0.5 text-ink-400" />}
                      <div>
                        <div className="font-semibold mb-1">{
                          w.type === 'exact_duplicate' ? 'Duplicate Meet Detected' :
                          w.type === 'partial_new' ? 'Existing Meet — New Events Found' :
                          w.type === 'different_pool' ? 'Same Meet, Different Pool' :
                          'Similar Meet Found'
                        }</div>
                        <div>{w.message}</div>
                        <div className="text-body-sm mt-1 opacity-75 tnum">
                          Existing: {w.db_results} results, {w.db_events} events, {w.db_swimmers} swimmers
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Stats bar */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 md:gap-4 mb-4 sm:mb-6">
            <StatCard label="Swimmers" value={meet.editedPreview.stats.total_swimmers} icon={Users} />
            <StatCard label="Results" value={meet.editedPreview.stats.total_results} icon={ListChecks} />
            <StatCard label="Events" value={meet.editedPreview.stats.total_events} icon={CalendarDays} />
            <StatCard label="Format Detected" value={meet.editedPreview.meet.format?.toUpperCase()} icon={FileText} />
          </div>

          {/* Championship details form */}
          <Card title="Championship Details" className="mb-4">
            <p className="text-body-sm text-ink-400 mb-4">Review and complete the championship information. Fields marked with * are required.</p>

            {/* Target meet: create new or add into an existing one */}
            <div className="mb-4 bg-aqua-500/5 border border-aqua-500/30 rounded-md p-3">
              <FieldLabel>Import into</FieldLabel>
              <Select
                value={meet.existingChampId}
                onChange={(e) => updateMeet(active, { existingChampId: e.target.value })}
              >
                <option value="">New championship — fill the form below</option>
                {existingMeets.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.date}{c.results_count ? `, ${c.results_count} results` : ', no results yet'})
                  </option>
                ))}
              </Select>
              {meet.existingChampId && (
                <p className="text-caption text-ink-400 mt-1.5">
                  Supplementary data will be merged into this meet. New results are added, existing swimmers are matched by name, and duplicates are skipped automatically.
                </p>
              )}
            </div>

            {!meet.existingChampId && (
            <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div className="sm:col-span-2">
                <FieldLabel required>Championship Name</FieldLabel>
                <Input type="text" value={meet.champForm.name}
                  onChange={(e) => setChampForm({ name: e.target.value })}
                  className={meet.champForm.name ? 'border-pos/40' : 'border-neg/40'}
                  placeholder="e.g. Championnat du Liban 25 M" required />
              </div>

              <div>
                <FieldLabel required>Country</FieldLabel>
                <Select value={meet.champForm.country}
                  onChange={(e) => setChampForm({ country: e.target.value })}
                  className={meet.champForm.country ? 'border-pos/40' : 'border-neg/40'} required>
                  <option value="">Select country</option>
                  {countries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </div>

              <div>
                <FieldLabel required>Pool</FieldLabel>
                <Select value={meet.champForm.pool}
                  onChange={(e) => setChampForm({ pool: e.target.value })}
                  className={meet.champForm.pool ? 'border-pos/40' : ''}>
                  {POOL_TYPES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </Select>
              </div>

              <div>
                <FieldLabel required>Start Date</FieldLabel>
                <Input type="date" value={meet.champForm.date}
                  onChange={(e) => setChampForm({ date: e.target.value })}
                  className={meet.champForm.date ? 'border-pos/40' : 'border-neg/40'} required />
              </div>

              <div>
                <FieldLabel>End Date</FieldLabel>
                <Input type="date" value={meet.champForm.end_date}
                  onChange={(e) => setChampForm({ end_date: e.target.value })} />
              </div>

              <div className="sm:col-span-2">
                <FieldLabel>Location</FieldLabel>
                <Input type="text" value={meet.champForm.location}
                  onChange={(e) => setChampForm({ location: e.target.value })}
                  placeholder="City / Venue"
                  className={meet.champForm.location ? 'border-pos/40' : ''} />
              </div>
            </div>

            {/* Classification section */}
            <div className="border-t border-ink-100 mt-5 pt-4">
              <h3 className="text-body font-semibold text-ink-900 mb-3">Classification</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <FieldLabel>Classification</FieldLabel>
                  <Select value={meet.champForm.classification}
                    onChange={(e) => setChampForm({ classification: e.target.value, sub_classification: '' })}>
                    <option value="">Select...</option>
                    {classifications.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                </div>
                <div>
                  <FieldLabel>Sub Classification</FieldLabel>
                  <Select value={meet.champForm.sub_classification}
                    onChange={(e) => setChampForm({ sub_classification: e.target.value })}
                    disabled={!subClassifications.length}>
                    <option value="">Select...</option>
                    {subClassifications.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                </div>
              </div>
            </div>
            </>
            )}
          </Card>

          {/* Editable Results Table */}
          <div className="mb-4">
            <EditableResultsTable key={meet.importId} preview={meet.editedPreview}
              onPreviewChange={(p) => updateMeet(active, { editedPreview: p })} />
          </div>

          <div className="flex flex-wrap justify-end gap-3 items-center">
            {meets.length > 1 && !allFormsComplete && (
              <span className="text-body-sm text-neg">Complete required fields on every meet tab to continue</span>
            )}
            <Button variant="secondary" onClick={() => { setStep(1); setMeets([]); setActive(0) }}>
              Back
            </Button>
            <Button onClick={handleMatch} disabled={loading || !allFormsComplete} loading={loading}>
              {loading ? (loadingMsg || 'Matching Swimmers...') : 'Next: Match Swimmers'}
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Match & Confirm */}
      {step === 3 && meet && (
        <div>
          {meetTabs}

          <Card title={`Swimmer Matching${meets.length > 1 ? ` — ${meet.champForm.name || meet.fileName}` : ''}`} className="mb-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 md:gap-4">
              <StatCard label="Exact Matches" value={meet.matchStats.exact_matches || 0} icon={CheckCircle2} />
              <StatCard label="Fuzzy Matches" value={meet.matchStats.fuzzy_matches || 0} icon={ListChecks} />
              <StatCard label="New Swimmers" value={meet.matchStats.new_swimmers || 0} icon={Users} />
            </div>
          </Card>

          {/* Matches table */}
          <Card padding="none" className="overflow-hidden mb-4">
            <div className="max-h-[500px] max-w-full overflow-y-auto overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead className="bg-ink-50 sticky top-0 z-10">
                  <tr>
                    <th scope="col" className="px-4 py-2.5 text-start text-label text-ink-400">Parsed Name</th>
                    <th scope="col" className="px-4 py-2.5 text-start text-label text-ink-400">Match</th>
                    <th scope="col" className="px-4 py-2.5 text-start text-label text-ink-400">Confidence</th>
                    <th scope="col" className="px-4 py-2.5 text-start text-label text-ink-400">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {meet.matches.map((m, i) => (
                    <tr key={i} className="hover:bg-ink-50">
                      <td className="px-4 py-2 text-body-sm">
                        <div className="font-medium text-ink-900">{m.parsed_name}</div>
                        <div className="text-body-sm text-ink-400">
                          {m.nationality_code && <span className="me-2">{m.nationality_code}</span>}
                          {m.birth_year > 0 && <span className="tnum">Born {m.birth_year}</span>}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-body-sm">
                        {m.matched_swimmer ? (
                          <div>
                            <div className="text-ink-900">{m.matched_swimmer.name}</div>
                            <div className="text-body-sm text-ink-400">{m.matched_swimmer.nationality}</div>
                          </div>
                        ) : (
                          <span className="text-ink-400 italic">No match</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-body-sm">
                        <Badge variant={m.confidence >= 90 ? 'pos' : m.confidence >= 75 ? 'pool-scm' : 'status'}>
                          <span className="tnum">{m.confidence}%</span>
                        </Badge>
                      </td>
                      <td className="px-4 py-2 text-body-sm">
                        <Select value={meet.decisions[m.parsed_name]?.action || 'create'}
                          onChange={(e) => updateDecision(m.parsed_name, e.target.value,
                            e.target.value === 'match' ? m.matched_swimmer?.id : undefined)}
                          className="h-9 min-w-40">
                          {m.matched_swimmer && (
                            <option value="match">Use existing: {m.matched_swimmer.name}</option>
                          )}
                          <option value="create">Create new swimmer</option>
                          <option value="skip">Skip</option>
                        </Select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setStep(2)}>Back</Button>
            <Button onClick={handleConfirm} disabled={loading} loading={loading} icon={loading ? undefined : Check}>
              {loading ? (loadingMsg || 'Importing...')
                : meets.length > 1 ? `Confirm Import (${meets.length} meets)` : 'Confirm Import'}
            </Button>
          </div>
        </div>
      )}

      {/* Step 4: Done */}
      {step === 4 && (
        <DoneStep meets={meets} active={active} meetTabs={meetTabs} resetAll={resetAll} />
      )}
    </div>
  )
}

function DoneStep({ meets, active, meetTabs, resetAll }) {
  const [cleanupChampId, setCleanupChampId] = useState(null)
  const [swimmers, setSwimmers] = useState([])
  const [selected, setSelected] = useState(new Set())
  const [cleanupLoading, setCleanupLoading] = useState(false)
  const [cleanupDone, setCleanupDone] = useState(null)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)

  const openCleanup = async (champId) => {
    setCleanupChampId(champId)
    setCleanupLoading(true)
    try {
      const res = await getResultsBySwimmer(champId)
      const data = res.data
      setSwimmers(data)
      // Pre-select non-Arab swimmers for deletion
      const nonArab = new Set(data.filter(s => !s.is_arab).map(s => s.swimmer_id))
      setSelected(nonArab)
    } catch { setSwimmers([]) }
    setCleanupLoading(false)
  }

  const toggleSwimmer = (id) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAllNonArab = () => {
    setSelected(new Set(swimmers.filter(s => !s.is_arab).map(s => s.swimmer_id)))
  }

  const deselectAll = () => setSelected(new Set())

  const handleDelete = async () => {
    if (!selected.size) return
    setConfirmDeleteOpen(false)
    setCleanupLoading(true)
    try {
      const res = await bulkDeleteResults(cleanupChampId, [...selected])
      setCleanupDone(res.data)
      // Refresh swimmer list
      const updated = await getResultsBySwimmer(cleanupChampId)
      setSwimmers(updated.data)
      setSelected(new Set())
    } catch { /* error handled by API interceptor */ }
    setCleanupLoading(false)
  }

  return (
    <div>
      {meetTabs}
      {meets.map((m, i) => (meets.length === 1 || i === active) && (
        <Card key={m.importId} className="mb-4">
          {m.result ? (
            <div className="text-center">
              <span className="mx-auto mb-4 w-14 h-14 rounded-full bg-pos/10 text-pos flex items-center justify-center">
                <CheckCircle2 size={28} />
              </span>
              <h2 className="text-title text-ink-900 mb-2">
                {m.existingChampId ? 'Merge Complete!' : meets.length > 1 ? `Import Complete: ${m.result.championship_name}` : 'Import Complete!'}
              </h2>
              {m.existingChampId && (
                <p className="text-body-sm text-ink-500 mb-4">
                  Supplementary data merged into <strong className="text-ink-900">{m.result.championship_name}</strong>
                </p>
              )}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 max-w-2xl mx-auto mb-4 sm:mb-6 text-start">
                <StatCard label={m.existingChampId ? "New Results Added" : "Results Created"} value={m.result.created_results} icon={ListChecks} />
                <StatCard label="New Swimmers" value={m.result.created_swimmers} icon={Users} />
                <StatCard label="Matched Swimmers" value={m.result.matched_swimmers} icon={CheckCircle2} />
                <StatCard label={m.existingChampId ? "Already Existed" : "Skipped (Duplicates)"} value={m.result.skipped_results} icon={XCircle} />
              </div>
              {!m.existingChampId && <p className="text-body-sm text-ink-400 mb-4">Championship: {m.result.championship_name}</p>}

              {m.result.skipped_details && m.result.skipped_details.length > 0 && (
                <details className="text-start max-w-2xl mx-auto mb-4">
                  <summary className="cursor-pointer text-body-sm text-ink-500 hover:text-ink-900 font-medium">
                    View {m.result.skipped_details.length} skipped result{m.result.skipped_details.length !== 1 ? 's' : ''}
                  </summary>
                  <div className="mt-2 max-w-full border border-ink-100 rounded-md overflow-hidden overflow-x-auto">
                    <table className="w-full text-body-sm min-w-[480px]">
                      <thead className="bg-ink-50">
                        <tr>
                          <th scope="col" className="px-3 py-2 text-start text-label text-ink-400">Swimmer</th>
                          <th scope="col" className="px-3 py-2 text-start text-label text-ink-400">Event</th>
                          <th scope="col" className="px-3 py-2 text-start text-label text-ink-400">Round</th>
                          <th scope="col" className="px-3 py-2 text-start text-label text-ink-400">Reason</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-ink-100">
                        {m.result.skipped_details.map((s, j) => (
                          <tr key={j} className="text-body-sm">
                            <td className="px-3 py-1.5 font-medium text-ink-900">{s.swimmer}</td>
                            <td className="px-3 py-1.5">{s.event}</td>
                            <td className="px-3 py-1.5">{s.round || '-'}</td>
                            <td className="px-3 py-1.5 text-ink-400">{s.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              )}

              {/* Cleanup button */}
              {m.result.championship_id && cleanupChampId !== m.result.championship_id && (
                <Button variant="secondary" className="mt-2" onClick={() => openCleanup(m.result.championship_id)}>
                  Clean Up Results (Remove Non-Arab Swimmers)
                </Button>
              )}

              {/* Cleanup panel */}
              {cleanupChampId === m.result.championship_id && (
                <div className="text-start max-w-3xl mx-auto mt-4">
                  {cleanupDone && (
                    <div className="bg-pos/10 border border-pos/30 rounded-md p-3 mb-3 text-body-sm text-pos tnum">
                      Deleted {cleanupDone.deleted_results} results and {cleanupDone.deleted_orphan_swimmers} orphan swimmers.
                    </div>
                  )}
                  <div className="bg-white border border-ink-100 rounded-md overflow-hidden">
                    <div className="bg-ink-50 px-4 py-3 border-b border-ink-100 flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-semibold text-body-sm text-ink-900">Select swimmers to remove</h3>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={selectAllNonArab}>Select non-Arab</Button>
                        <Button variant="ghost" size="sm" onClick={deselectAll}>Deselect all</Button>
                      </div>
                    </div>
                    {cleanupLoading ? (
                      <div className="p-4 text-center text-ink-400 text-body-sm">Loading swimmers...</div>
                    ) : (
                      <div className="max-h-[400px] max-w-full overflow-y-auto overflow-x-auto">
                        <table className="w-full text-body-sm min-w-[520px]">
                          <thead className="bg-ink-50 sticky top-0 z-10">
                            <tr>
                              <th scope="col" className="px-3 py-2 text-start w-8"></th>
                              <th scope="col" className="px-3 py-2 text-start text-label text-ink-400">Swimmer</th>
                              <th scope="col" className="px-3 py-2 text-start text-label text-ink-400">Nationality</th>
                              <th scope="col" className="px-3 py-2 text-start text-label text-ink-400">Region</th>
                              <th scope="col" className="px-3 py-2 text-end text-label text-ink-400">Results</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-ink-100">
                            {swimmers.map(s => (
                              <tr key={s.swimmer_id} className={`hover:bg-ink-50 ${selected.has(s.swimmer_id) ? 'bg-neg/5' : ''}`}>
                                <td className="px-3 py-2">
                                  <input type="checkbox" checked={selected.has(s.swimmer_id)}
                                    onChange={() => toggleSwimmer(s.swimmer_id)}
                                    aria-label={`Select ${s.name}`}
                                    className="w-4 h-4 accent-aqua-600" />
                                </td>
                                <td className="px-3 py-2 font-medium text-ink-900">{s.name}</td>
                                <td className="px-3 py-2">{s.nationality} ({s.nationality_code})</td>
                                <td className="px-3 py-2">
                                  <Badge variant={s.is_arab ? 'pos' : 'status'}>{s.region}</Badge>
                                </td>
                                <td className="px-3 py-2 text-end tnum">{s.results_count}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {selected.size > 0 && (
                      <div className="px-4 py-3 border-t border-ink-100 bg-neg/5 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-body-sm text-neg tnum">
                          {selected.size} swimmer{selected.size !== 1 ? 's' : ''} selected for removal
                        </span>
                        <Button variant="danger" size="sm" disabled={cleanupLoading}
                          onClick={() => setConfirmDeleteOpen(true)}>
                          Delete Selected Results
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center">
              <span className="mx-auto mb-4 w-14 h-14 rounded-full bg-neg/10 text-neg flex items-center justify-center">
                <XCircle size={28} />
              </span>
              <h2 className="text-title text-ink-900 mb-2">Import Failed: {m.champForm.name || m.fileName}</h2>
              <p className="text-body-sm text-neg mb-4">{m.confirmError}</p>
            </div>
          )}
        </Card>
      ))}
      <div className="text-center">
        <Button onClick={resetAll}>Import Another File</Button>
      </div>

      <ConfirmDialog
        open={confirmDeleteOpen}
        title="Delete swimmer results"
        message={`Delete results for ${selected.size} swimmer${selected.size !== 1 ? 's' : ''}? This cannot be undone.`}
        destructive
        loading={cleanupLoading}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDeleteOpen(false)}
      />
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
