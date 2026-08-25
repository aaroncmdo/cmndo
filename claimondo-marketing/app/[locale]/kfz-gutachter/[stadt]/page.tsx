import { localeAlternates, localeOpenGraph } from '@/lib/seo/alternates'
import { titelMitZusatz } from '@/lib/seo/title'
import { stadtMetaDescription } from '@/lib/kfz-gutachter/meta-description'
import { getUnfallhotspots, hotspotOrt, hotspotSatz } from '@/lib/kfz-gutachter/unfallhotspots'
import { getVerkehrsmengen, zaehlstelleSatz } from '@/lib/kfz-gutachter/verkehrsmengen'
import { Fragment } from 'react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import Link from 'next/link'
import Image from 'next/image'
import {
  Phone, ChevronRight, MessageCircle, MapPin,
} from 'lucide-react'
import { SERVICE_REALITY_BULLETS } from '@/lib/brand/service-pitch'
import { LandingTopbar } from '@/components/landing/LandingTopbar'
import { NaechsterTerminHinweis } from '@/components/gutachter-finden/NaechsterTerminHinweis'
import { WerkstattAbdeckungHinweis } from '@/components/gutachter-finden/WerkstattAbdeckungHinweis'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { StickyCallBar } from '@/components/landing/StickyCallBar'
import { AnswerCapsule } from '@/components/landing/AnswerCapsule'
import { FounderSection } from '@/components/landing/FounderSection'
import { PortalMockupSection } from '@/components/landing/sections/PortalMockupSection'
import { TrustStripSection } from '@/components/landing/sections/TrustStripSection'
import { BghAuthorityGrid } from '@/components/landing/sections/BghAuthorityGrid'
import { TrackingHooks } from '@/components/marketing/TrackingHooks'
import {
  serviceSchema, breadcrumbsSchema, faqPageSchema, stadtLegalServiceSchema,
  jsonLdScript, SITE_URL, PHONE_DISPLAY, PHONE_E164, WHATSAPP_HREF,
} from '@/lib/seo/jsonld'
import {
  getStadtByName, getStadtBySlug,
  type LokaleFaq, type Stadt,
} from '@/lib/kfz-gutachter/staedte'
import { stadtLastModifiedISO } from '@/lib/kfz-gutachter/freshness'
import { getAmtsdaten, pkwJeTausendEinwohner } from '@/lib/kfz-gutachter/amtsdaten'
import { ladeLokalinhalt } from '@/lib/kfz-gutachter/lokalinhalt'
import { naechsteStaedte } from '@/lib/kfz-gutachter/nachbarstaedte'
import { finderHrefFuerStadt } from '@/lib/kfz-gutachter/finder-link'
import { StadtLeadFormClient } from './StadtLeadFormClient'

// /kfz-gutachter/[stadt] — Premium-Layout für alle SEO-Stadt-Routes.
// Eine Section-Komposition, viele Consumer (AGENTS.md §3 Redundanz-Check).
// Stadt-spezifisch: H1, Hero-Pill, JSON-LD LocalBusiness (geo, areaServed),
// Lokal-Block (Landgericht, Kammer, PLZ, BVSK), FAQ-Mix, Cross-City-Pills.
// Global: KPIs, BGH-Authority, Prozess, Einsatzgebiet, Bottom-CTA.
//
// i18n (Cookie-Switcher, Doc 48 Phase 1): sichtbare rahmende Sätze laufen über
// den Namespace `kfz_gutachter_stadt`. Eigennamen + Stadt-Daten (s.*), §/BGH/€/
// BVSK bleiben Code/ICU-Vars (Doc 48 §5.3). generateMetadata + alle JSON-LD-
// Argumente bleiben deutsch (SEO-kanonisch). Dual-Use-Konstanten (PROZESS_STEPS
// → HowTo-Schema, buildStadtFaq → FAQPage-Schema) behalten ihre deutsche Quelle;
// nur das sichtbare Rendering wird übersetzt (AGENTS.md §5).

// ISR (geo-freshness Phase 1, L1): Stadt-Pages stuendlich revalidieren, statt nur
export const revalidate = 3600
// Voll dynamisch: das [locale]-Layout nutzt headers() (Tracking) -> SSG nicht moeglich (DYNAMIC_SERVER_USAGE). Daher KEIN generateStaticParams; notFound() unten faengt unbekannte Slugs (404). On-demand-Render aus STAEDTE/MDX.

// AAR-UWG-Fix 14.05.2026: KPI-Werte + Aggregator-Methodik-Hinweis (UWG-konform)
// liegen seit der i18n-Migration im Namespace `kfz_gutachter_stadt.trust_kpis` /
// `.trust_methodik`. Konkrete Zahlen werden per Aaron-TODO aus Supabase nachgeschärft.

// Service-Pitch (Doc 44 §11): HERO_BULLETS = SERVICE_REALITY_BULLETS aus
// @/lib/brand/service-pitch — die Icons bleiben Code, die Labels werden i18n
// (hero_bullets, per Index parallel, AGENTS.md §5 / i18n-Lesson 3).
// Die SEO-H1 "Kfz-Gutachter {Stadt}" + Hyperlocal-Sections bleiben unveraendert.

// Dual-Use (AGENTS.md §5): deutsche Quelle speist das HowTo-Schema, das
// sichtbare Rendering läuft über `kfz_gutachter_stadt.prozess_steps`.
const PROZESS_STEPS = [
  { nr: 1, titel: 'Schaden melden',         text: '3 Felder, ohne Anmeldung. Online oder telefonisch.' },
  { nr: 2, titel: 'Berater meldet sich',    text: 'Persönlicher Rückruf in unter 15 Minuten.' },
  { nr: 3, titel: 'Kfz-Gutachter vor Ort',  text: 'In unter 48 Stunden besichtigt — meist am Folgetag.' },
  { nr: 4, titel: 'Anwalt aktiv',           text: 'Partnerkanzlei für Verkehrsrecht setzt Ansprüche durch — auch gegen Kürzungen.' },
  { nr: 5, titel: 'Geld auf dem Konto',     text: 'Ø 32 Tage. Live im Portal verfolgbar.' },
] as const

