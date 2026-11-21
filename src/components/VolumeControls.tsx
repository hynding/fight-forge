import { useState } from 'react'
import { getVolumes, setVolumes } from '../audio/engine'
import type { Volumes } from '../audio/volume'

const LABELS: Record<keyof Volumes, string> = { master: 'Master', music: 'Music', sfx: 'Effects' }

/** Master, music and effects volume: this browser's preference, applied at once. */
export const VolumeControls = () => {
  const [v, setV] = useState(getVolumes)
  return (
    <div data-testid="volume-controls" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 3em', gap: '6px 8px', alignItems: 'center' }}>
      {(Object.keys(LABELS) as (keyof Volumes)[]).map((k) => (
        <label key={k} style={{ display: 'contents', color: '#bbbbbb' }}>
          <span>{LABELS[k]}</span>
          <input
            type="range"
            min={0}
            max={100}
            aria-label={`${LABELS[k]} volume`}
            value={Math.round(v[k] * 100)}
            onChange={(e) => {
              const next = { ...v, [k]: Number(e.target.value) / 100 }
              setV(next)
              setVolumes(next)
            }}
          />
          <span style={{ textAlign: 'right' }}>{Math.round(v[k] * 100)}%</span>
        </label>
      ))}
    </div>
  )
}
