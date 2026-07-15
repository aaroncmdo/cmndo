// Cold-Mailer: reine Patch-Bau-Logik fuer das Sequenz-Update (aus 'use server' ausgelagert,
// damit sie ohne DB/Guard testbar ist — AAR-664: kein Export aus 'use server'-Files).
//
// Kernregel: ein partielles Update. name/rolle immer, aktiv/auto_enroll NUR wenn explizit
// gesetzt. Das verhindert das Clobbering-Race, bei dem ein Toggle das andere Flag aus einem
// veralteten Client-State ueberschreibt.

export function bauePatchFelder(input: {
  name: string
  rolle: string
  aktiv?: boolean
  auto_enroll?: boolean
}): { name: string; rolle: string; aktiv?: boolean; auto_enroll?: boolean } {
  const patch: { name: string; rolle: string; aktiv?: boolean; auto_enroll?: boolean } = {
    name: input.name.trim(),
    rolle: input.rolle,
  }
  if (input.aktiv !== undefined) patch.aktiv = input.aktiv
  if (input.auto_enroll !== undefined) patch.auto_enroll = input.auto_enroll
  return patch
}
