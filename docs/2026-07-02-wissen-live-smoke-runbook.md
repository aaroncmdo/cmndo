# Live-Smoke Runbook — Wissen-AI-Redaktion + Kommentare (nach Deploy)

**Zweck:** die exakten Schritte, die ich fahre, sobald #3384 (AI-Loop) + #3387 (Kommentare) auf prod (oder einer Preview-URL) deployed sind — bis alles grün = 1+.

**Voraussetzungen:**
- #3384 + #3387 deployed (Marketing `claimondo.de` + App `app.claimondo.de`).
- Supabase: Email-OTP aktiv + `https://claimondo.de/auth/callback` (+ `/**`) in der Redirect-Allowlist (Kommentar-Login).
- **Seed liegt schon in Prod:** Artikel `freie-wahl-kfz-sachverstaendiger-unverschuldeter-unfall` als `in_review` (id `a5a91983…`).

## A · AI-Artikel-Loop

1. **Admin sieht Draft:** `app.claimondo.de/admin/wissen-artikel` → geseedeter Draft „Freie Sachverständigenwahl…" (in_review) sichtbar; Reviewer-Pflichthinweis (Zitat-Prüfung) sichtbar.
2. **Review + Publish:** Body/§§ prüfen (evtl. editieren), „Freigeben & veröffentlichen".
3. **Live-Render:** `curl -sL https://claimondo.de/wissen/freie-wahl-kfz-sachverstaendiger-unverschuldeter-unfall` → 200; enthält `<title>`, Body, Article-JSON-LD (`"author"` = Aaron Sprafke), TOC, Kommentar-Sektion.
4. **Feed-Union:** `curl -sL https://claimondo.de/feed.xml | grep -c freie-wahl` → ≥1 (frisches Item, pubDate = heute → löst H1-Freshness).
5. **Hub-Listing:** `curl -sL https://claimondo.de/wissen | grep -i "Freie Sachverständigenwahl"` → in Gruppe „Neu aus der Redaktion".
6. **Generierung live:** im Portal neues Thema anlegen → „Draft generieren" → valider Draft (2-Teile-Format, §§-Zitate, kein Truncate) → beweist prod-`ANTHROPIC_API_KEY` + der ganze Loop.

## B · Kommentare

7. **Netiquette:** `curl -sL https://claimondo.de/kommentar-regeln` → 200.
8. **Post-Flow:** auf einem Artikel E-Mail → Magic-Link (Postfach) → Username setzen → Kommentar → „wird geprüft".
9. **Moderation:** `app.claimondo.de/admin/kommentare` → Kommentar da → Freigeben → erscheint öffentlich am Artikel.
10. **Melden:** freigegebenen Kommentar melden → Admin-„Gemeldet"-Sektion zeigt ihn (report_count).

## C · Fix-Loop bis 1+

Jeder Fehler (404, Render-Bug, Feed-Miss, Login-Fail, Schema-Problem) → Root-Cause → Fix auf `kitta/wissen-ai-redaktion` (bzw. Folge-Branch) → PR → Re-Deploy → betroffenen Schritt re-smoken. Fertig, wenn A1–A6 + B7–B10 alle grün.

## Bereits pre-deploy verifiziert (Fundament)

- Generierung **robust** (2 echte Smoke-Fixes: BGH-Az-Härtung §§-only · 2-Teile-Body-Format behebt 33% Parse-Fehler); render-ready über viele Themen.
- **DB-Lifecycle + RLS prod-verifiziert** (in_review unsichtbar, published sichtbar via Render-Query; Security-Advisor clean an den neuen Objekten).
- Feed-Mapping/Parse **vitest** grün; tsc grün beide Apps.
