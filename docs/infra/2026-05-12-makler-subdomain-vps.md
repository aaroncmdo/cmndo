# VPS-Infra: Subdomain `makler.claimondo.de` einrichten

**Datum:** 2026-05-12
**Ausführen auf:** Claimondo-VPS (der Server, auf dem der Prod-Next-Prozess + nginx laufen)
**Rolle:** reine Infra-Aufgabe — DNS, nginx, SSL. **Keine Code-Änderung, keine App-Eingriffe.**

## Kontext

Wir bekommen eine neue Marketing-Subdomain `makler.claimondo.de` — sie soll exakt so funktionieren wie das bereits existierende `gutachter.claimondo.de`: ein nginx-Server-Block, der auf denselben Prod-Next-Upstream proxyt wie `claimondo.de`/`gutachter.claimondo.de`. Die eigentliche Rewrite-Logik (`makler.claimondo.de/` → intern `/makler/partner-werden`) macht der Next-App-Code (`proxy.ts`) — der wird **separat von Aaron deployed**.

**Wichtig — Reihenfolge:** Dein Teil (DNS + nginx + SSL) kommt **zuerst**. Solange der Code noch nicht deployed ist, liefert `makler.claimondo.de` einfach die Marketing-Startseite (`/`) aus — das ist erwartet und okay, kein Fehler. Erst nach Aarons Code-Deploy zeigt die Subdomain die Makler-Seite. Du musst nach dem Code-Deploy **nichts mehr** an der Infra ändern.

**Nicht anfassen:** der Prod-Next-Prozess / PM2 (kein Restart nötig — nur `nginx reload`), die nginx-Blöcke für `claimondo.de`, `app.claimondo.de`, `gutachter.claimondo.de` (die ändern sich nicht), irgendwelchen App-Code.

**Auch auf Staging:** Zusätzlich soll `makler.staging.claimondo.de` funktionieren (zum Testen vor dem Prod-Go-Live). Siehe Schritt D.

---

## Schritt A — DNS (vermutlich schon erledigt)

`*.claimondo.de` ist ein Wildcard-Record → `makler.claimondo.de` löst bereits auf `162.55.40.105` auf (Stand 2026-05-12). Nur verifizieren:
```
dig +short makler.claimondo.de            # erwartet: 162.55.40.105 (ggf. via CNAME *.cologne.startplatz.de)
```
Falls das *nicht* auflöst: A-Record `makler.claimondo.de → 162.55.40.105` beim DNS-Provider anlegen (analog `gutachter.claimondo.de`). Sonst: nichts zu tun, weiter mit Schritt B.

---

## Schritt B — nginx-Server-Block (Prod)

1. Den vorhandenen `gutachter.claimondo.de`-Block finden:
   ```
   grep -rl "gutachter.claimondo.de" /etc/nginx/
   ```
   (typisch `/etc/nginx/sites-available/` oder `/etc/nginx/conf.d/`).

2. Diesen Block **kopieren** in eine neue Datei (z.B. `/etc/nginx/sites-available/makler.claimondo.de`) und darin:
   - `server_name gutachter.claimondo.de;` → `server_name makler.claimondo.de;`
   - `proxy_pass ...` **unverändert lassen** (zeigt auf denselben Prod-Next-Upstream, z.B. `http://127.0.0.1:3000`).
   - Alle `proxy_set_header`-Zeilen **unverändert übernehmen** — insbesondere muss `proxy_set_header Host $host;` drin sein (sonst sieht die Next-App nicht `makler.claimondo.de` und der App-Rewrite greift später nicht).
   - SSL-Zeilen (`ssl_certificate` / `ssl_certificate_key` / `listen 443 ssl ...`) zunächst so übernehmen wie bei `gutachter` — certbot in Schritt C zieht sie ggf. auf das erweiterte Zertifikat um.
   - Den HTTP→HTTPS-Redirect-Block (Port 80) ebenfalls mitkopieren und `server_name` anpassen.

3. Falls `sites-available`/`sites-enabled`-Schema: symlinken:
   ```
   ln -s /etc/nginx/sites-available/makler.claimondo.de /etc/nginx/sites-enabled/makler.claimondo.de
   ```

