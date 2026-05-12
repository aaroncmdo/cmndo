// hifi-shared.jsx — Claimondo Design System tokens + shared components
// Exports everything to window for use in other Babel scripts

const { useState } = React;

/* ─── Design System Tokens ──────────────────────────────────── */
const DS = {
  c: {
    navy:    '#0D1B3E',
    shield:  '#1E3A5F',
    ondo:    '#4573A2',
    lb:      '#7BA3CC',
    bg:      '#f8f9fb',
    card:    '#ffffff',
    border:  '#e4e7ef',
    dest:    '#c0392b',
    muted:   '#6b7280',
    muted2:  '#9ca3af',
  },
  sh: {
    sm: '0 1px 2px rgba(13,27,62,.04), 0 1px 3px rgba(13,27,62,.06)',
    md: '0 4px 6px -1px rgba(13,27,62,.06), 0 2px 4px -2px rgba(13,27,62,.04)',
    lg: '0 10px 25px -5px rgba(13,27,62,.1), 0 8px 10px -6px rgba(13,27,62,.06)',
  },
  f: {
    sans: "'Montserrat', system-ui, sans-serif",
    mono: "'JetBrains Mono', ui-monospace, monospace",
  },
  r: { sm: '7px', md: '10px', lg: '12px', xl: '17px', '2xl': '22px' },
};

/* ─── Icons ─────────────────────────────────────────────────── */
const Ic = {
  Grid: ({s=16,c='currentColor'}) => <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1.5"/><rect x="9" y="1.5" width="5.5" height="5.5" rx="1.5"/><rect x="1.5" y="9" width="5.5" height="5.5" rx="1.5"/><rect x="9" y="9" width="5.5" height="5.5" rx="1.5"/></svg>,
  Folder: ({s=16,c='currentColor'}) => <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M1.5 5C1.5 4.2 2.2 3.5 3 3.5H6.2L7.5 5H13C13.8 5 14.5 5.7 14.5 6.5V12C14.5 12.8 13.8 13.5 13 13.5H3C2.2 13.5 1.5 12.8 1.5 12V5Z"/></svg>,
  Euro: ({s=16,c='currentColor'}) => <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke={c} strokeWidth="1.6" strokeLinecap="round"><circle cx="8.5" cy="8" r="6"/><path d="M11 5.5C10.3 4.9 9.5 4.5 8.5 4.5C6.8 4.5 5.5 6 5.5 8C5.5 10 6.8 11.5 8.5 11.5C9.5 11.5 10.3 11.1 11 10.5"/><path d="M4.5 7h5M4.5 9h5"/></svg>,
  Share: ({s=16,c='currentColor'}) => <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="13" cy="3.5" r="1.5"/><circle cx="13" cy="12.5" r="1.5"/><circle cx="3" cy="8" r="1.5"/><path d="M4.4 7.2L11.6 4.3M4.4 8.8L11.6 11.7"/></svg>,
  Settings: ({s=16,c='currentColor'}) => <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke={c} strokeWidth="1.6" strokeLinecap="round"><circle cx="8" cy="8" r="2.5"/><path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.6 3.6l1.1 1.1M11.3 11.3l1.1 1.1M3.6 12.4l1.1-1.1M11.3 4.7l1.1-1.1"/></svg>,
  Mail: ({s=16,c='currentColor'}) => <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="1.5" y="3.5" width="13" height="9" rx="1.5"/><path d="M1.5 5.5l6.5 4L14.5 5.5"/></svg>,
  X: ({s=14,c='currentColor'}) => <svg width={s} height={s} viewBox="0 0 14 14" fill="none" stroke={c} strokeWidth="1.6" strokeLinecap="round"><path d="M2 2L12 12M12 2L2 12"/></svg>,
  Plus: ({s=16,c='currentColor'}) => <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round"><path d="M8 2v12M2 8h12"/></svg>,
  Check: ({s=16,c='currentColor'}) => <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke={c} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 8.5L6.5 12.5L13.5 4"/></svg>,
  ChevronRight: ({s=14,c='currentColor'}) => <svg width={s} height={s} viewBox="0 0 14 14" fill="none" stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 3L9 7L5 11"/></svg>,
  ChevronDown: ({s=14,c='currentColor'}) => <svg width={s} height={s} viewBox="0 0 14 14" fill="none" stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 5L7 9L11 5"/></svg>,
  Bell: ({s=16,c='currentColor'}) => <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M8 2C5.8 2 4 3.8 4 6V9.5L2.5 11.5h11L12 9.5V6C12 3.8 10.2 2 8 2Z"/><path d="M6.5 11.5C6.5 12.3 7.2 13 8 13C8.8 13 9.5 12.3 9.5 11.5"/></svg>,
  Shield: ({s=16,c='currentColor'}) => <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M8 1.5L14 4V9C14 12.2 11.3 14.7 8 15.5C4.7 14.7 2 12.2 2 9V4L8 1.5Z"/><path d="M5.5 8L7 9.5L10.5 6"/></svg>,
  Phone: ({s=16,c='currentColor'}) => <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 2.5C3 2.5 4 1.5 5 1.5L6.5 4L5 5.5C5.8 7 7 8.2 8.5 9L10 7.5L12.5 9C12.5 9 12.5 10.5 11.5 11C8 12.5 2 7 3 2.5Z"/></svg>,
  AlertCircle: ({s=14,c='currentColor'}) => <svg width={s} height={s} viewBox="0 0 14 14" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round"><circle cx="7" cy="7" r="6"/><path d="M7 4.5v3"/><circle cx="7" cy="10" r="0.6" fill={c} stroke="none"/></svg>,
};

