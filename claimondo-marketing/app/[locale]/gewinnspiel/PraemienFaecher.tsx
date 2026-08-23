// Der Karten-Faecher: das Vertrauens-Objekt der Seite.
//
// Warum ARTEN statt Marken-Logos: Fremde Logos (ARAL, Esso, TotalEnergies, …)
// auf der eigenen Werbeseite sind markenrechtlich der heiklere Fall — die blosse
// NENNUNG zur Beschreibung des Angebots ist von § 23 MarkenG gedeckt, die
// Abbildung nicht ohne Weiteres. Die Karten tragen deshalb die Gutschein-Art,
// die Anbieter stehen als Text darunter.
//
// Die Karten kommen aus der Kampagnen-API (gewinnspiel_praemien), nicht aus
// einer Liste im Code: derselbe Katalog speist die Auswahl im Formular, und
// eine an zwei Stellen gepflegte Liste driftet garantiert auseinander.
//
// Bewusst als CSS/Markup statt Bild: skaliert scharf auf jedem Display, laedt
// in wenigen Bytes (Paid-Social-Traffic ist mobil und ungeduldig).

type Praemie = { id: string; name: string; beschreibung: string | null }

/** Kartenlook je Position. Bewusst eigene Toene, keine Marken-Farben.
 *  Rotiert, damit auch vier oder fuenf Praemien ein Faecher bleiben. */
const LOOKS = [
  { von: '#1F4B73', bis: '#2E6F9E', rotation: '-8deg', versatz: 'translate-y-2' },
  { von: '#7A4B2A', bis: '#A9713F', rotation: '-1deg', versatz: '-translate-y-1' },
  { von: '#3B3A52', bis: '#5C5A7D', rotation: '7deg', versatz: 'translate-y-3' },
  { von: '#2C5B4F', bis: '#3F8272', rotation: '13deg', versatz: 'translate-y-1' },
]

export function PraemienFaecher({ praemien }: { praemien: Praemie[] }) {
  // Ohne Katalog kein Faecher: ein Platzhalter waere schlechter als nichts,
  // weil er einen Preis verspricht, den niemand pflegt.
  if (praemien.length === 0) return null

  const sichtbar = praemien.slice(0, LOOKS.length)
  const hinweis = praemien.find((p) => p.beschreibung)?.beschreibung ?? null

  return (
    <div>
      <ul className="flex items-center justify-center gap-3 sm:gap-4" role="list">
        {sichtbar.map((p, i) => {
          const look = LOOKS[i % LOOKS.length]
          return (
            <li
              key={p.id}
              className={`relative ${look.versatz}`}
              style={{ transform: `rotate(${look.rotation})` }}
            >
              <div
                className="flex h-28 w-[5.5rem] flex-col justify-between rounded-ios-md p-2.5 shadow-lg ring-1 ring-white/20 sm:h-32 sm:w-24 sm:p-3"
                style={{ backgroundImage: `linear-gradient(150deg, ${look.von}, ${look.bis})` }}
              >
                {/* Der Magnetstreifen-Anklang macht aus dem Rechteck eine Karte. */}
                <span aria-hidden className="block h-1.5 w-full rounded-full bg-white/25" />
                <span className="text-[11px] font-bold leading-tight text-white/95 sm:text-xs">
                  {p.name}
                </span>
                <span className="text-sm font-black tabular-nums text-white sm:text-base">50 €</span>
              </div>
            </li>
          )
        })}
      </ul>

      {hinweis ? (
        <p className="mt-4 text-center text-[12px] leading-relaxed text-white/50">
          Einlösbar bei {hinweis}.
        </p>
      ) : null}
    </div>
  )
}
