import { useState, useCallback } from 'react'
import Cropper from 'react-easy-crop'
import { ImagePlus } from 'lucide-react'
import { Modal, Button } from '../ui'

export default function PhotoUpload({ currentPhoto, onPhotoChange }) {
  const [imageSrc, setImageSrc] = useState(null)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [showModal, setShowModal] = useState(false)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null)

  const onFileSelect = (e) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = () => {
        setImageSrc(reader.result)
        setShowModal(true)
      }
      reader.readAsDataURL(file)
    }
  }

  const onCropComplete = useCallback((_, croppedPixels) => {
    setCroppedAreaPixels(croppedPixels)
  }, [])

  const handleCancel = () => {
    setShowModal(false)
    setImageSrc(null)
  }

  const handleApply = async () => {
    if (!imageSrc || !croppedAreaPixels) return
    const canvas = document.createElement('canvas')
    const image = new Image()
    image.src = imageSrc
    await new Promise((resolve) => { image.onload = resolve })
    canvas.width = croppedAreaPixels.width
    canvas.height = croppedAreaPixels.height
    const ctx = canvas.getContext('2d')
    ctx.drawImage(
      image,
      croppedAreaPixels.x, croppedAreaPixels.y,
      croppedAreaPixels.width, croppedAreaPixels.height,
      0, 0, croppedAreaPixels.width, croppedAreaPixels.height
    )
    canvas.toBlob((blob) => {
      onPhotoChange(blob)
      setShowModal(false)
      setImageSrc(null)
    }, 'image/jpeg')
  }

  return (
    <div>
      <div className="w-24 h-24 rounded-full bg-ink-50 border-2 border-dashed border-ink-200 hover:border-aqua-500/40 flex items-center justify-center overflow-hidden cursor-pointer relative">
        {currentPhoto ? (
          <img src={typeof currentPhoto === 'string' ? currentPhoto : URL.createObjectURL(currentPhoto)} alt="Profile" className="w-full h-full object-cover" />
        ) : (
          <div className="text-center text-ink-400 p-2">
            <ImagePlus size={20} className="mx-auto" />
            <div className="text-body-sm mt-1">Upload</div>
          </div>
        )}
        <input type="file" accept="image/*" onChange={onFileSelect} className="absolute inset-0 opacity-0 cursor-pointer" aria-label="Upload photo" />
      </div>

      <Modal
        open={showModal}
        onClose={handleCancel}
        title="Edit Image"
        footer={
          <>
            <Button variant="secondary" onClick={handleCancel}>Cancel</Button>
            <Button onClick={handleApply}>Apply &amp; Crop</Button>
          </>
        }
      >
        <div className="relative h-64 bg-ink-950 rounded-md overflow-hidden">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>
        <div className="mt-4">
          <label className="text-label text-ink-500 block mb-1.5">Circle Size</label>
          <input
            type="range" min={1} max={3} step={0.1} value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="w-full accent-aqua-600"
          />
        </div>
      </Modal>
    </div>
  )
}
