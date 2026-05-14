# Audit: verschüttete Arbeit durch den `8f088031`-Merge ("staging in iOS-Glass-Polish")

**Stand:** 12.05.2026 · **Auslöser:** `/gutachter/heute` zeigte nur noch eine Tageskalender-Rail statt des Mapbox-Cockpits → Spurensuche ergab eine ganze Klasse von Regressionen aus *einem* schlecht aufgelösten Merge.

---

## 1 · Was ist passiert

Commit **`8f088031` "merge: staging in kitta/design-system-ios-glass-polish integriert"** hat den `staging`-Branch in den `kitta/design-system-ios-glass-polish`-Branch gemergt. Die beiden Eltern:

- `8f088031^1 = d984e847` — der Glass-Polish-Branch-Tip. **War weit voraus**: hatte u. a. die PRs #559/#561/#568/#617/#624 (SV2-Heute-Cockpit, AAR-872 Privat-Stops, Pitch-Tween, "Cinematic-Cockpit Polish") + den Feldmodus-Cinematic-Sprint + #709–#747 (i18n, Mapbox-Isochrone, WhatsApp-Baileys, …) + die iOS-Glass-Token-Migration.
- `8f088031^2 = d0d41e93` — `staging` zum Merge-Zeitpunkt. **War zurück** (älterer Stand vieler SV-UI-Dateien).

Bei den Konflikten in den SV-UI-Dateien wurde mehrfach **die ältere `staging`-Seite genommen** statt der `^1`-Seite → der Glass-Polish-/Cinematic-Stand dieser Dateien wurde überschrieben. Der Folge-Commit `693f97f8 "fix(ts-cleanup): TS-Errors nach iOS-Glass-Polish-Sweep aufgeräumt"` hat's nicht bemerkt (tote Imports/Handler triggern keine TS-Fehler). `8f088031` ist auf `main` → **Production betroffen**.

### Wie gefunden
1. `8f088031` ist Vorfahre von `origin/main` (`git merge-base --is-ancestor` ✓).
2. Schnittmenge der Datei-Listen `git diff --name-only 8f088031^1 8f088031` ∩ `git diff --name-only 8f088031^2 8f088031` = Dateien, bei denen der Merge ein Blend/eine Auswahl beider Eltern ist = die echten Konflikt-Auflösungen (~30+ Dateien, inkl. `app/dispatch/*`, `app/admin/_components/*`, `lib/*` — hier nur die `app/gutachter/*` tief geprüft).
3. Pro Datei `git diff --numstat 8f088031^1 origin/main -- <file>` (was fehlt ggü. Glass-Polish) vs `git diff --numstat 8f088031^2 origin/main -- <file>` (wie nah ist `main` an `staging-alt`). Kleines `^2→main` + großes `^1→main` ⇒ Merge hat `staging`-Version quasi verbatim genommen = **bestätigte Regression**.

---

## 2 · Bilanz pro Datei (`app/gutachter/*`)

