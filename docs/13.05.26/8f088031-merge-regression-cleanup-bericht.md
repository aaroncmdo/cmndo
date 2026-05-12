# Aufräum-Bericht: Regressionen aus dem `8f088031`-Merge (+ CRITICAL Privilege-Escalation)

**Stand:** 13.05.2026 · **Auslöser:** „wo ist denn die Mapbox? aktuell ist da nur der Kalender" (`/gutachter/heute`) → Spurensuche ergab eine ganze Klasse von Regressionen aus *einem* schlecht aufgelösten Merge, plus eine separat gefundene CRITICAL-Lücke.

---

## 0 · Was ist passiert

Commit **`8f088031` „merge: staging in kitta/design-system-ios-glass-polish integriert"** hat den `staging`-Branch in den `kitta/design-system-ios-glass-polish`-Branch gemergt (diese Branch bündelte die #7xx-PRs — i18n/Marketing-Glassmorphism/gutachter-finder/gutachter.claimondo.de-B2B-Landing/Login-Glassmorphism — **plus** die iOS-Glass-Token-Migration). Bei den Konflikten in vielen UI- und `lib/`-Dateien wurde mehrfach **die ältere `staging`-Seite genommen** statt der vorausliegenden Feature-/Cinematic-Seite → Feature-/Layout-Arbeit zurückgerollt, **ohne TS-Fehler**. `8f088031` ist auf `main` → Production betroffen. Der Folge-Commit `693f97f8 „fix(ts-cleanup): TS-Errors nach iOS-Glass-Polish-Sweep aufgeräumt"` hat's nicht bemerkt (tote Imports/Handler triggern keine Build-Fehler).

**Forensik-Methode** (siehe `docs/12.05.2026/glass-merge-regression-audit.md` für Details): Schnittmenge `git diff --name-only 8f088031^1 8f088031` ∩ `… 8f088031^2 8f088031` = die echten Konflikt-Auflösungen; pro Datei `git diff --numstat 8f088031^2 origin/main -- <file>` klein ⇒ `main` ≈ `staging`-alt = **bestätigte Regression**; zusätzlich prüfen, ob ein *späterer* Commit (`869c437f`/CMM-28, #640, …) die Datei *absichtlich* geändert hat (dann kein Restore).

---

## 1 · Behoben (14 PRs)

| PR | Bereich | Was wiederhergestellt / gefixt |
|---|---|---|
| **#828** | 🔴 **CRITICAL** (separat, nicht aus `8f088031`) | `public.profiles.rolle`-Privilege-Escalation: jeder eingeloggte User konnte via `PATCH /rest/v1/profiles?id=eq.<own-uid>` `{"rolle":"admin"}` Admin werden (column-GRANT + RLS-Policy ohne WITH-CHECK + kein Trigger). Fix: Trigger `guard_profiles_rolle` (`BEFORE UPDATE OF rolle` + `BEFORE INSERT`). **Auf Prod appliziert + verifiziert.** Siehe `docs/12.05.2026/SECU/LIVE-SCHEMA-RLS-AUDIT-12.05.2026.md`. |
| **#835** | `gutachter/heute/HeuteClient.tsx` | Das ganze Mapbox-Tagesroute-Cockpit (Background-Map mit Stops + Active-Route + Verlegt-Stubs, Isochrone-„Mein Gebiet"-Overlay, GlassPanel-Sidebar mit TerminCards + Pflichtdoku-Stats, Pitch-Tween → Feldmodus, `PrivatStopAddSheet` AAR-872). Der Merge hatte den `return`-Block gegen einen reinen `TageskalenderRail` + KPI-Kästchen getauscht (Imports blieben, JSX gegutet). |
| **#836 / #839** | Doku | `glass-merge-regression-audit.md` (Forensik + Bilanz) + `glass-merge-regression-restore-plan.md` (per-Datei-Plan + Status). |
| **#840** | `gutachter/fall/[id]/page.tsx` | 3 Server-berechnete Termin-Warnbanner in `topServerBlocks`: rot „Termin verstrichen" (`aktiverTerminVerstrichen`), gelb „Termin durch Kunde verschoben" (`hatNeueKundeVerlegung` via RETURNING), rose „Termin(e) verpasst" (`no_show_count` — **Korrektur:** kommt jetzt aus `faelle`, nicht mehr aus `claims` — Spalte ist umgezogen+umbenannt). `VorOrtTriggerCard`/`geforderterBetrag` (CMM-32) behalten. |
| **#841** | `gutachter/auftraege/AuftragCard.tsx` | **Befund korrigiert:** der „SV4-Header" war *keine* Merge-Regression — er wurde bewusst durch **CMM-32** ersetzt (Kennzeichen prominent, Fall-Nr klein). Die *echte* Regression: der Merge hat zwei Header-Block-Versionen konkateniert → AuftragCard rendert Kennzeichen/Fahrzeug/Fall-Nr ein zweites Mal. → doppelter Block entfernt. #640-`FahrzeugRenderImage` (`width=180`, `LackfarbeCode`) unverändert. |
| **#843** | `gutachter/profil/ProfilClient.tsx` | SV-Profil-Felder wieder mobile-responsiv (`flex-col sm:flex-row gap-1 sm:gap-2`, Label `sm:w-36 sm:shrink-0`). Der Merge hatte die `ROW_WRAPPER_CLS`/`ROW_LABEL_CLS`-Konstanten + den SV7-Form-Audit-Kommentar behalten, aber `EditRow`/`ControlledRow`/`SelectRow`/`FieldRow` + die View-Rows + den Avatar-Header auf die nicht-responsive Inline-Variante zurückgerollt. `AvatarUpload` + alle aktuellen Felder unverändert. |
| **#844** | `gutachter/feldmodus/FeldmodusClient.tsx` | `useId()`-Channel-Suffix wieder in den Realtime-Channel-Namen (`feldmodus-termin-${terminId}-${suffix}`) + in die `useEffect`-Dependency. Verhindert den `cannot add postgres_changes callbacks after subscribe()`-Crash bei Doppel-Mount (`useId` war importiert, der Suffix beim Merge rausgeflogen). |
| **#845** | `gutachter/feldmodus/AktuellerStopCard.tsx` | Derselbe Channel-ID-Bug nochmal in *dieser* Datei: `channelSuffix = useId()` war da + in Deps + im Kommentar, aber **nicht im Channel-Namen** (`sv-termin-state-${terminId}` statt `…-${channelSuffix}`) → Suffix appliziert. |
| **#848** | `gutachter/feldmodus/AktuellerStopCard.tsx` | C9-Cockpit-Inhalt (auf der Auto-Arrive-Architektur reimplementiert, **nicht** Copy — AAR-864 hatte die Card neu geschrieben): Card-bg transparent (`bg-white shadow-sm` raus → GlassPanel-Wrapper liefert das Frosted-Glass); Smart-Collapse-Compact-Variante verdrahtet (`isCompact` aus Distanz + `manualMode`-Override; der Collapse-Toggle war tot — `void manualMode`); Vorschäden-Amber-Box; „Einzusammeln vor Ort"-Pflichtdoku-Liste; Auftrag-Typ-Badge; Briefing als Disclosure-Toggle (default collapsed); Maps-Link `min-h-12`. |
| **#850** | `gutachter/kalender/SVKalenderClient.tsx` | **Befund:** GCal-Badge + Wochen-Nav waren nicht weg, aber der Header-Bar hatte die responsive Variante verloren. Zurück: Mobile-Stack; zweistufiger GCal-Indikator (kompakt „Verbunden" / 36px-Google-Logo-Button vs. lang); Wochen-Buttons mit kurzen Labels (←/Heute/→) auf Mobile. AAR-864-Verlegungs-Logik unberührt. |
| **#855** | `lib/dispatch/findBestSV.ts` | 🔴 **echte Regression — der Grund für die „irgendwas ist faul"-Ahnung beim Dispatching.** Git-Historie belegt: `40486fb4` (#449 „ETA-aware Matching — Mapbox-Score + Adjacent-Reachability"), `3a93881b` (#451 „Slot-Vorschläge ETA-aware"), `63ed19fd` (#562 „pro-SV Wochentag-Blocking") waren auf `main`; der `8f088031`-Merge hat den `findBestSV.ts`-Konflikt zur älteren `staging`-Seite hin aufgelöst → ~232 Z. Dispatch-Matching verloren. **Prod lief seither auf einem Stopgap** (`const bueroEtaMap = new Map()` LEER → Fallback auf rohen `distanzKm` statt Mapbox-ETA; der Stopgap-Kommentar nennt es selbst „im Polish-Sweep verloren"). `reachability.ts`/`matrix.ts` haben den Merge überlebt. → glass-polish-Version (602 Z., strikter Superset) wiederhergestellt, Stopgap raus. (`869c437f`/CMM-28 hat die ETA-Logik dort nicht angefasst → sauberer Restore.) |
| **#858** | `gutachter/feldmodus/FeldmodusClient.tsx` | C9-Layout-Restructure: der Merge hatte ein Pre-#600-Layout eingeschleppt (staging's map + `lg:w-[380px]`-Sidebar-Split), inkohärent mit den C9-Floating-Cards + dem Mobile-Bottom-Sheet (SvFallakteView mountete auf Mobile-arrived doppelt). Zurück: Map = Full-Screen-Background; `FokusHeader`-Pill top-left (war importiert-aber-ungenutzt); arrived → `SvFallakteView` als zentrierter Modal-Popover über `navy/30 backdrop-blur-sm`-Backdrop (Aaron-Smoke MAP3) statt 380px-Sidebar; sonst → `AktuellerStopCard` mid-left + Kommende-Stops bottom-left als Floating-Glass-Cards; Mobile-Bottom-Sheet unverändert. Auto-Arrive-Logik/TBT/NaviHud/GPS-Banner/Wake-Lock/FokusChatPanel unangetastet. |

Jeder PR: `npm run build` (bei Routen) bzw. `tsc --noEmit` (Client-Components) grün; 7-Punkte-Audit im Commit-Body; Merge auf Aaron-Freigabe.

---

## 2 · Was *keine* Regression war / nicht angefasst wurde

- **`app/kunde/faelle/[id]/page.tsx`** — der Merge hat sie zwar gegutet (`+124 −645`), aber danach hat **CMM-28** sie *absichtlich* neu geschrieben (komplett auf claim-Loader `getKundeFallDetailRecord` umgestellt; bewusste Cleanups: `EskalationsErgebnisCard`/`FaqBotCard`/`ReFrageKanzleiClient`/`SaeuleMeinAnwalt`/`KanzleiAnsprechpartnerBlock`-Render raus → „Meine Kanzlei"-Card). Ein Restore würde CMM-28 (Architektur-Migration der CMM-Claim-as-SSoT-Strecke) zurückrollen. → **kein mechanischer Restore.**
- **`app/faelle/[id]/page.tsx` (Admin/KB-Fallakte)** — ebenfalls von `869c437f` (CMM-28-Sammel-Commit, erwähnt explizit „Admin-Fallakte Features (QC-Modal, OCR)") stark berührt → mit deliberatem Refactor verzahnt. → eigenes spec-bewusstes Ticket.
- **`app/flow/[token]/FlowWizardKfz.tsx`** — deprecated, nicht restaurieren.
- **`components/makler/*`, `admin/finance/(hub)/*`, `admin/_components/*Widget.tsx`, `dispatch/leads/_components/LeadsViewToggle.tsx`** — die „Netto-Löschung ggü. glass-polish-tip" hier ist NICHT der Merge, sondern die **parallele Frontend-Konsolidierung** des zweiten CC (Inline-Code → Shared-Abstraktionen: `ProvisionenClient`→`lib/statusLabels.ts` #846, `ui/table`→`shared/DataTable` #847/#849, `MaklerShell`→`PortalNav`, `MaklerAkteDetail`→`shared/fall-*` #838). → **dem anderen CC überlassen**, nicht anfassen.

---

## 3 · Offene Follow-ups (kein Code aus dieser Aktion — Tickets für CMM-28-Owner)

1. **Verwaiste Kunden-Cards** — `KundeAusfallEntschaedigungCard`, `KanzleiPfadCard`, `KundeBetreuerStrip`, `KundeAbschlussCard`, `GoogleReviewPrompt`, `BelegUploadCard` existieren in `src/components/kunde/` mit **0 Importen** (CMM-28 hat ihren einzigen Consumer entfernt). → Ticket: „CMM-28 Follow-up: verwaiste Kunden-Cards — bewusst weggelassen (löschen) oder übersehen (wieder einbinden)?"
2. **`app/faelle/[id]/page.tsx`** — CMM-28-verzahnte Stellen (VS-Korrespondenz-/Kanzlei-SLA-/Gutachten-OCR-Card) prüfen, ob beim CMM-28-Umbau bewusst entfernt oder relocated.

---

## 4 · Lehre (für künftige Merges)

`staging` (zurückliegend) in einen Feature-Sprint-Branch (vorausliegend) zu mergen ist gefährlich — die Default-Konfliktauflösung rollt Feature-Arbeit zurück, **ohne TS-Fehler** (tote Imports/JSX-Lücken kompilieren). Künftig:

- `git merge -X ours <staging>` als Start + datei-weise Konflikt-Review, **oder** gar nicht `staging → feature`, sondern strikt `feature → main` und danach `main → staging`.
- Nach jedem großen Merge die Diff-Stats gegen den Pre-Merge-Branch-Tip prüfen: `git diff --numstat <branch-tip> <merge>` — große Netto-Löschungen in UI-/`lib/`-Dateien sind ein Alarmsignal.
- `693f97f8`-artige „ts-cleanup nach Merge"-Commits sind ein **Verdachtssignal**, kein Entwarnungs-Signal: wenn ein Merge so viele TS-Fehler erzeugt, dass ein Cleanup-Commit nötig ist, hat er wahrscheinlich auch Funktionalität verschluckt.

---

*Detail-Docs: `docs/12.05.2026/glass-merge-regression-audit.md` (Forensik), `docs/12.05.2026/glass-merge-regression-restore-plan.md` (per-Datei-Plan + Status), `docs/12.05.2026/heute-cockpit-regression-fix.md` (der erste Fall), `docs/12.05.2026/SECU/LIVE-SCHEMA-RLS-AUDIT-12.05.2026.md` + `docs/12.05.2026/SECU/SECURITY-AUDIT-12.05.2026.md` (die CRITICAL + der RLS-Audit-Kontext).*
