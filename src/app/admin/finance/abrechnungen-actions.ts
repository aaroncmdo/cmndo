'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole } from '@/lib/auth/guards'
import { generiereKanzleiAbrechnungen } from '@/lib/finance/abrechnungen-generator'
import { generateAbrechnungPDF } from '@/lib/finance/abrechnung-pdf'
import { sendKanzleiMonatsAbrechnung } from '@/lib/email/google/flows'
import { revalidatePath } from 'next/cache'

// Write-Path-Audit (28.06.): Diese Finance-Actions hatten KEINEN Rollen-Guard (nur
// createClient/RLS). Da `abrechnungen` 0 Write-RLS-Policy hat, war der createClient-Write
// sogar funktional tot (RLS denied → 0 Rows, still ok:true). Das parallele File
// admin/abrechnungen/actions.ts ist admin-geguardet — hier nachgezogen: requireRole(['admin'])
// + admin-client (so wirkt der Write + ist autorisiert). Kein Privilege-Escalation-Risiko mehr.
//
// Audit-Konsolidierung 04.08. (Money-Fund #1): markiereAlsBezahlt + storniereAbrechnung
// GELOESCHT — der hiesige Thin-Storno setzte nur status='storniert' OHNE Stripe-Refund/
// Storno-Rechnung/Mail (Storno einer bezahlten Rechnung = Geld weg beim Kunden-Konto).
// Single-Writer ist jetzt admin/abrechnungen/actions.ts (stornoAbrechnung/markBezahlt);
// der Finance-Hub (AbrechnungenSection) konsumiert direkt dort.

export async function manuellVersenden(
  abrechnungId: string,
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireRole(['admin'])
  if (!guard.success) return { ok: false, error: guard.error ?? 'Nicht berechtigt' }

  const { data: abr } = await createAdminClient()
    .from('abrechnungen')
    .select('id, empfaenger_typ, pdf_path')
    .eq('id', abrechnungId)
    .single()

  if (!abr) return { ok: false, error: 'Abrechnung nicht gefunden' }

  if (!abr.pdf_path) {
    await generateAbrechnungPDF(abrechnungId)
  }

  if (abr.empfaenger_typ === 'kanzlei') {
    await sendKanzleiMonatsAbrechnung(abrechnungId)
  }

  revalidatePath('/admin/finance')
  return { ok: true }
}

export async function manuellGenerieren(
  monat: string,
  _typ: 'kanzlei' = 'kanzlei',
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireRole(['admin'])
  if (!guard.success) return { ok: false, error: guard.error ?? 'Nicht berechtigt' }

  try {
    const results = await generiereKanzleiAbrechnungen(monat)
    for (const r of results) {
      await generateAbrechnungPDF(r.abrechnungId)
    }
    revalidatePath('/admin/finance')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Generierung fehlgeschlagen' }
  }
}
