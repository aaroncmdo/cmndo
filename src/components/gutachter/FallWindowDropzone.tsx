'use client'

// CMM-32: Window-weite Drag-and-Drop-Zone für die SV-Fallakte. Dateien
// die irgendwo im Fenster fallen gelassen werden, gehen via uploadDatei
// → kategorie='sonstiges' an den Fall — exakt wie der „Weiteres
// Dokument hochladen"-Button in WeitereDokumenteCard. Kein UI-Hinweis,
// kein sichtbares Overlay (Aaron-Spec).

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { uploadDatei } from '@/app/gutachter/fall/[id]/actions'

export default function FallWindowDropzone({ fallId }: { fallId: string }) {
  const router = useRouter()

  useEffect(() => {
    function hasFiles(e: DragEvent): boolean {
      return Array.from(e.dataTransfer?.types ?? []).includes('Files')
    }

    function onDragOver(e: DragEvent) {
      if (!hasFiles(e)) return
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    }

    async function onDrop(e: DragEvent) {
      if (!hasFiles(e)) return
      e.preventDefault()
      const files = Array.from(e.dataTransfer?.files ?? [])
      if (files.length === 0) return
      for (const file of files) {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('kategorie', 'sonstiges')
        try {
          await uploadDatei(fallId, fd)
        } catch (err) {
          console.error('[FallWindowDropzone] Upload fehlgeschlagen:', err)
        }
      }
      router.refresh()
    }

    window.addEventListener('dragover', onDragOver)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('drop', onDrop)
    }
  }, [fallId, router])

  return null
}
