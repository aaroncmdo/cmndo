// (ii) Relationale Partner-Pin-Prominenz — reine Entscheidung, ob ein Karten-Pin
// als Netzwerkpartner hervorgehoben wird.
//
// BEWUSST nur der relationale `imNetzwerk`-Flag (Freund des attribuierten Owners aus
// `ladeAktiveSVs({ ownerProfilId })`), NICHT das globale `istNetzwerkpartner`:
// Aaron-Entscheid 09.08. — die Karte hebt Partner NUR hervor, wenn der Kunde ueber
// einen Gutachter-/Werkstatt-Einstieg kam (dann kennen wir sein Netzwerk). Der blanke
// anon-Finder ruft `ladeAktiveSVs()` OHNE Owner → `imNetzwerk` ist ueberall false →
// kein Highlight (kein "Pay-to-Play"-Eindruck auf der neutralen Flaeche).
//
// Eigenes dependency-freies Modul (nicht inline in FinderMap.tsx): FinderMap zieht
// mapbox-gl/react-dom — ein Unit-Test dieser Entscheidung soll die Kette nicht mitziehen
// (analog partner-pin ↔ tab.ts).
export function istHervorgehobenerPartner(sv: { imNetzwerk?: boolean | null }): boolean {
  return sv.imNetzwerk === true
}
