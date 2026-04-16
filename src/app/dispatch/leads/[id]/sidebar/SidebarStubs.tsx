'use client'

// AAR-142 / W8: Sidebar Widgets (final).
// Enthält alle 5 fixen Sidebar-Komponenten:
//  - TimerWidget: wrappt den bestehenden GespraechsleitfadenTimer
//  - DisqualifizierenButton: Trigger-Button + DisqualifizierungsModal
//  - RueckrufButton: wrappt die bestehende RueckrufSection
//  - GespraechshilfePanel: phasen-sensitive Talking-Points
//  - EinwandKarten: Akkordeon mit Einwand-Antwort-Paaren

import { useState, useTransition } from 'react'
import GespraechsleitfadenTimer from '../GespraechsleitfadenTimer'
import RueckrufSection from '../RueckrufSection'
import { useDispatchPhase, type Phase } from '../lib/phase-context'
import { disqualifiziereLead } from '../actions'
import {
  AlertCircleIcon,
  BookOpenIcon,
  MessageSquareWarningIcon,
  XCircleIcon,
  ChevronDownIcon,
} from 'lucide-react'

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

// ─── Disqualifizierungs-Gründe (Notion-Spec Sektion 6) ──────────────────────
const DISQ_GRUENDE: { key: string; label: string }[] = [
  { key: 'eigenverantwortung', label: 'Eigenverantwortung des Kunden' },
  { key: 'kein_schaden', label: 'Kein Schaden vorhanden' },
  { key: 'fahrerflucht_ohne_kz_ohne_polizei', label: 'Fahrerflucht ohne Kennzeichen und ohne Polizei' },
  { key: 'parkplatz_ohne_kamera', label: 'Parkplatz: kein KZ + keine Kamera' },
  { key: 'kein_haftpflicht', label: 'Kasko / eigene Versicherung zuständig' },
  { key: 'kein_interesse', label: 'Kein Interesse' },
  { key: 'sonstiges', label: 'Sonstiges' },
]

