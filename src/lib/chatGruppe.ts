import { createAdminClient } from '@/lib/supabase/admin'
import { resolveClaimId } from '@/lib/claims/get-claim-for-role'

// AAR-310: Die alten chat_gruppen / chat_teilnehmer Tabellen existieren nicht
// mehr (Architektur ist seit AAR-102 auf nachrichten.kanal mit CHECK-Constraint
// auf 5 Kanälen migriert). Dieses Modul war Dead Code und crashte bei jedem
// Aufruf — sichtbar in Vercel-Logs als "[chatGruppe] Fehler beim Erstellen…".
//
// Statt das Modul komplett zu löschen behalten wir die Funktionssignaturen
// (mehrere Consumer in flow/, kunde/, gutachter/) und implementieren sie auf
// dem aktuellen Schema:
// - Eine Gruppe pro Fall (fallId == gruppeId konzeptuell)
// - Teilnehmer abgeleitet aus faelle.kunde_id / kundenbetreuer_id / sv_id
// - System-Nachrichten in nachrichten mit kanal='gruppenchat', is_system=true

/**
 * AAR-310: Postet eine System-Nachricht im Gruppenchat eines Falls.
 * Ersetzt die alte Implementierung die in chat_gruppen/nachrichten.gruppe_id
 * insertete (beides existiert nicht mehr).
 */
export async function sendSystemNachricht(
  fallId: string,
  nachricht: string,
  // i18n Phase 1: optionaler Template-Key + Params fuer Leser-Sprach-Rendering.
  // nachricht bleibt de-Fallback.
  opts?: { templateKey?: string; templateParams?: Record<string, string | number> },
): Promise<void> {
  const admin = createAdminClient()

  const { error } = await admin.from('nachrichten').insert({
    fall_id: fallId,
    kanal: 'gruppenchat',
    sender_id: null,
    sender_rolle: 'system',
    nachricht,
    hat_anhang: false,
    is_system: true,
    template_key: opts?.templateKey ?? null,
    template_params: opts?.templateParams ?? null,
  })

  if (error) {
    console.error('[chatGruppe] sendSystemNachricht fehlgeschlagen:', error.message)
  }
}

/**
 * AAR-310: Holt alle Chat-Teilnehmer eines Falls — Kunde, KB, SV — direkt aus
 * faelle + profiles. Es gibt keine separate chat_teilnehmer-Tabelle mehr.
 */
export async function getChatTeilnehmer(fallId: string): Promise<Array<{
  user_id: string
  rolle: 'kunde' | 'kundenbetreuer' | 'gutachter'
  vorname: string | null
  nachname: string | null
  avatar_url: string | null
}>> {
  const admin = createAdminClient()

  // CMM-49 Reader-Sweep: faelle-frei — claims = SSoT. geschaedigter_user_id==kunde_id (0-diff,
  // NON-Auth Teilnehmer-Anzeige), sv_id (0-diff), kundenbetreuer_id alle nativ auf claims.
  const claimId = await resolveClaimId(admin, fallId)
  const { data: claim } = claimId
    ? await admin
        .from('claims')
        .select('geschaedigter_user_id, sv_id, kundenbetreuer_id')
        .eq('id', claimId)
        .maybeSingle()
    : { data: null }

  if (!claim) return []

  const teilnehmer: Array<{ user_id: string; rolle: 'kunde' | 'kundenbetreuer' | 'gutachter' }> = []

  if (claim.geschaedigter_user_id) teilnehmer.push({ user_id: claim.geschaedigter_user_id, rolle: 'kunde' })
  if (claim.kundenbetreuer_id) teilnehmer.push({ user_id: claim.kundenbetreuer_id, rolle: 'kundenbetreuer' })

  if (claim.sv_id) {
    const { data: sv } = await admin
      .from('sachverstaendige')
      .select('profile_id')
      .eq('id', claim.sv_id)
      .maybeSingle()
    if (sv?.profile_id) {
      teilnehmer.push({ user_id: sv.profile_id, rolle: 'gutachter' })
    }
  }

  if (!teilnehmer.length) return []

  const userIds = teilnehmer.map(t => t.user_id)
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, vorname, nachname, avatar_url')
    .in('id', userIds)

  const profileMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p]))

  return teilnehmer.map(t => ({
    user_id: t.user_id,
    rolle: t.rolle,
    vorname: profileMap[t.user_id]?.vorname ?? null,
    nachname: profileMap[t.user_id]?.nachname ?? null,
    avatar_url: profileMap[t.user_id]?.avatar_url ?? null,
  }))
}
