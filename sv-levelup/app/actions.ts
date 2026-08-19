'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { legeCheckAn } from '@/lib/levelup/einstieg'
import { hashIp } from '@/lib/levelup/token'
import type { Db } from '@/lib/anreicherung/schreiben'

/**
 * Liest die Adresse des Anrufers hinter NGINX.
 *
 * `x-forwarded-for` kann eine Kette sein („client, proxy1, proxy2") — der
 * erste Eintrag ist der Ursprung. Fehlt der Kopf ganz, zaehlen alle Anfragen
 * auf denselben Hash; das ist strenger als noetig, aber nie zu lasch.
 */
async function anruferIp(): Promise<string> {
  const h = await headers()
  const kette = h.get('x-forwarded-for') ?? h.get('x-real-ip') ?? ''
  return kette.split(',')[0]?.trim() || 'unbekannt'
}

export type EinstiegAntwort = { ok: false; error: string }

/**
 * F-01 · Check anlegen und auf den Check-Link weiterleiten.
 *
 * Duenner Wrapper: die Fachlogik steht in `lib/levelup/einstieg.ts` und ist
 * dort ohne Next testbar. Hier passiert nur, was ohne Request nicht geht —
 * Kopfzeilen lesen, Client beschaffen, weiterleiten.
 */
export async function starteCheck(_vorher: unknown, formData: FormData): Promise<EinstiegAntwort> {
  const modus = String(formData.get('modus') ?? '')
  if (modus !== 'aufbau' && modus !== 'bestand') {
    return { ok: false, error: 'Bitte wählen Sie zuerst einen Weg.' }
  }

  const plz = String(formData.get('plz') ?? '').trim()
  const ort = String(formData.get('ort') ?? '').trim()
  if (!plz && !ort) {
    return { ok: false, error: 'Bitte geben Sie Postleitzahl oder Ort an.' }
  }

  const db = createAdminClient() as unknown as Db
  const ergebnis = await legeCheckAn(db, {
    modus,
    websiteUrl: String(formData.get('website') ?? ''),
    plz: plz || undefined,
    ort: ort || undefined,
    ipHash: await hashIp(await anruferIp()),
    userAgent: (await headers()).get('user-agent') ?? undefined,
  })

  if (!ergebnis.ok) {
    // Die internen Kennungen in Klartext uebersetzen — der Nutzer soll
    // erfahren, was zu tun ist, nicht wie das Feld heisst.
    const texte: Record<string, string> = {
      rate_limit: 'Es wurden in der letzten Stunde bereits fünf Checks von diesem Anschluss gestartet. Bitte versuchen Sie es später erneut.',
      standort_unbekannt: 'Diese Postleitzahl bzw. diesen Ort kennen wir nicht. Bitte prüfen Sie die Eingabe.',
    }
    return { ok: false, error: texte[ergebnis.error] ?? 'Der Check konnte nicht angelegt werden.' }
  }

  // ⚠ redirect() wirft eine Steuerungs-Ausnahme und gehoert deshalb NICHT in
  // ein try/catch — sonst wird die Weiterleitung als Fehler behandelt.
  redirect(`/check/${ergebnis.token}`)
}