/* ─── Logo ──────────────────────────────────────────────────── */
const LogoMark = ({ size = 36 }) => (
  <div style={{
    width: size, height: size,
    background: DS.c.navy,
    borderRadius: Math.round(size * 0.25) + 'px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
    boxShadow: DS.sh.md,
  }}>
    <Ic.Shield s={Math.round(size * 0.56)} c="#fff" />
  </div>
);

const LogoFull = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
    <LogoMark size={34} />
    <span style={{ fontFamily: DS.f.sans, fontSize: 19, fontWeight: 700, letterSpacing: '-0.03em', color: DS.c.navy }}>
      claim<span style={{ color: DS.c.ondo }}>ondo</span>
    </span>
  </div>
);

/* ─── Sidebar ───────────────────────────────────────────────── */
const NAV_ITEMS = [
  { ic: 'Grid',     label: 'Dashboard',          id: 'dashboard'   },
  { ic: 'Folder',   label: 'Fälle',               id: 'faelle'      },
  { ic: 'Euro',     label: 'Provisionen',          id: 'provisionen' },
  { ic: 'Share',    label: 'Empfehlungs-Tools',    id: 'tools'       },
  { ic: 'Settings', label: 'Einstellungen',         id: 'settings'    },
];

const Sidebar = ({ active = 'dashboard' }) => (
  <div style={{
    width: 'var(--sidebar-w, 240px)', height: '100%', background: DS.c.card,
    borderRight: `1px solid ${DS.c.border}`,
    display: 'flex', flexDirection: 'column',
    padding: '24px 12px 16px',
    flexShrink: 0, overflow: 'hidden', transition: 'width .2s',
  }}>
    <div style={{ padding: '0 12px', marginBottom: 30 }}><LogoFull /></div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
      {NAV_ITEMS.map(({ ic, label, id }) => {
        const on = id === active;
        const IcComp = Ic[ic];
        return (
          <div key={id} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '9px 12px', borderRadius: '9px',
            background: on ? DS.c.navy : 'transparent',
            color: on ? '#fff' : '#41495c',
            cursor: 'pointer',
            border: on ? 'none' : 'none',
          }}>
            <IcComp s={16} c={on ? '#fff' : '#41495c'} />
            <span style={{ fontFamily: DS.f.sans, fontSize: 13.5, fontWeight: on ? 600 : 400, letterSpacing: '-0.01em' }}>{label}</span>
          </div>
        );
      })}
    </div>
    <div style={{ borderTop: `1px solid ${DS.c.border}`, paddingTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 12px' }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          background: `linear-gradient(135deg, ${DS.c.ondo}, ${DS.c.navy})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <span style={{ fontFamily: DS.f.sans, fontSize: 11, fontWeight: 600, color: '#fff' }}>MM</span>
        </div>
        <div style={{ overflow: 'hidden' }}>
          <div style={{ fontFamily: DS.f.sans, fontSize: 13, fontWeight: 600, color: DS.c.navy, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Max Mustermann</div>
          <div style={{ fontFamily: DS.f.mono, fontSize: 10, color: DS.c.muted }}>makler@buero.de</div>
        </div>
      </div>
    </div>
  </div>
);

/* ─── Mobile chrome ─────────────────────────────────────────── */
const MobileHeader = () => (
  <div style={{
    height: 52, background: DS.c.card, borderBottom: `1px solid ${DS.c.border}`,
    display: 'flex', alignItems: 'center', padding: '0 16px',
    justifyContent: 'space-between', flexShrink: 0, boxShadow: DS.sh.sm,
  }}>
    <LogoMark size={32} />
    <div style={{ cursor: 'pointer' }}><Ic.Bell s={20} c={DS.c.navy} /></div>
  </div>
);

const BottomNav = ({ active = 'dashboard' }) => (
  <div style={{
    height: 68, background: DS.c.card, borderTop: `1px solid ${DS.c.border}`,
    display: 'flex', alignItems: 'center', justifyContent: 'space-around',
    padding: '0 24px 4px', flexShrink: 0,
    boxShadow: '0 -4px 12px rgba(13,27,62,.06)',
  }}>
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, cursor: 'pointer' }}>
      <Ic.Grid s={22} c={active === 'dashboard' ? DS.c.navy : DS.c.muted} />
      <span style={{ fontFamily: DS.f.sans, fontSize: 10, color: active === 'dashboard' ? DS.c.navy : DS.c.muted, fontWeight: active === 'dashboard' ? 600 : 400 }}>Dashboard</span>
    </div>
    <div style={{
      width: 52, height: 52, borderRadius: '50%', background: DS.c.navy,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: '0 4px 16px rgba(13,27,62,.4)', cursor: 'pointer', marginBottom: 18,
    }}>
      <Ic.Plus s={22} c="#fff" />
    </div>
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, cursor: 'pointer' }}>
      <div style={{ width: 28, height: 28, borderRadius: '50%', background: `linear-gradient(135deg, ${DS.c.ondo}, ${DS.c.navy})`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontFamily: DS.f.sans, fontSize: 10, fontWeight: 600, color: '#fff' }}>MM</span>
      </div>
      <span style={{ fontFamily: DS.f.sans, fontSize: 10, color: DS.c.muted }}>Profil</span>
    </div>
  </div>
);

