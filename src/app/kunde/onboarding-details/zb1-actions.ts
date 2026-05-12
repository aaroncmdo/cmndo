'use server'

// AAR-zb1-wizard: Server-Actions für das Zb1UploadField im Wizard.
//
// confirmZb1Korrekturen — wenn der Kunde im Preview Werte editiert hat,
//   schreibt diese Action die korrigierten Werte als Force-Update auf
//   leads (H6-Regel des OCR-Endpoints wird hier bewusst umgangen).
//
// clearZb1Felder — wird vor "Neu fotografieren" gerufen, damit die
//   H6-Regel im OCR-Endpoint die neuen Werte tatsächlich schreiben kann
//   (sie überschreibt nur null/leere Felder).

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type Zb1Korrekturen = {
  kennzeichen?: string | null
  fahrzeug_hersteller?: string | null
  fahrzeug_modell?: string | null
  // halter_name = "Vorname Nachname" — wird beim Schreiben gesplittet
  halter_name?: string | null
}

export type Zb1ActionResult = { ok: true } | { ok: false; error: string }

export async function confirmZb1Korrekturen(
  fallId: string,
  corrections: Zb1Korrekturen,
): Promise<Zb1ActionResult> {
  if (!fallId) return { ok: false, error: 'fallId fehlt' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nicht angemeldet' }

  const admin = createAdminClient()
  const leadId = await resolveLeadIdForKunde(admin, fallId, user.id, user.email)
  if (!leadId) return { ok: false, error: 'Kein Zugriff auf diesen Fall' }

  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }
  if (corrections.kennzeichen !== undefined) update.kennzeichen = corrections.kennzeichen
  if (corrections.fahrzeug_hersteller !== undefined) update.fahrzeug_hersteller = corrections.fahrzeug_hersteller
  if (corrections.fahrzeug_modell !== undefined) update.fahrzeug_modell = corrections.fahrzeug_modell
  if (corrections.halter_name !== undefined) {
    const split = splitHalterName(corrections.halter_name)
    update.halter_vorname = split.vorname
    update.halter_nachname = split.nachname
  }

  if (Object.keys(update).length === 1) {
    // Nur updated_at — keine Korrekturen vorhanden, früher Exit
    return { ok: true }
  }

  const { error } = await admin.from('leads').update(update).eq('id', leadId)
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/kunde/onboarding-details`)
  revalidatePath(`/kunde/faelle/${fallId}`)
  revalidatePath(`/dispatch/leads/${leadId}`)
  return { ok: true }
}

export async function clearZb1Felder(fallId: string): Promise<Zb1ActionResult> {
  if (!fallId) return { ok: false, error: 'fallId fehlt' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nicht angemeldet' }

  const admin = createAdminClient()
  const leadId = await resolveLeadIdForKunde(admin, fallId, user.id, user.email)
  if (!leadId) return { ok: false, error: 'Kein Zugriff auf diesen Fall' }

  const { error } = await admin.from('leads').update({
    kennzeichen: null,
    fin: null,
    fahrzeug_hersteller: null,
    fahrzeug_modell: null,
    fahrzeug_baujahr: null,
    erstzulassung: null,
    hsn: null,
    tsn: null,
    halter_vorname: null,
    halter_nachname: null,
    halter_strasse: null,
    halter_plz: null,
    halter_stadt: null,
    zb1_status: null,
    updated_at: new Date().toISOString(),
  }).eq('id', leadId)

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// ─── Helpers ────────────────────────────────────────────────────────

type AdminDb = ReturnType<typeof createAdminClient>

async function resolveLeadIdForKunde(
  admin: AdminDb,
  fallId: string,
  userId: string,
  userEmail: string | undefined,
): Promise<string | null> {
  const { data: fall } = await admin
    .from('faelle')
    .select('id, lead_id, kunde_id')
    .eq('id', fallId)
    .maybeSingle()
  if (!fall) return null
  const leadId = (fall as { lead_id?: string | null }).lead_id ?? null
  if (!leadId) return null

  // Primär: kunde_id-Match auf faelle (uuid → auth.users)
  if ((fall as { kunde_id?: string | null }).kunde_id === userId) {
    return leadId
  }

  // Fallback: Email-Match auf leads (für Pre-Auth-Konvertierungen, wenn
  // kunde_id noch nicht gesetzt wurde aber der eingeloggte User dieselbe
  // Email hat wie der Lead).
  if (userEmail) {
    const { data: lead } = await admin
      .from('leads')
      .select('id, email')
      .eq('id', leadId)
      .maybeSingle()
    if (lead && (lead as { email?: string | null }).email?.toLowerCase() === userEmail.toLowerCase()) {
      return leadId
    }
  }

  return null
}

function splitHalterName(name: string | null | undefined): { vorname: string | null; nachname: string | null } {
  if (!name) return { vorname: null, nachname: null }
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { vorname: null, nachname: null }
  if (parts.length === 1) return { vorname: null, nachname: parts[0] }
  return { vorname: parts[0], nachname: parts.slice(1).join(' ') }
}
