// Kunde-Termin-Funnel Tranche W (Spec docs/superpowers/specs/2026-08-05-kunde-termin-funnel-design.md
// §4.9, W2): idempotenter Anlage-Helper fuer die reparatur_termine-Row. EIN Anlage-Muster
// fuer ALLE post-Convert-Bindungspfade (Akte-Finder via assignReparaturWerkstatt, Dispatch,
// KB, Lead-Sync und qr_referral via Convert). Ohne offene Row blendet WerkstattAuftragDetail
// die Termin-Sektion aus (if (!terminId) return null) -> toter Auftrag.
//
// Invariante: max. 1 OFFENE Row pro Claim (offen = status in
// angefragt/werkstatt_vorschlag/anruf_erbeten/bestaetigt). Empirisch bereits erfuellt
// (live-DB 08.08.: 0 Verstoesse). BEWUSST KEIN Partial-Unique-Index: reparatur_termine ist
// by design eine Historie (abgelehnt/storniert/erledigt bleiben als Verlaufszeilen liegen);
// ein Index ueber "offene" Zeilen waere fragil und bildete die Historie nicht ab. Der Helper
// serialisiert stattdessen ueber SELECT-vor-INSERT (Aufrufer sind non-fatal, kein harter
// Nebenlaeufigkeits-Anspruch — eine seltene Doppel-Row waere kosmetisch, kein Datenverlust).
//
// admin = service-role (createAdminClient, UNGETYPT). Der Caller MUSS Rolle/Ownership VOR
// dem Aufruf geprueft haben (Authz am Rand — der Client bypasst RLS). Kein 'use server':
// reine Lib-Funktion, kein Action-File.

import type { createAdminClient } from '@/lib/supabase/admin'

type AdminClient = ReturnType<typeof createAdminClient>

/** Offene reparatur_termine-Status: eine solche Row bedeutet "Auftrag laeuft". */
const OFFENE_STATUS = ['angefragt', 'werkstatt_vorschlag', 'anruf_erbeten', 'bestaetigt'] as const

export async function ensureReparaturTerminAngefragt(
  admin: AdminClient,
  { claimId, werkstattId, erstelltVon }: { claimId: string; werkstattId: string; erstelltVon: string | null },
): Promise<{ ok: boolean; created: boolean; error?: string }> {
  // 1. Offene Row vorhanden? -> noop (Idempotenz).
  const { data: bestehend, error: readErr } = await admin
    .from('reparatur_termine')
    .select('id')
    .eq('claim_id', claimId)
    .in('status', [...OFFENE_STATUS])
    .limit(1)
  if (readErr) return { ok: false, created: false, error: readErr.message }
  if (bestehend && bestehend.length > 0) return { ok: true, created: false }

  // 2. Keine offene Row -> anlegen. .select()+Row-Check gegen den RLS-Silent-Fail (#4625:
  //    ein von der DB verworfener Write liefert error=null, data=[] statt zu werfen).
  const { data: inserted, error: insErr } = await admin
    .from('reparatur_termine')
    .insert({
      claim_id: claimId,
      werkstatt_id: werkstattId,
      status: 'angefragt',
      wunschtermin: null,
      erstellt_von: erstelltVon,
    })
    .select('id')
  if (insErr) return { ok: false, created: false, error: insErr.message }
  if (!inserted || inserted.length === 0) {
    return { ok: false, created: false, error: 'reparatur_termine-Insert lieferte keine Zeile.' }
  }
  return { ok: true, created: true }
}