export async function generateMetadata({
  params,
}: {
  params: Promise<{ stadt: string }>
}): Promise<Metadata> {
  const { stadt } = await params
  const s = getStadtBySlug(stadt)
  if (!s) return { title: 'Stadt nicht gefunden' }

  // Title OHNE Brand-Suffix — das kam aus #5352 ("doppelter Brand im Title"),
  // weil das Layout den Marken-Namen bereits anhaengt. Nicht zurueckdrehen.
  //
  // "Unabhaengig & " ist am 18.08. entfallen (Aaron-Entscheidung): mit dem
  // Zusatz lagen ALLE 158 Stadt-Titel ueber 60 Zeichen (Median 72), also
  // jenseits dessen, was Google in der Anzeige zeigt. Die Aussage bleibt sonst
  // unveraendert: "unabhaengig" steht weiterhin in der Description und 7x im
  // Seitentext (auf /kfz-gutachter/koeln nachgezaehlt) — nur nicht in der H1,
  // die ist die Conversion-Headline "Unfall gehabt?".
  //
  // KORREKTUR 20.08.: hier stand, die Restlichen seien lange Ortsnamen, "die
  // sich nicht weiter kuerzen lassen". Der ORTSNAME nicht — der ZUSATZ schon.
  // Gemessen auf prod: 46 der 173 Stadtseiten (26,6 %) lagen ueber 60, alle
  // wegen langer Ortsnamen ("Ludwigshafen am Rhein", 21 Zeichen). Statt den
  // Zusatz fuer ALLE zu opfern oder ihn bei jedem Vierten abschneiden zu
  // lassen, waehlt `titelMitZusatz` je Stadt die laengste Fassung, die noch
  // vollstaendig angezeigt wird. Die Kernaussage "kostenfrei" bleibt damit
  // ueberall erhalten — nur "nach Unfall" faellt bei den langen Namen weg.
  const title = titelMitZusatz(`Kfz-Gutachter ${s.name}`, [
    ' — kostenfrei nach Unfall',
    ' — kostenfrei',
    '',
  ])

  // Social-Vorschauen (Facebook/LinkedIn/WhatsApp) zeigen deutlich mehr Zeichen
  // als die Suchergebnisliste — dort bleibt die vollstaendige Aussage stehen,
  // auch bei langen Ortsnamen. Gleiches Muster wie in /wissen/[slug].
  const ogTitle = `Kfz-Gutachter ${s.name} — kostenfrei nach Unfall`

  // Die Beschreibung war bis 18.08.2026 fuer JEDE Stadt derselbe Satz mit
  // ausgetauschtem Ortsnamen — bei 173 Seiten ein Duplicate-Signal. Sie zog
  // ausserdem die freigegebene Ortstiefe nicht heran: die Seite zeigte
  // Stadtbezirke, die Suchergebnis-Vorschau nicht.
  //
  // Dieselbe Vorrang-Regel wie im Seiten-Render unten (Hub-Daten schlagen DB),
  // damit Vorschau und Seite denselben Ort beschreiben. `ladeLokalinhalt` ist
  // per React-cache dedupliziert — der Render unten loest keinen zweiten
  // Supabase-Call aus.
  const tiefeFuerMeta = s.hyperlocal ?? (await ladeLokalinhalt(s.slug))
  const description = stadtMetaDescription(s, tiefeFuerMeta)

  return {
    title,
    description,
    keywords: [
      `Kfz-Gutachter ${s.name}`,
      `Kfz-Sachverständiger ${s.name}`,
      `Unfallgutachter ${s.name}`,
      `Schadensgutachten ${s.name}`,
      `unabhängiger Gutachter ${s.name}`,
      'zertifizierter Kfz-Gutachter', 'Wertminderung berechnen',
      '§249 BGB', 'BVSK-Honorartabelle',
    ],
    alternates: await localeAlternates(`/kfz-gutachter/${s.slug}`),
    openGraph: {
      type: 'website',
      siteName: 'Claimondo',
      ...(await localeOpenGraph(`/kfz-gutachter/${s.slug}`)),
      title: ogTitle,
      description,
      images: [{ url: '/marketing-landing-koeln/hero-woman.png', width: 1200, height: 630, alt: `Kfz-Gutachter ${s.name}` }],
    },
  }
}

function buildStadtFaq(s: Stadt, lokaleFaqs: LokaleFaq[] = []) {
  const base = [
    {
      frage: `Was kostet ein Kfz-Gutachter ${s.h1Anker}?`,
      antwort: `Bei einem unverschuldeten Unfall ${s.h1Anker} mit Schaden über 750 € zahlen Sie 0 €. Die gegnerische Haftpflichtversicherung trägt nach §249 BGB alle Kosten. Honorare nach BVSK-Honorartabelle liegen in ${s.name} zwischen ${s.bvskHonorarSpanne}.`,
    },
    {
      frage: `Wo finde ich einen unabhängigen Kfz-Sachverständigen ${s.h1Anker}?`,
      antwort: `Claimondo vermittelt ${s.h1Anker} an zertifizierte Partner-Gutachter mit lokaler Expertise. Sie melden den Schaden online (5 Min, ohne Anmeldung) — wir matchen Sie mit dem nächstgelegenen freien Sachverständigen aus dem Partner-Netzwerk. Termin vor Ort in unter 48 Stunden. Verfügbar in ${s.name} (PLZ ${s.plzPrefix}) und im umliegenden ${s.bundesland}.`,
    },
    {
      frage: `Welches Gericht ist bei Streitigkeiten zuständig ${s.h1Anker}?`,
      antwort: `Für Schadensregulierungs-Streitigkeiten ${s.h1Anker} ist bis 5.000 € Streitwert das ${s.lokal.amtsgericht} erstinstanzlich zuständig, darüber das ${s.lokal.landgericht} (§ 23 Nr. 1 und § 71 Abs. 1 GVG). Die meisten Kürzungsstreitigkeiten — gekürzte Gutachterkosten, UPE-Aufschläge, Wertminderung, Nutzungsausfall — liegen unter dieser Grenze und werden daher vor dem Amtsgericht geführt. Kürzt eine Versicherung unrechtmäßig oder geht sie gerichtlich gegen ein Gutachten vor, klagt unsere Partnerkanzlei für Verkehrsrecht vor dem jeweils zuständigen Gericht. Bei Erfolg trägt die Gegenseite Anwalts- und Prozesskosten. Sie zahlen 0 € (nach §249 BGB, vorbehaltlich Anerkenntnis durch den gegnerischen Haftpflichtversicherer).`,
    },
    {
      frage: 'Kann ich den Gutachter selbst wählen?',
      antwort: 'Ja. Als unverschuldet Geschädigter bestimmen Sie den Sachverständigen — nicht die gegnerische Versicherung. Deren Angebot, einen eigenen Prüfer zu schicken, müssen Sie nicht annehmen: Ein von der Gegenseite beauftragter Gutachter arbeitet nicht in Ihrem Interesse.',
    },
    {
      frage: 'Reicht ein Kostenvoranschlag der Werkstatt?',
      antwort: 'Unter etwa 750 € Schaden ja — das ist der Bagatellbereich. Darüber nicht: Ein Kostenvoranschlag beziffert allein die Reparatur. Wertminderung, Nutzungsausfall, Wiederbeschaffungs- und Restwert fehlen darin, und genau diese Positionen machen einen erheblichen Teil der Entschädigung aus.',
    },
    {
      frage: 'Was passiert, wenn die Versicherung das Gutachten kürzt?',
      antwort: 'Versicherer wie HUK, LVM und AXA kürzen über Prüfdienstleister (ControlExpert, K-Expert, DEKRA) typischerweise UPE-Aufschläge, Verbringung und Wertminderung. Der BGH stützt jedoch in den Leitentscheidungen VI ZR 65/18, VI ZR 174/24 und VI ZR 38/22 ff. die Geschädigten. Unsere Partnerkanzlei holt die Kürzungen vollständig zurück.',
    },
    {
      frage: 'Was ist eine Sicherungsabtretung — und ist sie sicher?',
      antwort: 'Bei der Sicherungsabtretung gemäß §398 BGB überträgt der Geschädigte den Anspruch gegen die gegnerische Versicherung in Höhe des Gutachterhonorars an den Sachverständigen. Sie unterzeichnen einmal — der Gutachter rechnet anschließend direkt mit der Versicherung ab. Sie zahlen keinen Cent vor. Branchen-Standard.',
    },
    {
      frage: 'Wie viel Wertminderung bekomme ich nach einem Unfall?',
      antwort: 'Die merkantile Wertminderung liegt nach Sanden/Danner-Formel zwischen 500 € und 2.500 €. Faustregel: 1. Jahr 25 %, 2. Jahr 20 %, 3. Jahr 15 %, 4. Jahr 10 % der Reparaturkosten. Keine starre Altersgrenze laut BGH VI ZR 357/03.',
    },
    {
      frage: 'Bekomme ich nach dem Unfall einen Mietwagen?',
      antwort: 'Bei unverschuldetem Unfall ja — die gegnerische Haftpflicht trägt nach § 249 BGB einen Mietwagen vergleichbarer Klasse für die Dauer der Reparatur oder Wiederbeschaffung. Alternativ zahlt sie Nutzungsausfall in bar, gestaffelt nach Fahrzeuggruppe und Ausfalltagen. Wer wenig fährt, fährt mit der Barzahlung häufig besser.',
    },
    {
      frage: 'Darf ich meine Werkstatt frei wählen?',
      antwort: 'Ja, die freie Werkstattwahl bleibt bestehen. Die gegnerische Versicherung darf Sie nicht auf eine Partnerwerkstatt verweisen, wenn Sie in einer markengebundenen Fachwerkstatt reparieren lassen wollen — das gilt besonders bei jungen oder scheckheftgepflegten Fahrzeugen.',
    },
    {
      frage: 'Was bedeutet die 130%-Regel beim Totalschaden?',
      antwort: 'Die 130%-Regel (BGH VI ZR 67/91) erlaubt Reparaturkosten bis 130 % des Wiederbeschaffungswertes — sofern fachgerecht repariert nach Gutachten und das Fahrzeug 6 Monate weitergenutzt wird.',
    },
  ]
  // Lokale FAQ anhängen — fließen in Akkordeon + FAQPage-Schema. Quelle sind
  // entweder die gepflegten Hub-Daten oder eine freigegebene stadt_lokalinhalte-
  // Zeile; der Aufrufer hat das bereits aufgelöst.
  return lokaleFaqs.length > 0 ? [...base, ...lokaleFaqs] : base
}

