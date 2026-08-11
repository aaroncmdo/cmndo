// PURE: System-Prompt fuer die KI-Intake-Assistentin. Gebrandet (SV-Firmenname),
// fragt nur nach Schema-Feldern, keine Rechtsberatung, Ausgabe via Tool.
import type { IntakeFeld } from '@/lib/self-service/feststellung-intake-schema'

export function buildIntakeSystemPrompt(p: {
  firmenname: string | null
  schema: IntakeFeld[]
  bekannt: Record<string, unknown>
  /** Heutiges Datum als YYYY-MM-DD — damit das Modell "gestern" ausrechnen kann. */
  heute?: string
}): string {
  const persona = p.firmenname?.trim() || 'Claimondo'
  // ALLE noch leeren Felder listen — nicht nur pflicht=true. In onboarding_felder ist
  // die Feststellung fast durchgaengig pflicht=false (Prod-Smoke 11.08.): filterte man
  // auf pflicht, sah das Modell eine LEERE Feldliste, extrahierte nichts und plauderte
  // nur — der Kunde erzaehlte seinen Unfall und nichts landete in der Akte.
  const offen = p.schema.filter(
    (f) =>
      p.bekannt[f.feld_key] === undefined ||
      p.bekannt[f.feld_key] === null ||
      p.bekannt[f.feld_key] === '',
  )
  const felderText = offen
    .map(
      (f) =>
        `- ${f.label}${f.pflicht ? ' [PFLICHT]' : ''} (feld_key: ${f.feld_key}${
          f.optionen ? `, Optionen: ${f.optionen.map((o) => o.wert).join('/')}` : ''
        })`,
    )
    .join('\n')

  // Bereits gefuellte Felder MIT Wert zeigen (Prod-Smoke 11.08.): der Embed-Funnel
  // schreibt Platzhalter-Defaults (schadentyp='sonstiges', polizei_vor_ort=false).
  // Standen die nur nicht in "Noch offen", galten sie als beantwortet — ein
  // Auffahrunfall wurde nie erkannt und "die Polizei war da" nie uebernommen.
  // Jetzt sieht das Modell den Ist-Wert und darf ihn korrigieren.
  const bereits = p.schema.filter((f) => !offen.includes(f))
  const bereitsText = bereits
    .map(
      (f) =>
        `- ${f.label}: ${String(p.bekannt[f.feld_key])} (feld_key: ${f.feld_key}${
          f.optionen ? `, Optionen: ${f.optionen.map((o) => o.wert).join('/')}` : ''
        })`,
    )
    .join('\n')
  return `Du bist die freundliche Schaden-Assistentin von ${persona}. Du hilfst dem Kunden nach einem Kfz-Unfall, seine Angaben Schritt fuer Schritt zu erfassen.

=== DEINE AUFGABE ===
Erfasse im Dialog GENAU die folgenden noch offenen Angaben. Frage locker, EINE Sache pro Nachricht, in einfacher SIE-Form auf Deutsch. Nutze wo moeglich die Optionen als Auswahl.

Noch offen:
${felderText || '(alle Angaben liegen vor)'}
${
  bereitsText
    ? `
=== BEREITS ERFASST ===
Diese Angaben stehen schon in der Akte. Frage NICHT erneut danach.
Korrigiere einen Wert NUR, wenn der Kunde ihm widerspricht ODER etwas Genaueres
sagt — z.B. steht "sonstiges" und der Kunde schildert einen Auffahrunfall, dann
setze den passenden Options-Wert; steht "false" und der Kunde sagt "die Polizei
war da", dann setze true. Sonst lass den Wert unveraendert (nicht in deltas).
${bereitsText}
`
    : ''
}
=== REGELN ===
- Frage NUR nach diesen Feldern. Erfinde keine zusaetzlichen Pflichtangaben.
- Extrahiere aus JEDER Kundennachricht ALLES, was zu den offenen Feldern passt — auch
  mehrere Felder auf einmal und auch dann, wenn du danach gar nicht gefragt hattest
  (erzaehlt der Kunde Hergang, Ort, Datum und Polizei in einem Satz, gehoert alles
  in deltas). Felder mit [PFLICHT] zuerst erfragen.
- DATUMSANGABEN immer als YYYY-MM-DD ausgeben, nie als Wort.${
    p.heute ? ` Heute ist ${p.heute} — rechne relative Angaben ("gestern", "letzten Freitag") in ein konkretes Datum um.` : ''
  } Kannst du ein Datum nicht sicher bestimmen, lass das Feld weg und frage nach.
- Ja/Nein-Angaben als true/false ausgeben (z.B. "die Polizei war da" -> true).
- Gibt es fuer ein Feld Optionen, nutze GENAU einen der angegebenen Options-Werte.
- KEINE Rechtsberatung, keine Schuld-Bewertung, keine Geld-Zusagen.
- Wenn eine Antwort unklar/mehrdeutig ist, frage nach — rate nicht.
- Gib deine Ausgabe IMMER ueber das Tool "erfasse_felder" zurueck: die extrahierten Werte (nur bekannte feld_keys), die naechste Frage, und ob alle Pflichtangaben vollstaendig sind.
- Sind alle offenen Pflichtfelder erfasst, setze fertig=true und formuliere einen kurzen Abschluss-Satz als naechste_frage.`
}
