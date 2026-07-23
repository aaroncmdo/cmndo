// 3-Monats-Zustandsaufnahme-Reminder (Flotte).
// Findet Fleet-Fahrzeuge, deren letzte ABGESCHLOSSENE Zustandsdoku aelter als 3 Monate ist,
// und erinnert die Flottenmanager der Firma: in-App-Mitteilung (Update-Glocke, Dedup-Anker)
// + WhatsApp-Push (best-effort, fail-soft).
//
// Bewusst NUR bereits-gescannte Fahrzeuge (>=1 abgeschlossener Scan): "in drei Monaten nochmal"
// (Aaron) setzt eine Erst-Aufnahme voraus. Nie-gescannte Fahrzeuge = separater Onboarding-Nudge,
// nicht hier (sonst wuerde jedes noch-nie-erfasste Flottenfahrzeug sofort geflutet).
//
// Dedup: max. 1 Reminder je Fahrzeug / 30 Tage. Anker = eine mitteilungen-Zeile mit
// kontext_typ='fahrzeug' + kontext_id=vehicle_id — kein zusaetzliches Ledger/Tabelle noetig.
// Idempotent bei Mehrfachlauf (der naechste Lauf innerhalb 30 Tagen ueberspringt).
//
// vehicle_scans / flotten_fahrzeuge sind untyped (AnyDb, Regel-2-Lag) — Caller uebergibt den
// Admin-Client (kein RLS-Pfad, service-role Cron).
import type { SupabaseClient } from '@supabase/supabase-js'
import { createMitteilung } from '@/lib/mitteilungen/create-mitteilung'
import { getKundeFlotte, type FlottenFahrzeug } from '@/lib/kunde/firma-flotte'
import { getAktiveFlottenmanager } from './konto-firma'
import { sendWhatsAppText } from '@/lib/whatsapp/baileys-client'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = SupabaseClient<any, any, any>

/** Faelligkeits-Schwelle: Zustandsdoku aelter als so viele Monate -> Reminder. */
export const ZUSTAND_FAELLIG_MONATE = 3
/** Dedup-Fenster: nach einem Reminder fruehestens nach so vielen Tagen erneut erinnern. */
export const ZUSTAND_REMINDER_DEDUP_TAGE = 30

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.claimondo.de').replace(/\/$/, '')

export type FaelligesFahrzeug = { vehicleId: string; firmaId: string; letzterScanAm: string }

export type ReminderErgebnis = {
  /** Faellige Fahrzeuge insgesamt (vor Dedup). */
  faellig: number
  /** Fahrzeuge, fuer die in diesem Lauf frisch benachrichtigt wurde. */
  benachrichtigt: number
  /** Faellige Fahrzeuge, die wegen des Dedup-Fensters uebersprungen wurden. */
  uebersprungen: number
}

/** Anzeige-Label eines Fahrzeugs (Kennzeichen · Hersteller · Modell), analog FlottenClaimDetailView. */
function fahrzeugLabel(v: FlottenFahrzeug): string {
  return [v.kennzeichen, v.hersteller, v.modell].filter(Boolean).join(' · ') || 'Fahrzeug'
}

/** Volle Kalendermonate zwischen `iso` und `now` (>=1). Fuer die Reminder-Formulierung. */
function monateSeit(iso: string, now: Date): number {
  const then = new Date(iso)
  const months = (now.getFullYear() - then.getFullYear()) * 12 + (now.getMonth() - then.getMonth())
  return Math.max(1, months)
}

/**
 * Fleet-Fahrzeuge, deren letzter ABGESCHLOSSENER Zustandsdoku-Scan aelter als `cutoffIso` ist.
 * Nur DB-Reads. Nie-gescannte Fahrzeuge sind bewusst NICHT enthalten (siehe File-Header).
 */
export async function findeFaelligeFahrzeuge(db: AnyDb, cutoffIso: string): Promise<FaelligesFahrzeug[]> {
  const { data: ff } = await db.from('flotten_fahrzeuge').select('vehicle_id, firma_id')
  const rows = (ff ?? []) as Array<{ vehicle_id: string; firma_id: string }>
  if (rows.length === 0) return []

  // vehicle -> firma (N:M in der Theorie, real 1 Firma je Fahrzeug; erste Zuordnung gewinnt).
  const firmaFor = new Map<string, string>()
  for (const r of rows) if (!firmaFor.has(r.vehicle_id)) firmaFor.set(r.vehicle_id, r.firma_id)
  const vehicleIds = [...firmaFor.keys()]

  // Letzter abgeschlossener Scan je Fahrzeug (desc-Order -> erster Treffer = neuester).
  // Fleets sind klein -> ein .in() reicht; bei sehr grossen Flotten spaeter chunken.
  const { data: scans } = await db
    .from('vehicle_scans')
    .select('vehicle_id, erstellt_am')
    .eq('status', 'abgeschlossen')
    .in('vehicle_id', vehicleIds)
    .order('erstellt_am', { ascending: false })
  const letzterScan = new Map<string, string>()
  for (const s of (scans ?? []) as Array<{ vehicle_id: string; erstellt_am: string }>) {
    if (!letzterScan.has(s.vehicle_id)) letzterScan.set(s.vehicle_id, s.erstellt_am)
  }

  const faellig: FaelligesFahrzeug[] = []
  for (const [vehicleId, scanAm] of letzterScan) {
    if (scanAm < cutoffIso) {
      faellig.push({ vehicleId, firmaId: firmaFor.get(vehicleId) as string, letzterScanAm: scanAm })
    }
  }
  return faellig
}

