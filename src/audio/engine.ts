// The game's sound: a small WebAudio engine. Sound effects and music come
// from the active content (`getConfig().sounds` / `.music`), read when they
// play. Synth sounds and music patterns are made on the fly, so the default
// pack needs no audio files; file sounds are fetched and decoded once.
//
// Browsers start audio suspended until the player clicks or presses a key;
// `installAudioUnlock` resumes it then. Until it runs, sounds are skipped.

import { getConfig } from '../content/active'
import { parseNotes, patternSteps, stepSeconds } from './notes'
import type { MusicDef, SoundDef } from './types'
import { loadVolumes, saveVolumes, type Volumes } from './volume'

interface Graph {
  ctx: AudioContext
  master: GainNode
  music: GainNode
  sfx: GainNode
  noise: AudioBuffer
}

let graph: Graph | null = null
let volumes: Volumes = loadVolumes()
let ducked = false

/** The last sounds asked for, newest last (for tests and debugging; nothing reads it in play). */
export const audioLog: { kind: 'sfx' | 'music' | 'stop'; id: string }[] = []
const log = (kind: 'sfx' | 'music' | 'stop', id: string) => {
  audioLog.push({ kind, id })
  if (audioLog.length > 50) audioLog.shift()
}

const ensure = (): Graph | null => {
  if (graph) return graph
  const Ctx = typeof window === 'undefined' ? undefined : (window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
  if (!Ctx) return null
  const ctx = new Ctx()
  const master = ctx.createGain()
  const music = ctx.createGain()
  const sfx = ctx.createGain()
  music.connect(master)
  sfx.connect(master)
  master.connect(ctx.destination)
  const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
  const data = noise.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  graph = { ctx, master, music, sfx, noise }
  applyVolumes()
  return graph
}

const applyVolumes = () => {
  if (!graph) return
  const t = graph.ctx.currentTime
  graph.master.gain.setTargetAtTime(volumes.master, t, 0.02)
  graph.sfx.gain.setTargetAtTime(volumes.sfx, t, 0.02)
  graph.music.gain.setTargetAtTime(volumes.music * (ducked ? 0.35 : 1), t, 0.08)
}

const running = (): Graph | null => {
  const g = ensure()
  return g && g.ctx.state === 'running' ? g : null
}

/** Resume audio on the player's first click or key press (browsers require one). */
let unlockInstalled = false
export const installAudioUnlock = () => {
  if (unlockInstalled || typeof window === 'undefined') return
  unlockInstalled = true
  const unlock = () => {
    const g = ensure()
    if (!g) return
    void g.ctx.resume().then(() => {
      if (g.ctx.state !== 'running') return
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
      if (wanted && !current) startMusic(wanted)
    })
  }
  window.addEventListener('pointerdown', unlock)
  window.addEventListener('keydown', unlock)
}

export const getVolumes = (): Volumes => ({ ...volumes })
export const setVolumes = (v: Volumes) => {
  volumes = { ...v }
  saveVolumes(volumes)
  applyVolumes()
}

// ------------------------------------------------------------ files

const buffers = new Map<string, Promise<AudioBuffer | null>>()
const fileBuffer = (g: Graph, url: string): Promise<AudioBuffer | null> => {
  let b = buffers.get(url)
  if (!b) {
    b = fetch(url)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((data) => g.ctx.decodeAudioData(data))
      .catch((e: unknown) => {
        console.warn(`Sound "${url}" failed to load`, e)
        return null
      })
    buffers.set(url, b)
  }
  return b
}

// ------------------------------------------------------------ sound effects

const playSynth = (g: Graph, d: Extract<SoundDef, { kind: 'synth' }>, out: AudioNode) => {
  const t = g.ctx.currentTime
  const env = g.ctx.createGain()
  env.gain.setValueAtTime(0.0001, t)
  env.gain.exponentialRampToValueAtTime(Math.max(0.0001, d.volume), t + 0.005)
  env.gain.exponentialRampToValueAtTime(0.0001, t + d.duration)
  env.connect(out)
  let src: AudioScheduledSourceNode
  if (d.wave === 'noise') {
    // Noise through a band-pass filter whose centre slides like a pitch.
    const n = g.ctx.createBufferSource()
    n.buffer = g.noise
    const filter = g.ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.Q.value = 1.2
    filter.frequency.setValueAtTime(d.freq, t)
    if (d.freqEnd) filter.frequency.exponentialRampToValueAtTime(d.freqEnd, t + d.duration)
    n.connect(filter).connect(env)
    src = n
  } else {
    const osc = g.ctx.createOscillator()
    osc.type = d.wave
    osc.frequency.setValueAtTime(d.freq, t)
    if (d.freqEnd) osc.frequency.exponentialRampToValueAtTime(d.freqEnd, t + d.duration)
    osc.connect(env)
    src = osc
  }
  src.start(t)
  src.stop(t + d.duration + 0.02)
}

const playDef = (g: Graph, d: SoundDef) => {
  if (d.kind === 'synth') return playSynth(g, d, g.sfx)
  void fileBuffer(g, d.url).then((buf) => {
    if (!buf) return
    const src = g.ctx.createBufferSource()
    const gain = g.ctx.createGain()
    gain.gain.value = d.volume
    src.buffer = buf
    src.connect(gain).connect(g.sfx)
    src.start()
  })
}

/** Play a sound effect by id (from the active content); no id, or an unknown one, is silence. */
export const playSound = (id: string | undefined) => {
  if (!id) return
  log('sfx', id)
  const def = getConfig().sounds[id]
  const g = running()
  if (def && g) playDef(g, def)
}

/** Play a definition directly (the Forge's preview of a sound being edited). */
export const previewSound = (def: SoundDef) => {
  const g = ensure()
  if (!g) return
  void g.ctx.resume().then(() => playDef(g, def))
}

// ------------------------------------------------------------ music

interface Playing {
  id: string
  stop: () => void
}
let current: Playing | null = null
/** The music the game wants, kept while audio is still locked so it can start on unlock. */
let wanted: string | null = null

const startPattern = (g: Graph, d: Extract<MusicDef, { kind: 'pattern' }>): (() => void) => {
  const out = g.ctx.createGain()
  out.gain.value = d.volume
  out.connect(g.music)
  const step = stepSeconds(d.tempo)
  const length = patternSteps(d.tracks)
  const tracks = d.tracks.map((t) => ({ ...t, ...parseNotes(t.notes) }))
  let nextStep = 0
  let nextTime = g.ctx.currentTime + 0.05
  const schedule = () => {
    // Schedule a little ahead of the clock, so timer jitter never makes a gap.
    while (nextTime < g.ctx.currentTime + 0.2) {
      const at = nextStep % length
      for (const tr of tracks) {
        for (const n of tr.notes) {
          if (n.step !== at) continue
          const osc = g.ctx.createOscillator()
          const env = g.ctx.createGain()
          const end = nextTime + n.steps * step
          osc.type = tr.wave
          osc.frequency.value = n.freq
          env.gain.setValueAtTime(0, nextTime)
          env.gain.linearRampToValueAtTime(tr.volume, nextTime + 0.01)
          env.gain.setTargetAtTime(0, end - Math.min(0.05, step / 2), 0.02)
          osc.connect(env).connect(out)
          osc.start(nextTime)
          osc.stop(end + 0.1)
        }
      }
      nextStep++
      nextTime += step
    }
  }
  schedule()
  const timer = setInterval(schedule, 50)
  return () => {
    clearInterval(timer)
    out.gain.setTargetAtTime(0, g.ctx.currentTime, 0.05)
    setTimeout(() => out.disconnect(), 400)
  }
}

const startFile = (g: Graph, d: Extract<MusicDef, { kind: 'file' }>): (() => void) => {
  let src: AudioBufferSourceNode | null = null
  let stopped = false
  const gain = g.ctx.createGain()
  gain.gain.value = d.volume
  gain.connect(g.music)
  void fileBuffer(g, d.url).then((buf) => {
    if (!buf || stopped) return
    src = g.ctx.createBufferSource()
    src.buffer = buf
    src.loop = true
    src.connect(gain)
    src.start()
  })
  return () => {
    stopped = true
    src?.stop()
    gain.disconnect()
  }
}

const startDef = (g: Graph, def: MusicDef) => (def.kind === 'pattern' ? startPattern(g, def) : startFile(g, def))

const startMusic = (id: string) => {
  const def = getConfig().music[id]
  const g = running()
  if (!def || !g) return
  current = { id, stop: startDef(g, def) }
}

/** Play a music definition directly (the Forge's preview), replacing any music; null stops it. */
export const previewMusic = (def: MusicDef | null) => {
  stopMusic()
  const g = ensure()
  if (!g || !def) return
  void g.ctx.resume().then(() => {
    current = { id: '(preview)', stop: startDef(g, def) }
  })
}

/** Loop a music track by id; the same id keeps playing, another replaces it, none stops it. */
export const playMusic = (id: string | undefined) => {
  if (!id) return stopMusic()
  if (wanted === id && (current?.id === id || !running())) return
  stopMusic()
  wanted = id
  log('music', id)
  startMusic(id)
}

export const stopMusic = () => {
  if (wanted) log('stop', wanted)
  wanted = null
  current?.stop()
  current = null
}

/** Turn the music down while the game is paused or frozen, and back up after. */
export const duckMusic = (on: boolean) => {
  if (ducked === on) return
  ducked = on
  applyVolumes()
}
