const MEDAL_SRC = {
  gold: '/medal_gold.webp',
  silver: '/medal_silver.webp',
  bronze: '/medal_bronze.webp',
}

export default function MedalIcon({ type, size = 24, className = '' }) {
  const key = type?.toLowerCase()
  const src = MEDAL_SRC[key]
  if (!src) return null
  return (
    <img
      src={src}
      alt={`${key} medal`}
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className={`inline-block shrink-0 grow-0 object-contain align-middle select-none ${className}`}
    />
  )
}
