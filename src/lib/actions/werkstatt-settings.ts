'use server'

// Einstellungen-Actions fuer die Werkstatt-Partner-Seite.
// Jede Action: Zod-Validation -> Auth-Check (auth.getUser) -> Update
// via SSR-Client (RLS erzwingt Self-Scope ueber user_id). Fehler kommen als
// { ok, error } zurueck, nie als throw.

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { GEWERKE } from '@/lib/werkstatt/bedarf/types'

export type WerkstattActionResult = { ok: true } | { ok: false; error: string }

// ── Profil ──────────────────────────────────────────────────────────────────

const profilSchema = z.object({
  name: z.string().trim().min(2, 'Name ist zu kurz').max(100),
  ansprechpartner_name: z.string().trim().min(1, 'Ansprechpartner fehlt').max(100),
  adresse_strasse: z
    .string()
    .trim()
    .max(200)
    .optional()
    .nullable()
    .or(z.literal('')),
  adresse_plz: z
    .string()
    .trim()
    .regex(/^[0-9]{5}$/, 'PLZ muss 5 Ziffern sein')
    .optional()
    .nullable()
    .or(z.literal('')),
  adresse_ort: z.string().trim().max(100).optional().nullable().or(z.literal('')),
  telefon: z
    .string()
    .trim()
    .regex(/^\+?[0-9 /()\-]{6,20}$/, 'Ungültiges Telefon-Format')
    .optional()
    .nullable()
    .or(z.literal('')),
  email: z.string().trim().email('Ungültige E-Mail').max(200).optional().nullable().or(z.literal('')),
  website: z
    .string()
    .trim()
    .url('Ungültige Website-URL (inkl. https://)')
    .max(200)
    .optional()
    .nullable()
    .or(z.literal('')),
  ust_id: z.string().trim().max(30).optional().nullable().or(z.literal('')),
  ist_kleinunternehmer: z.boolean(),
})

export async function updateWerkstattProfil(
  input: z.infer<typeof profilSchema>,
): Promise<WerkstattActionResult> {
  const parsed = profilSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Validierung fehlgeschlagen',
    }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nicht angemeldet' }

  const update: Record<string, string | boolean | null> = {}
  for (const [k, v] of Object.entries(parsed.data)) {
    if (k === 'ist_kleinunternehmer') {
      update[k] = v as boolean
    } else {
      update[k] = v === '' || v === undefined ? null : (v as string)
    }
  }

  const { error } = await supabase
    .from('werkstaetten')
    .update(update)
    .eq('user_id', user.id)

  if (error) return { ok: false, error: error.message }
  revalidatePath('/werkstatt/einstellungen')
  return { ok: true }
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
  bank_kontoinhaber: z.string().trim().min(2, 'Kontoinhaber fehlt').max(100),
})

export async function updateWerkstattBank(
  input: z.infer<typeof bankSchema>,
): Promise<WerkstattActionResult> {
  const parsed = bankSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Validierung fehlgeschlagen',
    }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nicht angemeldet' }

  const { error } = await supabase
    .from('werkstaetten')
    .update({
      bank_iban: parsed.data.bank_iban,
      bank_bic: parsed.data.bank_bic || null,
      bank_kontoinhaber: parsed.data.bank_kontoinhaber,
    })
    .eq('user_id', user.id)

  if (error) return { ok: false, error: error.message }
  revalidatePath('/werkstatt/einstellungen')
  return { ok: true }
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

export async function changeWerkstattPasswort(
  input: z.infer<typeof passwortSchema>,
): Promise<WerkstattActionResult> {
  const parsed = passwortSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Validierung fehlgeschlagen',
    }
  }

  const supabase = await createClient()
  const { data: userRes } = await supabase.auth.getUser()
  const user = userRes?.user
  if (!user?.email) return { ok: false, error: 'Nicht angemeldet' }

  // Reauth-Check: signInWithPassword bestaetigt aktuelles Passwort
  const reauth = await supabase.auth.signInWithPassword({
    email: user.email,
    password: parsed.data.current,
  })
  if (reauth.error) {
    return { ok: false, error: 'Aktuelles Passwort ist falsch' }
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.next,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// ── Faehigkeiten ────────────────────────────────────────────────────────────

/**
 * Self-Service: Werkstatt pflegt eigene Faehigkeiten.
 * user_id-scoped (kein IDOR) — Admin-Client fuer den Update,
 * SSR-Client fuer Auth-Check.
 */
export async function setMeineFaehigkeiten(
  faehigkeiten: string[],
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nicht angemeldet.' }

  const clean = (faehigkeiten ?? []).filter((f) => (GEWERKE as readonly string[]).includes(f))

  const admin = createAdminClient()
  const { error } = await admin.from('werkstaetten').update({ faehigkeiten: clean }).eq('user_id', user.id)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/werkstatt/einstellungen')
  return { ok: true }
}
