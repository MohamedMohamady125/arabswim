import { useState, useCallback } from 'react'
import Cropper from 'react-easy-crop'

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
      <div className="w-24 h-24 rounded-full bg-gray-100 border-2 border-dashed border-gray-300 flex items-center justify-center overflow-hidden cursor-pointer relative">
        {currentPhoto ? (
          <img src={typeof currentPhoto === 'string' ? currentPhoto : URL.createObjectURL(currentPhoto)} alt="Profile" className="w-full h-full object-cover" />
        ) : (
          <div className="text-center text-xs text-gray-400 p-2">Click or drag to upload</div>
        )}
        <input type="file" accept="image/*" onChange={onFileSelect} className="absolute inset-0 opacity-0 cursor-pointer" />
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-[500px] max-w-[90vw]">
            <h3 className="text-lg font-semibold mb-4">Edit Image</h3>
            <div className="relative h-64 bg-gray-900 rounded-lg overflow-hidden">
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
              <label className="text-sm text-gray-600">Circle Size</label>
              <input type="range" min={1} max={3} step={0.1} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="w-full" />
            </div>
            <div className="flex justify-end gap-3 mt-4">
              <button onClick={() => { setShowModal(false); setImageSrc(null) }} className="px-4 py-2 border rounded-lg">Cancel</button>
              <button onClick={handleApply} className="px-4 py-2 bg-blue-600 text-white rounded-lg">Apply & Crop</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