/* ─── Layouts ───────────────────────────────────────────────── */
const Footer = () => (
  <div style={{ padding: '10px 32px', borderTop: `1px solid ${DS.c.border}`, display: 'flex', gap: 24, background: DS.c.card, flexShrink: 0 }}>
    {['Impressum', 'Datenschutz', 'AGB Maklerbeziehung', 'Provisionsvereinbarung ↓'].map((l, i) => (
      <span key={i} style={{ fontFamily: DS.f.sans, fontSize: 12, color: DS.c.muted, cursor: 'pointer' }}>{l}</span>
    ))}
  </div>
);

const MagicBanner = () => (
  <div style={{
    height: 36, background: '#eef4fb', borderBottom: `1px solid #d5e2ef`,
    display: 'flex', alignItems: 'center', padding: '0 24px', gap: 8, flexShrink: 0,
  }}>
    <Ic.Mail s={13} c={DS.c.ondo} />
    <span style={{ fontFamily: DS.f.sans, fontSize: 13, color: DS.c.shield, flex: 1 }}>Geöffnet aus E-Mail · keine Anmeldung nötig</span>
    <Ic.X s={13} c={DS.c.muted} />
  </div>
);

const DesktopLayout = ({ active, children, banner, noPad }) => (
  <div style={{ display: 'flex', height: '100%', background: DS.c.bg, fontFamily: DS.f.sans, overflow: 'hidden' }}>
    <Sidebar active={active} />
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {banner}
      <div style={{ flex: 1, padding: noPad ? 0 : '40px 56px', overflowY: 'auto' }}>
        {children}
      </div>
      <Footer />
    </div>
  </div>
);

const MobileLayout = ({ active = 'dashboard', children, banner }) => (
  <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: DS.c.bg, fontFamily: DS.f.sans, overflow: 'hidden' }}>
    <div style={{ height: 28, background: DS.c.navy, display: 'flex', alignItems: 'center', padding: '0 16px', justifyContent: 'space-between', flexShrink: 0 }}>
      <span style={{ fontFamily: DS.f.mono, fontSize: 10, color: 'rgba(255,255,255,.8)', fontWeight: 500 }}>9:41</span>
      <span style={{ fontFamily: DS.f.mono, fontSize: 9, color: 'rgba(255,255,255,.5)' }}>●●●</span>
    </div>
    <MobileHeader />
    {banner}
    <div style={{ flex: 1, overflowY: 'auto' }}>{children}</div>
    <BottomNav active={active} />
  </div>
);

