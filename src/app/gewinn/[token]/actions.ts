'use server'

// Oeffentliche Token-Route: KEIN requireRole. Das Token IST die Berechtigung
// (Muster: src/app/upload/dokumente/[token]). Jede Action loest es deshalb
// selbst auf und prueft den Status, statt einem Client-Parameter zu vertrauen.
//
// Kein Export von Konstanten/Types aus diesem 'use server'-File (AAR-664).

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'

// Nachweise liegen im bestehenden Dokumente-Bucket unter eigenem Praefix.
// Bewusst kein eigener Bucket: der Upload laeuft ausschliesslich serverseitig
// ueber service-role, ein separater Bucket braechte also nur eine weitere
// Policy-Flaeche ohne Sicherheitsgewinn.
const BUCKET = 'fall-dokumente'
const PRAEFIX = 'gewinnspiel-nachweise'

const ERLAUBTE_TYPEN = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
const MAX_BYTES = 10 * 1024 * 1024

async function ladeTeilnahme(token: string) {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('gewinnspiel_teilnahmen')
    .select('id, status, kampagne_id, gewaehlte_praemie_id')
    .eq('nachweis_token', token)
    .maybeSingle()
  return { supabase, teilnahme: data }
}

export async function speichereNachweis(
  token: string,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const { supabase, teilnahme } = await ladeTeilnahme(token)
  if (!teilnahme) return { ok: false, error: 'Dieser Link ist nicht gültig.' }
  if (teilnahme.status !== 'nachweis_offen') {
    return { ok: false, error: 'Dieser Link wurde bereits verwendet.' }
  }

  const datei = formData.get('nachweis')
  if (!(datei instanceof File) || datei.size === 0) {
    return { ok: false, error: 'Bitte wählen Sie eine Datei aus.' }
  }
  if (datei.size > MAX_BYTES) {
    return { ok: false, error: 'Die Datei ist zu groß (maximal 10 MB).' }
  }
  if (!ERLAUBTE_TYPEN.includes(datei.type)) {
    return { ok: false, error: 'Bitte laden Sie ein Foto (JPG, PNG, WEBP) oder ein PDF hoch.' }
  }

  const endung = datei.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin'
  const pfad = `${PRAEFIX}/${teilnahme.id}/nachweis.${endung}`

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(pfad, datei, { upsert: true, contentType: datei.type })

  if (uploadError) {
    console.error('[gewinnspiel] Nachweis-Upload:', uploadError)
    return { ok: false, error: 'Der Upload hat nicht geklappt. Bitte versuchen Sie es erneut.' }
  }

  const { data, error } = await supabase
    .from('gewinnspiel_teilnahmen')
    .update({ nachweis_datei_pfad: pfad, nachweis_hochgeladen_am: new Date().toISOString() })
    .eq('id', teilnahme.id)
    .select('id')

  if (error) return { ok: false, error: error.message }
  if (!data || data.length === 0) return { ok: false, error: 'Teilnahme nicht gefunden.' }

  revalidatePath(`/gewinn/${token}`)
  revalidatePath('/admin/marketing/gewinnspiel')
  return { ok: true }
}

export async function waehlePraemie(
  token: string,
  praemieId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { supabase, teilnahme } = await ladeTeilnahme(token)
  if (!teilnahme) return { ok: false, error: 'Dieser Link ist nicht gültig.' }
  if (teilnahme.status !== 'nachweis_offen') {
    return { ok: false, error: 'Dieser Link wurde bereits verwendet.' }
  }

  // Die Praemie muss zur Kampagne DIESER Teilnahme gehoeren — sonst koennte ein
  // manipulierter Aufruf eine fremde Praemie setzen.
  const { data: praemie } = await supabase
    .from('gewinnspiel_praemien')
    .select('id')
    .eq('id', praemieId)
    .eq('kampagne_id', teilnahme.kampagne_id)
    .eq('aktiv', true)
    .maybeSingle()

  if (!praemie) return { ok: false, error: 'Diese Auswahl ist nicht verfügbar.' }

  const { data, error } = await supabase
    .from('gewinnspiel_teilnahmen')
    .update({ gewaehlte_praemie_id: praemie.id })
    .eq('id', teilnahme.id)
    .select('id')

  if (error) return { ok: false, error: error.message }
  if (!data || data.length === 0) return { ok: false, error: 'Teilnahme nicht gefunden.' }

  revalidatePath(`/gewinn/${token}`)
  return { ok: true }
}
