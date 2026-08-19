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
          // `wett` braucht den Firmennamen, um den eigenen Eintrag zu finden.
          // `levelup_checks` fuehrt ihn heute nicht — beim oeffentlichen Check
          // bleibt er leer, und das Modul weist die Luecke als Fehlstelle aus,
          // statt einen falschen Rang zu behaupten (R-B).
          wett: (k) => messeWett({ ...k, firmenname: null }),
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
