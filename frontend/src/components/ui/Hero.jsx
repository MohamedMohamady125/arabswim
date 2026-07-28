import clsx from 'clsx'

/**
 * Dark brand band for Home / Championships / MeetDetail / SwimmerProfile
 * headers: ink-950→ink-900 gradient with an aqua accent line.
 */
export default function Hero({ image, className, children }) {
  return (
    <div className={clsx('relative rounded-lg overflow-hidden bg-gradient-to-br from-ink-950 to-ink-900 text-white', className)}>
      {image && (
        <img src={image} alt="" className="absolute inset-0 w-full h-full object-cover opacity-25" />
      )}
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-aqua-600 via-aqua-400 to-aqua-600" />
      <div className="relative min-w-0 px-4 md:px-8 py-6 md:py-10">{children}</div>
    </div>
  )
}
