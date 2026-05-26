// HANDGESCHRIEBEN — nicht generiert (anders als pseo-data.generated.ts).
// Lokal-Content je PSEO-Stadt (WP-5-Gate). Keys = PSEO_CITY_SLUGS.
// HARTE REGEL: jeder Fakt MUSS eine quelle tragen; Schätzungen als "ca." labeln.
export type LocalFact = {
  label: string
  value: string
  quelle: string
  url?: string
}
export type PseoLocal = {
  /** 2-4 Sätze echter Lokal-Kontext, additiv zum Template. */
  intro: string
  /** 3-5 belegte Fakten. */
  facts: LocalFact[]
}

export const PSEO_LOCAL: Record<string, PseoLocal> = {
  // ILLUSTRATIVER Anker — Werte bei Ausführung (Task 8 / Aaron-Review) gegen die
  // zitierte Quelle verifizieren (Live-Recherche), NICHT ungeprüft als final ansehen.
  duesseldorf: {
    intro:
      'Düsseldorf bündelt als Landeshauptstadt mit rund 619.000 Einwohnern und 285.000 zugelassenen Pkw einen der dichtesten Verkehrsräume Nordrhein-Westfalens. A46, A52 und A57 sowie der innerstädtische Rheinufer-Verkehr prägen das lokale Unfallgeschehen.',
    facts: [
      { label: 'Unfallschwerpunkte', value: 'Autobahnkreuz Düsseldorf-Süd (A46/A59) sowie der Zubringer Kennedydamm/A52', quelle: 'Unfallatlas der Statistischen Ämter des Bundes und der Länder', url: 'https://unfallatlas.statistikportal.de/' },
      { label: 'Zuständige Gerichte', value: 'Amtsgericht Düsseldorf (Streitwert bis 5.000 €), darüber Landgericht Düsseldorf', quelle: 'Justizportal NRW', url: 'https://www.justiz.nrw' },
      { label: 'Sachverständigen-Dichte', value: 'ca. 31 BVSK-zertifizierte Kfz-Sachverständige im Großraum (geschätzt)', quelle: 'BVSK-Verbandsverzeichnis 2024' },
    ],
  },
}
