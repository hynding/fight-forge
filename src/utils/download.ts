/** Save bytes as a file through the browser's download. */
export const downloadBytes = (bytes: Uint8Array, filename: string, type = 'application/zip'): void => {
  const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
