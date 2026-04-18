'use server'

// AAR-492 (M10): Server-Actions für die Makler-Einstellungen-Seite.
// Jede Action: Zod-Validation → Auth-Check (getCurrentMakler) → Update
// via SSR-Client (RLS erzwingt Makler-Self-Scope). Fehler kommen als
// { success, error } zurück, nie als throw.

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  getCurrentMakler,
  type NotificationPreferences,
} from '@/lib/makler/queries'
import { revalidatePath } from 'next/cache'

export type ActionResult = { success: true } | { success: false; error: string }

// ── Profil ──────────────────────────────────────────────────────────────────

const profilSchema = z.object({
  firma: z.string().trim().min(2, 'Firma ist zu kurz').max(100),
  ansprechpartner_vorname: z.string().trim().min(1).max(50),
  ansprechpartner_nachname: z.string().trim().min(1).max(50),
  ihk_nummer: z.string().trim().max(50).optional().nullable(),
  telefon: z
    .string()
    .trim()
    .regex(/^\+?[0-9 /()\-]{6,20}$/, 'Ungültiges Telefon-Format')
    .optional()
    .nullable()
    .or(z.literal('')),
  adresse_strasse: z.string().trim().max(200).optional().nullable().or(z.literal('')),
  adresse_plz: z
    .string()
    .trim()
    .regex(/^[0-9]{5}$/, 'PLZ muss 5 Ziffern sein')
    .optional()
    .nullable()
    .or(z.literal('')),
  adresse_ort: z.string().trim().max(100).optional().nullable().or(z.literal('')),
})

export async function updateMaklerProfil(
  input: z.infer<typeof profilSchema>,
): Promise<ActionResult> {
  const parsed = profilSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Validierung fehlgeschlagen',
    }
  }
  const makler = await getCurrentMakler()
  if (!makler) return { success: false, error: 'Nicht angemeldet' }

  const supabase = await createClient()
  const update: Record<string, string | null> = {}
  for (const [k, v] of Object.entries(parsed.data)) {
    update[k] = v === '' || v === undefined ? null : (v as string)
  }
  const { error } = await supabase
    .from('makler')
    .update(update)
    .eq('id', makler.id)
  if (error) return { success: false, error: error.message }
  revalidatePath('/makler/einstellungen')
  return { success: true }
}

// ── Bank ────────────────────────────────────────────────────────────────────

const bankSchema = z.object({
  bank_iban: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}[0-9]{2}[A-Z0-9]{4,32}$/, 'Ungültiges IBAN-Format'),
  bank_bic: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/, 'Ungültiges BIC-Format')
    .optional()
    .nullable()
    .or(z.literal('')),
  bank_kontoinhaber: z.string().trim().min(2).max(100),
})

export async function updateMaklerBank(
  input: z.infer<typeof bankSchema>,
): Promise<ActionResult> {
  const parsed = bankSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Validierung fehlgeschlagen',
    }
  }
  const makler = await getCurrentMakler()
  if (!makler) return { success: false, error: 'Nicht angemeldet' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('makler')
    .update({
      bank_iban: parsed.data.bank_iban,
      bank_bic: parsed.data.bank_bic || null,
      bank_kontoinhaber: parsed.data.bank_kontoinhaber,
    })
    .eq('id', makler.id)
  if (error) return { success: false, error: error.message }
  revalidatePath('/makler/einstellungen')
  return { success: true }
}

// ── Passwort ────────────────────────────────────────────────────────────────

const passwortSchema = z
  .object({
    current: z.string().min(1, 'Aktuelles Passwort fehlt'),
    next: z
      .string()
      .min(8, 'Neues Passwort muss mindestens 8 Zeichen haben')
      .regex(/[0-9]/, 'Neues Passwort muss mindestens eine Ziffer enthalten')
      .regex(/[A-Za-z]/, 'Neues Passwort muss mindestens einen Buchstaben enthalten'),
    confirm: z.string(),
  })
  .refine((d) => d.next === d.confirm, {
    message: 'Passwort-Wiederholung stimmt nicht überein',
    path: ['confirm'],
  })

