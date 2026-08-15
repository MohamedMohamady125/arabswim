import { useState, useCallback } from 'react'
import Cropper from 'react-easy-crop'
import { Modal } from './ui'

// Crop the image on a canvas and return a Blob
async function getCroppedBlob(imageSrc, crop) {
  const img = new Image()
  img.crossOrigin = 'anonymous'
  await new Promise((resolve, reject) => {
    img.onload = resolve
    img.onerror = reject
    img.src = imageSrc
  })
  const canvas = document.createElement('canvas')
  canvas.width = crop.width
  canvas.height = crop.height
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height)
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92))
}

/**
 * Instagram-style image crop modal.
 * Props:
 *   file       — the File selected by the user
 *   aspect     — aspect ratio (default 1 = square, 4/5 for portraits, 16/9 etc.)
 *   onDone     — (croppedFile: File) => void
 *   onCancel   — () => void
 */
export default function ImageCropper({ file, aspect = 1, onDone, onCancel }) {
  const [imageSrc, setImageSrc] = useState(null)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedArea, setCroppedArea] = useState(null)
  const [saving, setSaving] = useState(false)

  // Read file into data URL on mount
  useState(() => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setImageSrc(reader.result)
    reader.readAsDataURL(file)
  }, [file])

  const onCropComplete = useCallback((_, area) => {
    setCroppedArea(area)
  }, [])

  const handleDone = async () => {
    if (!croppedArea || !imageSrc) return
    setSaving(true)
    try {
      const blob = await getCroppedBlob(imageSrc, croppedArea)
      const cropped = new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' })
      onDone(cropped)
    } catch {
      onDone(file) // fallback to original
    }
  }

  if (!imageSrc) return null

  return (
    <Modal title="Crop Image" onClose={onCancel} width={520}>
      <div style={{ position: 'relative', width: '100%', height: 340, background: '#111' }}>
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          aspect={aspect}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropComplete}
        />
      </div>
      <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
        <span className="micro" style={{ flex: 'none' }}>Zoom</span>
        <input
          type="range" min={1} max={3} step={0.05} value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          style={{ flex: 1 }}
        />
      </div>
      <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn btn-primary" onClick={handleDone} disabled={saving}>
          {saving ? 'Cropping…' : 'Apply crop'}
        </button>
      </div>
    </Modal>
  )
}
