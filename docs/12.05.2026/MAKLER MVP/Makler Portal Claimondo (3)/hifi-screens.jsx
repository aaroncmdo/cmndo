// hifi-screens.jsx — All 13 Hi-Fi screens + Schnellanlage state variants
// Pulls shared components from window (exported by hifi-shared.jsx)

const { useState } = React;
const {
  DS, Ic, LogoMark, LogoFull, Sidebar, MobileHeader, BottomNav,
  MobileLayout, DesktopLayout, Footer, MagicBanner,
  Btn, Field, CheckRow,
  Pill, StatusPill,
  KPICard, CaseRow, TLStep,
  InfoBlock, SuccessAlert, Skeleton,
  ShieldIllustration, OBDots, Card
} = window;

/* ─── Shared form card ──────────────────────────────────────── */
const SchnellanlageCard = ({ state = 'empty' }) => {
  const [open, setOpen] = useState(false);
  const filled = state === 'filled' || state === 'error' || state === 'loading' || state === 'success';
  const isError = state === 'error';
  const isLoad = state === 'loading';
  const isSucc = state === 'success';

  return (
    <Card style={{ padding: '28px 32px', maxWidth: 520, width: '100%', display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div>
        <div style={{ fontFamily: DS.f.sans, fontSize: 22, fontWeight: 600, color: DS.c.navy, letterSpacing: '-0.025em', lineHeight: 1.15 }}>
          Mandant in 30 Sekunden weiterleiten
        </div>
        <div style={{ fontFamily: DS.f.sans, fontSize: 14, color: DS.c.muted, marginTop: 6 }}>
          Sie sind am Telefon — drei Felder reichen
        </div>
      </div>

      <InfoBlock>
        Den Rest klärt Claimondo per Rückruf in den nächsten 10 Minuten.
      </InfoBlock>

      <Field
        label="Telefonnummer Mandant" required
        placeholder="+49 · · ·"
        value={filled && !isError ? '+49 221 98765432' : isError ? '0221-UNGÜLTIG' : undefined}
        error={isError ? 'Ungültige Telefonnummer — bitte Vorwahl und Nummer prüfen' : undefined} />
      
      <Field
        label="Name des Fahrzeughalters" required
        placeholder="Vor- und Nachname"
        value={filled ? 'Maria Schulze' : undefined} />
      
      <Field
        label="Kfz-Kennzeichen" required mono
        placeholder="K-AB 1234"
        value={filled ? 'K-AB 1234' : undefined}
        hint={!filled ? 'Wird automatisch in Großbuchstaben umgewandelt' : undefined} />
      

      <Btn
        label={isLoad ? 'Wird übergeben…' : isSucc ? '✓ Übergeben' : 'An Claimondo übergeben'}
        variant={isSucc ? 'secondary' : 'default'}
        size="lg"
        full
        loading={isLoad}
        disabled={isSucc} />
      

      {isSucc &&
      <SuccessAlert>
          Übergeben. Ihr Mandant erhält in 10 Minuten einen Anruf von Claimondo. Sie erhalten eine Bestätigungs-E-Mail.
        </SuccessAlert>
      }

      <div style={{ borderTop: `1px dashed ${DS.c.border}`, paddingTop: 14 }}>
        <div
          onClick={() => setOpen((o) => !o)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none' }}>
          
          <div style={{ transition: 'transform .2s', transform: open ? 'rotate(90deg)' : 'none' }}>
            <Ic.ChevronRight s={13} c={DS.c.muted} />
          </div>
          <span style={{ fontFamily: DS.f.sans, fontSize: 13, color: DS.c.muted }}>
            Weitere Schadensdetails (optional — Claimondo klärt dies per Rückruf)
          </span>
        </div>
        {open &&
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 12 }}>
              <Field label="Unfallzeitpunkt" placeholder="17.04.2026, 14:32" style={{ flex: 1 }} />
              <Field label="Polizei beteiligt?" placeholder="Ja / Nein" style={{ flex: 1 }} />
            </div>
            <Field label="Gegnerversicherung" placeholder="z.B. HUK-Coburg, Allianz" />
          </div>
        }
      </div>

      <div style={{ fontFamily: DS.f.sans, fontSize: 12, color: DS.c.muted2, lineHeight: 1.5 }}>
        Der DSGVO-Hinweis erscheint beim ersten Mandanten-Anlegen als Modal.
      </div>
    </Card>);

};

/* ─── S1 Desktop ────────────────────────────────────────────── */
const S1Desktop = () =>
<DesktopLayout active="faelle">
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      <SchnellanlageCard state="empty" />
    </div>
  </DesktopLayout>;


/* ─── S2 Desktop — Dashboard ────────────────────────────────── */
const CASES = [
{ name: 'Maria Schulze', plate: 'K-AB 1234', statusInfo: 'Erstanruf heute um 14:32', status: 'Rückruf läuft' },
{ name: 'Thomas Bauer', plate: 'BN-CD 5678', statusInfo: 'Werkstatt-Termin 20.04.', status: 'Termin gebucht' },
{ name: 'Sabine Meier', plate: 'GM-EF 9012', statusInfo: 'Gutachter beauftragt', status: 'Regulierung läuft' },
{ name: 'Klaus Hoffmann', plate: 'RE-GH 3456', statusInfo: 'Dokumente bei Versicherer', status: 'In Prüfung' },
{ name: 'Anna Richter', plate: 'K-IJ 7890', statusInfo: 'Erstanruf heute um 09:15', status: 'Rückruf läuft' }];


const S2Desktop = () =>
<DesktopLayout active="dashboard">
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
      <div>
        <div style={{ fontFamily: DS.f.sans, fontSize: 26, fontWeight: 700, color: DS.c.navy, letterSpacing: '-0.03em' }}>
          Guten Morgen, Max Mustermann
        </div>
        <div style={{ fontFamily: DS.f.mono, fontSize: 12, color: DS.c.muted, marginTop: 4 }}>April 2026</div>
      </div>
      <Btn label="+ Fall anlegen" variant="default" size="md" icon={<Ic.Plus s={13} c="#fff" />} />
    </div>

    <div style={{ display: 'flex', gap: 14, marginBottom: 24 }}>
      <KPICard label="Aktive Fälle" value="7" accent="ondo" delta="↑ 2 vs. Vormonat" />
      <KPICard label="Fälle diesen Monat" value="12" accent="navy" />
      <KPICard label="Provision April" value="840 €" accent="green" delta="davon 6 abgeschlossen" />
      <KPICard label="Forecast April" value="1.120 €" accent="amber" />
    </div>

    <Card style={{ marginBottom: 20, overflow: 'hidden' }}>
      <div style={{ padding: '14px 18px', borderBottom: `1px solid ${DS.c.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontFamily: DS.f.sans, fontSize: 15, fontWeight: 600, color: DS.c.navy }}>Fälle in Bearbeitung</span>
        <span style={{ fontFamily: DS.f.sans, fontSize: 13, color: DS.c.ondo, cursor: 'pointer' }}>Alle anzeigen →</span>
      </div>
      {CASES.map((c, i) => <CaseRow key={i} {...c} last={i === CASES.length - 1} />)}
    </Card>

    <Card style={{ padding: '14px 18px' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontFamily: DS.f.sans, fontSize: 13, fontWeight: 600, color: DS.c.navy, marginRight: 6 }}>Empfehlungs-Tools</span>
        <Btn label="QR-Visitenkarte bestellen" variant="outline" size="sm" />
        <Btn label="Mandanten-Mail-Vorlage" variant="outline" size="sm" />
        <Btn label="Schulungsvideo" variant="outline" size="sm" />
      </div>
    </Card>
  </DesktopLayout>;


/* ─── S3 Desktop — Fall-Detail ──────────────────────────────── */
const S3Desktop = () =>
<DesktopLayout active="faelle" banner={<MagicBanner />}>
    <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 20 }}>
      <span style={{ fontFamily: DS.f.sans, fontSize: 13, color: DS.c.muted, cursor: 'pointer' }}>Fälle</span>
      <Ic.ChevronRight s={12} c={DS.c.muted2} />
      <span style={{ fontFamily: DS.f.sans, fontSize: 13, color: DS.c.navy, fontWeight: 500 }}>Maria Schulze</span>
    </div>

    <Card style={{ padding: '18px 22px', marginBottom: 20, borderLeft: `4px solid ${DS.c.ondo}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontFamily: DS.f.mono, fontSize: 11, color: DS.c.muted2, letterSpacing: '0.08em', marginBottom: 4 }}>CLM-2024-0042</div>
          <div style={{ fontFamily: DS.f.sans, fontSize: 22, fontWeight: 700, color: DS.c.navy, letterSpacing: '-0.025em', marginBottom: 8 }}>Maria Schulze</div>
          <div style={{ display: 'flex', gap: 20 }}>
            <span style={{ fontFamily: DS.f.mono, fontSize: 12, color: DS.c.muted }}>K-AB 1234</span>
            <span style={{ fontFamily: DS.f.sans, fontSize: 13, color: DS.c.muted }}>VW Golf 8 · Bj. 2022</span>
            <span style={{ fontFamily: DS.f.sans, fontSize: 13, color: DS.c.muted }}>Heckauffahrunfall</span>
          </div>
        </div>
        <StatusPill status="Rückruf läuft" />
      </div>
    </Card>

    <div style={{ display: 'flex', gap: 20 }}>
      <Card style={{ flex: 2, padding: '20px 24px' }}>
        <div style={{ fontFamily: DS.f.sans, fontSize: 15, fontWeight: 600, color: DS.c.navy, marginBottom: 22 }}>Verlauf</div>
        <TLStep label="Fall angelegt" time="17.04.2026, 09:15" done />
        <TLStep label="Erstanruf Claimondo → Mandant" time="läuft…" active />
        <TLStep label="Schadensaufnahme abgeschlossen" future />
        <TLStep label="Werkstatt-Termin gebucht" future />
        <TLStep label="Fahrzeug in der Werkstatt" future />
        <TLStep label="Regulierung abgeschlossen" time="" future last />
      </Card>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Card style={{ padding: 18 }}>
          <div style={{ fontFamily: DS.f.sans, fontSize: 13, fontWeight: 600, color: DS.c.navy, marginBottom: 12 }}>Ansprechpartner Claimondo</div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: `linear-gradient(135deg, ${DS.c.ondo}, ${DS.c.navy})`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ fontFamily: DS.f.sans, fontSize: 12, fontWeight: 600, color: '#fff' }}>JS</span>
            </div>
            <div>
              <div style={{ fontFamily: DS.f.sans, fontSize: 14, fontWeight: 600, color: DS.c.navy }}>Jana Söder</div>
              <div style={{ fontFamily: DS.f.sans, fontSize: 12, color: DS.c.muted }}>Schadensbetreuung</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Ic.Phone s={13} c={DS.c.muted} />
              <span style={{ fontFamily: DS.f.mono, fontSize: 12, color: DS.c.navy }}>0221 9988 7766</span>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Ic.Mail s={13} c={DS.c.muted} />
              <span style={{ fontFamily: DS.f.sans, fontSize: 12, color: DS.c.ondo }}>j.soeder@claimondo.de</span>
            </div>
          </div>
        </Card>

        <Card style={{ padding: 18, borderLeft: `4px solid #f59e0b`, background: '#fffdf7' }}>
          <div style={{ fontFamily: DS.f.mono, fontSize: 10, color: DS.c.muted2, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Edge Case · Nicht erreichbar</div>
          <StatusPill status="Mandant nicht erreichbar" />
          <div style={{ fontFamily: DS.f.sans, fontSize: 12.5, color: DS.c.muted, marginTop: 8, marginBottom: 12, lineHeight: 1.5 }}>
            3 Rückrufversuche erfolglos. Bitte kontaktieren Sie den Mandanten direkt.
          </div>
          <Btn label="Manuell nachfassen" variant="outline" size="sm" />
        </Card>
      </div>
    </div>
  </DesktopLayout>;


/* ─── Mobile screens ────────────────────────────────────────── */
const S1Mobile = () =>
<MobileLayout active="none">
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ fontFamily: DS.f.sans, fontSize: 18, fontWeight: 700, color: DS.c.navy, letterSpacing: '-0.025em', lineHeight: 1.2 }}>Mandant in 30 Sekunden weiterleiten</div>
        <div style={{ fontFamily: DS.f.sans, fontSize: 13, color: DS.c.muted, marginTop: 4 }}>Sie sind am Telefon — drei Felder reichen</div>
      </div>
      <InfoBlock><span style={{ fontSize: 13 }}>Den Rest klärt Claimondo per Rückruf in den nächsten 10 Minuten.</span></InfoBlock>
      <Field label="Telefonnummer Mandant" required placeholder="+49 · · ·" />
      <Field label="Name des Fahrzeughalters" required placeholder="Vor- und Nachname" />
      <Field label="Kfz-Kennzeichen" required mono placeholder="K-AB 1234" hint="Auto-Großschreibung aktiv" />
      <CheckRow label="Ich habe meinen Mandanten über die Datenweitergabe informiert." />
      <Btn label="An Claimondo übergeben" variant="default" size="lg" full />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', border: `1px dashed ${DS.c.border}`, borderRadius: DS.r.md, cursor: 'pointer' }}>
        <Ic.ChevronRight s={12} c={DS.c.muted} />
        <span style={{ fontFamily: DS.f.sans, fontSize: 13, color: DS.c.muted }}>Weitere Schadensdetails (optional)</span>
      </div>
    </div>
  </MobileLayout>;


