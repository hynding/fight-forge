import { useEffect, useMemo } from 'react'
import { assetFile } from '../../forge/fighter'
import type { WorkspacePack } from '../../forge/workspace'
import type { PreviewModel } from './ModelPreview'

type ModelJson = Record<string, unknown> | undefined

/**
 * The model a fighter definition names, ready for the preview: a same-origin
 * URL as is, or a pack asset as a blob URL (revoked when it changes).
 */
export const usePreviewModel = (pack: WorkspacePack, model: ModelJson): PreviewModel => {
  const assetId = model?.kind === 'gltf' && typeof model.asset === 'string' ? model.asset : undefined
  const bytes = assetId ? assetFile(pack, assetId) : undefined
  const blobUrl = useMemo(
    () => (bytes ? URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'model/gltf-binary' })) : undefined),
    [bytes]
  )
  useEffect(() => () => {
    if (blobUrl) URL.revokeObjectURL(blobUrl)
  }, [blobUrl])

  if (model?.kind !== 'gltf') {
    const offset = (model?.offset as [number, number, number] | undefined) ?? [0, -0.35, 0]
    return { kind: 'procedural', offset }
  }
  const url = typeof model.url === 'string' ? model.url : blobUrl
  if (!url) return { kind: 'procedural', offset: [0, -0.35, 0] }
  return {
    kind: 'gltf',
    url,
    scale: Number(model.scale) || 1,
    offset: (model.offset as [number, number, number]) ?? [0, 0, 0],
    rotationY: Number(model.rotationY) || 0,
    tintMaterials: Array.isArray(model.tintMaterials) ? (model.tintMaterials as string[]) : [],
  }
}
