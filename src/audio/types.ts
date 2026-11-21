// Audio definitions as the game uses them (the content's `sounds`, `music`
// and `settings.audio`, with file sources resolved to URLs).

export type SynthWave = 'sine' | 'square' | 'sawtooth' | 'triangle' | 'noise'

export type SoundDef =
  | { kind: 'synth'; wave: SynthWave; freq: number; freqEnd?: number; duration: number; volume: number }
  | { kind: 'file'; url: string; volume: number }

export interface MusicTrack {
  wave: Exclude<SynthWave, 'noise'>
  volume: number
  /** Space-separated steps: a note (C4, F#3, Bb2), "." for a rest, "-" to hold the note before. */
  notes: string
}

export type MusicDef = { kind: 'pattern'; tempo: number; volume: number; tracks: MusicTrack[] } | { kind: 'file'; url: string; volume: number }

/** Which sound plays for each game event; leave one out for silence. */
export interface AudioSettings {
  /** A hit lands (unless the move has its own `hitSound`). */
  hit?: string
  /** The player is hit. */
  hurt?: string
  /** A hit is guarded. */
  block?: string
  /** An enemy is knocked out. */
  ko?: string
  pickup?: string
  /** The level is cleared. */
  clear?: string
  /** A weapon breaks. */
  break?: string
}
