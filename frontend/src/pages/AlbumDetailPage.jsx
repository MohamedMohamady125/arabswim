import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ImagePlus, Video, Trash2, X, Play } from 'lucide-react'
import { getAlbum, uploadPhotos, createMediaItem, deleteMediaItem, updateMediaItem } from '../api/media'
import { useToast } from '../context/ToastContext'

export default function AlbumDetailPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const { id } = useParams()

  const [album, setAlbum] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [videoUrl, setVideoUrl] = useState('')
  const [lightbox, setLightbox] = useState(null)

  const load = () => {
    getAlbum(id).then((res) => setAlbum(res.data)).catch(() => toast.error('Failed to load album'))
  }

  useEffect(load, [id])

  const onFilesSelect = async (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('album', id)
      files.forEach((f) => fd.append('images', f))
      await uploadPhotos(fd)
      toast.success(`${files.length} photo${files.length > 1 ? 's' : ''} uploaded`)
      load()
    } catch {
      toast.error('Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const addVideo = async (e) => {
    e.preventDefault()
    if (!videoUrl.trim()) return
    try {
      await createMediaItem({ album: id, media_type: 'VIDEO', video_url: videoUrl.trim() })
      setVideoUrl('')
      toast.success('Video added')
      load()
    } catch {
      toast.error('Failed to add video (check the URL)')
    }
  }

  const handleDeleteItem = async (item) => {
    if (!window.confirm('Delete this item?')) return
    try {
      await deleteMediaItem(item.id)
      setAlbum((a) => ({ ...a, items: a.items.filter((i) => i.id !== item.id) }))
      toast.success('Item deleted')
    } catch {
      toast.error('Failed to delete item')
    }
  }

  const saveCaption = async (item, caption) => {
    if (caption === (item.caption || '')) return
    try {
      await updateMediaItem(item.id, { caption })
      setAlbum((a) => ({ ...a, items: a.items.map((i) => i.id === item.id ? { ...i, caption } : i) }))
    } catch {
      toast.error('Failed to save caption')
    }
  }

  if (!album) return <div className="text-center text-gray-400 py-20">Loading...</div>

  const items = album.items || []

  return (
    <div className="max-w-6xl mx-auto">
      <button onClick={() => navigate('/media')} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-4">
        <ArrowLeft size={15} /> Back to Media
      </button>

      <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">{album.title}</h1>
          {album.description && <p className="text-gray-500 text-sm mt-1">{album.description}</p>}
          <div className="text-xs text-gray-400 mt-1">{items.length} item{items.length === 1 ? '' : 's'}</div>
        </div>
        <div className="flex items-center gap-3">
          <form onSubmit={addVideo} className="flex gap-2">
            <input type="url" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="YouTube / Instagram link..."
              className="border rounded-lg px-3 py-2 text-sm bg-white w-56" />
            <button type="submit" className="flex items-center gap-1.5 border border-gray-300 bg-white px-3 py-2 rounded-lg text-sm hover:bg-gray-50">
              <Video size={14} /> Add
            </button>
          </form>
          <label className={`flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 cursor-pointer ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
            <ImagePlus size={15} /> {uploading ? 'Uploading...' : 'Add Photos'}
            <input type="file" accept="image/*" multiple onChange={onFilesSelect} className="hidden" />
          </label>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
          Empty album. Add photos or a video link.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {items.map((item) => (
            <div key={item.id} className="group bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="h-40 bg-gray-900 relative cursor-pointer"
                onClick={() => item.media_type === 'VIDEO' && item.video_url
                  ? window.open(item.video_url, '_blank')
                  : setLightbox(item)}>
                {item.media_type === 'PHOTO' && item.image ? (
                  <img src={item.image} alt={item.caption} className="w-full h-full object-cover" />
                ) : item.embed_thumbnail ? (
                  <>
                    <img src={item.embed_thumbnail} alt={item.caption} className="w-full h-full object-cover opacity-80" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="bg-black/60 rounded-full p-3"><Play size={18} className="text-white" /></div>
                    </div>
                  </>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 gap-2">
                    <Video size={26} />
                    <span className="text-[10px] px-3 text-center truncate w-full">{item.video_url}</span>
                  </div>
                )}
                <button onClick={(e) => { e.stopPropagation(); handleDeleteItem(item) }}
                  className="absolute top-2 right-2 bg-black/50 text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 hover:bg-red-600 transition-opacity">
                  <Trash2 size={13} />
                </button>
              </div>
              <input
                type="text" defaultValue={item.caption || ''} placeholder="Add a caption..."
                onBlur={(e) => saveCaption(item, e.target.value)}
                className="w-full px-3 py-2 text-xs text-gray-600 focus:outline-none focus:bg-blue-50"
              />
            </div>
          ))}
        </div>
      )}

      {lightbox && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-6" onClick={() => setLightbox(null)}>
          <button className="absolute top-5 right-5 text-white/70 hover:text-white"><X size={26} /></button>
          <img src={lightbox.image} alt={lightbox.caption} className="max-h-full max-w-full object-contain rounded-lg" />
          {lightbox.caption && (
            <div className="absolute bottom-6 left-0 right-0 text-center text-white/80 text-sm">{lightbox.caption}</div>
          )}
        </div>
      )}
    </div>
  )
}
