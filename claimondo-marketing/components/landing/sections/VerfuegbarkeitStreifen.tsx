import { ladeUebersichtsTermine } from '@/lib/termine/naechster-termin'

// Freie Vor-Ort-Termine als schmaler Streifen auf der STARTSEITE.
//
// WARUM HIER: Auswertung der nginx-Zugriffslogs vom 24.08.2026 (14 Stunden) — die
// KI-Crawler rufen die Startseite **26×** ab (OAI-SearchBot 62, ChatGPT-User 60,
// ClaudeBot 43, PerplexityBot 37 Zugriffe insgesamt), die Stadtseiten dagegen 16×
// und llms.txt genau **1×**. Die meistgelesene Seite trug bis hierher keine einzige
// Aussage darüber, WANN jemand einen Termin bekommt.
//
// Das ist der Unterschied zu jedem Wettbewerber: andere haben Texte über Gutachter,
// wir haben eine konkrete, heute gültige Verfügbarkeit samt fertigem Buchungslink.
// Ein Modell, das eine konkrete Frage beantworten soll, nimmt die konkrete Quelle.
//
// Bewusst KEINE Slot-Liste und keine Anzahl — nur der früheste Termin je Stadt
// (Aaron-Entscheidung 24.08.): das verrät die Auslastung des Netzes nicht.
//
// Fällt die Abfrage aus oder ist gerade nirgends etwas frei, rendert die Komponente
// `null` — die Startseite sieht dann exakt aus wie zuvor.

export async function VerfuegbarkeitStreifen() {
  const termine = await ladeUebersichtsTermine()
  if (termine.length === 0) return null

  return (
    <section className="border-y border-claimondo-border bg-white py-4" aria-label="Freie Vor-Ort-Termine">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-x-6 gap-y-2 px-5">
        <p className="text-caption font-bold uppercase tracking-wide text-claimondo-shield/70">
          Nächste freie Vor-Ort-Termine
        </p>
        {termine.map((t) => (
          <a
            key={t.stadt}
            href={t.buchungsUrl}
            className="text-body-sm text-claimondo-navy transition-colors hover:text-claimondo-ondo"
          >
            <span className="font-bold">{t.stadt}</span>
            <span className="text-claimondo-shield"> · {t.label}</span>
            {t.vorname ? <span className="text-claimondo-shield"> · {t.vorname}</span> : null}
          </a>
        ))}
      </div>
    </section>
  )
}
