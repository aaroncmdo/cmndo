import { CLUSTER, MAIN_CITY } from '@/lib/cluster'
import { NETZWERK_PAIN, NETZWERK_COMPARE_MOBILE, GOOGLE_RATING } from '@/lib/content'
import { renderRich, ClaimondoLink } from '@/lib/text'
import { NetzwerkCompare } from './NetzwerkCompare'

// SERVER-Section "Das Claimondo-Netzwerk" (Mock #netzwerk).
// MOBILE (sm:hidden, #netzwerkMobile, v7.3): Team-Foto-Hero-Card + "Die 4 wichtigsten
// Fragen" (4 Pain-Cards mit IO-Staggered-Reveal) + dezenter Toggle → 8-Karten
// Compare-Panel (Topic-Badges) + Service-CTA-v8 (3 Rollen + Phone-Button).
// Reveal-Observer + Compare-Toggle leben in SiteScripts.tsx (Vanilla-DOM, analog
// Burger/Chevron). DESKTOP/TABLET (hidden sm:grid): Original 1:1 — Bild-Karte +
// Text + 4 Fakten-Badges + Client-Toggle <NetzwerkCompare />. Keine Props.
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
              <div className="netzwerk-team-credentials">10+ Jahre · DAT/BVSK · <ClaimondoLink>Claimondo-Partner</ClaimondoLink></div>
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
              „Gegengutachten“ = fachliche Widerlegung eines Prüfberichts nach DAT/BVSK-Standard. Auszahlung
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
                alt="Sachverständiger vor Ort"
                loading="lazy"
                width={56}
                height={56}
              />
              <p className="cta-v8-role-name">{CLUSTER.svName}</p>
              <p className="cta-v8-role-sub">DAT-Gutachter</p>
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
            „Gegengutachten“ bezeichnet die fachliche Widerlegung eines Prüfberichts nach DAT/BVSK-Standard.
            Auszahlung einzelfallabhängig.
          </p>
        </div>

        {/* ============ DESKTOP / TABLET — BRIEF 08n N5: Variante B+ (Entscheid
            Aaron 10.06., Cowork-Live-Preview abgenommen). Ersetzt das 08k-Layout:
            Lead statt Textwand, Diagonal-Foto-Panel statt Foto-Spalte, 3 Icon-
            Spalten statt Avatar-Kette, Stat-Leiste statt Kennzahlen-Grid.
            Ziel ~520-600px Sectionhoehe @1440. Mobile-Insel unveraendert. ============ */}
        <div className="hidden sm:block relative">
          {/* N5.3 · Kundengespraech als Diagonal-Panel oben rechts (nur >=1024):
              weicher 102deg-Mask-Verlauf (globals .netzwerk-diagonal) + Bottom-
              Blend in den Section-Grund — Foto bleibt Foto, kein UI-Layer,
              KEIN clip-path, keine Kante. Hinter dem Content (z-0). */}
          <div className="netzwerk-diagonal hidden lg:block absolute top-0 right-0 w-[47%] h-[400px] z-0 pointer-events-none" aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`${CLUSTER.imgPath}kundengespraech-${CLUSTER.key}.webp?v=${CLUSTER.assetVersion}`}
              alt=""
              className="w-full h-full object-cover"
              style={{ objectPosition: '65% 25%' }}
              loading="lazy"
            />
            <div
              className="absolute inset-0"
              style={{ background: 'linear-gradient(180deg, transparent 45%, var(--petrol) 97%)' }}
            />
          </div>

          <div className="relative z-[1]">
            <span className="inline-flex items-center gap-2 font-mono text-xs font-bold tracking-[.08em] uppercase text-amber mb-3.5">
              <span className="eyebrow-dot"></span> Das <ClaimondoLink>Claimondo-Netzwerk</ClaimondoLink>
            </span>
            <h2 className="font-display font-bold text-section-h2 text-white mb-4 leading-tight lg:max-w-[58%]">
              <span className="block text-white/70 text-[0.78em] font-semibold">Andere geben Ihnen ein Gutachten.</span>
              Wir geben Ihnen die <span className="text-amber">komplette Lösung</span>.
            </h2>
            {/* N5.2 · Lead-Satz (aus der Textwand promotet, exakt wortgleich) —
                die restliche Textwand entfaellt ersatzlos. */}
            <p className="text-white/[.86] text-[16.5px] leading-relaxed lg:max-w-[58%]">
              Sie melden den Schaden einmal — alles Weitere koordinieren wir.
            </p>

            {/* N5.4 · 3 Spalten mit Tabler-Line-Icons (Inline-SVG, stroke 2,
                Tabler-Geometrie; KEINE Avatare). Copy exakt aus dem Brief. */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-7 mt-10">
              <div>
                <svg className="w-7 h-7 stroke-amber fill-none mb-3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M5 7h1a2 2 0 0 0 2-2 1 1 0 0 1 1-1h6a1 1 0 0 1 1 1 2 2 0 0 0 2 2h1a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2" />
                  <circle cx="12" cy="13" r="3" />
                </svg>
                <h3 className="font-display font-bold text-white text-[16.5px] mb-1.5">Gutachter vor Ort</h3>
                <p className="text-white/75 text-[14px] leading-relaxed">In 60 Min bei Ihnen — gerichtsfest nach DAT/BVSK.</p>
              </div>
              <div>
                <svg className="w-7 h-7 stroke-amber fill-none mb-3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 14v-3a8 8 0 1 1 16 0v3" />
                  <path d="M18 19a2 2 0 0 0 2-2v-3h-3v5h1zM4 14h3v5H6a2 2 0 0 1-2-2v-3z" />
                  <path d="M20 17a4 4 0 0 1-4 4h-2" />
                </svg>
                <h3 className="font-display font-bold text-white text-[16.5px] mb-1.5">Betreuung rund um die Uhr</h3>
                <p className="text-white/75 text-[14px] leading-relaxed">Ein Ansprechpartner für Termin, Mietwagen, Schriftverkehr.</p>
              </div>
              <div>
                <svg className="w-7 h-7 stroke-amber fill-none mb-3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M7 20h10M6 6l6-2 6 2" />
                  <path d="M12 4v16" />
                  <path d="M9 12c0 1.66-1.34 3-3 3s-3-1.34-3-3l3-6 3 6zM21 12c0 1.66-1.34 3-3 3s-3-1.34-3-3l3-6 3 6z" />
                </svg>
                <h3 className="font-display font-bold text-white text-[16.5px] mb-1.5">Anwalt setzt durch</h3>
                <p className="text-white/75 text-[14px] leading-relaxed">Kürzt die Versicherung, widerspricht unser Partneranwalt und setzt die volle Summe durch.</p>
              </div>
            </div>

            {/* N5.6 · Stat-Leiste (eine Zeile, Hairlines oben+unten; "Portal"
                entfaellt). 5,0 aus GOOGLE_RATING (gleiche Quelle wie 08i). */}
            <div className="mt-10 border-y border-white/[.14] py-3.5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[14px] text-white/85 whitespace-nowrap">
              <span><strong className="text-white font-semibold">90+</strong> Gutachter</span>
              <span className="text-white/30" aria-hidden="true">·</span>
              <span className="text-white font-semibold">DAT</span>
              <span className="text-white/30" aria-hidden="true">·</span>
              <span className="text-white font-semibold">BVSK</span>
              <span className="text-white/30" aria-hidden="true">·</span>
              <span><strong className="text-white font-semibold">{GOOGLE_RATING.value.replace('.', ',')}</strong> <span className="text-[#FCD34D]" aria-hidden="true">★</span> Google</span>
              <span className="text-white/30" aria-hidden="true">·</span>
              <span><strong className="text-amber font-semibold">0 €</strong> bei unverschuldetem Unfall</span>
            </div>

            {/* N5.7 · CTA ab 768 horizontal zentriert (Entscheid Aaron). */}
            <div className="mt-7 flex justify-center">
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
                bindet den Button per id). */}
            <div className="netzwerk-compare-fullspan">
              <NetzwerkCompare />
              <p className="netzwerk-compare-hint mt-4 text-[12.5px] text-white/[.62] leading-relaxed">
                Hinweis: „Gegengutachten“ bezeichnet die fachliche Widerlegung eines Prüfberichts/Versicherergutachtens
                nach DAT/BVSK-Standard. Die erzielbare Auszahlung ist einzelfallabhängig.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
