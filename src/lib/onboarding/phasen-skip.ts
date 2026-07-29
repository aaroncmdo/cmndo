// Pure Skip-/Fallback-Logik des datengetriebenen Onboarding-Loaders (ladeNoetigePhasen).
// Eigene Datei OHNE 'use server' — aus load-needed-phases.ts duerfen nur async
// Server-Actions exportiert werden (AAR-664), pure Helfer waeren dort Build-Breaker.

// Strukturell weicher als OnboardingFeld: db_target ist DB-seitig jsonb und
// kann zur Laufzeit fehlen/null sein — OnboardingFeld[] bleibt direkt zuweisbar.
export type SkipFeld = {
  pflicht: boolean
  feld_key: string
  db_target?: { spalte?: string | null; tabelle?: string | null } | null
}

/**
 * Entscheidet, ob eine Phase im datengetriebenen Wizard uebersprungen wird.
 * `sichtbareFelder` = Felder NACH filterFelderByAudience.
 *
 * Bestand: Phase wird geskippt, wenn ALLE Pflichtfelder bereits einen DB-Wert
 * haben (Lookup via feld_key ODER db_target.spalte). Phasen mit nur optionalen
 * Feldern bleiben sichtbar.
 */
export function sollPhaseGeskipptWerden(
  sichtbareFelder: SkipFeld[],
  prefilled: Record<string, unknown>,
): boolean {
  // Bug3-Smoke 28.07.: eine Phase ohne sichtbare Felder erhebt nichts — ohne
  // diesen Skip war phases.length===0 nie erreichbar (felderlose sa-Phase) und
  // der Fallakte-Redirect der onboarding-details-Page toter Code.
  if (sichtbareFelder.length === 0) return true
  const pflichtFelder = sichtbareFelder.filter(f => f.pflicht)
  if (pflichtFelder.length === 0) return false
  return pflichtFelder.every(f => {
    const valByKey = prefilled[f.feld_key]
    const dbSpalte = f.db_target?.spalte ?? null
    const valBySpalte = dbSpalte ? prefilled[dbSpalte] : undefined
    const v = valByKey ?? valBySpalte
    return v !== null && v !== undefined && v !== ''
  })
}

/**
 * Hergang-Fallback aus dem Lead — dieselbe Kaskade wie die
 * convertLeadToClaim-Bridge (hergang_kunde_text <- unfallhergang ??
 * schadens_hergang ?? fahrzeugschaden_beschreibung).
 */
export function resolveHergangFromLead(
  lead: Record<string, unknown> | null | undefined,
): string | null {
  if (!lead) return null
  for (const key of ['unfallhergang', 'schadens_hergang', 'fahrzeugschaden_beschreibung']) {
    const v = lead[key]
    if (typeof v === 'string' && v.trim() !== '') return v
  }
  return null
}