export function DisqualifizierenButton() {
  const { lead } = useDispatchPhase()
  const [open, setOpen] = useState(false)
  const [grundKey, setGrundKey] = useState('')
  const [freitext, setFreitext] = useState('')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')

  function submit() {
    if (!grundKey) {
      setError('Bitte einen Grund wählen')
      return
    }
    if (grundKey === 'sonstiges' && !freitext.trim()) {
      setError('Bitte Freitext ausfüllen')
      return
    }
    const grund =
      grundKey === 'sonstiges'
        ? `Sonstiges: ${freitext.trim()}`
        : DISQ_GRUENDE.find((g) => g.key === grundKey)?.label ?? grundKey
    startTransition(async () => {
      try {
        await disqualifiziereLead(lead.id, grund)
        setOpen(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Fehler')
      }
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-xl border border-red-200 bg-white text-red-600 text-xs font-medium hover:bg-red-50 transition-colors"
      >
        <AlertCircleIcon className="w-4 h-4" />
        Disqualifizieren
      </button>
      {open && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div
            className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">Lead disqualifizieren</h3>
              <button type="button" onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
                <XCircleIcon className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-gray-500">
              Pflichtangabe: Warum wird der Lead disqualifiziert? Wird im Exit-Skript und in der Timeline protokolliert.
            </p>
            <div className="space-y-1">
              {DISQ_GRUENDE.map((g) => (
                <label key={g.key} className="flex items-start gap-2 text-xs cursor-pointer hover:bg-gray-50 rounded p-1.5">
                  <input
                    type="radio"
                    name="dq-grund"
                    checked={grundKey === g.key}
                    onChange={() => {
                      setGrundKey(g.key)
                      setError('')
                    }}
                    className="mt-0.5"
                  />
                  <span>{g.label}</span>
                </label>
              ))}
            </div>
            {grundKey === 'sonstiges' && (
              <textarea
                value={freitext}
                onChange={(e) => setFreitext(e.target.value)}
                placeholder="Bitte Grund beschreiben ..."
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none h-20"
              />
            )}
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50"
              >
                Abbrechen
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={submit}
                className="flex-1 px-3 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
              >
                {pending ? 'Speichern ...' : 'Disqualifizieren'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

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

// ─── Gesprächshilfen pro Phase (Notion-Spec Sektion 4) ──────────────────────
// AAR-179 P3-J: Volle Skripte aus der Master-Spec — pro Phase ein kurzer
// Opener + 2-3 Folge-Sätze die der MA bei Bedarf nachlegen kann.
const GESPRAECHSHILFEN: Record<Phase, { titel: string; opener: string; folge: string[] }> = {
  1: {
    titel: 'Einstieg + Empathie + Qualifizierung',
    opener:
      '„Claimondo Unfallservice, [Ihr Name] am Apparat. Das klingt stressig — wir kümmern uns. Erzählen Sie mir zuerst in Ruhe wie es passiert ist."',
    folge: [
      'Aktiv zuhören, nicht unterbrechen — erst 60–90s reden lassen.',
      'Dann strukturiert Q1 (Hergang), Q2 (Schaden/Personenschaden), Q3 (Polizei) abhaken.',
      'Bei „unklar" immer Teilschuld-Aufklärung vorlesen (rot markierter Checkbox-Block).',
    ],
  },
  2: {
    titel: 'Terminreservierung + Pfad-Entscheidung',
    opener:
      '„Ich habe einen Sachverständigen in Ihrer Nähe verfügbar — [Datum] um [Uhrzeit] könnten wir direkt reservieren. Passt das für Sie?"',
    folge: [
      'Zuerst Besichtigungsadresse klären (Auto-Save bei Select).',
      'Dann Pfad A (Komplett) vs. Pfad B (Nur SV) erklären — Standard ist Komplett.',
      'SV-Vorschläge nach Distanz + Kontingent automatisch sortiert.',
    ],
  },
  3: {
    titel: 'Schadentyp + Konstellation',
    opener:
      '„Damit wir das richtig einordnen — war das ein Auffahrunfall, ein Spurwechsel, oder auf dem Parkplatz?"',
    folge: [
      'Pro Schadentyp gibt es Dispatch-Hinweise (Zeugen/Dashcam/Polizei-AZ etc.).',
      'Bei Parkplatz ohne Kennzeichen: Kamera-Check ist Pflicht — Disqualifier.',
      'Schadentyp bestimmt automatisch die Ortskategorie (siehe P2-B).',
    ],
  },
  4: {
    titel: 'Stammdaten + Gegner',
    opener:
      '„Ich nehme noch kurz die restlichen Daten auf — Kennzeichen, Marke, Gegner-Kennzeichen. Dann sind wir fast durch."',
    folge: [
      'Kennzeichen über HSN/TSN triggert Cardentity-Call (Halter + Marke).',
      'Gegner-Versicherung: wenn bekannt eintragen, sonst „unbekannt" — Kanzlei recherchiert.',
      'Vorschäden-Frage nicht vergessen (Kasko-relevant).',
    ],
  },
  5: {
    titel: 'Letzter Check + FlowLink-Versand',
    opener:
      '„Ich schicke Ihnen jetzt den Link per WhatsApp. Darin unterschreiben Sie den Sachverständigen-Auftrag — das dauert drei Minuten. Danach ist Ihr Termin fix gebucht."',
    folge: [
      'Summary durchgehen — rote Zeilen sind noch offene Pflichtfelder.',
      'WA-Nummer + Email live editierbar (wird onBlur gespeichert).',
      'Nach Versand: Auto-Sprung zu Phase 6 Status-Tracking.',
    ],
  },
  6: {
    titel: 'Nachverfolgung + Inaktiv-Alarm',
    opener:
      '„Der Link wurde gesendet. Ich prüfe in den nächsten zwei Stunden den Status — melden Sie sich wenn irgendwas hakt, sonst hören wir uns nach dem Termin wieder."',
    folge: [
      'Alarm bei >2h ohne Portal-Öffnung — direkt Rückruf einleiten.',
      'Erneut-senden-Button unter dem Stepper falls Link verloren.',
      'Nach SA-Unterschrift wird T4 „Termin bestätigt" automatisch gesendet.',
    ],
  },
}

export function GespraechshilfePanel() {
  const { currentPhase, lead } = useDispatchPhase()
  const hilfe = GESPRAECHSHILFEN[currentPhase]
  const l = lead as unknown as {
    schaden_sichtbar?: boolean | null
    zeugen?: boolean | null
    mietwagen_flag?: boolean | null
    polizei_vor_ort?: boolean | null
    personenschaden_flag?: boolean | null
  }

  // AAR-302: Conditional Closing-Sätze in Phase 5 — basierend auf Lead-Flags
  const closingSaetze: string[] = []
  if (currentPhase === 5) {
    closingSaetze.push('„Ich schicke Ihnen jetzt den Link — SA unterschreiben dauert 3 Minuten, dann sind Sie startklar."')
    closingSaetze.push('„Außerdem schicke ich Ihnen einen zweiten Link für Ihren Fahrzeugschein — einfach abfotografieren und absenden."')
    if (l.schaden_sichtbar === true) {
      closingSaetze.push('„Bitte fotografieren Sie noch heute Ihr Auto von allen Seiten — vorne, hinten, beide Seiten + den Schaden nah dran. Diese Fotos sichern Ihre Ansprüche."')
    }
    if (l.zeugen === true) {
      closingSaetze.push('„Können Sie mir kurz Name und Telefonnummer des Zeugen geben? Ich trage das gleich ein."')
    }
    if (l.mietwagen_flag === true) {
      closingSaetze.push('„Die Mietwagenrechnung schicken Sie uns bitte sobald Sie das Fahrzeug zurückgeben — einfach per WhatsApp an diese Nummer."')
    }
    if (l.personenschaden_flag === true) {
      closingSaetze.push('„Lassen Sie sich bitte von einem Arzt untersuchen — auch wenn es sich erst gut anfühlt. Das Attest brauchen wir für Schmerzensgeld."')
    }
    if (l.polizei_vor_ort === true) {
      closingSaetze.push('„Sie können den Polizeibericht später nachreichen — wir schicken Ihnen einen Link sobald Sie ihn von der Polizei bekommen haben."')
    }
    closingSaetze.push('„Bei Fragen erreichen Sie uns jederzeit per WhatsApp unter dieser Nummer — auch außerhalb der Geschäftszeiten."')
  }

  return (
    <details className="bg-white rounded-xl border border-gray-200 p-3 group" open>
      <summary className="text-xs font-semibold text-gray-700 flex items-center gap-2 cursor-pointer list-none">
        <BookOpenIcon className="w-4 h-4 text-blue-500" />
        <span>Gesprächshilfe — {hilfe.titel}</span>
        <ChevronDownIcon className="w-3.5 h-3.5 ml-auto text-gray-400 group-open:rotate-180 transition-transform" />
      </summary>
      <div className="mt-2 space-y-2">
        <p className="text-[11px] text-gray-700 italic leading-relaxed">{hilfe.opener}</p>
        <ul className="space-y-1 pt-1 border-t border-gray-100">
          {hilfe.folge.map((f, i) => (
            <li key={i} className="text-[10px] text-gray-500 flex gap-1.5">
              <span className="text-gray-400 shrink-0">•</span>
              <span>{f}</span>
            </li>
          ))}
        </ul>
        {/* AAR-302: Conditional Closing-Skript für Phase 5 */}
        {closingSaetze.length > 0 && (
          <div className="pt-2 border-t border-blue-200">
            <p className="text-[10px] uppercase tracking-wider text-blue-700 font-semibold mb-1.5">
              Closing — am Gesprächsende sagen:
            </p>
            <ul className="space-y-1.5">
              {closingSaetze.map((s, i) => (
                <li key={i} className="text-[11px] text-blue-900 italic leading-relaxed flex gap-1.5">
                  <span className="text-blue-400 shrink-0">→</span>
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </details>
  )
}

// ─── Einwand-Karten (Notion-Spec Sektion 5) ─────────────────────────────────
// AAR-179 P3-K: Einwände sind jetzt phasensensitiv — jeder Einwand hat ein
// Array von Phasen in denen er typischerweise kommt. Default in allen Phasen
// sichtbar sind nur die „Dauerbrenner" (Kosten, Seriosität).
type Einwand = {
  einwand: string
  antwort: string
  phasen: Phase[]  // leer = immer sichtbar
}

const EINWAENDE: Einwand[] = [
  {
    einwand: '„Ich melde mich selbst bei der Versicherung"',
    antwort:
      'Wir übernehmen alles komplett — Gutachten, Kanzlei, Kommunikation mit der Gegenseite. Mit unserer Partnerkanzlei bekommen Sie im Schnitt mehr heraus als wenn Sie es selbst regulieren.',
    phasen: [1, 2, 5],
  },
  {
    einwand: '„Muss ich irgendetwas zahlen?"',
    antwort:
      'Nein, für Sie ist alles kostenlos. Die Kosten trägt die Versicherung des Unfallverursachers — das ist Ihr gesetzliches Recht.',
    phasen: [],  // immer — Dauerbrenner
  },
  {
    einwand: '„Ich habe schon einen Anwalt"',
    antwort:
      'Kein Problem — dann übernehmen wir nur den Gutachtertermin. Ihr Anwalt bleibt unabhängig, wir liefern ihm nur das Gutachten.',
    phasen: [2],
  },
  {
    einwand: '„Das dauert mir zu lange"',
    antwort:
      'Wir haben oft schon übermorgen einen Termin. Sie müssen nur kurz unterschreiben — das dauert drei Minuten im Portal.',
    phasen: [2, 5],
  },
  {
    einwand: '„Ich überlege mir das"',
    antwort:
      'Ich halte den Termin 30 Minuten für Sie offen — danach geht der Slot an den nächsten Fall. Sollen wir zusammen kurz durchgehen?',
    phasen: [5, 6],
  },
  {
    einwand: '„Wie lange dauert die Regulierung?"',
    antwort:
      'In der Regel 4–6 Wochen. Sie sehen den Status jederzeit live in Ihrem Portal — inkl. aller Dokumente.',
    phasen: [1, 5],
  },
  {
    einwand: '„Ist das seriös?"',
    antwort:
      'Wir arbeiten ausschließlich mit DAT-zertifizierten Gutachtern und der LexDrive GmbH als Kanzlei-Partner — beide gerichtlich anerkannt und geprüft.',
    phasen: [],  // immer — Dauerbrenner
  },
]

export function EinwandKarten() {
  const { currentPhase } = useDispatchPhase()
  // Zeige nur die Einwände, die in der aktuellen Phase typisch sind (oder
  // immer — leeres Phasen-Array). So sieht der MA nicht 7 Karten auf einmal
  // sondern nur die 2-4 relevanten.
  const relevante = EINWAENDE.filter(
    (e) => e.phasen.length === 0 || e.phasen.includes(currentPhase),
  )
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3 space-y-1.5">
      <div className="flex items-center gap-2 text-xs font-semibold text-gray-700 mb-1">
        <MessageSquareWarningIcon className="w-4 h-4 text-amber-500" />
        <span>Einwand-Karten</span>
        <span className="ml-auto text-[9px] text-gray-400 uppercase tracking-wide">
          Phase {currentPhase}
        </span>
      </div>
      <div className="space-y-1">
        {relevante.map((e, i) => (
          <details key={i} className="group rounded-lg border border-gray-100 p-2 hover:border-amber-200">
            <summary className="text-[11px] font-medium text-gray-700 cursor-pointer list-none flex items-start gap-1">
              <ChevronDownIcon className="w-3 h-3 mt-0.5 text-gray-400 group-open:rotate-180 transition-transform shrink-0" />
              <span className="flex-1">{e.einwand}</span>
            </summary>
            <p className="text-[10px] text-gray-600 mt-1.5 pl-4 italic leading-relaxed">{e.antwort}</p>
          </details>
        ))}
        {relevante.length === 0 && (
          <p className="text-[10px] text-gray-400 italic py-1">
            Keine phasentypischen Einwände in Phase {currentPhase}.
          </p>
        )}
      </div>
    </div>
  )
}
