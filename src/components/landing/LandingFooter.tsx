// AAR-462 F4: Minimaler Landing-Footer-Skeleton.
// Bewusst schlank — die vollständige Impressum/Datenschutz/Kontakt-Leiste
// liefert der globale <Footer/> aus src/components/Footer.tsx. Hier nur eine
// Brand-Tagline die den Hero abschließt. Ausbau erfolgt in späteren
// Phase-4-Tickets (AAR-464..469).
export function LandingFooter() {
  return (
    <section
      className="border-t border-claimondo-border bg-claimondo-bg"
      aria-label="Claimondo Mission"
    >
      <div className="mx-auto max-w-7xl px-4 py-10 text-center sm:px-6 sm:py-14">
        <p className="text-sm font-medium uppercase tracking-widest text-claimondo-ondo">
          KFZ-Schadensmanagement
        </p>
        <p className="mt-2 text-lg text-claimondo-navy sm:text-xl">
          Transparent. Digital. Fair.
        </p>
      </div>
    </section>
  )
}
