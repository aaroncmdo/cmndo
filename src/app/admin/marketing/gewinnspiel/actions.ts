'use server'

// Gewinnspiel-Verwaltung. Muster 1:1 aus admin/marketing/lokal-content/actions.ts:
//   requireRole(['admin']) -> .success pruefen (wirft NICHT)
//   createAdminClient() (service-role) — die drei Tabellen haben RLS an und
//   KEINE Policies, kommen also nur ueber service-role rein
//   Ergebnis { ok, error? }, revalidatePath nach jeder Mutation
//
// Kein Export von Konstanten/Types aus diesem 'use server'-File (AAR-664):
// das Client-Bundle macht undefined daraus.

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth/guards'
import { createAdminClient } from '@/lib/supabase/admin'
import { fuehreZiehungDurch } from '@/lib/gewinnspiel/ziehung'
import { sendeWelcomeFuerOffeneTeilnahmen } from '@/lib/gewinnspiel/welcome-nachricht'

const ADMIN_PFAD = '/admin/marketing/gewinnspiel'

export async function speichereKampagne(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireRole(['admin'])
  if (!auth.success) return { ok: false, error: 'Keine Berechtigung.' }

  const id = (formData.get('id') as string) || null
  const name = String(formData.get('name') ?? '').trim()
  const startAm = String(formData.get('start_am') ?? '')

  if (!name) return { ok: false, error: 'Bitte einen Namen angeben.' }
  if (!startAm) return { ok: false, error: 'Bitte ein Startdatum angeben.' }

  const werte = {
    name,
    start_am: startAm,
    ende_am: (formData.get('ende_am') as string) || null,
    preise_pro_tag: Number(formData.get('preise_pro_tag') ?? 3),
    preis_betrag_eur: Number(formData.get('preis_betrag_eur') ?? 50),
    topbar_text: (formData.get('topbar_text') as string) || null,
    topbar_cta_text: (formData.get('topbar_cta_text') as string) || null,
    topbar_aktiv: formData.get('topbar_aktiv') === 'on',
  }

  const supabase = createAdminClient()
  const { data, error } = id
    ? await supabase.from('gewinnspiel_kampagnen').update(werte).eq('id', id).select('id')
    : await supabase.from('gewinnspiel_kampagnen').insert(werte).select('id')

  if (error) return { ok: false, error: error.message }
  if (!data || data.length === 0) return { ok: false, error: 'Kampagne nicht gefunden.' }

  revalidatePath(ADMIN_PFAD)
  return { ok: true }
}

export async function setzeKampagneAktiv(
  id: string,
  aktiv: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireRole(['admin'])
  if (!auth.success) return { ok: false, error: 'Keine Berechtigung.' }

  const supabase = createAdminClient()

  // Der partielle Unique-Index laesst nur EINE aktive Kampagne zu -> vorher alle
  // anderen deaktivieren, sonst schlaegt das Update mit 23505 fehl.
  if (aktiv) {
    const { error: deaktivError } = await supabase
      .from('gewinnspiel_kampagnen')
      .update({ aktiv: false })
      .eq('aktiv', true)
    if (deaktivError) return { ok: false, error: deaktivError.message }
  }

  const { data, error } = await supabase
    .from('gewinnspiel_kampagnen')
    .update({ aktiv })
    .eq('id', id)
    .select('id')

  if (error) return { ok: false, error: error.message }
  if (!data || data.length === 0) return { ok: false, error: 'Kampagne nicht gefunden.' }

  revalidatePath(ADMIN_PFAD)
  return { ok: true }
}

