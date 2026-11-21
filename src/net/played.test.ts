import { describe, expect, it } from 'vitest'
import { isNewerVersion, isUpdated } from './played'

describe('played packs', () => {
  it('compares versions numerically', () => {
    expect(isNewerVersion('1.10.0', '1.9.3')).toBe(true)
    expect(isNewerVersion('1.0.0', '1.0.0')).toBe(false)
    expect(isNewerVersion('0.9.9', '1.0.0')).toBe(false)
  })

  it('marks a pack updated only after a newer version than the one played', () => {
    const played = { a: '1.0.0' }
    expect(isUpdated(played, 'a', '1.0.1')).toBe(true)
    expect(isUpdated(played, 'a', '1.0.0')).toBe(false)
    expect(isUpdated(played, 'b', '2.0.0')).toBe(false)
  })
})
