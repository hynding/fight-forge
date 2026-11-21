import { describe, expect, it } from 'vitest'
import { DEFAULT_CONTROL_PREFS, parseControlPrefs } from './prefs'

describe('parseControlPrefs', () => {
  it('fills in defaults for missing or bad values', () => {
    expect(parseControlPrefs(null)).toEqual(DEFAULT_CONTROL_PREFS)
    expect(parseControlPrefs({ rumble: 'yes', deadZone: 'x', toggleBlock: 1 })).toEqual(DEFAULT_CONTROL_PREFS)
  })

  it('keeps valid settings and clamps the dead zone', () => {
    expect(parseControlPrefs({ rumble: false, deadZone: 2, toggleBlock: true, faceCursor: true })).toEqual({
      rumble: false,
      deadZone: 0.9,
      toggleBlock: true,
      faceCursor: true,
    })
  })
})
