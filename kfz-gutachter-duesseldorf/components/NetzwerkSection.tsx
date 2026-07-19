import { CLUSTER, MAIN_CITY } from '@/lib/cluster'
import { NETZWERK_PAIN, NETZWERK_COMPARE_MOBILE, NETZWERK_PERSONEN, ABLAUF_TIMELINE } from '@/lib/content'
import { renderRich, ClaimondoLink } from '@/lib/text'
import { NetzwerkCompare } from './NetzwerkCompare'

// SERVER-Section "Das Claimondo-Netzwerk" (Mock #netzwerk).
// MOBILE (sm:hidden, #netzwerkMobile, v7.3): Team-Foto-Hero-Card + "Die 4 wichtigsten
// Fragen" (4 Pain-Cards mit IO-Staggered-Reveal) + dezenter Toggle → 8-Karten
// Compare-Panel (Topic-Badges) + Service-CTA-v8 (3 Rollen + Phone-Button).
// Reveal-Observer + Compare-Toggle leben in SiteScripts.tsx (Vanilla-DOM, analog
// Burger/Chevron). DESKTOP/TABLET (hidden sm:grid): Original 1:1 — Bild-Karte +
// Text + 4 Fakten-Badges + Client-Toggle <NetzwerkCompare />. Keine Props.
// 08o O2: "~TAG 32" (letzter Timeline-Step) -> "~32 Tage" — EIN Datenfeld,
// laeuft mit der Mobile-Timeline mit.
const TIMELINE_TAGE = `~${(ABLAUF_TIMELINE[ABLAUF_TIMELINE.length - 1].day.match(/\d+/) ?? ['32'])[0]} Tage`

