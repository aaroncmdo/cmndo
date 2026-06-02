'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { signAndStoreContract } from '@/lib/contracts/sign-and-store'
import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'

/**
 * SV-Basic P2a Task 7: Basic-Onboarding finalisieren.
 *
 * Schreibt den Partnervertrag (PDF + Storage + vertraege_unterzeichnet-Eintrag
 * via signAndStoreContract) und setzt basic_onboarding_abgeschlossen_am auf
 * sachverstaendige — das Routing-Gate fuer den naechsten Wizard-Schritt.
 *
 * Voraussetzung: sachverstaendige.paket = 'basic'.
 * KEIN onboarding_status-Flip, KEIN ist_aktiv/portal_zugang — P3-Freigabe bleibt Gate.
 * verifizierung_status bleibt unveraendert.
 */
export async function schliesseSvBasicOnboardingAb(input: {
  signaturePngDataUri: string
  unterschriftName: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!input.signaturePngDataUri || !input.unterschriftName?.trim()) {
    return { ok: false, error: 'Unterschrift fehlt.' }
  }

  const supabase = await createClient()
  const user = (await supabase.auth.getUser()).data.user
  if (!user) return { ok: false, error: 'Nicht angemeldet.' }

  const admin = createAdminClient()
  const { data: sv } = await admin
    .from('sachverstaendige')
    .select('id, paket')
    .eq('profile_id', user.id)
    .maybeSingle()

  if (!sv || sv.paket !== 'basic') {
    return { ok: false, error: 'Kein Basic-Konto.' }
  }

  // IP + User-Agent fuer den Audit-Trail
  const h = await headers()
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? null
  const userAgent = h.get('user-agent') ?? null

  // Vertrag: PDF generieren, in Storage hochladen, vertraege_unterzeichnet-Eintrag
  // schreiben — alles via signAndStoreContract (selbe Pipeline wie signSvVertrag).
  // vertraege_unterzeichnet Insert-Spalten: sv_id, vorlage_id (FK), vorlage_typ,
  // vorlage_version, unterschrift_name, unterschrift_ip, unterschrift_user_agent.
  // (Kein signatur_data_url in der Tabelle — das PNG wird ins PDF eingebrannt.)
  try {
    await signAndStoreContract({
      vorlage_typ: 'sv_basic_partnervertrag',
      unterschrift_name: input.unterschriftName.trim(),
      unterschrift_ip: ip,
      unterschrift_user_agent: userAgent,
      signature_png_data_uri: input.signaturePngDataUri,
      sv_id: sv.id,
      rolle: 'Solo-Sachverstaendiger',
    })
  } catch (err) {
    console.error('[sv-onboarding] vertrag signAndStore:', err)
    return { ok: false, error: 'Vertrag konnte nicht gespeichert werden.' }
  }

  // Completion-Marker + Vertrag-Flag setzen.
  // basic_onboarding_abgeschlossen_am wurde durch Task-6-Migration hinzugefuegt
  // und ist noch nicht in database.types.ts — cast benoetigt.
  const now = new Date().toISOString()
  const { error: updateErr } = await admin
    .from('sachverstaendige')
    .update({
      vertrag_unterschrieben: true,
      vertrag_unterschrieben_am: now,
      basic_onboarding_abgeschlossen_am: now,
    } as never)
    .eq('id', sv.id)

  if (updateErr) {
    console.error('[sv-onboarding] finalize update:', updateErr.message)
    return { ok: false, error: 'Abschluss fehlgeschlagen.' }
  }

  // Admin-Task (non-critical, fire & forget)
  try {
    const { createLinkedTask } = await import('@/lib/tasks/create-task')
    await createLinkedTask({
      titel: 'Basic-Onboarding abgeschlossen — bereit zur Freigabe',
      beschreibung: `SV ${sv.id} hat das Basic-Onboarding abgeschlossen. Bitte prüfen und freigeben.`,
      prioritaet: 'normal',
      typ: 'sv_basic_claim_review',
      entity_type: 'gutachter',
      entity_id: sv.id,
      empfaenger_rolle: 'admin',
      task_code: 'sv_basic_claim_review',
      trigger_event: 'sv_basic_onboarding_done',
      auto_erstellt: true,
    })
  } catch (err) {
    console.error('[sv-onboarding] admin-task:', err)
  }

  revalidatePath('/gutachter/onboarding')
  revalidatePath('/gutachter/willkommen')
  revalidatePath('/admin/sachverstaendige', 'page')

  return { ok: true }
}
