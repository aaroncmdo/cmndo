'use client'
// Cold-Mailer: geteilte Cursor-Einfuege-Logik fuer die Merge-Palette. Beide Editoren
// (Einzel-Composer + Vorlagen-Editor) nutzen sie identisch: Datenvariablen ins zuletzt
// fokussierte Feld, Aktionen IMMER in den Body (Buttons gehoeren nicht in den Betreff).
import { useRef, useState } from 'react'

export function useMergeVarInsert(felder: {
  betreff: string
  setBetreff: (s: string) => void
  body: string
  setBody: (s: string) => void
}) {
  const betreffRef = useRef<HTMLInputElement>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const [aktivesFeld, setAktivesFeld] = useState<'betreff' | 'body'>('body')

  function einfuegen(token: string, istAktion: boolean) {
    const ziel = istAktion ? 'body' : aktivesFeld
    const el = ziel === 'betreff' ? betreffRef.current : bodyRef.current
    const wert = ziel === 'betreff' ? felder.betreff : felder.body
    const setzen = ziel === 'betreff' ? felder.setBetreff : felder.setBody
    const einschub = `{{${token}}}`
    const start = el?.selectionStart ?? wert.length
    const ende = el?.selectionEnd ?? wert.length
    setzen(wert.slice(0, start) + einschub + wert.slice(ende))
    // Nach dem Re-Render: Fokus zurueck + Cursor hinter den eingefuegten Token.
    requestAnimationFrame(() => {
      const cursor = start + einschub.length
      el?.focus()
      el?.setSelectionRange(cursor, cursor)
    })
  }

  return { betreffRef, bodyRef, setAktivesFeld, einfuegen }
}
