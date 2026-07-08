# AI-Redaktions-Loop für /wissen — Design-Spec

**Goal:** Ein kontrollierter Redaktions-Loop, in dem Claude Entwürfe für /wissen-Artikel schreibt, die ein Mensch (Aaron) prüft/editiert/freigibt, bevor sie live gehen — hält den GEO-Feed frisch (löst H1), vertieft den Content, gibt dem Kommentar-Feature mehr Flächen.

**Architektur:** DB-gestützte Artikel (Supabase), Generierung + Review in der Haupt-App (`src/`), Rendering + Feed-Union in Marketing (`claimondo-marketing/`). Publishing = Status-Flip in der DB (kein Deploy pro Artikel). Zwei-Stufen-Gate: Themen-Vorschlag → Freigabe → Draft → Freigabe.

**Tech-Stack:** Next.js 16 (beide Apps), Supabase (shared DB, untypisierte Clients → kein Types-Regen), `src/lib/support/anthropic-client.ts` (Claude, bereits ~15 Consumer), Markdown-Render-Pipeline aus `claimondo-marketing/lib/content/claimondo-mdx.ts` (wiederverwendbar, arbeitet auf Body-String).

## Global Constraints (nicht verhandelbar)

- **Kein Auto-Publish.** AI-Rechtscontent geht IMMER: Draft → menschlicher Faktencheck/Edit → publish. Der Review-Gate ist Pflicht (RDG/Haftung/Halluzination).
- **Autor = Aaron Sprafke** (Person-Schema, `/autor/aaron-sprafke`-Hub existiert). Byline ist durch den Pflicht-Review verdient — nicht durch Knopfdruck.
- **Eigene DPIA-Phase** (EDPB Opinion 28/2024) als Launch-Gate-Doc — auch wenn das Datenschutz-Risiko gering ist (s. §10).
- **Umlaut-Pflicht** in allen nutzersichtbaren Texten (Artikel-Body, Admin-UI-Labels).
- **DDL nur via Supabase-Plugin** (Regel 2), File == getrackte Version.
- **Server-Actions:** Result-Object `{ ok, error? }`, kein throw; `requireRole(['admin'])`-Gate + `createAdminClient()` (service-role) — exakt wie die Kommentar-Moderation.

## Abhängigkeit / Reihenfolge

Die `/wissen/[slug]`-Render-Route verwendet **`ArticleComments`** (Kommentar-Feature, Branch `kitta/artikel-kommentare`, noch nicht auf staging). **Reihenfolge:** Kommentar-Feature merged zuerst nach staging → dann baut dieses Feature darauf auf. Alternativ die Kommentar-Einbindung erst nach dem Merge nachziehen (Render funktioniert auch ohne). Kein anderer harter Kopplungspunkt.

## Architektur-Überblick

| Ort | Verantwortung |
|---|---|
| **Haupt-App `src/`** | Generierung (Cron + `anthropic-client.ts`), Review-Portal `/admin/wissen-artikel` |
| **Marketing** | Rendering `/wissen/[slug]`, Feed-Union (`lib/feed/news-items.ts` + `katalog-items.ts`) |
| **Shared Supabase-DB** | `wissen_themen`, `wissen_artikel` — öffentlich lesbar nur `veroeffentlicht` (RLS) |

## §1 — Datenmodell (2 Tabellen, via apply_migration)

**`wissen_themen`** (Themen-Backlog + AI-Vorschläge):
- `id uuid pk default gen_random_uuid()`
- `titel text not null`, `kurzbrief text` (Angle/Brief), `begruendung text` (AI-Gap-Rationale)
- `primary_keyword text`, `cluster text` (H1…H8/SV/PILLAR-D-Taxonomie), `artikel_typ text` (glossar-spoke|decoder|cornerstone-ratgeber)
- `status text not null default 'vorgeschlagen'` CHECK ∈ (`vorgeschlagen`,`freigegeben`,`abgelehnt`,`entwurf_erstellt`)
- `quelle text not null default 'ai_gap'` CHECK ∈ (`ai_gap`,`manuell`)
- `entschieden_von uuid`, `entschieden_am timestamptz`, `created_at timestamptz default now()`

