'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { erzeugeHoler } from '@/lib/anreicherung/netz'
import { holeAdapter } from '@/lib/places'
import { setzePruefumfang, type UmfangErgebnis } from '@/lib/levelup/pruefumfang'
import { starteMessung, holeFortschritt, type StartErgebnis, type FortschrittErgebnis } from '@/lib/levelup/messung'
import { messeCheck } from '@/lib/levelup/messmaschine'
import { baueBefund, type BefundErgebnis } from '@/lib/levelup/befund'
import { messeWeb } from '@/lib/levelup/module/web'
import { messeWett } from '@/lib/levelup/module/wett'
import { ladeCheck } from '@/lib/levelup/check'
import type { Db } from '@/lib/anreicherung/schreiben'

function db(): Db {
  return createAdminClient() as unknown as Db
}

/** F-02 · Prüfumfang setzen. */
export async function umfangSetzen(token: string, module: string[]): Promise<UmfangErgebnis> {
  const ergebnis = await setzePruefumfang(db(), token, module)
  if (ergebnis.ok) revalidatePath(`/check/${token}`)
  return ergebnis
}

/**
 * F-03 · Messung starten.
 *
 * Der Lauf wird angestossen und NICHT abgewartet — die Antwort geht sofort an
 * den Browser, der dann `fortschritt()` pollt. Das funktioniert, weil die App
 * als dauerhafter Prozess laeuft (PM2-Standalone), nicht als Funktion pro
 * Anfrage.
 */
export async function messungStarten(token: string): Promise<StartErgebnis> {
  // Der Firmenname wird EINMAL gelesen und in die Messung gereicht — `wett`
  // findet damit den eigenen Eintrag in der Kartensuche.
  const check = await ladeCheck(db(), token)
  const firmenname = check?.firmenname ?? null

  const ergebnis = await starteMessung(db(), token, {
    jetzt: () => new Date(),
    starte: async (t) => {
      const verbindung = db()
      const auftrag = messeCheck(verbindung, t, {
        hole: erzeugeHoler({ cachen: true }),
        places: holeAdapter(),
        jetzt: () => new Date().toISOString(),
        registry: {
          web: messeWeb,
          // Ohne Firmennamen weist `wett` den Rang als Fehlstelle aus, statt
          // einen falschen zu behaupten (R-B).
          wett: (k) => messeWett({ ...k, firmenname }),
        },
      })
      // Absichtlich ohne await: der Browser soll nicht auf die Messung warten.
      void auftrag.catch((err) => console.error('Messung fehlgeschlagen:', err))
    },
  })

  if (ergebnis.ok) revalidatePath(`/check/${token}`)
  return ergebnis
}

/** F-04 · Fortschritt. Wird alle zwei Sekunden abgefragt, enthaelt keine Befunddaten. */
export async function fortschritt(token: string): Promise<FortschrittErgebnis> {
  return holeFortschritt(db(), token, { jetzt: () => new Date(), starte: async () => {} })
}

/** F-05 · Befund ausliefern — ohne Massnahmen (R-E). */
export async function befundHolen(token: string): Promise<BefundErgebnis> {
  return baueBefund(db(), token)
}

/**
 * Traegt eine Website nach.
 *
 * Der Grund, warum es das gibt: Wer ohne Website startet, verliert die Module,
 * die eine brauchen — aber sein WUNSCH bleibt gespeichert. Sobald die Adresse
 * da ist, bringt ein erneutes `umfangSetzen` die Module zurueck (T-02).
 */
export async function websiteNachtragen(
  token: string,
  website: string,
): Promise<{ ok: boolean; error?: string }> {
  const { deuteUrl } = await import('@/lib/levelup/einstieg')
  const url = deuteUrl(website)
  if (!url) return { ok: false, error: 'Diese Adresse konnten wir nicht lesen.' }

  const verbindung = db()
  const check = await ladeCheck(verbindung, token)
  if (!check) return { ok: false, error: 'Unbekannter Link.' }
  if (check.status !== 'neu') return { ok: false, error: 'Der Prüfumfang steht bereits fest.' }

  const { data, error } = await verbindung
    .from('levelup_checks')
    .update({ website_url: url })
    .eq('token', token)
    .select()

  if (error) return { ok: false, error: 'Die Adresse konnte nicht gespeichert werden.' }
  if (!data || data.length === 0) return { ok: false, error: 'Die Adresse konnte nicht gespeichert werden.' }

  revalidatePath(`/check/${token}`)
  return { ok: true }
}

// ── P4 · Termin, Funnel und Plan ─────────────────────────────────────────────

/** F-07 · Sechs freie Termine. */
export async function slotsHolen(): Promise<{ start: string; label: string }[]> {
  const { freieSlots } = await import('@/lib/levelup/slots')
  return freieSlots(db(), new Date())
}

/**
 * F-06 · Termin wählen — hier entsteht der Lead.
 *
 * Die IP wird nur als Hash weitergereicht; der Wortlaut der Einwilligung liegt
 * in `lib/levelup/termin.ts` und wird dort mitgespeichert.
 */
export async function terminWaehlen(
  token: string,
  slotStart: string,
  telefon: string,
  einwilligung: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const { waehleTermin } = await import('@/lib/levelup/termin')
  const { hashIp } = await import('@/lib/levelup/token')
  const { headers } = await import('next/headers')

  const h = await headers()
  const ip = (h.get('x-forwarded-for') ?? h.get('x-real-ip') ?? '').split(',')[0]?.trim() || 'unbekannt'

  const r = await waehleTermin(db(), {
    token, slotStart, telefon, einwilligung,
    ipHash: await hashIp(ip),
    userAgent: h.get('user-agent') ?? undefined,
  })

  if (r.ok) {
    revalidatePath(`/check/${token}`)
    return { ok: true }
  }

  // Interne Kennungen in Klartext uebersetzen — der Nutzer soll erfahren, was
  // zu tun ist, nicht wie das Feld heisst.
  const texte: Record<string, string> = {
    einwilligung_fehlt: 'Bitte bestätigen Sie die Einwilligung, damit wir Sie anrufen dürfen.',
    telefon_ungueltig: 'Diese Telefonnummer konnten wir nicht lesen. Bitte prüfen Sie die Eingabe.',
    slot_vergangen: 'Dieser Termin liegt bereits in der Vergangenheit. Bitte wählen Sie einen anderen.',
    nicht_fertig: 'Die Messung ist noch nicht abgeschlossen.',
  }
  return { ok: false, error: texte[r.error] ?? 'Der Termin konnte nicht gespeichert werden.' }
}

/** F-08 · Funnel — drei Fragen, überspringbar. */
export async function funnelSpeichern(
  token: string,
  antworten: { jahreErfahrung?: string; kiNutzung?: string; marketingPartner?: string },
): Promise<{ ok: boolean; error?: string }> {
  const { speichereFunnel } = await import('@/lib/levelup/funnel')
  const r = await speichereFunnel(db(), token, antworten)
  if (r.ok) revalidatePath(`/check/${token}`)
  return r.ok ? { ok: true } : { ok: false, error: 'Die Antworten konnten nicht gespeichert werden.' }
}

/**
 * F-09 · Maßnahmen freigeben — der einzige Endpunkt, der sie ausliefert, und
 * nur mit Termin.
 */
export async function planHolen(token: string) {
  const { gibFrei } = await import('@/lib/levelup/freigabe')
  return gibFrei(db(), token)
}
