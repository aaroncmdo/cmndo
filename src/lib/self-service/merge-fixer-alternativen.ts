import type { OeffentlichesSvProfil } from '@/lib/sv-matching-modul'

/**
 * AAR-956 §3a: gepickter SV (Fixer) als Default/erster + globale Alternativen.
 * `matchAndSlots({fixerSvId})` liefert NUR den Fixen → diese Funktion hängt die
 * globalen Alternativen an und dedupet den Fixen aus der globalen Liste raus
 * (sonst stünde er doppelt). Fixer fehlt (leer) → nur die Alternativen.
 */
export function mergeFixerUndAlternativen(
  fixerList: OeffentlichesSvProfil[],
  globalList: OeffentlichesSvProfil[],
  fixerSvId: string,
): OeffentlichesSvProfil[] {
  const fixer = fixerList[0] ?? null
  const alternativen = globalList.filter((s) => s.svId !== fixerSvId)
  return fixer ? [fixer, ...alternativen] : alternativen
}
