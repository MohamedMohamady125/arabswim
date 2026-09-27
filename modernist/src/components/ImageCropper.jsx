import { useState, useCallback, useEffect } from 'react'
import Cropper from 'react-easy-crop'
import { Modal } from './ui'

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
export default function ImageCropper({ file, aspect = 1, lockAspect = false, onDone, onCancel }) {
  const [imageSrc, setImageSrc] = useState(null)
  const [naturalAspect, setNaturalAspect] = useState(1)
  const [aspectKey, setAspectKey] = useState(aspect)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [croppedArea, setCroppedArea] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setImageSrc(reader.result)
    reader.readAsDataURL(file)
  }, [file])

  useEffect(() => {
    if (!imageSrc) return
    const img = new Image()
    img.onload = () => setNaturalAspect(img.width / img.height || 1)
    img.src = imageSrc
  }, [imageSrc])

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
    <Modal title="Adjust photo" onClose={onCancel} width={520}>
      <div style={{ position: 'relative', width: '100%', height: 340, background: '#111', borderRadius: 8, overflow: 'hidden' }}>
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          rotation={rotation}
          aspect={activeAspect}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onRotationChange={setRotation}
          onCropComplete={onCropComplete}
        />
      </div>

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
export function CropUpload({ onChange, aspect = 1, lockAspect = false, accept = 'image/*', className = 'input', style }) {
  const [cropFile, setCropFile] = useState(null)
  return (
    <>
      <input
        className={className} style={style} type="file" accept={accept}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) setCropFile(f); e.target.value = '' }}
      />
      {cropFile && (
        <ImageCropper
          file={cropFile} aspect={aspect} lockAspect={lockAspect}
          onDone={(f) => { onChange(f); setCropFile(null) }}
          onCancel={() => setCropFile(null)}
        />
      )}
    </>
  )
}
