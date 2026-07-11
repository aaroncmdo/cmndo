# Audit — Makler-Fallakte (2026-07-11)

Vollaudit der gesamten Makler-Fallakte (`/makler/akten/[id]`) auf Auftrag Aaron („audite die gesamte fallakte für den makler"). Surface: `page.tsx` → `MaklerAkteDetail` (4 Tabs: Übersicht/Timeline/Chat/Copilot) + `MaklerChatTab` + `MaklerCopilotTab` + `getMaklerFallDetail`/`getFallChat` (`src/lib/makler/queries.ts`) + `maklerSendMessage` + `/api/makler/copilot` + `copilot-prompt.ts` + Shell/Layout. DB-Fakten per Supabase-MCP (project `paizkjajbuxxksdoycev`) verifiziert.

## Severity-Übersicht

| # | Severity | Bereich | Kurz |
|---|---|---|---|
| **F1** | ~~CRIT~~ → **INFO (widerlegt)** | Daten | „Claim-Views leer" war ein Service-Role-Artefakt meiner MCP-Queries — für authentifizierte Makler liefern die Views Zeilen. |
| **F2** | **HIGH** (funktional + Privacy-Entscheidung) | Chat/RLS | Der Chat-Tab **liest den Gruppenchat nicht** — keine RLS-Policy gibt dem Makler SELECT außer auf eigene Nachrichten. Der Banner verspricht das Gegenteil. |
| **F3** | **HIGH** (Korrektheit + Cross-Surface-Inkonsistenz) | Gutachten-Felder | View gatet `reparaturkosten`+`wertminderung` für Makler auf NULL → Übersicht zeigt leere Zeilen + **falsche (zu niedrige) Gesamtforderung**; der **Copilot bypassed das Gate** (admin-Read) und zeigt die Werte doch. |
| **F4** | LOW | Diverse | Copilot-„Kontext geladen"-Badge hart an; „Consent: Vollzugriff" statisch; Timeline-Doppelquelle; Makler-Unread-Count strukturell immer 0 (Folge von F2). |
| **F5** | LOW (Plattform) | Chat-Insert | `nachrichten`-INSERT für `thread_id IS NULL` von jedem Authenticated erlaubt (ermöglicht den Makler-Write, aber breit). |

**Verifiziert OK:** Consent-Gating (Detail-Redirect, Copilot-403, send-message), Copilot-Datenminimierung (WBW/Restwert/Totalschaden bewusst raus), Stammdaten/Fahrzeug/Gegenseite-Feldmapping, Kunde-Lead-Fallback (in **PR #4106** gefixt).

---

## F1 — „Views leer" WIDERLEGT (Lernnotiz)
Meine MCP-Queries (`count(*) FROM v_faelle_mit_aktuellem_termin` → 0) liefen als **service_role**. `v_claim_base` endet mit `WHERE claim_sichtbar_fuer_aktuellen_user(sub.id)` (Security-Barrier-View). Für service_role ohne `auth.uid()` filtert die Funktion alles weg → 0 Zeilen. `claim_sichtbar_fuer_aktuellen_user` enthält den Makler-Zweig (`c.makler_id …` + `makler_fall_consent`), also sehen authentifizierte Makler ihre Fälle. **Kein Bug.** (Notiz für künftige Audits: Claim-Views nie als service-role zählen — immer die Sichtbarkeitsfunktion mitdenken.)

## F2 — Chat-Tab liest den Gruppenchat nicht (HIGH)
`getFallChat` liest `nachrichten` via **RLS-Client**, gefiltert auf `kanal IN ('gruppenchat','chat_gruppe_mit_makler')`. Keine SELECT-Policy gibt dem Makler diese Zeilen:
- `staff_fall_scoped` (ALL) = `can_access_claim(claim_id)` = admin/dispatch **oder** kundenbetreuer-eigener-Claim — **kein Makler**.
- `nachrichten_select_public_consol` (SELECT) gewährt `gruppenchat` nur bei `sender_id=me OR empfaenger_id=me OR geschädigter=me` — ein Makler ist nichts davon; `chat_gruppe_mit_makler` steht gar nicht in der Kanal-Liste.
- Thread-Policy braucht `thread_id` (Gruppenchat hat keinen).

→ **Der Makler sieht nur selbst gesendete Nachrichten.** Empirisch bestätigt (alle Makler-Consent-Fälle: `makler_own_visible=0`). Folge: `getUngeleseneChatCount` (`neq('sender_id', userId)`) ist strukturell **immer 0** (der Makler kann keine fremden Nachrichten selektieren). Der Info-Banner „Sie sehen Nachrichten zwischen Kunde, Kundenbetreuer und Gutachter" ist **falsch**.

Der **Write** funktioniert (via `nachrichten_thread_insert_member_only`, `thread_id IS NULL → allow`); Kunde/KB/SV sehen die Makler-Nachricht über ihre eigenen Policies. Also **Einweg-Spiegel**: Makler sendet, sieht aber keine Antworten im Portal.

**Entscheidung nötig (Aaron):**
- **(A) Makler soll die Team-Konversation sehen** → dedizierter Makler-inklusiver Kanal `chat_gruppe_mit_makler` (der Name ist schon reserviert!) + eine eng gescopte SELECT-Policy (`kanal IN ('gruppenchat_makler-sichtbar') AND aktiver vollzugriff-Consent`). Der interne `gruppenchat` bliebe privat — sauberere Trennung als heute.
- **(B) Makler ist bewusst write-only** → Banner korrigieren („Ihre Nachrichten erreichen das Team; Antworten kommen per …") + Unread-Badge/Read-Pfad anpassen.

Ich habe **nicht** unilateral eine RLS-Policy hinzugefügt — den internen Team-Chat einem externen Makler freizuschalten ist eine Produkt-/Datenschutz-Entscheidung.

## F3 — Gutachten-Werte: View gatet Makler aus, Copilot bypassed (HIGH)
`v_claim_base`: `reparaturkosten` und `wertminderung` sind `CASE WHEN rolle_sieht_gutachtenwerte() THEN sub.… ELSE NULL END`. `rolle_sieht_gutachtenwerte()` = `service_role OR NOT (rolle IN ('makler','werkstatt'))` → **für Makler FALSE**. `nutzungsausfall_gesamt` + `gutachter_honorar` sind **nicht** gegatet.

Konsequenzen in `MaklerAkteDetail` OverviewPanel „Gutachten-Ergebnis":
1. Zeilen „Reparaturkosten" + „Wertminderung" zeigen dem Makler immer **„–"** (View-genullt) — leere, verwirrende Zeilen.
2. `gesamtforderung = reparaturkosten + wertminderung + nutzungsausfall + honorar` → für den Makler faktisch nur `nutzungsausfall + honorar` → **die angezeigte „Gesamtforderung" ist irreführend niedrig** (die größten Posten fehlen). Auch die Quick-Stat „Geschätzte Regulierung" (`schadens_hoehe_netto ?? gesamtforderung`) erbt das, wenn `schadens_hoehe_netto` NULL ist.
3. **Cross-Surface-Inkonsistenz/Leak:** `copilot-prompt.ts` liest `reparaturkosten_netto` + `minderwert` aus `v_gutachten_werte` via **admin-Client** (bypassed die Rolle-Gate) und stellt sie dem Makler im KI-Kontext bereit. Die DB-Policy versteckt diese Werte vor dem Makler — der Copilot zeigt sie. **Eine der beiden Sichten ist falsch.**

**Entscheidung nötig (Aaron):** Soll der Makler `reparaturkosten`/`wertminderung` sehen?
- **Ja** → Detail an den Copilot angleichen: die 4 Gutachten-Werte in `getMaklerFallDetail` aus `v_gutachten_werte` via admin-Client lesen (wie `copilot-prompt.loadContext`), statt aus den gegateten View-Spalten. Dann ist `Gesamtforderung` korrekt.
- **Nein** → Übersicht: Zeilen `reparaturkosten`/`wertminderung` für Makler ausblenden + `Gesamtforderung` neu definieren (oder ausblenden / `schadens_hoehe_netto` nutzen) **und** den Copilot an `rolle_sieht_gutachtenwerte` angleichen (die zwei Werte aus dem KI-Kontext nehmen) — sonst bleibt der Leak.

Nicht blind gefixt, weil (a) die intendierte Policy Aaron gehört und (b) die Claim-Views gerade aktiv migriert werden (s. u.).

## F4 — Kleinkram (LOW)
- **Copilot-Badge**: `<MaklerCopilotTab … kontextLoaded />` → immer `true`; „Fall-Kontext geladen" leuchtet immer, obwohl der Kontext erst beim ersten Senden serverseitig geladen wird. Kosmetisch.
- **Quick-Stat „Consent"**: hart `"Vollzugriff"` (Seite redirected sonst) — statischer, wenig informativer Wert.
- **Timeline-Doppelquelle**: `MaklerAkteDetail` baut die Timeline synthetisch aus Datums-Spalten (`buildTimelineForFall`), während der Copilot die echte `timeline`-Tabelle liest. Zwei „Timelines" mit potenziell abweichendem Inhalt.

## F5 — `nachrichten`-INSERT über-permissiv (LOW, Plattform)
`nachrichten_thread_insert_member_only` erlaubt Insert wenn `thread_id IS NULL` (ohne weitere Prüfung) für jeden Authenticated → jeder eingeloggte User kann eine `nachrichten`-Zeile in beliebigen `fall_id`/`kanal` schreiben (thread-loser Legacy-Pfad). Ermöglicht bewusst den Makler-Write, ist aber breiter als nötig. Plattform-Härtungs-Kandidat (nicht Makler-spezifisch).

---

## Plattform-Kontext (nicht diese Lane)
Die Claim-Views werden **gerade aktiv migriert** (CMM-49 „faelle-Drop"): `faelle`-Tabelle ist gedroppt; jüngste Migration `20260711113010 slice4_vclaimbase_null_cache_refs` (~Session `6f60c510` slice4-marketing-reader-prep). Die Makler-Queries (`getMaklerFallDetail`/`getMaklerFaelleList`/`getMaklerFaelleCounts`) lesen weiterhin `v_faelle_mit_aktuellem_termin` (die fall-zentrische Legacy-View). **Coupling-Risiko:** wenn CMM-49 diese View retired, müssen die Makler-Reads auf die claims-nativen Views (`v_claim_full` etc.) umziehen — sonst brechen sie. Kein Fix hier; Hinweis an die CMM-49-Lane.

## Empfehlung / nächste Schritte
1. **F3 zuerst** (Korrektheit + Leak): Policy-Entscheidung → alle drei Surfaces (Detail-View-Gate, Übersicht-UI, Copilot) angleichen. Höchster Kundenwert (falsche Forderungssumme ist geschäftskritisch für den Makler).
2. **F2**: Produktentscheidung A vs B; bei A den reservierten `chat_gruppe_mit_makler`-Kanal sauber mit Read-RLS ausbauen.
3. **F4/F5**: Opportunistisch.

Keine DDL/Code-Änderung in diesem Audit (außer dem bereits in PR #4106 gefixten Kunde-Lead-Fallback) — F2/F3 brauchen Aarons Policy-Entscheid + sind an die laufende CMM-49-Migration gekoppelt.
