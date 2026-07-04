# Cross-Rollen Doppel-UI-Audit (04.07.2026)

**Auftrag (Aaron):** „audite alle Rollen auf Doppel-UIs, wir normalisieren und führen zusammen was ineinander geführt werden kann thematisch." + „markiere es als *muss neu geauditet werden* wenn da jetzt was gebaut wird."

**Methode:** 5 parallele Read-only-Subagenten, je ein thematischer Cluster über alle Portale (`kunde`, `gutachter`/SV, `kanzlei`, `dispatch`, `admin`, `makler`, `werkstatt`, `mitarbeiter`/KB). Alle Findings gegen den **staging**-Stand verifiziert (der `main`-Stand, gegen den einige Agenten liefen, lag teils dahinter — z.B. war das Dispatch-Dashboard schon zu 80% migriert).

## ⚠️ Kernwarnung — Audit ist zonenweise STALE

Zum Audit-Zeitpunkt bauen **6+ Sessions parallel** quer durch die Portale. In diesen Zonen veraltet dieses Audit *während es geschrieben wird*, und es kann **neue** Doppel-UI entstehen. Jede so betroffene Zone ist unten mit **🔴 MUSS NEU GEAUDITET WERDEN** markiert. **Dort NICHT auf Basis dieses Reports refactoren** — erst nach Merge der jeweiligen Session neu auditen.

Status-Legende:
- ✅ **ERLEDIGT** — konsolidiert + PR (kollisionsarm, gemerged/offen).
- 🟢 **MACHBAR (isoliert)** — keine aktive Session drin, sauber umsetzbar.
- 🔴 **MUSS NEU GEAUDITET WERDEN** — aktive Session baut in/an der Zone → Findings stale, Re-Audit nach deren Merge.

---

## ✅ Erledigt (kollisionsarm, diese Session)

| Cluster | Fix | PR |
|---|---|---|
| Rückruf-Erledigen-Flow 2× verbatim (`dispatch/leads/RueckrufTerminPanel` + `dispatch/rueckrufe/RueckrufActions`) | shared `@/components/shared/rueckruf/RueckrufErledigenForm` (State/Logik einmal, `variant` panel/compact); toter `RueckrufListItem` gelöscht | **#3618** (−194 LOC) |
| Dispatch-Dashboard: 3 handgerollte Listen-Cards | → shared `Panel` (+ `ul/li` auf divider-Body geflacht) | **#3621** |
| totes `src/components/ChatChannel.tsx` (0 Consumer) | gelöscht (knip-Baseline nachgezogen) | **#3620** |

---

## Theme 1 — Termine · Kalender · Rückrufe · Slots  🔴 MUSS NEU GEAUDITET WERDEN
**Aktive Sessions:** `kitta/rueckruf-caldav-sync` (SVKalenderClient / v_belegung / dispatch+admin-Kalender-Plumbing), `kitta/aar-956-embed-reservierung-rueckruf` (Self-Service-Slot-Familie, `TerminDetailActions`), `kitta/sv-live-ops-karte` (neue SV-Termin-Sichten).

