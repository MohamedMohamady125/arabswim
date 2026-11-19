import { createContext, useContext, useEffect, useState } from 'react'
import { getFeatures } from '../api/core'

// Launch toggles: sections the admin can hide until they're ready.
// Default everything ON so the site behaves normally if the fetch fails.
const DEFAULTS = { hall_of_fame: true, coaches: true, news: true, marketplace: true, media: true }

const FeaturesContext = createContext({ features: DEFAULTS, loaded: false, flag: () => true, refreshFeatures: () => {} })

export function FeaturesProvider({ children }) {
  const [features, setFeatures] = useState(DEFAULTS)
  // `loaded`: the flags have been read (or the read failed) — the pre-launch
  // lock waits for this before deciding what a visitor may see
  const [loaded, setLoaded] = useState(false)
  const refreshFeatures = () => {
    getFeatures().then((res) => setFeatures({ ...DEFAULTS, ...res.data })).catch(() => {}).finally(() => setLoaded(true))
  }
  useEffect(refreshFeatures, [])
  // Missing key = visible; only a stored `false` hides (works for any
  // subfeature key like 'fed.tab.board' without pre-registering defaults)
  const flag = (key) => features[key] !== false
  return (
    <FeaturesContext.Provider value={{ features, loaded, flag, refreshFeatures }}>
      {children}
    </FeaturesContext.Provider>
  )
}

export const useFeatures = () => useContext(FeaturesContext)
