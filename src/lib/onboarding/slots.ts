'use server'

import { createClient } from '@/lib/supabase/server'

export type TagSlot = {
  uhrzeit: string // 'HH:MM'
  dauer: number   // Minuten
}

export type TagVerfuegbarkeit = {
  datum: string       // 'YYYY-MM-DD'
  wochentag: string   // 'Mo' | 'Di' | ...
  frei: boolean
  anzahl_slots: number
  slots: TagSlot[]
}

type Arbeitszeiten = {
  [tag: string]: { von: string; bis: string } | undefined
}

const DEFAULT_ARBEITSZEITEN: Arbeitszeiten = {
  mo: { von: '08:00', bis: '18:00' },
  di: { von: '08:00', bis: '18:00' },
  mi: { von: '08:00', bis: '18:00' },
  do: { von: '08:00', bis: '18:00' },
  fr: { von: '08:00', bis: '18:00' },
  // sa + so fehlen absichtlich = nicht arbeiten
}

const WOCHENTAG_KEYS = ['so', 'mo', 'di', 'mi', 'do', 'fr', 'sa']
const WOCHENTAG_LABELS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']

// Slot-Dauer in Minuten
const SLOT_DAUER = 60

function zeitZuMinuten(zeit: string): number {
  const [h, m] = zeit.split(':').map(Number)
  return h * 60 + (m ?? 0)
}

function minutenZuZeit(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export async function ladeFreieSlots(
  svId: string,
  datumVon: Date,
  datumBis: Date,
): Promise<TagVerfuegbarkeit[]> {
  const supabase = await createClient()

  // Arbeitszeiten des SV laden
  const { data: svRow } = await supabase
    .from('sachverstaendige')
    .select('arbeitszeiten')
    .eq('id', svId)
    .single()

  const arbeitszeiten: Arbeitszeiten =
    (svRow?.arbeitszeiten as Arbeitszeiten | null) ?? DEFAULT_ARBEITSZEITEN

  // Bestehende Termine im Zeitraum laden (gebuchte + reservierte Slots)
  const { data: termine } = await supabase
    .from('gutachter_termine')
    .select('start_zeit, end_zeit, status')
    .eq('sv_id', svId)
    .gte('start_zeit', datumVon.toISOString())
    .lte('start_zeit', datumBis.toISOString())
    .in('status', ['bestaetigt', 'geplant', 'reserviert'])

  // Aktive GFA-Reservierungen im gleichen Zeitraum
  const { data: reservierungen } = await supabase
    .from('gutachter_finder_anfragen')
    .select('reservierter_slot_von, reservierter_slot_bis')
    .eq('reservierter_sv_id', svId)
    .gte('reservierter_slot_von', datumVon.toISOString())
    .lte('reservierter_slot_von', datumBis.toISOString())
    .not('status', 'in', '("abgeschlossen","storniert","entwurf")')

  const belegteIntervalle: { von: Date; bis: Date }[] = [
    ...(termine ?? []).map(t => ({
      von: new Date(t.start_zeit),
      bis: new Date(t.end_zeit),
    })),
    ...(reservierungen ?? []).map(r => ({
      von: new Date(r.reservierter_slot_von!),
      bis: new Date(r.reservierter_slot_bis!),
    })),
  ]

  const result: TagVerfuegbarkeit[] = []
  const current = new Date(datumVon)
  current.setHours(0, 0, 0, 0)

  while (current <= datumBis) {
    const tagKey = WOCHENTAG_KEYS[current.getDay()]
    const tagLabel = WOCHENTAG_LABELS[current.getDay()]
    const az = arbeitszeiten[tagKey]
    const datum = current.toISOString().split('T')[0]

    const tagesSlots: TagSlot[] = []

    if (az) {
      const vonMin = zeitZuMinuten(az.von)
      const bisMin = zeitZuMinuten(az.bis)

      for (let slotStart = vonMin; slotStart + SLOT_DAUER <= bisMin; slotStart += SLOT_DAUER) {
        const slotVon = new Date(current)
        slotVon.setHours(Math.floor(slotStart / 60), slotStart % 60, 0, 0)
        const slotBis = new Date(slotVon.getTime() + SLOT_DAUER * 60_000)

        const belegt = belegteIntervalle.some(
          b => b.von < slotBis && b.bis > slotVon
        )

        if (!belegt) {
          tagesSlots.push({
            uhrzeit: minutenZuZeit(slotStart),
            dauer: SLOT_DAUER,
          })
        }
      }
    }

    result.push({
      datum,
      wochentag: tagLabel,
      frei: tagesSlots.length > 0,
      anzahl_slots: tagesSlots.length,
      slots: tagesSlots,
    })

    current.setDate(current.getDate() + 1)
  }

  return result
}

export async function reserviereSlot(
  anfrageId: string,
  svId: string,
  vonISO: string,
  bisISO: string,
): Promise<{ ok: true; terminId: string } | { ok: false; error: string }> {
  const supabase = await createClient()

  // Slot in gutachter_finder_anfragen reservieren
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: gfaErr } = await (supabase as any)
    .from('gutachter_finder_anfragen')
    .update({
      reservierter_slot_von: vonISO,
      reservierter_slot_bis: bisISO,
      reservierter_sv_id: svId,
    })
    .eq('id', anfrageId)

  if (gfaErr) return { ok: false, error: gfaErr.message }

  // Vorläufigen gutachter_termine-Eintrag mit status='reserviert' anlegen.
  // Wird bei SA-Signatur auf 'geplant' gesetzt, nach TTL zurückgesetzt.
  const { data: terminData, error: terminErr } = await supabase
    .from('gutachter_termine')
    .insert({
      sv_id: svId,
      start_zeit: vonISO,
      end_zeit: bisISO,
      status: 'reserviert',
      typ: 'vor_ort',
    })
    .select('id')
    .single()

  if (terminErr || !terminData) return { ok: false, error: terminErr?.message ?? 'Termin-Insert fehlgeschlagen' }

  return { ok: true, terminId: terminData.id }
}

export async function bestaetigeSlot(
  anfrageId: string,
  terminId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()

  const { error: terminErr } = await supabase
    .from('gutachter_termine')
    .update({ status: 'geplant' })
    .eq('id', terminId)
    .eq('status', 'reserviert')

  if (terminErr) return { ok: false, error: terminErr.message }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('gutachter_finder_anfragen')
    .update({ status: 'neu' })
    .eq('id', anfrageId)

  return { ok: true }
}
