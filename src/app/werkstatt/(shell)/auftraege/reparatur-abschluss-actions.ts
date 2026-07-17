'use server'

// WS6 Slice 1 — Werkstatt schließt die Reparatur ab: Status 'erledigt' + Schlussrechnung-Upload
// → Claim-Close (direkter operative_status-Write, Praezedenz endzustand-actions.ts) → Provisions-Freigabe.
// Auth-aware Client fuer den reparatur_termine-RLS-Write (is_werkstatt_for_claim); Admin-Client fuer
// Upload + Claim-Close + Provision (bewusst service-role, wie erstelleKvaFuerAuftrag).

import { revalidatePath } from 'next/cache'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePortalAccess } from '@/lib/auth/portal-guard'
import {
  istReparaturClaimAbschliessbar,
  REPARATUR_CLOSE_GRUND,
} from '@/lib/werkstatt/repair-closure'
import { notifyKundeReparaturtermin } from '@/lib/werkstatt/notify-kunde-reparaturtermin'
import { closeReparaturClaimViaEngine } from '@/lib/faelle/reparatur-cursor'

export async function markiereReparaturErledigt(
  terminId: string,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  await requirePortalAccess(['werkstatt'])

  const file = formData.get('schlussrechnung')
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'Bitte die Schlussrechnung (PDF/Bild) hochladen.' }
  }
  if (file.size > 10 * 1024 * 1024) {
    return { ok: false, error: 'Datei zu groß (max. 10 MB).' }
  }

  const supabase = await createClient()
  // Termin + Claim laden (RLS: nur die eigene Werkstatt).
  const { data: termin, error: tErr } = await supabase
    .from('reparatur_termine')
    .select('id, claim_id, status, werkstatt_id')
    .eq('id', terminId)
    .maybeSingle()
  if (tErr) return { ok: false, error: tErr.message }
  if (!termin) return { ok: false, error: 'Termin nicht gefunden oder kein Zugriff' }

  const claimId = (termin as { claim_id: string }).claim_id
  const admin = createAdminClient()
  const { data: claim } = await admin
    .from('claims')
    .select('operative_status')
    .eq('id', claimId)
    .maybeSingle()
  if (!claim) return { ok: false, error: 'Claim nicht gefunden' }

  if (!istReparaturClaimAbschliessbar(
    { operative_status: (claim as { operative_status: string | null }).operative_status },
    { status: (termin as { status: string | null }).status },
  )) {
    return { ok: false, error: 'Reparatur kann in diesem Zustand nicht abgeschlossen werden.' }
  }

  // 1) Schlussrechnung → Storage + fall_dokumente (sichtbar_fuer inkl. kunde). fall_id via Bridge.
  const { data: bridge } = await admin
    .from('faelle_claim_bridge')
    .select('fall_id')
    .eq('claim_id', claimId)
    .maybeSingle()
  const fallId = (bridge as { fall_id: string } | null)?.fall_id ?? claimId

  const ext = (file.name.split('.').pop() || 'pdf').toLowerCase()
  const storagePath = `${fallId}/schlussrechnung_${Date.now()}.${ext}`
  const bytes = new Uint8Array(await file.arrayBuffer())
  const { error: upErr } = await admin.storage
    .from('fall-dokumente')
    .upload(storagePath, bytes, { contentType: file.type || 'application/pdf', upsert: true })
  if (upErr) return { ok: false, error: `Upload fehlgeschlagen: ${upErr.message}` }

  const { error: docErr } = await admin.from('fall_dokumente').insert({
    fall_id: fallId,
    claim_id: claimId,
    dokument_typ: 'schlussrechnung',
    storage_path: storagePath,
    original_filename: file.name,
    mime_type: file.type || 'application/pdf',
    groesse_bytes: bytes.byteLength,
    kategorie: 'schlussrechnung',
    quelle: 'werkstatt',
    sichtbar_fuer: ['admin', 'kundenbetreuer', 'sachverstaendiger', 'kanzlei', 'kunde'],
  } as never)
  if (docErr) return { ok: false, error: `Dokument-Speicherung fehlgeschlagen: ${docErr.message}` }

  const nowIso = new Date().toISOString()

  // 2) Claim schließen — CRITICAL: muss vor dem Termin-Status-Flip passieren.
  //    Funnel-Umbau (Status-Achsen-Lane 17.07., Aaron "Reparatur-Cursor voll verdrahten"):
  //    Der Abschluss laeuft jetzt durch die State-Machine statt per Direkt-.update(). Der
  //    Cursor wird (falls noetig) bis reparatur-erledigt vorgerueckt, dann schliesst
  //    transitionFallStatus auf abgeschlossen — inkl. Timeline + phase_transitions +
  //    fall.status_changed (die Engine feuert die drei Artefakte selbst; abgeschlossen_am +
  //    geschlossen_grund setzt sie mit). Damit ist der fruehere #4500-Sichtbarkeits-Nachzug
  //    obsolet. Idempotenz: der istReparaturClaimAbschliessbar-Guard oben faengt Re-Submit
  //    (terminal -> false) ab; closeReparaturClaimViaEngine ist zusaetzlich idempotent
  //    (schon abgeschlossen -> ok). Scheitert der Close (unerwarteter Rest-Status), bleibt
  //    der Termin auf 'bestaetigt' -> die Werkstatt kann sauber nochmal einreichen.
  const { data: { user: closeUser } } = await supabase.auth.getUser()
  const closeRes = await closeReparaturClaimViaEngine(fallId, {
    user_id: closeUser?.id ?? null,
    grund: REPARATUR_CLOSE_GRUND,
  })
  if (!closeRes.ok) return { ok: false, error: closeRes.error ?? 'Abschluss fehlgeschlagen.' }

  // 3) Werkstatt-Provision freigeben (pending -> freigegeben), an die Fertigstellung gekoppelt.
  //    Non-critical: Cron heilt spaeter nach (Praematur-Release-Vermeidung = 457ab612-Naht).
  const { error: provErr } = await admin
    .from('partner_provisionen')
    .update({ status: 'freigegeben' } as never)
    .eq('partner_typ', 'werkstatt')
    .eq('claim_id', claimId)
    .eq('status', 'pending')
  if (provErr) console.error('[WS6] Provisions-Freigabe fehlgeschlagen:', provErr.message)

  // 4) Termin -> erledigt (auth-aware Client wegen RLS is_werkstatt_for_claim).
  //    Non-critical: Claim + Provision sind schon committed; ein Status-Flip-Lag
  //    ist ein reines Display-Problem, kein verlorenes Ergebnis.
  const { error: stErr } = await supabase
    .from('reparatur_termine')
    .update({ status: 'erledigt', erledigt_am: nowIso, updated_at: nowIso } as never)
    .eq('id', terminId)
  if (stErr) console.error('[WS6] Termin-Status erledigt fehlgeschlagen:', stErr.message)

  revalidatePath(`/werkstatt/auftraege/${claimId}`)
  revalidatePath('/werkstatt/auftraege')
  revalidatePath(`/kunde/faelle/${claimId}`)

  // 5) Kunde-Notify (non-fatal).
  try {
    const svc = createServiceClient()
    await notifyKundeReparaturtermin({ claimId, ereignis: 'erledigt', bestaetigterTermin: null, svc })
  } catch (err) {
    console.warn('[WS6] Kunden-Notify erledigt fehlgeschlagen (non-fatal):', err)
  }

  return { ok: true }
}