- ✅ Rückruf-Erledigen-Flow — erledigt (#3618).
- 🔴 **Kalender-Grids (5+)**: `dispatch/kalender`, `admin/kalender`, `gutachter/kalender/SVKalenderClient`, `kunde/termine`, `mitarbeiter/termine`, `admin/_components/TageskalenderWidget` — jeweils eigene Grid-Impl + eigene `typ→farbe/label/icon`-Maps + Berlin-TZ-Format. Empfehlung (nach Re-Audit): shared `terminTypTokens`-Map + `AgendaDayList` + `CalendarWeekNav` extrahieren; die 3 Voll-Grids (Zeitachse vs Monat vs Agenda, + versch. Backing-Tables `gutachter_termine`/`admin_termine`/`termine`) bleiben getrennt.
- 🔴 **Token-Terminvorschlag-Shell** (`sv/termin/[token]` ↔ `kunde-termin/[token]` — Mirror-State-Machines annehmen/gegenvorschlagen/ablehnen).
- 🔴 **Gegenvorschlag-Slots-Modal** (`gutachter/termine/[id]/TerminDetailActions` + `SVKalenderClient` + Token-Variante) — aar-956-Hot.
- 🔴 **TerminCard/StatusBadge**: shared `TerminCard` = **0 Importer** (verwaist), Status→label/color 5× dupliziert (kunde list/detail + Token-Flows). Revive + `terminStatusUi()`-Helper.
- ✅ bereits geteilt (nicht anfassen): `self-service/SvSlotAuswahl` (aar-956-Zone), `shared/termin/TerminPicker`, `WunschterminPicker`.

## Theme 2 — Kommunikation · Chat · Kontakt-Cards
**Aktive Sessions:** `aar-956` (SV-Kontakt-Cards in `FallDetailClient`).

- ✅ totes `ChatChannel.tsx` gelöscht (#3620).
- 🔴 **SV-Kontakt-Cards** (`gutachter/fall/[id]/_components/AnsprechpartnerCard` + `FallakteDrawer.TeamListe`) → **rendern `team` 2× auf einem Screen**, ~90% identisch, sollen in shared `FallKontakteCard` (existiert, 3 Adopter) — **aar-956-Hotzone** (`FallDetailClient`).
- 🟢 **Kanzlei-Kontakt-Cards** (`shared/claims/KanzleiAnsprechpartnerBlock` ↔ `components/kunde/kanzlei/MeineKanzleiCard`, ~70% Overlap) → eine „Kanzlei-Kontakt"-Card mit `variant` (QR vs Vollmacht-Status). **Berührt NICHT das shared `FallKontakteCard`** → aar-956-frei, isoliert machbar. Effort M.
- 🟡 **Chat-Bubble-Renderer (5)** (`MultiChannelChat`/`ChatTimelineView`/`KundeKbChat`/`FokusChatPanel`/`MaklerChatTab`) — divergiert, eigenes Ticket `<ChatThread layout=…>` (Juni-01-Chat-Inbox-Audit, L). Inbox-Sidebar (`ChatInboxLayout`) ist bereits konsolidiert (nichts tun).

## Theme 3 — Abrechnung · Finance · Provisionen  🔴 MUSS NEU GEAUDITET WERDEN
**Aktive Session:** `kitta/kanonische-partner-abrechnung` — baut GERADE das kanonische `v_partner_billing`-Admin-Cockpit, das die internen Rechnungs-Listen **subsumiert/umstrukturiert**. Das komplette interne Abrechnungs-Cluster ist damit in Bewegung.

- 🔴 **Interne Admin-Rechnungs-Listen 3×** (`admin/abrechnungen/AbrechnungenListClient`, `admin/finance/(hub)/AbrechnungenSection`, `admin/kanzlei-abrechnungen`) — gleiche „Positionen-Tabelle + Status-Badge + mark-paid/storno" über versch. Tabellen; 2 hitten sogar dieselbe `abrechnungen`-Tabelle. **→ genau das vereinheitlicht `v_partner_billing`. Der Abrechnungs-Session überlassen, danach re-auditen.**
- 🔴 **Makler↔Werkstatt Partner-Provisions-Dashboard** (`MaklerAbrechnungen` ↔ `WerkstattAbrechnungen`, Werkstatt sagt im Header „Gespiegelt nach MaklerAbrechnungen") — near-verbatim, extern/per-Empfänger → bleibt getrennt, aber `PartnerProvisionDashboard` + `provisionStatusVisual`-Helper wären ein sauberer Dedup. **Beide Files werden von der Abrechnungs-Branch mit-editiert → dagegen rebasen, nicht gegen staging.**
- **Bleibt getrennt (extern/per-Empfänger):** `kanzlei/abrechnung/[token]` (Magic-Link-Rechnung), `gutachter/abrechnung` (SV-Self-Service).
- Querschnitt: die internen Billing-Views sind die letzten Halter von rohen Tailwind-Status-Farben (`bg-green-100`/`bg-emerald-50`/…) → Status-Tokens beim Umbau (Boy-Scout, durch die Abrechnungs-Session).

## Theme 4 — Fall-/Claim-Detail · Stammdaten · Dokumente  🔴 MUSS NEU GEAUDITET WERDEN (SV-Teil)
**Aktive Sessions:** `aar-956` (`gutachter/fall/[id]/FallDetailClient` + `_components/*`), `sv-live-ops-karte` (neue SV-Sichten). **Datenlage post-CMM-49:** alle Rollen lesen dieselbe Quelle (admin/KB/SV/makler via `v_faelle_mit_aktuellem_termin`, kunde via `v_claim_full`) → jede Merge hier ist reine Frontend-Arbeit ohne Daten-Divergenz.

- 🔴 **SV-Stammdaten mid-migration**: `StammdatenReadSection` wurde geschrieben um `StammdatenAccordion`/`StammdatenDetail` (~630 LOC) zu ersetzen, ist in `FallDetailClient` sogar importiert — aber hinter `{false && …}`-Gate. Swap fertigstellen = ~630 LOC weg. **aar-956-Hot + UX-Entscheidung (flacheres Layout).**
- 🔴 **SV-Dokumente**: `gutachter/WeitereDokumenteCard` + `kanzlei/kanban/DokumenteDrawer` hand-rollen Datei-Listen (3× `DOKUMENT_TYP_LABEL`) statt shared `DokumenteDownloadListe`; toter `FallDokumenteSidebar`-Orphan (nur Type-Import in `FallDetailClient:60` übrig). **aar-956-Hot.**
- 🟢 **Makler-Stammdaten**: `MaklerAkteDetail.OverviewPanel` hand-rollt Kunde/Fahrzeug/Gegner-Blöcke, obwohl `StammdatenReadSection` eine `'makler'`-Rolle hat → migrieren. Makler-Sessions aktuell idle → isoliert machbar, Effort S. (Vor Umsetzung `git log` gegen makler-Branches prüfen.)
- ✅ Admin/KB-Stammdaten (`_stammdaten/Sections` + `SchemaFields`) = einzige inline-editierbare Variante → bleibt getrennt (legit).

## Theme 5 — Dashboards · Portal-Shell/Nav · Listen  🔴 MUSS NEU GEAUDITET WERDEN (Shell/Nav)
**Aktive Session:** `kitta/netzwerk-in-portalen` — arbeitet in den Portal-Shells/Nav.

- ✅ Dispatch-Dashboard-Cards → `Panel` (#3621).
- 🔴 **PortalShell-Composite** (höchste LOC-Ersparnis ~250-400): Root-Wrapper + Spotlight + `md:ml-56`-Content + Mobile-Glass-Header sind 6× copy-pasted (`admin/layout`, `dispatch/layout`, `MaklerShell`, `WerkstattShell` + Light-Twin `kanzlei/layout`+`mitarbeiter/layout`). `PortalNav` (Sidebar) ist schon geteilt; das **Scaffold drumherum** nicht. **netzwerk-in-portalen baut in genau dieser Shell → jetzt = garantierter Trample. Nach deren Merge re-auditen + extrahieren.**
- 🟢 **StatCard-Adoption-Lücken** (Boy-Scout, isoliert): `admin/sla/page` (3 handgerollte KPI-Boxen → `StatCard tone=…`), `MaklerDashboard`-Aktivitäts-Card → `Panel`. Effort S.
- 🔴 **KundeNav/GutachterShell** hand-rollen `isActive`+Nav-Render (Branding/Badge-Gründe) — niedrige Prio, blockiert auf `PortalNav`-Brand-Mode. netzwerk-in-portalen-adjazent.
- ✅ **Tabellen**: vollständig auf `DataTable` konsolidiert (51 Files, 0 inline-`<thead>`) — nichts zu tun.

---

## Was JETZT noch isoliert machbar wäre (kein aktiver Session-Overlap)
1. **Kanzlei-Kontakt-Card-Dedup** (`KanzleiAnsprechpartnerBlock` + `MeineKanzleiCard` → eine Card mit variant). Theme 2, Effort M. **Berührt NICHT FallKontakteCard/aar-956.**
2. **Makler-Stammdaten → `StammdatenReadSection` rolle='makler'**. Theme 4, Effort S. (makler-Branches vorher gegenchecken.)
3. **StatCard-Boy-Scout** (`admin/sla`, `MaklerDashboard`). Theme 5, Effort S.

## Re-Audit-Trigger
Diese Zonen nach dem jeweiligen Merge neu auditen (Doppel-UI kann sich verschoben haben ODER neu entstanden sein):
- **Termine/Kalender** → nach `rueckruf-caldav-sync` + `aar-956` + `sv-live-ops-karte`.
- **Abrechnung (intern)** → nach `kanonische-partner-abrechnung` (`v_partner_billing`-Cockpit).
- **Fall/Stammdaten/Dokumente + SV-Kontakt-Cards** → nach `aar-956` + `sv-live-ops-karte`.
- **PortalShell/Nav** → nach `netzwerk-in-portalen`.