const S2Mobile = () =>
<MobileLayout active="dashboard">
    <div style={{ padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontFamily: DS.f.sans, fontSize: 16, fontWeight: 700, color: DS.c.navy }}>Guten Morgen, Max</div>
          <div style={{ fontFamily: DS.f.mono, fontSize: 11, color: DS.c.muted }}>April 2026</div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <KPICard label="Aktive Fälle" value="7" accent="ondo" />
        <KPICard label="Monat ges." value="12" accent="navy" />
        <KPICard label="Provision" value="840 €" accent="green" />
        <KPICard label="Forecast" value="1.120 €" accent="amber" />
      </div>
      <Card style={{ overflow: 'hidden' }}>
        <div style={{ padding: '11px 14px', borderBottom: `1px solid ${DS.c.border}` }}>
          <span style={{ fontFamily: DS.f.sans, fontSize: 14, fontWeight: 600, color: DS.c.navy }}>Fälle in Bearbeitung</span>
        </div>
        {CASES.slice(0, 4).map((c, i, a) =>
      <div key={i} style={{ padding: '12px 14px', borderBottom: i < a.length - 1 ? `1px solid ${DS.c.border}` : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, borderLeft: `4px solid ${{ 'Rückruf läuft': '#f59e0b', 'Termin gebucht': '#4573A2', 'Regulierung läuft': '#10b981', 'In Prüfung': '#9ca3af' }[c.status]}` }}>
            <div>
              <div style={{ fontFamily: DS.f.sans, fontSize: 13, fontWeight: 600, color: DS.c.navy }}>{c.name}</div>
              <div style={{ fontFamily: DS.f.mono, fontSize: 10, color: DS.c.muted, marginTop: 1 }}>{c.plate}</div>
            </div>
            <StatusPill status={c.status} />
          </div>
      )}
      </Card>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={{ fontFamily: DS.f.sans, fontSize: 13, fontWeight: 600, color: DS.c.navy }}>Empfehlungs-Tools</span>
        <Btn label="QR-Visitenkarte bestellen" variant="outline" size="sm" full />
        <Btn label="Mandanten-Mail-Vorlage" variant="outline" size="sm" full />
        <Btn label="Schulungsvideo" variant="outline" size="sm" full />
      </div>
    </div>
  </MobileLayout>;


