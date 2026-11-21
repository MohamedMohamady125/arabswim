import { useState, useCallback, useEffect } from 'react'
import { Crop } from 'lucide-react'
import Cropper from 'react-easy-crop'
import smartcrop from 'smartcrop'
import { Modal, notify } from './ui'
import { IMAGE_KINDS } from './Pic'
import { mediaUrl } from '../utils'

// Content-aware auto-framing: smartcrop.js scores edges/skin/saturation to
// find the best crop of the given aspect; when the browser ships the native
// FaceDetector API, detected faces boost the score so people stay in frame.
// Returns {x, y, width, height} in source pixels, or null (caller falls back
// to the default centered crop).
async function suggestCrop(img, aspect) {
  try {
    const w = img.naturalWidth || img.width
    const h = img.naturalHeight || img.height
    if (!w || !h) return null
    const target = w / h > aspect
      ? { width: Math.round(h * aspect), height: h }
      : { width: w, height: Math.round(w / aspect) }
    let boost = []
    if (typeof window !== 'undefined' && 'FaceDetector' in window) {
      try {
        const faces = await new window.FaceDetector({ fastMode: true, maxDetectedFaces: 5 }).detect(img)
        boost = faces.map((f) => ({
          x: f.boundingBox.x, y: f.boundingBox.y,
          width: f.boundingBox.width, height: f.boundingBox.height, weight: 1.0,
        }))
      } catch { /* detector unavailable or failed — scores alone still work */ }
    }
    const { topCrop } = await smartcrop.crop(img, { ...target, boost })
    return topCrop || null
  } catch {
    return null
  }
}

// Longest output side when the image kind does not set its own — keeps
// uploads light; the server caps and re-encodes again on save.
const MAX_SIDE = 1600

// Crop the image on a canvas and return a Blob.
// PNG sources stay PNG so logo transparency survives; everything else → JPEG.
// The crop frame may reach past the picture (zoomed out to fit the whole
// image): the empty part is transparent for PNG and white for JPEG.
async function getCroppedBlob(imageSrc, crop, rotation = 0, mime = 'image/jpeg', maxSide = MAX_SIDE) {
  const img = new Image()
  img.crossOrigin = 'anonymous'
  await new Promise((resolve, reject) => {
    img.onload = resolve
    img.onerror = reject
    img.src = imageSrc
  })
  const rad = (rotation * Math.PI) / 180
  const bW = Math.abs(Math.cos(rad) * img.width) + Math.abs(Math.sin(rad) * img.height)
  const bH = Math.abs(Math.sin(rad) * img.width) + Math.abs(Math.cos(rad) * img.height)
  const stage = document.createElement('canvas')
  stage.width = bW
  stage.height = bH
  const sctx = stage.getContext('2d')
  sctx.translate(bW / 2, bH / 2)
  sctx.rotate(rad)
  sctx.translate(-img.width / 2, -img.height / 2)
  sctx.drawImage(img, 0, 0)

  const scale = Math.min(1, maxSide / Math.max(crop.width, crop.height))
  const out = document.createElement('canvas')
  out.width = Math.max(1, Math.round(crop.width * scale))
  out.height = Math.max(1, Math.round(crop.height * scale))
  const octx = out.getContext('2d')
  if (mime === 'image/jpeg') { octx.fillStyle = '#fff'; octx.fillRect(0, 0, out.width, out.height) }
  octx.imageSmoothingQuality = 'high'
  octx.drawImage(stage, 0, 0, bW, bH, -crop.x * scale, -crop.y * scale, bW * scale, bH * scale)
  return new Promise((resolve, reject) => out.toBlob((b) => (b ? resolve(b) : reject(new Error('empty'))), mime, mime === 'image/jpeg' ? 0.9 : undefined))
}

// Zooming out below 1 lets a whole image sit inside a frame of another shape
// (a wide logo in a square, a tall poster in a landscape cover) with padding.
const MIN_ZOOM = 0.2
// react-easy-crop sizes the picture to contain the frame's box at zoom 1, so
// the zoom that shows all of it is the ratio of the two shapes.
const fitZoom = (imgAspect, frameAspect) => (imgAspect > frameAspect ? frameAspect / imgAspect : imgAspect / frameAspect)

const ASPECTS = [
  { key: 'original', label: 'Original' },
  { key: 1, label: 'Square' },
  { key: 4 / 5, label: '4:5' },
  { key: 3 / 4, label: '3:4' },
  { key: 16 / 9, label: '16:9' },
]

