'use server'

// 2026-05-11 Funnel v2: Standard-Verfuegbarkeit fuer Free-Tier-SVs (sv_leads).
//
// sv_leads sind Lead-Partner aus dem DAT-Import — wir haben kein Calendar-
// Sync mit ihnen. Stattdessen: feste Standard-Slots Mo-Fr, 4 pro Tag.
// Der Dispatcher bestaetigt nach dem Match manuell mit dem SV per Telefon
// (siehe docs/plans/funnel-vereinfachung-2026-05-11.md, Abschnitt 7).
//
// Konflikt-Check: bestehende `gutachter_termine` mit demselben sv_lead_id
// fallen aus dem Pool raus (kein doppelter Slot pro SV).

import { createAdminClient } from '@/lib/supabase/admin'
import type { TagVerfuegbarkeit, TagSlot } from '@/lib/onboarding/slots'

// Default-Slots Mo-Fr: 4 Termine pro Tag
const STANDARD_SLOTS_PRO_TAG: TagSlot[] = [
  { uhrzeit: '09:00', dauer: 45 },
  { uhrzeit: '11:00', dauer: 45 },
  { uhrzeit: '13:30', dauer: 45 },
  { uhrzeit: '15:30', dauer: 45 },
]

// JS getDay: 0=So, 1=Mo, ..., 6=Sa
const WOCHENTAG_LABELS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']

// Konflikt-Puffer um einen bereits gebuchten Slot — wenn ein Termin um 11:00
// laeuft, wird 09:00 und 13:30 NICHT geblockt, aber kein Slot der direkt
// ueberlappt. SLOT_DAUER + 30min Puffer fuer An-/Abfahrt zwischen Terminen.
const SLOT_DAUER_MIN = 45
const ABSTAND_MIN = 30

function ueberlappt(slotVon: Date, slotBis: Date, periodVon: Date, periodBis: Date): boolean {
  const slotVonMitPuffer = new Date(slotVon.getTime() - ABSTAND_MIN * 60_000)
  const slotBisMitPuffer = new Date(slotBis.getTime() + ABSTAND_MIN * 60_000)
  return periodVon < slotBisMitPuffer && periodBis > slotVonMitPuffer
}

/**
 * Liefert die Standard-Verfuegbarkeit fuer einen sv_lead im angegebenen
 * Zeitraum. Genutzt von SlotField im DynamicWizard wenn Tier=free.
 *
 * @param svLeadId  sv_leads.id (UUID)
 * @param datumVon  Start des Zeitfensters (inklusive, wird auf 00:00 normalisiert)
 * @param datumBis  Ende (inklusive)
 */
export async function getStandardSlots(
  svLeadId: string,
  datumVon: Date,
  datumBis: Date,
): Promise<TagVerfuegbarkeit[]> {
  const supabase = createAdminClient()

  // Bestehende Termine fuer diesen sv_lead im Zeitraum laden — als Konflikt-Pool.
  const { data: termine } = await supabase
    .from('gutachter_termine')
    .select('start_zeit, end_zeit')
    .eq('sv_lead_id', svLeadId)
    .not('status', 'in', '("storniert","abgelehnt","abgesagt")')
    .gte('start_zeit', datumVon.toISOString())
    .lte('start_zeit', datumBis.toISOString())

  // Plus GFA-Reservierungen die schon einen Slot blockiert haben aber noch
  // nicht konvertiert sind (paralleler Wizard-Submit).
  const { data: reservierungen } = await supabase
    .from('gutachter_finder_anfragen')
    .select('reservierter_slot_von, reservierter_slot_bis')
    .eq('zugeordneter_sv_lead_id', svLeadId)
    .gte('reservierter_slot_von', datumVon.toISOString())
    .lte('reservierter_slot_von', datumBis.toISOString())
    .not('status', 'in', '("abgeschlossen","storniert","entwurf")')

  type Belegt = { von: Date; bis: Date }
  const belegt: Belegt[] = [
    ...((termine ?? []) as Array<{ start_zeit: string; end_zeit: string }>).map((t) => ({
      von: new Date(t.start_zeit),
      bis: new Date(t.end_zeit),
    })),
    ...((reservierungen ?? []) as Array<{
      reservierter_slot_von: string | null
      reservierter_slot_bis: string | null
    }>)
      .filter((r) => r.reservierter_slot_von && r.reservierter_slot_bis)
      .map((r) => ({
        von: new Date(r.reservierter_slot_von as string),
        bis: new Date(r.reservierter_slot_bis as string),
      })),
  ]

  const result: TagVerfuegbarkeit[] = []
  const current = new Date(datumVon)
  current.setHours(0, 0, 0, 0)

  while (current <= datumBis) {
    const dowJs = current.getDay()
    const tagLabel = WOCHENTAG_LABELS[dowJs]
    const datum = current.toISOString().split('T')[0]

    // Mo-Fr (1..5) — Wochenende komplett frei lassen
    const istWerktag = dowJs >= 1 && dowJs <= 5
    const tagesSlots: TagSlot[] = []

    if (istWerktag) {
      for (const standardSlot of STANDARD_SLOTS_PRO_TAG) {
        const [h, m] = standardSlot.uhrzeit.split(':').map(Number)
        const slotVon = new Date(current)
        slotVon.setHours(h, m, 0, 0)
        const slotBis = new Date(slotVon.getTime() + SLOT_DAUER_MIN * 60_000)

        const inKonflikt = belegt.some((b) => ueberlappt(slotVon, slotBis, b.von, b.bis))
        if (!inKonflikt) tagesSlots.push(standardSlot)
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
