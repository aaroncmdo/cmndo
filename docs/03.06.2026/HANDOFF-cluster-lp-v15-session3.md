# HANDOFF — Cluster-LP v15 · Phase 3 Mobile-Sync (Session 3, 03.06.2026)

> Anschluss an Session 2 (`HANDOFF-cluster-lp-v15-session2.md`). SoT-Stand:
> Memory `project_cluster_lp_v15`. Dieses Doc = der ausführliche Bauplan-Anschluss.

## 🌟 TL;DR

Session 2 hatte Phase-3 **#1/#2/#3** + Assets/Theme live. **Diese Session (3) gebaut + lokal verifiziert + committed + gepusht:**
Phase-3 **#4 Netzwerk-Mobile**, **#5 Ablauf-Timeline**, **#7 Einsatzgebiet-Map-Card**, **#8 FAQ-Feinschliff**.
**Noch LIVE zu deployen** (braucht Aaron VPS_SSH_PASSWORD) + **#6 Über-uns-Founder-Card** offen (Aaron-Name-Entscheid).

## 📍 Wo die Arbeit liegt

- **Worktree (eigen):** `.claude/worktrees/cluster-lp-v15-mobile-rest/`
- **Branch (eigen):** `kitta/cluster-lp-v15-mobile-rest` (forked off `kitta/cluster-lp-v15-page-fixes` @ 728394ed3)
- **PR:** **#2373** → base **`kitta/cluster-lp-v15-page-fixes`** (NICHT staging! Stacked-PR — Begründung s.u.), **CLEAN/MERGEABLE**.
- Apps: `kfz-gutachter-{wuppertal,duesseldorf,bonn}/` im Worktree.

### Commits dieser Session (alle auf PR #2373)
| Commit | Variante |
|---|---|
| `915a50b6a` | #4 Netzwerk-Mobile (Team-Card + 4 Pain-Cards + 8-Karten-Compare + CTA-v8) |
| `6cca533fe` | #5 Ablauf-Mobile (Tage-Timeline TAG-0..~TAG-32 + Tooltip + CTA-Welle) |
| `49af95cf9` | #8 FAQ-Mobile-Feinschliff (Sizing-Stufen + Klartext-Italic) |
| `71a403995` | #7 Einsatzgebiet-Mobile (Map-Card + Stats + Brennpunkte + Pills + CTA) |

### ⚠️ PR-Base-Korrektur (wichtig fürs Verständnis)
PR #2373 zeigte erst **CONFLICTING** gegen `staging`, weil mein Branch die **ganze Phase-3-Strecke** (Session 2 #1/#2/#3, NICHT auf staging — nur via Direct-VPS live) gegen staging trug. Ein Rebase auf staging hätte Session-2-Phase-3-Arbeit **zurückgerollt** (= `staging→feature`-Inzident-Klasse). **Fix = PR-Base auf den Parent-Branch umgehängt** → CLEAN, zeigt nur meine 4 Commits. Reversibel (`gh pr edit 2373 --base staging`). Strecke→staging = separater Merge-Session-Job.

## 🚀 DEPLOY — noch NICHT gelaufen (braucht Aaron-PW)

