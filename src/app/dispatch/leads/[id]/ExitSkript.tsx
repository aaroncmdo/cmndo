'use client'

// AAR-114: Exit-Skripte fuer Disqualifikation (Notion-Spec 14.04.2026 §2.Q1)
// MA liest die Schritte dem Kunden vor, setzt den Lead auf disqualifiziert
// und beendet das Gespraech sauber.

import { useState } from 'react'
import { XCircleIcon, ClipboardCopyIcon, CheckIcon } from 'lucide-react'

export type DisqualifikationsGrund =
  | 'eigenverantwortung'
  | 'kein_schaden'
  | 'kein_haftpflicht'
  | 'fahrerflucht_ohne_kz'
  | 'parkplatz_ohne_kamera'

const SKRIPTE: Record<DisqualifikationsGrund, { titel: string; schritte: string[] }> = {
  eigenverantwortung: {
    titel: 'Exit bei Eigenverschulden',
    schritte: [
      'Kurz bestätigen: "Wenn ich das richtig verstehe — Sie haben den Unfall verursacht, ist das so?"',
      'Erklären: "In diesem Fall ist leider unsere Zuständigkeit nicht gegeben — unser Service gilt ausschließlich für Schäden, bei denen die Versicherung des anderen Fahrers für Sie aufkommt."',
      'Tipp: "Ich empfehle Ihnen, direkt bei Ihrer eigenen Versicherung anzurufen."',
      'Sauber abschließen. Keine offene Tür.',
    ],
  },
  kein_schaden: {
    titel: 'Exit bei keinem Schaden',
    schritte: [
      '"Wenn keine Verletzung vorliegt und Ihr Fahrzeug keinen erkennbaren Schaden hat, können wir den Fall leider nicht weiter bearbeiten."',
      '"Sollten Sie in den kommenden Tagen doch noch etwas bemerken — Schmerzen, ein Geräusch am Auto, irgendetwas — melden Sie sich einfach erneut."',
      'Sauber abschließen.',
    ],
  },
  kein_haftpflicht: {
    titel: 'Exit bei Kasko / eigene Versicherung',
    schritte: [
      '"Wenn der Schaden über Ihre eigene Kasko-Versicherung laufen muss, ist das leider nicht unser Zuständigkeitsbereich — wir arbeiten nur mit Haftpflichtschäden des Unfallgegners."',
      '"Bitte wenden Sie sich direkt an Ihren eigenen Versicherer."',
      'Sauber abschließen.',
    ],
  },
  fahrerflucht_ohne_kz: {
    titel: 'Exit bei Fahrerflucht ohne Kennzeichen',
    schritte: [
      '"Ohne Kennzeichen des Verursachers haben wir leider keine Möglichkeit, den Gegner zu ermitteln — und damit auch keine Versicherung gegen die wir regulieren könnten."',
      '"Bitte erstatten Sie zuerst Anzeige bei der Polizei. Wenn der Verursacher später ermittelt wird, melden Sie sich gerne wieder bei uns."',
      'Sauber abschließen.',
    ],
  },
  parkplatz_ohne_kamera: {
    titel: 'Exit bei Parkplatz ohne Kennzeichen und ohne Kamera',
    schritte: [
      '"Auf einem Parkplatz ohne Kennzeichen des Verursachers und ohne Überwachungskamera haben wir keine Möglichkeit, den Unfallgegner zu identifizieren."',
      '"Bitte erstatten Sie Anzeige bei der Polizei — das ist der richtige Weg in diesem Fall."',
      'Sauber abschließen.',
    ],
  },
}

export default function ExitSkript({ grund }: { grund: DisqualifikationsGrund }) {
  const [copied, setCopied] = useState(false)
  const skript = SKRIPTE[grund]

  if (!skript) return null

  function copyAll() {
    const text = skript.schritte.map((s, i) => `${i + 1}. ${s}`).join('\n\n')
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="bg-red-50 border border-red-200 rounded-ios-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <XCircleIcon className="w-5 h-5 text-red-600 shrink-0" />
          <h3 className="text-sm font-semibold text-red-900">{skript.titel}</h3>
        </div>
        <button
          type="button"
          onClick={copyAll}
          className="text-[10px] px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200 flex items-center gap-1 transition-colors"
        >
          {copied ? <CheckIcon className="w-3 h-3" /> : <ClipboardCopyIcon className="w-3 h-3" />}
          {copied ? 'Kopiert' : 'Kopieren'}
        </button>
      </div>
      <ol className="space-y-2">
        {skript.schritte.map((s, i) => (
          <li key={i} className="text-xs text-red-900 bg-white border border-red-100 rounded p-3 flex gap-2">
            <span className="font-semibold text-red-600 shrink-0">{i + 1}.</span>
            <span className="italic">{s}</span>
          </li>
        ))}
      </ol>
      <p className="text-[10px] text-red-600 italic border-t border-red-200 pt-2">
        Der MA liest die Schritte dem Kunden vor und beendet das Gespräch. Keine offene Tür,
        keine Zusagen für eine Reaktivierung — außer bei Fahrerflucht/Parkplatz (dort explizit angeboten).
      </p>
    </div>
  )
}
