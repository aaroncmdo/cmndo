import { CLUSTER, MAIN_CITY } from '@/lib/cluster'
import { NETZWERK_PAIN, NETZWERK_COMPARE_MOBILE } from '@/lib/content'
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
                src={`${CLUSTER.imgPath}avatar-tobias-${CLUSTER.key}.png`}
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

        {/* ============ DESKTOP / TABLET — Original 1:1 ============ */}
        <div className="hidden sm:grid grid-cols-1 md:grid-cols-[1fr_1.25fr] gap-[46px] items-start">
          {/* Bild-Karte: Kundengespräch (cluster-spezifisch) + Schadensbetreuer-Karte */}
          <div
            id="netzwerkCard"
            className="relative bg-cover bg-center bg-no-repeat border border-white/[.14] rounded-2xl overflow-hidden min-h-[400px] flex flex-col justify-end"
            style={{
              backgroundImage: `linear-gradient(180deg,rgba(14,24,32,.15) 0%,rgba(14,24,32,.50) 55%,rgba(14,24,32,.88) 100%),url('${CLUSTER.imgPath}kundengespraech-${CLUSTER.key}.webp')`,
            }}
          >
            <div className="p-5 flex flex-col gap-2.5">
              <div className="flex items-center gap-3 w-full bg-white/12 border border-white/20 rounded-[14px] p-3 backdrop-blur-[4px]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className="w-[54px] h-[54px] rounded-full object-cover flex-none border-2 border-white/60"
                  src="/assets/img/shared/monika.png"
                  alt="Monika — Ihre persönliche Schadensbetreuerin"
                  loading="lazy"
                />
                <div className="text-left flex-1 min-w-0">
                  <strong className="block text-white text-[14.5px] leading-tight">
                    Ihre persönliche Schadensbetreuerin
                  </strong>
                  <span className="block text-white/80 text-[12px] mt-[3px] leading-snug">
                    <span className="text-green font-semibold">● online</span> · 24/7 erreichbar &amp; eigenes
                    Kundenportal
                  </span>
                </div>
              </div>
              <div className="inline-flex items-center gap-2 text-white/[.82] text-[11.5px] font-semibold">
                Lokaler DAT-/BVSK-Sachverständiger vor Ort
              </div>
            </div>
          </div>

          {/* Text + Fakten + Tabelle */}
          <div>
            <span className="inline-flex items-center gap-2 font-mono text-xs font-bold tracking-[.08em] uppercase text-amber mb-3.5">
              <span className="eyebrow-dot"></span> Das <ClaimondoLink>Claimondo-Netzwerk</ClaimondoLink>
            </span>
            <h2 className="font-display font-bold text-section-h2 text-white mb-4 leading-tight">
              Andere geben Ihnen ein Gutachten.
              <br />
              Wir geben Ihnen die <span className="text-amber">komplette Lösung</span>.
            </h2>
            <p className="text-white/[.86] text-[15.5px] leading-relaxed mb-5">
              Über uns erhalten Sie Zugriff auf{' '}
              <strong className="text-white">
                90+ unabhängige, nach DAT- und BVSK-Standard zertifizierte Kfz-Sachverständige
              </strong>{' '}
              in Ihrer Region — mit eigenem Online-Portal, persönlichem Schadensbetreuer und voller Abwicklung über
              unsere Partnerkanzlei. Und falls die Versicherung kürzt:{' '}
              <strong className="text-white">
                Wir prüfen gegen und setzen Ihre Ansprüche mit einem gerichtsfesten Gegengutachten durch
              </strong>
              .
            </p>

            {/* Fakten-Leiste: 4 kompakte Badges */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-6">
              <div className="bg-white/[.06] border border-white/[.14] rounded-xl px-3 py-3 text-center">
                <div className="font-mono font-bold text-amber text-[22px] leading-none tabular-nums">90+</div>
                <div className="text-[10.5px] text-white/75 mt-1.5 leading-tight">
                  zertifizierte
                  <br />
                  Gutachter
                </div>
              </div>
              <div className="bg-white/[.06] border border-white/[.14] rounded-xl px-3 py-3 text-center">
                <div className="font-display font-bold text-white text-[14px] leading-tight">DAT · BVSK</div>
                <div className="text-[10.5px] text-white/75 mt-1.5 leading-tight">
                  anerkannte
                  <br />
                  Standards
                </div>
              </div>
              <div className="bg-white/[.06] border border-white/[.14] rounded-xl px-3 py-3 text-center">
                <div className="font-display font-bold text-white text-[14px] leading-tight">Eigenes Portal</div>
                <div className="text-[10.5px] text-white/75 mt-1.5 leading-tight">
                  Schaden jederzeit
                  <br />
                  im Blick
                </div>
              </div>
              <div className="bg-white/[.06] border border-white/[.14] rounded-xl px-3 py-3 text-center">
                <div className="font-mono font-bold text-amber text-[22px] leading-none tabular-nums">0 €</div>
                <div className="text-[10.5px] text-white/75 mt-1.5 leading-tight">
                  bei unverschuldetem
                  <br />
                  Unfall
                </div>
              </div>
            </div>
          </div>

          {/* Vergleichstabelle als full-width Grid-Sibling (DIFF 1, v15 Cowork):
              spannt via .netzwerk-compare-fullspan (globals.css) auf Tablet+Desktop
              beide Spalten, statt in der schmalen rechten 1.25fr-Spalte zu stauchen. */}
          <div className="netzwerk-compare-fullspan">
            {/* Toggle + vollständige Vergleichstabelle (Client) */}
            <NetzwerkCompare />

            <p className="netzwerk-compare-hint mt-4 text-[12.5px] text-white/[.62] leading-relaxed">
              Hinweis: „Gegengutachten“ bezeichnet die fachliche Widerlegung eines Prüfberichts/Versicherergutachtens
              nach DAT/BVSK-Standard. Die erzielbare Auszahlung ist einzelfallabhängig.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
