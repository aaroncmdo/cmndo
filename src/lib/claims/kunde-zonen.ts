// P0 (Kunde-Detail-Rebuild): die REINE, phasen-adaptive Ableitung — welche Zonen sichtbar sind
// und welche offenen Aufgaben der Kunde hat. Hier lebt die „vollständig DB-getrieben"-Logik
// (aus dem ViewModel, keine ad-hoc-Gates in der JSX). Unit-getestet.

import type { KundeClaimViewModel } from '@/lib/claims/kunde-claim-view'

export type ZoneId = 'status' | 'aufgaben' | 'team' | 'geld' | 'doksTermine'

export type KundeAufgabe = {
  id: 'bankdaten' | 'kva_freigabe' | 'pflichtdok' | 'termin_bestaetigen' | 'sa_vollmacht'
  label: string
}

// Termin-Status, die eine Kunden-Bestätigung erwarten (SV: reserviert/gegenvorschlag;
// Reparatur: angefragt/anruf_erbeten).
const TERMIN_OFFEN = new Set(['reserviert', 'gegenvorschlag', 'angefragt', 'anruf_erbeten'])

/**
 * Offene Kunde-To-dos aus dem Fall-Zustand (reine Ableitung). Leeres Array = nichts zu tun
 * (dann blendet die AufgabenZone sich aus).
 */
export function deriveKundeAufgaben(vm: KundeClaimViewModel): KundeAufgabe[] {
  const aufgaben: KundeAufgabe[] = []

  if (vm.flags.bankdatenOffen) {
    aufgaben.push({ id: 'bankdaten', label: 'Bankdaten hinterlegen' })
  }
  // Reparatur-Route: KVA liegt vor, aber der Reparaturauftrag ist noch nicht per Unterschrift
  // freigegeben.
  if (vm.flags.istReparaturRoute && vm.geld.kvaBrutto != null && !vm.flags.reparaturFreigegeben) {
    aufgaben.push({ id: 'kva_freigabe', label: 'Reparaturauftrag freigeben' })
  }
  if (vm.pflichtdokumente.offen > 0) {
    aufgaben.push({ id: 'pflichtdok', label: 'Dokumente nachreichen' })
  }
  if (vm.termine.some((t) => TERMIN_OFFEN.has(t.status ?? ''))) {
    aufgaben.push({ id: 'termin_bestaetigen', label: 'Termin bestätigen' })
  }
  if (vm.fall.sa_unterschrieben === false) {
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
