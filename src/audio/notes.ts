// Turning a music pattern's text into timed notes. Pure, so it's tested
// without a browser; the engine schedules what this returns.

import type { MusicTrack } from './types'

const SEMITONES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

/** Frequency in Hz of a note like A4 (440), C#3 or Bb2; null if it isn't one. */
export const noteFreq = (name: string): number | null => {
  const m = /^([A-Ga-g])(#|b)?([0-8])$/.exec(name)
  if (!m) return null
  const semitone = SEMITONES[m[1].toUpperCase()] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0)
  const midi = (Number(m[3]) + 1) * 12 + semitone
  return 440 * 2 ** ((midi - 69) / 12)
}

export interface PatternNote {
  /** First step (0-based). */
  step: number
  /** Steps it lasts ("-" holds extend it). */
  steps: number
  freq: number
}

/** The notes of a track: "." rests, "-" holds the note before (a hold after a rest is a rest). */
export const parseNotes = (notes: string): { notes: PatternNote[]; steps: number } => {
  const tokens = notes.trim().split(/\s+/).filter(Boolean)
  const out: PatternNote[] = []
  let current: PatternNote | null = null
  tokens.forEach((t, step) => {
    if (t === '-') {
      if (current) current.steps++
      return
    }
    current = null
    const freq = noteFreq(t)
    if (freq === null) return
    current = { step, steps: 1, freq }
    out.push(current)
  })
  return { notes: out, steps: tokens.length }
}

/** Seconds per step: a step is a sixteenth note (a quarter of a beat). */
export const stepSeconds = (tempo: number): number => 60 / tempo / 4

/** The pattern loops after its longest track. */
export const patternSteps = (tracks: MusicTrack[]): number => Math.max(1, ...tracks.map((t) => parseNotes(t.notes).steps))