export async function changeMaklerPasswort(
  input: z.infer<typeof passwortSchema>,
): Promise<ActionResult> {
  const parsed = passwortSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Validierung fehlgeschlagen',
    }
  }

  const supabase = await createClient()
  const { data: userRes } = await supabase.auth.getUser()
  const user = userRes?.user
  if (!user?.email) return { success: false, error: 'Nicht angemeldet' }

  // Reauth-Check: signInWithPassword bestätigt aktuelles Passwort
  const reauth = await supabase.auth.signInWithPassword({
    email: user.email,
    password: parsed.data.current,
  })
  if (reauth.error) {
    return { success: false, error: 'Aktuelles Passwort ist falsch' }
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.next,
  })
  if (error) return { success: false, error: error.message }
  return { success: true }
}

// ── Consent-Widerruf ────────────────────────────────────────────────────────

export async function revokeMaklerConsent(
  consentId: string,
): Promise<ActionResult> {
  const parsed = z.string().uuid().safeParse(consentId)
  if (!parsed.success) return { success: false, error: 'Ungültige ID' }

  const makler = await getCurrentMakler()
  if (!makler) return { success: false, error: 'Nicht angemeldet' }

  const supabase = await createClient()
  const { data: userRes } = await supabase.auth.getUser()
  const userId = userRes?.user?.id ?? null

  const { error } = await supabase
    .from('makler_fall_consent')
    .update({
      widerrufen_am: new Date().toISOString(),
      widerrufen_von: userId,
    })
    .eq('id', parsed.data)
    .eq('makler_id', makler.id)
    .is('widerrufen_am', null)
  if (error) return { success: false, error: error.message }

  revalidatePath('/makler/einstellungen')
  revalidatePath('/makler/akten')
  return { success: true }
}

// ── Benachrichtigungs-Präferenzen ──────────────────────────────────────────

const notificationSchema = z.object({
  neuer_lead: z.boolean(),
  kanzlei_uebergabe: z.boolean(),
  provision_freigegeben: z.boolean(),
  monats_abrechnung: z.boolean(),
  woechentlicher_report: z.boolean(),
})

export async function updateMaklerNotificationPrefs(
  prefs: NotificationPreferences,
): Promise<ActionResult> {
  const parsed = notificationSchema.safeParse(prefs)
  if (!parsed.success) {
    return { success: false, error: 'Ungültige Präferenzen' }
  }
  const makler = await getCurrentMakler()
  if (!makler) return { success: false, error: 'Nicht angemeldet' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('makler')
    .update({ notification_preferences: parsed.data })
    .eq('id', makler.id)
  if (error) return { success: false, error: error.message }
  revalidatePath('/makler/einstellungen')
  return { success: true }
}

// ── Account-Löschung-Anfrage (DSGVO) ────────────────────────────────────────
// Das tatsächliche Löschen läuft manuell durch den Admin — hier loggen wir
// nur die Anfrage in einer Task-ähnlichen Tabelle damit der Admin sieht,
// dass etwas zu tun ist. Fallback: mailto:-Link (Client).
// Diese Funktion kann optional getriggert werden; für MVP bleibt es
// beim mailto:-Link im UI.
export async function requestMaklerAccountDeletion(): Promise<ActionResult> {
  const makler = await getCurrentMakler()
  if (!makler) return { success: false, error: 'Nicht angemeldet' }

  const admin = createAdminClient()
  try {
    await admin.from('admin_tasks').insert({
      typ: 'makler_account_deletion',
      titel: `Makler-Account-Löschung angefragt: ${makler.firma}`,
      beschreibung: `makler_id=${makler.id}`,
      status: 'offen',
    })
  } catch {
    // admin_tasks existiert ggf. nicht — Fehler nicht blocken,
    // UI hat weiterhin mailto:-Fallback
  }
  return { success: true }
}
