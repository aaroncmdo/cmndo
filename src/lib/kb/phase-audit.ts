// AAR-433 (Child 4 von AAR-429): KB Phase-State-Audit. Pure Function, die
// pro Fall die eine höchst-priorisierte Aktion für den Kundenbetreuer
// liefert — analog zu `src/lib/kunde/jetzt-zu-tun.ts` (AAR-432), aber aus
// KB-Perspektive.
//
// Die 9 Zustände werden nach Priority-Order ausgewertet (first match wins).
// SLA-Records aus AAR-431 (Child 2), Tasks aus AAR-430 (Child 1) und
// Stepper-State (src/lib/fall/stepper-state.ts) bilden die Inputs.

import { workingDaysBetween } from '@/lib/sla/workdays'
import type { StepperState } from '@/lib/fall/stepper-state'

export type KbAktionState =
  | 'sla-breached'
  | 'task-ueberfaellig'
  | 'dispatch-blocker'
  | 'vs-antwort-pruefen'
  | 'task-faellig-heute'
  | 'kunde-wartet'
  | 'phase-stale'
  | 'routine-check'
  | 'alles-ok'

export type KbAktionPrioritaet = 'kritisch' | 'hoch' | 'mittel' | 'niedrig'

export type KbAktion = {
  state: KbAktionState
  prioritaet: KbAktionPrioritaet
  titel: string
  beschreibung: string
  cta?: { label: string; href: string } | null
  deadline_am?: string | null
  warnung?: string | null
}

/** Eingabe-Kontext für die KB-Audit-Matrix. */
export type KbFallContext = {
  id: string
  status?: string | null
  updated_at?: string | null
  abgeschlossen_am?: string | null
  anschlussschreiben_am?: string | null
  regulierung_am?: string | null
}

export type KbTask = {
  id: string
  fall_id: string
  titel?: string | null
  status?: string | null
  empfaenger_rolle?: string | null
  faellig_am?: string | null
  prioritaet?: string | null
}

export type KbSlaRecord = {
  fall_id: string
  target_rolle?: string | null
  blocker_rolle?: string | null
  blocker_grund?: string | null
  status?: string | null
  breach_at?: string | null
  phase?: string | null
  blocker_seit?: string | null
}

/** Schwelle für phase-stale: so viele Werktage ohne Fortschritt → Warnung. */
const PHASE_STALE_WORKDAYS = 5
/** Schwelle für kunde-wartet: so viele Tage Kunde-Blocker ohne Reaktion → KB soll nachfassen. */
const KUNDE_WARTET_TAGE = 2

function isTaskOffen(t: KbTask): boolean {
  const s = (t.status ?? '').toLowerCase()
  return s === 'offen' || s === 'in-bearbeitung'
}

function taskIsUeberfaellig(t: KbTask, now: number): boolean {
  if (!t.faellig_am || !isTaskOffen(t)) return false
  const f = new Date(t.faellig_am).getTime()
  return !Number.isNaN(f) && f < now
}

