'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { signAndStoreContract } from '@/lib/contracts/sign-and-store'
import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { freigebeBasicSvCore } from '@/lib/sv-basic/freigabe'

/**
 * SV-Basic P2a Task 7: Basic-Onboarding finalisieren.
 *
 * Schreibt den Partnervertrag (PDF + Storage + vertraege_unterzeichnet-Eintrag
 * via signAndStoreContract) und setzt basic_onboarding_abgeschlossen_am auf
 * sachverstaendige — das Routing-Gate fuer den naechsten Wizard-Schritt.
 *
 * Voraussetzung: sachverstaendige.paket = 'basic'.
 * Danach AUTO-FREIGABE (Aaron 29.07.: "alle SVs sollen sich selbst freigeben"):
 * freigebeBasicSvCore setzt verifiziert/ist_aktiv/portal_zugang, sofern der Go-Live-
 * Geo-Guard passt (Standort + Isochrone) — sonst Fallback auf die manuelle
 * Freigabe-Queue (Admin-Task). Spiegelt damit die bezahlten Pfade (Stripe/Gutschein/
 * Sub-SV), die schon immer bei Abschluss selbst freischalten.
 *
 * unterschriftName wird server-seitig aus profiles.vorname/nachname abgeleitet —
 * der Wizard nimmt keinen expliziten Namen entgegen.
 */
export async function schliesseSvBasicOnboardingAb(input: {
  signaturePngDataUri: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!input.signaturePngDataUri) {
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

  // Namen aus dem Profil ableiten — kein Wizard-Input noetig.
  const { data: profile } = await admin
    .from('profiles')
    .select('vorname, nachname')
    .eq('id', user.id)
    .maybeSingle()
  const unterschriftName =
    [profile?.vorname, profile?.nachname].filter(Boolean).join(' ') || 'Sachverständiger'

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
      unterschrift_name: unterschriftName,
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

  // Auto-Freigabe (Aaron 29.07.): der SV schaltet sich bei Onboarding-Abschluss selbst
  // frei — wie die bezahlten Pfade (Stripe/Gutschein/Sub-SV). Der Freigabe-Kern erzwingt
  // den Go-Live-Geo-Guard (Standort + Isochrone), damit kein geo-loser SV "frei", aber
  // map-unsichtbar/undispatchbar live geht.
  const freigabe = await freigebeBasicSvCore(admin, sv.id)
  if (!freigabe.ok) {
    // Fallback: Geo-Guard hat blockiert (Standort/Isochrone fehlt) → manuelle
    // Freigabe-Queue (Admin-Task), damit ein Admin die Adresse nachträgt + freigibt.
    try {
      const { createLinkedTask } = await import('@/lib/tasks/create-task')
      await createLinkedTask({
        titel: 'Basic-Onboarding abgeschlossen — Auto-Freigabe blockiert (Standort/Geo fehlt)',
        beschreibung: `SV ${sv.id} hat das Basic-Onboarding abgeschlossen, die Auto-Freigabe wurde aber blockiert: ${freigabe.error} Bitte Adresse prüfen und manuell freigeben.`,
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
      console.error('[sv-onboarding] fallback admin-task:', err)
    }
  }

  revalidatePath('/gutachter/onboarding')
  revalidatePath('/gutachter/willkommen')
  revalidatePath('/admin/sachverstaendige', 'page')

  return { ok: true }
}
