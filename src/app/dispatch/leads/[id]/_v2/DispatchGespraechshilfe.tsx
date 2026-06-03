'use client'
import { BookOpenIcon, ChevronDownIcon } from 'lucide-react'
import { GESPRAECHS_SEKTIONEN, DISQUALIFIKATIONS_HILFE } from '../_lib/gespraech-content'

const isTrue = (v: unknown) => v === 'true' || v === true

export function DispatchGespraechshilfe({ values }: { values: Record<string, unknown> }) {
  const closing: string[] = []

  // ALWAYS
  closing.push(
    '„Ich schicke Ihnen jetzt den Link — SA unterschreiben dauert 3 Minuten, dann sind Sie startklar."',
  )
  // ALWAYS
  closing.push(
    '„Außerdem schicke ich Ihnen einen zweiten Link für Ihren Fahrzeugschein — einfach abfotografieren und absenden."',
  )
  if (isTrue(values.schaden_sichtbar)) {
    closing.push(
      '„Bitte fotografieren Sie noch heute Ihr Auto von allen Seiten — vorne, hinten, beide Seiten + den Schaden nah dran. Diese Fotos sichern Ihre Ansprüche."',
    )
  }
  if (isTrue(values.zeugen)) {
    closing.push(
      '„Können Sie mir kurz Name und Telefonnummer des Zeugen geben? Ich trage das gleich ein."',
    )
  }
  if (isTrue(values.mietwagen_flag)) {
    closing.push(
      '„Die Mietwagenrechnung schicken Sie uns bitte sobald Sie das Fahrzeug zurückgeben — einfach per WhatsApp an diese Nummer."',
    )
  }
  if (isTrue(values.personenschaden_flag)) {
    closing.push(
      '„Lassen Sie sich bitte von einem Arzt untersuchen — auch wenn es sich erst gut anfühlt. Das Attest brauchen wir für Schmerzensgeld."',
    )
  }
  if (isTrue(values.polizei_vor_ort)) {
    closing.push(
      '„Sie können den Polizeibericht später nachreichen — wir schicken Ihnen einen Link sobald Sie ihn von der Polizei bekommen haben."',
    )
  }
  // ALWAYS
  closing.push(
    '„Bei Fragen erreichen Sie uns jederzeit per WhatsApp unter dieser Nummer — auch außerhalb der Geschäftszeiten."',
  )

  return (
    <div className="space-y-2">
      {GESPRAECHS_SEKTIONEN.map((s, i) => (
        <details
          key={i}
          className="bg-white rounded-ios-xl border border-claimondo-border p-3 group"
          open={i === 0}
        >
          <summary className="text-xs font-semibold text-claimondo-navy flex items-center gap-2 cursor-pointer list-none">
            <BookOpenIcon className="w-4 h-4 text-claimondo-ondo" />
            <span>{s.titel}</span>
            <ChevronDownIcon className="w-3.5 h-3.5 ml-auto text-claimondo-ondo/70 group-open:rotate-180 transition-transform" />
          </summary>
          <div className="mt-2 space-y-2">
            <p className="text-[11px] text-claimondo-navy italic leading-relaxed">{s.opener}</p>
            <ul className="space-y-1 pt-1 border-t border-claimondo-border">
              {s.folge.map((f, j) => (
                <li key={j} className="text-[10px] text-claimondo-ondo flex gap-1.5">
                  <span className="text-claimondo-ondo/70 shrink-0">•</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>
        </details>
      ))}

      {/* Closing-Sätze (flag-getrieben, immer ausgewertet) */}
      <details className="bg-white rounded-ios-xl border border-claimondo-border p-3">
        <summary className="text-xs font-semibold text-claimondo-navy cursor-pointer list-none">
          Closing — am Gesprächsende
        </summary>
        <ul className="mt-2 space-y-1.5">
          {closing.map((sentence, i) => (
            <li key={i} className="text-[11px] text-claimondo-navy italic flex gap-1.5">
              <span className="text-claimondo-ondo shrink-0">→</span>
              <span>{sentence}</span>
            </li>
          ))}
        </ul>
      </details>

      {/* Disqualifikations-Skripte (ExitSkript-Fold) */}
      <details className="bg-white rounded-ios-xl border border-claimondo-border p-3">
        <summary className="text-xs font-semibold text-claimondo-navy cursor-pointer list-none">
          Disqualifikation — Gesprächsabschluss
        </summary>
        <ul className="mt-2 space-y-1.5">
          {DISQUALIFIKATIONS_HILFE.map((d, i) => (
            <li key={i} className="text-[11px]">
              <span className="font-medium text-claimondo-navy">{d.grund}: </span>
              <span className="text-claimondo-ondo italic">{d.skript}</span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  )
}
