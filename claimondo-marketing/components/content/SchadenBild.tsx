import Image from 'next/image'
import Link from 'next/link'
import { findeNachweis, nachweisKurz } from '@/lib/bilder/nachweise'

// Ein Schadenfoto mit Bildunterschrift und — wo die Lizenz es verlangt — der Nennung
// von Urheber und Lizenz.
//
// WARUM die Nennung hier und nicht nur auf /bildnachweis: CC BY und CC BY-SA verlangen
// die Angabe "in angemessener Weise". Ein Link auf eine Sammelseite erfuellt das nur,
// wenn er vom Bild aus erreichbar ist — deshalb steht die Kurzform unter dem Bild und
// verlinkt auf die vollstaendige Liste.
//
// WARUM feste Breite/Hoehe: ohne sie springt das Layout, sobald das Bild laedt (CLS).
// Die Dateien liegen als 16:9 in 640 und 1024 px vor; `sizes` sagt dem Browser, welche
// er ziehen soll — sonst laedt er auf dem Handy die 1024er.

type Props = {
  /** Dateiname ohne Suffix, z. B. 'leichter-schaden-kratzer-lack-tuer' */
  datei: string
  /** Beschreibt, was zu sehen ist — nicht der Dateiname. Pflicht. */
  alt: string
  /** Sichtbare Bildunterschrift. Ohne sie steht nur die Nennung da. */
  bildunterschrift?: string
  /** Erstes Bild einer Seite oberhalb der Falz: laedt bevorzugt. */
  prioritaet?: boolean
  className?: string
}

export function SchadenBild({ datei, alt, bildunterschrift, prioritaet = false, className = '' }: Props) {
  const nachweis = findeNachweis(datei)

  return (
    <figure className={`my-8 ${className}`}>
      <div className="relative aspect-[16/9] w-full overflow-hidden rounded-ios-lg bg-claimondo-bg">
        <Image
          src={`/img/schaeden/${datei}-16x9-1024.webp`}
          alt={alt}
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 90vw, 768px"
          priority={prioritaet}
          className="object-cover"
        />
      </div>
      {(bildunterschrift || nachweis) && (
        <figcaption className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-body-xs text-claimondo-shield">
          {bildunterschrift && <span>{bildunterschrift}</span>}
          {nachweis && nachweis.nennungPflicht && (
            <span className="text-caption">
              Foto: {nachweis.urheber},{' '}
              {nachweis.lizenzUrl ? (
                <a
                  href={nachweis.lizenzUrl}
                  target="_blank"
                  rel="noopener noreferrer license"
                  className="underline decoration-dotted underline-offset-2"
                >
                  {nachweis.lizenz}
                </a>
              ) : (
                nachweis.lizenz
              )}
              {' · '}
              <Link href="/bildnachweis" className="underline decoration-dotted underline-offset-2">
                Bildnachweis
              </Link>
            </span>
          )}
          {nachweis && !nachweis.nennungPflicht && (
            <span className="text-caption">
              Foto: {nachweisKurz(nachweis)} ·{' '}
              <Link href="/bildnachweis" className="underline decoration-dotted underline-offset-2">
                Bildnachweis
              </Link>
            </span>
          )}
        </figcaption>
      )}
    </figure>
  )
}
