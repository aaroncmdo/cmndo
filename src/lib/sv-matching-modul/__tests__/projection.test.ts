import { describe, expect, test } from 'vitest'
import type { SvMatchCandidate } from '@/lib/dispatch/findBestSV'
import { rundeDistanz, toOeffentlichesSvProfil } from '../projection'
import type { SlotVorschlag } from '../types'

// Vollstaendiger (leaky) Kandidat wie ihn findBestSV liefert.
function makeCandidate(overrides: Partial<SvMatchCandidate> = {}): SvMatchCandidate {
  return {
    svId: 'sv-uuid-1',
    profileId: 'profile-uuid-1',
    name: 'Thomas Müller', // Vor + NACHname — darf nie zum Kunden
    paket: 'premium',
    distanzKm: 12.3,
    etaFromBueroMin: 18,
    offeneFaelle: 4,
    kontingentFrei: 6,
    ablehnungen30d: 2,
    score: 287,
    reasons: ['Paket: premium', '2 Ablehnungen', 'am Wunschtermin frei'],
    verfuegbarAmWunschtermin: true,
    naechsterFreierSlot: null,
    ...overrides,
  }
}

describe('rundeDistanz', () => {
  test('rundet auf 5-km-Schritte', () => {
    expect(rundeDistanz(12.3)).toBe('ca. 10 km')
    expect(rundeDistanz(13)).toBe('ca. 15 km')
    expect(rundeDistanz(47.8)).toBe('ca. 50 km')
  })

  test('Minimum 5 km — verraet die exakte Naehe nicht ("ca. 0 km")', () => {
    expect(rundeDistanz(0)).toBe('ca. 5 km')
    expect(rundeDistanz(1.2)).toBe('ca. 5 km')
    expect(rundeDistanz(2.4)).toBe('ca. 5 km')
  })
})