export function NetzwerkSection() {
  return (
    <section id="netzwerk" className="py-[clamp(52px,7vw,84px)] bg-petrol text-white">
      <div className="max-w-wrap mx-auto px-6">
        {/* ============ MOBILE-ONLY v7.3 ============ */}
        <div className="sm:hidden max-w-[440px] mx-auto" id="netzwerkMobile">
          {/* Team-Hero-Card: Foto füllt Card, Eyebrow + Stadt-Pill oben, Credentials-Footer unten */}
          <div
            className="netzwerk-team-card"
            id="netzwerkTeamCard"
            role="img"
            aria-label="Kfz-Sachverständigen-Team vor Ort"
          >
            <div
              className="netzwerk-team-photo"
              id="netzwerkTeamPhoto"
              aria-hidden="true"
              style={{ backgroundImage: `url('${CLUSTER.teamImg}')` }}
            />
            <span className="netzwerk-team-eyebrow-overlay">
              <span className="netzwerk-team-eyebrow-dot" /> Ihr Team vor Ort
            </span>
            <span className="netzwerk-team-city-pill">
              <span className="netzwerk-team-city-dot" />
              <span className="loc-text-uc">{MAIN_CITY.name}</span>
            </span>
            <div className="netzwerk-team-bottom">
              <div className="netzwerk-team-credentials">10+ Jahre · BVSK · <ClaimondoLink>Claimondo-Partner</ClaimondoLink></div>
            </div>
          </div>

          {/* Pain-Story Header */}
          <div className="text-center mt-7 mb-4">
            <span className="inline-flex items-center gap-2 font-mono text-xs font-bold tracking-[.08em] uppercase text-amber">
              <span className="eyebrow-dot" /> Die 4 wichtigsten Fragen
            </span>
          </div>
          <h2 className="font-display font-bold text-[clamp(20px,5.5vw,24px)] mb-5 text-center leading-tight">
            Was wirklich passiert nach
            <br />
            Ihrem <span className="text-amber">Unfall</span> — und was hilft.
          </h2>

          {/* 4 Pain-Cards · IO-Staggered-Reveal über data-step */}
          <ol className="netzwerk-pain-list" id="netzwerkPainList">
            {NETZWERK_PAIN.map((card) => (
              <li
                key={card.tag}
                className={`netzwerk-pain-card netzwerk-pain-card--${card.tag}`}
                data-step={card.step}
              >
                <div className="netzwerk-pain-tag">{card.tag}</div>
                <div className="netzwerk-pain-body">
                  <h3 className="netzwerk-pain-title">{card.title}</h3>
                  <p className="netzwerk-pain-sub">{renderRich(card.sub, card.subStrong)}</p>
                  <a className="netzwerk-pain-link" href={card.linkHref} target="_blank" rel="noopener">
                    {card.linkLabel}
                  </a>
                </div>
              </li>
            ))}
          </ol>

          {/* Dezenter Toggle-Link für den 8-Punkte-Komplett-Vergleich */}
          <p className="text-center mt-2 mb-3">
            <button
              type="button"
              id="netzwerkMobileCompareToggle"
              className="netzwerk-compare-link"
              aria-expanded="false"
              aria-controls="netzwerkCompareMobilePanel"
            >
              Alle 8 Vergleichspunkte ansehen <span className="netzwerk-compare-chev">→</span>
            </button>
          </p>

          {/* Mobile-Compare-Panel · 8 Karten mit Topic-Badges */}
          <div id="netzwerkCompareMobilePanel" className="cmp-mobile-panel" aria-hidden="true">
            {NETZWERK_COMPARE_MOBILE.map((card, i) => (
              <div key={i} className={`cmp-mobile-card ${card.cardClass}`.trim()}>
                <p className="cmp-mobile-q-meta">
                  <span className={`cmp-mobile-meta cmp-mobile-meta--${card.metaClass}`}>{card.metaLabel}</span>{' '}
                  {card.question}
                </p>
                <div className="cmp-mobile-tiles">
                  <div className="cmp-mobile-tile cmp-mobile-tile--no">
                    <p className="cmp-mobile-tag">Ohne uns</p>
                    <p className="cmp-mobile-txt">{renderRich(card.ohne, '')}</p>
                  </div>
                  <div className={`cmp-mobile-tile cmp-mobile-tile--yes${card.mitBig ? ' cmp-mobile-tile--big' : ''}`}>
                    <p className="cmp-mobile-tag">Mit uns</p>
                    <p className="cmp-mobile-txt">{renderRich(card.mit, '')}</p>
                  </div>
                </div>
                {card.linkHref ? (
                  <a className="cmp-mobile-link" href={card.linkHref} target="_blank" rel="noopener">
                    {card.linkLabel}
                  </a>
                ) : null}
              </div>
            ))}
            <p className="cmp-mobile-footnote">
              „Gegengutachten“ = fachliche Widerlegung eines Prüfberichts nach BVSK-Standard. Auszahlung
              einzelfallabhängig.
            </p>
          </div>

          {/* Service-CTA · v8: 3 Rollen + standalone Phone-Button */}
          <div className="cta-v8-head">
            <p className="cta-v8-headline">Genau dafür sind wir da.</p>
            <p className="cta-v8-sub">Sie melden — wir kümmern uns:</p>
          </div>
          <div className="cta-v8-roles">
            <div className="cta-v8-role">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                id="netzwerkAvatarTobias"
                className="cta-v8-role-img"
                src={`${CLUSTER.imgPath}avatar-${CLUSTER.svName.toLowerCase()}-${CLUSTER.key}.png`}
                alt={`${CLUSTER.svName} ${CLUSTER.svSurname}, Kfz-Gutachter vor Ort`}
                loading="lazy"
                width={56}
                height={56}
              />
              <p className="cta-v8-role-name">{CLUSTER.svName}</p>
              <p className="cta-v8-role-sub">Kfz-Gutachter</p>
              <p className="cta-v8-role-action">gerichtsfest</p>
            </div>
            <div className="cta-v8-role">
              <div className="cta-v8-role-img-wrap">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className="cta-v8-role-img"
                  src="/assets/img/shared/avatar-monika.png"
                  alt="Monika, Claimondo Unfall-Assistance"
                  loading="lazy"
                  width={56}
                  height={56}
                />
                <span className="cta-v8-role-live" role="img" aria-label="online" />
              </div>
              <p className="cta-v8-role-name">Monika</p>
              <p className="cta-v8-role-sub">Unfall-Assistance</p>
              <p className="cta-v8-role-action">reguliert</p>
            </div>
            <div className="cta-v8-role">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="cta-v8-role-img"
                src="/assets/img/shared/avatar-lexdrive.png"
                alt="Markus, LexDrive Partnerkanzlei für Verkehrsrecht"
                loading="lazy"
                width={56}
                height={56}
              />
              <p className="cta-v8-role-name">Markus</p>
              <p className="cta-v8-role-sub">LexDrive Partnerkanzlei</p>
              <p className="cta-v8-role-action">durchsetzen</p>
            </div>
          </div>
          <a className="cta-v8-phone" href={`tel:${CLUSTER.phone.tel}`} data-cta="netzwerk_mobile_call">
            <span className="cta-v8-phone-icon">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
            </span>
            <span className="cta-v8-phone-number">{CLUSTER.phone.display}</span>
            <span className="cta-v8-phone-chev">→</span>
          </a>

          {/* Mobile-Footnote */}
          <p className="mt-3 text-[11.5px] text-white/55 leading-relaxed text-center">
            „Gegengutachten“ bezeichnet die fachliche Widerlegung eines Prüfberichts nach BVSK-Standard.
            Auszahlung einzelfallabhängig.
          </p>
        </div>

        {/* ============ DESKTOP / TABLET — BRIEF 08n N5: Variante B+ (Entscheid
            Aaron 10.06., Cowork-Live-Preview abgenommen). Ersetzt das 08k-Layout:
            Lead statt Textwand, Diagonal-Foto-Panel statt Foto-Spalte, 3 Icon-
            Spalten statt Avatar-Kette, Stat-Leiste statt Kennzahlen-Grid.
            Ziel ~520-600px Sectionhoehe @1440. Mobile-Insel unveraendert. ============ */}
        <div className="hidden sm:block relative">
          {/* 08o O2 · Kopfzeile 2-spaltig: links Eyebrow + H2 + Lead, rechts das
              Kundengespraech-Foto als GRID-KACHEL. 08q Q2.1: Diagonal-/Links-
              Verlauf entfernt (Entscheid Aaron) — saubere rounded Kachel, Bild
              steht fuer sich. Grid statt absolutem Overlay -> keine Text-auf-
              Foto-Kollision. */}
          <div className="relative z-[1]">
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_minmax(0,44%)] gap-8 lg:gap-10 items-center">
              <div>
                <span className="inline-flex items-center gap-2 font-mono text-xs font-bold tracking-[.08em] uppercase text-amber mb-3.5">
                  <span className="eyebrow-dot"></span> Das <ClaimondoLink>Claimondo-Netzwerk</ClaimondoLink>
                </span>
                <h2 className="font-display font-bold text-section-h2 text-white mb-4 leading-tight">
                  <span className="block text-white/70 text-[0.78em] font-semibold">Andere geben Ihnen ein Gutachten.</span>
                  Wir geben Ihnen die <span className="text-amber">komplette Lösung</span>.
                </h2>
                <p className="text-white/[.86] text-[16.5px] leading-relaxed">
                  Sie melden den Schaden einmal — alles Weitere koordinieren wir.
                </p>
              </div>
              <div className="hidden lg:block relative rounded-2xl overflow-hidden h-[280px]" aria-hidden="true">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`${CLUSTER.imgPath}kundengespraech-${CLUSTER.key}.webp?v=${CLUSTER.assetVersion}`}
                  alt=""
                  className="w-full h-full object-cover"
                  style={{ objectPosition: '65% 25%' }}
                  loading="lazy"
                />
              </div>
            </div>

            {/* 08o O2 · 3 Personen-Karten statt Icon-Spalten — wortgleich aus
                NETZWERK_PERSONEN (lib/content); {sv} = CLUSTER.svName. Struktur
                ueberall: Avatar links, Name/Funktion + Ich-Zitat rechts —
                >=1024 als 3er-Grid, 640-1023 gestapelte Zeilen. */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6 mt-8">
              {NETZWERK_PERSONEN.map((p) => (
                <div key={p.avatar} className="border border-white/[.14] rounded-2xl p-5 flex gap-3.5 items-start">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {/* 08p P4: 34px war zu klein (25-31% der Tablet-Zeilenhoehe,
                      Gesichter kaum erkennbar — Aaron/Bridge). Tablet/Mobile-
                      Zeilen 60px + vertikal zentriert (~55% Zeilenhoehe),
                      Desktop-Karten 46px; object-position via avatarPos je
                      Asset (Gesicht mittig, Kopf nicht anschneiden). */}
                  <img
                    src={p.avatar === 'sv'
                      ? `${CLUSTER.imgPath}avatar-${CLUSTER.svName.toLowerCase()}-${CLUSTER.key}.png`
                      : `/assets/img/shared/avatar-${p.avatar}.png`}
                    alt={`${p.name === '{sv}' ? CLUSTER.svName : p.name} — ${p.funktion}`}
                    width={60}
                    height={60}
                    loading="lazy"
                    style={p.avatarPos ? { objectPosition: p.avatarPos } : undefined}
                    className="w-[60px] h-[60px] lg:w-[46px] lg:h-[46px] rounded-full object-cover flex-none self-center lg:self-start lg:mt-0.5"
                  />
                  <div className="min-w-0">
                    <p className="text-white font-display font-bold text-[15px] leading-tight">
                      {p.name === '{sv}' ? CLUSTER.svName : p.name}
                    </p>
                    <p className="text-white/60 text-[12.5px] leading-snug mt-0.5">{p.funktion}</p>
                    <p className="text-white/80 italic text-[14px] leading-relaxed mt-2">„{p.zitat}“</p>
                  </div>
                </div>
              ))}
            </div>

            {/* 08q Q2.2 · Nutzen-Leiste aufgewertet: keine Hairlines mehr, drei
                zentrierte Mini-Stat-Bloecke mit Wert/Label-Hierarchie (Wert
                20-22px — 0 €/~32 Tage Gold, "Jeden Schritt live" Weiss; Label
                klein/gedaempft). Grosszuegiger Abstand zu Karten und CTA. */}
            <div className="mt-12 flex flex-wrap items-start justify-center gap-x-12 gap-y-6 text-center">
              <div>
                <p className="font-display font-bold text-[22px] leading-none text-amber">0 €</p>
                <p className="text-[13px] text-white/60 mt-1.5">bei unverschuldetem Unfall</p>
              </div>
              <div>
                <p className="font-display font-bold text-[22px] leading-none text-amber">{TIMELINE_TAGE}</p>
                <p className="text-[13px] text-white/60 mt-1.5">bis zum Geld auf dem Konto</p>
              </div>
              <div>
                <p className="font-display font-bold text-[22px] leading-none text-white">Jeden Schritt live</p>
                <p className="text-[13px] text-white/60 mt-1.5">im Online-Portal</p>
              </div>
            </div>

            {/* N5.7 · CTA ab 768 horizontal zentriert (Entscheid Aaron). */}
            <div className="mt-10 flex justify-center">
              <button
                type="button"
                id="netzwerkCompareToggleDesk"
                aria-expanded="false"
                aria-controls="netzwerkCompareTable"
                className="inline-flex items-center gap-2 cursor-pointer bg-amber text-white font-display font-semibold text-sm px-[18px] py-2.5 rounded-full shadow-md hover:bg-amber-700 hover:-translate-y-px transition border-0"
              >
                <span className="netzwerk-toggle-label">Komplett-Service im Vergleich ansehen</span>
                <span className="netzwerk-toggle-chev text-[12px]" aria-hidden="true">▾</span>
              </button>
            </div>

            {/* Vergleichstabelle: Aufklapp-Mechanik unveraendert (NetzwerkCompare
                bindet den Button per id). 08q Q2.3: Gegengutachten-Fussnote ist
                IN die Tabelle gezogen (nur bei offener Tabelle sichtbar) — unter
                dem CTA bleibt nichts. */}
            <div className="netzwerk-compare-fullspan">
              <NetzwerkCompare />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
