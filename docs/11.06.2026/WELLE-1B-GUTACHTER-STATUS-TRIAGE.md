# Welle 1b — gutachter Status-Token-Migration (Triage + Handoff)

**Datum:** 2026-06-11 · **Branch:** `kitta/gutachter-status-tokens` (off staging, KEIN check-token-audit-Baseline-Touch → Count sinkt, Ratchet passt, Baseline-Senkung als Follow-up wenn #2640 gemergt)
**Umfang:** ~453 Status-Scale-Zeilen in gutachter, davon **~193 migrate / ~35 leave** (2-Agenten-Triage).

## Mapping-Rezept (raw → Token, alle existieren)
- GRÜN→success · ROT→danger · AMBER/ORANGE/GELB→warning
- `-50/100`→`-soft` · `-700/800/900`→`-strong` · `-500/600`(text)→base · `-500`(bg)→base · `border-200/300`→`/30`
- `-100`/`-300`-Zwischen → Opacity-Variante (`bg-success/20`, `border-success/50`)

## LEAVE (kein Status — kuratiert)
- **feldmodus** NaviHud / OfflineStatusBanner / TbtBanner = Navi/Netzwerk/Wetter-Ampel, KEIN App-Status
- **JetztBalken** (heute) = Zeit-Marker („jetzt"-Position), kein Danger-Status
- **community** Leaderboard-Medaillen (amber/orange Rang-1/2/3) = Trophy-Dekoration
- Delete/Entfernen-Action-Hovers (`hover:text-red-*` auf Remove-Icons)
- Map-Marker, Wetter-Particles, Rating-Sterne, Schaden-Typ

## Fortschritt (PR #2647)
- **Schritt 1 DONE:** heute/TerminCard + auftraege/AuftragCard (Commit f7106c31b).
- **Schritt 2 DONE:** fall/[id]/page.tsx (4 Banner: verstrichen/verschoben/no-show/stellungnahme) + fall/[id]/FallDetailClient (Vorschäden) + termine/[id]/BesichtigungsortKorrektur (Trust+Error) + auftraege/TagesvorbereitungButton (Error) + faelle/page (Auszahlung-Badge) + verifizierung/page (SA-Vorlage + Tier-2 + 2 Badge-Funktionen) + willkommen/WillkommenClient (Anzahlung-Warnung + Checkout-Error + Pflicht-Sterne). 0 Reststände, Status 3091→3000.

## Cluster 1 (PRÄZISE, file:line) — heute/fall/termine/kalender/auftraege
**SCHRITT 1 (standard-Mappings, hoch-konfident):**
- `heute/TerminCard.tsx` — 10 (L30/38/40/45/49/79/92/145/177/282)
- `auftraege/AuftragCard.tsx` — 6 (L161/162/186/187/194/195)
- `fall/[id]/FallDetailClient.tsx` — 2 (L432/434)
- `fall/[id]/page.tsx` — 4 (L203/580/581/582)
- `termine/[id]/BesichtigungsortKorrektur.tsx` — 3 (L47/48/60)
- `auftraege/TagesvorbereitungButton.tsx` — 1 (L66)
- `faelle/page.tsx` — 1 (L203)
- `heute/TagesrouteSidebar.tsx` — 15 (L86/100/104/106/110/114/177/276/282/350/351/353/357/387/435; L484 delete-hover=LEAVE)

**SCHRITT 3 DONE:** `kalender/SVKalenderClient.tsx` — 12 migriert (overdue Dark-Variante `bg-red-50/80 text-red-300 hover:bg-red-900/80` → `bg-danger-soft/80 text-danger hover:bg-danger-strong/80`; verlegung/reserviert/ablehnen/gegenvorschlag-Modals). L519 `hover:text-red-500` (✕ Slot-entfernen) = LEAVE (delete-action). Gezielte volle Strings statt blind replace_all (File hat `bg-amber-500`/`bg-red-600` → Substring-Falle). Status 3000→2975.
**LEAVE (bestätigt):**
- `heute/JetztBalken.tsx` — Zeit-Marker
- `community/page.tsx` — Trophy-Medaillen

## Cluster 2 (UNSCHARF — Schätzungen, braucht Re-Triage mit file:line)
~145 migrate über: willkommen/WillkommenClient (15), feldmodus/{FeldmodusDokumentSlot(6), AktuellerStopCard(4)}, termine/[id]/{TerminDetailActions(12), vor-ort/VorOrtClient(3)}, verifizierung/page (10), abrechnung/page (6, 1 pricing-LEAVE), profil/ProfilClient (2), team/TeamClient (6), fall/[id]/_components/* (~20), components/gutachter/* (~15), gebiet/page, layout.tsx, reklamationen, PolizeiberichtUpload, etc.
→ Vor Migration pro File exakt nachgreppen + Wetter/Navi/Netzwerk/Trophy aussondern.

## Nächste Portale (nach gutachter)
kunde (101, whitelabel, low-collision) → admin (289) / dispatch (538) — **dispatch erst wenn cmm49-Sweep durch** (Kollision).