function taskIstHeute(t: KbTask, now: number): boolean {
  if (!t.faellig_am || !isTaskOffen(t)) return false
  const f = new Date(t.faellig_am).getTime()
  if (Number.isNaN(f)) return false
  const heuteStart = new Date()
  heuteStart.setHours(0, 0, 0, 0)
  const heuteEnde = new Date()
  heuteEnde.setHours(23, 59, 59, 999)
  return f >= heuteStart.getTime() && f <= heuteEnde.getTime() && f >= now - 1000
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString('de-DE', {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function prioritaetLabel(p: string | null | undefined): KbAktionPrioritaet {
  const v = (p ?? '').toLowerCase()
  if (v === 'kritisch') return 'kritisch'
  if (v === 'dringend' || v === 'hoch') return 'hoch'
  if (v === 'niedrig') return 'niedrig'
  return 'mittel'
}

/**
 * Liefert die EINE höchst-priorisierte KB-Aktion für diesen Fall.
 * Prio-Order (first match wins):
 *   1. sla-breached        — SLA verletzt, KB muss handeln
 *   2. task-ueberfaellig   — faellig_am < now
 *   3. dispatch-blocker    — Status dispatch-fehlgeschlagen o.ä.
 *   4. vs-antwort-pruefen  — VS hat geantwortet, KB muss reagieren
 *   5. task-faellig-heute
 *   6. kunde-wartet        — blocker_rolle=kunde seit > N Tagen
 *   7. phase-stale         — aktive Phase > 5 WT ohne Update
 *   8. routine-check       — normale offene Tasks
 *   9. alles-ok            — keine KB-Aktion nötig
 */
export function getKbPhaseAudit(
  fall: KbFallContext,
  tasks: KbTask[] | undefined,
  slaRecords: KbSlaRecord[] | undefined,
  stepperState: StepperState | null | undefined,
): KbAktion {
  const fallHref = `/faelle/${fall.id}`
  const now = Date.now()

  const ownTasks = (tasks ?? []).filter(
    (t) => t.fall_id === fall.id && (t.empfaenger_rolle ?? '').toLowerCase() === 'kundenbetreuer',
  )
  const offeneTasks = ownTasks.filter(isTaskOffen)

  const ownSlas = (slaRecords ?? []).filter(
    (s) =>
      s.fall_id === fall.id &&
      ((s.target_rolle ?? '').toLowerCase() === 'kundenbetreuer' ||
        (s.blocker_rolle ?? '').toLowerCase() === 'kundenbetreuer'),
  )

  // 1. sla-breached (kritisch)
  const slaBreach = ownSlas.find((s) => (s.status ?? '').toLowerCase() === 'breached')
  if (slaBreach) {
    return {
      state: 'sla-breached',
      prioritaet: 'kritisch',
      titel: 'SLA verletzt — sofort handeln',
      beschreibung:
        slaBreach.blocker_grund ??
        `SLA-Frist überschritten${slaBreach.phase ? ` in Phase „${slaBreach.phase}"` : ''}. Bitte Fall prüfen und nächsten Schritt anstoßen.`,
      cta: { label: 'Fall öffnen', href: fallHref },
      deadline_am: slaBreach.breach_at ?? null,
      warnung: `SLA seit ${fmtDate(slaBreach.breach_at)} im Breach.`,
    }
  }

  // 2. task-ueberfaellig (hoch)
  const ueberfaellig = offeneTasks
    .filter((t) => taskIsUeberfaellig(t, now))
    .sort(
      (a, b) =>
        new Date(a.faellig_am ?? 0).getTime() - new Date(b.faellig_am ?? 0).getTime(),
    )
  if (ueberfaellig[0]) {
    const t = ueberfaellig[0]
    return {
      state: 'task-ueberfaellig',
      prioritaet: 'hoch',
      titel: 'Überfällige Aufgabe',
      beschreibung: t.titel ?? 'Eine Aufgabe ist überfällig — bitte erledigen oder neu planen.',
      cta: { label: 'Fall öffnen', href: fallHref },
      deadline_am: t.faellig_am ?? null,
      warnung:
        ueberfaellig.length > 1
          ? `${ueberfaellig.length} überfällige Aufgaben insgesamt.`
          : null,
    }
  }

  // 3. dispatch-blocker (hoch)
  const status = (fall.status ?? '').toLowerCase()
  if (
    status === 'dispatch-fehlgeschlagen' ||
    status === 'sv-nicht-verfuegbar' ||
    status === 'dispatch-blockiert'
  ) {
    return {
      state: 'dispatch-blocker',
      prioritaet: 'hoch',
      titel: 'Dispatch hängt — manueller Eingriff nötig',
      beschreibung:
        'Die automatische SV-Zuweisung ist fehlgeschlagen. Bitte manuell einen Gutachter zuweisen oder den Fall eskalieren.',
      cta: { label: 'Fall öffnen', href: fallHref },
      warnung: 'Dispatch-Blocker — Kunde wartet auf Termin.',
    }
  }

  // 4. vs-antwort-pruefen (hoch)
  // VS hat reagiert (kuerzt/ablehnt/reguliert), KB muss Kunde/Kanzlei-Fluss triggern
  if (
    status === 'vs-kuerzt' ||
    status === 'vs-abgelehnt' ||
    status === 'vs-reaktion-eingegangen'
  ) {
    return {
      state: 'vs-antwort-pruefen',
      prioritaet: 'hoch',
      titel: 'VS-Antwort prüfen und reagieren',
      beschreibung:
        'Die Versicherung hat auf das Anschlussschreiben reagiert. Bitte Kunde informieren und Kanzlei-Weiterleitung prüfen.',
      cta: { label: 'VS-Tab öffnen', href: `${fallHref}?tab=prozess` },
    }
  }

  // 5. task-faellig-heute (mittel)
  const heute = offeneTasks.filter((t) => taskIstHeute(t, now))
  if (heute[0]) {
    const t = heute[0]
    return {
      state: 'task-faellig-heute',
      prioritaet: 'mittel',
      titel: 'Heute fällig',
      beschreibung: t.titel ?? 'Eine Aufgabe ist heute fällig.',
      cta: { label: 'Fall öffnen', href: fallHref },
      deadline_am: t.faellig_am ?? null,
    }
  }

  // 6. kunde-wartet (mittel) — blocker_rolle=kunde seit > KUNDE_WARTET_TAGE
  const kundeBlocker = (slaRecords ?? []).find(
    (s) =>
      s.fall_id === fall.id &&
      (s.blocker_rolle ?? '').toLowerCase() === 'kunde' &&
      (s.status ?? '').toLowerCase() === 'pending',
  )
  if (kundeBlocker) {
    const seitIso = kundeBlocker.blocker_seit ?? kundeBlocker.breach_at ?? null
    const seit = seitIso ? new Date(seitIso).getTime() : null
    const tage = seit ? (now - seit) / (1000 * 60 * 60 * 24) : 0
    if (tage >= KUNDE_WARTET_TAGE) {
      return {
        state: 'kunde-wartet',
        prioritaet: 'mittel',
        titel: 'Kunde reagiert nicht — nachfassen',
        beschreibung:
          kundeBlocker.blocker_grund ??
          `Der Kunde blockt seit ${Math.floor(tage)} Tagen. Bitte aktiv per WhatsApp/Telefon nachfassen.`,
        cta: { label: 'Fall öffnen', href: fallHref },
        warnung: `Kunde-Blocker seit ${fmtDate(seitIso)}.`,
      }
    }
  }

  // 7. phase-stale (mittel)
  const aktivePhase = stepperState?.hauptPhasen?.find((p) => p.status === 'aktiv') ?? null
  if (aktivePhase && fall.updated_at) {
    const updated = new Date(fall.updated_at)
    if (!Number.isNaN(updated.getTime())) {
      const wt = workingDaysBetween(updated, new Date())
      if (wt >= PHASE_STALE_WORKDAYS) {
        return {
          state: 'phase-stale',
          prioritaet: 'mittel',
          titel: 'Phase läuft ohne Fortschritt',
          beschreibung: `Die Phase „${aktivePhase.label}" läuft seit ${wt} Werktagen ohne Update. Bitte prüfen, woran es hakt.`,
          cta: { label: 'Prozess-Tab', href: `${fallHref}?tab=prozess` },
          warnung: `Phase „${aktivePhase.label}" stale seit ${wt} WT.`,
        }
      }
    }
  }

  // 8. routine-check (niedrig) — normale offene Tasks ohne Eile
  if (offeneTasks.length > 0) {
    const prio = offeneTasks
      .map((t) => prioritaetLabel(t.prioritaet))
      .sort((a, b) => {
        const order: Record<KbAktionPrioritaet, number> = {
          kritisch: 0,
          hoch: 1,
          mittel: 2,
          niedrig: 3,
        }
        return order[a] - order[b]
      })[0]
    return {
      state: 'routine-check',
      prioritaet: prio === 'kritisch' || prio === 'hoch' ? 'mittel' : 'niedrig',
      titel: `${offeneTasks.length} offene Aufgabe${offeneTasks.length === 1 ? '' : 'n'}`,
      beschreibung:
        offeneTasks[0].titel ??
        'Routine-Aufgaben sind offen — bei Gelegenheit abarbeiten.',
      cta: { label: 'Fall öffnen', href: fallHref },
    }
  }

  // 9. alles-ok (niedrig)
  return {
    state: 'alles-ok',
    prioritaet: 'niedrig',
    titel: 'Kein Handlungsbedarf',
    beschreibung: 'Für diesen Fall ist aktuell keine KB-Aktion nötig.',
    cta: null,
  }
}