**`wissen_artikel`** (die Artikel):
- `id uuid pk`, `thema_id uuid references wissen_themen(id)`
- `slug text unique not null`, `title text not null`, `body text not null` (Markdown)
- `excerpt text`, `key_facts text[]`, `meta_description text`, `primary_keyword text`, `cluster text`, `artikel_typ text`
- `status text not null default 'entwurf'` CHECK ∈ (`entwurf`,`in_review`,`veroeffentlicht`,`abgelehnt`,`archiviert`)
- `author text not null default 'aaron-sprafke'`, `ai_generated boolean not null default true`, `ai_model text`
- `reviewed_von uuid`, `reviewed_am timestamptz`, `veroeffentlicht_am timestamptz`, `last_modified date`
- `created_at timestamptz default now()`, `updated_at timestamptz default now()`

**RLS** (deny-by-default, wie Kommentare):
- `wissen_artikel`: `grant select` an `anon`+`authenticated` **nur** `where status='veroeffentlicht'` (Marketing-Render + Feed lesen öffentlich). Schreiben/Draft-Lesen ausschließlich service-role (Admin-Actions).
- `wissen_themen`: kein public-read; nur service-role (intern).
- Optionale `wissen_artikel_versionen` (Audit-Log, Version-History) → **Phase 2 / YAGNI für MVP**.

## §2 — Der Loop (Zwei-Stufen-Gate)

1. **Themen-Vorschlag** (Cron, Haupt-App): Claude bekommt die ~90 Bestandstitel + Cluster (+ optional Keyword-Seed) → Gap-Analyse → N Vorschläge in `wissen_themen` (`vorgeschlagen`) mit `begruendung`.
2. **Themen-Freigabe** (Admin): freigeben/ablehnen/Brief editieren → `freigegeben`.
3. **Draft-Generierung** (Cron oder on-approve): Claude mit strengem System-Prompt (s. §3) → strukturierter Output (Body + Meta) → `wissen_artikel` (`in_review`), Thema → `entwurf_erstellt`.
4. **Draft-Review** (Admin): Markdown-Body + Felder **inline editieren**, BGH-/§-Zitate + Fakten prüfen → freigeben (`veroeffentlicht`, `veroeffentlicht_am`, `reviewed_von/am`, `last_modified`=heute) oder ablehnen.
5. **Live:** `/wissen/[slug]` rendert, Feed nimmt den Artikel auf (frisches `pubDate` → H1-Freshness), kommentierbar (`ArticleComments articleSlug={`wissen/${slug}`}`).

## §3 — Generierung (`anthropic-client.ts` wiederverwenden)

Strukturierter Output (JSON-Schema/Tool-Use): `{ slug, title, excerpt(100–600), keyFacts(3–6), metaDescription(≤160), primaryKeyword, cluster, body(Markdown) }`.

**System-Prompt erzwingt:**
- House-Style der Bestandsartikel: H1-Titel, führendes `> **Kurz erklärt:** …`-Blockquote, `##`-Sektionen, `## Häufige Fragen` (FAQ), optional `## Schema (JSON-LD)`.
- **Pflicht-Belege:** BGH-Az./§§ inline — aber **nur real existierende** zitieren; bei Unsicherheit markieren statt erfinden (der Reviewer verifiziert; Halluzinierte Zitate sind der Haupt-Content-Risiko-Vektor).
- **Verbot:** konkrete Einzelfall-Handlungsempfehlung (RDG) — nur allgemeine Information + Disclaimer-Block.
- de, Umlaute korrekt.

## §4 — Rendering `/wissen/[slug]` (Marketing)

Neue Route `claimondo-marketing/app/[locale]/wissen/[slug]/page.tsx`:
- Liest `veroeffentlicht`-Artikel per Slug aus Supabase (anon-Client, RLS-gated), sonst `notFound()`.
- **Wiederverwendet** aus `claimondo-mdx.ts`: `stripLeadingSnippet`/`stripSchemaSection`/`extractHeadings`/`extractSchemaJson`/`extractCitations`/`readingTimeMin` + `MarkdownRenderer` — identisch zu den MDX-`[slug]`-Seiten (Body-String-basiert).
- Rendert: `ContentJsonLd` (Article-Schema, **author = Aaron/Person**), `AssetHero`, `TableOfContents`, `MarkdownRenderer(body)`, `RelatedAssets` (optional), `ArticleComments` (`wissen/<slug>`), `SpokeCtaBand`, `StickyCallBar`.
- Per-Slug-Mapping-Enrichments (`FAQ_STEMS_MAPPING` etc.) sind handkuratiert → AI-Artikel rendern ohne (der eigene `## Häufige Fragen`-Block rendert trotzdem via MarkdownRenderer). Kein Blocker.

## §5 — Feed-Union (Marketing)