export async function speicherePraemie(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireRole(['admin'])
  if (!auth.success) return { ok: false, error: 'Keine Berechtigung.' }

  const id = (formData.get('id') as string) || null
  const name = String(formData.get('name') ?? '').trim()
  const kampagneId = String(formData.get('kampagne_id') ?? '')

  if (!name) return { ok: false, error: 'Bitte einen Namen angeben.' }
  if (!kampagneId) return { ok: false, error: 'Keine Kampagne zugeordnet.' }

  const werte = {
    kampagne_id: kampagneId,
    name,
    beschreibung: (formData.get('beschreibung') as string) || null,
    bild_pfad: (formData.get('bild_pfad') as string) || null,
    betrag_eur: Number(formData.get('betrag_eur') ?? 50),
    sortierung: Number(formData.get('sortierung') ?? 0),
    aktiv: formData.get('aktiv') !== 'off',
  }

  const supabase = createAdminClient()
  const { data, error } = id
    ? await supabase.from('gewinnspiel_praemien').update(werte).eq('id', id).select('id')
    : await supabase.from('gewinnspiel_praemien').insert(werte).select('id')

  if (error) return { ok: false, error: error.message }
  if (!data || data.length === 0) return { ok: false, error: 'Prämie nicht gefunden.' }

  revalidatePath(ADMIN_PFAD)
  return { ok: true }
}

export async function loeschePraemie(id: string): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireRole(['admin'])
  if (!auth.success) return { ok: false, error: 'Keine Berechtigung.' }

  const supabase = createAdminClient()
  const { error } = await supabase.from('gewinnspiel_praemien').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }

  revalidatePath(ADMIN_PFAD)
  return { ok: true }
}

export async function zieheHeute(): Promise<{
  ok: boolean
  gezogen?: number
  lostopfGroesse?: number
  error?: string
}> {
  const auth = await requireRole(['admin'])
  if (!auth.success) return { ok: false, error: 'Keine Berechtigung.' }

  const res = await fuehreZiehungDurch(auth.user.id)
  revalidatePath(ADMIN_PFAD)
  if (!res.ok) return { ok: false, error: res.error }
  return { ok: true, gezogen: res.gezogen, lostopfGroesse: res.lostopfGroesse }
}

export async function sendeWelcomes(): Promise<{
  ok: boolean
  gesendet?: number
  fehlgeschlagen?: number
  error?: string
}> {
  const auth = await requireRole(['admin'])
  if (!auth.success) return { ok: false, error: 'Keine Berechtigung.' }

  const res = await sendeWelcomeFuerOffeneTeilnahmen()
  revalidatePath(ADMIN_PFAD)
  if (!res.ok) return { ok: false, error: res.error }
  return { ok: true, gesendet: res.gesendet, fehlgeschlagen: res.fehlgeschlagen }
}

export async function bestaetigeNachweis(
  teilnahmeId: string,
  gutscheinCode: string,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireRole(['admin'])
  if (!auth.success) return { ok: false, error: 'Keine Berechtigung.' }
  if (!gutscheinCode.trim()) return { ok: false, error: 'Bitte einen Gutschein-Code eintragen.' }

  const jetzt = new Date().toISOString()
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('gewinnspiel_teilnahmen')
    .update({
      status: 'bestaetigt',
      nachweis_geprueft_am: jetzt,
      nachweis_geprueft_von: auth.user.id,
      gutschein_code: gutscheinCode.trim(),
      gutschein_versendet_am: jetzt,
    })
    .eq('id', teilnahmeId)
    // Nur aus der Pruef-Queue heraus bestaetigbar — schuetzt gegen doppelte
    // Gutschein-Vergabe bei zweifachem Klick.
    .eq('status', 'nachweis_offen')
    .select('id')

  if (error) return { ok: false, error: error.message }
  if (!data || data.length === 0) {
    return { ok: false, error: 'Teilnahme nicht gefunden oder bereits bearbeitet.' }
  }

  revalidatePath(ADMIN_PFAD)
  return { ok: true }
}

export async function lehneNachweisAb(
  teilnahmeId: string,
  grund: string,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireRole(['admin'])
  if (!auth.success) return { ok: false, error: 'Keine Berechtigung.' }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('gewinnspiel_teilnahmen')
    .update({
      status: 'abgelehnt',
      nachweis_geprueft_am: new Date().toISOString(),
      nachweis_geprueft_von: auth.user.id,
      ablehnung_grund: grund.trim() || null,
    })
    .eq('id', teilnahmeId)
    .eq('status', 'nachweis_offen')
    .select('id')

  if (error) return { ok: false, error: error.message }
  if (!data || data.length === 0) {
    return { ok: false, error: 'Teilnahme nicht gefunden oder bereits bearbeitet.' }
  }

  revalidatePath(ADMIN_PFAD)
  return { ok: true }
}