export default async function KfzGutachterStadtPage({
  params,
}: {
  params: Promise<{ stadt: string }>
}) {
  const { stadt } = await params
  const s = getStadtBySlug(stadt)
  if (!s) notFound()

  // Redaktionell freigegebene Ortstiefe aus stadt_lokalinhalte. Nur fuer Staedte
  // OHNE gepflegte Hub-Daten: die sieben Hubs sind handverifiziert und haben
  // Vorrang — ein generierter Inhalt soll sie nicht ueberschreiben oder ergaenzen,
  // weil sonst nicht mehr erkennbar waere, welcher Satz woher stammt.
  // `null` ist der Normalfall (Tabelle leer) -> die Seite bleibt wie bisher.
  const freigegeben = s.hyperlocal ? null : await ladeLokalinhalt(s.slug)

  // Die Sektionen unten haengen ab hier an den DATEN, nicht an der Quelle.
  const stadtbezirke = s.hyperlocal?.stadtbezirke ?? freigegeben?.stadtbezirke ?? []
  const hauptachsen = s.hyperlocal?.hauptachsen ?? freigegeben?.hauptachsen ?? null
  const unfallHotspots = s.hyperlocal?.unfallHotspots ?? freigegeben?.unfallHotspots ?? []
  const heroAnker = s.hyperlocal?.heroAnker ?? freigegeben?.heroAnker
  const topografieAnker = s.hyperlocal?.topografieAnker ?? freigegeben?.topografieAnker
  const lokaleFaqs = s.hyperlocal?.lokaleFaqs ?? freigegeben?.lokaleFaqs ?? []

  // Deutsche Quelle fürs FAQPage-Schema (Dual-Use, AGENTS.md §5).
  const faqs = buildStadtFaq(s, lokaleFaqs)

  // areaServed: bei Hub-Cities die angrenzenden Orte als City-Array + die vollständige,
  // verifizierte PLZ-Liste als Text-Einträge (Doc 38 §9.2 / P6 — stärkt Local-SEO/GEO
  // ohne neue Seiten). Wo keine plzListe recherchiert ist, bleibt es bei der City. Sonst
  // die einzelne Stadt.
  const cityPlace = {
    '@type': 'City',
    name: s.name,
    containedInPlace: { '@type': 'AdministrativeArea', name: s.bundesland },
  }
  const areaServed = s.hyperlocal
    ? [
        cityPlace,
        ...s.hyperlocal.angrenzendeOrte.map((ort) => ({ '@type': 'City', name: ort })),
        ...(s.hyperlocal.plzListe ?? []),
      ]
    : cityPlace

  // Cross-City: die 6 geografisch passendsten Nachbarstädte (halb Nahbereich,
  // halb nächste Großstädte — Regel + Begründung in nachbar-auswahl.mjs).
  // Vorher: `filter(bundesland).slice(0, 6)` = die ersten sechs ARRAY-Einträge
  // des Bundeslands. Da STAEDTE mit NRW beginnt, verlinkten Berlin und Hamburg
  // Aachen/Bonn/Dortmund/Düsseldorf/Essen/Köln — 400–500 km entfernt.
  const crossCity = naechsteStaedte(s.slug, 6)

  // Das Einsatzgebiet-Bild ist eine NRW-Karte — nur dort zeigt es die Region,
  // um die es auf der Seite geht (P3-A5).
  const zeigtNrwKarte = s.bundesland === 'Nordrhein-Westfalen'

  // Amtliche Unfallhäufungen (Unfallatlas). Statisch aus dem Repo, kein
  // DB-Zugriff und keine Freigabe nötig — deshalb für 160 von 173 Städten
  // sofort da, während der KI-Lokalinhalt mit ~2 Städten pro Nacht wächst.
  // `null` für die 13 Städte ohne ausreichende Häufung: lieber keine Sektion
  // als eine mit erfundener Substanz.
  const unfalldaten = getUnfallhotspots(s.slug)
  // Verkehrsmenge (BASt) — der Kontext zu den Unfallzahlen. Wird innerhalb der
  // Unfall-Sektion gerendert, direkt unter dem Hinweis, dass die Unfalldaten
  // die Verkehrsmenge NICHT kennen.
  const verkehr = getVerkehrsmengen(s.slug)
  // Gemessen 21.08.: 151 Städte haben beides, 11 nur Unfalldaten, 11 nur
  // Verkehrsmengen — und KEINE hat gar nichts. Zusammen decken die zwei
  // amtlichen Quellen also alle 173 Stadtseiten ab.
  const hatUnfalldaten = Boolean(unfalldaten && unfalldaten.hotspots.length > 0)
  const hatVerkehr = Boolean(verkehr && verkehr.zaehlstellen.length > 0)

  // i18n: async Server-Page (await params) → getTranslations, NICHT useTranslations
  // (i18n-Lesson 7). `ort` = h1Anker ("in Köln") bleibt deutsch (Eigenname, Doc 48 §5.3).
  const t = await getTranslations('kfz_gutachter_stadt')
  // Fuer die Zahlformatierung in Sektion 4f: 36.636 (de) vs 36,636 (en).
  // Hartcodiertes 'de-DE' waere auf fuenf von sechs Sprachversionen falsch.
  const locale = await getLocale()
  const ort = s.h1Anker

  const heroBullets = t.raw('hero_bullets') as string[]
  const trustKpis = t.raw('trust_kpis') as Array<{ wert: string; label: string }>
  const prozessSteps = t.raw('prozess_steps') as Array<{ titel: string; text: string }>

  // Sichtbare FAQ-Liste: 7 Basis-FAQs übersetzt (Stadt-Daten als ICU-Vars, §/BGH/€
  // wörtlich), die hyperlocal.lokaleFaqs (reine Stadt-Daten) bleiben deutsch
  // (Doc 48 §5.3 / §7). Das deutsche buildStadtFaq(s) oben speist das Schema (§5).
  const faqsVisible = [
    { frage: t('faq_kosten_frage', { ort }), antwort: t('faq_kosten_antwort', { ort, stadt: s.name, bvskSpanne: s.bvskHonorarSpanne }) },
    { frage: t('faq_finden_frage', { ort }), antwort: t('faq_finden_antwort', { ort, stadt: s.name, plz: s.plzPrefix, bundesland: s.bundesland }) },
    { frage: t('faq_gericht_frage', { ort }), antwort: t('faq_gericht_antwort', { ort, amtsgericht: s.lokal.amtsgericht, landgericht: s.lokal.landgericht }) },
    { frage: t('faq_gutachterwahl_frage'), antwort: t('faq_gutachterwahl_antwort') },
    { frage: t('faq_kva_frage'), antwort: t('faq_kva_antwort') },
    { frage: t('faq_kuerzung_frage'), antwort: t('faq_kuerzung_antwort') },
    { frage: t('faq_sa_frage'), antwort: t('faq_sa_antwort') },
    { frage: t('faq_wertminderung_frage'), antwort: t('faq_wertminderung_antwort') },
    { frage: t('faq_mietwagen_frage'), antwort: t('faq_mietwagen_antwort') },
    { frage: t('faq_werkstattwahl_frage'), antwort: t('faq_werkstattwahl_antwort') },
    { frage: t('faq_130_frage'), antwort: t('faq_130_antwort') },
    // Dieselbe Quelle wie das FAQPage-Schema oben — sonst stuende eine
    // freigegebene FAQ im strukturierten Datensatz, aber nicht im Akkordeon.
    ...lokaleFaqs,
  ]

  return (
    <div className="min-h-screen bg-claimondo-bg">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript([
          stadtLegalServiceSchema(s, areaServed),
          serviceSchema({
            name: `Kfz-Gutachter-Vermittlung ${s.name}`,
            description: `Vermittlung an unabhängige zertifizierte Kfz-Sachverständige ${s.h1Anker}. Partner-Gutachter aus dem Netzwerk, Termin <48 h, 0 € für unverschuldet Geschädigte nach §249 BGB.`,
            url: `${SITE_URL}/kfz-gutachter/${s.slug}`,
          }),
          {
            '@context': 'https://schema.org',
            '@type': 'HowTo',
            name: `Schaden ${s.h1Anker} melden und Geld erhalten`,
            description: `In fünf Schritten vom unverschuldeten Unfall ${s.h1Anker} zur Auszahlung — durchschnittlich 32 Tage, ohne Eigenanteil.`,
            totalTime: 'P32D',
            step: PROZESS_STEPS.map((p) => ({ '@type': 'HowToStep', position: p.nr, name: p.titel, text: p.text })),
          },
          // dateModified aus derselben Quelle wie die Sitemap. Ohne das trug
          // KEINE der ~160 Stadt-Seiten ein Aktualitaets-Signal — GEO-Baseline
          // 18.08.2026, Befund B2.
          faqPageSchema(faqs, {
            // Seit 19.08. das SPAETERE von gepflegtem Eintrag und tatsaechlicher
            // Veroeffentlichung des Ortsinhalts. Die Map allein wird von Hand
            // gepflegt — seit der Cron taeglich zwei Staedte aendert, traegt das
            // nicht mehr: gemessen meldeten 169 von 182 Stadtseiten den
            // Mai-Default, darunter Staedte mit Inhalt VON DEMSELBEN TAG.
            dateModified: stadtLastModifiedISO(s.slug, freigegeben?.veroeffentlichtAm),
            url: `/kfz-gutachter/${s.slug}`,
          }),
          breadcrumbsSchema([
            { name: 'Startseite', url: '/' },
            { name: 'Kfz-Gutachter', url: '/kfz-gutachter' },
            { name: s.name, url: `/kfz-gutachter/${s.slug}` },
          ]),
        ])}
      />

      {/* finderHref mit Ortsbezug: Topbar, Sticky-Bar und Footer tragen denselben
          Finder-Link wie der Bottom-CTA. Die Prop existiert bereits (der
          Makler-Hub nutzt sie fuer die Attribution) — die Stadtseite hat sie
          bisher nur nicht gesetzt und schickte auf allen vier Wegen zum
          NRW-Default statt in die Stadt, aus der der Klick kommt. */}
      <LandingTopbar authenticatedUser={null} finderHref={finderHrefFuerStadt(s)} />

      {/* 1 — Hero Image Band */}
      <section className="relative h-[280px] overflow-hidden sm:h-[360px]">
        <Image
          src="/marketing-landing-koeln/hero-woman.png"
          alt={`Unfallgeschädigte ruft Kfz-Gutachter ${s.h1Anker} nach unverschuldetem Verkehrsunfall an`}
          fill priority sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-claimondo-navy/85 via-claimondo-navy/55 to-transparent" aria-hidden />
        <div className="relative mx-auto flex h-full max-w-7xl items-center px-5">
          <div className="max-w-xl text-white">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-claimondo-light-blue">
              {t('hero_band_eyebrow', { ort })}
            </p>
            <p className="mt-3 text-2xl font-bold leading-tight sm:text-3xl">
              {t.rich('hero_band_quote', {
                hl: (chunks) => <span className="text-claimondo-light-blue">{chunks}</span>,
              })}
            </p>
          </div>
        </div>
      </section>

      {/* 2 — Hero + Lead-Form */}
      <section className="relative isolate overflow-hidden bg-claimondo-navy text-white" aria-labelledby="hero-heading">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background: [
              'radial-gradient(circle at 15% 20%, rgba(69,115,162,0.30), transparent 55%)',
              'radial-gradient(circle at 85% 75%, rgba(123,163,204,0.18), transparent 50%)',
            ].join(', '),
          }}
        />
        <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-5 py-12 md:grid-cols-[1.05fr_0.95fr] md:py-20">
          <div>
            <div className="flex items-center gap-2 text-xs text-claimondo-light-blue">
              <Link href="/kfz-gutachter" className="hover:text-white">Kfz-Gutachter</Link>
              <ChevronRight className="h-3 w-3" aria-hidden />
              <span>{s.name}</span>
            </div>
            <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-3.5 py-1.5 text-xs font-semibold text-claimondo-light-blue backdrop-blur-md">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-70" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              {t('hero_badge', { ort })}
            </div>
            <h1 id="hero-heading" className="mt-5 text-balance text-4xl font-bold leading-[1.04] tracking-[-0.02em] sm:text-5xl md:text-[3.4rem]">
              {t('hero_h1_line1')}<br />
              <span className="text-claimondo-light-blue">{t('hero_h1_city', { ort })}</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/80">
              {t('hero_subheadline')}
            </p>
            {heroAnker && (
              <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/65">
                {heroAnker}
              </p>
            )}
            <ul className="mt-7 grid grid-cols-1 gap-x-4 gap-y-3 text-sm text-white/80 sm:grid-cols-2">
              {SERVICE_REALITY_BULLETS.map(({ Icon }, i) => (
                <li key={i} className="flex items-start gap-2">
                  <Icon className="mt-0.5 h-4 w-4 flex-shrink-0 text-claimondo-light-blue" aria-hidden />
                  {heroBullets[i]}
                </li>
              ))}
            </ul>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href={`tel:${PHONE_E164}`}
                className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-4 text-base font-bold text-claimondo-navy shadow-claimondo-md transition-all hover:bg-claimondo-light-blue/90"
                data-tracking={`call-${s.slug}-hero`}
              >
                <Phone className="h-5 w-5 text-claimondo-ondo" aria-hidden />
                {t('hero_cta_call')}
              </a>
              <a
                href={WHATSAPP_HREF}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/5 px-6 py-3.5 text-sm font-semibold text-white/90 backdrop-blur-sm transition-all hover:bg-white/10"
                data-tracking={`whatsapp-${s.slug}-hero`}
              >
                <MessageCircle className="h-4 w-4" aria-hidden />
                WhatsApp
              </a>
            </div>
            <p className="mt-5 text-xs text-white/55">
              {t('hero_trust_line')}
            </p>
          </div>
          <StadtLeadFormClient stadtName={s.name} stadtSlug={s.slug} />
        </div>
      </section>

      {/* 3 — Trust-Strip */}
      <TrustStripSection kpis={trustKpis} methodikNote={t('trust_methodik')} />

      {/* 3b — Naechster buchbarer Termin (server-gerendert = fuer Crawler UND LLMs lesbar).
          Die Buchbarkeit stand bis 24.08.2026 NUR in der JSON-API und im cross-origin-
          iframe des Finders — ein browsendes LLM sah auf dieser Seite null Termine und
          konnte deshalb keinen nennen. Rendert `null`, wenn gerade nichts frei ist. */}
      <section className="bg-claimondo-bg pt-10" aria-label="Terminverfügbarkeit">
        <div className="mx-auto max-w-3xl px-5">
          <NaechsterTerminHinweis stadt={s.name} />
          {/* Der ZWEITE Weg. Nach dem Gutachten braucht der Kunde eine Werkstatt; bei
              selbstverschuldetem Schaden ist sie sogar der erste Schritt. Bis 25.08.2026
              stand davon nichts im HTML — /werkstatt-finden liefert 132 KB ohne eine
              einzige konkrete Angabe (alles im iframe). Bewusst OHNE Namen, Adressen und
              Rufnummern: die gibt die oeffentliche API nicht aus, damit der Lead ueber
              uns laeuft. Rendert `null`, wenn dort keine Partner sitzen. */}
          <WerkstattAbdeckungHinweis stadt={s.name} />
        </div>
      </section>

      {/* 4 — Lokal-Block (stadt-spezifische Anker) */}
      <section className="bg-claimondo-bg py-16 sm:py-20" aria-labelledby="lokal-heading">
        <div className="mx-auto max-w-3xl px-5">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-claimondo-ondo">
              {t('lokal_eyebrow')}
            </p>
            <h2 id="lokal-heading" className="mt-3 text-3xl font-extrabold text-claimondo-navy sm:text-4xl">
              {t('lokal_h2', { ort })}
            </h2>
          </div>
          <div className="mt-8">
            <AnswerCapsule quelle="§249 BGB · BVSK">
              {t.rich('lokal_capsule', {
                strong: (chunks) => <strong>{chunks}</strong>,
                landgericht: s.lokal.landgericht,
                kammer: s.lokal.kammer,
                plz: s.plzPrefix,
                bevoelkerung: s.bevoelkerung,
                bundesland: s.bundesland,
                bvskSpanne: s.bvskHonorarSpanne,
              })}
            </AnswerCapsule>
          </div>
        </div>
      </section>

      {/* 4b — Hyperlokal: Stadtbezirke + Einsatzgebiet. Quelle: gepflegte Hub-Daten
          (Doc 38 §6.2) ODER eine freigegebene stadt_lokalinhalte-Zeile (P3-B1).
          Der Guard haengt an den DATEN, nicht an der Quelle. */}
      {stadtbezirke.length > 0 && (
        <section className="bg-white py-16 sm:py-20" aria-labelledby="bezirke-stadt-heading">
          <div className="mx-auto max-w-5xl px-5">
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-claimondo-ondo">
                {t('bezirke_eyebrow', { stadt: s.name })}
              </p>
              <h2 id="bezirke-stadt-heading" className="mt-3 text-3xl font-extrabold text-claimondo-navy sm:text-4xl">
                {t('bezirke_h2', { anzahlBezirke: stadtbezirke.length, ort })}
              </h2>
            </div>
            <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {stadtbezirke.map((b) => (
                <div key={b.name} className="rounded-ios-md border border-claimondo-border bg-claimondo-bg p-4">
                  <p className="text-sm font-bold text-claimondo-navy">{b.name}</p>
                  <p className="mt-1 text-xs leading-relaxed text-claimondo-shield">
                    {b.ortsteile.join(' · ')}
                  </p>
                </div>
              ))}
            </div>
            {/* Umland-Satz nur bei gepflegten Hub-Daten: `angrenzendeOrte` ist
                handrecherchiert und hat in freigegebenen Zeilen kein Pendant.
                Ohne diesen Guard stuende dort "Wir kommen ebenso nach  — meist
                schon am Folgetag". */}
            {s.hyperlocal && (
            <div className="mt-8 rounded-ios-md border border-claimondo-border bg-claimondo-bg p-5">
              <p className="text-sm leading-relaxed text-claimondo-shield">
                {t.rich('bezirke_region', {
                  strong: (chunks) => <strong className="text-claimondo-navy">{chunks}</strong>,
                  // Orte mit eigener Stadtseite werden zum Link, der Rest bleibt
                  // Text — ein Link auf einen Ort ohne Seite waere eine 404.
                  // Das schliesst zugleich die sieben Hub->Spoke-Kanten, die die
                  // Distanzauswahl nicht zieht (Duesseldorf->Langenfeld/Dormagen,
                  // Wuppertal->Velbert/Haan, Bonn->Siegburg/Hennef/Meckenheim).
                  // Tag statt Wert-Platzhalter: t.rich nimmt fuer Werte nur
                  // Primitives, ReactNodes gehen nur ueber eine Tag-Funktion.
                  // Deshalb steht in allen 6 Locales <orte></orte> statt {orte}.
                  orte: () => (
                    <>
                      {s.hyperlocal!.angrenzendeOrte.map((ort, i) => {
                        const ziel = getStadtByName(ort)
                        return (
                          <Fragment key={ort}>
                            {i > 0 && ', '}
                            {ziel ? (
                              <Link
                                href={`/kfz-gutachter/${ziel.slug}`}
                                className="font-semibold text-claimondo-ondo underline decoration-claimondo-ondo/40 underline-offset-2 hover:text-claimondo-navy hover:decoration-claimondo-navy"
                              >
                                {ort}
                              </Link>
                            ) : (
                              ort
                            )}
                          </Fragment>
                        )
                      })}
                    </>
                  ),
                })}
              </p>
            </div>
            )}
            {topografieAnker && (
              <p className="mt-6 text-center text-sm italic leading-relaxed text-claimondo-shield">
                {topografieAnker}
              </p>
            )}
          </div>
        </section>
      )}

      {/* 4c — Hyperlokal: Unfallschwerpunkte + Hauptachsen, quellenbelegt (Doc 38 §6.3).
          Wie 4b: Quelle sind gepflegte Hub-Daten ODER eine freigegebene Zeile. */}
      {unfallHotspots.length > 0 && hauptachsen && (
        <section className="bg-claimondo-bg py-16 sm:py-20" aria-labelledby="hotspots-stadt-heading">
          <div className="mx-auto max-w-4xl px-5">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-claimondo-ondo">
                {t('hotspots_eyebrow')}
              </p>
              <h2 id="hotspots-stadt-heading" className="mt-3 text-3xl font-extrabold text-claimondo-navy sm:text-4xl">
                {t('hotspots_h2', { ort })}
              </h2>
              {s.hyperlocal?.unfallzahlStadt && (
                <p className="mt-3 text-sm text-claimondo-shield">
                  {t('hotspots_stadtweit', { jahr: String(s.hyperlocal.unfallzahlStadt.jahr), text: s.hyperlocal.unfallzahlStadt.text })}
                </p>
              )}
            </div>
            <ul className="mt-8 space-y-3">
              {unfallHotspots.map((h) => (
                // Doc 41 §8: Hotspot-Cards verlinken auf die Pillar-B-Cornerstone.
                <li key={h.ort}>
                  <Link
                    href="/unfall-was-tun-als-geschaedigter"
                    className="group block rounded-ios-md border border-claimondo-border bg-white p-4 transition-all hover:-translate-y-0.5 hover:border-claimondo-ondo hover:shadow-claimondo-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-claimondo-ondo"
                    aria-label={t('hotspots_card_aria', { hotspot: h.ort, ort })}
                    data-tracking={`card-hotspot-${s.slug}-${h.ort.split(' ')[0].toLowerCase()}`}
                  >
                    <p className="text-sm font-bold text-claimondo-navy group-hover:text-claimondo-ondo">
                      {h.ort}
                      {h.bezirk && <span className="font-normal text-claimondo-shield"> · {h.bezirk}</span>}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-claimondo-shield">{h.beschreibung}</p>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-6 rounded-ios-md border border-claimondo-border bg-white p-5 text-sm leading-relaxed text-claimondo-shield">
              <p>
                {t.rich('hotspots_achsen', {
                  strong: (chunks) => <strong className="text-claimondo-navy">{chunks}</strong>,
                  autobahnen: hauptachsen.autobahnen.join(', '),
                  bundesstrassen: hauptachsen.bundesstrassen.join(', '),
                })}
              </p>
              {hauptachsen.knoten.length > 0 && (
                <p className="mt-1">{t('hotspots_knoten', { knoten: hauptachsen.knoten.join(' · ') })}</p>
              )}
              {hauptachsen.aktuelleBaustelle && (
                <p className="mt-1">
                  {t.rich('hotspots_baustelle', {
                    strong: (chunks) => <strong className="text-claimondo-navy">{chunks}</strong>,
                    baustelle: hauptachsen.aktuelleBaustelle,
                  })}
                </p>
              )}
            </div>
            <p className="mt-4 text-sm leading-relaxed text-claimondo-shield">
              {t('hotspots_outro')}
            </p>
            {/* Quellenangabe. Gepflegte Hub-Daten tragen EINE Sammelquelle,
                freigegebene Zeilen eine Quelle JE Hotspot (Quellenzwang aus
                src/lib/lokalinhalt/gate.ts). Beide werden gerendert — ohne
                sichtbaren Beleg waere der Quellenzwang eine interne Formalie,
                die dem Leser nichts nuetzt. */}
            {s.hyperlocal ? (
              <p className="mt-3 text-xs text-claimondo-shield/75">
                {t('hotspots_quelle', { quelle: s.hyperlocal.hotspotQuelle })}
              </p>
            ) : (
              <ul className="mt-3 space-y-1 text-xs text-claimondo-shield/75">
                {(freigegeben?.unfallHotspots ?? []).map((h) => (
                  <li key={`quelle-${h.ort}`}>
                    {h.ort}:{' '}
                    <a
                      href={h.quelle}
                      target="_blank"
                      rel="nofollow noopener noreferrer"
                      className="underline hover:text-claimondo-navy"
                    >
                      {new URL(h.quelle).hostname.replace(/^www\./, '')}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {/* 4c-2 — Amtliche Unfallhäufungen (Unfallatlas der Statistischen Ämter).
          BEWUSST EIGENE SEKTION, unabhängig von 4c: die Hotspots dort stammen
          aus gepflegten Hub-Daten oder freigegebenem KI-Inhalt und existieren
          für die wenigsten Städte. Diese hier gilt für 160 von 173 Städten
          sofort — sie wartet auf keine Freigabe und kostet kein Token.
          Sie ist damit für die meisten Seiten der erste echte Ortsinhalt. */}
      {(hatUnfalldaten || hatVerkehr) && (
        <section className="border-t border-claimondo-border bg-claimondo-bg py-14 sm:py-20">
          <div className="mx-auto max-w-4xl px-4 sm:px-6">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-claimondo-ondo">
              {t('amtlich_eyebrow')}
            </p>
            <h2 className="mt-2 text-2xl font-bold tracking-[-.02em] text-claimondo-navy sm:text-3xl">
              {t('amtlich_h2', { ort: s.name })}
            </h2>

            {/* Beide Blöcke einzeln bedingt: 11 Städte haben NUR Unfalldaten,
                11 andere NUR Verkehrsmengen — zusammen aber deckt eine der
                beiden Quellen alle 173 Städte ab. Hinge der Verkehr in der
                Unfall-Bedingung, sähen 11 Städte nichts, obwohl Daten da sind. */}
            {/* `unfalldaten &&` steht hier zusätzlich zum Flag, damit TypeScript
                selbst narrowt. Ein `!` wäre ein Versprechen über eine Bedingung,
                die woanders steht — und bräche still, sobald das Flag anders
                berechnet wird. */}
            {unfalldaten && hatUnfalldaten && (
              <>
                <p className="mt-4 text-base leading-relaxed text-claimondo-shield">
                  {t('amtlich_intro', { ort: s.name, zeitraum: unfalldaten.zeitraum })}
                </p>

                <ul className="mt-6 space-y-3">
                  {unfalldaten.hotspots.map((h) => (
                    <li
                      key={`${h.lat},${h.lng}`}
                      className="rounded-ios-md border border-claimondo-border bg-white p-5"
                    >
                      <p className="text-sm font-bold text-claimondo-navy">{hotspotOrt(h)}</p>
                      <p className="mt-1 text-sm leading-relaxed text-claimondo-shield">
                        {hotspotSatz(h, unfalldaten.zeitraum)}
                      </p>
                    </li>
                  ))}
                </ul>

                {/* Der Hinweis ist nicht Zierde: die Daten nennen keine Ursachen
                    und keine Verkehrsmenge. Ohne diesen Satz liest sich eine hohe
                    Zahl als Werturteil über die Stelle — genau die
                    Tatsachenbehauptung, die der Quellenzwang verhindern soll. */}
                <p className="mt-5 text-sm leading-relaxed text-claimondo-shield/85">
                  {t('amtlich_hinweis')}
                </p>
                <p className="mt-3 text-xs text-claimondo-shield/75">
                  {t.rich('amtlich_quelle', {
                    lizenz: unfalldaten.lizenz,
                    quelle: new URL(unfalldaten.quelle).hostname.replace(/^www\./, ''),
                    // Tag-Syntax, nicht {platzhalter}: t.rich ersetzt <link>…</link>.
                    // Eine Funktion für einen Variablen-Platzhalter greift nicht.
                    link: (chunks) => (
                      <a
                        href={unfalldaten.quelle}
                        target="_blank"
                        rel="nofollow noopener noreferrer"
                        className="underline hover:text-claimondo-navy"
                      >
                        {chunks}
                      </a>
                    ),
                  })}
                </p>
              </>
            )}

            {/* Verkehrsmenge (BASt) — bewusst HIER und nicht als eigene Sektion:
                der Hinweis oben sagt, dass die Unfallzahlen die Verkehrsmenge
                NICHT kennen. Genau die steht jetzt direkt darunter. Getrennt
                platziert müsste der Leser die beiden Hälften selbst
                zusammensetzen. */}
            {hatVerkehr && verkehr && (
              <div className="mt-8 border-t border-claimondo-border pt-6">
                <h3 className="text-base font-bold text-claimondo-navy">{t('verkehr_h3')}</h3>
                <p className="mt-2 text-sm leading-relaxed text-claimondo-shield">
                  {t('verkehr_intro', { ort: s.name, jahr: verkehr.jahr })}
                </p>
                <ul className="mt-4 space-y-3">
                  {verkehr.zaehlstellen.map((z) => (
                    <li key={`${z.strasse}-${z.name}`} className="rounded-ios-md bg-white p-4">
                      <p className="text-sm font-bold text-claimondo-navy">
                        {z.strasse}
                        <span className="font-normal text-claimondo-shield">
                          {' · '}
                          {t('verkehr_zaehlstelle', {
                            name: z.name,
                            km: z.entfernungKm.toLocaleString(locale),
                          })}
                        </span>
                      </p>
                      <p className="mt-1 text-sm leading-relaxed text-claimondo-shield">
                        {zaehlstelleSatz(z, locale)}
                      </p>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-claimondo-shield/75">
                  {t.rich('verkehr_quelle', {
                    lizenz: verkehr.lizenz,
                    link: (chunks) => (
                      <a
                        href={verkehr.quelle}
                        target="_blank"
                        rel="nofollow noopener noreferrer"
                        className="underline hover:text-claimondo-navy"
                      >
                        {chunks}
                      </a>
                    ),
                  })}
                </p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* 4d — Hyperlokal: Praktische Hilfe nach dem Unfall (öffentliche Stellen, Doc 38 §6.5) */}
      {s.hyperlocal?.oeffentlicheStellen && (
        <section className="bg-white py-16 sm:py-20" aria-labelledby="hilfe-stadt-heading">
          <div className="mx-auto max-w-4xl px-5">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-claimondo-ondo">
                {t('hilfe_eyebrow')}
              </p>
              <h2 id="hilfe-stadt-heading" className="mt-3 text-3xl font-extrabold text-claimondo-navy sm:text-4xl">
                {t('hilfe_h2', { ort })}
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-claimondo-shield">
                {t.rich('hilfe_intro', {
                  strong: (chunks) => <strong className="text-claimondo-navy">{chunks}</strong>,
                  notruf: s.hyperlocal.oeffentlicheStellen.notruf,
                })}
              </p>
            </div>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <div className="rounded-ios-md border border-claimondo-border bg-claimondo-bg p-5">
                <p className="text-sm font-bold text-claimondo-navy">
                  {s.hyperlocal.oeffentlicheStellen.polizeipraesidium.name}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-claimondo-shield">
                  {s.hyperlocal.oeffentlicheStellen.polizeipraesidium.adresse}
                </p>
                <p className="mt-1 text-sm text-claimondo-shield">
                  {t('hilfe_vermittlung', {
                    telefon: s.hyperlocal.oeffentlicheStellen.polizeipraesidium.telefon,
                    notruf: s.hyperlocal.oeffentlicheStellen.notruf,
                  })}
                </p>
              </div>
              <div className="rounded-ios-md border border-claimondo-border bg-claimondo-bg p-5">
                <p className="text-sm font-bold text-claimondo-navy">
                  {s.hyperlocal.oeffentlicheStellen.zulassungsstelle.name}{' '}
                  {t('hilfe_kennzeichen', { kennzeichen: s.hyperlocal.oeffentlicheStellen.zulassungsstelle.kennzeichen })}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-claimondo-shield">
                  {s.hyperlocal.oeffentlicheStellen.zulassungsstelle.adresse}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-claimondo-shield">
                  {t('hilfe_tel', { telefon: s.hyperlocal.oeffentlicheStellen.zulassungsstelle.telefon })}
                  {s.hyperlocal.oeffentlicheStellen.zulassungsstelle.oeffnungszeiten
                    ? ` · ${s.hyperlocal.oeffentlicheStellen.zulassungsstelle.oeffnungszeiten}`
                    : ''}
                </p>
              </div>
            </div>
            <p className="mt-4 text-xs text-claimondo-shield/75">
              {t('hilfe_tipp')}
            </p>
          </div>
        </section>
      )}

      {/* 4f — Amtlicher Fahrzeugbestand (KBA FZ 3).
          ⭐ Rendert fuer ALLE Staedte, nicht nur die mit gepflegter oder
          generierter Ortstiefe — das unterscheidet diese Sektion von 4b-4e.
          Gemessen am 20.08.2026 waren 166 von 173 Stadtseiten untereinander
          ~93 % identisch (nur 3 von 135 Textbloecken eigenstaendig). Harte
          amtliche Zahlen wirken sofort auf allen Seiten, waehrend der
          KI-Lokalinhalt mit ~2 Staedten pro Nacht nachwaechst. */}
      {(() => {
        const amt = getAmtsdaten(s.slug)
        if (!amt) return null
        const zahl = (n: number) => n.toLocaleString(locale)
        const proTausend = pkwJeTausendEinwohner(amt.kfz.pkw, s.bevoelkerung)
        return (
          <section className="bg-white py-16 sm:py-20" aria-labelledby="kfzbestand-stadt-heading">
            <div className="mx-auto max-w-3xl px-5">
              <div className="text-center">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-claimondo-ondo">
                  {t('kfzbestand_eyebrow')}
                </p>
                <h2
                  id="kfzbestand-stadt-heading"
                  className="mt-3 text-3xl font-extrabold text-claimondo-navy sm:text-4xl"
                >
                  {t('kfzbestand_h2', { stadt: s.name })}
                </h2>
              </div>
              <div className="mt-8">
                <AnswerCapsule quelle={t('kfzbestand_quelle', { stand: amt.stand })}>
                  {t('kfzbestand_text', {
                    stadt: s.name,
                    pkw: zahl(amt.kfz.pkw),
                    gewerblich: zahl(amt.kfz.pkwGewerblich),
                    lkw: zahl(amt.kfz.lkw),
                    kraftraeder: zahl(amt.kfz.kraftraeder),
                  })}
                  {proTausend !== null ? ` ${t('kfzbestand_quote', { proTausend: zahl(proTausend) })}` : ''}
                </AnswerCapsule>
              </div>
            </div>
          </section>
        )
      })()}

      {/* 4e — Spoke-Town: Anbindung an die Hub-City (Doc 38 P5, minimal-unique) */}
      {s.spokeLocal && (
        <section className="bg-white py-16 sm:py-20" aria-labelledby="spoke-stadt-heading">
          <div className="mx-auto max-w-3xl px-5">
            <div className="text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-claimondo-ondo">
                {t('spoke_eyebrow', { hubName: s.spokeLocal.hubName })}
              </p>
              <h2 id="spoke-stadt-heading" className="mt-3 text-3xl font-extrabold text-claimondo-navy sm:text-4xl">
                {t('spoke_h2', { ort })}
              </h2>
            </div>
            <p className="mt-6 text-center text-base leading-relaxed text-claimondo-shield">
              {s.spokeLocal.anekdote}
            </p>
            {/* ⚠ Die Spoke-Box entstand, als es den Marketing-Read (P3-B1) noch nicht
                gab — sie war die EINZIGE Ortstiefe eines Spokes. Seit eine freigegebene
                `stadt_lokalinhalte`-Zeile dieselben Felder liefert, stehen Achsen,
                Stadtteile und Hotspot bei Spokes mit Ortsinhalt ZWEIMAL auf der Seite.
                Am 23.08. auf prod nachgemessen (sichtbarer Text, ohne JSON-LD): Solingen
                nennt „Ohligs" und „Gräfrath" je einmal in der Bezirksliste aus der DB und
                erneut in der Zeile „Stadtteile: …"; bei Ratingen ebenso Lintorf/Homberg.
                Betroffen sind die 6 Spokes mit Ortsinhalt — und es waeren 10 weitere
                geworden, sobald die offenen Spoke-Staedte Inhalte bekommen.
                Deshalb: die Spoke-Box zeigt nur noch, was der Ortsinhalt NICHT liefert.
                Die `anekdote` und der Hub-Link bleiben immer — sie haben dort kein Pendant. */}
            <div className="mt-6 rounded-ios-md border border-claimondo-border bg-claimondo-bg p-5 text-sm leading-relaxed text-claimondo-shield">
              {!hauptachsen && (
                <p>
                  {t.rich('spoke_achsen', {
                    strong: (chunks) => <strong className="text-claimondo-navy">{chunks}</strong>,
                    hauptachsen: s.spokeLocal.hauptachsen.join(', '),
                  })}
                </p>
              )}
              {s.spokeLocal.stadtbezirke && s.spokeLocal.stadtbezirke.length > 0 && stadtbezirke.length === 0 && (
                <p className="mt-2">
                  {t.rich('spoke_stadtteile', {
                    strong: (chunks) => <strong className="text-claimondo-navy">{chunks}</strong>,
                    stadtteile: s.spokeLocal.stadtbezirke.map((b) => b.name).join(', '),
                  })}
                </p>
              )}
              {s.spokeLocal.vorwahl && (
                <p className="mt-2">
                  {t.rich('spoke_vorwahl', {
                    strong: (chunks) => <strong className="text-claimondo-navy">{chunks}</strong>,
                    vorwahl: s.spokeLocal.vorwahl,
                  })}
                </p>
              )}
              <p className="mt-2">
                {t.rich('spoke_einsatz', {
                  stadt: s.name,
                  hubName: s.spokeLocal.hubName,
                  link: (chunks) => (
                    <Link
                      href={`/kfz-gutachter/${s.spokeLocal!.hubSlug}`}
                      className="font-semibold text-claimondo-ondo underline hover:text-claimondo-navy"
                    >
                      {chunks}
                    </Link>
                  ),
                })}
              </p>
            </div>
            {s.spokeLocal.hotspot && unfallHotspots.length === 0 && (
              <div className="mt-4 rounded-ios-md border border-claimondo-border bg-white p-5 text-sm leading-relaxed text-claimondo-shield">
                <p>
                  <strong className="text-claimondo-navy">
                    {s.spokeLocal.hotspot.einzelfall ? t('spoke_hotspot_einzelfall') : t('spoke_hotspot_schwerpunkt')}:
                  </strong>{' '}
                  {s.spokeLocal.hotspot.ort}
                </p>
                <p className="mt-1">{s.spokeLocal.hotspot.beschreibung}</p>
                <p className="mt-1 text-xs">
                  <a
                    href={s.spokeLocal.hotspot.quelle}
                    target="_blank"
                    rel="nofollow noopener noreferrer"
                    className="text-claimondo-ondo underline hover:text-claimondo-navy"
                  >
                    {t('spoke_quelle')}
                  </a>
                </p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* 5 — BGH-Authority */}
      <BghAuthorityGrid
        headingId="bgh-stadt-heading"
        subline={t('bgh_subline', { ort })}
      />

      {/* 5b — Portal-Mockup (Wie Uber) */}
      <PortalMockupSection />

      {/* 6 — Prozess */}
      <section className="bg-claimondo-bg py-16 sm:py-24" aria-labelledby="prozess-stadt-heading">
        <div className="mx-auto max-w-6xl px-5">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-claimondo-ondo">
              {t('prozess_eyebrow')}
            </p>
            <h2 id="prozess-stadt-heading" className="mt-3 text-3xl font-extrabold text-claimondo-navy sm:text-4xl">
              {t('prozess_h2', { ort })}
            </h2>
          </div>
          <ol className="mt-12 grid gap-5 md:grid-cols-3 lg:grid-cols-5" role="list">
            {PROZESS_STEPS.map((step, i) => (
              <li
                key={step.nr}
                className="relative rounded-ios-md border border-claimondo-border bg-white p-6 shadow-claimondo-sm"
              >
                <span className="absolute -top-3 left-6 inline-flex items-center gap-1.5 rounded-full bg-claimondo-navy px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                  {t('prozess_schritt', { nr: step.nr })}
                </span>
                <h3 className="mt-2 text-lg font-bold text-claimondo-navy">{prozessSteps[i]?.titel}</h3>
                <p className="mt-2 text-sm leading-relaxed text-claimondo-shield">{prozessSteps[i]?.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 6b — Statt vier Ratgeber-Bloecken: vier Verweise.
          Gemessen am 24.08.2026 an der Live-Seite: von 2.965 Woertern einer
          Stadtseite standen 1.461 wortgleich auf ALLEN 294 Stadtseiten. Die
          vier groessten Rahmen-Bloecke waren reiner Ratgeber-Text —
          SiebenFehler (412 W), Versicherer-Taktiken (291 W), Wertminderung
          (128 W), Tesla/E-Auto (61 W) = 892 Woerter, die jede Stadtseite
          identisch wiederholte, obwohl sie auf /vorteile vollstaendig stehen.
          Google indexiert 131 dieser Seiten nicht ("Gecrawlt — zurzeit nicht
          indexiert"); ein Seitentyp, der zur Haelfte aus wiederholtem Text
          besteht, ist genau der Fall, den Google als thin content einstuft.
          Der Inhalt geht nicht verloren, er steht weiter auf /vorteile bzw.
          /wie-es-funktioniert — die Stadtseite verweist jetzt darauf und
          staerkt damit zugleich deren interne Verlinkung. */}
      <section className="bg-white py-12" aria-labelledby="ratgeber-stadt-heading">
        <div className="mx-auto max-w-6xl px-5">
          <h2 id="ratgeber-stadt-heading" className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-claimondo-ondo">
            {t('ratgeber_eyebrow')}
          </h2>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {([
              { href: '/vorteile', text: t('ratgeber_fehler') },
              { href: '/vorteile', text: t('ratgeber_taktiken') },
              { href: '/vorteile', text: t('ratgeber_wertminderung') },
              { href: '/vorteile', text: t('ratgeber_eauto') },
            ] as const).map((r) => (
              <Link
                key={r.text}
                href={r.href}
                className="group flex items-center justify-between gap-3 rounded-ios-md border border-claimondo-border bg-claimondo-bg px-5 py-4 transition-colors hover:border-claimondo-ondo"
              >
                <span className="text-sm font-semibold text-claimondo-navy">{r.text}</span>
                <span className="flex-shrink-0 text-claimondo-ondo transition-transform group-hover:translate-x-0.5" aria-hidden>
                  &rarr;
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* 7 — Einsatzgebiet / Cross-City */}
      <section className="bg-white py-16 sm:py-24" aria-labelledby="einsatzgebiet-stadt-heading">
        <div className="mx-auto max-w-6xl px-5">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-claimondo-ondo">
              {t('einsatz_eyebrow')}
            </p>
            <h2 id="einsatzgebiet-stadt-heading" className="mt-3 text-3xl font-extrabold text-claimondo-navy sm:text-4xl">
              {t('einsatz_h2')}
            </h2>
          </div>
          {/* Die Karte zeigt Nordrhein-Westfalen — sie stand bisher auf JEDER
              Stadtseite, also auch auf Berlin, Hamburg und München (50 der 92
              Seiten liegen ausserhalb von NRW). Ein Bild, das eine andere Region
              zeigt als die Seite, ist eine Falschaussage. Es gibt kein Asset für
              die übrigen Bundesländer, deshalb entfällt die Spalte dort — kein
              Platzhalter, der etwas Unwahres behauptet (P3-A5). */}
          <div
            className={`mt-12 grid items-center gap-10 ${zeigtNrwKarte ? 'md:grid-cols-[1.2fr_1fr]' : ''}`}
          >
            {zeigtNrwKarte && (
              <div className="overflow-hidden rounded-ios-lg border border-claimondo-border bg-claimondo-bg shadow-claimondo-sm">
                <Image
                  src="/marketing-landing-koeln/nrw-karte.png"
                  alt="Claimondo Einsatzgebiet — Schwerpunkt Nordrhein-Westfalen, deutschlandweite Anbindung"
                  width={900} height={650}
                  className="h-auto w-full"
                />
              </div>
            )}
            <div>
              <p className="text-sm font-semibold text-claimondo-shield">
                {t('einsatz_verfuegbar')}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {crossCity.map((c) => (
                  <Link
                    key={c.slug}
                    href={`/kfz-gutachter/${c.slug}`}
                    className="rounded-full border border-claimondo-border bg-white px-4 py-1.5 text-xs font-semibold text-claimondo-ondo transition-colors hover:border-claimondo-ondo hover:text-claimondo-navy"
                  >
                    {c.name}
                  </Link>
                ))}
                <Link
                  href="/kfz-gutachter"
                  className="rounded-full border border-claimondo-ondo bg-claimondo-ondo px-4 py-1.5 text-xs font-semibold text-white hover:bg-claimondo-shield"
                >
                  {t('einsatz_alle')}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 7c — Gründer Trust-Anker */}
      <FounderSection />

      {/* 8 — FAQ */}
      <section className="bg-claimondo-bg py-16 sm:py-24" aria-labelledby="faq-stadt-heading">
        <div className="mx-auto max-w-3xl px-5">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-claimondo-ondo">
              {t('faq_eyebrow', { ort })}
            </p>
            <h2 id="faq-stadt-heading" className="mt-3 text-3xl font-extrabold text-claimondo-navy sm:text-4xl">
              {t('faq_h2')}
            </h2>
          </div>
          <div className="mt-10 space-y-3">
            {faqsVisible.map((f) => (
              <details
                key={f.frage}
                className="group rounded-ios-md border border-claimondo-border bg-white p-5"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between text-base font-bold text-claimondo-navy">
                  <span>{f.frage}</span>
                  <ChevronRight className="h-5 w-5 flex-shrink-0 text-claimondo-ondo transition-transform group-open:rotate-90" aria-hidden />
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-claimondo-shield">{f.antwort}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* 9 — Bottom CTA */}
      <section className="relative isolate overflow-hidden bg-claimondo-navy py-20 text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background: [
              'radial-gradient(circle at 20% 25%, rgba(69,115,162,0.30), transparent 55%)',
              'radial-gradient(circle at 80% 75%, rgba(123,163,204,0.18), transparent 50%)',
            ].join(', '),
          }}
        />
        <div className="relative mx-auto max-w-3xl px-5 text-center">
          <h2 className="text-3xl font-bold leading-tight sm:text-4xl">
            {t('cta_h2', { ort })}
          </h2>
          <p className="mt-4 text-white/75">
            {t('cta_p', { ort })}
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href={`tel:${PHONE_E164}`}
              className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-4 text-base font-bold text-claimondo-navy shadow-claimondo-md transition-all hover:bg-claimondo-light-blue/90"
              data-tracking={`call-${s.slug}-bottom`}
            >
              <Phone className="h-5 w-5 text-claimondo-ondo" aria-hidden />
              {PHONE_DISPLAY}
            </a>
            <Link
              // Mit Ortsbezug: die Karte zentriert auf die Stadt, aus der der
              // Klick kommt, statt auf den NRW-Default mit Geolocation-Prompt.
              href={finderHrefFuerStadt(s)}
              className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/5 px-7 py-4 text-base font-semibold text-white/90 backdrop-blur-sm hover:border-white/50"
              data-tracking={`karte-${s.slug}-bottom`}
            >
              <MapPin className="h-5 w-5" aria-hidden />
              {t('cta_karte')}
            </Link>
          </div>
        </div>
      </section>

      <LandingFooter finderHref={finderHrefFuerStadt(s)} />
      <TrackingHooks />
      <StickyCallBar quelle={`Kfz-Gutachter ${s.name}`} finderHref={finderHrefFuerStadt(s)} />
    </div>
  )
}
