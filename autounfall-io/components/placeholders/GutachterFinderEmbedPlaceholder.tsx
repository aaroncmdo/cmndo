// PLATZHALTER (§4) — Gutachter-Finder-Embed-Karten-Slot auf /gutachter-finden.
// NICHT funktional. Das bestehende LeadFormClient (oben) bleibt aktiv — Leads
// laufen unveraendert weiter, bis das Finder-Embed/Monika es ggf. abloest.
//
// TODO anderer Dev: Gutachter-Finder-Embed (Karte) hier einhaengen.
//   Briefs: MONIKA-MATRIX-PFADE-BRIEF + CONTENT-MONIKA-BRIEF.
//   WICHTIG: KEIN app.claimondo.de/embed-iframe ohne Footprint-Entscheidung des
//   anderen Devs (au.io-Pfad vs. akzeptierter Footprint).
//
// Rendert nur in der Entwicklung einen markierten Slot; in Produktion null
// (Platzhalter NICHT scharf in diesem Deploy).
export function GutachterFinderEmbedPlaceholder() {
  if (process.env.NODE_ENV === 'production') return null
  return (
    <div
      data-placeholder="gutachter-finder-embed"
      className="mt-8 rounded-ios-md border-2 border-dashed border-au-amber/50 bg-au-amber-light/20 p-6 text-center"
    >
      <p className="font-mono text-[11px] font-semibold uppercase tracking-widest text-au-amber-dark">
        Platzhalter · Gutachter-Finder-Embed
      </p>
      <p className="mt-2 text-sm leading-relaxed text-au-ink-soft">
        Einbau-Stelle für das Finder-Embed (anderer Dev). Das Anfrage-Formular oben
        bleibt aktiv.
      </p>
    </div>
  )
}
