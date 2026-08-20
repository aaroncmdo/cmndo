'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { pruefeStaff, type StaffDb } from '@/lib/levelup/staff'

export type AnmeldeAntwort =
  | { ok: false; error: string }
  | { ok: false; mfaNoetig: true; error?: undefined }

/**
 * Anmeldung fuer die Vertriebsansicht.
 *
 * Dieselben Konten wie im Portal — sv-levelup fuehrt kein eigenes
 * Nutzerverzeichnis. Nur die Sitzung ist getrennt, weil die Cookies der
 * Haupt-App nicht subdomain-uebergreifend gelten (siehe lib/supabase/server.ts).
 */
export async function anmelden(_vorher: unknown, formData: FormData): Promise<AnmeldeAntwort> {
  const email = String(formData.get('email') ?? '').trim()
  const passwort = String(formData.get('passwort') ?? '')
  const code = String(formData.get('code') ?? '').trim()

  if (!email || !passwort) return { ok: false, error: 'Bitte E-Mail und Passwort angeben.' }

  const db = await createClient()

  const { error } = await db.auth.signInWithPassword({ email, password: passwort })
  if (error) {
    // Bewusst ununterscheidbar: welcher der beiden Werte falsch war, verraet
    // sonst, ob es die Adresse ueberhaupt gibt.
    return { ok: false, error: 'E-Mail oder Passwort stimmen nicht.' }
  }

  // ⚠ OHNE DIESE PRUEFUNG umgeht die Anmeldung die Zwei-Faktor-Sicherung
  // STILL, sobald ein Mitarbeiter einen Faktor aktiviert. Gemessen am 20.08.:
  // 12 Staff-Konten, eines mit verifiziertem Faktor. Dass es heute fast
  // niemanden betrifft, ist ein Grund FUER die Pruefung — die Luecke entstuende
  // sonst genau dann, wenn jemand seine Sicherheit erhoeht.
  const { data: stufe } = await db.auth.mfa.getAuthenticatorAssuranceLevel()
  if (stufe?.nextLevel === 'aal2' && stufe.currentLevel !== 'aal2') {
    if (!code) return { ok: false, mfaNoetig: true }

    const { data: faktoren } = await db.auth.mfa.listFactors()
    const faktor = faktoren?.totp?.[0]
    if (!faktor) {
      return { ok: false, error: 'Für dieses Konto ist ein zweiter Faktor hinterlegt, der sich nicht laden lässt.' }
    }

    const { error: mfaFehler } = await db.auth.mfa.challengeAndVerify({
      factorId: faktor.id,
      code,
    })
    if (mfaFehler) return { ok: false, mfaNoetig: true, error: undefined }
  }

  // Angemeldet — aber ist es auch ein Mitarbeiter? Sonst hat sich gerade ein
  // Sachverstaendiger mit seinem Portal-Konto angemeldet.
  const staff = await pruefeStaff(db as unknown as StaffDb)
  if (!staff.ok) {
    await db.auth.signOut()
    return { ok: false, error: 'Dieser Zugang ist Mitarbeitern vorbehalten.' }
  }

  // ⚠ redirect() wirft eine Steuerungs-Ausnahme — nie in try/catch.
  redirect('/auswertung')
}

export async function abmelden(): Promise<void> {
  const db = await createClient()
  await db.auth.signOut()
  redirect('/anmelden')
}
