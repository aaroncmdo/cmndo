// prototype-screens.jsx — All clickable prototype screens
// Requires hifi-shared.jsx to be loaded first (window exports)

const { useState, useEffect } = React;
const { DS, Ic, LogoMark, LogoFull, Footer, MagicBanner, Btn, Field, CheckRow,
        Pill, StatusPill, KPICard, TLStep, InfoBlock, SuccessAlert,
        ShieldIllustration, OBDots, Card } = window;

const CASES = [
  { name: 'Maria Schulze',  plate: 'K-AB 1234',  statusInfo: 'Erstanruf heute, 14:32',      status: 'Rückruf läuft'    },
  { name: 'Thomas Bauer',   plate: 'BN-CD 5678', statusInfo: 'Werkstatt-Termin 20.04.',      status: 'Termin gebucht'   },
  { name: 'Sabine Meier',   plate: 'GM-EF 9012', statusInfo: 'Gutachter beauftragt',          status: 'Regulierung läuft'},
  { name: 'Klaus Hoffmann', plate: 'RE-GH 3456', statusInfo: 'Dokumente beim Versicherer',   status: 'In Prüfung'       },
  { name: 'Anna Richter',   plate: 'K-IJ 7890',  statusInfo: 'Erstanruf heute, 09:15',       status: 'Rückruf läuft'   },
];

const STATUS_BORDER = {
  'Rückruf läuft': '#f59e0b', 'Termin gebucht': '#4573A2',
  'Regulierung läuft': '#10b981', 'In Prüfung': '#9ca3af',
  'Mandant nicht erreichbar': '#c0392b',
};

