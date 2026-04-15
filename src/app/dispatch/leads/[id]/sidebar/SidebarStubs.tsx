'use client'

// AAR-137 / W3: Sidebar-Stubs für die DispatchShell.
// W8 (AAR-142) ersetzt die Stub-Versionen von DisqualifizierenButton,
// GespraechshilfePanel und EinwandKarten durch die finale Implementation gemäß
// Notion-Master-Spec 14.04.2026. TimerWidget und RueckrufButton wrappen bereits
// existierende, fertige Components, damit die Sidebar-Funktionalität nicht
// regressiert während der Migration.

import GespraechsleitfadenTimer from '../GespraechsleitfadenTimer'
import RueckrufSection from '../RueckrufSection'
import { useDispatchPhase } from '../lib/phase-context'
import { AlertCircleIcon, BookOpenIcon, MessageSquareWarningIcon } from 'lucide-react'

function StubCard({
  title,
  icon,
  hint,
}: {
  title: string
  icon: React.ReactNode
  hint: string
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3 space-y-1.5">
      <div className="flex items-center gap-2 text-xs font-semibold text-gray-700">
        {icon}
        <span>{title}</span>
      </div>
      <p className="text-[11px] text-gray-400 italic">{hint}</p>
    </div>
  )
}

/** Timer-Widget — wrappt den bestehenden GespraechsleitfadenTimer (AAR-114). */
export function TimerWidget() {
  const { lead } = useDispatchPhase()
  const l = lead as unknown as {
    gespraech_gestartet_am?: string | null
    gespraech_beendet_am?: string | null
    gespraech_dauer_sekunden?: number | null
  }
  return (
    <GespraechsleitfadenTimer
      leadId={lead.id}
      gestartetAm={l.gespraech_gestartet_am ?? null}
      beendetAm={l.gespraech_beendet_am ?? null}
      dauerSekunden={l.gespraech_dauer_sekunden ?? null}
    />
  )
}

/** Disqualifizieren-Button — Stub, W8 baut Exit-Flow mit Grund-Auswahl. */
export function DisqualifizierenButton() {
  return (
    <StubCard
      title="Disqualifizieren"
      icon={<AlertCircleIcon className="w-4 h-4 text-red-500" />}
      hint="W8 baut den Exit-Flow mit Grund-Auswahl + Bestätigung."
    />
  )
}

/** Rückruf-Button — wrappt die bestehende RueckrufSection (AAR-98). */
export function RueckrufButton() {
  const { lead } = useDispatchPhase()
  const l = lead as unknown as {
    rueckruf_datum?: string | null
    rueckruf_notiz?: string | null
    rueckruf_erledigt?: boolean | null
  }
  return (
    <RueckrufSection
      lead={{
        id: lead.id,
        rueckruf_datum: l.rueckruf_datum ?? null,
        rueckruf_notiz: l.rueckruf_notiz ?? null,
        rueckruf_erledigt: l.rueckruf_erledigt ?? null,
      }}
    />
  )
}

/** Gesprächshilfe-Panel — Stub, W8 liefert Talking-Points pro Phase. */
export function GespraechshilfePanel() {
  return (
    <StubCard
      title="Gesprächshilfe"
      icon={<BookOpenIcon className="w-4 h-4 text-blue-500" />}
      hint="W8 zeigt hier die phasen-spezifischen Talking-Points."
    />
  )
}

/** Einwand-Karten — Stub, W8 liefert Einwand-Katalog mit Antwort-Skripten. */
export function EinwandKarten() {
  return (
    <StubCard
      title="Einwand-Karten"
      icon={<MessageSquareWarningIcon className="w-4 h-4 text-amber-500" />}
      hint="W8 liefert den Einwand-Katalog mit Antwort-Skripten."
    />
  )
}