/**
 * Instagram-style image crop / position / zoom modal (drag to move, pinch,
 * scroll or use the slider to zoom). There is no rotate control: photos are
 * turned upright automatically from their EXIF data on the server.
 * Props:
 *   file        — the File selected by the user
 *   kind        — key of IMAGE_KINDS (components/Pic.jsx): sets the frame, whether it
 *                 can be changed, and the output size, to match where the image is shown
 *   aspect      — starting aspect ratio when no kind is given
 *   lockAspect  — hide the aspect-ratio picker (crop must match the slot, e.g. avatars)
 *   onDone      — (croppedFile: File) => void
 *   onCancel    — () => void
 */
export default function ImageCropper({ file, kind, aspect: aspectProp = 1, lockAspect: lockProp = false, smart: smartProp = false, onDone, onCancel, title = 'Adjust photo', note = null, extraAction = null, applyLabel = 'Apply' }) {
  const spec = (kind && IMAGE_KINDS[kind]) || null
  const aspect = spec ? spec.aspect : aspectProp
  const lockAspect = spec ? spec.lock : lockProp
  const smart = spec ? !!spec.smart : smartProp
  const [imageSrc, setImageSrc] = useState(null)
  const [naturalAspect, setNaturalAspect] = useState(1)
  const [natural, setNatural] = useState(null)
  const [aspectKey, setAspectKey] = useState(aspect)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedArea, setCroppedArea] = useState(null)
  const [saving, setSaving] = useState(false)
  // smart mode: hold the cropper until the suggested frame is known, then
  // mount it pre-positioned via initialCroppedAreaPixels (applies on mount)
  const [smartArea, setSmartArea] = useState(null)
  const [smartPending, setSmartPending] = useState(smart)

  useEffect(() => {
    if (!file) return
    // Postel's Law: say plainly what is wrong with a file instead of opening a blank tool
    if (file.type && !file.type.startsWith('image/')) {
      notify('That file is not an image. Choose a JPG, PNG or WebP.', 'error')
      onCancel()
      return
    }
    const reader = new FileReader()
    reader.onload = () => setImageSrc(reader.result)
    reader.onerror = () => { notify('Could not read that file. Try another image.', 'error'); onCancel() }
    reader.readAsDataURL(file)
  }, [file]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!imageSrc) return
    const img = new Image()
    img.onload = async () => {
      setNaturalAspect(img.width / img.height || 1)
      setNatural({ w: img.width, h: img.height })
      if (smart && typeof aspect === 'number') {
        const area = await suggestCrop(img, aspect)
        setSmartArea(area)
      }
      setSmartPending(false)
    }
    img.onerror = () => {
      // e.g. an iPhone HEIC picked on a desktop browser, or a damaged file
      notify('This image format cannot be opened here. Save it as JPG or PNG and try again.', 'error')
      onCancel()
    }
    img.src = imageSrc
  }, [imageSrc, smart, aspect]) // eslint-disable-line react-hooks/exhaustive-deps

  const onCropComplete = useCallback((_, area) => {
    setCroppedArea(area)
  }, [])

  const handleDone = async () => {
    if (!croppedArea || !imageSrc) return
    setSaving(true)
    try {
      const isPng = file.type === 'image/png'
      const mime = isPng ? 'image/png' : 'image/jpeg'
      const blob = await getCroppedBlob(imageSrc, croppedArea, 0, mime, spec?.maxSide || MAX_SIDE)
      const cropped = new File([blob], file.name.replace(/\.\w+$/, isPng ? '.png' : '.jpg'), { type: mime })
      onDone(cropped)
    } catch {
      onDone(file) // fallback to original
    }
  }

  if (!imageSrc) return null
  const activeAspect = aspectKey === 'original' ? naturalAspect : aspectKey
  const minSide = spec?.minSide || 0
  const tooSmall = natural && minSide && Math.min(natural.w, natural.h) < minSide

  const chip = (active) => ({
    // Fitts's Law: 32px tall chips
    display: 'inline-flex', alignItems: 'center', minHeight: 32,
    padding: '4px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer',
    border: `1px solid ${active ? 'var(--color-accent-800)' : 'var(--color-neutral-300)'}`,
    background: active ? 'var(--color-accent-800)' : '#fff',
    color: active ? '#fff' : 'var(--color-neutral-700)',
  })

  return (
    <Modal title={title} onClose={onCancel} width={520}>
      <div style={{ position: 'relative', width: '100%', height: 340, background: kind === 'person' ? 'var(--asw-portrait-bg)' : '#111', borderRadius: 8, overflow: 'hidden' }}>
        {smartPending ? (
          <div role="status" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 13, fontWeight: 600, letterSpacing: '0.08em' }}>
            Framing the subject…
          </div>
        ) : (
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={activeAspect}
            minZoom={MIN_ZOOM}
            maxZoom={4}
            restrictPosition={false}
            initialCroppedAreaPixels={smartArea || undefined}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        )}
      </div>
      {smart && smartArea && !smartPending && (
        <div className="micro" style={{ marginTop: 8, textTransform: 'none', letterSpacing: 0, fontSize: 12, color: 'var(--color-neutral-700)' }}>
          Auto-framed on the subject — drag or zoom to adjust before applying.
        </div>
      )}

      {/* Mental Model: say now what the site will do to the photo after upload */}
      {note && <div style={{ marginTop: 8, fontSize: 12, color: 'var(--color-neutral-600)' }}>{note}</div>}
      {tooSmall && (
        <div role="status" style={{ marginTop: 8, fontSize: 12, fontWeight: 600, color: 'var(--asw-slow)' }}>
          This image is small ({natural.w} × {natural.h} px) and may look soft. Use one at least {minSide} px on its shorter side if you can.
        </div>
      )}

      {!lockAspect && (
        <div style={{ marginTop: 12, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="micro" style={{ flex: 'none' }}>Frame</span>
          {ASPECTS.map((a) => (
            <button key={a.label} type="button" aria-pressed={aspectKey === a.key} style={chip(aspectKey === a.key)} onClick={() => setAspectKey(a.key)}>
              {a.label}
            </button>
          ))}
        </div>
      )}

      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
        <span className="micro" style={{ flex: 'none', width: 42 }}>Zoom</span>
        <input
          type="range" aria-label="Zoom" min={MIN_ZOOM} max={4} step={0.05} value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          style={{ flex: 1 }}
        />
        <button type="button" className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }}
          title="Show the whole image inside the frame"
          onClick={() => { setZoom(Math.max(MIN_ZOOM, Math.min(1, fitZoom(naturalAspect, activeAspect)))); setCrop({ x: 0, y: 0 }) }}>
          Fit all
        </button>
      </div>

      {/* Serial Position: Cancel first, the one solid action last */}
      <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-secondary" style={{ marginRight: 'auto' }} onClick={onCancel}>Cancel</button>
        {extraAction && (
          <button type="button" className="btn btn-secondary" onClick={extraAction.onClick}>{extraAction.label}</button>
        )}
        <button type="button" className="btn btn-primary" onClick={handleDone} disabled={saving}>
          {saving ? 'Applying…' : applyLabel}
        </button>
      </div>
    </Modal>
  )
}