/* ─── Buttons ───────────────────────────────────────────────── */
const BTN_VARIANTS = {
  default:     { bg: DS.c.navy,  color: '#fff',       border: DS.c.navy  },
  outline:     { bg: '#fff',     color: DS.c.navy,    border: DS.c.border },
  secondary:   { bg: '#f1f3f7', color: DS.c.navy,    border: 'transparent' },
  ghost:       { bg: 'transparent', color: DS.c.navy, border: 'transparent' },
  destructive: { bg: 'rgba(192,57,43,.08)', color: DS.c.dest, border: 'transparent' },
};

const Btn = ({ label, variant = 'default', size = 'md', full, icon, disabled, loading, onClick, style }) => {
  const H   = { xs: 24, sm: 28, md: 32, lg: 36 };
  const P   = { xs: '0 8px', sm: '0 10px', md: '0 12px', lg: '0 16px' };
  const FS  = { xs: 12, sm: 12.5, md: 14, lg: 15 };
  const v   = BTN_VARIANTS[variant] || BTN_VARIANTS.default;
  return (
    <div onClick={disabled ? undefined : onClick} style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
      height: H[size], padding: P[size],
      background: disabled ? '#f1f3f7' : v.bg,
      color: disabled ? DS.c.muted2 : v.color,
      border: `1px solid ${v.border === 'transparent' ? 'transparent' : v.border}`,
      borderRadius: DS.r.lg,
      fontFamily: DS.f.sans, fontSize: FS[size], fontWeight: 500,
      letterSpacing: '-0.01em',
      cursor: disabled ? 'not-allowed' : 'pointer',
      width: full ? '100%' : 'auto', flexShrink: 0,
      opacity: disabled ? 0.55 : 1,
      ...style,
    }}>
      {loading
        ? <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5" opacity="0.3"/><path d="M7 1.5A5.5 5.5 0 0 1 12.5 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><animateTransform attributeName="transform" type="rotate" from="0 7 7" to="360 7 7" dur="0.8s" repeatCount="indefinite"/></path></svg>
        : icon}
      {label}
    </div>
  );
};

/* ─── Form ──────────────────────────────────────────────────── */
const Field = ({ label, placeholder, value, error, hint, mono, required, style }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, ...style }}>
    <label style={{ fontFamily: DS.f.sans, fontSize: 'var(--body-size, 13px)', fontWeight: 500, color: DS.c.navy }}>
      {label}{required && <span style={{ color: DS.c.dest, marginLeft: 3 }}>*</span>}
    </label>
    <div style={{
      height: 32, padding: '0 10px',
      border: `1px solid ${error ? DS.c.dest : DS.c.border}`,
      background: error ? '#fff8f8' : '#fff',
      borderRadius: DS.r.lg,
      fontFamily: mono ? DS.f.mono : DS.f.sans,
      fontSize: 'var(--body-size, 14px)', letterSpacing: mono ? '0.06em' : 0,
      color: value ? DS.c.navy : DS.c.muted2,
      display: 'flex', alignItems: 'center',
      lineHeight: 'var(--body-lh, 1.6)',
      boxShadow: error ? `0 0 0 3px rgba(192,57,43,.1)` : 'none',
    }}>
      {value || placeholder}
    </div>
    {error && (
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <Ic.AlertCircle s={13} c={DS.c.dest} />
        <span style={{ fontFamily: DS.f.sans, fontSize: 12, color: DS.c.dest }}>{error}</span>
      </div>
    )}
    {hint && !error && <span style={{ fontFamily: DS.f.sans, fontSize: 12, color: DS.c.muted }}>{hint}</span>}
  </div>
);

