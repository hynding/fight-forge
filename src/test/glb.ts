// Test helper: the smallest valid binary glTF 2.0 file, with any extra JSON
// merged into its JSON chunk.

export const tinyGlb = (extra: Record<string, unknown> = {}, padTo = 0): Uint8Array => {
  let text = JSON.stringify({ asset: { version: '2.0' }, ...extra })
  while ((text.length + 20) % 4 !== 0 || text.length + 20 < padTo) text += ' '
  const json = new TextEncoder().encode(text)
  const b = new Uint8Array(20 + json.length)
  const v = new DataView(b.buffer)
  v.setUint32(0, 0x46546c67, true)
  v.setUint32(4, 2, true)
  v.setUint32(8, b.length, true)
  v.setUint32(12, json.length, true)
  v.setUint32(16, 0x4e4f534a, true)
  b.set(json, 20)
  return b
}