/** A stored upload (URL or media path) as a File, so it can be opened in the
 *  crop tool without the person choosing it from their device again. */
export async function fileFromUrl(url) {
  const full = mediaUrl(url)
  const res = await fetch(full)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const blob = await res.blob()
  const name = decodeURIComponent(full.split('?')[0].split('/').pop() || 'photo.jpg')
  return new File([blob], name, { type: blob.type || 'image/jpeg' })
}

/**
 * "Crop and zoom" for a photo that is already on the site (album photo,
 * partner logo…): opens the saved picture in the tool and hands the re-framed
 * File to onDone, which saves it. Nothing is chosen from the device.
 * Props: src (saved image), kind, onDone(file) (may be async), label, iconOnly
 */
export function EditPhotoButton({ src, kind, onDone, label = 'Crop and zoom', iconOnly = false, className = 'btn btn-secondary', style }) {
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const open = async () => {
    setBusy(true)
    try {
      setFile(await fileFromUrl(src))
    } catch {
      notify('The saved photo could not be opened. Upload it again to change it.', 'error')
    } finally {
      setBusy(false)
    }
  }
  const done = async (f) => {
    setFile(null)
    setBusy(true)
    try { await onDone(f) } finally { setBusy(false) }
  }
  if (!src) return null
  return (
    <>
      <button type="button" className={className} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, ...style }}
        onClick={open} disabled={busy} aria-busy={busy} aria-label={label} title={label}>
        <Crop size={13} aria-hidden="true" />{!iconOnly && (busy ? 'Working…' : label)}
      </button>
      {file && <ImageCropper file={file} kind={kind} applyLabel="Save" onDone={done} onCancel={() => setFile(null)} />}
    </>
  )
}

