// CMM-50 Group B / CMM-44 SP-A: Unit-Tests fuer den Lead->Fall-Converter.
//
// HISTORIE: Frueher (AAR-575/576) snapshottete der faelle-INSERT kunde_* + hsn/tsn
// direkt. Mit der Conversion-Clean (CMM-50 Group B / CMM-44 SP-A) sind diese Spalten
// aus dem faelle-INSERT RAUS — sie leben jetzt auf claims bzw. der Geschaedigter-
// claim_party (convert-lead-to-claim.ts schreibt sie dort; v_claim_full.kunde_p sourct
// von dort). Dieser Test ist der Regression-Guard: die VERSCHOBENEN Spalten duerfen
// NICHT wieder in den faelle-INSERT wandern, die BEHALTENEN (Group A KEEP) muessen
// weiter durch — und der besichtigungsort->unfallort-Fallback muss greifen.

import { describe, it, expect } from 'vitest'
import { buildFallInsertFromLead, type LeadRow, type BuildFallOptions } from '../lead-fall-mapping'

const OPTS: BuildFallOptions = {
  // CMM-44 SP-A3: fallNummer aus BuildFallOptions entfernt — claim_nummer
  // ist kanonisch (DB-Trigger), die alte faelle-Aktennummer entfaellt.
  kundenbetreuerId: null,
  svIdFromTermin: null,
  signatureUrl: 'https://example.invalid/sig.png',
}

describe('buildFallInsertFromLead — CMM-50 Group B Contract', () => {
  it('traegt die nach claims/party VERSCHOBENEN Spalten NICHT mehr in den faelle-INSERT', () => {
    // Voller Lead mit allen frueher gesnapshotteten Feldern — keins davon darf
    // im faelle-INSERT landen (alle sind claims-/party-SSoT seit CMM-50/CMM-44).
    const lead: LeadRow = {
      id: 'lead-1',
      hsn: '0603',
      tsn: 'BFI',
      vorname: 'Anna',
      nachname: 'Müller',
      email: 'anna@example.invalid',
      telefon: '+49 170 1234567',
      kunde_strasse: 'Musterweg 12',
      kunde_plz: '50667',
      kunde_stadt: 'Köln',
    }
    const insert = buildFallInsertFromLead(lead, OPTS)
    const verschoben = [
      'hsn',
      'tsn',
      'kunde_vorname',
      'kunde_nachname',
      'kunde_telefon',
      'kunde_email',
      'kunde_strasse',
      'kunde_plz',
      'kunde_stadt',
    ]
    for (const feld of verschoben) {
      expect(insert[feld], `${feld} darf nicht im faelle-INSERT sein (claims/party-SSoT)`).toBeUndefined()
    }
  })

  it('traegt die BEHALTENEN kunde_adresse/_lat/_lng weiter durch (Group A KEEP)', () => {
    const lead: LeadRow = {
      id: 'lead-2',
      kunde_adresse: 'Musterweg 12, 50667 Köln',
      kunde_lat: 50.9375,
      kunde_lng: 6.9603,
    }
    const insert = buildFallInsertFromLead(lead, OPTS)
    expect(insert.kunde_adresse).toBe('Musterweg 12, 50667 Köln')
    expect(insert.kunde_lat).toBe(50.9375)
    expect(insert.kunde_lng).toBe(6.9603)
  })

  it('faellt fuer den Besichtigungsort auf unfallort zurueck wenn kein besichtigungsort_* im Lead', () => {
    // Semantik: „Auto steht am Unfallort" — der SV braucht eine Adresse fuer Navi/ICS/
    // Reminder, bevor der Dispatcher den Besichtigungsort explizit setzt.
    const lead: LeadRow = {
      id: 'lead-3',
      unfallort: 'Domplatz 1, 50667 Köln',
      unfallort_lat: 50.9413,
      unfallort_lng: 6.9583,
    }
    const insert = buildFallInsertFromLead(lead, OPTS)
    expect(insert.besichtigungsort_adresse).toBe('Domplatz 1, 50667 Köln')
    expect(insert.besichtigungsort_lat).toBe(50.9413)
    expect(insert.besichtigungsort_lng).toBe(6.9583)
  })

  it('nimmt besichtigungsort_* direkt und ueberschreibt NICHT mit unfallort wenn gesetzt', () => {
    const lead: LeadRow = {
      id: 'lead-4',
      besichtigungsort_adresse: 'Werkstattstr. 5, 50670 Köln',
      unfallort: 'Domplatz 1, 50667 Köln',
    }
    const insert = buildFallInsertFromLead(lead, OPTS)
    expect(insert.besichtigungsort_adresse).toBe('Werkstattstr. 5, 50670 Köln')
  })

  it('setzt den ist_fahrzeughalter-Default (true) wenn der Lead ihn nicht traegt', () => {
    const insert = buildFallInsertFromLead({ id: 'lead-5' }, OPTS)
    expect(insert.ist_fahrzeughalter).toBe(true)
  })
})
