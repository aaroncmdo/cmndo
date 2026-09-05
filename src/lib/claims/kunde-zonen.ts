// P0 (Kunde-Detail-Rebuild): die REINE, phasen-adaptive Ableitung — welche Zonen sichtbar sind
// und welche offenen Aufgaben der Kunde hat. Hier lebt die „vollständig DB-getrieben"-Logik
// (aus dem ViewModel, keine ad-hoc-Gates in der JSX). Unit-getestet.

import type { KundeClaimViewModel } from '@/lib/claims/kunde-claim-view'

export type ZoneId = 'status' | 'aufgaben' | 'team' | 'geld' | 'doksTermine'

export type KundeAufgabe = {
  id: 'bankdaten' | 'kva_freigabe' | 'pflichtdok' | 'termin_waehlen' | 'termin_bestaetigen' | 'sa_vollmacht'
  label: string
  /** Audit-Fund b3: Ziel-Zone des CTA, wenn sie vom Fall-Zustand abhängt — der
   *  Reparaturtermin lebt in der GeldZone (WerkstattCard), der SV-Termin in
   *  DoksTermine. Fehlt zone, greift die statische Anchor-Map der AufgabenZone. */
  zone?: ZoneId
}

// Termin-Status, die eine Kunden-Bestätigung erwarten (SV: reserviert/gegenvorschlag;
// Reparatur: angefragt/werkstatt_vorschlag/anruf_erbeten). Audit-Fund b4:
// werkstatt_vorschlag ist der handlungspflichtigste Status — die Werkstatt hat einen
// Termin VORGESCHLAGEN, der Kunde muss „Passt/Passt nicht" antworten (CHECK-Constraint
// prod-verifiziert 17.07.).
// Ops-Test 11.08. (RC-10): 'angefragt' und 'reserviert' sind WARTE-Zustaende, keine
// Kunden-To-dos — sie erzeugten die Aufgabe "Termin bestätigen", obwohl es nichts zu
// bestaetigen gab. Aaron: "es gibt aber noch keinen Rücktermin von der Werkstatt … der
// Termin für den SV wird automatisch bestätigt."
//   angefragt   = Anfrage ist bei der Werkstatt, sie hat noch nicht geantwortet.
//                 prod-verifiziert 12.08.: alle 7 'angefragt'-Zeilen haben WEDER
//                 bestaetigter_termin NOCH wunschtermin — es existiert kein Zeitpunkt.
//   reserviert  = SV-Termin vor der (automatischen) Bestaetigung — der Kunde tut nichts.
// Handlungspflichtig bleibt nur, wenn die Gegenseite dem Kunden den Ball zuspielt:
//   werkstatt_vorschlag = Werkstatt hat einen Termin vorgeschlagen -> "Passt / Passt nicht"
//   gegenvorschlag      = SV hat einen Gegenvorschlag gemacht
//   anruf_erbeten       = Werkstatt bittet um Rueckruf
const TERMIN_OFFEN = new Set(['gegenvorschlag', 'werkstatt_vorschlag', 'anruf_erbeten'])

/**
 * Offene Kunde-To-dos aus dem Fall-Zustand (reine Ableitung). Leeres Array = nichts zu tun
 * (dann blendet die AufgabenZone sich aus).
 */
