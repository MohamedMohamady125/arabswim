import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ImagePlus, Video, Trash2, X, Play, Image } from 'lucide-react'
import { getAlbum, uploadPhotos, createMediaItem, deleteMediaItem, updateMediaItem } from '../api/media'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'
import { Button, Input, EmptyState, ConfirmDialog, CardsSkeleton, PageHeader } from '../components/ui'

export default function AlbumDetailPage() {
  const toast = useToast()
  const { id } = useParams()
  const { token } = useAuth()
  const isAdmin = !!token

  const [album, setAlbum] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [videoUrl, setVideoUrl] = useState('')
  const [lightbox, setLightbox] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null)

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
    try {
      await deleteMediaItem(item.id)
      setAlbum((a) => ({ ...a, items: a.items.filter((i) => i.id !== item.id) }))
      toast.success('Item deleted')
    } catch {
      toast.error('Failed to delete item')
    } finally {
      setPendingDelete(null)
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

  if (!album) {
    return (
      <div className="max-w-7xl mx-auto">
        <CardsSkeleton count={8} />
      </div>
    )
  }

  const items = album.items || []

  return (
    <div className="max-w-7xl mx-auto animate-fade-up">
      <PageHeader
        breadcrumb={[{ label: 'Media', to: '/media' }, { label: album.title }]}
        title={album.title}
        subtitle={
          album.description
            ? `${album.description} · ${items.length} item${items.length === 1 ? '' : 's'}`
            : `${items.length} item${items.length === 1 ? '' : 's'}`
        }
        action={isAdmin && (
          <div className="flex items-center gap-2 flex-wrap">
            <form onSubmit={addVideo} className="flex gap-2">
              <Input type="url" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="YouTube / video link..." className="w-40 sm:w-56 min-w-0" />
              <Button type="submit" variant="secondary" size="md" icon={Video}>Add</Button>
            </form>
            <label className={`inline-flex items-center justify-center gap-2 h-10 px-4 rounded-sm text-body-sm font-medium cursor-pointer transition-colors bg-white text-ink-900 border border-ink-200 hover:border-aqua-500/40 hover:bg-aqua-50 ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
              <ImagePlus size={16} /> {uploading ? 'Uploading...' : 'Add Photos'}
              <input type="file" accept="image/*" multiple onChange={onFilesSelect} className="hidden" />
            </label>
          </div>
        )}
      />

      {items.length === 0 ? (
        <div className="bg-white rounded-md shadow-card border border-ink-100">
          <EmptyState icon={Image} title="Empty album" hint="Photos and videos will appear here." />
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
          {items.map((item) => (
            <figure key={item.id}
              className="group bg-white rounded-md shadow-card border border-ink-100 overflow-hidden transition-colors hover:border-aqua-500/40 m-0">
              <div className="aspect-[4/3] bg-ink-900 relative cursor-pointer"
                onClick={() => item.media_type === 'VIDEO' && item.video_url
                  ? window.open(item.video_url, '_blank')
                  : setLightbox(item)}>
                {item.media_type === 'PHOTO' && item.image ? (
                  <img src={item.image} alt={item.caption} className="w-full h-full object-cover" />
                ) : item.embed_thumbnail ? (
                  <>
                    <img src={item.embed_thumbnail} alt={item.caption} className="w-full h-full object-cover opacity-80" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="bg-ink-950/60 rounded-full p-3"><Play size={18} className="text-white" /></div>
                    </div>
                  </>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-ink-400 gap-2">
                    <Video size={26} />
                    <span className="text-body-sm px-3 text-center truncate w-full">{item.video_url}</span>
                  </div>
                )}
                {isAdmin && (
                  <button onClick={(e) => { e.stopPropagation(); setPendingDelete(item) }}
                    aria-label="Delete item"
                    className="absolute top-2 end-2 bg-ink-950/60 text-white rounded-full p-2 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-neg transition-opacity">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
              {isAdmin ? (
                <input
                  type="text" defaultValue={item.caption || ''} placeholder="Add a caption..."
                  onBlur={(e) => saveCaption(item, e.target.value)}
                  className="w-full h-10 px-3 text-body-sm text-ink-500 bg-white focus:outline-none focus:bg-aqua-50"
                />
              ) : item.caption ? (
                <figcaption className="px-3 py-2 text-body-sm text-ink-500 truncate">{item.caption}</figcaption>
              ) : null}
            </figure>
          ))}
        </div>
      )}

      {lightbox && (
        <div className="fixed inset-0 bg-ink-950/90 backdrop-blur-sm z-50 flex items-center justify-center p-4 sm:p-8 animate-fade-in"
          onClick={() => setLightbox(null)}>
          <button aria-label="Close"
            className="absolute top-4 end-4 p-2 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors">
            <X size={24} />
          </button>
          <img src={lightbox.image} alt={lightbox.caption} className="max-h-full max-w-full object-contain rounded-md shadow-pop" />
          {lightbox.caption && (
            <div className="absolute bottom-6 inset-x-0 text-center text-white/80 text-body px-4">{lightbox.caption}</div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete item"
        message="Delete this item? This cannot be undone."
        destructive
        onConfirm={() => handleDeleteItem(pendingDelete)}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}
