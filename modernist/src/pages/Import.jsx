import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  uploadFile, matchSwimmers, confirmImport, getConfirmJob,
  getDuplicates, mergeSwimmers, getImportHistory,
  getScrapeJobs, startScrape, downloadScrape,
} from '../api/importer'
import { getCountries } from '../api/core'
import {
  getChampionships, getClassifications, getSubClassifications,
  getResultsBySwimmer, bulkDeleteResults, setMeetProgram,
} from '../api/championships'
import { POOL_TYPES, ARAB_COUNTRY_CODES, formatDate } from '../utils'
import EditableResultsTable from '../components/import/EditableResultsTable'
import ManualEntryForm from '../components/import/ManualEntryForm'
import MeetProgramEditor, { LocalProgramEditor } from '../components/MeetProgramEditor'
import { PageHead, Loading, Empty, Seg } from '../components/ui'

const MAX_FILES = 200

const emptyForm = {
  name: '', date: '', end_date: '', pool: 'LCM', country: '',
  location: '', classification: '', sub_classification: '',
}

const errorBox = {
  border: '1px solid var(--asw-slow)', color: 'var(--asw-slow)',
  padding: '10px 12px', fontSize: 13, marginBottom: 16,
}

const successBox = {
  border: '1px solid var(--asw-fast)', color: 'var(--asw-fast)',
  padding: '10px 12px', fontSize: 13, marginBottom: 16,
}

const SESSION_LABEL = { HEATS: 'Heats', SEMIS: 'Semifinals', FINALS: 'Finals' }
const GENDER_LABEL = { M: 'Men', F: 'Women', X: 'Mixed' }

