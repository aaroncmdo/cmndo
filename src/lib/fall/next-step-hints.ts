// AAR-538 (C1): Nächster-Schritt-Hints pro Subphase.
// Wird von subphase-resolver.ts aufgerufen; kurzer, aktionsorientierter Text.

const HINTS: Record<string, string> = {
  // Phase 1
  '1': 'Fall noch nicht in aktiver Phase — Stammdaten prüfen',

  // Phase 2 — Vorbereitung
  '2.1': 'Vollmacht vom Kunden anfordern / per FlowLink senden',
  '2.2': 'Vollmacht freigeben — Prüfung läuft',
  '2.3': 'ZB1 ist da — FIN-Call über CarDentity auslösen',
  '2.4': 'FIN-Call bei CarDentity anstoßen',
  '2.5': 'WhatsApp-Reminder ist raus — Nachreichung abwarten',
  '2.6': 'Termin-Erinnerung versendet — Kunde auf dem Weg',

  // Phase 3 — Besichtigung
  '3.1': 'SV ist unterwegs — Kunde informieren falls nicht geschehen',
  '3.2': 'SV ist vor Ort — Durchführung abwarten',
  '3.3': 'Besichtigung durchgeführt — Gutachten-Upload abwarten',

  // Phase 4 — Gutachten
  '4.1': 'Gutachten in Bearbeitung — Upload erwartet',
  '4.2': 'Gutachten hochgeladen — OCR-Extraktion starten',
  '4.3': 'Kernwerte extrahiert — QC-Filmcheck durchführen',
  '4.4': 'QC bestanden — E-Akte vorbereiten & an Kanzlei übergeben',
  '4.5': 'E-Akte übergeben — Kanzlei-Workflow startet',

  // Phase 5 — Kanzlei
  '5.1': 'Kanzlei wartet auf Mandatsnummer-Zuweisung',
  '5.2': 'Mandatsnummer vergeben — Anschlussschreiben vorbereiten',
  '5.3': 'Anschlussschreiben in Vorbereitung — Versand abwarten',
  '5.4': 'Anschlussschreiben versendet — VS-Reaktion abwarten (14d)',
  '5.5': 'VS-Frist läuft — Tag 14/21/28-Eskalation prüfen',

  // Phase 6 — VS-Reaktion
  '6a': 'VS reguliert vollständig — Auszahlungs-Prozess starten',
  '6b': 'Kürzung juristisch vs. technisch entscheiden — Stellungnahme oder Rüge',
  '6c': 'VS lehnt ab — Kanzlei-Entscheidung Klage/Vergleich',
  '6d': 'VS schweigt — erste Eskalation (Rüge 1 vorbereiten)',
  '6e': 'Nachbesichtigung angefordert — SV-Koordination',

  // 6f — Quotierung (Erweiterung 1)
  '6f.1': 'Quote mit Kunde + Kanzlei klären — akzeptieren oder Rüge starten?',
  '6f.2': 'Auf Auszahlung warten',
  '6f.3': 'Schlussabrechnung erstellen',

  // Phase 7 — Rüge / Klage
  '7.1': 'Technische Stellungnahme vom SV einholen',
  '7.2': 'Stellungnahme ist da — Rüge 1 vorbereiten & versenden',
  '7.3': 'Rüge 1 versendet — 14d VS-Antwort abwarten',
  '7.4': 'Warten auf VS-Antwort nach Rüge 1',
  '7.5': 'Rüge 2 abgeschlossen — Klage-Prüfung',
  '7.5a': 'Rüge 2 versendet — 7d VS-Antwort abwarten',
  '7.5b': 'VS persönlich kontaktieren — Rüge 2 SLA überschritten (7d)',
  '7.6': 'Klage-Entscheidung — mit Kanzlei besprechen',

  // Phase 8 — Auszahlung (Split)
  '8.1': 'Auf Auszahlung von VS an beide Parteien warten',
  '8.2a': 'Kunde gezahlt — SV-Auszahlung anstoßen / tracken',
  '8.2b': 'SV gezahlt — Kunde-Auszahlung anstoßen / tracken',
  '8.3': 'Beide Auszahlungen eingegangen — Schlussabrechnung erstellen',
  '8.4': 'Schlussabrechnung erstellt — Abschluss vorbereiten',

  // Phase 9 — Abschluss
  '9.1': 'Fall geschlossen',
  '9.2': 'Feedback / Google-Bewertung anfordern',
  '9.3': 'Kanzlei-Abrechnung abgeschlossen',
}

export function getNextStepHint(subphase: string): string {
  return HINTS[subphase] ?? 'Nächster Schritt unbekannt — Support kontaktieren'
}