const S3Mobile = () =>
<MobileLayout active="faelle" banner={<div style={{ height: 32, background: '#eef4fb', borderBottom: '1px solid #d5e2ef', display: 'flex', alignItems: 'center', padding: '0 14px', gap: 6, flexShrink: 0 }}><Ic.Mail s={12} c={DS.c.ondo} /><span style={{ fontFamily: DS.f.sans, fontSize: 12, color: DS.c.shield }}>Geöffnet aus E-Mail · keine Anmeldung nötig</span></div>}>
    <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Card style={{ padding: '14px 16px', borderLeft: `4px solid ${DS.c.ondo}` }}>
        <div style={{ fontFamily: DS.f.mono, fontSize: 10, color: DS.c.muted2, letterSpacing: '0.08em', marginBottom: 3 }}>CLM-2024-0042</div>
        <div style={{ fontFamily: DS.f.sans, fontSize: 18, fontWeight: 700, color: DS.c.navy, letterSpacing: '-0.02em', marginBottom: 6 }}>Maria Schulze</div>
        <div style={{ marginBottom: 6 }}><StatusPill status="Rückruf läuft" /></div>
        <span style={{ fontFamily: DS.f.mono, fontSize: 11, color: DS.c.muted }}>K-AB 1234 · VW Golf 8</span>
      </Card>
      <Card style={{ padding: '16px 18px' }}>
        <div style={{ fontFamily: DS.f.sans, fontSize: 14, fontWeight: 600, color: DS.c.navy, marginBottom: 16 }}>Verlauf</div>
        <TLStep label="Fall angelegt" time="17.04.2026" done />
        <TLStep label="Erstanruf Claimondo" time="läuft…" active />
        <TLStep label="Schadensaufnahme" future />
        <TLStep label="Werkstatt-Termin" future />
        <TLStep label="Regulierung" future last />
      </Card>
      <Card style={{ padding: '14px 16px' }}>
        <div style={{ fontFamily: DS.f.sans, fontSize: 13, fontWeight: 600, color: DS.c.navy, marginBottom: 10 }}>Ansprechpartner Claimondo</div>
        <div style={{ fontFamily: DS.f.sans, fontSize: 14, fontWeight: 600, color: DS.c.navy }}>Jana Söder</div>
        <div style={{ fontFamily: DS.f.sans, fontSize: 12, color: DS.c.muted, marginBottom: 8 }}>Schadensbetreuung</div>
        <Btn label="0221 9988 7766" variant="outline" size="sm" icon={<Ic.Phone s={13} c={DS.c.navy} />} />
      </Card>
    </div>
  </MobileLayout>;


