import type { SupabaseClient } from '@supabase/supabase-js'
import { Reporter, upsertById } from './lib'
import {
  ACCOUNTS,
  SV_SACHVERSTAENDIGE_ID,
  CLAIMS,
  LEADS,
  PARTIES,
  AUFTRAEGE,
  PFLICHTDOK,
  KANZLEI_FALL_ID,
  KANZLEI_FALL_C4,
  internEmail,
} from './ids'

type Opts = { reporter: Reporter; dryRun?: boolean }
type Stage = 'c1' | 'c2' | 'c3' | 'c4'

// Fixes Schadendatum — Date.now() im Script vermeiden -> reproduzierbar/idempotent.
const SCHADENTAG = '2026-06-15'

// Jeder Stage-Claim hat einen internen Lead (guard-konform: @claimondo.de ->
// istInterneIdentitaet=true -> intern->Test-SV-Buchung erlaubt).
async function ensureLead(db: SupabaseClient, stage: Stage, o: Opts): Promise<void> {
  await upsertById(
    db,
    'leads',
    {
      id: LEADS[stage],
      email: internEmail(stage),
      vorname: 'Test',
      nachname: `Geschädigter ${stage.toUpperCase()}`,
      status: 'umgewandelt',
    },
    o,
  )
}

// test-kunde ist auf jedem Stage-Claim die geschädigte Partei -> Kunde-Fallakte sichtbar.
async function ensureGeschaedigter(db: SupabaseClient, stage: Stage, o: Opts): Promise<void> {
  await upsertById(
    db,
    'claim_parties',
    { id: PARTIES[stage], claim_id: CLAIMS[stage], rolle: 'geschaedigter', user_id: ACCOUNTS.kunde, quelle: 'manuell_kb' },
    o,
  )
}

// C2 — sv-termin: SV hat den Auftrag, Stellungnahme ist angefordert -> SV-CTA #3729 + KB-Zuweisung.
async function ensureC2(db: SupabaseClient, o: Opts): Promise<void> {
  await ensureLead(db, 'c2', o)
  await upsertById(
    db,
    'claims',
    {
      id: CLAIMS.c2,
      schadentag: SCHADENTAG,
      operative_status: 'sv-termin',
      lead_id: LEADS.c2,
      sv_id: SV_SACHVERSTAENDIGE_ID,
      sv_zugewiesen_am: SCHADENTAG,
      kundenbetreuer_id: ACCOUNTS.kb,
      // sa_unterschrieben=true ist Pflicht: die SV-Fallseite (/gutachter/fall/[id])
      // gated auf sa_unterschrieben (CMM-25: Fallakte erst nach SA-Unterschrift). SP2-Flagship deckte das auf.
      sa_unterschrieben: true,
      sa_unterschrieben_am: SCHADENTAG,
      created_via: 'manuell_admin',
    },
    o,
  )
  await ensureGeschaedigter(db, 'c2', o)
  await upsertById(
    db,
    'auftraege',
    {
      id: AUFTRAEGE.c2,
      claim_id: CLAIMS.c2,
      fall_id: CLAIMS.c2,
      sv_id: SV_SACHVERSTAENDIGE_ID,
      typ: 'erstgutachten',
      status: 'termin',
      // Realer Wert der KB-Anforderung ist 'beauftragt' (prozess.ts / process-event.ts),
      // NICHT 'angefordert' (das ist nachbesichtigung_status). Die SV-Stellungnahme-Seite
      // gated auf 'beauftragt'. SP2-Flagship deckte den Prod-Bug im Fall-Banner auf.
      technische_stellungnahme_status: 'beauftragt',
      technische_stellungnahme_beauftragt_am: SCHADENTAG,
    },
    o,
  )
}

// C1 — ersterfassung: offener Fall fürs Dispatch (assign-from-map) + Kunde-Upload (Pflichtdok-Slots).
// Makler-Attribution deferred: claims.makler_id -> makler-Tabelle (nicht profiles); ein Trigger legt
// makler_fall_consent mit FK auf makler an -> braucht test-maklers makler.id (Refinement / SP2).
async function ensureC1(db: SupabaseClient, o: Opts): Promise<void> {
  await ensureLead(db, 'c1', o)
  await upsertById(
    db,
    'claims',
    {
      id: CLAIMS.c1,
      schadentag: SCHADENTAG,
      operative_status: 'ersterfassung',
      lead_id: LEADS.c1,
      created_via: 'manuell_admin',
    },
    o,
  )
  await ensureGeschaedigter(db, 'c1', o)
  const slots: [string, string, number][] = [
    [PFLICHTDOK.fahrzeugschein, 'fahrzeugschein', 0],
    [PFLICHTDOK.unfallfotos, 'unfallfotos', 1],
    [PFLICHTDOK.schadensfotos, 'schadensfotos', 2],
  ]
  for (const [id, dokument_typ, sort_order] of slots) {
    // status/dokument_url/hochgeladen_am auf ausstehend zurücksetzen -> der Kunde-Upload-Flow
    // (SP2) ist wiederholbar (sonst bliebe der Slot nach dem 1. Upload dauerhaft 'hochgeladen').
    await upsertById(
      db,
      'pflichtdokumente',
      { id, fall_id: CLAIMS.c1, dokument_typ, sort_order, status: 'ausstehend', dokument_url: null, hochgeladen_am: null },
      o,
    )
  }
}

