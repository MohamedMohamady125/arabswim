import { useState } from 'react'
import { Camera, Crop } from 'lucide-react'
import ImageCropper, { fileFromUrl } from './ImageCropper'
import { SWIMMER_PHOTO_NOTE } from './Pic'
import { notify } from './ui'
import { uploadSwimmerPhoto } from '../api/swimmers'

/**
 * "Add photo / Change photo" on a swimmer card, for the club, academy or
 * federation that owns the page (and the admin). The pick goes through the
 * crop tool like every other upload; the server cuts the swimmer out and
 * centres them. onSaved(url) hands the new photo back to the card.
 */
export default function SwimmerPhotoButton({ swimmer, hasPhoto, photo, onSaved }) {
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)   // the tool is open on the saved photo, not a new pick

  const send = async (cropped) => {
    setFile(null)
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('photo', cropped)
      const res = await uploadSwimmerPhoto(swimmer.id, fd)
      onSaved?.(res.data?.photo)
      notify(`Photo saved for ${swimmer.name}`)
    } catch (err) {
      notify(err.response?.data?.error || 'The photo could not be uploaded. Try again.', 'error')
    } finally {
      setBusy(false)
    }
  }

  // re-frame the saved photo without choosing it from the device again
  const adjust = async () => {
    setBusy(true)
    try {
      const f = await fileFromUrl(photo)
      setSaved(true)
      setFile(f)
    } catch {
      notify('The saved photo could not be opened. Choose the file again to change it.', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {hasPhoto && photo && (
        <button type="button" className="btn btn-secondary" onClick={adjust} disabled={busy}
          aria-label={`Crop and zoom the photo of ${swimmer.name}`}
          style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 40, fontSize: 12, marginTop: 8 }}>
          <Crop size={14} aria-hidden="true" /> Crop and zoom
        </button>
      )}
      {/* Fitts's Law: the whole label is the target, 40px tall */}
      <label className="btn btn-secondary" aria-busy={busy}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 40, fontSize: 12, marginTop: 8, cursor: busy ? 'progress' : 'pointer', opacity: busy ? 0.6 : 1 }}>
        <Camera size={14} aria-hidden="true" />
        {busy ? 'Uploading…' : hasPhoto ? 'Change photo' : 'Add photo'}
        <input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy}
          aria-label={`${hasPhoto ? 'Change' : 'Add'} photo of ${swimmer.name}`}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) { setSaved(false); setFile(f) } e.target.value = '' }} />
      </label>
      {file && <ImageCropper file={file} kind="person" note={saved ? null : SWIMMER_PHOTO_NOTE} onDone={send} onCancel={() => setFile(null)} />}
    </>
  )
}
