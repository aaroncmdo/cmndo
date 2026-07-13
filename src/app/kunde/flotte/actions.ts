'use server'

// Sub-Projekt 2 (Kunde-Portal 1+): Firmen-Konto + Flotte — Server-Actions.
// Admin-Client (personen/firmen deny-all fuer Kunden). Reuse ensureFirma /
// ensurePersonForData / createVehicleStub. Result-Object-Pattern.

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePortalAccess } from '@/lib/auth/portal-guard'
import { ensureFirma } from '@/lib/firmen/ensure-firma'
import { ensurePersonForData } from '@/lib/personen/ensure-person'
import { getKundeFirma, type FirmaForm, type FahrzeugForm } from '@/lib/kunde/firma-flotte'
import { addFahrzeugToFlotte, removeFahrzeugFromFlotte } from '@/lib/flotte/mutate-flotte'

/** Firma anlegen/aktualisieren + mit dem Konto verknuepfen (personen.firma_id). */
export async function speichereFirma(
  form: FirmaForm,
): Promise<{ ok: true; firmaId: string } | { ok: false; error: string }> {
  const { user } = await requirePortalAccess(['kunde'])
  const name = (form.name ?? '').trim()
  if (!name) return { ok: false, error: 'Bitte einen Firmennamen angeben.' }
  const db = createAdminClient()
  const res = await ensureFirma({
    db,
    snapshot: {
      name,
      ust_id: form.ustId?.trim() || null,
      rechtsform: form.rechtsform?.trim() || null,
      adresse_strasse: form.strasse?.trim() || null,
      adresse_plz: form.plz?.trim() || null,
      adresse_ort: form.ort?.trim() || null,
      quelle: 'kunde_portal',
    },
  })
  if (!res.ok) return { ok: false, error: res.error }
  // Person sicherstellen (1 pro user_id) + firma_id/ist_gewerbe setzen.
  await ensurePersonForData({ db, userId: user.id, snapshot: { ist_gewerbe: true, firma: name } })
  const { error } = await db
    .from('personen')
    .update({ firma_id: res.firmaId, ist_gewerbe: true })
    .eq('user_id', user.id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/kunde/flotte')
  return { ok: true, firmaId: res.firmaId }
}

/** Fahrzeug zur Firmen-Flotte hinzufuegen (Stub-Fahrzeug + N:M-Zuordnung). */
export async function fuegeFahrzeugHinzu(form: FahrzeugForm): Promise<{ ok: boolean; error?: string }> {
  const { user } = await requirePortalAccess(['kunde'])
  const kennzeichen = (form.kennzeichen ?? '').trim()
  if (!kennzeichen) return { ok: false, error: 'Bitte ein Kennzeichen angeben.' }
  const db = createAdminClient()
  const firma = await getKundeFirma(db, user.id)
  if (!firma) return { ok: false, error: 'Kein Firmen-Konto — bitte zuerst die Firma anlegen.' }
  const res = await addFahrzeugToFlotte(db, firma.id, form, user.id)
  if (res.ok) revalidatePath('/kunde/flotte')
  return res
}

/** Fahrzeug aus der Flotte entfernen (nur Eintraege der eigenen Firma). */
export async function entferneFahrzeug(flottenId: string): Promise<{ ok: boolean; error?: string }> {
  const { user } = await requirePortalAccess(['kunde'])
  const db = createAdminClient()
  const firma = await getKundeFirma(db, user.id)
  if (!firma) return { ok: false, error: 'Kein Firmen-Konto.' }
  const res = await removeFahrzeugFromFlotte(db, flottenId, firma.id)
  if (res.ok) revalidatePath('/kunde/flotte')
  return res
}