// C3 — kanzlei-uebergeben: Kanzlei-Fall (kanzlei_faelle) -> Kanzlei-Portal. kanzlei_faelle ist
// nur über claim_id/fall_id verknüpft (kein kanzlei_id) -> kanzlei-Rolle sieht ihn global.
async function ensureC3(db: SupabaseClient, o: Opts): Promise<void> {
  await ensureLead(db, 'c3', o)
  await upsertById(
    db,
    'claims',
    {
      id: CLAIMS.c3,
      schadentag: SCHADENTAG,
      operative_status: 'kanzlei-uebergeben',
      lead_id: LEADS.c3,
      kanzlei_uebergeben_am: SCHADENTAG,
      kanzlei_ansprechpartner_name: 'Test Kanzlei',
      kanzlei_ansprechpartner_email: 'test-kanzlei@claimondo.de',
      created_via: 'manuell_admin',
    },
    o,
  )
  await ensureGeschaedigter(db, 'c3', o)
  await upsertById(
    db,
    'kanzlei_faelle',
    { id: KANZLEI_FALL_ID, claim_id: CLAIMS.c3, fall_id: CLAIMS.c3, status: 'versicherungskontakt' },
    o,
  )
}

// C4 — KB-Anforderungs-Fixture: Claim mit Auftrag, Stellungnahme NOCH NICHT angefordert
// (technische_stellungnahme_status=null -> der "Stellungnahme anfordern"-CTA erscheint) +
// vs_kuerzungs_typ='technisch' (Render-Bedingung des CTA in der VsReaktionSection) +
// kundenbetreuer_id=test-kb (RLS: test-kb darf die Anforderung triggern). KB-Flow -> 'beauftragt'.
async function ensureC4(db: SupabaseClient, o: Opts): Promise<void> {
  await ensureLead(db, 'c4', o)
  await upsertById(
    db,
    'claims',
    {
      id: CLAIMS.c4,
      schadentag: SCHADENTAG,
      operative_status: 'kanzlei-uebergeben',
      lead_id: LEADS.c4,
      sv_id: SV_SACHVERSTAENDIGE_ID,
      sv_zugewiesen_am: SCHADENTAG,
      kundenbetreuer_id: ACCOUNTS.kb,
      sa_unterschrieben: true,
      sa_unterschrieben_am: SCHADENTAG,
      created_via: 'manuell_admin',
    },
    o,
  )
  await ensureGeschaedigter(db, 'c4', o)
  // kanzlei_faelle mit VS-Kürzung. Zwei Felder steuern den KB-CTA (verifiziert gg section-visibility.ts
  // + Sections.tsx VsReaktionSection):
  //   - vs_reaktion_typ='gekuerzt' -> 'vs_reaktion'-Section sichtbar (getTriggeredFallSections:
  //     phase>=6 || vs_reaktion_typ) UND isKuerzt (reaktionTyp==='gekuerzt') -> "VS kürzt"-Block rendert.
  //   - vs_kuerzungs_typ='technisch' (+ technische_stellungnahme_status=null am Auftrag) -> der Button
  //     "Stellungnahme von SV anfordern" erscheint.
  // Beide sind text-Spalten auf kanzlei_faelle (NICHT claims), projiziert in v_claim_base/v_faelle.
  await upsertById(
    db,
    'kanzlei_faelle',
    {
      id: KANZLEI_FALL_C4,
      claim_id: CLAIMS.c4,
      fall_id: CLAIMS.c4,
      status: 'versicherungskontakt',
      vs_reaktion_typ: 'gekuerzt',
      vs_kuerzungs_typ: 'technisch',
      kuerzungs_betrag: 500,
      vs_kuerzung_grund: 'UPE-Aufschlag strittig',
    },
    o,
  )
  await upsertById(
    db,
    'auftraege',
    {
      id: AUFTRAEGE.c4,
      claim_id: CLAIMS.c4,
      fall_id: CLAIMS.c4,
      sv_id: SV_SACHVERSTAENDIGE_ID,
      typ: 'erstgutachten',
      status: 'termin',
      // Reset auf noch-nicht-angefordert (null) -> KB-CTA erscheint; der KB-Flow setzt 'beauftragt' (wiederholbar).
      technische_stellungnahme_status: null,
      technische_stellungnahme_beauftragt_am: null,
    },
    o,
  )
}

export async function ensureSeedGraph(db: SupabaseClient, o: Opts): Promise<void> {
  await ensureC2(db, o) // #3729-Blocker zuerst
  await ensureC1(db, o)
  await ensureC3(db, o)
  await ensureC4(db, o)
}
