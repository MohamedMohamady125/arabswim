import clsx from 'clsx'

const COLORS = {
  gold: 'radial-gradient(circle at 35% 30%, #F0C64A, #D4A017 65%, #A87D0E)',
  silver: 'radial-gradient(circle at 35% 30%, #C7D2DC, #8C9AA8 65%, #6C7A88)',
  bronze: 'radial-gradient(circle at 35% 30%, #D2946A, #B0713A 65%, #8A5527)',
}

/** Crisp SVG-style medal dot for tally tables (replaces heavy PNG medals). */
export default function MedalDot({ type = 'gold', size = 14, className }) {
  return (
    <span
      aria-label={`${type} medal`}
      className={clsx('inline-block rounded-full shrink-0 align-middle', className)}
      style={{ width: size, height: size, background: COLORS[type] || COLORS.gold }}
    />
  )
}

/** Rank number colored gold/silver/bronze for top-3, ink otherwise. */
export function RankNumber({ rank, className }) {
  const color =
    rank === 1 ? 'text-gold' : rank === 2 ? 'text-silver' : rank === 3 ? 'text-bronze' : 'text-ink-400'
  return (
    <span className={clsx('tnum font-bold text-body-sm', color, className)}>{rank}</span>
  )
}
