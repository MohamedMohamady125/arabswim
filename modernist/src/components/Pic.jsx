import { useEffect, useState } from 'react'
import { imgUrl, mediaUrl } from '../utils'

// One table decides how each kind of uploaded image is cropped on upload and
// drawn on screen, so the uploader and every slot that shows it always agree.
//   aspect / lock  — the frame the crop tool opens with (lock = cannot change)
//   fit / position — how the image fills a slot of a different shape
//   maxSide        — longest side sent to the server
//   minSide        — below this the crop tool warns the photo will look soft
//   trim           — server cuts empty margins off (logos)
export const IMAGE_KINDS = {
  // People: portrait, face in the upper third; square and round slots keep the head
  // `bg`: swimmer portraits are stored as transparent cut-outs; the brand navy
  // behind them is painted here, once, for every slot on the site
  person: { aspect: 4 / 5, lock: true, fit: 'cover', position: '50% 22%', maxSide: 1400, minSide: 320, bg: 'var(--asw-portrait-bg)' },
  // Crests and logos: never cropped by a slot, always shown whole
  // `pad` insets the artwork so a square or wide logo is not clipped by a round badge.
  // It is a percentage of the PARENT's width, so Pic applies it only when the image
  // fills its parent (a logo given its own width keeps none).
  logo: { aspect: 'original', lock: false, fit: 'contain', position: '50% 50%', maxSide: 1000, minSide: 160, trim: true, pad: '10%' },
  sponsor: { aspect: 'original', lock: false, fit: 'contain', position: '50% 50%', maxSide: 1000, minSide: 160, trim: true },
  // Article covers and meet photos: landscape
  cover: { aspect: 16 / 9, lock: false, fit: 'cover', position: '50% 22%', maxSide: 2000, minSide: 720, smart: true },
  // meet photo / poster / logo: opens on landscape, any frame allowed; it is
  // often a logo, so every slot shows it whole instead of cropping it
  meet: { aspect: 16 / 9, lock: false, fit: 'contain', position: '50% 50%', maxSide: 2000, minSide: 400 },
  // Albums: the photographer's own framing
  gallery: { aspect: 'original', lock: false, fit: 'cover', position: '50% 35%', maxSide: 2000, minSide: 480 },
}

// Swimmer portraits only: the server cuts the swimmer out (transparent) and
// centres them after upload (backend/core/cutout.py). Shown in the crop tool.
export const SWIMMER_PHOTO_NOTE = 'After upload the background is replaced with Arab Swim blue and the swimmer is centred automatically.'

/**
 * Drop-in <img> for anything uploaded to the site.
 *   kind      — key of IMAGE_KINDS (decides object-fit and focal position)
 *   src       — path or URL as the API returns it (no mediaUrl() needed)
 *   w         — roughly how wide the slot is on screen, in CSS px. The browser
 *               is offered every server size and picks the one that matches
 *               the real slot and screen density; `w` is the hint for
 *               browsers that cannot measure the slot themselves.
 *   fill      — false when CSS or style sizes the image itself (a lightbox,
 *               a logo strip); default stretches it over its parent box
 *   fallback  — what to draw when there is no image or it fails to load
 *   eager     — load immediately (above-the-fold hero); default is lazy
 * Fills its parent (100% x 100%) unless style says otherwise.
 * Postel's Law: a missing, broken or oddly shaped file never breaks the slot.
 */
const SIZES = [64, 128, 256, 384, 512, 768, 1024, 1600] // = WIDTHS in backend/core/images.py

export default function Pic({ kind = 'person', src, w = 160, alt = '', fallback = null, eager = false, fill = true, onError, style, ...rest }) {
  // 0 = sized copy, 1 = original file, 2 = nothing loads
  const [stage, setStage] = useState(0)
  useEffect(() => { setStage(0) }, [src])
  const k = IMAGE_KINDS[kind] || IMAGE_KINDS.person
  if (!src || stage === 2) return fallback
  const opts = { trim: !!k.trim }
  const sized = imgUrl(src, w, opts)
  const original = mediaUrl(src)
  const useSized = stage === 0 && sized !== original
  return (
    <img
      src={useSized ? sized : original}
      srcSet={useSized ? SIZES.map((n) => `${imgUrl(src, n, opts)} ${n}w`).join(', ') : undefined}
      // never `sizes="auto"`: browsers give such an image a fixed 300x150
      // placeholder box instead of its own shape, so a slot that leans on the
      // photo's proportions grew to 150px tall and cropped the swimmer
      sizes={useSized ? `${w}px` : undefined}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      draggable={false}
      onError={(e) => {
        if (useSized) { setStage(1); return }
        setStage(2)
        if (onError) onError(e)
      }}
      // a slot that sets its own aspect-ratio gets its height from that, not from the parent
      style={{ display: 'block', ...(fill ? { width: '100%', ...(style?.aspectRatio ? null : { height: '100%' }) } : null), ...(k.pad && fill && style?.width == null ? { padding: k.pad, boxSizing: 'border-box' } : null), objectFit: k.fit, objectPosition: k.position, ...(k.bg ? { backgroundColor: k.bg } : null), ...style }}
      {...rest}
    />
  )
}
