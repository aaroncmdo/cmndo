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
  internEmail,
} from './ids'

type Opts = { reporter: Reporter; dryRun?: boolean }
type Stage = 'c1' | 'c2' | 'c3'

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
    { id: PARTIES[stage], claim_id: CLAIMS[stage], rolle: 'geschaedigter', user_id: ACCOUNTS.kunde, quelle: 'seed' },
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
      technische_stellungnahme_status: 'angefordert',
    },
    o,
  )
}

// C1 — ersterfassung: offener Fall fürs Dispatch (assign-from-map) + Kunde-Upload (Pflichtdok-Slots) + Makler-Attribution.
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
      makler_id: ACCOUNTS.makler,
      created_via: 'makler_portal',
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
    await upsertById(db, 'pflichtdokumente', { id, fall_id: CLAIMS.c1, dokument_typ, sort_order }, o)
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

export async function ensureSeedGraph(db: SupabaseClient, o: Opts): Promise<void> {
  await ensureC2(db, o) // #3729-Blocker zuerst
  await ensureC1(db, o)
  await ensureC3(db, o)
}
