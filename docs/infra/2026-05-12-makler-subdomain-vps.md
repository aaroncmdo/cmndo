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

## Schritt A — DNS (Aaron, beim Provider)

**Korrektur 2026-05-12 (VPS-Claude-Befund):** Es gibt **keinen** `*.claimondo.de`-Wildcard, und `makler.claimondo.de` löst aktuell **nicht** auf. DNS für `claimondo.de` liegt bei **IONOS** (`ns10xx.ui-dns.{org,biz,com,de}`). Die VPS-IP ist `212.132.119.110` (nicht `162.55.40.105` — vermutlich Server-Migration), und genau dorthin zeigen `claimondo.de` und `gutachter.claimondo.de`.

→ **Aaron** muss bei IONOS für die Zone `claimondo.de` einen A-Record anlegen:
```
makler   A   212.132.119.110     (TTL z.B. 300–3600 s, analog gutachter)
```
Verifikation (auf dem VPS, nach Propagation):
```
dig +short makler.claimondo.de            # erwartet: 212.132.119.110
```
Solange das nicht auflöst: **Schritt C (SSL via ACME http-01) und die HTTPS-Verifikation pausieren** — Schritt B (nginx-Block) ist davon unabhängig und kann vorab gemacht werden.

(Staging: `*.staging.claimondo.de`-Wildcard existiert, `makler.staging.claimondo.de` löst bereits auf `212.132.119.110` auf. ✓ Kein DNS-Eingriff für Staging nötig.)

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

## Schritt C — SSL-Zertifikat (erst NACHDEM DNS auflöst)

**Korrektur 2026-05-12:** Prod hat kein einzelnes Shared-Zert über claimondo+app+gutachter, sondern mehrere überlappende (`claimondo.de`, `claimondo.de-0001`, …); der `gutachter.claimondo.de`-nginx-Block nutzt ein **eigenständiges** Zert `/etc/letsencrypt/live/gutachter.claimondo.de/`. → Für `makler.claimondo.de` analog ein **eigenständiges** Zert anlegen, **kein `--expand`**:
```
certbot --nginx -d makler.claimondo.de
```
(Wenn certbot fragt, ob es die nginx-Config anpassen soll: ja — es trägt dann `ssl_certificate /etc/letsencrypt/live/makler.claimondo.de/...` in den Block ein und ersetzt den vorläufigen gutachter-Zert-Pfad aus Schritt B.)

Reload + Auto-Renewal-Check:
```
nginx -t && systemctl reload nginx
certbot renew --dry-run
```

---

## Schritt D — Staging: `makler.staging.claimondo.de` — **nichts zu tun** (VPS-Befund 2026-05-12)

`/etc/nginx/sites-available/staging.claimondo.de.conf` hat einen Wildcard-Block `server_name *.staging.claimondo.de` → `proxy_pass http://127.0.0.1:3001` (inkl. `Host $host`, Basic-Auth `/etc/nginx/.htpasswd-staging`). Das Staging-Zert deckt `staging.claimondo.de` + `*.staging.claimondo.de` ab. → `makler.staging.claimondo.de` wird damit schon geroutet + ist TLS-abgedeckt. Kein nginx-/SSL-Eingriff. Es muss nur (von Aaron) der Branch `kitta/aar-marketing-subdomains` in den Staging-Slot deployed werden — erst dann rewritet `makler.staging.claimondo.de/` auf die Makler-Seite.

---

## Verifikation (nach A–C, noch VOR dem Prod-Code-Deploy)

```
dig +short makler.claimondo.de            # → 212.132.119.110
curl -sI https://makler.claimondo.de/     # → HTTP 200, gültiges Zert (kein -k nötig)
curl -sI https://gutachter.claimondo.de/  # → unverändert HTTP 200 (Regressions-Check)
curl -sI https://claimondo.de/            # → unverändert HTTP 200 (Regressions-Check)
curl -sI -u <staging-user>:<pw> https://makler.staging.claimondo.de/   # → HTTP 200 (nach Staging-Deploy)
```

`https://makler.claimondo.de/` zeigt zu diesem Zeitpunkt die normale Claimondo-Marketing-Startseite — das ist korrekt. Nach dem Code-Deploy (Aaron) zeigt dieselbe URL dann die Makler-Partner-Seite (musst du nicht prüfen, macht Aaron).

## Berichten

Nach jedem Schritt kurz zurückmelden: was gemacht, welche Datei/welcher Record geändert, Output von `nginx -t` / `dig` / `curl -sI`. Am Ende: Pfad der neuen nginx-Config-Datei(en) + finale Domain-Liste aus `certbot certificates` (Prod + Staging).
