# Prod-Fehler-Bestandsaufnahme — 2026-07-14 (Playwright-Route-Sweep)

Punkt-in-Zeit-Snapshot der App-Gesundheit auf `https://app.claimondo.de`, erhoben per
authentifiziertem Chromium-Route-Sweep. **Read-only** (nur Navigation, keine Action-Klicks →
keine Writes/Comms). Reproduzierbarkeit: jeder Fund 2× bestaetigt bevor er als "echt" gilt.

## Methode & Harness

`scripts/prod-smoke/route-sweep.mjs` — loggt via GoTrue password-grant + Cookie-Injection ein
(umgeht die 2FA-UI), besucht eine Routen-Liste und erfasst pro Route:

- HTTP-Status des Dokuments · Redirect (→ /login = Zugriffsproblem)
- `console.error` + `pageerror` (React-Fehler)
- fehlgeschlagene API-Calls (Response ≥ 400), 401/403 und 5xx getrennt
- Error-Boundary-Text im **sichtbaren** Body (`document.body.innerText`), NICHT im HTML —
  sonst matcht Next.js' ins Client-Bundle eingebetteter Fallback-String auf *jeder* Seite
  (dieser False-Positive ist beim ersten Lauf aufgetreten und wurde gefixt).

Wichtig: `waitUntil: 'domcontentloaded'` + feste Settle-Zeit statt `networkidle` — die App haelt
Supabase-Realtime-Websockets offen, `networkidle` feuert nie → Timeout.

## Abdeckung

| Kontext | Routen | Quelle |
|---|---|---|
| admin | 41 (Nav 21 + Sub-Tools 20) | AdminNav + `src/app/admin/**/page.tsx` |
| kundenbetreuer | 11 | MitarbeiterNav |
| sachverstaendiger | 13 | GutachterShell-Nav |
| public/auth | 6 | manuell |

**Nicht abgedeckt (Luecken):** Detail-Views (Claim-/Lead-/Auftrag-Detail — prod hatte 0 Claims,
s.u.) · Portale kanzlei/makler/werkstatt/kunde/flottenmanager (keine Test-Zugangsdaten).

## Health-Zusammenfassung

| Rolle | OK | Funde |
|---|---|---|
| admin | 40/41 | content-studio 500 |
| kundenbetreuer | 11/11 | — |
| sachverstaendiger | 11/13 | community/team #310 (verifizierung = Mapbox, kein Bug) |
| public | 5/6 | /register 404 (vermutlich gewollt) |

## Echte Funde (reproduzierbar)

1. **`/admin/marketing/content-studio` → 500** (2/2). Dokument lädt (200), der Seiten-Daten-Fetch
   liefert 500. Root-Cause = VPS-Server-Logs. *(Parallele Session arbeitete zeitgleich an einem
   Server-Components-Render-Error auf marketing — sehr wahrscheinlich dieselbe Ursache.)*
   **Severity: Medium.**
2. **`/gutachter/community` + `/gutachter/team` → React #310** für SV ohne Mitgliedschaft/Org.
   Der Guard-Redirect landet korrekt auf `/gutachter/heute?error=…` (Toast), wirft dabei aber #310.
   Hängt an der bekannten „`/gutachter/heute`-Chunk dynamic-import #310"-Tech-Debt
   (`next.config.ts:96`). Kein sichtbarer Breakage. **Severity: Low (kosmetisch).**
3. **`GET /rest/v1/gutachter_termine` → 401** in der Fallakte-Detail (admin+KB, ausserhalb des
   Sweeps beobachtet). Sweep-untestbar, weil Detail-Views einen Claim brauchen (0 Claims).
   **Severity: Low–Med.**
4. **`holeOderErstelleDirektThread` (`src/lib/chat/thread-actions.ts:68`) ungated** — kein
   Claim-Zugriffs-Check (anders als die Geschwister-Actions `sendeThreadNachricht`/
   `ladeThreadNachrichten`). Jeder eingeloggte User kann einen DM-Thread an einem beliebigen
   Claim mit einem beliebigen User anlegen (Spam-/Social-Engineering-Vektor, kein Daten-Leak).
   **Severity: Medium (Security).**

## Kein Bug / Kontext

- `/gutachter/verifizierung` „Failed to fetch" = **Mapbox-Satellitenkachel** (externe Ressource).
- `/gutachter` direkt → **502** = Deploy-in-progress (Release-Session redeployte prod während des
  Sweeps). Test-Caveat: der Sweep rennt gegen laufende Deploys → einzelne 502 sind transient.
- `/register` → **404** (kein Public-Self-Registration; nur relevant falls irgendwo verlinkt).
- App-Root `/` → `/login` (App-Subdomain-Verhalten; Marketing lebt auf `claimondo.de`).
- Viele Alt-Tool-Routen redirecten sauber (200) unter die Hub-Routen (sachverstaendige→
  /admin/vertrieb, sla→/admin/faelle/sla, kanzlei-board→/admin/faelle/kanzlei, …).

## `anlegeFall`-Audit (Zusatzfrage: vollständig + operativ sinnvoll?)

`/admin/faelle/anlegen` legt strukturell vollständig an: `claim` + `faelle_claim_bridge` +
`claim_party` (geschädigter, mit `person_id`) + `lead`, via kanonischem `convertLeadToClaim`.
**Operativ sichtbar** im Admin-Fälle-Board (Phase Erfassung, Name/KB/SV korrekt gerendert).

ABER "dünn": **kein Kunden-Auth-Account** (`geschaedigter_user_id=NULL` → Kunde kann sich nicht
einloggen, ist kein Chat-Teilnehmer), kein Vehicle (ohne Kennzeichen), **0 pflichtdokumente,
0 tasks**, `schadenart='unbekannt'` (wenn nicht im Formular gesetzt → Dispatcher-Match-Filter
läuft ohne Filter). Für den beworbenen Use-Case „telefonisch reingekommen" plausibel by-design;
ob pflichtdok/tasks später generiert werden, war **nicht gegenprüfbar** (0 andere Claims).

**Methodische Korrektur:** Der Verdacht „Claim fehlt in `v_claim_full`" (dem Betriebs-View mit
142+ Consumern) war **falsch** — der View endet auf `WHERE claim_sichtbar_fuer_aktuellen_user(sub.id)`.
Die MCP-Query läuft als `postgres` mit `auth.uid()=null` → das Gate liefert für *jeden* Claim
`false` → 0 Zeilen. Ein echter eingeloggter Admin sieht den Fall (app-seitig verifiziert).

## ⚠ Daten-Zustand zum Zeitpunkt der Erhebung

Prod hatte **0 Claims / 0 Leads** — parallele „Purge"-Sessions hatten alle Test-Claims/Leads
gelöscht (Profile 35 + SVs 9 intakt). Das ist die Ursache der Detail-View-Abdeckungslücke und
sollte auf „keine echten Fälle verloren" verifiziert werden.

## Follow-ups

- Detail-Views + die `gutachter_termine`-401 nachziehen (braucht einen stabilen Test-Claim:
  `create-testfall.mjs` + reversibler `sv_id`-Write).
- kanzlei/makler/werkstatt/kunde/flotte-Portale (brauchen Test-Zugangsdaten).
- Funde 1–4 in die zuständigen Lanes routen (s. Memory `coordination-prod-error-inventory-2026-07-14`).
