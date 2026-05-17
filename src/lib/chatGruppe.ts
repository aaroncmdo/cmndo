import { createAdminClient } from '@/lib/supabase/admin'

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
export async function sendSystemNachricht(fallId: string, nachricht: string): Promise<void> {
  const admin = createAdminClient()

  const { error } = await admin.from('nachrichten').insert({
    fall_id: fallId,
    kanal: 'gruppenchat',
    sender_id: null,
    sender_rolle: 'system',
    nachricht,
    hat_anhang: false,
    is_system: true,
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

  // CMM-44 SP-A: kundenbetreuer_id liegt auf claims (SSoT) — via Nested-Embed lesen.
  const { data: fall } = await admin
    .from('faelle')
    .select('kunde_id, sv_id, claims:claim_id(kundenbetreuer_id)')
    .eq('id', fallId)
    .maybeSingle()

  if (!fall) return []

  const fallClaim = Array.isArray(fall.claims) ? fall.claims[0] : fall.claims
  const teilnehmer: Array<{ user_id: string; rolle: 'kunde' | 'kundenbetreuer' | 'gutachter' }> = []

  if (fall.kunde_id) teilnehmer.push({ user_id: fall.kunde_id, rolle: 'kunde' })
  if (fallClaim?.kundenbetreuer_id) teilnehmer.push({ user_id: fallClaim.kundenbetreuer_id, rolle: 'kundenbetreuer' })

  if (fall.sv_id) {
    const { data: sv } = await admin
      .from('sachverstaendige')
      .select('profile_id')
      .eq('id', fall.sv_id)
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
