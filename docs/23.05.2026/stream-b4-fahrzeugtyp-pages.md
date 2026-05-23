# Stream B.4 — Fahrzeugtyp-Pages (3 Konversions-Pages)

**Datum:** 2026-05-23 · **Branch:** `kitta/streamb4-fahrzeugtyp-pages` (off `staging`) · **PR:** gegen `staging`
**Sprint:** LLM-Visibility / GEO (Doc 26 Stream B, Tracking AAR-936) · **Vorlage:** B.1 `/kosten-kfz-gutachten` (#1605, gemergt)

## Was gebaut wurde

Drei bespoke Fahrzeugtyp-Konversions-Pages (höchster Value-per-Visitor laut F-006), repliziert nach
dem B.1-Muster (Hero navy + dual-CTA → Antwort-zuerst → strukturierte Sektion → Cross-Links →
`ConversionAnchorBlock` → `SpokeCtaBand`). JSON-LD je Seite: `serviceSchema` + `faqPageSchema` +
`breadcrumbsSchema`. Anchor = `cornerstone` (Service-Konversions-Page pro Fahrzeugsegment).

| Route | Vol | Fahrzeugtyp-USP | Strukturelement |
|---|---|---|---|
| `/motorrad-gutachter` | 300 | Sturz-/Rahmenschäden, Schutzkleidung als Schadensposition, Totalschaden-Quote, Wertminderung | Info-Card-Grid (4) |
| `/lkw-gutachter` | 100 | Gewerblicher Ausfallschaden (Vorhaltekosten / entgangener Gewinn) statt Pkw-Pauschale, Aufbauten | Vergleichstabelle |
| `/e-auto-gutachter` | 200 | Hochvolt-Batterie-Diagnose, schnellerer Totalschaden, merkantile Wertminderung, ADAS | Leistungsumfang-Checkliste |

Jede Seite hat ein **anderes Strukturelement** (Info-Cards / Tabelle / Checkliste) — kein Cookie-Cutter.

## Allowlist (307-Trap-Vermeidung)
Alle 3 Routen in `proxy.ts` MARKETING_PREFIXES + `middleware.ts` publicPaths + `sitemap.ts`
(Prioritäten 0.9 / 0.85 / 0.9).

## Compliance
- **BGH-Az.** nur verifiziert/etabliert: VI ZR 67/06 (SV-Kosten), VI ZR 357/03 (Wertminderung via Gutachten). §§ 249 BGB, BVSK/§ 287 ZPO.
- **Fachlich vorsichtig formuliert:** Motorrad-Nutzungsausfall als „einzelfallabhängig" (kein Pauschal-Anspruch); LKW gewerblicher Ausfall methodisch (Vorhaltekosten/entgangener Gewinn); E-Auto Hochvolt-Diagnose als Leistungsumfang (keine erfundenen Az.).
- **0-€-Aussage** mit § 249 BGB belegt; „unsere Partnerkanzlei" nirgends namentlich nötig (kein Kanzlei-Bezug auf diesen Seiten).
- **GEO** (Princeton): Answer-First, FAQPage (+40 %), Citations, Vergleichstabelle/Checkliste, interne Links nur auf reale Spokes (`dynamicParams=false`).

## Verifikation
- `tsc --noEmit`: **0 Fehler** (nach `.next`-Clear — siehe Lesson)
- `npm run check:token-audit`: **0 Verstöße** (1687 Files)
- `npm run build`: **Exit 0**, alle 3 Routen als `ƒ` (server-rendered, crawlbar)
- Dev-Smoke (`next dev` :3210): **HTTP 200** auf allen 3 Routen (kein 307)
- **Screenshots** (Playwright full-page, 1280px): alle 3 gerendert, gebrandet, B.1-konsistent, je eigenes Strukturelement, keine Glitches

## Lesson — Worktree-Branch-Wechsel + stale `.next`
Der Worktree wurde von `kitta/streamb2-misstrauens-pages` auf diesen Branch umgeschaltet (`git checkout -b … origin/staging`). Das `.next/types/validator.ts` (Next-Route-Type-Validator) war noch vom B.2-Build und referenzierte die B.2-Page-Module, die auf diesem Branch nicht existieren → `tsc`/`build` brach mit TS2307 auf den **B.2**-Pfaden ab (nicht den eigenen). Fix: **`rm -rf .next` vor dem ersten Build nach einem Branch-Wechsel im selben Worktree.** Danach Build/tsc grün.

## Offen / nächste B-Streams
- B.3 Schadenspositions-Twin-Pages (4) — **Aaron-Kannibalisierungs-Entscheid PENDING**, blockiert B.3.
- B.5 Cornerstone `/unfall-was-tun-als-geschaedigter` (5.000-Wort, braucht echte Copy) · B.6 Tool `/unfallskizze`.
