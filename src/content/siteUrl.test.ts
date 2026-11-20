import { describe, expect, it } from 'vitest'
import { siteUrl } from './siteUrl'

describe('siteUrl', () => {
  it('keeps site paths under the app base and leaves other URLs alone', () => {
    // Tests run with the base "/".
    expect(siteUrl('/models/a.glb')).toBe('/models/a.glb')
    expect(siteUrl('blob:http://x/123')).toBe('blob:http://x/123')
    expect(siteUrl('//evil.example/a.glb')).toBe('//evil.example/a.glb')
  })
})