describe('toOeffentlichesSvProfil — Daten-Leak-Schutz', () => {
  const slots: SlotVorschlag[] = [
    { start: '2026-06-02T06:00:00Z', end: '2026-06-02T06:45:00Z', matchType: 'wunschtermin' },
  ]

  test('uebernimmt genau die Whitelist-Felder', () => {
    const r = toOeffentlichesSvProfil({
      candidate: makeCandidate(),
      bewertung: { durchschnitt: 4.8, anzahl: 57, aktualisiert: '2026-05-01T00:00:00Z' },
      profil: { vorname: 'Thomas', avatar_url: 'https://x/t.jpg', profilbeschreibung: 'Kfz-Sachverständiger' },
      slots,
      istNetzwerkpartner: true,
    })
    expect(r.svId).toBe('sv-uuid-1')
    expect(r.vorname).toBe('Thomas')
    expect(r.profilbild).toBe('https://x/t.jpg')
    expect(r.profilbeschreibung).toBe('Kfz-Sachverständiger')
    expect(r.bewertungDurchschnitt).toBe(4.8)
    expect(r.bewertungAnzahl).toBe(57)
    expect(r.bewertungAktualisiert).toBe('2026-05-01T00:00:00Z')
    expect(r.distanzGerundet).toBe('ca. 10 km')
    expect(r.istWunschterminFrei).toBe(true)
    expect(r.istTopPartner).toBe(true) // 13b: istNetzwerkpartner=true (Abo-Praedikat, nicht paket)
    expect(r.slots).toEqual(slots)
  })

  test('leakt KEINE internen Scoring-/PII-Felder (strukturell)', () => {
    const r = toOeffentlichesSvProfil({
      candidate: makeCandidate(),
      bewertung: { durchschnitt: 4.8, anzahl: 57, aktualisiert: null },
      profil: { vorname: 'Thomas', avatar_url: null, profilbeschreibung: null },
      slots: [],
    })
    for (const verboten of [
      'score', 'reasons', 'paket', 'kontingentFrei', 'ablehnungen30d',
      'etaFromBueroMin', 'offeneFaelle', 'profileId', 'name', 'nachname',
      'verfuegbarAmWunschtermin', 'naechsterFreierSlot',
    ]) {
      expect(r).not.toHaveProperty(verboten)
    }
  })

  test('Whitelist ist GESCHLOSSEN — kein neu hinzugefuegtes Feld kann durchrutschen', () => {
    // Closed-Set-Guard: staerker als not.toHaveProperty(liste) — faengt JEDES
    // kuenftig ergaenzte Feld (z.B. beim /flow-UI-Umbau), nicht nur bekannte.
    // 'istTopPartner' ist die BEWUSSTE Ergaenzung (Aaron 14.06., AAR-956): ein
    // abgeleitetes Boolean (paket !== 'basic'), kein roher paket-Wert — s. die
    // separaten istTopPartner-Tests unten + das types.ts-AUSNAHME-Kommentar.
    const r = toOeffentlichesSvProfil({
      candidate: makeCandidate(),
      bewertung: { durchschnitt: 4.8, anzahl: 57, aktualisiert: null },
      profil: { vorname: 'Thomas', avatar_url: null, profilbeschreibung: null },
      slots: [],
    })
    expect(Object.keys(r).sort()).toEqual([
      'bewertungAktualisiert', 'bewertungAnzahl', 'bewertungDurchschnitt',
      'distanzGerundet', 'imNetzwerk', 'istTopPartner', 'istWunschterminFrei',
      'profilbeschreibung', 'profilbild', 'rang', 'rangSinnsatz', 'slots', 'svId', 'vorname',
    ])
  })

  // Ebene-2 (relational): imNetzwerk = zahlender Freund des attribuierenden Owners.
  test('imNetzwerk true/false steuert das Feld 1:1; fehlend → false (fail-closed)', () => {
    const boost = toOeffentlichesSvProfil({
      candidate: makeCandidate(),
      bewertung: null,
      profil: { vorname: 'Thomas', avatar_url: null, profilbeschreibung: null },
      slots: [],
      imNetzwerk: true,
    })
    expect(boost.imNetzwerk).toBe(true)
    const ohneBoost = toOeffentlichesSvProfil({
      candidate: makeCandidate(),
      bewertung: null,
      profil: { vorname: 'Thomas', avatar_url: null, profilbeschreibung: null },
      slots: [],
      imNetzwerk: false,
    })
    expect(ohneBoost.imNetzwerk).toBe(false)
    const fehlend = toOeffentlichesSvProfil({
      candidate: makeCandidate(),
      bewertung: null,
      profil: { vorname: 'Thomas', avatar_url: null, profilbeschreibung: null },
      slots: [],
    })
    expect(fehlend.imNetzwerk).toBe(false)
  })

  test('rang — verdienter Tier + Sinnsatz werden projiziert; fehlend → null', () => {
    const mit = toOeffentlichesSvProfil({
      candidate: makeCandidate(),
      bewertung: null,
      profil: { vorname: 'Thomas', avatar_url: null, profilbeschreibung: null },
      slots: [],
      rang: { tier: 'silber', sinnsatz: 'Silber-Partner · top bewertet · verifiziert' },
    })
    expect(mit.rang).toBe('silber')
    expect(mit.rangSinnsatz).toBe('Silber-Partner · top bewertet · verifiziert')
    const ohne = toOeffentlichesSvProfil({
      candidate: makeCandidate(),
      bewertung: null,
      profil: { vorname: 'Thomas', avatar_url: null, profilbeschreibung: null },
      slots: [],
    })
    expect(ohne.rang).toBeNull()
    expect(ohne.rangSinnsatz).toBeNull()
  })

  test('leakt KEINE internen Werte (serialisiert)', () => {
    const r = toOeffentlichesSvProfil({
      candidate: makeCandidate(),
      bewertung: { durchschnitt: 4.8, anzahl: 57, aktualisiert: null },
      profil: { vorname: 'Thomas', avatar_url: null, profilbeschreibung: null },
      slots: [],
    })
    const json = JSON.stringify(r)
    expect(json).not.toContain('Müller') // Nachname
    expect(json).not.toContain('287') // score
    expect(json).not.toContain('Ablehnungen') // reasons
    expect(json).not.toContain('premium') // paket
  })

  test('Vorname kommt aus profiles, nie aus candidate.name (mit Nachname)', () => {
    const r = toOeffentlichesSvProfil({
      candidate: makeCandidate({ name: 'Thomas Müller' }),
      bewertung: null,
      profil: { vorname: 'Thomas', avatar_url: null, profilbeschreibung: null },
      slots: [],
    })
    expect(r.vorname).toBe('Thomas')
    expect(JSON.stringify(r)).not.toContain('Müller')
  })

  test('fehlende Bewertung/Profil → null-Felder + Vorname-Fallback, kein Crash', () => {
    const r = toOeffentlichesSvProfil({
      candidate: makeCandidate(),
      bewertung: null,
      profil: null,
      slots: [],
    })
    expect(r.bewertungDurchschnitt).toBeNull()
    expect(r.bewertungAnzahl).toBeNull()
    expect(r.profilbild).toBeNull()
    expect(r.profilbeschreibung).toBeNull()
    expect(r.vorname.length).toBeGreaterThan(0)
  })

  test('istWunschterminFrei ist false wenn candidate.verfuegbarAmWunschtermin nicht true', () => {
    const r = toOeffentlichesSvProfil({
      candidate: makeCandidate({ verfuegbarAmWunschtermin: false }),
      bewertung: null,
      profil: { vorname: 'Thomas', avatar_url: null, profilbeschreibung: null },
      slots: [],
    })
    expect(r.istWunschterminFrei).toBe(false)
  })

  // 13b LOCKED: istTopPartner = Netzwerkpartner-Abo-Praedikat (istNetzwerkpartner
  // aus ladeZahlendeSvSet), NICHT mehr paket. Der rohe paket-Wert wird NIE
  // projiziert (s. „leakt KEINE internen Werte") und treibt istTopPartner auch
  // nicht mehr indirekt — loest die fruehere AAR-956-paket-Ableitung ab.
  describe('istTopPartner — Abo-Praedikat (istNetzwerkpartner), nicht paket', () => {
    test('istNetzwerkpartner true/false steuert istTopPartner 1:1', () => {
      const zahlt = toOeffentlichesSvProfil({
        candidate: makeCandidate(),
        bewertung: null,
        profil: { vorname: 'Thomas', avatar_url: null, profilbeschreibung: null },
        slots: [],
        istNetzwerkpartner: true,
      }).istTopPartner
      const frei = toOeffentlichesSvProfil({
        candidate: makeCandidate(),
        bewertung: null,
        profil: { vorname: 'Thomas', avatar_url: null, profilbeschreibung: null },
        slots: [],
        istNetzwerkpartner: false,
      }).istTopPartner
      expect(zahlt).toBe(true)
      expect(frei).toBe(false)
    })

    test('fehlendes istNetzwerkpartner (undefined) → false (fail-closed, kein paket-Fallback)', () => {
      const r = toOeffentlichesSvProfil({
        candidate: makeCandidate(),
        bewertung: null,
        profil: { vorname: 'Thomas', avatar_url: null, profilbeschreibung: null },
        slots: [],
      })
      expect(r.istTopPartner).toBe(false)
    })

    test('paket=premium ALLEIN (ohne istNetzwerkpartner) zieht istTopPartner NICHT mehr auf true', () => {
      const r = toOeffentlichesSvProfil({
        candidate: makeCandidate({ paket: 'premium' }),
        bewertung: null,
        profil: { vorname: 'Thomas', avatar_url: null, profilbeschreibung: null },
        slots: [],
      })
      expect(r.istTopPartner).toBe(false)
    })

    test('verraet den istNetzwerkpartner-Wert nicht als paket-String (JSON)', () => {
      const r = toOeffentlichesSvProfil({
        candidate: makeCandidate({ paket: 'premium' }),
        bewertung: null,
        profil: { vorname: 'Thomas', avatar_url: null, profilbeschreibung: null },
        slots: [],
        istNetzwerkpartner: true,
      })
      expect(r.istTopPartner).toBe(true)
      expect(JSON.stringify(r)).not.toContain('premium')
    })
  })
})