/* ─── Empty State ───────────────────────────────────────────── */
const EmptyState = () =>
<DesktopLayout active="dashboard">
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
      <div>
        <div style={{ fontFamily: DS.f.sans, fontSize: 26, fontWeight: 700, color: DS.c.navy, letterSpacing: '-0.03em' }}>Willkommen, Max Mustermann</div>
        <div style={{ fontFamily: DS.f.mono, fontSize: 12, color: DS.c.muted, marginTop: 4 }}>April 2026</div>
      </div>
    </div>
    <div style={{ display: 'flex', gap: 14, marginBottom: 24 }}>
      <KPICard label="Aktive Fälle" value="—" accent="ondo" />
      <KPICard label="Fälle diesen Monat" value="—" accent="navy" />
      <KPICard label="Provision April" value="—" accent="green" />
      <KPICard label="Forecast April" value="—" accent="amber" />
    </div>
    <Card style={{ padding: '56px 40px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, textAlign: 'center' }}>
      <ShieldIllustration />
      <div style={{ fontFamily: DS.f.sans, fontSize: 20, fontWeight: 700, color: DS.c.navy, letterSpacing: '-0.02em' }}>Noch keine Fälle vorhanden</div>
      <div style={{ fontFamily: DS.f.sans, fontSize: 14, color: DS.c.muted, maxWidth: 380, lineHeight: 1.65 }}>
        Legen Sie Ihren ersten Mandanten-Fall an, sobald ein Mandant nach einem Unfall bei Ihnen anruft.
      </div>
      <Btn label="Ersten Fall anlegen" variant="default" size="lg" icon={<Ic.Plus s={14} c="#fff" />} style={{ marginTop: 8 }} />
      <div style={{ marginTop: 20, paddingTop: 20, borderTop: `1px solid ${DS.c.border}`, width: '100%', display: 'flex', gap: 10, justifyContent: 'center' }}>
        <Btn label="QR-Visitenkarte bestellen" variant="outline" size="sm" />
        <Btn label="Mandanten-Mail-Vorlage" variant="outline" size="sm" />
        <Btn label="Schulungsvideo" variant="outline" size="sm" />
      </div>
    </Card>
  </DesktopLayout>;


/* ─── DSGVO Modal ───────────────────────────────────────────── */
const DsgvoModal = () => {
  const [checked, setChecked] = useState(false);
  return (
    <DesktopLayout active="faelle" noPad>
      <div style={{ flex: 1, position: 'relative', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        {/* overlay */}
        <div style={{ position: 'absolute', inset: 0, background: `${DS.c.navy}73` }} />
        {/* modal */}
        <div style={{
          position: 'relative', zIndex: 1,
          background: DS.c.card, borderRadius: DS.r['2xl'],
          padding: '32px', width: 560, maxWidth: '100%',
          boxShadow: DS.sh.lg,
          display: 'flex', flexDirection: 'column', gap: 18
        }}>
          <div style={{ fontFamily: DS.f.sans, fontSize: 19, fontWeight: 700, color: DS.c.navy, letterSpacing: '-0.02em' }}>Datenschutz-Hinweis</div>
          <div style={{ fontFamily: DS.f.sans, fontSize: 14, color: DS.c.navy, lineHeight: 1.6, maxHeight: 140, overflowY: 'auto', paddingRight: 4 }}>
            Gemäß Art. 13 DSGVO informieren wir Sie: Die von Ihnen erhobenen personenbezogenen Daten Ihres Mandanten (Name, Telefonnummer, Kfz-Kennzeichen) werden zum Zweck der Schadenregulierung an die Claimondo GmbH übermittelt. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO. Der Mandant hat jederzeit das Recht auf Auskunft, Berichtigung und Löschung.
          </div>
          <div
            style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}
            onClick={() => setChecked((c) => !c)}>
            
            <div style={{
              width: 18, height: 18, borderRadius: 5, flexShrink: 0, marginTop: 1,
              border: `1.5px solid ${checked ? DS.c.navy : DS.c.border}`,
              background: checked ? DS.c.navy : '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              {checked && <Ic.Check s={10} c="#fff" />}
            </div>
            <span style={{ fontFamily: DS.f.sans, fontSize: 13.5, color: DS.c.navy, lineHeight: 1.55 }}>
              Mein Mandant hat der Übergabe seiner Daten an Claimondo zugestimmt.
            </span>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
            <Btn label="Abbrechen" variant="outline" size="md" />
            <Btn label="Bestätigen und übergeben" variant="default" size="md" disabled={!checked} />
          </div>
          <div style={{ fontFamily: DS.f.sans, fontSize: 11, color: DS.c.muted2, textAlign: 'center' }}>
            Erscheint nur beim ersten Mandanten-Anlegen · danach gespeichert
          </div>
        </div>
      </div>
    </DesktopLayout>);

};

/* ─── Login ─────────────────────────────────────────────────── */
const LoginScreen = () =>
<div style={{ height: '100%', background: DS.c.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: DS.f.sans }}>
    <div style={{ width: 380, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
      <LogoFull />
      <Card style={{ width: '100%', padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div>
          <div style={{ fontFamily: DS.f.sans, fontSize: 18, fontWeight: 700, color: DS.c.navy, letterSpacing: '-0.02em' }}>Anmelden</div>
          <div style={{ fontFamily: DS.f.sans, fontSize: 13.5, color: DS.c.muted, marginTop: 6, lineHeight: 1.6 }}>
            Geben Sie Ihre E-Mail ein. Sie erhalten einen sicheren Anmelde-Link — kein Passwort nötig.
          </div>
        </div>
        <Field label="E-Mail-Adresse" placeholder="makler@kanzlei.de" />
        <Btn label="Login-Link zusenden" variant="default" size="lg" full icon={<Ic.Mail s={14} c="#fff" />} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, height: 1, background: DS.c.border }} />
          <span style={{ fontFamily: DS.f.mono, fontSize: 11, color: DS.c.muted2 }}>oder</span>
          <div style={{ flex: 1, height: 1, background: DS.c.border }} />
        </div>
        <div style={{ fontFamily: DS.f.sans, fontSize: 13, color: DS.c.muted, textAlign: 'center', lineHeight: 1.55 }}>
          Noch kein Zugang?{' '}
          <span style={{ color: DS.c.ondo, cursor: 'pointer' }}>Einladung anfordern →</span>
        </div>
      </Card>
      <div style={{ display: 'flex', gap: 20 }}>
        {['Impressum', 'Datenschutz', 'AGB'].map((l, i) =>
      <span key={i} style={{ fontFamily: DS.f.sans, fontSize: 12, color: DS.c.muted, cursor: 'pointer' }}>{l}</span>
      )}
      </div>
    </div>
  </div>;


/* ─── Magic-link sent ───────────────────────────────────────── */
const MagicLinkSent = () =>
<div style={{ height: '100%', background: DS.c.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: DS.f.sans }}>
    <div style={{ width: 380, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
      <LogoFull />
      <Card style={{ width: '100%', padding: '32px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, textAlign: 'center' }}>
        <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#ecfdf5', border: `2px solid #bbf7d0`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Ic.Mail s={22} c="#10b981" />
        </div>
        <div style={{ fontFamily: DS.f.sans, fontSize: 20, fontWeight: 700, color: DS.c.navy, letterSpacing: '-0.02em' }}>Link gesendet!</div>
        <div style={{ fontFamily: DS.f.sans, fontSize: 13.5, color: DS.c.muted, lineHeight: 1.65 }}>
          Schauen Sie in Ihr Postfach (<span style={{ fontFamily: DS.f.mono, fontSize: 12 }}>makler@kanzlei.de</span>). Der Anmelde-Link ist 15 Minuten gültig.
        </div>
        <div style={{ width: '100%', padding: '11px 16px', background: DS.c.bg, borderRadius: DS.r.md, border: `1px solid ${DS.c.border}`, cursor: 'pointer' }}>
          <span style={{ fontFamily: DS.f.sans, fontSize: 13, color: DS.c.muted }}>Kein E-Mail erhalten? </span>
          <span style={{ fontFamily: DS.f.sans, fontSize: 13, color: DS.c.ondo, cursor: 'pointer' }}>Link erneut senden →</span>
        </div>
      </Card>
      <div style={{ display: 'flex', gap: 20 }}>
        {['Impressum', 'Datenschutz', 'AGB'].map((l, i) =>
      <span key={i} style={{ fontFamily: DS.f.sans, fontSize: 12, color: DS.c.muted, cursor: 'pointer' }}>{l}</span>
      )}
      </div>
    </div>
  </div>;


/* ─── Onboarding 1 ──────────────────────────────────────────── */
const OB1_ITEMS = [
{
  icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#4573A2" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="7" width="10" height="8" rx="1.5" /><path d="M5 7V5C5 3.3 6.3 2 8 2C9.7 2 11 3.3 11 5v2" /></svg>,
  text: 'Login per Magic-Link in Ihrer E-Mail — kein Passwort nötig'
},
{
  icon: <Ic.Shield s={16} c={DS.c.ondo} />,
  text: 'Ihre Mandantendaten bleiben DSGVO-konform geschützt'
},
{
  icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#4573A2" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8.5" r="6" /><path d="M8 5.5v3l2 1.5" /><path d="M6 1.5h4" /></svg>,
  text: 'Erste Fall-Anlage in unter 30 Sekunden möglich'
}];


const OB1 = () =>
<div style={{ height: '100%', background: DS.c.bg, display: 'flex', flexDirection: 'column', fontFamily: DS.f.sans, overflow: 'hidden' }}>
    <div style={{ padding: '20px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
      <LogoFull />
      <span style={{ fontFamily: DS.f.sans, fontSize: 13, color: DS.c.muted, cursor: 'pointer' }}>Überspringen</span>
    </div>
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 32px' }}>
      <div style={{ width: 520, display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div>
          <div style={{ fontFamily: DS.f.sans, fontSize: 28, fontWeight: 700, color: DS.c.navy, letterSpacing: '-0.03em', lineHeight: 1.15 }}>
            Willkommen bei Claimondo,<br />Max Mustermann.
          </div>
          <div style={{ fontFamily: DS.f.sans, fontSize: 15, color: DS.c.muted, marginTop: 10, lineHeight: 1.6 }}>
            Sie können sofort loslegen — keine Anmeldung, kein Passwort.
          </div>
        </div>

        <div style={{ background: '#eef4fb', border: '1px solid #d5e2ef', borderRadius: DS.r.md, padding: '12px 16px', fontFamily: DS.f.sans, fontSize: 13.5, color: DS.c.shield, lineHeight: 1.65 }}>
          Wir haben Ihre E-Mail-Adresse aus Ihrer Anfrage. Alles andere — Kanzleiname, Telefon, Bankverbindung für Provisionen — können Sie später unter <em>Einstellungen</em> ergänzen, wenn Sie Zeit haben.
        </div>

        <Card style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 0 }}>
          {OB1_ITEMS.map(({ icon, text }, i) =>
        <div key={i} style={{
          display: 'flex', alignItems: 'center', gap: 14,
          padding: '14px 0',
          borderBottom: i < OB1_ITEMS.length - 1 ? `1px solid ${DS.c.border}` : 'none'
        }}>
              <div style={{ width: 34, height: 34, borderRadius: DS.r.lg, background: '#eef4fb', border: '1px solid #d5e2ef', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {icon}
              </div>
              <span style={{ fontFamily: DS.f.sans, fontSize: 14, color: DS.c.navy, lineHeight: 1.55 }}>{text}</span>
            </div>
        )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <Btn label="Weiter →" variant="default" size="md" />
          </div>
        </Card>
      </div>
    </div>
    <div style={{ padding: '20px 32px', display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
      <OBDots step={1} />
    </div>
  </div>;


/* ─── Onboarding 2 ──────────────────────────────────────────── */
const ProvStep = ({ n, icon, title, desc, arrow }) =>
<div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, flex: 1, textAlign: 'center' }}>
      <div style={{ width: 56, height: 56, borderRadius: DS.r.xl, background: `${DS.c.navy}08`, border: `1.5px solid ${DS.c.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {icon}
      </div>
      <div style={{ fontFamily: DS.f.mono, fontSize: 10, color: DS.c.ondo, textTransform: 'uppercase', letterSpacing: '0.12em' }}>Schritt {n}</div>
      <div style={{ fontFamily: DS.f.sans, fontSize: 13, fontWeight: 600, color: DS.c.navy }}>{title}</div>
      <div style={{ fontFamily: DS.f.sans, fontSize: 12, color: DS.c.muted, lineHeight: 1.55, maxWidth: 120 }}>{desc}</div>
    </div>
    {arrow && <div style={{ flexShrink: 0, padding: '0 8px', paddingBottom: 32 }}><Ic.ChevronRight s={18} c={DS.c.muted2} /></div>}
  </div>;


const OB2 = () =>
<div style={{ height: '100%', background: DS.c.bg, display: 'flex', flexDirection: 'column', fontFamily: DS.f.sans, overflow: 'hidden' }}>
    <div style={{ padding: '20px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
      <LogoFull />
      <span style={{ fontFamily: DS.f.sans, fontSize: 13, color: DS.c.muted, cursor: 'pointer' }}>Überspringen</span>
    </div>
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 32px' }}>
      <div style={{ width: 560, display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div>
          <div style={{ fontFamily: DS.f.sans, fontSize: 24, fontWeight: 700, color: DS.c.navy, letterSpacing: '-0.025em' }}>So verdienen Sie Provision</div>
          <div style={{ fontFamily: DS.f.sans, fontSize: 14, color: DS.c.muted, marginTop: 6 }}>In drei Schritten zur Übergabe an Claimondo</div>
        </div>
        <Card style={{ padding: '28px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start' }}>
            <ProvStep n={1} icon={<Ic.Phone s={24} c={DS.c.ondo} />} title="Mandant leiten" desc="Anlage dauert 30 Sekunden — während des Telefonats" arrow />
            <ProvStep n={2} icon={<Ic.Shield s={24} c={DS.c.ondo} />} title="Claimondo übernimmt" desc="Rückruf, Werkstatt, Gutachter — wir kümmern uns" arrow />
            <ProvStep n={3} icon={<Ic.Euro s={24} c={DS.c.ondo} />} title="Provision gutgeschrieben" desc="Nach erfolgreichem Abschluss, aggregiert im Dashboard" />
          </div>
          <div style={{ marginTop: 20, padding: '12px 16px', background: '#eef4fb', borderRadius: DS.r.md, border: '1px solid #d5e2ef' }}>
            <div style={{ fontFamily: DS.f.sans, fontSize: 13, color: DS.c.shield, lineHeight: 1.55 }}>
              Die genaue Provisionsvereinbarung finden Sie im nächsten Schritt sowie jederzeit unter <em>Einstellungen → Provisionsvereinbarung</em>.
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20 }}>
            <Btn label="← Zurück" variant="ghost" size="md" />
            <Btn label="Weiter →" variant="default" size="md" />
          </div>
        </Card>
      </div>
    </div>
    <div style={{ padding: '20px 32px', display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
      <OBDots step={2} />
    </div>
  </div>;


/* ─── Onboarding 3 ──────────────────────────────────────────── */
const OB3 = () =>
<div style={{ height: '100%', background: DS.c.bg, display: 'flex', flexDirection: 'column', fontFamily: DS.f.sans, overflow: 'hidden' }}>
    <div style={{ padding: '20px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
      <LogoFull />
    </div>
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 32px' }}>
      <div style={{ width: 520, display: 'flex', flexDirection: 'column', gap: 24, alignItems: 'center', textAlign: 'center' }}>
        <ShieldIllustration />
        <div>
          <div style={{ fontFamily: DS.f.sans, fontSize: 28, fontWeight: 700, color: DS.c.navy, letterSpacing: '-0.03em', lineHeight: 1.15 }}>Bereit für Ihren ersten Fall</div>
          <div style={{ fontFamily: DS.f.sans, fontSize: 14, color: DS.c.muted, marginTop: 10, lineHeight: 1.65 }}>
            Sobald ein Mandant nach einem Unfall anruft, haben Sie alles, was Sie brauchen.
          </div>
        </div>
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
        { n: 1, t: 'Drei Felder ausfüllen', d: 'Name, Telefon, Kennzeichen — fertig' },
        { n: 2, t: 'Claimondo übernimmt', d: 'Rückruf in 10 Minuten, Sie werden per E-Mail informiert' },
        { n: 3, t: 'Provision im Blick', d: 'Aggregierter Monatsstand im Dashboard, kein Live-Counter' }].
        map(({ n, t, d }) =>
        <div key={n} style={{ display: 'flex', gap: 14, alignItems: 'center', padding: '12px 16px', background: DS.c.card, border: `1px solid ${DS.c.border}`, borderRadius: DS.r.lg, textAlign: 'left' }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: `${DS.c.ondo}18`, border: `1.5px solid ${DS.c.ondo}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ fontFamily: DS.f.mono, fontSize: 12, fontWeight: 600, color: DS.c.ondo }}>{n}</span>
              </div>
              <div>
                <div style={{ fontFamily: DS.f.sans, fontSize: 13, fontWeight: 600, color: DS.c.navy }}>{t}</div>
                <div style={{ fontFamily: DS.f.sans, fontSize: 12, color: DS.c.muted, marginTop: 2 }}>{d}</div>
              </div>
            </div>
        )}
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
          <Btn label="← Zurück" variant="ghost" size="md" />
          <Btn label="Ersten Fall anlegen →" variant="default" size="lg" icon={<Ic.Plus s={14} c="#fff" />} />
        </div>
      </div>
    </div>
    <div style={{ padding: '20px 32px', display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
      <OBDots step={3} />
    </div>
  </div>;


/* ─── Schnellanlage state variants ──────────────────────────── */
const StateVariant = ({ label, state }) =>
<div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: DS.c.bg, fontFamily: DS.f.sans }}>
    <div style={{ height: 36, background: DS.c.card, borderBottom: `1px solid ${DS.c.border}`, display: 'flex', alignItems: 'center', padding: '0 20px', flexShrink: 0, gap: 10 }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: DS.c.ondo }} />
      <span style={{ fontFamily: DS.f.mono, fontSize: 11, color: DS.c.muted }}>State: {label}</span>
    </div>
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <SchnellanlageCard state={state} />
    </div>
  </div>;


/* ─── Export all screens ────────────────────────────────────── */
Object.assign(window, {
  S1Desktop, S2Desktop, S3Desktop,
  S1Mobile, S2Mobile, S3Mobile,
  EmptyState, DsgvoModal, LoginScreen, MagicLinkSent,
  OB1, OB2, OB3,
  StateVariant
});