# Fundament C4a — Implementierungsplan (FallAkte-Kern + Kunde-Migration)

> Phase-C-Code-Plan nach FUNDAMENT §5 (`superpowers:writing-plans`). Setzt `c4-eine-akte-plan.md` um. **Gating:**
> ausführbar, sobald die **Kunde-Journey-Smoke grün** (Teil von B2 — derzeit rot über die J4-Reparatur, J1-deep grün;
> [[coordination-b2-journey-step-diagnose-j4-reparatur-rot]]). Verifikation = CI + der Kunde-Detail-Render-Smoke —
> **lokal nicht baubar (0 node_modules)**.

**Ziel:** Den rollen-parametrisierten `<FallAkte>`-Kern aus dem **Kunde-Prototyp** extrahieren (der einzige schon
zonierte View) + die Kunde-Sicht **behavior-preserving** darüber rendern. C4a = Kern + kleinste Migration (Kunde ist
bereits zoniert → 0 visueller Umbau). C4b–e (SV/Werkstatt/Kanzlei/Admin) folgen als eigene Tranchen.

## Verifizierter Ist (31.07., `KundeClaimView.tsx`)

`<KundeClaimView vm={KundeClaimViewModel}>` (Server-Component) besteht aus **Shell + Zonen**:
- **Shell:** `PageHeader` (Titel aus `claim_nummer · kennzeichen — fahrzeug`, Description = `adresse`) + Multi-Fall-
  Zurück-Link (`vm.hatMehrereFaelle`) + `<FallRealtimeRefresh fallId claimId>` + Zonen-Layout (`mx-auto max-w-xl
  lg:max-w-5xl`, `lg:columns-2`, je Zone `id="zone-<key>"` + `break-inside-avoid`).
- **Zonen:** `deriveKundeZonen(vm)` (`@/lib/claims/kunde-zonen`) → geordnetes `ZoneKey[]` (phasen-adaptiv) → gemappt
  auf `StatusZone`/`AufgabenZone`/`TeamZone`/`GeldZone`/`DoksTermineZone` (je `vm`). Die id-Anker sind
  AufgabenZone-CTA-Sprungziele (`#zone-geld` etc.) → **müssen erhalten bleiben**.

→ Die Shell + das Zonen-Layout sind **rollen-generisch**; die **Zonen-Menge/-Reihenfolge** (deriveKundeZonen) + die
**Zone-Komponenten** + das **vm** sind rollen-spezifisch. Genau die C4-Grenze (~80/20, `c4-plan §3`).

## Kern-Design (`<FallAkte>`)

```
<FallAkte config={rolleConfig} vm={...} />
  config = {
    zones: (vm) => ZoneKey[],              // Kunde: deriveKundeZonen
    zoneComponents: Record<ZoneKey, Comp>, // Kunde: {status:StatusZone, aufgaben:AufgabenZone, ...}
    header: (vm) => { title, description }, // Kunde: der claim_nummer·kennzeichen—fahrzeug / adresse-Aufbau
    backLink?: (vm) => { href, label } | null, // Kunde: Multi-Fall-Link wenn hatMehrereFaelle
    realtime?: { fallId, claimId },        // Kunde: FallRealtimeRefresh
  }
```
Die Shell (Layout, columns, id-Anker `zone-<key>`, break-inside-avoid) lebt **einmal** im Kern; jede Rolle liefert nur
die config. `ZoneKey` bleibt die bestehende Union (`status|aufgaben|team|geld|doksTermine` + später rollen-spezifische Keys).

## Task 1 — `<FallAkte>`-Kern + Config-Typ

**Files:** NEU `src/components/fall-akte/FallAkte.tsx` + `src/components/fall-akte/types.ts` (Config-Typ).
- Die Shell 1:1 aus `KundeClaimView.tsx` extrahieren (Header + Multi-Fall-Link + FallRealtimeRefresh + `lg:columns-2`-
  Zonen-Loop mit `id="zone-<key>"` + `break-inside-avoid`). **Identisches DOM/Klassen** — kein Redesign.
- `FallAkteConfig`-Typ (s.o.). `zoneComponents` sind Server-Components, die ein rollen-spezifisches `vm` nehmen
  (generisch `<Vm,>`-parametrisiert, damit SV/Werkstatt später ihr eigenes vm einbringen).
**Verifikation:** build + tsc; kein Consumer bricht (Task 2 verdrahtet den ersten).
**Risiko:** niedrig (reine Extraktion, kein Verhalten).

## Task 2 — Kunde-Sicht auf den Kern (behavior-preserving)

**File:** `src/components/kunde/claim-view/KundeClaimView.tsx` → dünner Adapter auf `<FallAkte config={kundeConfig} vm={vm}>`.
- `kundeConfig` = `{ zones: deriveKundeZonen, zoneComponents: {status:StatusZone,…,doksTermine:DoksTermineZone},
  header: <der bestehende title/adresse-Aufbau>, backLink: vm.hatMehrereFaelle ? {href:'/kunde',label:…} : null,
  realtime: {fallId:vm.fallId, claimId:vm.claimId} }`.
- **Byte-genau gleiche Ausgabe** (Titel, Anker-ids, Reihenfolge, columns-Layout) — die AufgabenZone-CTA-Sprungziele
  (`#zone-geld` etc.) bleiben intakt.
- Alt-Zonen-Loop aus KundeClaimView entfernt (jetzt im Kern) → Dead-Code-Check (die 5 Zone-Komponenten bleiben, via config referenziert).
**Verifikation:** build + tsc; **Kunde-Detail-Render-Smoke** (`/kunde/faelle/[id]` rendert identisch, Anker funktionieren)
nach Merge; DOM-Diff = 0 (kein visueller Umbau, Token/Primitives unverändert).
**Risiko:** mittel (Kunde-Detail-Sicht ist Kunden-kritisch) — durch die byte-genaue Extraktion + den Render-Smoke abgesichert.

## DoD (C4a) + Sequenz

1. Task 1 (Kern) → Task 2 (Kunde-Adapter) — **ein PR**.
2. **DoD:** `/kunde/faelle/[id]` rendert über `<FallAkte>`; DOM/Anker/Layout unverändert; **Kunde-Journey-Smoke grün**
   (nach Merge); Alt-Zonen-Loop-Code aus KundeClaimView entfernt (knip); Kunde-Gate + Route unverändert (Regression §7).
3. **C4b–e** (SV `FallDetailClient` → Kern + SV-Zone; Werkstatt; Kanzlei; Admin-Tabs → Kern) = eigene Tranchen,
   Reihenfolge fix (kleinste Sonderfälle zuerst).

## Nicht-Ziele
Kein visuelles Redesign (Token/Primitives + Look identisch); keine neuen Zonen-Features; **keine andere Rolle als Kunde**
in C4a; keine Gate-/RLS-Änderung (C5). Der `<FallAkte>`-Kern ist bewusst als generischer `<Vm>`-Container gebaut, damit
C4b (SV) nur eine neue config + evtl. eine rollen-spezifische Zone braucht — nicht neuen Shell-Code.