`lib/feed/news-items.ts` + `katalog-items.ts`: nach dem MDX-Asset-Mapping zusätzlich `veroeffentlicht`-`wissen_artikel` laden (neuer Helper `lib/feed/db-articles.ts`) → auf `FeedItem` mappen → mergen + nach Datum sortieren. Frische AI-Artikel → frisches News-Top-Item → **löst H1**.

## §6 — Admin-Review-Portal (Haupt-App)

`src/app/admin/wissen-artikel/` (page + actions + Client-Komponenten), Nav-Item in `AdminNav` (wie „Kommentare"):
- **Sektion Themen:** Vorschläge (`vorgeschlagen`) — Freigeben/Ablehnen/Brief-Edit.
- **Sektion Drafts:** `in_review` — Markdown-Body + Felder inline editierbar (Textarea; Live-Preview = Phase 2), Freigeben (→publish) / Ablehnen. Optional „Draft generieren"-Button je freigegebenem Thema (Phase-1-Trigger).
- Actions: `requireRole(['admin'])` + `createAdminClient()` (service-role, kein neues RLS) — exakt wie Kommentar-Moderation. `revalidatePath` für `/admin/wissen-artikel`; Publish revalidiert nichts in Marketing nötig (Marketing rendert dynamisch/liest DB je Request).

## §7 — Legal-Guardrails & Autor/Transparenz

- Guardrails im System-Prompt (§3) + Reviewer verifiziert Zitate/Fakten = die Kern-Mitigation.
- Autor = Aaron (Person-Schema), verdient durch Pflicht-Review. **Empfehlung (optional, Aarons Entscheidung):** dezente Methodik-Zeile am Artikel („mit KI-Unterstützung erstellt, redaktionell geprüft von Aaron Sprafke") für Transparenz.
- Standard-Disclaimer-Block („allgemeine Information, keine Rechtsberatung") — konsistent mit dem Kommentar-Disclaimer.

## §8 — Bau-Reihenfolge (Zielarchitektur = voller autonomer Loop)

- **Phase 1 (Pipeline-Beweis):** Datenmodell + Generierung (erst **manuell getriggert** je freigegebenem Thema, „Draft generieren"-Button) + Review-Portal + `/wissen/[slug]` + Feed-Union → **ein echter Artikel** end-to-end durch den Legal-Gate.
- **Phase 2 (Scharfschaltung):** Themen-Vorschlag-Cron (Gap-Analyse) + Draft-Scheduler → autonomer Loop; optional echte Keyword/Search-Daten (Ahrefs/GSC-API). Audit-Log-Tabelle. Live-Preview im Review.
- *Begründung:* Der erste automatische Draft darf nicht ungetestet durch den Gate. Gleiche Zielarchitektur, sichere Reihenfolge.

## §9 — Offene Parameter (Default-Vorschlag)

- Kadenz: wöchentlich, 2–3 Themen-Vorschläge, 1 Draft je Freigabe. Konfigurierbar (Cron-Schedule + N).
- Gap-Quelle: Phase 1 = Bestandstitel/Cluster; Phase 2 = echte Search-Daten.

## §10 — DPIA (eigene Phase, Launch-Gate)

Kurz-DPIA-Doc separat. Erwartetes Ergebnis: **Datenschutz-Risiko gering** — das Feature verarbeitet keine personenbezogenen Daten (Input = Themen-Titel/Content-Gaps, Output = allgemeiner Rechtscontent). EDPB 28/2024 (AI) betrifft primär personenbezogene Trainings-/Inferenz-Daten — hier nicht einschlägig. **Reales Risiko = inhaltlich** (Halluzination/falscher Rechtscontent) → Mitigation = Pflicht-Review + Zitat-Verifikation + RDG-Verbot. DPIA dokumentiert das + den Review-Gate als Kern-Maßnahme.

## §11 — Out of Scope (YAGNI, MVP)

Multi-Autor, WYSIWYG-Editor (Markdown-Textarea reicht), i18n-Übersetzung der AI-Artikel (de-only zuerst), Bild-Generierung, Auto-Internal-Linking über `related` hinaus, Versionierungs-UI (Audit-Log-Tabelle = Phase 2), echte Search-Daten (Phase 2).

## §12 — Erfolgskriterien

Ein Thema kann vorgeschlagen (oder manuell geseedet), freigegeben, als AI-Draft generiert, vom Admin editiert + freigegeben, veröffentlicht werden → live unter `/wissen/[slug]`, im Feed (frisches `pubDate`), kommentierbar — **ohne Deploy pro Artikel**. Build grün (beide Apps), RLS-Smoke (anon sieht nur `veroeffentlicht`), Generierung liefert validen strukturierten Output.
