# Detail-View-Rezept (ab P0 verbindlich)

Jede drillbare Entity-Liste bekommt eine Detail-View nach **diesem** Muster.
Kein Modal-als-Detail mehr, kein handgerolltes Chrome.

Bausteine: `src/components/shared/detail/` (`EntityDetailShell`, `DrawerShell`).
Referenz-Implementierung: `src/app/admin/sachverstaendige/` (Liste + `[id]` + 3 Intercepts).

---

## Das 4-File-Skelett

Für eine Liste unter `src/app/<bereich>/<liste>/`:

```
<liste>/layout.tsx                → Parallel-Slot { children, drawer }
<liste>/[id]/page.tsx             → EntityDetailShell (Full-Page = Deep-Link-Ziel)
<liste>/@drawer/(.)[id]/page.tsx  → re-importiert [id]/page in <DrawerShell>
<liste>/@drawer/default.tsx       → return null
```

**Warum so:** Klick in der Liste (Soft-Nav) öffnet den Drawer über der Liste; ein
direkter URL-Aufruf (Deep-Link/Hard-Nav) matcht den Intercept **nicht** und rendert
die Full-Page. Eine Implementierung, zwei Darstellungen.

**`<liste>/layout.tsx`**
```tsx
import type { ReactNode } from 'react'

export default function Layout({ children, drawer }: { children: ReactNode; drawer: ReactNode }) {
  return <div className="h-full">{children}{drawer}</div>
}
```

**`<liste>/@drawer/default.tsx`**
```tsx
export default function DrawerDefault() { return null }
```

**`<liste>/@drawer/(.)[id]/page.tsx`**
```tsx
import DetailPage from '../../[id]/page'
import { DrawerShell } from '@/components/shared/detail'

export default async function InterceptedDetail({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams?: Promise<{ tab?: string }> }) {
  return (
    <DrawerShell title="Organisation" width={860}>
      <div className="px-6 py-6">
        {/* variant="drawer" => kein Zurueck-Link (der Drawer hat Close). */}
        <DetailPage params={params} searchParams={searchParams} variant="drawer" />
      </div>
    </DrawerShell>
  )
}
```

**`<liste>/[id]/page.tsx`** — Server-Component: lädt Daten, rendert die Shell.
```tsx
import { notFound } from 'next/navigation'
import EntityDetailShell, { type DetailTab } from '@/components/shared/detail/EntityDetailShell'

export default async function DetailPage({
  params, searchParams, variant = 'page',
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ tab?: string }>
  /** "drawer" wenn eine Intercepting-Route die Page im DrawerShell rendert. */
  variant?: 'page' | 'drawer'
}) {
  const { id } = await params
  const tab = (await searchParams)?.tab ?? 'stammdaten'

  const res = await getOrganisationDetail(id)      // Facade, s.u.
  if (!res.ok) notFound()
  const org = res.data

  const tabs: DetailTab[] = [
    { key: 'stammdaten', label: 'Stammdaten', href: `/admin/organisationen/${id}` },
    { key: 'faelle', label: 'Fälle', href: `/admin/organisationen/${id}?tab=faelle`, badgeCount: org.offeneFaelle },
  ]

  // Nur die Daten des AKTIVEN Tabs laden — das ist der Sinn der Link-Tabs.
  const faelle = tab === 'faelle' ? await getOrganisationFaelle(id) : []

  return (
    <EntityDetailShell
      variant={variant}
      title={org.name}
      backHref="/admin/organisationen"
      backLabel="Organisationen"
      tabs={tabs}
      activeTab={tab}
      description={<span className="flex items-center gap-3 flex-wrap">{org.email}</span>}
      actions={<AktivToggle orgId={org.id} aktiv={org.aktiv} />}
    >
      {tab === 'faelle' ? (
        <div className="flex-1 overflow-y-auto p-4">
          <FaelleTab faelle={faelle} />
        </div>
      ) : (
        <StammdatenTab org={org} />
      )}
    </EntityDetailShell>
  )
}
```

---

## `EntityDetailShell` — was es liefert (und was nicht)

**Liefert:** Back-Link (nur `variant="page"`) · `PageHeader` (Titel/`description`/`actions`) · Tab-Bar aus `<Link>`s mit `?tab=`.

**Liefert bewusst NICHT:** ein Content-Layout. Der Tab bringt sein eigenes Layout mit —
inklusive eines etwaigen Related-Panels.

> **Kein `sidebar`-Prop.** Ein Related-Panel („Offene Fälle/Tasks") gehört dem **Tab**,
> nicht der Shell: im SV-Detail liegt es mit dem Edit-Formular in einem gemeinsamen
> `max-w-6xl`-Container und klappt mobil darunter. Ein Shell-Sidebar-Prop hätte es an
> den Viewport-Rand gepinnt und das Layout gebrochen. Wer ein Panel braucht, baut es
> im Tab (Muster: `admin/sachverstaendige/[id]`, Stammdaten-Tab).

**Content-Konvention:** der Tab-Inhalt bekommt i.d.R. einen `flex-1`-Wrapper, damit er
die Resthöhe füllt (die Shell ist ein `h-full flex flex-col`).

**Warum `<Link>`-Tabs statt Client-State:** die Page ist eine Server-Component — pro Tab
werden **nur die Daten des aktiven Tabs** geladen (SV-Detail lädt Verifizierungs- bzw.
Abrechnungs-Daten nur, wenn der jeweilige Tab aktiv ist). `FallakteTabs`
(client, `onTabChange`, `<button>`) bleibt den **Fallakte**-Shells vorbehalten —
anderes Paradigma, bewusst getrennt.

---

## Facade-Konvention

Pro Entität **ein** Detail-Loader in `src/lib/<domain>/`:

```ts
export async function getOrganisationDetail(
  id: string,
): Promise<{ ok: true; data: OrganisationDetail } | { ok: false; error: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('organisationen')
    .select('id, name, email, aktiv, profiles(vorname, nachname)')
    .eq('id', id)
    .single()
  if (error) return { ok: false, error: error.message }

  // Nested-FK IMMER normalisieren (Array oder Objekt je nach Cardinality):
  const profil = Array.isArray(data.profiles) ? data.profiles[0] : data.profiles
  return { ok: true, data: { ...data, profil } }
}
```

- **Result-Object, kein `throw`** (AGENTS.md §Server-Actions).
- Nested-FKs mit `Array.isArray(x) ? x[0] : x` normalisieren.
- Mutierende Server-Actions revalidieren **beide** Pfade:
  ```ts
  revalidatePath('/admin/organisationen')
  revalidatePath(`/admin/organisationen/${id}`)
  ```

---

## Die Regeln

1. **Listen-Zeile → `<base>/[id]`** (Link + Intercept-Drawer). **Kein Modal-als-Detail**
   für Entitäten mit Related-Daten oder mehr als ~8 Feldern.
2. **Kein toter Detail-Link** — die Ziel-Route muss existieren. (Gegenbeispiel:
   `kanzlei/mandate` verlinkt heute auf `/kanzlei/fall/[id]`, das es nicht gibt.)
3. **Tabs nur, wenn die Entität mehr als ein Daten-Konzept hat** — sonst `tabs` weglassen
   (Single-View).
4. **Header nie selbst bauen** — `EntityDetailShell` liefert ihn (er komponiert
   `PageHeader`). `PageHeader` selbst gehört der portal-header-Lane; nicht modifizieren.
5. **Pro Tab nur dessen Daten laden** — das ist der ganze Grund für Link-Tabs.

---

Programm-Kontext: `docs/superpowers/specs/2026-07-13-detail-view-konsistenz-programm-design.md`
