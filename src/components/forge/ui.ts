import type { CSSProperties } from 'react'

/** Shared styles for the Forge screen. */
export const ui = {
  input: {
    background: '#10141f',
    color: '#e8e8e8',
    border: '1px solid #3a4258',
    borderRadius: '3px',
    padding: '3px 6px',
    fontFamily: 'monospace',
    fontSize: '12px',
  } satisfies CSSProperties,
  button: {
    background: 'rgba(255, 255, 255, 0.06)',
    color: '#dddddd',
    border: '1px solid #555555',
    borderRadius: '3px',
    padding: '2px 8px',
    fontFamily: 'monospace',
    fontSize: '12px',
    cursor: 'pointer',
  } satisfies CSSProperties,
  error: { color: '#ff7a7a', fontSize: '11px' } satisfies CSSProperties,
}

export const sectionHeading = { fontSize: '11px', letterSpacing: '2px', color: '#8890a8', margin: '12px 0 4px' } as const