export function deriveKundeAufgaben(vm: KundeClaimViewModel): KundeAufgabe[] {
  const aufgaben: KundeAufgabe[] = []

  if (vm.flags.bankdatenOffen) {
    aufgaben.push({ id: 'bankdaten', label: 'Bankdaten hinterlegen' })
  }
  // Reparatur-Route: ein KVA liegt vor, der Kunde hat ihn noch nicht per Unterschrift
  // freigegeben UND ihn nicht gerade abgelehnt. Zwei Kohärenz-Fixes:
  //  - R2: netto-ODER-brutto (nicht nur brutto). Jeder andere KVA-Consumer nutzt
  //    `brutto ?? netto` (werkstatt-auftrag-segment kvaStatus, WerkstattAuftragDetail,
  //    GeldZone-Card-Sichtbarkeit) — ein netto-only-KVA ist ein gültiger KVA; nur diese
  //    Aufgabe fiel bisher aus → Kunde bekam keinen „Reparaturauftrag freigeben"-Nudge.
  //  - R1: bei kvaAbgelehntAm blendet die KostenvoranschlagCard die Freigabe aus (die
  //    Werkstatt überarbeitet) → dann ist „Reparaturauftrag freigeben" kein Kunden-To-do.
  if (
    vm.flags.istReparaturRoute &&
    (vm.geld.kvaBrutto != null || vm.geld.kvaNetto != null) &&
    vm.geld.kvaAbgelehntAm == null &&
    !vm.flags.reparaturFreigegeben
  ) {
    aufgaben.push({ id: 'kva_freigabe', label: 'Reparaturauftrag freigeben' })
  }
  if (vm.pflichtdokumente.offen > 0) {
    aufgaben.push({ id: 'pflichtdok', label: 'Dokumente nachreichen' })
  }
  // T4: „Gutachtertermin wählen" — noch KEIN (Wunsch-)Termin gewählt, Claim nicht terminal,
  // Fall braucht eine Begutachtung (nicht die reine Reparatur-Lane) und es ist noch KEIN SV
  // zugewiesen. Nur dieser !svId-Fall führt in den funktionierenden Kalender-Wunschtermin-
  // Fallback (T4-5a); die Engine-Partner-Findung + sv_id-Buchung folgt als T4-5b/T4-6.
  // svTermin==null deckt beide Pending-Achsen mit ab (der Loader zählt dispatch_pending/
  // sv_gesucht zu svTermin) → sobald der Kunde einen Wunsch stellt, verschwindet die Aufgabe.
  if (
    vm.status.svTermin == null &&
    !vm.flags.istTerminal &&
    !vm.flags.istReparaturRoute &&
    !vm.team.sv
  ) {
    aufgaben.push({ id: 'termin_waehlen', label: 'Gutachtertermin wählen' })
  }
  const offenerTermin = vm.termine.find((t) => TERMIN_OFFEN.has(t.status ?? ''))
  if (offenerTermin) {
    aufgaben.push({
      id: 'termin_bestaetigen',
      label: 'Termin bestätigen',
      // b3: Reparaturtermin -> GeldZone (WerkstattCard); SV-Termin -> DoksTermine.
      zone: offenerTermin.art === 'reparatur' ? 'geld' : 'doksTermine',
    })
  }
  // Aaron 08.08. (Abnahme 05.09., Screenshot Fallakte Kasko): Kasko/Selbstzahler unterschreiben nichts —
  // die Aufgabe nur auf der Gutachter-Route (gleiche Weiche wie flow/[token]/page.tsx: istWerkstattReparaturWeg).
  if (vm.fall.sa_unterschrieben === false && !vm.flags.istReparaturRoute) {
    aufgaben.push({ id: 'sa_vollmacht', label: 'Unterschrift ausstehend' })
  }

  return aufgaben
}

/**
 * Sichtbare Zonen in mobiler Scroll-Reihenfolge (Status → Aufgaben → Team → Geld → Doks&Termine).
 * Phasen-adaptiv: nur was im aktuellen Lifecycle-Zustand relevant ist.
 */
export function deriveKundeZonen(vm: KundeClaimViewModel): ZoneId[] {
  const zonen: ZoneId[] = ['status']

  if (deriveKundeAufgaben(vm).length > 0) zonen.push('aufgaben')

  if (vm.team.kb || vm.team.sv) zonen.push('team')

  const mainPhase = vm.lifecycle.mainPhase
  const geldSichtbar =
    mainPhase === 'regulierung' ||
    mainPhase === 'abschluss' ||
    vm.geld.forderungNetto != null ||
    vm.geld.auszahlungNetto != null ||
    vm.geld.kvaBrutto != null ||
    // Preserve-all: die GeldZone beherbergt jetzt auch die Kanzlei-, Werkstatt- und
    // Bankdaten-Karten, die in der alten page.tsx in der phasen-unabhaengigen Sidebar
    // standen. Ohne diese ORs fielen sie in fruehen Phasen (Erfassung/Begutachtung)
    // faelschlich weg — genau der preserve-all-Bruch, den Task A schliesst.
    vm.flags.istReparaturRoute ||
    vm.flags.kanzleiSichtbar ||
    vm.flags.bankdatenOffen
  if (geldSichtbar) zonen.push('geld')

  zonen.push('doksTermine')

  return zonen
}
