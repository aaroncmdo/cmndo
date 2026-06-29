# LinkedIn Auto-Posting — Einrichtung & Betrieb

Automatisches Posten der GEO-Wissens-Seiten auf die **Claimondo Company-Page**.
Cron erzeugt Entwürfe → Admin gibt sie unter **Admin-Portal ▸ Marketing ▸ LinkedIn**
frei → Veröffentlichung via offizieller LinkedIn Posts API.

Design/Plan: `docs/superpowers/specs/2026-06-29-linkedin-auto-posting-design.md`,
`docs/superpowers/plans/2026-06-29-linkedin-auto-posting.md`.

## Wie es funktioniert

```
Cron /api/cron/linkedin-drip (3×/Woche)
  → holt https://claimondo.de/feed.json
  → nimmt das neueste noch-nicht-gepostete Item
  → komponiert den Post (Claude + Template-Fallback)
  → legt ihn als Entwurf in linkedin_posts (status='entwurf')
        ⇣
  Admin ▸ Marketing ▸ LinkedIn: Entwurf prüfen/editieren → „Freigeben & posten"
  → Posts API postet als Company-Page (zieht die OG-Preview automatisch)
  → status='veroeffentlicht' + Post-URN gespeichert
  Fehler → status='fehlgeschlagen' + Admin-Benachrichtigung
```

## Einmalige Einrichtung (als Page-Admin)

### 1. LinkedIn-Developer-App
1. <https://developer.linkedin.com> → **Create app**, mit der **Claimondo Company-Page** verknüpfen.
2. Tab **Settings** → App über die Page **verifizieren** (Admin-Klick — das ist nur ein Page-Admin).
3. Tab **Products** → anfragen:
   - **Sign In with LinkedIn using OpenID Connect** (Login-Flow)
   - **Community Management API** (liefert `w_organization_social` — Org-Posting)
   Für eine eigene, verifizierte Page wird das i.d.R. gewährt (teils self-service, teils kurzer Review).
4. Tab **Auth** → die **Redirect-URL** eintragen:
   `https://app.claimondo.de/api/auth/linkedin/callback`
   → **Client ID** und **Client Secret** notieren.

### 2. ENV setzen (Vercel / Server)
```
LINKEDIN_CLIENT_ID=<aus dem Dev-Portal>
LINKEDIN_CLIENT_SECRET=<aus dem Dev-Portal>
LINKEDIN_ORG_ID=<numerische Org-ID ODER urn:li:organization:<id>>
LINKEDIN_REDIRECT_URI=https://app.claimondo.de/api/auth/linkedin/callback
MARKETING_FEED_URL=https://claimondo.de/feed.json   # default, nur bei Abweichung setzen
```
Bereits vorhanden: `CRON_SECRET`, `ANTHROPIC_API_KEY`.
Die Org-ID findet sich in der Company-Page-Admin-URL (`.../company/<id>/admin/`) oder
wird beim Verbinden automatisch über die Admin-Org ermittelt, falls `LINKEDIN_ORG_ID` leer ist.

### 3. Verbinden
Im Admin-Portal **▸ Marketing ▸ LinkedIn** auf **„LinkedIn verbinden"** → OAuth-Consent
als Page-Admin bestätigen. Der Org-Token landet (verschlüsselt-RLS, service-role only) in
`linkedin_oauth_tokens` und wird bei Ablauf (~60 Tage) automatisch per Refresh-Token erneuert.

### 4. Cron einrichten (VPS-Crontab)
3×/Woche (Mo/Mi/Fr 07:00). Kadenz frei wählbar:
```
0 7 * * 1,3,5 curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://app.claimondo.de/api/cron/linkedin-drip
```
Der Cron legt pro Lauf **einen** Entwurf an (nichts geht ohne Freigabe live).

## Betrieb

- **Entwurf prüfen/posten:** Admin ▸ Marketing ▸ LinkedIn → Text ggf. anpassen → „Freigeben & posten".
- **Überspringen:** ein Item, das nicht gepostet werden soll → „Überspringen" (bleibt im Ledger, wird nicht neu gezogen).
- **Fehlgeschlagen:** Publish-Fehler erzeugt eine Admin-Benachrichtigung; Status `fehlgeschlagen` kann erneut freigegeben werden.
- **Token abgelaufen / „nicht verbunden":** erneut „LinkedIn verbinden" (überschreibt den alten Token).

## Tabellen

- `linkedin_posts` — Ledger + Freigabe-Queue (admin-RLS).
- `linkedin_oauth_tokens` — OAuth-Token (deny-all RLS, nur service-role; Secrets).

## Externe Abhängigkeit

Das Org-Posting setzt die **Community-Management-API-Freigabe** voraus (Schritt 1.3). Bis
diese erteilt ist, läuft die gesamte App-Seite (Cron, Entwürfe, Queue), nur der finale
Publish-Call liefert „nicht verbunden" bzw. einen Scope-Fehler.