| Datei | `^1→main` | `^2→main` | Verdikt | Was verloren ging |
|---|---:|---:|---|---|
| `heute/HeuteClient.tsx` | (≈full render) | groß (Fix drin) | ✅ **GEFIXT — PR #835** | Mapbox-Tagesroute-Background, Isochrone-Overlay, GlassPanel-Sidebar mit `TerminCard`s + Pflichtdoku-Stats, Pitch-Tween → Feldmodus, `PrivatStopAddSheet` (AAR-872). Restauriert aus `8f088031^1` (Component-APIs matchten 1:1). |
| `feldmodus/AktuellerStopCard.tsx` | +46 −156 | **+46 −6** | 🔴 **bestätigt — verbatim staging** | Die C9-Glass-Version der "aktueller Stop"-Card: expandierbar (Kennzeichen, Pflichtdoku-Liste, Kurz-Briefing-Accordion, Amber-Warnungen), `bg` transparent damit der Glass-Effekt vom `GlassPanel`-Wrapper durchkommt. Teil von #617 "Cinematic-Cockpit Polish". |
| `feldmodus/FeldmodusClient.tsx` | +48 −95 | +266 −15 | 🟠 **Teil-Regression** | `main` ist ≈ Glass-Polish minus ~47 netto — der Rest des Cinematic-Clients überlebte, aber spezifisch verloren: `feldmodusTerminChannelSuffix = useId()` (der Supabase-Realtime-Channel-ID-Fix! → ohne den kracht's bei Multi-Render), das Glass-Card-Overlay über der Map (`GlassPanel` mit `SvFallakteView` + `FokusHeader`), `navy/30 backdrop-blur`-Layer. |
| `auftraege/AuftragCard.tsx` | +25 −74 | **+14 −3** | 🔴 **bestätigt — verbatim staging** | "Portal-Review SV4"-Header: Mobile-Header (`<lg`, Name prominent + Kennzeichen-Badge + Fahrzeug), Desktop-Header, `FahrzeugRenderImage` mit Gradient-Overlay (`from-black/35`). #640 ("Fahrzeug-Render 45° + größeres Auto") hat danach nur minimal angefasst (`^2→main` = +14−3) — der SV4-Header kam *nicht* zurück. |
| `fall/[id]/page.tsx` | +16 −88 | **+2 −2** | 🔴 **bestätigt — verbatim staging** | `aktiverTerminVerstrichen`-Logik + die Amber-/Rose-Termin-Status-Warnbanner (`border-2 border-amber-300 bg-amber-50` / `border-rose-300 bg-rose-50`) in der SV-Fallakte. |
| `profil/ProfilClient.tsx` | +47 −105 | +53 −17 | 🟠 **wahrsch. Regression** | `FieldRow`-Component, responsives `sm:flex-row`-Field-Layout, Anschrift-/Profiltext-Rows, `ROW_WRAPPER_CLS`/`ROW_LABEL_CLS`. `main` hat seit `staging-alt` +53 dazu — evtl. teilweise re-added; genauer Diff nötig. |
| `kalender/SVKalenderClient.tsx` | +25 −64 | +53 −17 | 🟠 **wahrsch. Regression** | GCal-connected-Header-Badge (`<StatusBadge tone="success">Google Calendar verbunden`), Wochen-Navigation ("← Zurück" / "Heute" / "Weiter →"), Google-Logo-SVG, "Gebucht"-Labels. |
| `feldmodus/FeldmodusMap.tsx` | +35 −35 | n/a | ✅ ok (Blend, netto ±0) | — |
| `GutachterShell.tsx` | +45 −42 | n/a | ✅ ok (netto −3, seither sauber gepflegt) | — |

**Cluster-Hinweis:** `AktuellerStopCard.tsx` + `FeldmodusClient.tsx` (+ ggf. `FokusHeader`/`FokusChatPanel`/`RouteSidebar`, die der Merge mit ±1 Zeile angefasst hat) gehören zusammen — `AktuellerStopCard` auf die C9-Version zurückzuholen heißt evtl. auch, wie `FeldmodusClient` sie einbettet/welche Props sie übergibt anzupassen. → **als ein PR behandeln.**

**Noch nicht geprüft:** dieselbe Konflikt-Auflösung in den ~20 Nicht-`gutachter`-Dateien aus der Schnittmenge (`app/dispatch/leads/[id]/_phases/*`, `app/dispatch/leads/[id]/DispatchShell.tsx`, `app/admin/_components/*Widget.tsx`, `lib/claims/lifecycle.ts`, `lib/dispatch/findBestSV.ts`, `lib/leads/convert-lead-to-claim.ts`, `lib/kalender/caldav/client.ts`, `lib/google-calendar/busy-slots.ts`, …) — niedrigere Priorität, aber `lib/`-Dateien mit großen Netto-Löschungen (`findBestSV.ts -240`, `convert-lead-to-claim.ts -375`, `caldav/client.ts -281`, `lifecycle.ts -76`) sollten gegengecheckt werden (oder das sind legitime staging-Refactors — Diff je Datei nötig).

---

## 3 · Warum kein Blind-Copy

`HeuteClient.tsx` ließ sich per `git show 8f088031^1:HeuteClient.tsx > HeuteClient.tsx` restaurieren, weil zwischen `8f088031^1` und `main` *nur* `693f97f8 ts-cleanup` lag (ein No-op nach dem Restore). **Bei den 6 anderen liegt zusätzlich `869c437f "AAR-864: SV-Termin-Verlegung + leads.rueckruf_geplant_am + Feldmodus-Fixes"` dazwischen** (plus `f7521ae7 token-migration`, `adc49a23 jsx-fix`) — ein Blind-Copy auf `8f088031^1` würde AAR-864 (echtes Feature) zurückrollen. → **chirurgischer Splice nötig:** aktuelle `main`-Version nehmen, die *konkret* verlorenen Glass-Polish-Blöcke aus `8f088031^1` zurückholen, mit AAR-864s Änderungen abgleichen. Pro Datei: `git diff 8f088031^1 origin/main -- <file>` lesen → die `-`-Blöcke identifizieren, die Feature/Layout sind (nicht token-Renames) → in die aktuelle Version splicen → `tsc --noEmit` (+ voller `npm run build` bei `page.tsx`-Routen, `NODE_OPTIONS=--max-old-space-size=8192` — Default-Heap OOMt) → Component-Props/Imports gegen den aktuellen Stand verifizieren.

---

## 4 · Plan (empfohlene Reihenfolge)

1. **Feldmodus-Cluster** (`feldmodus/AktuellerStopCard.tsx` + `feldmodus/FeldmodusClient.tsx`, ggf. `FokusHeader`/`FokusChatPanel`) — höchster Wert (das "übelst aufwendige" Cinematic-Cockpit, analog zu Heute), 1 PR. Achtung: `FeldmodusClient` braucht den `useId()`-Channel-Suffix zurück (Realtime-Crash-Fix). Build: `feldmodus/page.tsx` ist eine Route → voller Build.
2. **`auftraege/AuftragCard.tsx`** — der SV4-Header + `FahrzeugRenderImage`-Gradient-Overlay. Mit #640 abgleichen (das aktuelle Auto-Render behalten, den Header-Layout-Teil zurückholen). 1 PR.
3. **`fall/[id]/page.tsx`** — Termin-Status-Warnbanner + `aktiverTerminVerstrichen`. Self-contained inline-JSX, aber Route → voller Build. 1 PR.
4. **`profil/ProfilClient.tsx`** + **`kalender/SVKalenderClient.tsx`** — Layout/Header (`FieldRow`/responsive Felder bzw. GCal-Badge + Wochen-Nav). Ggf. zusammen, beide self-contained Client-Components.
5. **Nicht-`gutachter`-Sweep** — die `lib/*`- + `dispatch/*`- + `admin/_components/*`-Konflikt-Dateien gegenchecken (separates Ticket, niedrigere Prio).

**Koordination:** alles in eigenem Worktree off `origin/main`; der parallele Frontend-Konsolidierungs-CC fasst `gutachter/heute|feldmodus|fall|auftraege|profil|kalender/*` in keinem Plan an → kein Overlap. Jeweils PR + Merge auf Aaron-OK.

**Lehre:** beim Mergen eines *zurückliegenden* Branches (`staging`) in einen *vorausliegenden* (Feature-Sprint-Branch) ist die Default-Konfliktauflösung gefährlich — pro Datei muss bewusst "unsere" (= die voraus-Seite) gewählt werden, sonst rollt der Merge Feature-Arbeit zurück, ohne dass es einen TS-Fehler gibt. Künftig: solche Merges mit `git merge -X ours` als Start + datei-weise Review der Konflikte, oder gar nicht `staging → feature` sondern `feature → main` + `main → staging`.

---

*Querverweis: `docs/12.05.2026/heute-cockpit-regression-fix.md` (der erste, schon gefixte Fall — PR #835). PRs für die übrigen Fixes werden hier nachgetragen.*
