import { describe, expect, it } from 'vitest'
import { formatTime } from './format'

describe('formatTime', () => {
  it('formats m:ss', () => {
    expect(formatTime(0)).toBe('0:00')
    expect(formatTime(83.9)).toBe('1:23')
    expect(formatTime(600)).toBe('10:00')
  })
})
