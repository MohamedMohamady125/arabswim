import { createContext, useContext, useEffect, useState } from 'react'
import { getFeatures } from '../api/core'

// Launch toggles: sections the admin can hide until they're ready.
// Default everything ON so the site behaves normally if the fetch fails.
const DEFAULTS = { hall_of_fame: true, coaches: true, news: true, marketplace: true, media: true }

const FeaturesContext = createContext({ features: DEFAULTS, flag: () => true, refreshFeatures: () => {} })

export function FeaturesProvider({ children }) {
  const [features, setFeatures] = useState(DEFAULTS)
  const refreshFeatures = () => {
    getFeatures().then((res) => setFeatures({ ...DEFAULTS, ...res.data })).catch(() => {})
  }
  useEffect(refreshFeatures, [])
  // Missing key = visible; only a stored `false` hides (works for any
  // subfeature key like 'fed.tab.board' without pre-registering defaults)
  const flag = (key) => features[key] !== false
  return (
    <FeaturesContext.Provider value={{ features, flag, refreshFeatures }}>
      {children}
    </FeaturesContext.Provider>
  )
}

export const useFeatures = () => useContext(FeaturesContext)
