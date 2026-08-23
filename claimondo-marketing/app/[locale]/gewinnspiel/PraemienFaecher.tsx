// Der Karten-Faecher: das Vertrauens-Objekt der Seite.
//
// Warum ARTEN statt Marken-Logos: Fremde Logos (ARAL, Esso, TotalEnergies, …)
// auf der eigenen Werbeseite sind markenrechtlich der heiklere Fall — die blosse
// NENNUNG zur Beschreibung des Angebots ist von § 23 MarkenG gedeckt, die
// Abbildung nicht ohne Weiteres. Die Karten tragen deshalb die Gutschein-Art,
// die Anbieter stehen als Text darunter. Das deckt sich mit dem Datenmodell:
// gewinnspiel_praemien ist ein Katalog von ARTEN (Spec E11).
//
// Bewusst als CSS/Markup statt Bild: skaliert scharf auf jedem Display, laedt
// in wenigen Bytes (Paid-Social-Traffic ist mobil und ungeduldig) und bleibt
// aenderbar, ohne dass jemand ein Asset nachliefern muss.

type Praemie = {
  name: string
  wo: string
  /** Zwei Stops fuer den Kartenverlauf. Bewusst eigene Toene, keine Marken-Farben. */
  von: string
  bis: string
  rotation: string
  versatz: string
}

const PRAEMIEN: Praemie[] = [
  {
    name: 'Tanken & Laden',
    wo: 'ARAL, Esso, TotalEnergies, JET, GO und EnBW',
    von: '#1F4B73',
    bis: '#2E6F9E',
    rotation: '-8deg',
    versatz: 'translate-x-0 translate-y-2',
  },
  {
    name: 'Einkaufen',
    wo: 'Supermärkte und Onlineshops',
    von: '#7A4B2A',
    bis: '#A9713F',
    rotation: '-1deg',
    versatz: 'translate-x-0 -translate-y-1',
  },
  {
    name: 'Freie Wahl',
    wo: 'Sie entscheiden beim Gewinn',
    von: '#3B3A52',
    bis: '#5C5A7D',
    rotation: '7deg',
    versatz: 'translate-x-0 translate-y-3',
  },
]

export function PraemienFaecher() {
  return (
    <div>
      <ul className="flex items-center justify-center gap-3 sm:gap-4" role="list">
        {PRAEMIEN.map((p) => (
          <li
            key={p.name}
            className={`relative ${p.versatz}`}
            style={{ transform: `rotate(${p.rotation})` }}
          >
            <div
              className="flex h-28 w-[5.5rem] flex-col justify-between rounded-ios-md p-2.5 shadow-lg ring-1 ring-white/20 sm:h-32 sm:w-24 sm:p-3"
              style={{ backgroundImage: `linear-gradient(150deg, ${p.von}, ${p.bis})` }}
            >
              {/* Der Magnetstreifen-Anklang macht aus dem Rechteck eine Karte. */}
              <span aria-hidden className="block h-1.5 w-full rounded-full bg-white/25" />
              <span className="text-[11px] font-bold leading-tight text-white/95 sm:text-xs">
                {p.name}
              </span>
              <span className="text-sm font-black tabular-nums text-white sm:text-base">50 €</span>
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-4 text-center text-[12px] leading-relaxed text-white/50">
        Einlösbar bei {PRAEMIEN[0].wo}.
      </p>
    </div>
  )
}
