// Vertrieb-CRM Realtime: reine Overlay-Logik fuer optimistische Roster-Updates.
// Der Detail-Drawer schreibt Feld-Aenderungen (z.B. Lead-Status) sofort lokal — statt
// die ganze Seite per router.refresh() neu zu laden. Diese Fn legt die optimistischen
// Patches ueber die Roster-Kontakte und leitet die Stufe (Badge) frisch ab, damit Liste
// UND Drawer-Header in Echtzeit konsistent sind. KEIN 'use server', rein + testbar.
import { deriveVertriebState } from '@/lib/vertrieb/derive-vertrieb-state'
import type { VertriebKontakt, VertriebKontaktRow } from '@/lib/vertrieb/vertrieb-kontakt.types'

/** Teil-Patch auf die rohen Row-Felder (z.B. { roh_status } / { notizen }). */
export type KontaktPatch = Partial<VertriebKontaktRow>
/** Overlay-Map: Key = `${kind}:${id}` -> Patch. */
export type KontaktPatchMap = Record<string, KontaktPatch>

export function kontaktPatchKey(kind: string, id: string): string {
  return `${kind}:${id}`
}

/**
 * Wendet die optimistischen Overlay-Patches auf die Roster-Kontakte an und leitet
 * die abgeleiteten Achsen (stufe/typ/rolle) neu ab. Ohne Patches wird das Original-
 * Array unveraendert (identisch) zurueckgegeben — kein unnoetiges Re-Mapping.
 */
export function wendeKontaktPatchesAn(
  kontakte: VertriebKontakt[],
  patches: KontaktPatchMap,
): VertriebKontakt[] {
  if (!patches || Object.keys(patches).length === 0) return kontakte
  return kontakte.map((k) => {
    const p = patches[kontaktPatchKey(k.kind, k.id)]
    // deriveVertriebState liest die Row-Felder neu -> stufe/typ/rolle folgen dem Patch.
    return p ? deriveVertriebState({ ...k, ...p }) : k
  })
}

/** Fuegt einen Patch (merge) in die Overlay-Map ein (immutabel). */
export function mergeKontaktPatch(
  map: KontaktPatchMap,
  kind: string,
  id: string,
  patch: KontaktPatch,
): KontaktPatchMap {
  const key = kontaktPatchKey(kind, id)
  return { ...map, [key]: { ...map[key], ...patch } }
}