const CheckRow = ({ label, checked }) => (
  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
    <div style={{
      width: 18, height: 18, borderRadius: 5, flexShrink: 0, marginTop: 1,
      border: `1.5px solid ${checked ? DS.c.navy : DS.c.border}`,
      background: checked ? DS.c.navy : '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {checked && <Ic.Check s={10} c="#fff" />}
    </div>
    <span style={{ fontFamily: DS.f.sans, fontSize: 13.5, color: DS.c.navy, lineHeight: 1.55 }}>{label}</span>
  </div>
);

/* ─── Status ────────────────────────────────────────────────── */
const PILL_STYLES = {
  amber: { bg: '#fffbeb', color: '#b45309', dot: '#f59e0b' },
  blue:  { bg: '#eef4fb', color: '#1E3A5F', dot: '#4573A2' },
  green: { bg: '#ecfdf5', color: '#047857', dot: '#10b981' },
  gray:  { bg: '#f1f3f7', color: '#4b5563', dot: '#9ca3af' },
  red:   { bg: '#fef2f2', color: '#b91c1c', dot: '#ef4444' },
  navy:  { bg: DS.c.navy, color: '#fff',    dot: 'rgba(255,255,255,.6)' },
};

const Pill = ({ label, variant = 'gray' }) => {
  const s = PILL_STYLES[variant] || PILL_STYLES.gray;
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      background: s.bg, color: s.color,
      fontSize: 12, fontWeight: 500, fontFamily: DS.f.sans,
      padding: '4px 10px', borderRadius: 999, lineHeight: 1, height: 22,
      flexShrink: 0,
    }}>
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot, flexShrink: 0 }} />
      {label}
    </div>
  );
};

const STATUS_MAP = {
  'Rückruf läuft':           { pill: 'amber', border: '#f59e0b' },
  'Termin gebucht':           { pill: 'blue',  border: '#4573A2' },
  'Regulierung läuft':        { pill: 'green', border: '#10b981' },
  'In Prüfung':               { pill: 'gray',  border: '#9ca3af' },
  'Mandant nicht erreichbar': { pill: 'red',   border: '#c0392b' },
};

const StatusPill = ({ status }) => {
  const m = STATUS_MAP[status] || { pill: 'gray' };
  return <Pill label={status} variant={m.pill} />;
};

/* ─── KPI Card ──────────────────────────────────────────────── */
const KPI_ACCENTS = { ondo: DS.c.ondo, navy: DS.c.navy, green: '#10b981', amber: '#f59e0b' };

const KPICard = ({ label, value, delta, accent = 'ondo' }) => (
  <div style={{
    flex: 1, background: DS.c.card,
    border: `1px solid ${DS.c.border}`,
    borderRadius: DS.r.xl,
    padding: '18px 18px 18px 22px',
    display: 'flex', flexDirection: 'column', gap: 6,
    position: 'relative', overflow: 'hidden',
    boxShadow: DS.sh.sm,
  }}>
    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: KPI_ACCENTS[accent] || DS.c.ondo }} />
    <div style={{ fontFamily: DS.f.mono, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.12em', color: DS.c.muted2 }}>{label}</div>
    <div style={{ fontFamily: DS.f.sans, fontSize: 36, fontWeight: 700, color: DS.c.navy, letterSpacing: '-0.03em', lineHeight: 1 }}>{value}</div>
    {delta && <div style={{ fontFamily: DS.f.sans, fontSize: 12, color: '#047857' }}>{delta}</div>}
  </div>
);

/* ─── Case / Pipeline row ───────────────────────────────────── */
const CaseRow = ({ name, plate, statusInfo, status, last }) => {
  const m = STATUS_MAP[status] || { border: '#9ca3af' };
  return (
    <div style={{
      padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14,
      borderBottom: last ? 'none' : `1px solid ${DS.c.border}`,
      borderLeft: `4px solid ${m.border}`,
      background: DS.c.card, cursor: 'pointer',
    }}>
      <div style={{ flex: 1.5 }}>
        <div style={{ fontFamily: DS.f.sans, fontSize: 'var(--body-size, 14px)', fontWeight: 600, color: DS.c.navy, lineHeight: 'var(--body-lh, 1.6)' }}>{name}</div>
        <div style={{ fontFamily: DS.f.mono, fontSize: 11, color: DS.c.muted, marginTop: 2, letterSpacing: '0.06em' }}>{plate}</div>
      </div>
      <div style={{ flex: 1.5, fontFamily: DS.f.sans, fontSize: 'var(--body-size, 14px)', color: DS.c.muted, lineHeight: 'var(--body-lh, 1.6)' }}>{statusInfo}</div>
      <StatusPill status={status} />
      <Ic.ChevronRight s={14} c={DS.c.muted2} />
    </div>
  );
};

/* ─── Timeline step ─────────────────────────────────────────── */
const TLStep = ({ label, time, done, active, future, last }) => (
  <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', opacity: future ? 0.45 : 1 }}>
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 20, flexShrink: 0, paddingTop: 2 }}>
      <div style={{
        width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
        background: done ? DS.c.navy : active ? DS.c.ondo : 'transparent',
        border: `2px ${future ? 'dashed' : 'solid'} ${done ? DS.c.navy : active ? DS.c.ondo : DS.c.border}`,
        boxShadow: active ? `0 0 0 4px rgba(69,115,162,.2)` : 'none',
      }} />
      {!last && <div style={{ width: 1.5, height: 30, background: done ? DS.c.navy : DS.c.border, marginTop: 2 }} />}
    </div>
    <div style={{ paddingBottom: last ? 0 : 18 }}>
      <div style={{ fontFamily: DS.f.sans, fontSize: 14, fontWeight: done || active ? 600 : 400, color: active ? DS.c.ondo : DS.c.navy }}>{label}</div>
      {time && <div style={{ fontFamily: DS.f.mono, fontSize: 11, color: DS.c.muted, marginTop: 3, letterSpacing: '0.04em' }}>{time}</div>}
    </div>
  </div>
);