// Read-only day-by-day program extracted from the source file's session
// dates. Shown in the review step so the admin can QA it before confirm —
// the backend saves it automatically with the import.
function DetectedProgram({ program, startDate }) {
  const dayNo = (iso) => {
    if (!startDate || !iso) return null
    const d = Math.round((new Date(`${iso}T00:00:00`) - new Date(`${startDate}T00:00:00`)) / 86400000) + 1
    return d >= 1 && d <= 30 ? d : null
  }
  const byDate = []
  for (const row of program) {
    const last = byDate[byDate.length - 1]
    if (last && last.date === row.date) last.rows.push(row)
    else byDate.push({ date: row.date, rows: [row] })
  }
  return (
    <div style={{ border: '1px solid var(--color-divider)', background: 'var(--color-surface)', padding: '14px 16px' }}>
      <div className="kicker" style={{ marginBottom: 4 }}>Program detected from file</div>
      <div className="micro" style={{ marginBottom: 12, textTransform: 'none', letterSpacing: 0 }}>
        Session dates and rounds read from the source file — review the quality here. Saved automatically with the import; you can adjust it afterwards on the Done step or the meet page.
      </div>
      {byDate.map((d) => (
        <div key={d.date} style={{ marginBottom: 10 }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 12.5, marginBottom: 4 }}>
            {dayNo(d.date) ? `Day ${dayNo(d.date)} · ` : ''}{formatDate(d.date)}
          </div>
          {d.rows.map((r, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', borderBottom: '1px solid var(--color-divider)', fontSize: 13, background: '#fff' }}>
              <span style={{ fontWeight: 600 }}>{r.event_name}</span>
              <span className="micro" style={{ textTransform: 'none', letterSpacing: 0 }}>{GENDER_LABEL[r.gender] || ''}</span>
              {r.session && <span className="tag tag-neutral" style={{ flex: 'none' }}>{SESSION_LABEL[r.session]}</span>}
              {r.age_category && <span className="tag tag-neutral" style={{ flex: 'none' }}>{r.age_category}</span>}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

function StatCells({ items }) {
  return (
    <div className="cellgrid" style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)`, border: '1px solid var(--color-divider)', marginBottom: 20 }}>
      {items.map(([n, l], i) => (
        <div key={i} style={{ textAlign: 'center' }}>
          <div className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, lineHeight: 1 }}>{n}</div>
          <div className="micro" style={{ marginTop: 6 }}>{l}</div>
        </div>
      ))}
    </div>
  )
}

export default function Import() {
  const [searchParams] = useSearchParams()
  // Pre-selected target meet (e.g. arriving from a meet's "Import File" button)
  const presetChampId = searchParams.get('championship') || ''
  // Live-results mode: arriving from a meet's live panel ("Upload session")
  const presetLiveDay = searchParams.get('live_day') || ''
  const [tab, setTab] = useState('file') // 'file' | 'manual' | 'duplicates' | 'history'
  const [namePdfs, setNamePdfs] = useState([]) // companion PDFs for Egyptian name repair
  const [importMethod, setImportMethod] = useState(null) // null, 'pdf', 'excel', 'html'
  const [step, setStep] = useState(0) // 0=method, 1=upload, 2=details+edit, 3=match, 4=done
  const [loading, setLoading] = useState(false)
  const [loadingMsg, setLoadingMsg] = useState('')
  const [error, setError] = useState('')

  // Each uploaded file becomes one "meet" with its own import session
  const [meets, setMeets] = useState([])
  const [active, setActive] = useState(0)

  // Reference data
  const [countries, setCountries] = useState([])
  const [classifications, setClassifications] = useState([])
  const [subClassifications, setSubClassifications] = useState([])
  const [existingMeets, setExistingMeets] = useState([])

  const meet = meets[active] || null

  const updateMeet = (idx, patch) =>
    setMeets((prev) => prev.map((m, i) => (i === idx ? { ...m, ...patch } : m)))

  const setChampForm = (patch) =>
    updateMeet(active, { champForm: { ...meet.champForm, ...patch } })

  useEffect(() => {
    getCountries().then((res) => setCountries(res.data)).catch(() => {})
    getClassifications().then((res) => setClassifications(res.data)).catch(() => {})
    // Existing meets (incl. future/calendar-only) so files can be imported
    // into a manually created meet instead of always creating a new one
    getChampionships({ page_size: 1000, ordering: '-date', include_calendar_only: 1 })
      .then((res) => setExistingMeets(res.data?.results || res.data || []))
      .catch(() => {})
  }, [])

  const activeClassification = meet?.champForm?.classification
  useEffect(() => {
    if (activeClassification) {
      getSubClassifications(activeClassification).then((res) => setSubClassifications(res.data)).catch(() => {})
    } else {
      setSubClassifications([])
    }
  }, [activeClassification])

  const selectMethod = (method) => {
    setImportMethod(method)
    setNamePdfs([])
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
      const inferredCountry = countries.find((c) => c.code === m.inferred_country)
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
        programItems: [],
        matches: [], matchStats: {}, decisions: {}, result: null, confirmError: '',
      }
    }

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const repairing = namePdfs.length ? ' + repairing names from PDFs' : ''
      setLoadingMsg(files.length > 1 ? `Parsing ${i + 1} / ${files.length}${repairing}: ${file.name}` : `Parsing${repairing}…`)
      try {
        const formData = new FormData()
        formData.append('file', file)
        for (const pdf of namePdfs) formData.append('name_pdfs', pdf)
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
      setError(failures.join(' • ') || 'Failed to parse file')
      return
    }
    if (failures.length) {
      setError(`Some files could not be parsed: ${failures.join(' • ')}`)
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
        events: m.editedPreview.events.map((ev) => ({
          ...ev,
          results: ev.results.filter((r) =>
            ev.is_relay || ARAB_COUNTRY_CODES.has((r.nationality_code || '').toUpperCase())
          ),
        })).filter((ev) => ev.results.length > 0),
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
        setLoadingMsg(updated.length > 1 ? `Matching swimmers ${i + 1} / ${updated.length}…` : 'Matching swimmers…')
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
      setLoadingMsg(updated.length > 1 ? `Importing ${i + 1} / ${updated.length}: ${m.champForm.name}` : 'Importing…')
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
        if (presetLiveDay) {
          payload.live_day = Number(presetLiveDay)
          payload.live_source = importMethod === 'html' ? 'LINK' : 'PDF'
          payload.live_label = m.fileName || ''
        }
        // Run as a background job on the server — big meets (Egypt:
        // 30k-80k results) take longer than any request timeout allows.
        payload.background = true
        const res = await confirmImport(payload)
        const jobId = res.data.job_id
        let jobData = null
        for (;;) {
          await new Promise((r) => setTimeout(r, 2500))
          const jr = await getConfirmJob(jobId)
          jobData = jr.data
          if (jobData.status === 'done' || jobData.status === 'failed') break
          const prefix = updated.length > 1 ? `Importing ${i + 1} / ${updated.length}: ` : 'Importing — '
          setLoadingMsg(prefix + (jobData.progress || 'working…'))
        }
        if (jobData.status === 'failed') {
          updated[i] = { ...m, confirmError: jobData.error || 'Failed to import' }
          continue
        }
        updated[i] = { ...m, result: jobData.result, confirmError: '' }
        anyOk = true
        // save the program planned in the review step (non-fatal on failure)
        const champId = jobData.result?.championship_id
        if (champId && !m.existingChampId && (m.programItems || []).length > 0) {
          try {
            const byDay = {}
            m.programItems.forEach((it) => { (byDay[it.day] = byDay[it.day] || []).push(it) })
            const items = Object.values(byDay).flatMap((arr) => arr.map((it, j) => ({
              day: it.day, event: it.event, gender: it.gender, order: j,
              session: it.session || '', age_category: it.age_category || '',
            })))
            await setMeetProgram(champId, items)
          } catch { /* program can still be set on the Done step */ }
        }
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
      setError(updated.map((m) => m.confirmError).filter(Boolean).join(' • '))
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

  const switchTab = (t) => {
    setTab(t)
    setError('')
  }

  const stepLabels = ['Method', 'Upload file', 'Review & edit', 'Match swimmers', 'Done']

  const acceptTypes = importMethod === 'pdf' ? '.pdf' : importMethod === 'excel' ? '.xlsx,.xls,.csv' : importMethod === 'html' ? '.html,.htm' : '.pdf,.html,.htm,.xlsx,.xls,.csv'
  const allowMultiple = importMethod === 'excel'

  // Tab bar for switching between uploaded meets (steps 2-4)
  const meetTabs = meets.length > 1 && (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
      {meets.map((m, i) => (
        <button
          key={m.importId}
          type="button"
          onClick={() => setActive(i)}
          className={i === active ? 'btn btn-primary' : 'btn btn-secondary'}
          style={{ fontSize: 12, padding: '5px 10px' }}
        >
          <span className="asw-num">{i + 1}</span>
          <span style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {m.champForm.name || m.fileName}
          </span>
          {step === 2 && !formComplete(m) && (
            <span title="Missing required fields" style={{ color: i === active ? '#fff' : 'var(--asw-slow)' }}>●</span>
          )}
          {step === 2 && formComplete(m) && (
            <span style={{ color: i === active ? '#fff' : 'var(--asw-fast)' }}>✓</span>
          )}
          {step === 4 && (m.result
            ? <span style={{ color: i === active ? '#fff' : 'var(--asw-fast)' }}>✓</span>
            : <span style={{ color: i === active ? '#fff' : 'var(--asw-slow)' }}>✕</span>)}
        </button>
      ))}
    </div>
  )

  return (
    <div>
      <PageHead kicker="Admin" title="Import Results" sub="Upload meet files, review parsed data, match swimmers and import" />

      {presetLiveDay && (
        <div style={{
          margin: '16px 32px 0', padding: '10px 14px', fontSize: 13, fontWeight: 600,
          border: '1px solid #c0392b', color: '#c0392b',
        }}>
          Live session upload — Day {presetLiveDay}. Import into the pre-selected meet; the session will be logged on the live panel.
        </div>
      )}

      {/* Top-level tool switcher */}
      <div className="rule-b" style={{ padding: '14px 32px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <Seg
          options={[
            { value: 'file', label: 'Import File' },
            { value: 'scrape', label: 'Scrape ESF' },
            { value: 'manual', label: 'Manual Entry' },
            { value: 'duplicates', label: 'Duplicates' },
            { value: 'history', label: 'History' },
          ]}
          value={tab}
          onChange={switchTab}
        />
        {tab === 'file' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {stepLabels.map((label, i) => (
              <span
                key={i}
                className="micro"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  color: step === i ? 'var(--color-accent)' : step > i ? 'var(--asw-fast)' : undefined,
                  fontWeight: step === i ? 700 : undefined,
                }}
              >
                <span className="asw-num">{step > i ? '✓' : i + 1}</span>
                {label}
                {i < stepLabels.length - 1 && <span style={{ color: 'var(--color-neutral-400)' }}>—</span>}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="pad">
        {error && <div style={errorBox}>{error}</div>}

        {tab === 'manual' && <ManualEntryForm onComplete={() => switchTab('manual')} />}
        {tab === 'duplicates' && <DuplicatesTab />}
        {tab === 'history' && <HistoryTab />}
        {tab === 'scrape' && <ScrapeTab />}

        {tab === 'file' && (
          <>
            {/* Step 0: Method selection */}
            {step === 0 && (
              <div className="grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                {[
                  { key: 'pdf', title: 'Upload PDF', desc: 'Import from PDF files (Splash, HY-TEK, FRMN)' },
                  { key: 'excel', title: 'Upload Excel', desc: `Import from Excel or CSV files — up to ${MAX_FILES} meets at once` },
                  { key: 'html', title: 'Upload HTML', desc: "Import from HTML files (Nat'2i Tunisia format)" },
                ].map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => selectMethod(m.key)}
                    style={{
                      border: '1px solid var(--color-divider)', background: 'var(--color-surface)',
                      padding: 28, textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--color-accent)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--color-divider)' }}
                  >
                    <div className="kicker" style={{ marginBottom: 8 }}>{m.key}</div>
                    <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 18, marginBottom: 6 }}>{m.title}</div>
                    <div style={{ fontSize: 13, color: 'var(--color-neutral-700)' }}>{m.desc}</div>
                  </button>
                ))}
              </div>
            )}

            {/* Step 1: Upload */}
            {step === 1 && (
              <div style={{ border: '1px solid var(--color-divider)', padding: '48px 32px', textAlign: 'center' }}>
                <div className="kicker" style={{ marginBottom: 8 }}>
                  {importMethod === 'pdf' ? 'PDF' : importMethod === 'html' ? 'HTML' : 'Excel / CSV'}
                </div>
                <h3 style={{ marginBottom: 8 }}>
                  Upload {importMethod === 'pdf' ? 'PDF' : importMethod === 'html' ? 'HTML' : 'Excel/CSV'} file{allowMultiple ? 's' : ''}
                </h3>
                <p style={{ fontSize: 13, color: 'var(--color-neutral-700)', marginBottom: 24 }}>
                  {importMethod === 'pdf'
                    ? 'Supports Splash, HY-TEK, FRMN and other PDF formats'
                    : importMethod === 'html'
                    ? "Supports Nat'2i HTML format (Tunisia)"
                    : `Supports .xlsx, .xls, and .csv files — select up to ${MAX_FILES} files, one meet per file`}
                </p>
                {importMethod === 'excel' && (
                  <div style={{
                    margin: '0 auto 24px', maxWidth: 520, padding: 16, textAlign: 'left',
                    border: '1px dashed var(--color-divider)', background: 'var(--color-neutral-50, #fafafa)',
                  }}>
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>
                      Fix cut names (Egyptian meets) — optional
                    </div>
                    <p style={{ fontSize: 12.5, color: 'var(--color-neutral-700)', marginBottom: 10 }}>
                      Egyptian federation Excel exports cut swimmer names at 15 letters.
                      Attach the meet&apos;s results / meet-program PDFs and the full names
                      will be restored automatically before the preview.
                    </p>
                    <label className="btn btn-ghost" style={{ fontSize: 13, opacity: loading ? 0.5 : 1, pointerEvents: loading ? 'none' : 'auto' }}>
                      {namePdfs.length ? `${namePdfs.length} PDF${namePdfs.length > 1 ? 's' : ''} attached` : 'Attach meet PDFs'}
                      <input type="file" accept=".pdf" multiple style={{ display: 'none' }} disabled={loading}
                        onChange={(e) => setNamePdfs(Array.from(e.target.files || []))} />
                    </label>
                    {namePdfs.length > 0 && (
                      <button type="button" className="btn btn-ghost" style={{ fontSize: 13, marginLeft: 8 }}
                        onClick={() => setNamePdfs([])}>
                        Clear
                      </button>
                    )}
                  </div>
                )}
                <label className="btn btn-primary" style={{ opacity: loading ? 0.5 : 1, pointerEvents: loading ? 'none' : 'auto' }}>
                  {loading ? (loadingMsg || 'Parsing…') : `Choose file${allowMultiple ? 's' : ''}`}
                  <input type="file" accept={acceptTypes} multiple={allowMultiple} onChange={handleUpload}
                    style={{ display: 'none' }} disabled={loading} />
                </label>
                <div style={{ marginTop: 16 }}>
                  <button type="button" className="btn btn-ghost" style={{ fontSize: 13 }} onClick={resetAll}>
                    ← Back to method selection
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: Championship details + editable results */}
            {step === 2 && meet && meet.editedPreview && (
              <div>
                {meetTabs}

                {/* Name repair summary (Egyptian truncated names fixed from PDFs) */}
                {meet.preview?.name_repair && (
                  <div style={{
                    marginBottom: 20, padding: '12px 16px', fontSize: 13,
                    border: '1px solid var(--color-divider)', background: 'var(--color-neutral-50, #fafafa)',
                  }}>
                    <strong>Name repair:</strong>{' '}
                    {meet.preview.name_repair.repaired} of {meet.preview.name_repair.checked} cut
                    names restored from the attached PDFs
                    {meet.preview.name_repair.ambiguous > 0 && <> · {meet.preview.name_repair.ambiguous} ambiguous (left as-is)</>}
                    {meet.preview.name_repair.no_match > 0 && <> · {meet.preview.name_repair.no_match} not found in PDFs (likely already complete)</>}
                  </div>
                )}

                {/* Arab-only toggle */}
                <div
                  onClick={() => toggleArabOnly(active)}
                  style={{
                    marginBottom: 20, padding: 20, textAlign: 'center', cursor: 'pointer', userSelect: 'none',
                    border: `2px solid ${meet.arabOnly ? 'var(--asw-fast)' : 'var(--asw-gold)'}`,
                  }}
                >
                  <div style={{
                    fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 20,
                    color: meet.arabOnly ? 'var(--asw-fast)' : 'var(--asw-gold)',
                  }}>
                    {meet.arabOnly ? '✓ Arab swimmers only — ON' : 'Importing ALL swimmers'}
                  </div>
                  <div style={{ marginTop: 6, fontSize: 13, color: meet.arabOnly ? 'var(--asw-fast)' : 'var(--asw-gold)' }}>
                    {meet.arabOnly
                      ? `Filtered: only Arab/GCC swimmers kept (${meet.editedPreview.stats.total_results} results)`
                      : 'Click here to import ONLY Arab/GCC swimmers from this meet'}
                  </div>
                </div>

                {/* Meet warnings */}
                {meet.meetWarnings.length > 0 && (
                  <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {meet.meetWarnings.map((w, i) => {
                      const color = w.type === 'exact_duplicate' ? 'var(--asw-slow)'
                        : w.type === 'partial_new' ? 'var(--asw-gold)'
                        : w.type === 'different_pool' ? 'var(--color-accent)'
                        : 'var(--color-neutral-700)'
                      return (
                        <div key={i} style={{ border: `1px solid ${color}`, padding: '12px 14px', fontSize: 13 }}>
                          <div style={{ fontWeight: 700, marginBottom: 4, color }}>
                            {w.type === 'exact_duplicate' ? 'Duplicate meet detected'
                              : w.type === 'partial_new' ? 'Existing meet — new events found'
                              : w.type === 'different_pool' ? 'Same meet, different pool'
                              : 'Similar meet found'}
                          </div>
                          <div>{w.message}</div>
                          <div className="micro" style={{ marginTop: 4 }}>
                            Existing: {w.db_results} results, {w.db_events} events, {w.db_swimmers} swimmers
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Stats bar */}
                <StatCells items={[
                  [meet.editedPreview.stats.total_swimmers, 'Swimmers'],
                  [meet.editedPreview.stats.total_results, 'Results'],
                  [meet.editedPreview.stats.total_events, 'Events'],
                  [meet.editedPreview.meet.format?.toUpperCase() || '—', 'Format detected'],
                ]} />

                {/* Championship details form */}
                <div style={{ border: '1px solid var(--color-divider)', padding: 20, marginBottom: 16 }}>
                  <div className="kicker" style={{ marginBottom: 4 }}>Championship details</div>
                  <p style={{ fontSize: 13, color: 'var(--color-neutral-700)', marginBottom: 16 }}>
                    Review and complete the championship information. Fields marked with * are required.
                  </p>

                  {/* Target meet: create new or add into an existing one */}
                  <div className="field" style={{ marginBottom: 16, background: 'var(--color-accent-100)', padding: 12 }}>
                    <label>Import into</label>
                    <select
                      className="select"
                      value={meet.existingChampId}
                      onChange={(e) => updateMeet(active, { existingChampId: e.target.value })}
                    >
                      <option value="">New championship — fill the form below</option>
                      {existingMeets.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.date}{c.results_count ? `, ${c.results_count} results` : ', no results yet'})
                        </option>
                      ))}
                    </select>
                    {meet.existingChampId && (
                      <p style={{ fontSize: 12, color: 'var(--color-accent-700)', margin: '6px 0 0' }}>
                        Results will be added to this meet — the form below is ignored. Re-imported duplicates are skipped automatically.
                      </p>
                    )}
                  </div>

                  {!meet.existingChampId && (
                    <>
                      <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                        <div className="field" style={{ gridColumn: '1 / -1' }}>
                          <label>Championship name *</label>
                          <input
                            className="input" type="text" value={meet.champForm.name}
                            onChange={(e) => setChampForm({ name: e.target.value })}
                            placeholder="e.g. Championnat du Liban 25 M" required
                            style={{ borderColor: meet.champForm.name ? 'var(--asw-fast)' : 'var(--asw-slow)' }}
                          />
                        </div>

                        <div className="field">
                          <label>Country *</label>
                          <select
                            className="select" value={meet.champForm.country}
                            onChange={(e) => setChampForm({ country: e.target.value })} required
                            style={{ borderColor: meet.champForm.country ? 'var(--asw-fast)' : 'var(--asw-slow)' }}
                          >
                            <option value="">Select country</option>
                            {countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                        </div>

                        <div className="field">
                          <label>Pool *</label>
                          <select
                            className="select" value={meet.champForm.pool}
                            onChange={(e) => setChampForm({ pool: e.target.value })}
                          >
                            {POOL_TYPES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                          </select>
                        </div>

                        <div className="field">
                          <label>Start date *</label>
                          <input
                            className="input" type="date" value={meet.champForm.date}
                            onChange={(e) => setChampForm({ date: e.target.value })} required
                            style={{ borderColor: meet.champForm.date ? 'var(--asw-fast)' : 'var(--asw-slow)' }}
                          />
                        </div>

                        <div className="field">
                          <label>End date</label>
                          <input
                            className="input" type="date" value={meet.champForm.end_date}
                            onChange={(e) => setChampForm({ end_date: e.target.value })}
                          />
                        </div>

                        <div className="field" style={{ gridColumn: '1 / -1' }}>
                          <label>Location</label>
                          <input
                            className="input" type="text" value={meet.champForm.location}
                            onChange={(e) => setChampForm({ location: e.target.value })}
                            placeholder="City / Venue"
                          />
                        </div>
                      </div>

                      {/* Classification section */}
                      <div className="rule-t" style={{ marginTop: 16, paddingTop: 16 }}>
                        <div className="micro" style={{ marginBottom: 10 }}>Classification</div>
                        <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                          <div className="field">
                            <label>Classification</label>
                            <select
                              className="select" value={meet.champForm.classification}
                              onChange={(e) => setChampForm({ classification: e.target.value, sub_classification: '' })}
                            >
                              <option value="">Select…</option>
                              {classifications.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                          </div>
                          <div className="field">
                            <label>Sub classification</label>
                            <select
                              className="select" value={meet.champForm.sub_classification}
                              onChange={(e) => setChampForm({ sub_classification: e.target.value })}
                              disabled={!subClassifications.length}
                            >
                              <option value="">Select…</option>
                              {subClassifications.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Day-by-day program — planned here, saved when the import is confirmed */}
                <div style={{ marginBottom: 16 }}>
                  {(meet.editedPreview.program || []).length > 0 ? (
                    <DetectedProgram
                      program={meet.editedPreview.program}
                      startDate={meet.champForm.date}
                    />
                  ) : meet.existingChampId ? (
                    <MeetProgramEditor champId={Number(meet.existingChampId)} />
                  ) : meet.champForm.date ? (
                    <LocalProgramEditor
                      startDate={meet.champForm.date}
                      endDate={meet.champForm.end_date}
                      items={meet.programItems || []}
                      onChange={(items) => updateMeet(active, { programItems: items })}
                    />
                  ) : (
                    <div className="micro" style={{ border: '1px solid var(--color-divider)', padding: '10px 14px', textTransform: 'none', letterSpacing: 0 }}>
                      Set the meet start date above to plan the day-by-day program.
                    </div>
                  )}
                </div>

                {/* Editable results table */}
                <div style={{ marginBottom: 16 }}>
                  <EditableResultsTable
                    key={meet.importId}
                    preview={meet.editedPreview}
                    onPreviewChange={(p) => updateMeet(active, { editedPreview: p })}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, alignItems: 'center' }}>
                  {meets.length > 1 && !allFormsComplete && (
                    <span style={{ fontSize: 13, color: 'var(--asw-gold)' }}>
                      Complete required fields on every meet tab to continue
                    </span>
                  )}
                  <button
                    type="button" className="btn btn-secondary"
                    onClick={() => { setStep(1); setMeets([]); setActive(0) }}
                  >
                    Back
                  </button>
                  <button
                    type="button" className="btn btn-primary"
                    onClick={handleMatch} disabled={loading || !allFormsComplete}
                  >
                    {loading ? (loadingMsg || 'Matching swimmers…') : 'Next: Match swimmers →'}
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Match & confirm */}
            {step === 3 && meet && (
              <div>
                {meetTabs}

                <div style={{ border: '1px solid var(--color-divider)', padding: 20, marginBottom: 16 }}>
                  <div className="kicker" style={{ marginBottom: 14 }}>
                    Swimmer matching{meets.length > 1 ? ` — ${meet.champForm.name || meet.fileName}` : ''}
                  </div>
                  <StatCells items={[
                    [meet.matchStats.exact_matches || 0, 'Exact matches'],
                    [meet.matchStats.fuzzy_matches || 0, 'Fuzzy matches'],
                    [meet.matchStats.new_swimmers || 0, 'New swimmers'],
                  ]} />
                </div>

                {/* Matches table */}
                <div style={{ border: '1px solid var(--color-divider)', marginBottom: 16 }}>
                  <div className="table-scroll" style={{ maxHeight: 500, overflowY: 'auto' }}>
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Parsed name</th>
                          <th>Match</th>
                          <th>Confidence</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {meet.matches.map((m, i) => (
                          <tr key={i}>
                            <td>
                              <div style={{ fontWeight: 600 }}>{m.parsed_name}</div>
                              <div className="micro" style={{ textTransform: 'none', letterSpacing: 0 }}>
                                {m.nationality_code && <span style={{ marginRight: 8 }}>{m.nationality_code}</span>}
                                {m.birth_year > 0 && <span>Born {m.birth_year}</span>}
                              </div>
                            </td>
                            <td>
                              {m.matched_swimmer ? (
                                <div>
                                  <div>{m.matched_swimmer.name}</div>
                                  <div className="micro" style={{ textTransform: 'none', letterSpacing: 0 }}>{m.matched_swimmer.nationality}</div>
                                </div>
                              ) : (
                                <span className="text-muted" style={{ fontStyle: 'italic' }}>No match</span>
                              )}
                            </td>
                            <td>
                              <span
                                className="tag asw-num"
                                style={{
                                  color: m.confidence >= 90 ? 'var(--asw-fast)' : m.confidence >= 75 ? 'var(--asw-gold)' : 'var(--color-neutral-700)',
                                  border: `1px solid ${m.confidence >= 90 ? 'var(--asw-fast)' : m.confidence >= 75 ? 'var(--asw-gold)' : 'var(--color-divider)'}`,
                                  fontWeight: 600,
                                }}
                              >
                                {m.confidence}%
                              </span>
                            </td>
                            <td>
                              <select
                                className="select"
                                style={{ width: 'auto', minHeight: 30, fontSize: 13 }}
                                value={meet.decisions[m.parsed_name]?.action || 'create'}
                                onChange={(e) => updateDecision(m.parsed_name, e.target.value,
                                  e.target.value === 'match' ? m.matched_swimmer?.id : undefined)}
                              >
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

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setStep(2)}>Back</button>
                  <button type="button" className="btn btn-primary" onClick={handleConfirm} disabled={loading}>
                    {loading ? (loadingMsg || 'Importing…')
                      : meets.length > 1 ? `Confirm import (${meets.length} meets) ✓` : 'Confirm import ✓'}
                  </button>
                </div>
              </div>
            )}

            {/* Step 4: Done */}
            {step === 4 && (
              <DoneStep meets={meets} active={active} meetTabs={meetTabs} resetAll={resetAll}
                backToMeetId={presetLiveDay && presetChampId ? presetChampId : null} />
            )}
          </>
        )}
      </div>
    </div>
  )
}

function DoneStep({ meets, active, meetTabs, resetAll, backToMeetId }) {
  const [cleanupChampId, setCleanupChampId] = useState(null)
  const [swimmers, setSwimmers] = useState([])
  const [selected, setSelected] = useState(new Set())
  const [cleanupLoading, setCleanupLoading] = useState(false)
  const [cleanupDone, setCleanupDone] = useState(null)

  const openCleanup = async (champId) => {
    setCleanupChampId(champId)
    setCleanupLoading(true)
    try {
      const res = await getResultsBySwimmer(champId)
      const data = res.data
      setSwimmers(data)
      // Pre-select non-Arab swimmers for deletion
      const nonArab = new Set(data.filter((s) => !s.is_arab).map((s) => s.swimmer_id))
      setSelected(nonArab)
    } catch { setSwimmers([]) }
    setCleanupLoading(false)
  }

  const toggleSwimmer = (id) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAllNonArab = () => {
    setSelected(new Set(swimmers.filter((s) => !s.is_arab).map((s) => s.swimmer_id)))
  }

  const deselectAll = () => setSelected(new Set())

  const handleDelete = async () => {
    if (!selected.size) return
    if (!window.confirm(`Delete results for ${selected.size} swimmer(s)? This cannot be undone.`)) return
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
        <div
          key={m.importId}
          style={{
            border: `1px solid ${m.result ? 'var(--asw-fast)' : 'var(--asw-slow)'}`,
            padding: 32, textAlign: 'center', marginBottom: 16,
          }}
        >
          {m.result ? (
            <>
              <div className="kicker" style={{ color: 'var(--asw-fast)', marginBottom: 14 }}>
                Import complete{meets.length > 1 ? `: ${m.result.championship_name}` : ''}
              </div>
              <div style={{ maxWidth: 640, margin: '0 auto 20px' }}>
                <StatCells items={[
                  [m.result.created_results, 'Results created'],
                  [m.result.created_swimmers, 'New swimmers'],
                  [m.result.matched_swimmers, 'Matched swimmers'],
                  [m.result.skipped_results, 'Skipped (duplicates)'],
                ]} />
              </div>
              <p style={{ fontSize: 13, color: 'var(--color-neutral-700)', marginBottom: 16 }}>
                Championship: {m.result.championship_name}
              </p>

              {m.result.skipped_details && m.result.skipped_details.length > 0 && (
                <details style={{ textAlign: 'left', maxWidth: 640, margin: '0 auto 16px' }}>
                  <summary className="micro" style={{ cursor: 'pointer' }}>
                    View {m.result.skipped_details.length} skipped result{m.result.skipped_details.length !== 1 ? 's' : ''}
                  </summary>
                  <div style={{ marginTop: 8, border: '1px solid var(--color-divider)' }}>
                    <table className="table" style={{ fontSize: 12 }}>
                      <thead>
                        <tr>
                          <th>Swimmer</th>
                          <th>Event</th>
                          <th>Round</th>
                          <th>Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {m.result.skipped_details.map((s, j) => (
                          <tr key={j}>
                            <td style={{ fontWeight: 600 }}>{s.swimmer}</td>
                            <td>{s.event}</td>
                            <td>{s.round || '—'}</td>
                            <td className="text-muted">{s.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              )}

              {/* Day-by-day program: which events were swum on each day */}
              {m.result.championship_id && (
                <div style={{ textAlign: 'left', maxWidth: 760, margin: '0 auto 16px' }}>
                  <MeetProgramEditor champId={m.result.championship_id} />
                </div>
              )}

              {/* Cleanup button */}
              {m.result.championship_id && cleanupChampId !== m.result.championship_id && (
                <button
                  type="button" className="btn btn-secondary" style={{ marginTop: 8 }}
                  onClick={() => openCleanup(m.result.championship_id)}
                >
                  Clean up results (remove non-Arab swimmers)
                </button>
              )}

              {/* Cleanup panel */}
              {cleanupChampId === m.result.championship_id && (
                <div style={{ textAlign: 'left', maxWidth: 760, margin: '16px auto 0' }}>
                  {cleanupDone && (
                    <div style={{ border: '1px solid var(--asw-fast)', color: 'var(--asw-fast)', padding: '10px 12px', fontSize: 13, marginBottom: 12 }}>
                      Deleted {cleanupDone.deleted_results} results and {cleanupDone.deleted_orphan_swimmers} orphan swimmers.
                    </div>
                  )}
                  <div style={{ border: '1px solid var(--color-divider)' }}>
                    <div className="hair-b" style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--color-surface)' }}>
                      <span className="kicker">Select swimmers to remove</span>
                      <div style={{ display: 'flex', gap: 12 }}>
                        <button type="button" className="btn btn-ghost" style={{ fontSize: 12 }} onClick={selectAllNonArab}>Select non-Arab</button>
                        <button type="button" className="btn btn-ghost" style={{ fontSize: 12 }} onClick={deselectAll}>Deselect all</button>
                      </div>
                    </div>
                    {cleanupLoading ? (
                      <Loading label="Loading swimmers" />
                    ) : (
                      <div className="table-scroll" style={{ maxHeight: 400, overflowY: 'auto' }}>
                        <table className="table">
                          <thead>
                            <tr>
                              <th style={{ width: 32 }}></th>
                              <th>Swimmer</th>
                              <th>Nationality</th>
                              <th>Region</th>
                              <th className="num">Results</th>
                            </tr>
                          </thead>
                          <tbody>
                            {swimmers.map((s) => (
                              <tr key={s.swimmer_id} style={selected.has(s.swimmer_id) ? { background: 'color-mix(in srgb, var(--asw-slow) 8%, transparent)' } : undefined}>
                                <td>
                                  <input type="checkbox" checked={selected.has(s.swimmer_id)}
                                    onChange={() => toggleSwimmer(s.swimmer_id)} />
                                </td>
                                <td style={{ fontWeight: 600 }}>{s.name}</td>
                                <td>{s.nationality} ({s.nationality_code})</td>
                                <td>
                                  <span className={s.is_arab ? 'tag' : 'tag tag-neutral'}
                                    style={s.is_arab ? { border: '1px solid var(--asw-fast)', color: 'var(--asw-fast)' } : undefined}>
                                    {s.region}
                                  </span>
                                </td>
                                <td className="num asw-num">{s.results_count}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {selected.size > 0 && (
                      <div className="rule-t" style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 13, color: 'var(--asw-slow)' }}>
                          {selected.size} swimmer{selected.size !== 1 ? 's' : ''} selected for removal
                        </span>
                        <button
                          type="button" className="btn"
                          style={{ background: 'var(--asw-slow)', color: '#fff' }}
                          onClick={handleDelete} disabled={cleanupLoading}
                        >
                          Delete selected results
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="kicker" style={{ color: 'var(--asw-slow)', marginBottom: 8 }}>
                Import failed: {m.champForm.name || m.fileName}
              </div>
              <p style={{ fontSize: 13, color: 'var(--asw-slow)', marginBottom: 8 }}>{m.confirmError}</p>
            </>
          )}
        </div>
      ))}
      <div style={{ textAlign: 'center', display: 'flex', gap: 12, justifyContent: 'center' }}>
        {backToMeetId && (
          <Link className="btn btn-primary" to={`/meets/${backToMeetId}`}>
            Back to live meet
          </Link>
        )}
        <button type="button" className={backToMeetId ? 'btn btn-secondary' : 'btn btn-primary'} onClick={resetAll}>
          Import another file
        </button>
      </div>
    </div>
  )
}

function DuplicatesTab() {
  const [pairs, setPairs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [merging, setMerging] = useState(null) // index being merged

  const load = () => {
    setLoading(true)
    setError('')
    getDuplicates()
      .then((res) => setPairs(res.data || []))
      .catch(() => setError('Failed to load duplicates'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const handleMerge = async (idx, keep, remove) => {
    if (!window.confirm(`Merge "${remove.name}" into "${keep.name}"? All results move to "${keep.name}" and "${remove.name}" is deleted. This cannot be undone.`)) return
    setMerging(idx)
    setError('')
    setMessage('')
    try {
      const res = await mergeSwimmers(keep.id, remove.id)
      setMessage(res.data?.message || `Merged "${remove.name}" into "${keep.name}"`)
      setPairs((prev) => prev.filter((_, i) => i !== idx))
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to merge swimmers')
    } finally {
      setMerging(null)
    }
  }

  if (loading) return <Loading label="Scanning for duplicate swimmers" />

  return (
    <div>
      <div className="sect-head">
        <h4>Potential Duplicate Swimmers</h4>
        <button type="button" className="btn btn-secondary" onClick={load}>Rescan</button>
      </div>
      {message && <div style={successBox}>{message}</div>}
      {error && <div style={errorBox}>{error}</div>}
      {pairs.length === 0 ? (
        <Empty label="No potential duplicates found" />
      ) : (
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Swimmer A</th>
                <th>Swimmer B</th>
                <th className="num">Similarity</th>
                <th>Merge</th>
              </tr>
            </thead>
            <tbody>
              {pairs.map((p, i) => (
                <tr key={`${p.swimmer1.id}-${p.swimmer2.id}`}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{p.swimmer1.name}</div>
                    <div className="micro" style={{ textTransform: 'none', letterSpacing: 0 }}>
                      {p.swimmer1.nationality} · b. {p.swimmer1.date_of_birth}
                    </div>
                  </td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{p.swimmer2.name}</div>
                    <div className="micro" style={{ textTransform: 'none', letterSpacing: 0 }}>
                      {p.swimmer2.nationality} · b. {p.swimmer2.date_of_birth}
                    </div>
                  </td>
                  <td className="num asw-num" style={{ fontWeight: 700 }}>{p.similarity}%</td>
                  <td>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button
                        type="button" className="btn btn-secondary" style={{ fontSize: 12 }}
                        disabled={merging === i}
                        onClick={() => handleMerge(i, p.swimmer1, p.swimmer2)}
                      >
                        {merging === i ? 'Merging…' : '← Keep A'}
                      </button>
                      <button
                        type="button" className="btn btn-secondary" style={{ fontSize: 12 }}
                        disabled={merging === i}
                        onClick={() => handleMerge(i, p.swimmer2, p.swimmer1)}
                      >
                        {merging === i ? 'Merging…' : 'Keep B →'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function ScrapeTab() {
  const [jobs, setJobs] = useState([])
  const [url, setUrl] = useState('')
  const [heatsPdfs, setHeatsPdfs] = useState([])
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')

  const load = () =>
    getScrapeJobs().then((res) => setJobs(res.data || [])).catch(() => {})

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [])

  // Poll while a scrape is running
  useEffect(() => {
    if (!jobs.some((j) => j.status === 'pending' || j.status === 'running')) return
    const t = setInterval(load, 4000)
    return () => clearInterval(t)
  }, [jobs])

  const handleStart = async () => {
    const u = url.trim()
    if (!u) return
    setStarting(true)
    setError('')
    try {
      await startScrape(u, heatsPdfs)
      setUrl('')
      setHeatsPdfs([])
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to start scrape')
    }
    setStarting(false)
  }

  const handleDownload = async (job) => {
    setError('')
    try {
      const res = await downloadScrape(job.id)
      const blobUrl = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = blobUrl
      const slug = (job.meet_name || 'meet').replace(/[^A-Za-z0-9]+/g, '_').toLowerCase()
      a.download = `${slug}_results.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(blobUrl)
    } catch {
      setError('Failed to download the file')
    }
  }

  if (loading) return <Loading label="Loading scrapes" />

  return (
    <div>
      <div className="sect-head">
        <h4>Scrape Federation Results</h4>
        <span className="micro">ESF Hy-Tek results pages → clean Excel</span>
      </div>
      {error && <div style={errorBox}>{error}</div>}

      <div style={{ border: '1px solid var(--color-divider)', padding: 20, marginBottom: 24 }}>
        <p style={{ fontSize: 13, color: 'var(--color-neutral-700)', marginBottom: 12 }}>
          Paste the federation results link (e.g.
          <span className="asw-num" style={{ margin: '0 4px' }}>esf-eg.org/images/results/swimming/…/results/</span>)
          and every event will be scraped into one clean Excel file, ready to import
          via <strong>Import File → Upload Excel</strong>.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input
            type="url"
            className="input"
            placeholder="https://www.esf-eg.org/images/results/swimming/…/results/"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleStart()}
            style={{ flex: '1 1 320px', minWidth: 0 }}
            disabled={starting}
          />
          <button type="button" className="btn btn-primary" onClick={handleStart}
            disabled={starting || !url.trim()}>
            {starting ? 'Starting…' : 'Scrape'}
          </button>
        </div>
        <div style={{
          marginTop: 14, padding: 14,
          border: '1px dashed var(--color-divider)', background: 'var(--color-neutral-50, #fafafa)',
        }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>
            Full names from heats PDFs — optional
          </div>
          <p style={{ fontSize: 12.5, color: 'var(--color-neutral-700)', marginBottom: 10 }}>
            The federation site cuts swimmer names at 15 letters. Attach the meet&apos;s
            heats / meet-program PDFs and the full names will be merged into the
            scraped results, so the downloaded Excel already has complete names.
          </p>
          <label className="btn btn-ghost" style={{ fontSize: 13, opacity: starting ? 0.5 : 1, pointerEvents: starting ? 'none' : 'auto' }}>
            {heatsPdfs.length ? `${heatsPdfs.length} PDF${heatsPdfs.length > 1 ? 's' : ''} attached` : 'Attach heats PDFs'}
            <input type="file" accept=".pdf" multiple style={{ display: 'none' }} disabled={starting}
              onChange={(e) => setHeatsPdfs(Array.from(e.target.files || []))} />
          </label>
          {heatsPdfs.length > 0 && (
            <button type="button" className="btn btn-ghost" style={{ fontSize: 13, marginLeft: 8 }}
              onClick={() => setHeatsPdfs([])}>
              Clear
            </button>
          )}
        </div>
      </div>

      {jobs.length === 0 ? (
        <Empty label="No scrapes yet" />
      ) : (
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Meet</th>
                <th className="hide-mobile">Meet dates</th>
                <th className="num hide-mobile">Events</th>
                <th className="num">Results</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id}>
                  <td className="asw-num" style={{ whiteSpace: 'nowrap' }}>
                    {formatDate(job.created_at)}
                  </td>
                  <td style={{ fontWeight: 600, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    title={job.meet_name || job.url}>
                    {job.meet_name || job.url}
                  </td>
                  <td className="hide-mobile asw-num">{job.date_text || '—'}</td>
                  <td className="num hide-mobile asw-num">{job.total_events || '—'}</td>
                  <td className="num asw-num">{job.total_results || '—'}</td>
                  <td>
                    {job.status === 'done' && (
                      <>
                        <span className="tag" style={{ background: 'var(--asw-fast)', color: '#fff' }}>Done</span>
                        {job.name_stats?.checked > 0 && (
                          <div className="micro" style={{ marginTop: 4 }}
                            title={`${job.name_stats.repaired} repaired · ${job.name_stats.ambiguous} ambiguous · ${job.name_stats.no_match} not in PDFs`}>
                            {job.name_stats.repaired} / {job.name_stats.checked} names fixed
                          </div>
                        )}
                      </>
                    )}
                    {job.status === 'failed' && (
                      <span className="tag" style={{ background: 'var(--color-accent)', color: '#fff' }} title={job.error}>Failed</span>
                    )}
                    {(job.status === 'pending' || job.status === 'running') && (
                      <span className="tag tag-neutral">{job.progress || 'Scraping…'}</span>
                    )}
                  </td>
                  <td className="num">
                    {job.status === 'done' && (
                      <button type="button" className="btn btn-ghost" style={{ fontSize: 12.5 }}
                        onClick={() => handleDownload(job)}>
                        Download Excel
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function HistoryTab() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    getImportHistory()
      .then((res) => setLogs(res.data || []))
      .catch(() => setError('Failed to load import history'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <Loading label="Loading import history" />

  return (
    <div>
      <div className="sect-head">
        <h4>Import History</h4>
        <span className="micro">Last 50 imports</span>
      </div>
      {error && <div style={errorBox}>{error}</div>}
      {logs.length === 0 ? (
        <Empty label="No imports yet" />
      ) : (
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>File</th>
                <th className="hide-mobile">Format</th>
                <th>Meet</th>
                <th className="num">Results</th>
                <th className="num hide-mobile">New swimmers</th>
                <th className="num hide-mobile">Matched</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{formatDate(log.created_at)}</td>
                  <td style={{ fontWeight: 600, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={log.file_name}>
                    {log.file_name}
                  </td>
                  <td className="hide-mobile">
                    <span className="tag tag-neutral">{log.source_format || log.file_type || '—'}</span>
                  </td>
                  <td>{log.meet_name || '—'}</td>
                  <td className="num asw-num">{log.created_results ?? log.total_results ?? '—'}</td>
                  <td className="num asw-num hide-mobile">{log.created_swimmers ?? '—'}</td>
                  <td className="num asw-num hide-mobile">{log.matched_swimmers ?? '—'}</td>
                  <td>
                    <span
                      className="tag"
                      style={{
                        border: `1px solid ${log.status === 'SUCCESS' || log.status === 'success' ? 'var(--asw-fast)' : log.status === 'FAILED' || log.status === 'failed' ? 'var(--asw-slow)' : 'var(--color-divider)'}`,
                        color: log.status === 'SUCCESS' || log.status === 'success' ? 'var(--asw-fast)' : log.status === 'FAILED' || log.status === 'failed' ? 'var(--asw-slow)' : 'var(--color-neutral-700)',
                      }}
                      title={log.error_message || undefined}
                    >
                      {log.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