/* ─── Sidebar ─────────────────────────────────────────────── */
const ProtoSidebar = ({ active = 'dashboard', go }) => {
  const items = [
    { ic: 'Grid',     label: 'Dashboard',         id: 'dashboard',   dest: 'dash'  },
    { ic: 'Folder',   label: 'Fälle',              id: 'faelle',      dest: 'dash'  },
    { ic: 'Euro',     label: 'Provisionen',         id: 'provisionen', dest: null    },
    { ic: 'Share',    label: 'Empfehlungs-Tools',   id: 'tools',       dest: null    },
    { ic: 'Settings', label: 'Einstellungen',        id: 'settings',    dest: null    },
  ];
  return (
    <div style={{ width: 240, height: '100%', background: DS.c.card, borderRight: `1px solid ${DS.c.border}`, display: 'flex', flexDirection: 'column', padding: '24px 12px 16px', flexShrink: 0 }}>
      <div style={{ padding: '0 12px', marginBottom: 30 }}><LogoFull /></div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
        {items.map(({ ic, label, id, dest }) => {
          const on = id === active;
          const IcC = Ic[ic];
          return (
            <div key={id} onClick={dest ? () => go(dest) : undefined} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '9px 12px', borderRadius: '9px',
              background: on ? DS.c.navy : 'transparent',
              color: on ? '#fff' : '#41495c',
              cursor: dest ? 'pointer' : 'default',
              opacity: dest || on ? 1 : 0.42,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <IcC s={16} c={on ? '#fff' : '#41495c'} />
                <span style={{ fontFamily: DS.f.sans, fontSize: 13.5, fontWeight: on ? 600 : 400 }}>{label}</span>
              </div>
              {!dest && <span style={{ fontFamily: DS.f.mono, fontSize: 9, color: DS.c.muted2, letterSpacing: '0.06em' }}>bald</span>}
            </div>
          );
        })}
      </div>
      <div style={{ borderTop: `1px solid ${DS.c.border}`, paddingTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 12px' }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: `linear-gradient(135deg,${DS.c.ondo},${DS.c.navy})`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontFamily: DS.f.sans, fontSize: 11, fontWeight: 600, color: '#fff' }}>MM</span>
          </div>
          <div>
            <div style={{ fontFamily: DS.f.sans, fontSize: 13, fontWeight: 600, color: DS.c.navy }}>Max Mustermann</div>
            <div style={{ fontFamily: DS.f.mono, fontSize: 10, color: DS.c.muted }}>makler@buero.de</div>
          </div>
        </div>
      </div>
    </div>
  );
};

const ProtoFooter = ({ go }) => (
  <div style={{ padding: '9px 32px', borderTop: `1px solid ${DS.c.border}`, display: 'flex', gap: 22, background: DS.c.card, flexShrink: 0, alignItems: 'center' }}>
    {['Impressum', 'Datenschutz', 'AGB Maklerbeziehung', 'Provisionsvereinbarung ↓'].map((l, i) => (
      <span key={i} style={{ fontFamily: DS.f.sans, fontSize: 12, color: DS.c.muted, cursor: 'pointer' }}>{l}</span>
    ))}
    <div style={{ flex: 1 }} />
    <span onClick={() => go('login')} style={{ fontFamily: DS.f.mono, fontSize: 10, color: DS.c.muted2, cursor: 'pointer', padding: '4px 10px', border: `1px solid ${DS.c.border}`, borderRadius: 999 }}>↺ Demo zurücksetzen</span>
  </div>
);

const PDLayout = ({ active, go, children, banner }) => (
  <div style={{ display: 'flex', height: '100%', background: DS.c.bg, fontFamily: DS.f.sans, overflow: 'hidden' }}>
    <ProtoSidebar active={active} go={go} />
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {banner}
      <div style={{ flex: 1, padding: '40px 56px', overflowY: 'auto' }}>{children}</div>
      <ProtoFooter go={go} />
    </div>
  </div>
);

/* ─── Mobile layouts ──────────────────────────────────────── */
const ProtoBottomNav = ({ active, go }) => (
  <div style={{ height: 68, background: DS.c.card, borderTop: `1px solid ${DS.c.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-around', padding: '0 24px 4px', flexShrink: 0, boxShadow: '0 -4px 12px rgba(13,27,62,.06)' }}>
    <div onClick={() => go('m_dash')} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, cursor: 'pointer' }}>
      <Ic.Grid s={22} c={active === 'dashboard' ? DS.c.navy : DS.c.muted} />
      <span style={{ fontFamily: DS.f.sans, fontSize: 10, color: active === 'dashboard' ? DS.c.navy : DS.c.muted, fontWeight: active === 'dashboard' ? 600 : 400 }}>Dashboard</span>
    </div>
    <div onClick={() => go('m_sc')} style={{ width: 52, height: 52, borderRadius: '50%', background: DS.c.navy, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 16px rgba(13,27,62,.4)', cursor: 'pointer', marginBottom: 18 }}>
      <Ic.Plus s={22} c="#fff" />
    </div>
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, opacity: 0.4 }}>
      <div style={{ width: 28, height: 28, borderRadius: '50%', background: `linear-gradient(135deg,${DS.c.ondo},${DS.c.navy})`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontFamily: DS.f.sans, fontSize: 10, fontWeight: 600, color: '#fff' }}>MM</span>
      </div>
      <span style={{ fontFamily: DS.f.sans, fontSize: 10, color: DS.c.muted }}>Profil</span>
    </div>
  </div>
);

const PMLayout = ({ active = 'dashboard', go, children, banner }) => (
  <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: DS.c.bg, fontFamily: DS.f.sans, overflow: 'hidden' }}>
    <div style={{ height: 28, background: DS.c.navy, display: 'flex', alignItems: 'center', padding: '0 16px', justifyContent: 'space-between', flexShrink: 0 }}>
      <span style={{ fontFamily: DS.f.mono, fontSize: 10, color: 'rgba(255,255,255,.8)' }}>9:41</span>
      <span style={{ fontFamily: DS.f.mono, fontSize: 9, color: 'rgba(255,255,255,.4)' }}>●●●</span>
    </div>
    <div style={{ height: 52, background: DS.c.card, borderBottom: `1px solid ${DS.c.border}`, display: 'flex', alignItems: 'center', padding: '0 16px', justifyContent: 'space-between', flexShrink: 0 }}>
      <LogoMark size={32} />
      <Ic.Bell s={20} c={DS.c.navy} />
    </div>
    {banner}
    <div style={{ flex: 1, overflowY: 'auto' }}>{children}</div>
    <ProtoBottomNav active={active} go={go} />
  </div>
);

/* ─── Auth screens ────────────────────────────────────────── */
const PLogin = ({ go }) => (
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
        <Btn label="Login-Link zusenden" variant="default" size="lg" full icon={<Ic.Mail s={14} c="#fff" />} onClick={() => go('magic')} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, height: 1, background: DS.c.border }} />
          <span style={{ fontFamily: DS.f.mono, fontSize: 11, color: DS.c.muted2 }}>oder</span>
          <div style={{ flex: 1, height: 1, background: DS.c.border }} />
        </div>
        <div style={{ fontFamily: DS.f.sans, fontSize: 13, color: DS.c.muted, textAlign: 'center', lineHeight: 1.55 }}>
          Noch kein Zugang? <span style={{ color: DS.c.ondo, cursor: 'pointer' }}>Einladung anfordern →</span>
        </div>
      </Card>
      <div style={{ display: 'flex', gap: 20 }}>
        {['Impressum', 'Datenschutz', 'AGB'].map((l, i) => <span key={i} style={{ fontFamily: DS.f.sans, fontSize: 12, color: DS.c.muted }}>{l}</span>)}
      </div>
    </div>
  </div>
);

const PMagicSent = ({ go }) => {
  useEffect(() => { const t = setTimeout(() => go('ob1'), 3000); return () => clearTimeout(t); }, []);
  return (
    <div style={{ height: '100%', background: DS.c.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: DS.f.sans }}>
      <div style={{ width: 380, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
        <LogoFull />
        <Card style={{ width: '100%', padding: '32px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, textAlign: 'center' }}>
          <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#ecfdf5', border: '2px solid #bbf7d0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Ic.Mail s={22} c="#10b981" />
          </div>
          <div style={{ fontFamily: DS.f.sans, fontSize: 20, fontWeight: 700, color: DS.c.navy, letterSpacing: '-0.02em' }}>Link gesendet!</div>
          <div style={{ fontFamily: DS.f.sans, fontSize: 13.5, color: DS.c.muted, lineHeight: 1.65 }}>
            Schauen Sie in Ihr Postfach (<span style={{ fontFamily: DS.f.mono, fontSize: 12 }}>makler@kanzlei.de</span>). Weiterleitung in 3 Sekunden…
          </div>
          <div style={{ width: '100%', padding: '11px 16px', background: DS.c.bg, borderRadius: DS.r.md, border: `1px solid ${DS.c.border}`, cursor: 'pointer' }} onClick={() => go('ob1')}>
            <span style={{ fontFamily: DS.f.sans, fontSize: 13, color: DS.c.muted }}>Kein E-Mail erhalten? </span>
            <span style={{ fontFamily: DS.f.sans, fontSize: 13, color: DS.c.ondo }}>Link erneut senden →</span>
          </div>
        </Card>
      </div>
    </div>
  );
};

/* ─── Onboarding ──────────────────────────────────────────── */
const OBShell = ({ step, go, onBack, onNext, nextLabel = 'Weiter →', children }) => (
  <div style={{ height: '100%', background: DS.c.bg, display: 'flex', flexDirection: 'column', fontFamily: DS.f.sans, overflow: 'hidden' }}>
    <div style={{ padding: '20px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
      <LogoFull />
      <span onClick={() => go('dash')} style={{ fontFamily: DS.f.sans, fontSize: 13, color: DS.c.muted, cursor: 'pointer' }}>Überspringen</span>
    </div>
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 32px' }}>{children}</div>
    <div style={{ padding: '20px 32px', display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center', flexShrink: 0 }}>
      <OBDots step={step} />
    </div>
  </div>
);

const POB1 = ({ go }) => {
  const items = [
    { icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#4573A2" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="7" width="10" height="8" rx="1.5"/><path d="M5 7V5C5 3.3 6.3 2 8 2C9.7 2 11 3.3 11 5v2"/></svg>, text: 'Login per Magic-Link in Ihrer E-Mail — kein Passwort nötig' },
    { icon: <Ic.Shield s={16} c={DS.c.ondo} />, text: 'Ihre Mandantendaten bleiben DSGVO-konform geschützt' },
    { icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#4573A2" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8.5" r="6"/><path d="M8 5.5v3l2 1.5"/><path d="M6 1.5h4"/></svg>, text: 'Erste Fall-Anlage in unter 30 Sekunden möglich' },
  ];
  return (
    <OBShell step={1} go={go}>
      <div style={{ width: 520, display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div>
          <div style={{ fontFamily: DS.f.sans, fontSize: 28, fontWeight: 700, color: DS.c.navy, letterSpacing: '-0.03em', lineHeight: 1.15 }}>Willkommen bei Claimondo,<br/>Max Mustermann.</div>
          <div style={{ fontFamily: DS.f.sans, fontSize: 15, color: DS.c.muted, marginTop: 10, lineHeight: 1.6 }}>Sie können sofort loslegen — keine Anmeldung, kein Passwort.</div>
        </div>
        <div style={{ background: '#eef4fb', border: '1px solid #d5e2ef', borderRadius: DS.r.md, padding: '12px 16px', fontFamily: DS.f.sans, fontSize: 13.5, color: DS.c.shield, lineHeight: 1.65 }}>
          Wir haben Ihre E-Mail-Adresse aus Ihrer Anfrage. Alles andere — Kanzleiname, Telefon, Bankverbindung für Provisionen — können Sie später unter <em>Einstellungen</em> ergänzen.
        </div>
        <Card style={{ padding: '20px 24px' }}>
          {items.map(({ icon, text }, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', borderBottom: i < items.length - 1 ? `1px solid ${DS.c.border}` : 'none' }}>
              <div style={{ width: 34, height: 34, borderRadius: DS.r.lg, background: '#eef4fb', border: '1px solid #d5e2ef', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{icon}</div>
              <span style={{ fontFamily: DS.f.sans, fontSize: 14, color: DS.c.navy, lineHeight: 1.55 }}>{text}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <Btn label="Weiter →" variant="default" size="md" onClick={() => go('ob2')} />
          </div>
        </Card>
      </div>
    </OBShell>
  );
};

const POB2 = ({ go }) => (
  <OBShell step={2} go={go}>
    <div style={{ width: 560, display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <div style={{ fontFamily: DS.f.sans, fontSize: 24, fontWeight: 700, color: DS.c.navy, letterSpacing: '-0.025em' }}>So verdienen Sie Provision</div>
        <div style={{ fontFamily: DS.f.sans, fontSize: 14, color: DS.c.muted, marginTop: 6 }}>Drei Schritte, kein Aufwand nach der Übergabe</div>
      </div>
      <Card style={{ padding: '28px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start' }}>
          {[
            { n:1, Icon: <Ic.Phone s={24} c={DS.c.ondo}/>, title: 'Mandant leiten', desc: '30 Sekunden — während des Telefonats' },
            { n:2, Icon: <Ic.Shield s={24} c={DS.c.ondo}/>, title: 'Claimondo übernimmt', desc: 'Rückruf, Werkstatt, Gutachter' },
            { n:3, Icon: <Ic.Euro s={24} c={DS.c.ondo}/>, title: 'Provision gutgeschrieben', desc: 'Aggregiert im Dashboard' },
          ].map(({ n, Icon, title, desc }, i, a) => (
            <React.Fragment key={n}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center' }}>
                <div style={{ width: 56, height: 56, borderRadius: DS.r.xl, background: `${DS.c.navy}08`, border: `1.5px solid ${DS.c.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{Icon}</div>
                <div style={{ fontFamily: DS.f.mono, fontSize: 10, color: DS.c.ondo, textTransform: 'uppercase', letterSpacing: '0.12em' }}>Schritt {n}</div>
                <div style={{ fontFamily: DS.f.sans, fontSize: 13, fontWeight: 600, color: DS.c.navy }}>{title}</div>
                <div style={{ fontFamily: DS.f.sans, fontSize: 12, color: DS.c.muted, lineHeight: 1.55, maxWidth: 120 }}>{desc}</div>
              </div>
              {i < a.length - 1 && <div style={{ flexShrink: 0, padding: '0 8px', paddingBottom: 32 }}><Ic.ChevronRight s={18} c={DS.c.muted2}/></div>}
            </React.Fragment>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24 }}>
          <Btn label="← Zurück" variant="ghost" size="md" onClick={() => go('ob1')} />
          <Btn label="Weiter →" variant="default" size="md" onClick={() => go('ob3')} />
        </div>
      </Card>
    </div>
  </OBShell>
);

const POB3 = ({ go }) => (
  <OBShell step={3} go={go}>
    <div style={{ width: 520, display: 'flex', flexDirection: 'column', gap: 24, alignItems: 'center', textAlign: 'center' }}>
      <ShieldIllustration />
      <div>
        <div style={{ fontFamily: DS.f.sans, fontSize: 28, fontWeight: 700, color: DS.c.navy, letterSpacing: '-0.03em', lineHeight: 1.15 }}>Bereit für Ihren ersten Fall</div>
        <div style={{ fontFamily: DS.f.sans, fontSize: 14, color: DS.c.muted, marginTop: 10, lineHeight: 1.65 }}>Sobald ein Mandant nach einem Unfall anruft, haben Sie alles, was Sie brauchen.</div>
      </div>
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[
          { t:'Drei Felder ausfüllen', d:'Name, Telefon, Kennzeichen — fertig' },
          { t:'Claimondo übernimmt',   d:'Rückruf in 10 Minuten, E-Mail-Bestätigung für Sie' },
          { t:'Provision im Blick',    d:'Aggregierter Monatsstand im Dashboard' },
        ].map(({ t, d }, i) => (
          <div key={i} style={{ display: 'flex', gap: 14, alignItems: 'center', padding: '12px 16px', background: DS.c.card, border: `1px solid ${DS.c.border}`, borderRadius: DS.r.lg, textAlign: 'left' }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: `${DS.c.ondo}18`, border: `1.5px solid ${DS.c.ondo}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ fontFamily: DS.f.mono, fontSize: 12, fontWeight: 600, color: DS.c.ondo }}>{i + 1}</span>
            </div>
            <div>
              <div style={{ fontFamily: DS.f.sans, fontSize: 13, fontWeight: 600, color: DS.c.navy }}>{t}</div>
              <div style={{ fontFamily: DS.f.sans, fontSize: 12, color: DS.c.muted, marginTop: 2 }}>{d}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
        <Btn label="← Zurück" variant="ghost" size="md" onClick={() => go('ob2')} />
        <Btn label="Ersten Fall anlegen →" variant="default" size="lg" icon={<Ic.Plus s={14} c="#fff"/>} onClick={() => go('sc')} />
      </div>
    </div>
  </OBShell>
);

/* ─── Schnellanlage (manages own state + DSGVO) ───────────── */
const PSchnellanlage = ({ go, dsgvoDone, setDsgvoDone }) => {
  const [st, setSt] = useState('empty');
  const [detailOpen, setDetailOpen] = useState(false);
  const [dsgvoChecked, setDsgvoChecked] = useState(false);
  const isFilled = ['filled','loading','success'].includes(st);

  const startLoading = () => {
    setSt('loading');
    setTimeout(() => { setSt('success'); setTimeout(() => go('dash'), 2000); }, 1500);
  };
  const handleSubmit = () => { if (!dsgvoDone) setSt('dsgvo'); else startLoading(); };
  const handleDsgvoConfirm = () => { setDsgvoDone(true); setSt('empty'); startLoading(); };

  return (
    <PDLayout active="faelle" go={go}>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <Card style={{ padding: '28px 32px', width: 520, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <div style={{ fontFamily: DS.f.sans, fontSize: 22, fontWeight: 600, color: DS.c.navy, letterSpacing: '-0.025em', lineHeight: 1.15 }}>Mandant in 30 Sekunden weiterleiten</div>
            <div style={{ fontFamily: DS.f.sans, fontSize: 14, color: DS.c.muted, marginTop: 6 }}>Sie sind am Telefon — drei Felder reichen</div>
          </div>
          <InfoBlock>Den Rest klärt Claimondo per Rückruf in den nächsten 10 Minuten.</InfoBlock>
          <Field label="Telefonnummer Mandant" required placeholder="+49 · · ·"
            value={isFilled && st !== 'error' ? '+49 221 98765432' : st === 'error' ? '0221-UNGÜLTIG' : undefined}
            error={st === 'error' ? 'Ungültige Telefonnummer — bitte Vorwahl und Nummer prüfen' : undefined} />
          <Field label="Name des Fahrzeughalters" required placeholder="Vor- und Nachname"
            value={isFilled ? 'Maria Schulze' : undefined} />
          <Field label="Kfz-Kennzeichen" required mono placeholder="K-AB 1234"
            value={isFilled ? 'K-AB 1234' : undefined}
            hint={!isFilled ? 'Wird automatisch in Großbuchstaben umgewandelt' : undefined} />

          {/* Demo shortcuts */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {(st === 'empty' || st === 'error') && (
              <span onClick={() => setSt('filled')} style={{ fontFamily: DS.f.mono, fontSize: 11, color: DS.c.ondo, cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted' }}>
                Demo: Felder ausfüllen ▸
              </span>
            )}
            {st === 'empty' && (
              <span onClick={() => setSt('error')} style={{ fontFamily: DS.f.mono, fontSize: 11, color: DS.c.muted2, cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted' }}>
                Validierungsfehler testen
              </span>
            )}
          </div>

          <Btn label={st === 'loading' ? 'Wird übergeben…' : st === 'success' ? '✓ Übergeben' : 'An Claimondo übergeben'}
            variant={st === 'success' ? 'secondary' : 'default'} size="lg" full
            loading={st === 'loading'} disabled={!isFilled || st === 'success'}
            onClick={isFilled && st !== 'loading' && st !== 'success' ? handleSubmit : undefined} />

          {st === 'success' && <SuccessAlert>Übergeben. Ihr Mandant erhält in 10 Minuten einen Anruf von Claimondo. Sie erhalten eine Bestätigungs-E-Mail.</SuccessAlert>}

          <div style={{ borderTop: `1px dashed ${DS.c.border}`, paddingTop: 14 }}>
            <div onClick={() => setDetailOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <div style={{ transition: 'transform .2s', transform: detailOpen ? 'rotate(90deg)' : 'none' }}><Ic.ChevronRight s={13} c={DS.c.muted}/></div>
              <span style={{ fontFamily: DS.f.sans, fontSize: 13, color: DS.c.muted }}>Weitere Schadensdetails (optional)</span>
            </div>
            {detailOpen && (
              <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', gap: 12 }}>
                  <Field label="Unfallzeitpunkt" placeholder="17.04.2026, 14:32" style={{ flex: 1 }} />
                  <Field label="Polizei beteiligt?" placeholder="Ja / Nein" style={{ flex: 1 }} />
                </div>
                <Field label="Gegnerversicherung" placeholder="z.B. HUK-Coburg" />
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* DSGVO Modal */}
      {st === 'dsgvo' && (
        <div style={{ position: 'fixed', inset: 0, background: `${DS.c.navy}73`, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <Card style={{ padding: '32px', width: 520, display: 'flex', flexDirection: 'column', gap: 18, boxShadow: DS.sh.lg }}>
            <div style={{ fontFamily: DS.f.sans, fontSize: 19, fontWeight: 700, color: DS.c.navy, letterSpacing: '-0.02em' }}>Datenschutz-Hinweis</div>
            <div style={{ fontFamily: DS.f.sans, fontSize: 14, color: DS.c.navy, lineHeight: 1.6, maxHeight: 130, overflowY: 'auto' }}>
              Gemäß Art. 13 DSGVO: Die von Ihnen erhobenen Daten Ihres Mandanten (Name, Telefon, Kfz-Kennzeichen) werden zur Schadenregulierung an Claimondo GmbH übermittelt. Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO. Der Mandant hat das Recht auf Auskunft, Berichtigung und Löschung.
            </div>
            <div onClick={() => setDsgvoChecked(c => !c)} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
              <div style={{ width: 18, height: 18, borderRadius: 5, flexShrink: 0, marginTop: 1, border: `1.5px solid ${dsgvoChecked ? DS.c.navy : DS.c.border}`, background: dsgvoChecked ? DS.c.navy : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {dsgvoChecked && <Ic.Check s={10} c="#fff"/>}
              </div>
              <span style={{ fontFamily: DS.f.sans, fontSize: 13.5, color: DS.c.navy, lineHeight: 1.55 }}>Mein Mandant hat der Übergabe seiner Daten an Claimondo zugestimmt.</span>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <Btn label="Abbrechen" variant="outline" size="md" onClick={() => { setSt('filled'); setDsgvoChecked(false); }} />
              <Btn label="Bestätigen und übergeben" variant="default" size="md" disabled={!dsgvoChecked} onClick={dsgvoChecked ? handleDsgvoConfirm : undefined} />
            </div>
          </Card>
        </div>
      )}
    </PDLayout>
  );
};

/* ─── Dashboard ───────────────────────────────────────────── */
const PDashboard = ({ go }) => (
  <PDLayout active="dashboard" go={go}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
      <div>
        <div style={{ fontFamily: DS.f.sans, fontSize: 26, fontWeight: 700, color: DS.c.navy, letterSpacing: '-0.03em' }}>Guten Morgen, Max Mustermann</div>
        <div style={{ fontFamily: DS.f.mono, fontSize: 12, color: DS.c.muted, marginTop: 4 }}>April 2026</div>
      </div>
      <Btn label="+ Fall anlegen" variant="default" size="md" icon={<Ic.Plus s={13} c="#fff"/>} onClick={() => go('sc')} />
    </div>
    <div style={{ display: 'flex', gap: 14, marginBottom: 24 }}>
      <KPICard label="Aktive Fälle"       value="7"       accent="ondo"  delta="↑ 2 vs. Vormonat" />
      <KPICard label="Fälle diesen Monat" value="12"      accent="navy"  />
      <KPICard label="Provision April"    value="840 €"   accent="green" delta="6 abgeschlossen" />
      <KPICard label="Forecast April"     value="1.120 €" accent="amber" />
    </div>
    <Card style={{ marginBottom: 20, overflow: 'hidden' }}>
      <div style={{ padding: '14px 18px', borderBottom: `1px solid ${DS.c.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontFamily: DS.f.sans, fontSize: 15, fontWeight: 600, color: DS.c.navy }}>Fälle in Bearbeitung</span>
        <span style={{ fontFamily: DS.f.sans, fontSize: 13, color: DS.c.ondo, cursor: 'pointer' }}>Alle anzeigen →</span>
      </div>
      {CASES.map((c, i) => (
        <div key={i} onClick={c.name === 'Maria Schulze' ? () => go('case') : undefined}
          style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, borderBottom: i < CASES.length - 1 ? `1px solid ${DS.c.border}` : 'none', borderLeft: `4px solid ${STATUS_BORDER[c.status]}`, background: DS.c.card, cursor: c.name === 'Maria Schulze' ? 'pointer' : 'default' }}>
          <div style={{ flex: 1.5 }}>
            <div style={{ fontFamily: DS.f.sans, fontSize: 14, fontWeight: 600, color: DS.c.navy }}>{c.name}</div>
            <div style={{ fontFamily: DS.f.mono, fontSize: 11, color: DS.c.muted, marginTop: 2, letterSpacing: '0.06em' }}>{c.plate}</div>
          </div>
          <div style={{ flex: 1.5, fontFamily: DS.f.sans, fontSize: 13, color: DS.c.muted }}>{c.statusInfo}</div>
          <StatusPill status={c.status} />
          <Ic.ChevronRight s={14} c={DS.c.muted2} />
        </div>
      ))}
    </Card>
    <Card style={{ padding: '14px 18px' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontFamily: DS.f.sans, fontSize: 13, fontWeight: 600, color: DS.c.navy, marginRight: 6 }}>Empfehlungs-Tools</span>
        <Btn label="QR-Visitenkarte bestellen" variant="outline" size="sm" />
        <Btn label="Mandanten-Mail-Vorlage" variant="outline" size="sm" />
        <Btn label="Schulungsvideo" variant="outline" size="sm" />
      </div>
    </Card>
  </PDLayout>
);

const PEmptyDash = ({ go }) => (
  <PDLayout active="dashboard" go={go}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
      <div>
        <div style={{ fontFamily: DS.f.sans, fontSize: 26, fontWeight: 700, color: DS.c.navy, letterSpacing: '-0.03em' }}>Willkommen, Max Mustermann</div>
        <div style={{ fontFamily: DS.f.mono, fontSize: 12, color: DS.c.muted, marginTop: 4 }}>April 2026</div>
      </div>
    </div>
    <div style={{ display: 'flex', gap: 14, marginBottom: 24 }}>
      {['Aktive Fälle','Fälle diesen Monat','Provision April','Forecast April'].map((l, i) => <KPICard key={i} label={l} value="—" accent={['ondo','navy','green','amber'][i]} />)}
    </div>
    <Card style={{ padding: '56px 40px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, textAlign: 'center' }}>
      <ShieldIllustration />
      <div style={{ fontFamily: DS.f.sans, fontSize: 20, fontWeight: 700, color: DS.c.navy, letterSpacing: '-0.02em' }}>Noch keine Fälle vorhanden</div>
      <div style={{ fontFamily: DS.f.sans, fontSize: 14, color: DS.c.muted, maxWidth: 380, lineHeight: 1.65 }}>Legen Sie Ihren ersten Mandanten-Fall an, sobald ein Mandant nach einem Unfall anruft.</div>
      <Btn label="Ersten Fall anlegen" variant="default" size="lg" icon={<Ic.Plus s={14} c="#fff"/>} onClick={() => go('sc')} style={{ marginTop: 8 }} />
    </Card>
  </PDLayout>
);

/* ─── Fall-Detail ─────────────────────────────────────────── */
const PCaseDetail = ({ go }) => (
  <PDLayout active="faelle" go={go} banner={
    <div style={{ height: 36, background: '#eef4fb', borderBottom: '1px solid #d5e2ef', display: 'flex', alignItems: 'center', padding: '0 24px', gap: 8, flexShrink: 0 }}>
      <Ic.Mail s={13} c={DS.c.ondo} />
      <span style={{ fontFamily: DS.f.sans, fontSize: 13, color: DS.c.shield, flex: 1 }}>Geöffnet aus E-Mail · keine Anmeldung nötig</span>
      <Ic.X s={13} c={DS.c.muted} />
    </div>
  }>
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 20 }}>
      <span onClick={() => go('dash')} style={{ fontFamily: DS.f.sans, fontSize: 13, color: DS.c.ondo, cursor: 'pointer' }}>← Dashboard</span>
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
        <TLStep label="Fall angelegt"                  time="17.04.2026, 09:15"  done />
        <TLStep label="Erstanruf Claimondo → Mandant"  time="läuft…"             active />
        <TLStep label="Schadensaufnahme abgeschlossen"                            future />
        <TLStep label="Werkstatt-Termin gebucht"                                  future />
        <TLStep label="Fahrzeug in der Werkstatt"                                 future />
        <TLStep label="Regulierung abgeschlossen"                                 future last />
      </Card>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Card style={{ padding: 18 }}>
          <div style={{ fontFamily: DS.f.sans, fontSize: 13, fontWeight: 600, color: DS.c.navy, marginBottom: 12 }}>Ansprechpartner Claimondo</div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: `linear-gradient(135deg,${DS.c.ondo},${DS.c.navy})`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ fontFamily: DS.f.sans, fontSize: 12, fontWeight: 600, color: '#fff' }}>JS</span>
            </div>
            <div>
              <div style={{ fontFamily: DS.f.sans, fontSize: 14, fontWeight: 600, color: DS.c.navy }}>Jana Söder</div>
              <div style={{ fontFamily: DS.f.sans, fontSize: 12, color: DS.c.muted }}>Schadensbetreuung</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Ic.Phone s={13} c={DS.c.muted}/><span style={{ fontFamily: DS.f.mono, fontSize: 12, color: DS.c.navy }}>0221 9988 7766</span></div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Ic.Mail s={13} c={DS.c.muted}/><span style={{ fontFamily: DS.f.sans, fontSize: 12, color: DS.c.ondo }}>j.soeder@claimondo.de</span></div>
          </div>
        </Card>
      </div>
    </div>
  </PDLayout>
);

/* ─── Mobile screens ──────────────────────────────────────── */
const PMSchnellanlage = ({ go, dsgvoDone, setDsgvoDone }) => {
  const [filled, setFilled] = useState(false);
  return (
    <PMLayout active="none" go={go}>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <div style={{ fontFamily: DS.f.sans, fontSize: 18, fontWeight: 700, color: DS.c.navy, letterSpacing: '-0.025em', lineHeight: 1.2 }}>Mandant in 30 Sekunden weiterleiten</div>
          <div style={{ fontFamily: DS.f.sans, fontSize: 13, color: DS.c.muted, marginTop: 4 }}>Sie sind am Telefon — drei Felder reichen</div>
        </div>
        <InfoBlock><span style={{ fontSize: 13 }}>Den Rest klärt Claimondo per Rückruf in den nächsten 10 Minuten.</span></InfoBlock>
        <Field label="Telefonnummer Mandant" required placeholder="+49 · · ·" value={filled ? '+49 221 98765432' : undefined} />
        <Field label="Name des Fahrzeughalters" required placeholder="Vor- und Nachname" value={filled ? 'Maria Schulze' : undefined} />
        <Field label="Kfz-Kennzeichen" required mono placeholder="K-AB 1234" value={filled ? 'K-AB 1234' : undefined} />
        {!filled && <span onClick={() => setFilled(true)} style={{ fontFamily: DS.f.mono, fontSize: 11, color: DS.c.ondo, cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted' }}>Demo: Felder ausfüllen ▸</span>}
        <CheckRow label="Ich habe meinen Mandanten über die Datenweitergabe informiert." checked={filled} />
        <Btn label="An Claimondo übergeben" variant="default" size="lg" full disabled={!filled} onClick={filled ? () => go('m_dash') : undefined} />
      </div>
    </PMLayout>
  );
};

const PMDashboard = ({ go }) => (
  <PMLayout active="dashboard" go={go}>
    <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontFamily: DS.f.sans, fontSize: 16, fontWeight: 700, color: DS.c.navy }}>Guten Morgen, Max</div>
          <div style={{ fontFamily: DS.f.mono, fontSize: 11, color: DS.c.muted }}>April 2026</div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <KPICard label="Aktive Fälle" value="7" accent="ondo" />
        <KPICard label="Monat ges."   value="12" accent="navy" />
        <KPICard label="Provision"    value="840 €" accent="green" />
        <KPICard label="Forecast"     value="1.120 €" accent="amber" />
      </div>
      <Card style={{ overflow: 'hidden' }}>
        <div style={{ padding: '11px 14px', borderBottom: `1px solid ${DS.c.border}` }}>
          <span style={{ fontFamily: DS.f.sans, fontSize: 14, fontWeight: 600, color: DS.c.navy }}>Fälle in Bearbeitung</span>
        </div>
        {CASES.slice(0, 4).map((c, i, a) => (
          <div key={i} onClick={c.name === 'Maria Schulze' ? () => go('m_case') : undefined}
            style={{ padding: '12px 14px', borderBottom: i < a.length - 1 ? `1px solid ${DS.c.border}` : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, borderLeft: `4px solid ${STATUS_BORDER[c.status]}`, cursor: c.name === 'Maria Schulze' ? 'pointer' : 'default' }}>
            <div>
              <div style={{ fontFamily: DS.f.sans, fontSize: 13, fontWeight: 600, color: DS.c.navy }}>{c.name}</div>
              <div style={{ fontFamily: DS.f.mono, fontSize: 10, color: DS.c.muted, marginTop: 1 }}>{c.plate}</div>
            </div>
            <StatusPill status={c.status} />
          </div>
        ))}
      </Card>
    </div>
  </PMLayout>
);

const PMCaseDetail = ({ go }) => (
  <PMLayout active="faelle" go={go}>
    <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <span onClick={() => go('m_dash')} style={{ fontFamily: DS.f.sans, fontSize: 13, color: DS.c.ondo, cursor: 'pointer' }}>← Dashboard</span>
      <Card style={{ padding: '14px 16px', borderLeft: `4px solid ${DS.c.ondo}` }}>
        <div style={{ fontFamily: DS.f.mono, fontSize: 10, color: DS.c.muted2, letterSpacing: '0.08em', marginBottom: 3 }}>CLM-2024-0042</div>
        <div style={{ fontFamily: DS.f.sans, fontSize: 18, fontWeight: 700, color: DS.c.navy, letterSpacing: '-0.02em', marginBottom: 6 }}>Maria Schulze</div>
        <div style={{ marginBottom: 6 }}><StatusPill status="Rückruf läuft" /></div>
        <span style={{ fontFamily: DS.f.mono, fontSize: 11, color: DS.c.muted }}>K-AB 1234 · VW Golf 8</span>
      </Card>
      <Card style={{ padding: '16px 18px' }}>
        <div style={{ fontFamily: DS.f.sans, fontSize: 14, fontWeight: 600, color: DS.c.navy, marginBottom: 16 }}>Verlauf</div>
        <TLStep label="Fall angelegt"         time="17.04.2026"  done />
        <TLStep label="Erstanruf Claimondo"   time="läuft…"      active />
        <TLStep label="Schadensaufnahme"                          future />
        <TLStep label="Werkstatt-Termin"                          future />
        <TLStep label="Regulierung"                               future last />
      </Card>
      <Card style={{ padding: '14px 16px' }}>
        <div style={{ fontFamily: DS.f.sans, fontSize: 13, fontWeight: 600, color: DS.c.navy, marginBottom: 10 }}>Ansprechpartner Claimondo</div>
        <div style={{ fontFamily: DS.f.sans, fontSize: 14, fontWeight: 600, color: DS.c.navy }}>Jana Söder</div>
        <div style={{ fontFamily: DS.f.sans, fontSize: 12, color: DS.c.muted, marginBottom: 10 }}>Schadensbetreuung</div>
        <Btn label="0221 9988 7766" variant="outline" size="sm" icon={<Ic.Phone s={13} c={DS.c.navy}/>} />
      </Card>
    </div>
  </PMLayout>
);

/* ─── Export ──────────────────────────────────────────────── */
Object.assign(window, {
  PLogin, PMagicSent, POB1, POB2, POB3,
  PSchnellanlage, PDashboard, PEmptyDash, PCaseDetail,
  PMSchnellanlage, PMDashboard, PMCaseDetail,
});
