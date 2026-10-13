// Build-time feature toggles, which hide unfinished work from release builds while
// it stays in the code and under test (decision 0026). Vite's environment files set
// them; they are not settings, and nothing at runtime can change them.
import { games as names, type Game } from './format'

/** Which unfinished features this build shows. */
export interface Features {
  /** Genshin Impact's screens; 0031 removes the toggle once its import works. */
  genshinImpact: boolean
}

/** A toggle's value, which must be written `true` or `false`. */
function toggle(env: Record<string, unknown>, name: string) {
  const value = env[name]
  if (value !== 'true' && value !== 'false') {
    throw new Error(`${name} must be true or false`)
  }
  return value === 'true'
}

/** The toggles in a build's environment. */
export function readFeatures(env: Record<string, unknown>): Features {
  return { genshinImpact: toggle(env, 'VITE_FEATURE_GENSHIN_IMPACT') }
}

/** The games the app offers, in the sidebar's order. */
export function shownGames(features: Features): Game[] {
  return (Object.keys(names) as Game[]).filter(
    (id) => id !== 'genshin-impact' || features.genshinImpact,
  )
}

/** The games this build offers. */
export const games = shownGames(readFeatures(import.meta.env))
