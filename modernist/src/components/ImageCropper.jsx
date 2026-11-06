import { useState, useCallback, useEffect } from 'react'
import Cropper from 'react-easy-crop'
import smartcrop from 'smartcrop'
import { Modal } from './ui'

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

// Longest output side — keeps uploads light and rendering fast on phones
const MAX_SIDE = 1600

// Crop (and optionally rotate) the image on a canvas and return a Blob.
// PNG sources stay PNG so logo transparency survives; everything else → JPEG.
async function getCroppedBlob(imageSrc, crop, rotation = 0, mime = 'image/jpeg') {
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

  const scale = Math.min(1, MAX_SIDE / Math.max(crop.width, crop.height))
  const out = document.createElement('canvas')
  out.width = Math.max(1, Math.round(crop.width * scale))
  out.height = Math.max(1, Math.round(crop.height * scale))
  out.getContext('2d').drawImage(stage, crop.x, crop.y, crop.width, crop.height, 0, 0, out.width, out.height)
  return new Promise((resolve) => out.toBlob(resolve, mime, mime === 'image/jpeg' ? 0.9 : undefined))
}

const ASPECTS = [
  { key: 'original', label: 'Original' },
  { key: 1, label: 'Square' },
  { key: 4 / 5, label: '4:5' },
  { key: 3 / 4, label: '3:4' },
  { key: 16 / 9, label: '16:9' },
]

/**
 * Instagram-style image crop / position / adjust modal.
 * Props:
 *   file        — the File selected by the user
 *   aspect      — starting aspect ratio (default 1 = square, 4/5 for portraits, 16/9 etc.)
 *   lockAspect  — hide the aspect-ratio picker (crop must match the slot, e.g. avatars)
 *   onDone      — (croppedFile: File) => void
 *   onCancel    — () => void
 */
export default function ImageCropper({ file, aspect = 1, lockAspect = false, smart = false, onDone, onCancel, title = 'Adjust photo', extraAction = null }) {
  const [imageSrc, setImageSrc] = useState(null)
  const [naturalAspect, setNaturalAspect] = useState(1)
  const [aspectKey, setAspectKey] = useState(aspect)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [croppedArea, setCroppedArea] = useState(null)
  const [saving, setSaving] = useState(false)
  // smart mode: hold the cropper until the suggested frame is known, then
  // mount it pre-positioned via initialCroppedAreaPixels (applies on mount)
  const [smartArea, setSmartArea] = useState(null)
  const [smartPending, setSmartPending] = useState(smart)

  useEffect(() => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setImageSrc(reader.result)
    reader.readAsDataURL(file)
  }, [file])

  useEffect(() => {
    if (!imageSrc) return
    const img = new Image()
    img.onload = async () => {
      setNaturalAspect(img.width / img.height || 1)
      if (smart && typeof aspect === 'number') {
        const area = await suggestCrop(img, aspect)
        setSmartArea(area)
      }
      setSmartPending(false)
    }
    img.onerror = () => setSmartPending(false)
    img.src = imageSrc
  }, [imageSrc, smart, aspect])

  const onCropComplete = useCallback((_, area) => {
    setCroppedArea(area)
  }, [])

  const handleDone = async () => {
    if (!croppedArea || !imageSrc) return
    setSaving(true)
    try {
      const isPng = file.type === 'image/png'
      const mime = isPng ? 'image/png' : 'image/jpeg'
      const blob = await getCroppedBlob(imageSrc, croppedArea, rotation, mime)
      const cropped = new File([blob], file.name.replace(/\.\w+$/, isPng ? '.png' : '.jpg'), { type: mime })
      onDone(cropped)
    } catch {
      onDone(file) // fallback to original
    }
  }

  if (!imageSrc) return null
  const activeAspect = aspectKey === 'original' ? naturalAspect : aspectKey

  const chip = (active) => ({
    padding: '4px 10px', borderRadius: 999, fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
    border: `1px solid ${active ? 'var(--color-accent-800)' : 'var(--color-neutral-300)'}`,
    background: active ? 'var(--color-accent-800)' : '#fff',
    color: active ? '#fff' : 'var(--color-neutral-700)',
  })

  return (
    <Modal title={title} onClose={onCancel} width={520}>
      <div style={{ position: 'relative', width: '100%', height: 340, background: '#111', borderRadius: 8, overflow: 'hidden' }}>
        {smartPending ? (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 13, fontWeight: 600, letterSpacing: '0.04em' }}>
            Framing the subject…
          </div>
        ) : (
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            rotation={rotation}
            aspect={activeAspect}
            initialCroppedAreaPixels={smartArea || undefined}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onRotationChange={setRotation}
            onCropComplete={onCropComplete}
          />
        )}
      </div>
      {smart && smartArea && !smartPending && (
        <div className="micro" style={{ marginTop: 8, textTransform: 'none', letterSpacing: 0, fontSize: 11.5, color: 'var(--color-neutral-700)' }}>
          Auto-framed on the subject — drag or zoom to adjust before applying.
        </div>
      )}

      {!lockAspect && (
        <div style={{ marginTop: 12, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="micro" style={{ flex: 'none' }}>Frame</span>
          {ASPECTS.map((a) => (
            <button key={a.label} type="button" style={chip(aspectKey === a.key)} onClick={() => setAspectKey(a.key)}>
              {a.label}
            </button>
          ))}
        </div>
      )}

      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
        <span className="micro" style={{ flex: 'none', width: 42 }}>Zoom</span>
        <input
          type="range" min={1} max={4} step={0.05} value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          style={{ flex: 1 }}
        />
      </div>
      <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
        <span className="micro" style={{ flex: 'none', width: 42 }}>Rotate</span>
        <input
          type="range" min={-45} max={45} step={1} value={rotation > 180 ? rotation - 360 : rotation}
          onChange={(e) => setRotation(Number(e.target.value))}
          style={{ flex: 1 }}
        />
        <button type="button" className="btn btn-secondary" style={{ fontSize: 11.5, padding: '4px 10px' }}
          onClick={() => setRotation((r) => (r + 90) % 360)}>
          90°
        </button>
      </div>

      <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
        {extraAction && (
          <button type="button" className="btn btn-secondary" onClick={extraAction.onClick}>{extraAction.label}</button>
        )}
        <button type="button" className="btn btn-primary" onClick={handleDone} disabled={saving}>
          {saving ? 'Applying…' : 'Apply'}
        </button>
      </div>
    </Modal>
  )
}

