// Foundation-Startseite (Platzhalter). Zeigt das au.io-Design-System (Tokens,
// Fonts, Logo, Cards) — die echten Hub-/Content-Strecken folgen in WP-1..7.
// Bewusst ohne Links auf noch nicht existierende Routen (kein 404).

const SECTIONS = [
  {
    eyebrow: 'Ratgeber',
    title: 'Ansprüche verstehen',
    body: 'Von Wertminderung über Nutzungsausfall bis Schmerzensgeld — verständlich erklärt, mit den richtigen Argumenten.',
  },
  {
    eyebrow: 'Decoder',
    title: 'Kürzungen entschlüsseln',
    body: 'Was hinter „wir prüfen noch", gestrichenen UPE-Aufschlägen oder einem zu hohen Restwert wirklich steckt.',
  },
  {
    eyebrow: 'Rechner',
    title: 'Beträge selbst prüfen',
    body: 'Nutzungsausfall, Schadenfreiheitsklasse, Wiederbeschaffungswert — schnell und nachvollziehbar berechnet.',
  },
]

export default function HomePage() {
  return (
    <div className="container-narrow px-4 py-20 sm:px-6 sm:py-28">
      <section className="mx-auto max-w-3xl text-center">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-au-amber">
          Unfall-Assistance
        </p>
        <h1 className="mt-4 font-display text-4xl font-extrabold leading-tight tracking-tight text-au-ink sm:text-5xl">
          Nach dem Unfall den Überblick behalten.
        </h1>
        <p className="mt-6 text-lg leading-relaxed text-au-ink-soft">
          autounfall.io erklärt unabhängig und verständlich, welche Ansprüche Ihnen nach einem
          Kfz-Unfall zustehen. Ratgeber, Decoder und Rechner folgen in Kürze.
        </p>
      </section>

      <section className="mx-auto mt-16 grid max-w-5xl gap-6 sm:grid-cols-3">
        {SECTIONS.map((s) => (
          <div
            key={s.eyebrow}
            className="rounded-ios-lg border border-au-sand-dark bg-au-surface p-6 shadow-au-sm"
          >
            <p className="font-mono text-xs uppercase tracking-widest text-au-amber">{s.eyebrow}</p>
            <h2 className="mt-2 font-display text-xl font-bold text-au-ink">{s.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-au-ink-soft">{s.body}</p>
          </div>
        ))}
      </section>
    </div>
  )
}