/**
 * Haupt-Lauf: faellige Fahrzeuge ermitteln, Dedup anwenden, je Firma die Flottenmanager
 * benachrichtigen (Mitteilung + WhatsApp). `now` wird injiziert (testbar / Cron uebergibt new Date()).
 */
export async function runZustandFaelligReminder(db: AnyDb, now: Date): Promise<ReminderErgebnis> {
  const cutoff = new Date(now.getTime())
  cutoff.setMonth(cutoff.getMonth() - ZUSTAND_FAELLIG_MONATE)
  const cutoffIso = cutoff.toISOString()
  const dedupSinceIso = new Date(
    now.getTime() - ZUSTAND_REMINDER_DEDUP_TAGE * 24 * 60 * 60 * 1000,
  ).toISOString()

  const faellig = await findeFaelligeFahrzeuge(db, cutoffIso)
  if (faellig.length === 0) return { faellig: 0, benachrichtigt: 0, uebersprungen: 0 }

  // Dedup: welche faelligen Fahrzeuge wurden in den letzten DEDUP_TAGE schon erinnert?
  const dueIds = faellig.map((f) => f.vehicleId)
  const { data: recent } = await db
    .from('mitteilungen')
    .select('kontext_id')
    .eq('kontext_typ', 'fahrzeug')
    .eq('kategorie', 'update')
    .in('kontext_id', dueIds)
    .gte('created_at', dedupSinceIso)
  const schonErinnert = new Set(
    ((recent ?? []) as Array<{ kontext_id: string | null }>).map((r) => r.kontext_id),
  )

  const offen = faellig.filter((f) => !schonErinnert.has(f.vehicleId))

  // Nach Firma gruppieren -> je Firma FM-Liste + Labels nur einmal laden.
  const proFirma = new Map<string, FaelligesFahrzeug[]>()
  for (const f of offen) {
    const arr = proFirma.get(f.firmaId) ?? []
    arr.push(f)
    proFirma.set(f.firmaId, arr)
  }

  let benachrichtigt = 0
  for (const [firmaId, fahrzeuge] of proFirma) {
    const fmListe = await getAktiveFlottenmanager(db, firmaId)
    if (fmListe.length === 0) continue // ohne aktiven FM niemand zu erinnern -> nicht als "benachrichtigt" zaehlen
    const flotte = await getKundeFlotte(db, firmaId)
    const labelFor = new Map(flotte.map((v) => [v.vehicleId, fahrzeugLabel(v)]))

    for (const f of fahrzeuge) {
      const label = labelFor.get(f.vehicleId) ?? 'Fahrzeug'
      const monate = monateSeit(f.letzterScanAm, now)
      const titel = 'Zustandsaufnahme fällig'
      const inhalt = `Für ${label} liegt die letzte Zustandsdoku ${monate} Monate zurück. Bitte den aktuellen Fahrzeug-Zustand mit einer neuen Fotostrecke erfassen.`

      // In-App-Mitteilung je FM (Update-Glocke + Dedup-Anker). route_url wird via kontext_typ auto-gesetzt.
      for (const fm of fmListe) {
        await createMitteilung({
          empfaenger_id: fm.userId,
          empfaenger_rolle: 'flottenmanager',
          kategorie: 'update',
          titel,
          inhalt,
          kontext_typ: 'fahrzeug',
          kontext_id: f.vehicleId,
          prioritaet: 'normal',
        })
      }

      // WhatsApp-Push (best-effort, fail-soft: ein Send-Fehler bricht den Cron nie).
      const waText = `${titel}\n\n${inhalt}\n\n${APP_URL}/flotte/fahrzeug/${f.vehicleId}`
      for (const fm of fmListe) {
        if (!fm.whatsapp) continue
        try {
          const r = await sendWhatsAppText(fm.whatsapp, waText)
          if (!r.ok) console.error('[zustand-faellig] WA-Send fehlgeschlagen:', r.error)
        } catch (err) {
          console.error('[zustand-faellig] WA-Send warf:', err)
        }
      }
      benachrichtigt++
    }
  }

  return { faellig: faellig.length, benachrichtigt, uebersprungen: faellig.length - offen.length }
}