/**
 * Drop-in photo control: every pick goes through the crop / zoom modal before
 * the final File reaches the caller.
 *
 * With `current` (the photo already saved) or once a file has been picked it
 * also shows the photo and a "Crop and zoom" button that reopens the tool on
 * it — nobody has to upload a photo again just to re-frame it.
 * Props: onChange(file), kind (preferred) or aspect + lockAspect, current,
 *        accept, className, style
 */
export function CropUpload({ onChange, kind, note, current, aspect = 1, lockAspect = false, smart = false, accept = 'image/jpeg,image/png,image/webp', className = 'input', style, ariaLabel = 'Choose an image' }) {
  const [cropFile, setCropFile] = useState(null)   // open in the tool right now
  const [source, setSource] = useState(null)       // the picture being framed (picked, or the saved one)
  const [preview, setPreview] = useState(null)     // the framed result, not saved yet
  const [busy, setBusy] = useState(false)
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])
  const [missing, setMissing] = useState(false)   // the saved file is gone: nothing to show or re-frame
  const shown = preview || (current && !missing ? mediaUrl(current) : null)
  const contain = !!(kind && IMAGE_KINDS[kind]?.fit === 'contain')

  const adjust = async () => {
    if (source) { setCropFile(source); return }
    setBusy(true)   // Doherty Threshold: the button answers at once while the photo loads
    try {
      const f = await fileFromUrl(current)
      setSource(f)
      setCropFile(f)
    } catch {
      notify('The saved photo could not be opened. Choose the file again to change it.', 'error')
    } finally {
      setBusy(false)
    }
  }

  const input = (
    <input
      className={className} style={style} type="file" accept={accept} aria-label={shown ? 'Replace with another image' : ariaLabel}
      onChange={(e) => { const f = e.target.files?.[0]; if (f) { setSource(f); setCropFile(f) } e.target.value = '' }}
    />
  )
  const tool = cropFile && (
    <ImageCropper
      file={cropFile} kind={kind} note={note} aspect={aspect} lockAspect={lockAspect} smart={smart}
      onDone={(f) => { setPreview(URL.createObjectURL(f)); onChange(f); setCropFile(null) }}
      onCancel={() => setCropFile(null)}
    />
  )
  if (!shown) return <>{input}{tool}</>
  return (
    <div className="cropup">
      {/* Proximity: the photo, the way to re-frame it and the way to replace it sit together */}
      <div className="cropup-now">
        <img className={`cropup-thumb${kind === 'person' ? ' is-person' : ''}${contain ? ' is-contain' : ''}`} src={shown} alt="" onError={() => { if (!preview) setMissing(true) }} />
        <div className="cropup-acts">
          <button type="button" className="btn btn-secondary" onClick={adjust} disabled={busy} aria-busy={busy}>
            <Crop size={14} aria-hidden="true" /> {busy ? 'Opening…' : 'Crop and zoom'}
          </button>
          <span className="cropup-hint">{preview ? 'Ready. Save to keep it.' : 'Or choose another below.'}</span>
        </div>
      </div>
      {input}
      {tool}
    </div>
  )
}

/**
 * Sequential crop flow for multi-photo uploads (albums, meet galleries).
 * Shows the crop modal for each picked photo in turn; the admin can crop,
 * keep the original as-is, or cancel the whole batch.
 * Props: files (File[]), aspect, onDone(files: File[]), onCancel()
 */
export function CropQueue({ files, kind, aspect = 'original', onDone, onCancel }) {
  const [idx, setIdx] = useState(0)
  const [out, setOut] = useState([])
  if (!files?.length) return null
  const last = idx + 1 >= files.length
  const advance = (f) => {
    const acc = [...out, f]
    if (!last) { setOut(acc); setIdx(idx + 1) }
    else onDone(acc)
  }
  // Flow: cancelling part-way would silently throw away the photos already adjusted
  const cancel = () => {
    if (out.length > 0 && !window.confirm(`Stop and discard the ${out.length} photo${out.length === 1 ? '' : 's'} you already adjusted? Nothing will be uploaded.`)) return
    onCancel()
  }
  return (
    <ImageCropper
      key={idx}
      file={files[idx]}
      kind={kind}
      aspect={aspect}
      // Goal-Gradient: the title counts the photos; the button says what happens next
      title={files.length > 1 ? `Adjust photo ${idx + 1} of ${files.length}` : 'Adjust photo'}
      applyLabel={last ? (files.length > 1 ? 'Apply and upload all' : 'Apply and upload') : 'Apply · next photo →'}
      extraAction={{ label: 'Use original', onClick: () => advance(files[idx]) }}
      onDone={advance}
      onCancel={cancel}
    />
  )
}