**`scripts/deploy-cluster-v15-mobile-rest.py`** (untracked, kombiniert #4/#5/#7/#8 = 9 Files). Direct-VPS, asset-safe (postbuild `copy-standalone.mjs` re-kopiert die bereits deployten VPS-Assets). `.bak-mobrest`-Rollback-on-build-fail. curl-verify-Marker für alle 4.

```powershell
$env:VPS_SSH_PASSWORD='<von Aaron>'; python scripts\deploy-cluster-v15-mobile-rest.py wuppertal; Remove-Item Env:\VPS_SSH_PASSWORD
# wuppertal live-verifizieren → dann:
$env:VPS_SSH_PASSWORD='<von Aaron>'; python scripts\deploy-cluster-v15-mobile-rest.py duesseldorf bonn; Remove-Item Env:\VPS_SSH_PASSWORD
```
Danach **Live-Smoke** (echte Assets) gegen `https://kfz-unfallgutachter-{c}.de/` — die `scripts/smoke-{netzwerk,ablauf,faq,einsatz}-mobile.py` nehmen BASE_URL als Arg.

## ✅ DONE + LOKAL VERIFIZIERT (Smokes grün, Screenshots in `docs/03.06.2026/smoke-*/`)

| # | Variante | Smoke | Kern |
|---|---|---|---|
| **#4** | Netzwerk-Mobile | 17/17 @390/360/1280 | `NetzwerkSection.tsx` sm:hidden-Block: Team-Hero-Card (teamImg-BG) + 4 Pain-Cards (IO-Reveal data-step) + Toggle→8-Karten Compare-Panel (Topic-Badges) + CTA-v8. JS in `SiteScripts`. Daten in `content.ts` (NETZWERK_PAIN + NETZWERK_COMPARE_MOBILE). `cluster.ts`: **teamImg + svName** (Persona "Tobias"). |
| **#5** | Ablauf-Mobile-Timeline | 13/13 | `AblaufSection.tsx` sm:hidden: Tage-Timeline (ABLAUF_TIMELINE) + 0€-Pill + End-Dot(€) + Nutzungsausfall-Tooltip (vanilla) + CTA-Welle. JS in `SiteScripts`. Desktop in `hidden sm:block`. |
| **#8** | FAQ-Feinschliff | 5/5 | `FaqAccordion.tsx` Classname-Sizing (py-9 sm:, H2-clamp, italic "Klartext", lead/akkordeon/button). globals-faq-@media war schon responsive. |
| **#7** | Einsatzgebiet-Map-Card | 14/14 (beide Karten Tiles) | `EinsatzgebietSection.tsx` sm:hidden: H2(city+region-Dativ) + Map-Card(#clusterMapMobile + 3 Stats) + Brennpunkte(main-only) + Pills + CTA. `MapSection.tsx` initialisiert **2 Karten** (per-Container-Observer). SEO-Text SHARED (mobile-first). |

**Gemeinsame Mechanik:** Komponenten byte-identisch über alle 3 (Edit wuppertal → `cp` d/b → md5-Verify). `cluster.ts`/`globals.css`-`:root` per-Cluster; der **Mobile-CSS-Block** in globals.css ist byte-identisch (md5-verifiziert) → d/b-Tail aus wuppertal rebuildt. Token-Map: `'Space Grotesk'`/Fraunces→`var(--font-display)`, `var(--ink/muted/paper)`→`var(--color-*)`, CTA-Rot→`var(--amber)` (Cluster-Portabilität); Topic-/Neutral-Grays bleiben fix.

### 🩹 Gelernte Fallen dieser Session
1. **Lightning CSS (Tailwind v4) droppt manche Plain-CSS-Rules** — `.einsatz-map{height:220px}` kam NICHT im kompilierten CSS an → Container 0px → Map unsichtbar. **Fix:** Strukturhöhe via **Tailwind-Utility** (`h-[220px] rounded-lg overflow-hidden relative isolate`) auf das Element, wie Desktop `h-[400px]`. Bei künftigen Plain-CSS-Layout-Properties auf neuralgischen Elementen: Tailwind-Utility bevorzugen oder kompiliertes CSS gegenprüfen.
2. **Zwei Leaflet-Karten, eine pro Breakpoint:** Init-on-Intersect löst den Split automatisch (display:none-Container intersected nie). `invalidateSize()` 250ms nach Init für Card-gehostete Container.
3. **Mock = SoT, aber Reduced-Motion-Lücken ergänzt** (cta-v8-role-live, ablauf-tl-item) — der Mock disablte nur Teilmengen.

## 🔴 #6 Über-uns-Founder-Card — OFFEN (Aaron-Name-Entscheid)

**Mock:** `#ueberUnsMobile` ab **Z.5415**, CSS `uu-quote-*` ab **Z.3685**. uu-quote-card = Quote italic + Signatur-Zeile (`avatar-tobias-{c}.png` + Name + "· DAT-Sachverständiger" + "Zertifizierter Claimondo-Partner" + `siegel-...-v3.svg`) + Trust-Pill-Row (DAT/BVSK/10+J/90+ Netz). Assets ✓ (deployed).
**Infrastruktur schon da:** `CLUSTER.svName` (Feld in cluster.ts, Default "Tobias") + siegel-v3 (von Session 2). → Bauen ist ~30 Min.
**BLOCKER (Aaron):** Eine **Testimonial-Quote** wird einer Person zugeschrieben → identitäts-sensibler als die CTA-v8-Rolle. **Echte SV-Namen pro Cluster** (dann `cluster.ts` svName je Cluster setzen) **oder** Persona "Tobias" beibehalten **oder** generisch ("Ihr Sachverständiger vor Ort")? Vor dem Bau klären.
**Ziel-Files:** `UeberUnsSection.tsx` (Mobile-Block + Desktop `hidden sm:`), `globals.css` ×3 (uu-quote-Block).

## 🚩 Offene Flags / Aaron-Decisions
- **VPS-PW** für den Live-Deploy von #4/#5/#7/#8.
- **svName** "Tobias" (Persona, matcht avatar-tobias-Asset, parallel Monika/Markus) — echte Namen pro Cluster? Governt #4-CTA-v8 + #6.
- **#7 SEO-Text auf Mobile:** Ich habe den per-Stadt-SEO-Absatz auf Mobile **sichtbar** gelassen (mobile-first-Indexing), obwohl der Mock ihn nur Desktop zeigt. Umstellen falls reine Mock-Treue gewünscht.
- **#7 Pills text-only** (keine Stadt-Thumbnail-Assets); **Brennpunkte non-link** (kein Sub-Page-Target). Mock hatte Pill-Images + Link-`→` — beides ohne reale Daten weggelassen.
- **quellenAnker** "Polizei-Jahresverkehrsbericht 2025" (Brennpunkte/FAQ) live = Faktenbehauptung — Provenienz bestätigen (Session-2-Flag, weiterhin offen).

## 📚 Referenzen
- **Master-Mock (SoT):** `Downloads/_v15_bundle/HANDOFF_CLAUDE_CODE_BUNDLE_v15_2026-06-02/02_spec_code/MASTER_preview-complete_v3-praxis-v2.html`
- Session-2-Handoff: `docs/03.06.2026/HANDOFF-cluster-lp-v15-session2.md`
- Deploy: `scripts/deploy-cluster-v15-mobile-rest.py` · Smokes: `scripts/smoke-{netzwerk,ablauf,faq,einsatz}-mobile.py` (untracked)
- Memory: `project_cluster_lp_v15`
