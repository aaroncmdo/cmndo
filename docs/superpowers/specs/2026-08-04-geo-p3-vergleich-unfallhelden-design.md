# GEO-P3 Sub-2 — Vermittlungsportale-Vergleich: Unfallhelden ergänzen (Design)

**Datum:** 2026-08-04
**Status:** Design (brainstorming) — Aaron-Review vor writing-plans (⚠ **UWG-Sanity-Check der Wettbewerber-Werte**)
**Branch:** `kitta/geo-p3-vergleich` (off origin/staging)

---

## Programm-Kontext

GEO-P3 (Flagship-Content), Sub-2. Datengetrieben durch die P1-AEO-Messung: für die Comparison-Queries **j02** („Vergleich Gutachter-Vermittlungsportale"), **t04** („beste Plattform Unfallschaden Abwicklung"), **t10** („digitale Schadensregulierung Plattform") taucht Claimondo nicht auf. Die bestehende Seite `/kfz-gutachter/vermittlungsportale-vergleich` ist **inhaltlich exzellent + neutral** (4-Wege-Direktvergleich, voller Schema-Stack, UWG-belegbar, ReviewerByline).

**Ehrlicher Befund:** Der große Hebel für „Vergleich/Test/beste"-Queries ist **off-site** (Dritt-Validierung — Stiftung Warentest/Trustpilot/Review-Blogs), = Aaron-Domain. Die **einzige buildbare On-Site-Lücke:** der Vergleich **lässt Unfallhelden aus** — laut Stiftung Warentest „Anwalt, Gutachter, Werkstatt aus einer Hand", also Claimondos **nächsten Full-Service-Konkurrenten**. Ein Vergleich ohne den Marktführer ist weniger vollständig/citable. (Inkrementeller Hebel — Aaron hat ihn bewusst gewählt.)

## Ziel

Die Seite auf **5-Wege erweitern (Unfallhelden ergänzen)** — recherchiert, **neutral, UWG-akkurat** — + Freshness (STAND) + t04/t10-Framing in den Metadaten. **Erfolgskriterium:** die Seite rendert die 5-Spalten-Tabelle korrekt auf Prod, Copy bleibt konsistent (keine „vier"-Reste), Wettbewerber-Aussagen faktisch belegbar.

## Unfallhelden-Werte (recherchiert von unfallhelden.de, ⚠ Aaron gegenlesen)

Pro Vergleichszeile (stil-konsistent zu den 4 bestehenden Spalten; bei Unklarheit neutral, nie behauptet):

| # | Kriterium | Unfallhelden |
|---|---|---|
| 0 | Geschäftsmodell | Full-Service „aus einer Hand" (Rechtsanwalt + Gutachter + Werkstatt + Ersatzwagen) |
| 1 | Erreichbarkeit | Online-Schadenmeldung + gebührenfreie Hotline (0800) |
| 2 | SV-Netz-Größe (öffentl.) | „deutschlandweites Netzwerk" (keine Zahl) |
| 3 | Vor-Ort-Besichtigung | ja (inkl. Lackschichtdickenmessung) |
| 4 | Online-only ohne Besichtigung | nein |
| 5 | Anwaltsanbindung | ja — spezialisierter Rechtsanwalt im Service |
| 6 | Kosten für Geschädigte | 0 € („kostet keinen Cent") |
| 7 | Whitelabel/Brand für SV | nein |
| 8 | Servicegebiet | deutschlandweit (DE) |

Quelle: `unfallhelden.de/page/gutachter.html` (Selbstdarstellung) + Stiftung-Warentest-Framing. **Konservativ:** keine Reaktionszeit-Behauptung (Seite nennt keine), Netz-Zahl „keine" statt raten.

## Architektur / Änderungen

**Keine neue Datei** — Erweiterung der bestehenden Seite + i18n. Kleiner, klar begrenzter Content-Edit.

### 1 · i18n (alle 6 Locales `de/en/tr/ar/ru/pl`, Paritäts-Gate)

- **`kfz_gutachter_vergleich.th_unfallhelden`** neu (Header „Unfallhelden").
- **`tabelle_rows[i].unfallhelden`** neu für alle **9 Zeilen** (DE = Tabelle oben; en/tr/ar/ru/pl übersetzt).
- **Count-agnostische Copy** (statt „vier→fünf" → **zukunftssicher**): folgende Keys von „vier"/„4 Plattformen" auf „die verglichenen Plattformen" o.ä. umschreiben — `tabelle_h2`, `tabelle_rows[7].claimondo` („einzige der vier" → „als einzige der verglichenen Plattformen"), `wann_cards[0].p`, `wann_cards[2].p_before`, `gemeinsam_h2`, `gemeinsam_capsule`, `faqs[0].antwort`, `faqs[4].antwort`, `faqs[5].antwort`, `fazit_p`. (× 6 Locales, sinngemäß.)

### 2 · `page.tsx` (`app/[locale]/kfz-gutachter/vermittlungsportale-vergleich/page.tsx`)

- Tabellen-`<Thead>`: neue `<Th>{t('th_unfallhelden')}</Th>` nach Unfallgiganten.
- Tabellen-`<Tbody>`: neue `<Td>{row.unfallhelden}</Td>` (Typ der `tabelle_rows`-Map um `unfallhelden: string` erweitern).
- **`STAND`** `'25.05.2026'` → `'04.08.2026'` (Freshness); `articleSchema.datePublished` bleibt 2026-05-25, `dateModified` → `'2026-08-04'`.
- **Hardcoded `FAQS_SCHEMA`** (Z. 56/76/81) + **`articleSchema.headline`/`description`** (Z. 110-112): „vier" → count-agnostisch (dieselbe Copy wie i18n, aber DE-Konstante fürs JSON-LD). Headline zusätzlich: „… Claimondo, Neogutachter, Unfallpaten, Unfallgiganten **& Unfallhelden**".
- **Quellen-Footnote** (Z. 266-271): `unfallhelden.de`-Link (nofollow) ergänzen.

### 3 · Metadaten (t04/t10-Framing)

- `page_meta.kfz_gutachter_vergleich.keywords` bzw. das `keywords`-Array (Z. 28-36): ergänzen um „beste plattform unfallschaden", „digitale schadensregulierung plattform", „unfallhelden alternative", „unfallhelden vergleich". (DE-Array in der page — prüfen ob i18n oder hardcoded.)

## Testing / Verifikation

- **Kein Unit-Test** (reiner Content/i18n-Edit, keine Logik). i18n-**Parität** verifizieren: alle 6 Locales haben `th_unfallhelden` + `tabelle_rows[*].unfallhelden` (Node-Diff wie beim Rechner).
- Turbopack-**Compile + Projekt-TypeScript** grün (fängt den erweiterten `tabelle_rows`-Typ + JSX).
- ⚠ **Voller Static-Prerender lokal blockiert** (Marketing-Supabase-Env fehlt; die Seite nutzt zudem `ladeSvLeads`/`ladeAktiveSVs` = DB) → Gate = `deploy-vps-marketing.yml` (Prod-Env, post-merge) + Regel-4-Prod-Smoke.

## Regel 4 (scharf — nutzersichtbare Route)

Nach Marketing-Deploy: `https://claimondo.de/kfz-gutachter/vermittlungsportale-vergleich` rendert 200 + **5-Spalten-Tabelle** (Unfallhelden-Spalte sichtbar, korrekte Werte); keine „vier"-Reste in Copy; Quellen-Footnote enthält unfallhelden.de. (Handoff, da Deploy post-merge auf main.)

## Nicht in Scope (YAGNI)

- Off-Site-Dritt-Validierung (Stiftung Warentest/Trustpilot) = Aaron-Domain.
- Neue Standalone-„beste Plattform"-Seite (Kannibalisierungs-Risiko).
- Weitere Wettbewerber über Unfallhelden hinaus.
- `sachverstaendiger-vs-gutachter`-Seite (separat, nicht Teil dieses Gaps).

## Offene Plan-Items

- i18n-Übersetzungen für 5 Nicht-DE-Locales (9 Zellen + Header + Count-Copy) — via Script (wie Rechner-i18n).
- Prüfen ob das `keywords`-Array hardcoded oder i18n ist.
- Marketing-`node_modules` (`npm ci`) für den Compile-Check.
