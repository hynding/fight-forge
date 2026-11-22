import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../config/defaults'
import { useGameStore } from '../store/gameStore'
import { getConfig, getLevels, setActiveContent } from './active'
import { DEFAULT_CONTENT } from './defaultContent'
import { defaultPack } from './defaultPack'
import { loadContent } from './load'

const remix = (rules: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  id: 'remix',
  name: 'Remix',
  version: '0.1.0',
  meta: { author: 'Tester', description: '', license: 'CC0-1.0' },
  settings: { rules: { ...DEFAULT_CONFIG.rules, ...rules } },
  ...extra,
})

afterEach(() => setActiveContent(DEFAULT_CONTENT))

describe('loadContent', () => {
  it('loads the default pack', () => {
    const r = loadContent([defaultPack()])
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.config).toEqual(DEFAULT_CONFIG)
  })

  it('returns the formatted errors for bad packs', () => {
    const r = loadContent([defaultPack(), remix({ lives: 0 })])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('[remix] settings.rules.lives: Number must be greater than or equal to 1')
  })
})

describe('active content', () => {
  it('starts as the default pack', () => {
    expect(getConfig()).toBe(DEFAULT_CONTENT.config)
    expect(getLevels()).toBe(DEFAULT_CONTENT.levels)
  })

  it('is what the game reads once a pack is installed', () => {
    const level = { id: 'solo', name: 'Solo', theme: 'default', segments: [{ length: 20, triggers: [{ kind: 'goal', at: 18 }] }] }
    const r = loadContent([defaultPack(), remix({ lives: 7, continues: 0 }, { levels: [level] })])
    if (!r.ok) throw new Error(r.error)
    setActiveContent(r.value)
    expect(getConfig().rules.lives).toBe(7)
    expect(getLevels().map((l) => l.id)).toContain('solo')

    useGameStore.getState().startRun(0)
    expect(useGameStore.getState().players[0].lives).toBe(7)
    expect(useGameStore.getState().continuesLeft).toBe(0)
  })
})

describe('rules from the active content', () => {
  it('sets how many enemies may attack at once', () => {
    const r = loadContent([defaultPack(), remix({ maxSimultaneousAttackers: 2 })])
    if (!r.ok) throw new Error(r.error)
    setActiveContent(r.value)
    const s = useGameStore.getState()
    s.startRun(0)
    expect(s.requestAttackToken('a', 'p1')).toBe(true)
    expect(s.requestAttackToken('b', 'p1')).toBe(true)
    expect(s.requestAttackToken('c', 'p1')).toBe(false)
  })
})
