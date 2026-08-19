// Welche i18n-Namespaces der NextIntlClientProvider an den Browser serialisiert.
//
// WARUM ES DIESE LISTE GIBT
// Der Provider bekam bisher `messages={messages}` — also ALLE 51 Namespaces (265 KB).
// Die landen serialisiert im RSC-Flight-Payload und damit im ausgelieferten HTML,
// auf JEDER Seite. Gemessen am 18.08.2026 auf /kfz-gutachter/koeln:
//
//   HTML gesamt        615 KB
//     RSC-Flight       466 KB  (76 %)
//       davon Messages 280 KB  (46 % des gesamten HTML)
//
// Der sichtbare Text der Seite machte 2,5 % aus. Fuer KI-Antwortmaschinen ist das
// relevant: sie extrahieren Text aus dem rohen HTML und arbeiten mit Byte-Budgets —
// je mehr Nutzlast, desto unzuverlaessiger die Extraktion (GEO-Baseline 18.08.2026,
// Befund B4, `docs/2026-08-18-geo-baseline-claimondo.md`).
//
// SERVER BRAUCHT DEN PROVIDER NICHT
// Server-Komponenten uebersetzen mit `getTranslations()` und lesen die Messages
// direkt auf dem Server — sie sind von dieser Liste NICHT betroffen. Nur
// `useTranslations()` in `'use client'`-Komponenten braucht sie im Browser.
// Gemessen: 76 Client-Dateien nutzen zusammen exakt die 12 Namespaces unten
// (72 KB statt 265 KB → 73 % weniger).
//
// ⚠ PFLEGE — diese Liste ist NICHT optional zu halten
// Wer in einer Client-Komponente einen neuen Namespace anfaesst, MUSS ihn hier
// ergaenzen. Sonst wirft next-intl zur Laufzeit `MISSING_MESSAGE` und die UI zeigt
// den rohen Key (z.B. woertlich `phasen.subIntern.reparatur_terminfindung`) — ein
// Fehler, den kein Build und kein `tsc` faengt.
// Dagegen laeuft `client-namespaces.test.ts`: er scannt alle Client-Dateien und
// schlaegt fehl, sobald ein genutzter Namespace hier fehlt. Der Test laeuft in CI
// (Job `build` → „Marketing-Unit-Tests"), ohne Ratchet — rot blockt sofort.

export const CLIENT_NAMESPACES = [
  'check',
  'faq',
  'gutachter_partner',
  'home',
  'kfz_gutachter_stadt',
  'landing',
  'mdx_banner',
  'nav',
  'nutzungsausfall_rechner',
  'onboarding_wizard',
  'shared',
  'wertminderung_rechner',
] as const

/**
 * Reduziert die vollstaendigen Messages auf die client-seitig benoetigten Namespaces.
 * Unbekannte Namen werden still uebersprungen (eine Locale-Datei darf einen
 * Namespace nicht haben, ohne dass der Provider bricht).
 */
export function pickClientMessages(
  messages: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const ns of CLIENT_NAMESPACES) {
    if (ns in messages) out[ns] = messages[ns]
  }
  return out
}
