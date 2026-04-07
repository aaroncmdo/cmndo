import { createAdminClient } from '@/lib/supabase/admin'

/**
 * KFZ-129: Erstellt oder holt die Chat-Gruppe fuer einen Fall.
 * Gibt die gruppe_id zurueck.
 */
export async function ensureChatGruppe(fallId: string): Promise<string> {
  const admin = createAdminClient()

  // Pruefen ob Gruppe existiert
  const { data: existing } = await admin
    .from('chat_gruppen')
    .select('id')
    .eq('fall_id', fallId)
    .maybeSingle()

  if (existing) return existing.id

  // Neue Gruppe erstellen
  const { data: created, error } = await admin
    .from('chat_gruppen')
    .insert({ fall_id: fallId })
    .select('id')
    .single()

  if (error || !created) {
    console.error('[chatGruppe] Fehler beim Erstellen:', error?.message)
    throw new Error('Chat-Gruppe konnte nicht erstellt werden')
  }

  return created.id
}

/**
 * Fuegt einen Teilnehmer zur Chat-Gruppe hinzu (idempotent).
 */
export async function addChatTeilnehmer(
  gruppeId: string,
  userId: string,
  rolle: 'kunde' | 'kundenbetreuer' | 'gutachter' | 'admin',
): Promise<void> {
  const admin = createAdminClient()

  const { error } = await admin
    .from('chat_teilnehmer')
    .upsert(
      { gruppe_id: gruppeId, user_id: userId, rolle, entfernt_am: null },
      { onConflict: 'gruppe_id,user_id' },
    )

  if (error) {
    console.error('[chatGruppe] Teilnehmer hinzufuegen fehlgeschlagen:', error.message)
  }
}

/**
 * Synchronisiert alle Teilnehmer eines Falls (Kunde, KB, SV) in die Gruppe.
 * Erstellt die Gruppe falls noetig.
 */
export async function syncChatTeilnehmer(fallId: string): Promise<string> {
  const admin = createAdminClient()
  const gruppeId = await ensureChatGruppe(fallId)

  const { data: fall } = await admin
    .from('faelle')
    .select('kunde_id, kundenbetreuer_id, sv_id')
    .eq('id', fallId)
    .single()

  if (!fall) return gruppeId

  const tasks: Promise<void>[] = []

  if (fall.kunde_id) {
    tasks.push(addChatTeilnehmer(gruppeId, fall.kunde_id, 'kunde'))
  }

  if (fall.kundenbetreuer_id) {
    tasks.push(addChatTeilnehmer(gruppeId, fall.kundenbetreuer_id, 'kundenbetreuer'))
  }

  if (fall.sv_id) {
    // SV user_id ueber sachverstaendige.profile_id holen
    const { data: sv } = await admin
      .from('sachverstaendige')
      .select('profile_id')
      .eq('id', fall.sv_id)
      .single()

    if (sv?.profile_id) {
      tasks.push(addChatTeilnehmer(gruppeId, sv.profile_id, 'gutachter'))
    }
  }

  await Promise.all(tasks)
  return gruppeId
}

/**
 * Erstellt eine System-Nachricht in der Gruppe.
 */
export async function sendSystemNachricht(fallId: string, nachricht: string): Promise<void> {
  const admin = createAdminClient()

  // Gruppe holen/erstellen
  const gruppeId = await ensureChatGruppe(fallId)

  const { error } = await admin.from('nachrichten').insert({
    fall_id: fallId,
    gruppe_id: gruppeId,
    kanal: 'gruppe',
    sender_id: null,
    sender_rolle: 'system',
    nachricht,
    hat_anhang: false,
  })

  if (error) {
    console.error('[chatGruppe] System-Nachricht fehlgeschlagen:', error.message)
  }
}

/**
 * Holt alle Teilnehmer einer Gruppe mit Profil-Daten.
 */
export async function getChatTeilnehmer(fallId: string) {
  const admin = createAdminClient()

  const { data: gruppe } = await admin
    .from('chat_gruppen')
    .select('id')
    .eq('fall_id', fallId)
    .maybeSingle()

  if (!gruppe) return []

  const { data: teilnehmer } = await admin
    .from('chat_teilnehmer')
    .select('user_id, rolle, hinzugefuegt_am')
    .eq('gruppe_id', gruppe.id)
    .is('entfernt_am', null)

  if (!teilnehmer?.length) return []

  // Profile-Daten laden
  const userIds = teilnehmer.map(t => t.user_id)
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, vorname, nachname, rolle, avatar_url')
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