4. Test + Reload:
   ```
   nginx -t
   systemctl reload nginx
   ```

---

## Schritt C — SSL-Zertifikat

1. Aktuelles Zertifikat ansehen:
   ```
   certbot certificates
   ```
   Notieren, welches Zertifikat `claimondo.de` / `app.claimondo.de` / `gutachter.claimondo.de` abdeckt und welche Domains da drin sind.

2. Dasselbe Zertifikat um `makler.claimondo.de` erweitern (alle bisherigen Domains beibehalten, nur `-d makler.claimondo.de` ergänzen). Beispiel — die Domain-Liste an das anpassen, was `certbot certificates` zeigt:
   ```
   certbot --nginx --expand \
     -d claimondo.de -d www.claimondo.de \
     -d app.claimondo.de -d gutachter.claimondo.de \
     -d makler.claimondo.de
   ```
   (Wenn certbot fragt, ob es die nginx-Config anpassen soll: ja.)

3. Reload + Auto-Renewal-Check:
   ```
   nginx -t && systemctl reload nginx
   certbot renew --dry-run
   ```

---

## Schritt D — Staging: `makler.staging.claimondo.de`

Der Staging-Slot läuft als eigener Next-Prozess (PM2, Port `3001`, mit Basic-Auth) hinter `*.staging.claimondo.de`.

1. Prüfen, wie der Staging-nginx aufgebaut ist:
   ```
   grep -rl "staging.claimondo.de" /etc/nginx/
   ```
   - **Wenn dort ein Wildcard-Block `server_name *.staging.claimondo.de;` (oder `~^.+\.staging\.claimondo\.de$`) auf `proxy_pass http://127.0.0.1:3001` zeigt** → `makler.staging.claimondo.de` wird damit schon geroutet, **nichts zu tun**. (Auch das Staging-SSL-Zert ist dann typisch ein Wildcard `*.staging.claimondo.de` und deckt es ab — mit `certbot certificates` checken.)
   - **Wenn es per Host einzelne Blöcke gibt** (`app.staging.claimondo.de`, `gutachter.staging.claimondo.de` …) → einen analogen `makler.staging.claimondo.de`-Block anlegen: `proxy_pass http://127.0.0.1:3001`, dieselben `proxy_set_header`-Zeilen (inkl. `Host $host`), denselben `auth_basic` / `auth_basic_user_file` wie die anderen Staging-Blöcke, SSL aus dem Staging-Zert. Dann `nginx -t && systemctl reload nginx`. Falls das Staging-Zert kein Wildcard ist: `certbot --nginx --expand -d <bisherige staging-domains> -d makler.staging.claimondo.de`.
2. Danach (von Aaron) den Branch `kitta/aar-marketing-subdomains` in den Staging-Slot deployen — erst dann rewritet `makler.staging.claimondo.de/` auf die Makler-Seite. (Vorher: liefert die Staging-Startseite — okay.)

---

## Verifikation (nach A–D, noch VOR dem Prod-Code-Deploy)

```
dig +short makler.claimondo.de            # → 162.55.40.105
curl -sI https://makler.claimondo.de/     # → HTTP 200, gültiges Zert (kein -k nötig)
curl -sI https://gutachter.claimondo.de/  # → unverändert HTTP 200 (Regressions-Check)
curl -sI https://claimondo.de/            # → unverändert HTTP 200 (Regressions-Check)
curl -sI -u <staging-user>:<pw> https://makler.staging.claimondo.de/   # → HTTP 200 (nach Staging-Deploy)
```

`https://makler.claimondo.de/` zeigt zu diesem Zeitpunkt die normale Claimondo-Marketing-Startseite — das ist korrekt. Nach dem Code-Deploy (Aaron) zeigt dieselbe URL dann die Makler-Partner-Seite (musst du nicht prüfen, macht Aaron).

## Berichten

Nach jedem Schritt kurz zurückmelden: was gemacht, welche Datei/welcher Record geändert, Output von `nginx -t` / `dig` / `curl -sI`. Am Ende: Pfad der neuen nginx-Config-Datei(en) + finale Domain-Liste aus `certbot certificates` (Prod + Staging).