/**
 * Drop-in file input that always routes image picks through the crop/adjust
 * modal before handing the final File to the caller. Use anywhere an admin
 * uploads a photo.
 * Props: onChange(file), aspect, lockAspect, accept, className, style
 */
export function CropUpload({ onChange, aspect = 1, lockAspect = false, smart = false, accept = 'image/*', className = 'input', style }) {
  const [cropFile, setCropFile] = useState(null)
  return (
    <>
      <input
        className={className} style={style} type="file" accept={accept}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) setCropFile(f); e.target.value = '' }}
      />
      {cropFile && (
        <ImageCropper
          file={cropFile} aspect={aspect} lockAspect={lockAspect} smart={smart}
          onDone={(f) => { onChange(f); setCropFile(null) }}
          onCancel={() => setCropFile(null)}
        />
      )}
    </>
  )
}

/**
 * Sequential crop flow for multi-photo uploads (albums, meet galleries).
 * Shows the crop modal for each picked photo in turn; the admin can crop,
 * keep the original as-is, or cancel the whole batch.
 * Props: files (File[]), aspect, onDone(files: File[]), onCancel()
 */
export function CropQueue({ files, aspect = 'original', onDone, onCancel }) {
  const [idx, setIdx] = useState(0)
  const [out, setOut] = useState([])
  if (!files?.length) return null
  const advance = (f) => {
    const acc = [...out, f]
    if (idx + 1 < files.length) { setOut(acc); setIdx(idx + 1) }
    else onDone(acc)
  }
  return (
    <ImageCropper
      key={idx}
      file={files[idx]}
      aspect={aspect}
      title={files.length > 1 ? `Adjust photo ${idx + 1} of ${files.length}` : 'Adjust photo'}
      extraAction={{ label: 'Use original', onClick: () => advance(files[idx]) }}
      onDone={advance}
      onCancel={onCancel}
    />
  )
}
