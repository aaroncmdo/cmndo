import Image from 'next/image'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { GuideSiegelKarteHuelle } from './GuideSiegelKarteHuelle'

// Dauereinstieg zum Unfallguide, direkt UNTER dem ProvenExpert-Siegel.
//
// Aaron am 06.09.2026, mit Bildschirmfoto des Siegels: „ich möchte den guide
// hier drunter". Ich hatte davon zuvor abgeraten (weiteres schwebendes Element
// = die Klasse, die auf den Ratgeber-Artikeln die Klicks gefressen hat); er hat
// die Frage wiederholt, also ist es entschieden. Die Bedenken sind nicht
// weggeredet, sondern eingebaut — siehe die drei Punkte unten.
//
// ── GEOMETRIE, am 06.09. auf prod GEMESSEN, nicht geschaetzt ────────────────
//
//   .pe-pro-seal           Wrapper, 0 px hoch, top: 340px (globals.css)
//   sichtbare Karte        300 x 249, y 91–340, rechtsbuendig (rechts 0)
//   ab 768 px Breite       vorhanden (768/900/1024/1100/1200/1280/1440 geprueft)
//   bei 390 px            GAR NICHT vorhanden
//
// Daraus folgt alles Weitere: Breite 300 (buendig mit dem Siegel), `top-[352px]`
// (12 px Luft unter dessen Unterkante bei y=340), und `hidden md:block` —
// Tailwinds `md` ist 768 px und trifft damit exakt die Schwelle des Siegels.
// „Unter dem Siegel" existiert unterhalb davon nicht, also gibt es dort auch
// diese Karte nicht.
//
// ── DREI VORKEHRUNGEN GEGEN DIE OVERLAY-KLASSE ─────────────────────────────
//
// 1. `hidden md:block` wirkt hier WIRKLICH — anders als beim Popover, wo der
//    Portal-Container die Klasse nicht trug und trotzdem montiert wurde. Diese
//    Karte hat keinen Portal: `display: none` nimmt sie aus dem Hit-Testing.
// 2. `z-[39]` — dieselbe Ebene wie das Siegel und damit UNTER der klebenden
//    Kopfzeile (z-40) und unter jedem Dialog.
// 3. Begrenzte Flaeche statt Vollbild. Die gefressenen Klicks kamen von einem
//    `inset-0`-Container; diese Karte ist 300 px breit und ~66 px hoch. Ihre
//    Wirkung ist trotzdem gemessen worden (Positivkontrolle im PR).
//
// ── HERKUNFT ───────────────────────────────────────────────────────────────
// `utm_content` statt eines eigenen Herkunfts-Feldes: das Guide-Formular liest
// die UTM-Parameter bereits aus der URL (`UTM_FELDER` in GuideFormClient) und
// schreibt sie an den Lead. Kein neuer Mechanismus, keine JS-Verfolgung, und
// `utm_source` bleibt unangetastet — das gehoert der echten Verkehrsquelle,
// nicht einer internen Platzierung.

export async function GuideSiegelKarte() {
  const t = await getTranslations('unfallguide')
  const tf = await getTranslations('unfallguide_formular')

  return (
    <GuideSiegelKarteHuelle>
      <aside
        aria-label="Unfallguide"
        className="fixed right-0 top-[352px] z-[39] hidden w-[300px] md:block"
      >
        <Link
          href="/unfallguide?utm_content=proseal-karte"
          className="flex items-center gap-3 rounded-l-ios-md bg-claimondo-navy px-4 py-3 shadow-xl ring-1 ring-white/10 transition-colors hover:bg-claimondo-shield focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-claimondo-light-blue"
        >
          <Image
            src="/brand/unfallguide-cover.jpg"
            alt=""
            width={760}
            height={1075}
            className="w-10 shrink-0 rounded-ios-sm shadow-md ring-1 ring-white/15"
          />
          <span className="min-w-0">
            <span className="block text-xs font-bold uppercase tracking-[0.16em] text-claimondo-light-blue">
              {t('kopf.eyebrow')}
            </span>
            <span className="mt-0.5 block text-sm font-semibold leading-snug text-white">
              {tf('knopf')}
            </span>
          </span>
        </Link>
      </aside>
    </GuideSiegelKarteHuelle>
  )
}
