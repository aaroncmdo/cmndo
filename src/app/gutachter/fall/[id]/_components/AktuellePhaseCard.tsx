'use client'

// AAR-289: Router-Komponente für linke Spalte. Rendert je nach Subphase einen
// kompakten Hint + CTA „Aktion in der Akte". Echte Aktionen (Termin annehmen,
// Vor-Ort-Panel, Gutachten-Upload, Chat) leben in der bestehenden
// FallakteVollClient-Komponente die der MA via dem Akte-Drawer öffnet oder
// im Hauptinhalt sieht.
//
// AAR-291/293/294 ersetzen die Phasen-Hints durch echte Tasks/Aktionen.

import {
  CalendarCheckIcon,
  CheckCircle2Icon,
  CameraIcon,
  UploadIcon,
  ScaleIcon,
  EuroIcon,
  CircleCheckBigIcon,
  XCircleIcon,
  ClockIcon,
  CalendarPlusIcon,
} from 'lucide-react'
import type { SvSubphase } from '@/lib/gutachter/subphase'

type Hint = {
  icon: typeof CalendarCheckIcon
  title: string
  text: string
  cta?: string
  cssAccent: string
}

const HINTS: Record<SvSubphase['code'], Hint> = {
  'auftrag-eingegangen': {
    icon: CalendarCheckIcon,
    title: 'Termin bestätigen oder Gegenvorschlag machen',
    text: 'Der Auftrag liegt frisch bei dir. Schau dir den vorgeschlagenen Termin unten an und bestätige oder schlage eine Alternative vor.',
    cta: 'Termin-Aktionen unten',
    cssAccent: 'bg-amber-50 border-amber-200 text-amber-900',
  },
  'termin-bestaetigt': {
    icon: CheckCircle2Icon,
    title: 'Termin bestätigt',
    text: 'Der Besichtigungstermin steht. Vorbereitung: Stammdaten + ZB1 prüfen — am Termintag findest du hier deine Vor-Ort-Checkliste.',
    cssAccent: 'bg-emerald-50 border-emerald-200 text-emerald-900',
  },
  'vor-ort': {
    icon: CameraIcon,
    title: 'Heute am Termintag — Vor-Ort-Aktionen',
    text: 'Mache Fotos, prüfe FIN + Kilometerstand, hole fehlende Dokumente vom Kunden. Vor-Ort-Panel unten.',
    cta: 'Vor-Ort-Panel unten',
    cssAccent: 'bg-claimondo-bg border-claimondo-border text-claimondo-navy',
  },
  'gutachten-erstellen': {
    icon: UploadIcon,
    title: 'Gutachten hochladen',
    text: 'Die Besichtigung ist erfolgt. Lade jetzt das fertige Gutachten + Schadenhöhe hoch — typische Bearbeitungszeit: 48h nach Termin.',
    cta: 'Gutachten-Upload unten',
    cssAccent: 'bg-amber-50 border-amber-200 text-amber-900',
  },
  'kanzlei-uebergeben': {
    icon: ScaleIcon,
    title: 'Akte bei Kanzlei',
    text: 'Das Gutachten wurde an LexDrive übergeben. Aktuell keine SV-Aktion nötig — die Kanzlei prüft + schreibt die Versicherung an.',
    cssAccent: 'bg-claimondo-bg border-claimondo-border text-claimondo-navy',
  },
  anspruchsschreiben: {
    icon: ScaleIcon,
    title: 'Anspruchsschreiben versandt',
    text: 'Die Kanzlei hat das Anspruchsschreiben an die Versicherung gesendet. Wir warten auf Reaktion.',
    cssAccent: 'bg-claimondo-bg border-claimondo-border text-claimondo-navy',
  },
  regulierung: {
    icon: ClockIcon,
    title: 'Regulierung läuft',
    text: 'Die Versicherung prüft den Anspruch. Sobald reguliert wird, siehst du es hier — Auszahlung deines Honorars folgt automatisch.',
    cssAccent: 'bg-claimondo-bg border-claimondo-border text-claimondo-navy',
  },
  'zahlung-eingegangen': {
    icon: EuroIcon,
    title: 'Zahlung eingegangen',
    text: 'Die Versicherung hat reguliert. Dein Honorar wird in den nächsten Tagen überwiesen.',
    cssAccent: 'bg-emerald-50 border-emerald-200 text-emerald-900',
  },
  'honorar-ueberwiesen': {
    icon: CircleCheckBigIcon,
    title: 'Honorar überwiesen',
    text: 'Dein Honorar ist auf deinem Konto. Fall ist für dich abgeschlossen.',
    cssAccent: 'bg-emerald-50 border-emerald-200 text-emerald-900',
  },
  abgeschlossen: {
    icon: CircleCheckBigIcon,
    title: 'Fall abgeschlossen',
    text: 'Alle Schritte erledigt. Akte bleibt im Archiv verfügbar.',
    cssAccent: 'bg-claimondo-bg border-claimondo-border text-claimondo-navy',
  },
  storniert: {
    icon: XCircleIcon,
    title: 'Fall storniert',
    text: 'Dieser Fall wurde storniert — keine weiteren Aktionen erforderlich.',
    cssAccent: 'bg-red-50 border-red-200 text-red-900',
  },
}

export function AktuellePhaseCard({
  subphase,
  fallId,
  hatTermin,
}: {
  subphase: SvSubphase
  fallId?: string
  hatTermin?: boolean
}) {
  const hint = HINTS[subphase.code]
  if (!hint) return null
  const Icon = hint.icon

  // AAR-318 Teil B: iCal-Download nur bei bestätigtem oder bevorstehendem Termin
  const showIcalDownload =
    fallId &&
    hatTermin &&
    (subphase.code === 'termin-bestaetigt' ||
      subphase.code === 'vor-ort' ||
      subphase.code === 'auftrag-eingegangen')

  return (
    <div className={`rounded-ios-md border p-4 sm:p-5 space-y-2 ${hint.cssAccent}`}>
      <div className="flex items-center gap-2">
        <Icon className="w-5 h-5 shrink-0" />
        <p className="text-[11px] uppercase tracking-wider font-semibold opacity-80">
          Jetzt zu tun
        </p>
      </div>
      <h3 className="text-base font-semibold leading-snug">{hint.title}</h3>
      <p className="text-sm leading-relaxed opacity-90">{hint.text}</p>
      {hint.cta && (
        <p className="text-[11px] italic opacity-70 pt-1 border-t border-current/10">
          ↓ {hint.cta}
        </p>
      )}
      {showIcalDownload && (
        <a
          href={`/api/gutachter/fall/${fallId}/termin.ics`}
          download
          className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/80 border border-current/20 text-xs font-medium hover:bg-white"
        >
          <CalendarPlusIcon className="w-3.5 h-3.5" />
          Termin in Kalender (.ics)
        </a>
      )}
    </div>
  )
}
