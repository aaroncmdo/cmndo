'use server'

// P1 (Detail-View-Konsistenz): Server-Actions fuer Versicherer.
//
// Vorher gab es hier GAR KEINE actions.ts — VersicherungenClient schrieb direkt
// aus dem Browser in die DB (`supabase.from('versicherungen').update(form)` mit
// dem @/lib/supabase/client). Das umging das verbindliche Server-Action-Pattern
// ({ ok, error }), hatte kein revalidatePath (nur router.refresh) und schickte
// beim Update die GANZE Zeile inkl. `id` und `ist_aktiv` als Payload.
// Hier jetzt: Result-Object, Admin-Guard, explizite Feld-Whitelist.

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type VersicherungInput = {
  name: string
  schaden_telefon: string | null
  schaden_email: string | null
  hotline_telefon: string | null
  webseite: string | null
  adresse: string | null
  plz: string | null
  stadt: string | null
  bafin_nummer: string | null
}

type Result = { ok: boolean; error?: string }

async function requireAdmin() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { supabase, error: 'Bitte zuerst anmelden.' }
  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()
  if (profile?.rolle !== 'admin') return { supabase, error: 'Nur Admins duerfen Versicherer pflegen.' }
  return { supabase, error: null as string | null }
}

/**
 * Die Liste haengt an ZWEI Routen: /admin/versicherungen und — via Re-Export —
 * /admin/partner/versicherer. Beide muessen revalidiert werden, sonst zeigt eine
 * davon nach dem Speichern noch den alten Stand.
 */
function revalidateVersicherungen(id?: string) {
  revalidatePath('/admin/versicherungen')
  revalidatePath('/admin/partner/versicherer')
  if (id) revalidatePath(`/admin/versicherungen/${id}`)
}

/** Nur die 9 pflegbaren Felder — nie die ganze Row (kein id/ist_aktiv im Payload). */
function toPatch(input: VersicherungInput) {
  return {
    name: input.name.trim(),
    schaden_telefon: input.schaden_telefon,
    schaden_email: input.schaden_email,
    hotline_telefon: input.hotline_telefon,
    webseite: input.webseite,
    adresse: input.adresse,
    plz: input.plz,
    stadt: input.stadt,
    bafin_nummer: input.bafin_nummer,
  }
}

export async function updateVersicherung(id: string, input: VersicherungInput): Promise<Result> {
  const { supabase, error: guard } = await requireAdmin()
  if (guard) return { ok: false, error: guard }
  if (!input.name?.trim()) return { ok: false, error: 'Name ist ein Pflichtfeld.' }

  const { error } = await supabase.from('versicherungen').update(toPatch(input)).eq('id', id)
  if (error) return { ok: false, error: error.message }

  revalidateVersicherungen(id)
  return { ok: true }
}

export async function createVersicherung(input: VersicherungInput): Promise<Result> {
  const { supabase, error: guard } = await requireAdmin()
  if (guard) return { ok: false, error: guard }
  if (!input.name?.trim()) return { ok: false, error: 'Name ist ein Pflichtfeld.' }

  const { error } = await supabase
    .from('versicherungen')
    .insert({ ...toPatch(input), ist_aktiv: true })
  if (error) return { ok: false, error: error.message }

  revalidateVersicherungen()
  return { ok: true }
}

export async function setVersicherungAktiv(id: string, istAktiv: boolean): Promise<Result> {
  const { supabase, error: guard } = await requireAdmin()
  if (guard) return { ok: false, error: guard }

  const { error } = await supabase.from('versicherungen').update({ ist_aktiv: istAktiv }).eq('id', id)
  if (error) return { ok: false, error: error.message }

  revalidateVersicherungen(id)
  return { ok: true }
}
