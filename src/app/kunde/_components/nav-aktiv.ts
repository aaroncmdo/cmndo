// Ops-Test 11.08. (#26): Welcher Nav-Eintrag ist aktiv?
//
// BEFUND: Ein Klick auf „Mein Fall" markierte anschliessend „Fahrzeuge".
//
// URSACHE (kein Nav-Bug, sondern eine laufende Umstellung): Seit P6/WS H ist die
// KANONISCHE Claim-URL `/kunde/fahrzeuge/[vehId]/schaden/[claimId]` — `kunde/faelle/[id]`
// leitet bei einem owned Fahrzeug dorthin um (faelle/[id]/page.tsx). Das Nav-Item zeigt
// also auf eine Route, die woanders endet; danach matcht nur noch das Fahrzeuge-Item
// (startsWith). Der Sprung war die korrekte Anzeige einer inkonsistenten Verlinkung.
//
// REGEL HIER: Auf der kanonischen Claim-Detail-Route gewinnt das Fall-Item — der Nutzer
// ist bei „seinem Fall", auch wenn die URL unter /fahrzeuge/ liegt. Sonst gilt normales
// Matching, wobei der SPEZIFISCHSTE (laengste) Treffer gewinnt: sonst waeren bei
// verschachtelten Hrefs zwei Eintraege gleichzeitig markiert.
//
// Bewusst NUR die Markierung (Aaron-Entscheid 12.08. „gestaffelt"): Die vollstaendige
// fahrzeug-zentrische Umstellung — Einstieg ueber Fahrzeuge, Fall-Item entfaellt — ist
// ein eigener Scope und aendert die Routenstruktur.

/** Kanonische Claim-Detailseite unterhalb der Fahrzeug-Route (P6/WS H). */
const CLAIM_UNTER_FAHRZEUG = /^\/kunde\/fahrzeuge\/[^/]+\/schaden(\/|$)/

export type NavItemRef = { href: string; exact?: boolean }

/** PURE: Liegt der Pfad auf der kanonischen Claim-Detailseite? */
export function istClaimDetailPfad(pathname: string | null): boolean {
  return !!pathname && CLAIM_UNTER_FAHRZEUG.test(pathname)
}

/**
 * PURE: Welcher `href` aus `items` ist bei diesem `pathname` aktiv? Genau einer oder keiner.
 *
 * `fallHref` ist der Href des Fall-Eintrags („Mein Fall"), sofern vorhanden — er gewinnt
 * auf der kanonischen Claim-Detailseite.
 */
export function bestimmeAktivenHref(
  pathname: string | null,
  items: ReadonlyArray<NavItemRef>,
  fallHref: string | null,
): string | null {
  if (!pathname) return null

  // 1) Kanonische Claim-Detailseite -> das Fall-Item, nicht das Fahrzeuge-Item.
  if (fallHref && istClaimDetailPfad(pathname)) return fallHref

  // 2) Normales Matching; der laengste Treffer gewinnt (spezifischer schlaegt allgemeiner).
  let treffer: string | null = null
  for (const item of items) {
    const passt = item.exact
      ? pathname === item.href
      : pathname === item.href || pathname.startsWith(item.href + '/')
    if (!passt) continue
    if (!treffer || item.href.length > treffer.length) treffer = item.href
  }
  return treffer
}