/* ─── Info / Alert ──────────────────────────────────────────── */
const InfoBlock = ({ children, icon }) => (
  <div style={{
    background: '#eef4fb', border: `1px solid #d5e2ef`,
    borderRadius: DS.r.md, padding: '10px 14px',
    display: 'flex', gap: 10, alignItems: 'flex-start', color: DS.c.shield,
  }}>
    <div style={{ flexShrink: 0, marginTop: 1 }}>{icon || <Ic.Shield s={15} c={DS.c.ondo} />}</div>
    <span style={{ fontFamily: DS.f.sans, fontSize: 13.5, lineHeight: 1.55 }}>{children}</span>
  </div>
);

const SuccessAlert = ({ children }) => (
  <div style={{
    background: '#ecfdf5', border: `1px solid #bbf7d0`,
    borderRadius: DS.r.md, padding: '12px 16px',
    display: 'flex', gap: 12, alignItems: 'flex-start',
  }}>
    <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
      <Ic.Check s={11} c="#fff" />
    </div>
    <span style={{ fontFamily: DS.f.sans, fontSize: 13.5, color: '#047857', lineHeight: 1.55 }}>{children}</span>
  </div>
);

/* ─── Skeleton ──────────────────────────────────────────────── */
const Skeleton = ({ w = '100%', h = 16, r = 6 }) => (
  <div style={{
    width: w, height: h, borderRadius: r,
    background: `linear-gradient(90deg, ${DS.c.border} 0%, #edf0f5 50%, ${DS.c.border} 100%)`,
    backgroundSize: '200% 100%',
    animation: 'skeletonPulse 1.4s ease-in-out infinite',
  }} />
);

/* ─── Shield illustration (empty state) ─────────────────────── */
const ShieldIllustration = () => (
  <svg width="72" height="76" viewBox="0 0 72 76" fill="none">
    <path d="M36 4L68 16V38C68 55 55 68 36 72C17 68 4 55 4 38V16L36 4Z" fill={`${DS.c.navy}08`} stroke={DS.c.navy} strokeWidth="1.5"/>
    <path d="M36 12L62 22V38C62 52 50.5 63 36 66.5C21.5 63 10 52 10 38V22L36 12Z" fill={`${DS.c.ondo}0A`} stroke={DS.c.ondo} strokeWidth="1"/>
    <path d="M24 38L30.5 44.5L48 28" stroke={DS.c.ondo} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

/* ─── Onboarding dots ───────────────────────────────────────── */
const OBDots = ({ step }) => (
  <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
    {[1,2,3].map(n => (
      <div key={n} style={{
        height: 8,
        width: n === step ? 24 : 8,
        borderRadius: 4,
        background: n === step ? DS.c.navy : n < step ? DS.c.ondo : DS.c.border,
      }} />
    ))}
  </div>
);

/* ─── Card wrapper ──────────────────────────────────────────── */
const Card = ({ children, style }) => (
  <div style={{
    background: DS.c.card, border: `1px solid ${DS.c.border}`,
    borderRadius: 'var(--card-radius, 17px)', boxShadow: DS.sh.sm,
    ...style,
  }}>
    {children}
  </div>
);

/* ─── Export everything ─────────────────────────────────────── */
Object.assign(window, {
  DS, Ic, LogoMark, LogoFull, Sidebar, MobileHeader, BottomNav,
  MobileLayout, DesktopLayout, Footer, MagicBanner,
  Btn, Field, CheckRow,
  Pill, StatusPill, STATUS_MAP, PILL_STYLES,
  KPICard, CaseRow, TLStep,
  InfoBlock, SuccessAlert, Skeleton,
  ShieldIllustration, OBDots, Card,
});
