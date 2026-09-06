'use server'
// Freund-Anfrage-Lebenszyklus auf netzwerk_verbindungen. RLS-Client (DB erzwingt "nur eigene Kanten")
// + .select()-Row-Check (DSGVO-Storno-Lehre: RLS-Block liefert 0 Rows OHNE Fehler -> still).
// Result-Object, kein throw. Mitteilung/Namens-Lookup best-effort (try/catch).
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { darfAnnehmenOderAblehnen, darfEntfernenOderBlockieren } from './verbindungen-core'
import { notifiziereNetzwerk } from './mitteilung'
import type { VerbindungRow } from './types'

type R = { ok: true } | { ok: false; error: string }

async function meineProfilId(): Promise<string | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user?.id ?? null
}

async function meinAnzeigeName(profilId: string): Promise<string> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('profiles')
    .select('vorname, nachname, firma, anzeigename')
    .eq('id', profilId)
    .maybeSingle()
  return (
    (data?.anzeigename as string | null) ||
    [data?.vorname, data?.nachname].filter(Boolean).join(' ').trim() ||
    (data?.firma as string | null) ||
    'Ein Partner'
  )
}

export async function sendeFreundAnfrage(zielProfilId: string): Promise<R> {
  const me = await meineProfilId()
  if (!me) return { ok: false, error: 'Nicht angemeldet.' }
  if (zielProfilId === me) return { ok: false, error: 'Sie können Sie nicht mit Ihnen selbst verbinden.' }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('netzwerk_verbindungen')
    .insert({ anfrager_id: me, empfaenger_id: zielProfilId, status: 'offen' })
    .select('id')
  if (error) {
    if (error.code === '23505')
      return { ok: false, error: 'Ihr seid bereits verbunden oder eine Anfrage läuft schon.' }
    return { ok: false, error: 'Anfrage konnte nicht gesendet werden.' }
  }
  if (!data || data.length === 0) return { ok: false, error: 'Anfrage konnte nicht gesendet werden.' } // RLS-Block
  try {
    await notifiziereNetzwerk(zielProfilId, { profilId: me, name: await meinAnzeigeName(me) }, 'anfrage')
  } catch (e) {
    console.error('[sendeFreundAnfrage] notify', e)
  }
  revalidatePath('/gutachter/netzwerk')
  revalidatePath('/werkstatt/netzwerk')
  revalidatePath('/flotte/netzwerk')
  return { ok: true }
}

async function ladeRowFuerAktion(verbindungId: string): Promise<VerbindungRow | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('netzwerk_verbindungen')
    .select('anfrager_id, empfaenger_id, status')
    .eq('id', verbindungId)
    .maybeSingle()
  return (data as VerbindungRow | null) ?? null
}

export async function nimmAnfrageAn(verbindungId: string): Promise<R> {
  const me = await meineProfilId()
  if (!me) return { ok: false, error: 'Nicht angemeldet.' }
  const row = await ladeRowFuerAktion(verbindungId)
  if (!row || !darfAnnehmenOderAblehnen(row, me))
    return { ok: false, error: 'Diese Anfrage kann nicht angenommen werden.' }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('netzwerk_verbindungen')
    .update({ status: 'angenommen', beantwortet_am: new Date().toISOString() })
    .eq('id', verbindungId)
    .eq('empfaenger_id', me)
    .eq('status', 'offen')
    .select('id')
  if (error || !data || data.length === 0) return { ok: false, error: 'Annehmen fehlgeschlagen.' }
  try {
    await notifiziereNetzwerk(row.anfrager_id, { profilId: me, name: await meinAnzeigeName(me) }, 'angenommen')
  } catch (e) {
    console.error('[nimmAnfrageAn] notify', e)
  }
  revalidatePath('/gutachter/netzwerk')
  revalidatePath('/werkstatt/netzwerk')
  revalidatePath('/flotte/netzwerk')
  return { ok: true }
}

export async function lehneAnfrageAb(verbindungId: string): Promise<R> {
  const me = await meineProfilId()
  if (!me) return { ok: false, error: 'Nicht angemeldet.' }
  const row = await ladeRowFuerAktion(verbindungId)
  if (!row || !darfAnnehmenOderAblehnen(row, me))
    return { ok: false, error: 'Diese Anfrage kann nicht abgelehnt werden.' }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('netzwerk_verbindungen')
    .update({ status: 'abgelehnt', beantwortet_am: new Date().toISOString() })
    .eq('id', verbindungId)
    .eq('empfaenger_id', me)
    .eq('status', 'offen')
    .select('id')
  if (error || !data || data.length === 0) return { ok: false, error: 'Ablehnen fehlgeschlagen.' }
  revalidatePath('/gutachter/netzwerk')
  revalidatePath('/werkstatt/netzwerk')
  revalidatePath('/flotte/netzwerk')
  return { ok: true }
}

export async function entferneVerbindung(verbindungId: string): Promise<R> {
  const me = await meineProfilId()
  if (!me) return { ok: false, error: 'Nicht angemeldet.' }
  const row = await ladeRowFuerAktion(verbindungId)
  if (!row || !darfEntfernenOderBlockieren(row, me))
    return { ok: false, error: 'Verbindung kann nicht entfernt werden.' }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('netzwerk_verbindungen')
    .delete()
    .eq('id', verbindungId)
    .select('id')
  if (error || !data || data.length === 0) return { ok: false, error: 'Entfernen fehlgeschlagen.' }
  revalidatePath('/gutachter/netzwerk')
  revalidatePath('/werkstatt/netzwerk')
  revalidatePath('/flotte/netzwerk')
  return { ok: true }
}

export async function blockiereVerbindung(verbindungId: string): Promise<R> {
  const me = await meineProfilId()
  if (!me) return { ok: false, error: 'Nicht angemeldet.' }
  const row = await ladeRowFuerAktion(verbindungId)
  if (!row || !darfEntfernenOderBlockieren(row, me))
    return { ok: false, error: 'Verbindung kann nicht blockiert werden.' }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('netzwerk_verbindungen')
    .update({ status: 'blockiert', beantwortet_am: new Date().toISOString() })
    .eq('id', verbindungId)
    .select('id')
  if (error || !data || data.length === 0) return { ok: false, error: 'Blockieren fehlgeschlagen.' }
  revalidatePath('/gutachter/netzwerk')
  revalidatePath('/werkstatt/netzwerk')
  revalidatePath('/flotte/netzwerk')
  return { ok: true }
}
