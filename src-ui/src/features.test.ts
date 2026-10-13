import { afterEach, expect, test, vi } from 'vitest'
import { readFeatures, shownGames } from './features'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

test('each toggle reads true or false and nothing else', () => {
  expect(readFeatures({ VITE_FEATURE_GENSHIN_IMPACT: 'true' })).toEqual({ genshinImpact: true })
  expect(readFeatures({ VITE_FEATURE_GENSHIN_IMPACT: 'false' })).toEqual({ genshinImpact: false })
  for (const value of [undefined, '', 'TRUE', '1', 'yes', true]) {
    expect(() => readFeatures({ VITE_FEATURE_GENSHIN_IMPACT: value })).toThrow(
      'VITE_FEATURE_GENSHIN_IMPACT must be true or false',
    )
  }
})

test('Star Rail is always shown, and Genshin Impact only while its toggle is on', () => {
  expect(shownGames({ genshinImpact: true })).toEqual(['genshin-impact', 'honkai-star-rail'])
  expect(shownGames({ genshinImpact: false })).toEqual(['honkai-star-rail'])
})

test('the app reads the toggles its build was given', async () => {
  // Tests run with `.env.test`, the development state.
  expect((await import('./features')).games).toEqual(['genshin-impact', 'honkai-star-rail'])
  vi.resetModules()
  vi.stubEnv('VITE_FEATURE_GENSHIN_IMPACT', 'false')
  expect((await import('./features')).games).toEqual(['honkai-star-rail'])
})
