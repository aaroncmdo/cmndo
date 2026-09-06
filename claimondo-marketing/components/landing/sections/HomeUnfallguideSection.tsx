import Image from 'next/image'
import { getTranslations } from 'next-intl/server'
import { GuideFormClient } from '@/app/[locale]/unfallguide/GuideFormClient'

// Der Unfallguide im Fluss der Startseite.
//
// WARUM ES DIESEN ABSCHNITT GIBT (Aaron, 06.09.2026: „Wo kommt das nicht?").
// Der Guide war von der Startseite aus nur ueber zwei Wege erreichbar, die
// beide eine Aktion VOR dem Wissen verlangen: ein Aufklapp-Menue oeffnen
// (`nav.ratgeber_menu`, erster Eintrag) oder bis zur Fusszeile scrollen. Wer
// den Guide nicht kennt, sucht ihn nicht — auf den 63 Ratgeber-Artikeln gibt es
// drei sichtbare Wege, auf der Startseite gab es keinen.
//
// WARUM KEIN POPOVER. Die Startseite ist indexiert; ein aufspringendes Fenster
// ist dort genau das, wofuer Google abwertet (Interstitial). Ausserdem ist das
// Popover auf Mobil bewusst aus, seit es dort als unsichtbarer Vollbild-Layer
// die Klicks gefressen hat. Ein Abschnitt IM FLUSS hat keines der beiden
// Probleme und funktioniert auf jedem Geraet.
//
// WARUM DAS ECHTE FORMULAR statt eines Links. Ein Link verschiebt die
// Entscheidung auf eine zweite Seite. Das Formular ist dasselbe Bauteil wie auf
// der Landeseite (ein Ort fuer die Logik), nur mit eigener Herkunft — sonst
// waeren die beiden Eingaenge in der Auswertung nicht mehr zu trennen.

const HEAD_FONT = { fontFamily: 'Montserrat, system-ui, sans-serif' } as const

export async function HomeUnfallguideSection() {
  const t = await getTranslations('unfallguide')

  return (
    <section className="bg-claimondo-navy py-16 sm:py-20">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-14">
        <div>
          {/* Light-Blue ist auf Navy der richtige Ton (6,23:1). Auf hellem Grund
              waere es 2,51:1 — dort nutzen die anderen Abschnitte Ondo. */}
          <span className="text-xs font-bold uppercase tracking-[0.18em] text-claimondo-light-blue">
            {t('kopf.eyebrow')}
          </span>
          <h2
            style={HEAD_FONT}
            className="mt-2 max-w-xl text-2xl font-bold leading-tight text-white sm:text-3xl"
          >
            {t('startseite.h2')}
          </h2>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-white/80">
            {t('startseite.text')}
          </p>

          <div className="mt-8 flex flex-col gap-6 sm:flex-row sm:items-center">
            <Image
              src="/brand/unfallguide-cover.jpg"
              alt={t('kopf.bild_alt')}
              width={760}
              height={1075}
              className="w-28 rounded-lg shadow-2xl ring-1 ring-white/15 sm:w-36"
            />
            <ul className="space-y-2 text-base text-white/80">
              <li>{t('kopf.punkt_1')}</li>
              <li>{t('kopf.punkt_2')}</li>
              <li>{t('kopf.punkt_3')}</li>
            </ul>
          </div>
        </div>

        <div className="lg:pl-4">
          <GuideFormClient quelle="unfallguide-startseite" />
        </div>
      </div>
    </section>
  )
}
