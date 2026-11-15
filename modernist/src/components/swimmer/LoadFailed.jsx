import { Empty } from '../ui'

// Paradox of the Active User: a failed load says so and offers the way out,
// instead of looking like "no data". Used by every swimmer-profile tab.
export default function LoadFailed({ what = 'This section', onRetry }) {
  return (
    <Empty label={`${what} could not be loaded`} hint="Check your connection and try again.">
      {onRetry && <button type="button" className="btn btn-secondary" onClick={onRetry}>Try again</button>}
    </Empty>
  )
}
