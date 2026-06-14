// PLATZHALTER (§4) — Monika-Widget-FAB-Slot. NICHT funktional.
//
// TODO anderer Dev: Monika-Widget (Lottie/Chat-FAB) hier global einhaengen.
//   Briefs: MONIKA-MATRIX-PFADE-BRIEF + CONTENT-MONIKA-BRIEF.
//   Konkrete Specs im Repo-Umfeld: MONIKA-ANCHOR-SPEC, MONIKA-DESIGN-DIREKTIVE,
//   MONIKA-EMBED-CLARIFICATION, MONIKA-LOTTIE-RUNTIME-SPEC.
//   WICHTIG: KEIN app.claimondo.de/embed-iframe ohne Footprint-Entscheidung des
//   anderen Devs (au.io-Pfad vs. akzeptierter Footprint).
//
// Rendert nur in der Entwicklung einen markierten Slot (Einbau-Stelle sichtbar);
// in Produktion null — der Platzhalter geht NICHT scharf in diesem Deploy.
export function MonikaPlaceholder() {
  if (process.env.NODE_ENV === 'production') return null
  return (
    <div
      aria-hidden
      data-placeholder="monika-fab"
      className="fixed bottom-5 right-5 z-30 flex h-14 w-14 flex-col items-center justify-center rounded-full border-2 border-dashed border-au-amber/60 bg-au-surface/85 text-center font-mono text-[8px] font-semibold uppercase leading-tight tracking-wide text-au-amber-dark"
    >
      Monika
      <br />
      Slot
    </div>
  )
}
