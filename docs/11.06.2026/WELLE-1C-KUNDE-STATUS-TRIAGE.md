# Welle 1c — kunde Status-Token-Migration (Triage + Handoff)

**Datum:** 2026-06-11 · **Branch:** `kitta/kunde-status-tokens` (off staging 026e142fc, KEIN check-token-audit-Baseline-Touch → Ratchet-Floor via delta<0)
**kunde = WHITELABEL** → Token branden via `var(--brand-*)` mit. **Umfang:** 48 Files / ~290 Vorkommen, **~170 migrate / ~30 leave** (4-Agenten-Triage).

## Mapping (etabliert, #2640/#2647 — NICHT die Agenten-Erfindungen!)
`bg-X-50/100`→`bg-X-soft` · `text-X-700/800/900`→`text-X-strong` · `text-X-500/600`→`text-X` · `bg-X-500/600`→`bg-X` · `border-X-200/300`→`border-X/30` · hover:bg-X-100→`hover:bg-X/15` · Button `bg-X-600 hover:bg-X-700`→`bg-X hover:bg-X-strong`. (X = success/warning/danger; green/emerald→success, red/rose→danger, amber/orange/yellow→warning.)
**Agenten erfanden** `bg-warning-dark`, `border-success-30` (Bindestrich!), `bg-success/5` — DIE EXISTIEREN NICHT. Slash `/30`, `-strong` für Hover-Dunkel, `-soft` für `-50`.
**Substring-Falle:** Files mit `-500` UND `-50` → gezielte volle Strings (z.B. TerminLiveStatus, OffeneDatenBanner, ClaimStepper, PflichtdokumenteBanner haben `bg-X-500`).

## LEAVE (kein Status — kuratiert, bestätigt von Triage)
- **GoogleReviewPrompt.tsx** — KOMPLETT (Rating-Sterne amber/gold = NPS, kein Status)
- **Kennzeichenhalter.tsx** — KOMPLETT (physisches Nummernschild-SVG, hat schon Token-Audit-Skip-Header; EU-Gelb/TÜV-Norm)
- **KundeKbChat.tsx** — Kanal-Identität (#059669 SV-grün / #4573A2 KB-blau inline-Hex, keine Tailwind-Scale)
- **EskalierterAdminCard.tsx** L22 — `bg-amber-500/10` Mit-betreut-Signifier (Kanal, fraglich → LEAVE)
- **ClaimSummary.tsx** L466 — `text-red-600` negativer Geld-Betrag (Vorzeichen-Semantik = Data-Viz, kein Status)
- **KundeBetreuerStrip.tsx** L55 — `text-emerald-600` Verifizierungs-Badge (Trust-Marker)
- **SaeuleMeinGeld.tsx** L60 — `text-emerald-600` Finanz-Icon (kein Status; L65-67 red Totalschaden = MIGRATE)
- **NachbesichtigungPickerClient.tsx** L115 — delete-action-hover
- **TerminSectionCard.tsx** L364 — delete-button-hover (Rest des Files = MIGRATE)
- Delete-Hovers generell (`hover:text-red-*` auf Remove-Icons)

## Fortschritt
**Schritt 1 DONE (dieser PR):** 6 rein-Status-Komponenten OHNE `-500` (atomar sicher): AuszahlungCard(2), BankdatenBanner(9), BeratungBuchenSheet(4), DsgvoLoeschCard(12), KundeTerminCheckBanner(6), OrphanMatchBannerClient(3). 0 Reststände, Status 2842→2806.

## Reststrecke (priorisiert, frisch greppen!)
**Schritt 2 — Komponenten mit `-500` (gezielte Strings):** ClaimStepper(6), KundeAktivStatusHero(2), TerminLiveStatus(5), OffeneDatenBanner(6), PflichtdokumenteBanner(7), KundeSvLiveBanner(4 text-amber-50/emerald-100→soft), KundeAusfallEntschaedigungCard(6, accent-enum 'rose'/'amber'→'danger'/'warning'), KundeJetztZuTunCard(3 severity-map), KundeTerminVerschiebenModal(9), TerminVerlegungBanner(9), OffeneDatenBanner.
**Schritt 3 — Hotspots (Color-Maps):** TerminSectionCard(11, STATUS-config-Map + delete-hover LEAVE), KundeTermineClient(STATUS_BADGE+DOT_CLS Maps), KundeTerminDetailClient(17, STATUS_LABEL-Map), FallKarte(24, gemischt: live/critical Status MIGRATE, Phase-Dots claimondo-navy schon Token).
**Schritt 4 — app-routes:** termin/{KundeAnfahrtCard(7), BesichtigungsortCheck(6), KundeTrackingClient(8), LiveAnsichtOverlay(2), page.tsx}, faelle/[id]/{page(8 migrate, banner), FallDetailSections(4), kalender/KalenderClient(3)}, onboarding/{OnboardingWizard(16!), page(1 rose)}, nachbesichtigung/×3, re-termin, kunde-termin/×2, _components/{GutachterCard+KundenbetreuerCard unread-badge bg-red-500→bg-danger}.
**Misc:** SmokeKanzleiButton = DEV-Test-Tool (niedrige Prio, L109 bg-orange-600 custom LEAVE).

## Caveat: kunde/termin/[token]/page.tsx L70
`shadow-[0_8px_24px_rgba(52,199,89,.30)]` = emerald-Shadow-rgba. Der Brand-rgba-Ratchet (#2635) erfasst NUR Gradient-Fills, NICHT Shadows → kein CI-Block, aber Whitelabel-Leak. Optional zu `var(--brand-success)` — oder lassen (Schatten branden bewusst nicht, s. #2635-Doku).
