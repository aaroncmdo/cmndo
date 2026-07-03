'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

// AAR-SV-Verfuegbarkeit: Server-Action fuer den Verfuegbarkeits-Editor des
// SV-Portals. Pflegt Arbeitszeiten (pro Wochentag), geschlossene Tage und
// einen Urlaubszeitraum — die Slot-Engine (slots.ts / matching.ts) konsumiert
// GENAU diese drei Spalten (arbeitszeiten jsonb, blockierte_wochentage int[],
// urlaub_von/urlaub_bis date), daher wirkt das Speichern sofort.
//
// Sicherheits-Regel wie updateOwnProfile: Auth via getUser(), Update EXPLIZIT
// WHERE profile_id = user.id (kein Cross-User-Update, auch bei manipuliertem
// sv_id). RLS blockt zusaetzlich.

type Arbeitszeit = { von: string; bis: string }

const TAG_KEYS = ['mo', 'di', 'mi', 'do', 'fr', 'sa', 'so']
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

// Nicht exportiert: AGENTS.md AAR-664 — aus 'use server'-Files duerfen nur
// async Funktionen exportiert werden (Types/Konstanten werden im Client-Bundle
// zu undefined bzw. brechen den Next.js-Validator). Der Client baut das Objekt inline.
type UpdateVerfuegbarkeitInput = {
  // key = 'mo'|'di'|'mi'|'do'|'fr'|'sa'|'so' — nur GEOEFFNETE Tage sind enthalten.
  arbeitszeiten: Record<string, Arbeitszeit>
  // getDay()-Nummern (0=So..6=Sa, DB-Comment-Konvention) der GESCHLOSSENEN Wochentage.
  blockierteWochentage: number[]
  // Urlaub (date-Spalten) — null = kein Urlaub gesetzt.
  urlaubVon: string | null
  urlaubBis: string | null
}

export async function updateVerfuegbarkeit(
  input: UpdateVerfuegbarkeitInput,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser()
  if (userErr || !user) return { ok: false, error: 'Nicht angemeldet' }

  // --- Arbeitszeiten validieren + normalisieren (nur bekannte Keys, HH:MM, von<bis) ---
  const arbeitszeiten: Record<string, Arbeitszeit> = {}
  for (const [key, wert] of Object.entries(input.arbeitszeiten ?? {})) {
    if (!TAG_KEYS.includes(key)) continue
    if (!wert || !HHMM.test(wert.von) || !HHMM.test(wert.bis)) {
      return { ok: false, error: `Ungültige Uhrzeit für ${key.toUpperCase()}` }
    }
    if (wert.von >= wert.bis) {
      return { ok: false, error: `Von-Zeit muss vor Bis-Zeit liegen (${key.toUpperCase()})` }
    }
    arbeitszeiten[key] = { von: wert.von, bis: wert.bis }
  }

  // --- Geschlossene Wochentage: nur 0..6 (CHECK sachverstaendige_blockierte_wochentage_chk) ---
  const blockierte = Array.from(
    new Set((input.blockierteWochentage ?? []).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)),
  )

  // --- Urlaub: beide oder keins, valides ISO-Datum, von <= bis ---
  const urlaubVon = input.urlaubVon?.trim() || null
  const urlaubBis = input.urlaubBis?.trim() || null
  if ((urlaubVon && !urlaubBis) || (!urlaubVon && urlaubBis)) {
    return { ok: false, error: 'Bitte Urlaub-Start und -Ende angeben (oder beide leeren)' }
  }
  if (urlaubVon && urlaubBis) {
    if (!ISO_DATE.test(urlaubVon) || !ISO_DATE.test(urlaubBis)) {
      return { ok: false, error: 'Ungültiges Urlaubs-Datum' }
    }
    if (urlaubVon > urlaubBis) {
      return { ok: false, error: 'Urlaub-Start muss vor dem Ende liegen' }
    }
  }

  const { error } = await supabase
    .from('sachverstaendige')
    .update({
      arbeitszeiten,
      blockierte_wochentage: blockierte,
      urlaub_von: urlaubVon,
      urlaub_bis: urlaubBis,
    })
    .eq('profile_id', user.id)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/gutachter/einstellungen/verfuegbarkeit')
  revalidatePath('/gutachter/einstellungen')
  return { ok: true }
}
