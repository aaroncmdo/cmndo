# MCP-Registry-Eintrag aktualisieren — Ablauf

**Stand 18.08.2026.** Der billigste Discovery-Hebel im ganzen GEO-Paket: eine
Textänderung, kein Fremd-Review, keine Freigabe durch Dritte.

---

## 0 · Warum

Der Eintrag `de.claimondo/sv-finder` steht in der **offiziellen** MCP-Registry und ist
aktiv — aber vom **27.05.2026** und seither nie aktualisiert:

```json
{
  "name": "de.claimondo/sv-finder",
  "title": "Claimondo — Kfz-Sachverständigen-Finder",
  "description": "Findet zertifizierte Kfz-Sachverständige im Umkreis einer deutschen PLZ — anonym, read-only.",
  "version": "1.0.0",
  "remotes": [{ "type": "streamable-http", "url": "https://mcp.claimondo.de/mcp" }]
}
```

Der Server kann seit Juni **sieben** Tools, darunter die **Terminbuchung**
(`claimondo_melde_schaden` mit `sv_id` + `slot_start`/`slot_end`), Anspruchsprüfung und
den Versicherer-Brief-Decoder. Der Eintrag verkauft ihn als reinen Read-only-Finder —
wer in der Registry nach „Termin buchen" sucht, findet Claimondo nicht.

---

## 1 · Die neue `server.json`

Liegt fertig unter **`docs/mcp-registry/server.json`**. Sie gehört beim Publish ins
Arbeitsverzeichnis des MCP-Server-Repos (dort, wo `mcp-publisher` läuft) — diese Kopie
ist die gepflegte Vorlage.

Gegenüber 1.0.0 geändert: `version` → **1.1.0**, Titel und Beschreibung nennen die
**Terminbuchung**, ein `icons`-Eintrag kommt dazu.

⚠ **`description` ist auf 100 Zeichen begrenzt** (Schema
`2025-12-11/server.schema.json`, `required: ["name","description","version"]`). Die
hinterlegte Fassung hat 91 Zeichen. Wer sie erweitert, prüft die Länge — sonst weist die
Registry den Publish ab. Der `title` (max. 100) trägt den zweiten Suchbegriff
(„Kfz-Gutachter") neben dem der Beschreibung.

---

## 2 · Domain-Verifikation — der HTTP-Weg

Der Namespace `de.claimondo` ist die Reverse-DNS-Form der Domain; die Registry verlangt
dafür einen Eigentumsnachweis. Zwei Wege: DNS-TXT-Record **oder** eine Datei unter
`/.well-known/mcp-registry-auth`. **Wir nutzen den HTTP-Weg** — kein DNS-Zugriff nötig,
sofort widerrufbar (ENV leeren).

Die Route dafür ist gebaut (`app/api/mcp-registry-auth/route.ts`, Rewrite in
`next.config.ts`). Sie liefert den Wert aus `MCP_REGISTRY_AUTH_PROOF` als nacktes
`text/plain`; ohne ENV antwortet sie bewusst 404.

> Möglich wurde dieser Weg erst durch den Middleware-Fix im selben PR: `/.well-known/*`
> lief vorher ins i18n-Locale-Routing und antwortete 404, obwohl die Route sauber 200
> lieferte (siehe `docs/2026-08-18-chatgpt-app-einreichung.md` §1).

### Schritt 1 — Schlüsselpaar erzeugen (lokal, einmalig)

Unter Windows in **Git Bash**. Verifiziert mit OpenSSL 3.5.5:

```bash
openssl genpkey -algorithm Ed25519 -out claimondo-mcp-key.pem

# Proof-Zeile fuer die ENV-Variable erzeugen:
PUB="$(openssl pkey -in claimondo-mcp-key.pem -pubout -outform DER | tail -c 32 | base64)"
echo "v=MCPv1; k=ed25519; p=${PUB}"
```

Ergebnis ist eine Zeile der Form `v=MCPv1; k=ed25519; p=<44 Zeichen Base64>`.

🔒 **`claimondo-mcp-key.pem` ist der private Schlüssel** — gehört in einen Passwort-Manager,
**nicht** ins Repo, **nicht** in eine `.env`, die committet wird. Nur der öffentliche Teil
(die Proof-Zeile) wird veröffentlicht.

### Schritt 2 — Proof veröffentlichen

Auf dem VPS in `/etc/claimondo-marketing/.env.local`:

```
MCP_REGISTRY_AUTH_PROOF="v=MCPv1; k=ed25519; p=<dein Public Key>"
```

Marketing-Prozess neu starten, dann **prüfen**:

```bash
curl https://claimondo.de/.well-known/mcp-registry-auth
# erwartet: exakt die Proof-Zeile, sonst nichts
```

### Schritt 3 — Anmelden und veröffentlichen

```bash
PRIV="$(openssl pkey -in claimondo-mcp-key.pem -noout -text | grep -A3 'priv:' | tail -n +2 | tr -d ' :\n')"
mcp-publisher login http --domain claimondo.de --private-key "${PRIV}"

# im Verzeichnis mit der server.json:
mcp-publisher publish
```

`mcp-publisher` gibt es als Release im Repo `modelcontextprotocol/registry`.

### Schritt 4 — Nachweis

```bash
curl -s "https://registry.modelcontextprotocol.io/v0/servers?search=claimondo"
```

Erwartet: `"version": "1.1.0"`, die neue Beschreibung, `updatedAt` von heute.
**Ein Publish ohne sichtbare Änderung hier ist nicht erfolgt** — die Ausgabe des CLI
allein ist kein Beweis.

---

## 3 · Was danach noch offen bleibt

Die Registry ist ein Kanal für MCP-**Clients** (Claude-Connectors, Cursor, Cline). Sie
ersetzt **nicht** die Listung im OpenAI-Plugin-Directory — das ist der zweite Kanal aus
Baustein 6 und in `docs/2026-08-18-chatgpt-app-einreichung.md` beschrieben.

Und der Deckel bleibt derselbe: In neun von zwölf getesteten Großstädten liefert
`/api/v1/gutachter-termine` **null** buchbare Gutachter. Ein besser beschriebener
Registry-Eintrag bringt mehr Anfragen dorthin — beantworten lassen sie sich nur, wo ein
Sachverständiger im Einzugsgebiet sitzt.
