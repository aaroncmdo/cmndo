import Link from 'next/link'
import { MapPin } from 'lucide-react'
import { staedteFuerRatgeber } from '@/lib/kfz-gutachter/ratgeber-staedte'

// Stadt-Querverweise am Fuss der Ratgeber-Seiten (P3-A4).
//
// Vorher verlinkte KEINE der neun Ratgeber-Seiten eine einzige Stadt — jede
// thematische Seite endete in sich selbst, obwohl sie das naheliegende
// Sprungbrett in die lokale Flaeche ist.
//
// Die Auswahl ist eine deterministische Verteilung, keine inhaltliche
// Zuordnung: "Wertminderung" gilt in Koeln wie in Bocholt. Begruendung in
// lib/kfz-gutachter/ratgeber-staedte.ts.

export function RatgeberStaedteSection({ artikelSlug }: { artikelSlug: string }) {
  const staedte = staedteFuerRatgeber(artikelSlug, 8)

  return (
    <section className="bg-white py-14" aria-labelledby="ratgeber-staedte-heading">
      <div className="mx-auto max-w-4xl px-5">
        <h2
          id="ratgeber-staedte-heading"
          className="flex items-center gap-2 text-lg font-bold text-claimondo-navy"
        >
          <MapPin className="h-5 w-5 text-claimondo-ondo" aria-hidden />
          Kfz-Gutachter vor Ort
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-claimondo-shield">
          Was hier steht, gilt bundesweit. Wie es an Ihrem Ort abläuft – mit
          zuständigem Amtsgericht und den Honorarspannen der Region – steht auf
          der jeweiligen Stadtseite.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          {staedte.map((s) => (
            <Link
              key={s.slug}
              href={`/kfz-gutachter/${s.slug}`}
              className="rounded-full border border-claimondo-border bg-white px-4 py-1.5 text-xs font-semibold text-claimondo-ondo transition-colors hover:border-claimondo-ondo hover:text-claimondo-navy"
            >
              Kfz-Gutachter {s.name}
            </Link>
          ))}
          <Link
            href="/kfz-gutachter"
            className="rounded-full border border-claimondo-ondo bg-claimondo-ondo px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-claimondo-shield"
          >
            Alle Städte
          </Link>
        </div>
      </div>
    </section>
  )
}
