import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import './LandingPage.css';

/**
 * YouTube demo video shown inside the #demo-video laptop frame.
 */
const DEMO_YOUTUBE_URL: string | null = 'https://www.youtube.com/watch?v=Vp4OlAywfZM';

const SUPPORT_PHONE_1 = '01098213323';
const SUPPORT_PHONE_2 = '01032778056';

function toYoutubeEmbed(url: string | null): string | null {
  if (!url) return null;
  const match = url.match(/(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{6,})/);
  const id = match ? match[1] : url;
  return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`;
}

export type LandingSectionId = 'features' | 'demo-video' | 'trial' | 'contact';

export default function LandingPage({ initialSection }: { initialSection?: LandingSectionId }) {
  const navigate = useNavigate();
  const { language, setLanguage } = useLanguage();
  const ar = language === 'ar';

  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [tourStep, setTourStep] = useState(0);

  const brandName = 'CCMS';
  const waTrialUrl = (phone: string) =>
    `https://wa.me/2${phone}?text=${encodeURIComponent(
      ar
        ? 'مرحباً فريق CCMS، أرغب في تفعيل النسخة التجريبية المجانية لمدة 3 أيام.'
        : 'Hello CCMS team, I would like to activate the 3-day free trial.'
    )}`;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!initialSection) return;
    const timer = window.setTimeout(() => {
      document.getElementById(initialSection)?.scrollIntoView({ behavior: 'smooth' });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [initialSection]);

  const scrollToSection = (id: LandingSectionId) => {
    setMenuOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  const youtubeEmbed = toYoutubeEmbed(DEMO_YOUTUBE_URL);

  const features = [
    {
      color: 'cyan',
      icon: 'sports_esports',
      title: ar ? 'إدارة الغرف والأجهزة بالثانية' : 'Real-Time Room & Device Control',
      desc: ar
        ? 'افتح وقت فردي أو زوجي (مفتوح أو محدد المدة) مع إمكانية التعليق، الاستئناف، والنقل بين الأجهزة مع حساب كل مرحلة تلقائياً.'
        : 'Run single or multiplayer sessions (open or fixed) with pause/resume, mid-session transfers, and automatic rate calculation.',
      bullets: [
        ar ? 'تعديل الوقت أو السعر بسجل مراجعة كامل' : 'Audited time & rate adjustments',
        ar ? 'تنبيهات عند انتهاء الوقت أو دخول وقت إضافي' : 'Clear end-of-session and overtime alerts',
      ],
    },
    {
      color: 'amber',
      icon: 'local_cafe',
      title: ar ? 'كافيه ونقاط بيع مرتبطة بالجلسة' : 'Integrated Café POS & Stock',
      desc: ar
        ? 'أضف المشروبات والمأكولات على أي غرفة بضغطة زر أو على ترابيزات كافيه مستقلة، مع خصم فوري من المخزون.'
        : 'Attach drinks and snacks to active rooms or standalone café tables with instant inventory deduction.',
      bullets: [
        ar ? 'فاتورة مفصلة لكل غرفة: الوقت + المشاريب' : 'Per-room receipt: time cost + café orders',
        ar ? 'تتبع حركة المخزون وتنبيهات النواقص' : 'Real-time stock logs and low-stock alerts',
      ],
    },
    {
      color: 'green',
      icon: 'receipt_long',
      title: ar ? 'فواتير دقيقة وتقارير أرباح' : 'Accurate Billing & Profit Reports',
      desc: ar
        ? 'اعرف حساب الوقت لوحده والمشاريب لوحدها والخصم ورسوم الخدمة لكل جلسة حتى بعد إغلاق الشيفت.'
        : 'Inspect exact time vs. café breakdowns, discounts, and service fees for any session even after shift closing.',
      bullets: [
        ar ? 'تقارير إيرادات يومية وإغلاق شهري' : 'Daily revenue & monthly closing reports',
        ar ? 'دعم الكاش، الفيزا، التحويل، والمحافظ' : 'Cash, card, bank transfer & wallet support',
      ],
    },
    {
      color: 'purple',
      icon: 'shield_lock',
      title: ar ? 'الورديات والمصروفات ومنع العجز' : 'Shift Handover & Drawer Security',
      desc: ar
        ? 'استلم وسلّم الوردية بأرقام دقيقة، وسجّل مصروفات المحل اليومية عشان تراجع صافي الدرج بدون أي تلاعب.'
        : 'Track staff shift openings, closings, and shop expenses so drawer balances reconcile without blind spots.',
      bullets: [
        ar ? 'مقارنة نقدية الوردية والمبيعات تلقائياً' : 'Automated shift ledger reconciliation',
        ar ? 'سجل تدقيق لكل خصم أو إلغاء طلب' : 'Audit trail for every edit or voided order',
      ],
    },
    {
      color: 'sky',
      icon: 'calendar_month',
      title: ar ? 'الحجوزات ومتابعة الموبايل' : 'Reservations & Mobile Monitoring',
      desc: ar
        ? 'سجّل حجوزات الغرف والأجهزة مع منع تعارض المواعيد، وتابع صالتك والغرف النشطة من موبايلك لحظة بلحظة.'
        : 'Schedule room reservations with overlap protection and monitor active rooms and shifts from any phone.',
      bullets: [
        ar ? 'واجهة موبايل مخصصة لمتابعة الأرباح' : 'Mobile-ready dashboard & session receipts',
        ar ? 'صلاحيات منفصلة للمدير والكاشير' : 'Separate Admin and Staff permissions',
      ],
    },
    {
      color: 'orange',
      icon: 'cloud_sync',
      title: ar ? 'يعمل أوفلاين + مزامنة سحابية' : 'Offline-First + Cloud Sync',
      desc: ar
        ? 'تطبيق ويندوز محلي يشتغل بسرعة وثبات حتى لو الإنترنت فصل، ويرفع البيانات للسحابة تلقائياً أول ما يرجع الاتصال.'
        : 'Local Windows desktop app runs smoothly without internet and syncs automatically to the cloud when online.',
      bullets: [
        ar ? 'قاعدة بيانات محلية سريعة بدون توقف' : 'Zero downtime during internet outages',
        ar ? 'نسخ ومزامنة آمنة لبيانات الفرع' : 'Encrypted branch-isolated cloud sync',
      ],
    },
  ];

  const tourSteps = [
    {
      badge: ar ? 'الخطوة 1 من 3 · متابعة الصالة' : 'Step 1 of 3 · Live Lounge',
      title: ar ? 'كل الغرف والأجهزة في شاشة واحدة' : 'All rooms & devices in one live view',
      body: ar
        ? 'تشغيل جلسات فردي أو زوجي، تعليق مؤقت، أو نقل العميل من غرفة لأخرى مع احتساب كل جزء بدقة.'
        : 'Start single/multi sessions, pause timers, or transfer players between rooms while keeping every segment billed.',
      metrics: [
        { k: 'Room 5', v: ar ? 'نشط · 01:48:00' : 'Active · 01:48:00' },
        { k: 'PS5 - 02', v: ar ? 'محدد · 45 د' : 'Fixed · 45m' },
        { k: 'PC - 01', v: ar ? 'متاح الآن' : 'Available' },
      ],
    },
    {
      badge: ar ? 'الخطوة 2 من 3 · حساب الغرفة' : 'Step 2 of 3 · Per-Room Bill',
      title: ar ? 'حساب الوقت منفصل عن المشاريب' : 'Time cost separated from café orders',
      body: ar
        ? 'اضغط على أي غرفة سواء شغالة أو في السجل بعد قفل الشيفت لعرض تفاصيل الوقت، المشاريب بالكمية، والإجمالي.'
        : 'Click any active or ended room—even after closing the shift—to view time, itemized café orders, and net total.',
      metrics: [
        { k: ar ? 'الوقت' : 'Time', v: '108.00 EGP' },
        { k: ar ? 'المشاريب (2 قهوة + بيبسي)' : 'Café (2 Coffee + Pepsi)', v: '55.00 EGP' },
        { k: ar ? 'الإجمالي' : 'Total', v: '163.00 EGP' },
      ],
    },
    {
      badge: ar ? 'الخطوة 3 من 3 · تسليم الوردية' : 'Step 3 of 3 · Shift Handover',
      title: ar ? 'تقارير الوردية والمصروفات بدون عجز' : 'Shift ledgers & expenses reconciled',
      body: ar
        ? 'جرد كامل لمبيعات الكافيه، إيرادات اللعب، المصروفات، وصافي الدرج مع إمكانية المتابعة من الموبايل.'
        : 'Full breakdown of gaming revenue, café sales, expenses, and net drawer cash accessible from your phone.',
      metrics: [
        { k: ar ? 'إجمالي الوقت' : 'Gaming', v: '2,450 EGP' },
        { k: ar ? 'الكافيه' : 'Café', v: '780 EGP' },
        { k: ar ? 'صافي الدرج' : 'Net Drawer', v: '3,080 EGP' },
      ],
    },
  ];

  return (
    <div
      className={`ccms-landing ${ar ? 'ccms-landing-ar' : 'ccms-landing-en'}`}
      dir={ar ? 'rtl' : 'ltr'}
    >
      {/* 1. NAVBAR */}
      <header className={`lp-navbar ${scrolled ? 'scrolled' : ''}`}>
        <div className="lp-container lp-nav-inner">
          <button
            type="button"
            className="lp-brand"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          >
            <img src="./logo.png" alt={brandName} className="lp-brand-logo" />
            <span className="lp-brand-name">
              {brandName === 'CCMS' ? (
                <>
                  CC<span className="lp-brand-accent">MS</span>
                </>
              ) : (
                brandName
              )}
            </span>
          </button>

          <nav className={`lp-nav-menu ${menuOpen ? 'open' : ''}`} aria-label={ar ? 'التنقل الرئيسي' : 'Primary'}>
            <button type="button" className="lp-nav-link" onClick={() => scrollToSection('features')}>
              {ar ? 'المميزات' : 'Features'}
            </button>
            <button type="button" className="lp-nav-link" onClick={() => scrollToSection('demo-video')}>
              {ar ? 'شرح بالفيديو' : 'Video Demo'}
            </button>
            <button type="button" className="lp-nav-link" onClick={() => scrollToSection('trial')}>
              {ar ? 'النسخة التجريبية' : 'Free Trial'}
            </button>
            <button type="button" className="lp-nav-link" onClick={() => scrollToSection('contact')}>
              {ar ? 'الدعم والمبيعات' : 'Support'}
            </button>
            <button type="button" className="lp-nav-link" onClick={() => navigate('/download')}>
              {ar ? 'تنزيل البرنامج' : 'Download'}
            </button>
          </nav>

          <div className="lp-nav-actions">
            <button
              type="button"
              className="lp-lang-btn"
              onClick={() => setLanguage(ar ? 'en' : 'ar')}
            >
              {ar ? 'EN' : 'عربي'}
            </button>
            <button
              type="button"
              className="lp-login-btn"
              onClick={() => navigate('/login')}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>login</span>
              <span>{ar ? 'تسجيل الدخول' : 'Sign In'}</span>
            </button>
            <button
              type="button"
              className="lp-nav-toggle"
              aria-label={ar ? 'القائمة' : 'Menu'}
              onClick={() => setMenuOpen((o) => !o)}
            >
              <span className="material-symbols-outlined">{menuOpen ? 'close' : 'menu'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* 2. HERO SECTION */}
      <section className="lp-hero">
        <div className="lp-hero-glow-a" />
        <div className="lp-hero-glow-b" />

        <div className="lp-container lp-hero-grid">
          <div className="lp-hero-content">
            <div className="lp-trial-pill">
              <span className="lp-pulse-dot" />
              <span>{ar ? 'نسخة تجريبية مجانية 3 أيام · ديسكتوب + متابعة سحابية' : '3-Day Free Trial · Desktop + Cloud Sync'}</span>
            </div>

            <h1 className="lp-hero-title">
              {ar ? (
                <>
                  سيستم متكامل <br />
                  <span className="lp-hl-cyan">لإدارة صالات الألعاب</span> و{' '}
                  <span className="lp-hl-green">الكافيه</span>
                </>
              ) : (
                <>
                  Complete System for <br />
                  <span className="lp-hl-cyan">Gaming Lounges</span> &amp;{' '}
                  <span className="lp-hl-green">Cafés</span>
                </>
              )}
            </h1>

            <p className="lp-hero-desc">
              {ar
                ? 'برنامج ديسكتوب يعمل محلياً على جهاز الكاشير بثبات تام حتى بدون إنترنت، مع مزامنة سحابية لحظية لمتابعة الغرف، فواتير الوقت والمشاريب، والورديات من موبايلك في أي وقت.'
                : 'Fast offline-first Windows desktop software for your counter with instant cloud sync so you can monitor live rooms, itemized bills, café sales, and shifts from your phone.'}
            </p>

            <div className="lp-hero-ctas">
              <a href={waTrialUrl(SUPPORT_PHONE_2)} target="_blank" rel="noreferrer" className="lp-btn-primary">
                <WhatsAppIcon />
                <span>{ar ? 'اطلب النسخة التجريبية (3 أيام مجاناً)' : 'Request 3-Day Free Trial'}</span>
              </a>

              <button type="button" className="lp-btn-secondary" onClick={() => scrollToSection('demo-video')}>
                <span className="material-symbols-outlined" style={{ fontSize: '20px', color: 'var(--lp-cyan)' }}>
                  play_circle
                </span>
                <span>{ar ? 'شاهد فيديو الشرح' : 'Watch Video Demo'}</span>
              </button>
            </div>

            <div className="lp-hero-contact">
              <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--lp-cyan)' }}>call</span>
              <span>
                {ar ? 'تواصل مباشرة: ' : 'Call directly: '}
                <a href={`tel:${SUPPORT_PHONE_1}`} className="lp-phone-link lp-mono" dir="ltr">
                  {SUPPORT_PHONE_1}
                </a>
              </span>
              <span>·</span>
              <button type="button" className="lp-download-link" onClick={() => navigate('/download')}>
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>download</span>
                <span>{ar ? 'تحميل نسخة الويندوز' : 'Download Windows App'}</span>
              </button>
            </div>
          </div>

          {/* Real CCMS Dashboard Screenshot Preview */}
          <div>
            <div className="lp-mockup-window">
              <div className="lp-mockup-bar">
                <div className="lp-dots">
                  <span className="lp-dot r" />
                  <span className="lp-dot y" />
                  <span className="lp-dot g" />
                </div>
                <div className="lp-mockup-title lp-mono">
                  <span className="material-symbols-outlined" style={{ fontSize: '15px', color: 'var(--lp-cyan)' }}>
                    desktop_windows
                  </span>
                  <span>CCMS Desktop · Live Dashboard</span>
                </div>
              </div>

              <div className="lp-mockup-shot-wrap">
                <img
                  src="./assets/ccms-dashboard-preview.png"
                  alt={ar ? 'لقطة حقيقية من واجهة نظام CCMS لإدارة الصالات والكافيه' : 'Live screenshot of the CCMS gaming lounge & café management dashboard'}
                  className="lp-mockup-shot"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. HIGHLIGHTS BAR */}
      <section className="lp-highlights">
        <div className="lp-container lp-highlights-grid">
          <div className="lp-hl-item">
            <div className="lp-hl-icon cyan">
              <span className="material-symbols-outlined">devices</span>
            </div>
            <div>
              <div className="lp-hl-title">{ar ? 'ديسكتوب + ويب + موبايل' : 'Desktop + Web + Mobile'}</div>
              <div className="lp-hl-sub">{ar ? 'شغّل الكاشير محلياً وتابع من أي مكان' : 'Operate locally & monitor anywhere'}</div>
            </div>
          </div>
          <div className="lp-hl-item">
            <div className="lp-hl-icon amber">
              <span className="material-symbols-outlined">bolt</span>
            </div>
            <div>
              <div className="lp-hl-title">{ar ? 'يعمل بدون إنترنت' : 'Offline-First Speed'}</div>
              <div className="lp-hl-sub">{ar ? 'ثبات تام وسرعة استجابة لحظية' : 'Zero lag even when internet drops'}</div>
            </div>
          </div>
          <div className="lp-hl-item">
            <div className="lp-hl-icon green">
              <span className="material-symbols-outlined">verified_user</span>
            </div>
            <div>
              <div className="lp-hl-title">{ar ? 'حماية 100% للوردية' : '100% Shift Accountability'}</div>
              <div className="lp-hl-sub">{ar ? 'فصل الوقت والمشاريب وسجل تدقيق كامل' : 'Audited edits, voids & shift drawers'}</div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. FEATURES SECTION */}
      <section id="features" className="lp-features">
        <div className="lp-container">
          <div className="lp-section-head">
            <h2 className="lp-section-title">
              {ar
                ? 'كل الأدوات التي تحتاجها لإدارة صالتك باحترافية'
                : 'Everything You Need to Run Your Lounge Smoothly'}
            </h2>
            <p className="lp-section-sub">
              {ar
                ? 'صممنا نظام CCMS ليجمع بين سرعة تطبيق سطح المكتب ودقة المتابعة السحابية في واجهة واضحة وسهلة.'
                : 'CCMS pairs a reliable Windows counter terminal with real-time cloud dashboards built for lounge owners.'}
            </p>
          </div>

          <div className="lp-features-grid">
            {features.map((f) => (
              <article key={f.title} className={`lp-feature-card ${f.color}`}>
                <div className="lp-f-icon">
                  <span className="material-symbols-outlined" style={{ fontSize: '26px' }}>{f.icon}</span>
                </div>
                <h3 className="lp-f-title">{f.title}</h3>
                <p className="lp-f-desc">{f.desc}</p>
                <div className="lp-f-bullets">
                  {f.bullets.map((b) => (
                    <span key={b} className="lp-f-bullet">
                      <span className="material-symbols-outlined" style={{ fontSize: '17px' }}>check_circle</span>
                      <span>{b}</span>
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* 5. VIDEO DEMO SECTION (#demo-video) */}
      <section id="demo-video" className="lp-video-section">
        <div className="lp-container lp-video-grid">
          <div className="lp-video-info">
            <h2 className="lp-video-title">
              {ar ? 'شاهد نظام CCMS عملياً في دقيقتين' : 'See CCMS in Action'}
            </h2>
            <p className="lp-video-desc">
              {ar
                ? 'تعرّف بسرعة على واجهة الديسكتوب والموبايل: كيف تفتح جلسة، تضيف مشاريب الغرفة، تعرض حساب كل روم بالتفصيل، وتقفل الوردية بدون عجز.'
                : 'Walk through the desktop & mobile workflow: start sessions, add room café items, inspect itemized room bills, and close shifts cleanly.'}
            </p>
            <div className="lp-video-list">
              <div className="lp-v-item">
                <span className="material-symbols-outlined" style={{ color: 'var(--lp-green)' }}>check_circle</span>
                <span>{ar ? 'فتح ونقل الجلسات وعرض فاتورة الغرفة كاملة.' : 'Start/transfer sessions & view per-room receipts.'}</span>
              </div>
              <div className="lp-v-item">
                <span className="material-symbols-outlined" style={{ color: 'var(--lp-green)' }}>check_circle</span>
                <span>{ar ? 'إضافة مشاريب الكافيه للجلسة أو الترابيزة مع خصم المخزون.' : 'Add café orders to rooms or tables with auto stock update.'}</span>
              </div>
              <div className="lp-v-item">
                <span className="material-symbols-outlined" style={{ color: 'var(--lp-green)' }}>check_circle</span>
                <span>{ar ? 'تسليم الوردية ومراجعة السجل من الموبايل بعد الإغلاق.' : 'Hand over shifts & inspect ended bills from mobile.'}</span>
              </div>
            </div>
          </div>

          <div className="lp-macbook">
            <div className="lp-screen-frame">
              <div className="lp-video-box">
                {!videoPlaying ? (
                  <>
                    <img
                      src="./assets/ps5_card_bg.jpg"
                      alt={ar ? 'معاينة نظام CCMS' : 'CCMS Preview'}
                      className="lp-video-poster-bg"
                    />
                    <div className="lp-video-overlay">
                      <button
                        type="button"
                        className="lp-play-btn"
                        aria-label={ar ? 'تشغيل العرض' : 'Play demo'}
                        onClick={() => {
                          setTourStep(0);
                          setVideoPlaying(true);
                        }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '36px' }}>play_arrow</span>
                      </button>
                      <span className="lp-play-label">
                        {ar
                          ? (youtubeEmbed ? 'شاهد فيديو الشرح الكامل' : 'شاهد جولة تفاعلية سريعة للنظام')
                          : (youtubeEmbed ? 'Watch Full Video Walkthrough' : 'Start Interactive System Tour')}
                      </span>
                    </div>
                  </>
                ) : youtubeEmbed ? (
                  <iframe
                    src={youtubeEmbed}
                    title="CCMS Video Demo"
                    style={{ width: '100%', height: '100%', border: 0 }}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                ) : (
                  <div className="lp-tour-stage">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--lp-cyan)' }}>
                        {tourSteps[tourStep].badge}
                      </span>
                      <button
                        type="button"
                        onClick={() => setVideoPlaying(false)}
                        style={{
                          background: 'rgba(255,255,255,0.08)',
                          border: 'none',
                          color: 'var(--lp-text-soft)',
                          borderRadius: '6px',
                          padding: '3px 8px',
                          fontSize: '0.72rem',
                          cursor: 'pointer',
                        }}
                      >
                        {ar ? 'إغلاق' : 'Close'}
                      </button>
                    </div>

                    <div>
                      <div style={{ fontSize: '1.05rem', fontWeight: 800, marginBottom: '6px' }}>
                        {tourSteps[tourStep].title}
                      </div>
                      <p style={{ fontSize: '0.8rem', color: 'var(--lp-text-soft)', lineHeight: 1.55 }}>
                        {tourSteps[tourStep].body}
                      </p>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '8px' }}>
                      {tourSteps[tourStep].metrics.map((m) => (
                        <div
                          key={m.k}
                          style={{
                            padding: '8px',
                            borderRadius: '8px',
                            background: 'var(--lp-surface)',
                            border: '1px solid rgba(0, 194, 255, 0.2)',
                          }}
                        >
                          <div style={{ fontSize: '0.68rem', color: 'var(--lp-text-muted)' }}>{m.k}</div>
                          <div className="lp-mono" style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--lp-green)' }}>
                            {m.v}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <button
                        type="button"
                        disabled={tourStep === 0}
                        onClick={() => setTourStep((s) => Math.max(0, s - 1))}
                        style={{
                          padding: '5px 12px',
                          borderRadius: '7px',
                          border: '1px solid var(--lp-border)',
                          background: 'transparent',
                          color: tourStep === 0 ? 'var(--lp-text-muted)' : 'var(--lp-text)',
                          fontSize: '0.75rem',
                          cursor: tourStep === 0 ? 'default' : 'pointer',
                        }}
                      >
                        {ar ? 'السابق' : 'Prev'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setTourStep((s) => (s + 1) % tourSteps.length)}
                        style={{
                          padding: '5px 14px',
                          borderRadius: '7px',
                          border: 'none',
                          background: 'var(--lp-cyan)',
                          color: '#07080d',
                          fontWeight: 800,
                          fontSize: '0.75rem',
                          cursor: 'pointer',
                        }}
                      >
                        {tourStep === tourSteps.length - 1 ? (ar ? 'إعادة الجولة' : 'Restart') : (ar ? 'التالي' : 'Next')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="lp-keyboard-base" />
          </div>
        </div>
      </section>

      {/* 6. TRIAL PROMO BANNER */}
      <section id="trial" className="lp-trial-section">
        <div className="lp-container">
          <div className="lp-trial-card">
            <div>
              <span className="lp-promo-tag">{ar ? 'ابدأ تجربتك الآن' : 'Get Started Now'}</span>
              <h2 className="lp-promo-title">
                {ar ? 'تفعيل مجاني فوري لمدة 3 أيام' : 'Instant 3-Day Free Full Trial'}
              </h2>
              <p className="lp-promo-desc">
                {ar
                  ? 'نزّل برنامج الديسكتوب أو افتح لوحة الويب وجرّب كل المميزات بكامل الصلاحيات لمدة 3 أيام بدون أي التزام مالي.'
                  : 'Download the Windows desktop installer or sign in on the web and test every feature with full permissions for 3 days.'}
              </p>

              <div className="lp-promo-checks">
                <span>
                  <span className="material-symbols-outlined" style={{ color: 'var(--lp-amber)', fontSize: '18px' }}>star</span>
                  {ar ? 'كامل المميزات بدون قيود' : 'All features unlocked'}
                </span>
                <span>
                  <span className="material-symbols-outlined" style={{ color: 'var(--lp-amber)', fontSize: '18px' }}>star</span>
                  {ar ? 'دعم فني وتجهيز مجاني' : 'Free setup & support'}
                </span>
                <span>
                  <span className="material-symbols-outlined" style={{ color: 'var(--lp-amber)', fontSize: '18px' }}>star</span>
                  {ar ? 'تشغيل سريع في دقائق' : 'Ready in minutes'}
                </span>
              </div>

              <div className="lp-promo-ctas">
                <a href={waTrialUrl(SUPPORT_PHONE_1)} target="_blank" rel="noreferrer" className="lp-btn-primary">
                  <WhatsAppIcon />
                  <span>{ar ? 'اطلب التفعيل عبر واتساب' : 'Activate via WhatsApp'}</span>
                </a>
                <button type="button" className="lp-btn-secondary" onClick={() => navigate('/download')}>
                  <span className="material-symbols-outlined" style={{ fontSize: '19px', color: 'var(--lp-cyan)' }}>download</span>
                  <span>{ar ? 'تنزيل نسخة الويندوز' : 'Download Desktop'}</span>
                </button>
              </div>
            </div>

            <div>
              <div className="lp-days-badge">
                <span className="lp-days-num lp-mono">3</span>
                <span className="lp-days-txt">{ar ? 'أيام مجانية' : 'Free Days'}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 7. CONTACT SECTION */}
      <section id="contact" className="lp-contact">
        <div className="lp-container">
          <div className="lp-section-head">
            <h2 className="lp-section-title">
              {ar ? 'تواصل معنا لتفعيل السيستم أو الدعم الفني' : 'Contact Us for Trial Activation or Support'}
            </h2>
            <p className="lp-section-sub">
              {ar
                ? 'فريق الدعم الفني جاهز لمساعدتك في التثبيت، ربط الأجهزة، وتفعيل النسخة التجريبية.'
                : 'Our team is available on WhatsApp to help with installation, setup, and trial activation.'}
            </p>
          </div>

          <div className="lp-contact-grid">
            <div className="lp-contact-card">
              <div className="lp-contact-icon green">
                <WhatsAppIcon size={26} />
              </div>
              <h3 className="lp-f-title">{ar ? 'واتساب — المبيعات والتفعيل' : 'WhatsApp — Line 1'}</h3>
              <p className="lp-f-desc" style={{ margin: 0 }}>
                {ar ? 'لطلب النسخة التجريبية لمدة 3 أيام أو الاستفسار عن الباقات.' : 'Request your 3-day free trial or pricing details.'}
              </p>
              <span className="lp-mono" dir="ltr" style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--lp-text)' }}>
                {SUPPORT_PHONE_1}
              </span>
              <a href={waTrialUrl(SUPPORT_PHONE_1)} target="_blank" rel="noreferrer" className="lp-btn-primary" style={{ width: '100%' }}>
                <WhatsAppIcon />
                <span>{ar ? 'مراسلة واتساب' : 'Chat on WhatsApp'}</span>
              </a>
            </div>

            <div className="lp-contact-card">
              <div className="lp-contact-icon cyan">
                <span className="material-symbols-outlined" style={{ fontSize: '28px' }}>support_agent</span>
              </div>
              <h3 className="lp-f-title">{ar ? 'واتساب — الدعم الفني' : 'WhatsApp — Line 2'}</h3>
              <p className="lp-f-desc" style={{ margin: 0 }}>
                {ar ? 'للمساعدة المباشرة في تشغيل السيستم على الويندوز أو الموبايل.' : 'Direct technical assistance for Windows & mobile setup.'}
              </p>
              <span className="lp-mono" dir="ltr" style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--lp-text)' }}>
                {SUPPORT_PHONE_2}
              </span>
              <a
                href={waTrialUrl(SUPPORT_PHONE_2)}
                target="_blank"
                rel="noreferrer"
                className="lp-btn-secondary"
                style={{ width: '100%', borderColor: 'rgba(0, 194, 255, 0.35)', color: 'var(--lp-cyan)' }}
              >
                <WhatsAppIcon />
                <span>{ar ? 'التواصل مع الدعم' : 'Contact Support'}</span>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* 8. FOOTER */}
      <footer className="lp-footer">
        <div className="lp-container">
          <div className="lp-footer-grid">
            <div>
              <div className="lp-brand" style={{ marginBottom: '14px' }}>
                <img src="./logo.png" alt={brandName} className="lp-brand-logo" />
                <span className="lp-brand-name">
                  CC<span className="lp-brand-accent">MS</span>
                </span>
              </div>
              <p style={{ fontSize: '0.88rem', color: 'var(--lp-text-muted)', lineHeight: 1.7, maxWidth: '42ch' }}>
                {ar
                  ? 'نظام متكامل لإدارة صالات البلايستيشن، الغرف، وأجهزة الكافيه محلياً وسحابياً بدقة كاملة للوقت والمبيعات والورديات.'
                  : 'Complete local-first & cloud-synced management system for PlayStation lounges, gaming rooms, and cafés.'}
              </p>
            </div>

            <div>
              <h4 className="lp-footer-title">{ar ? 'روابط سريعة' : 'Quick Links'}</h4>
              <div className="lp-footer-links">
                <button type="button" onClick={() => scrollToSection('features')}>{ar ? 'المميزات' : 'Features'}</button>
                <button type="button" onClick={() => scrollToSection('demo-video')}>{ar ? 'شرح بالفيديو' : 'Video Demo'}</button>
                <button type="button" onClick={() => scrollToSection('trial')}>{ar ? 'النسخة التجريبية' : 'Free Trial'}</button>
                <button type="button" onClick={() => navigate('/download')}>{ar ? 'تنزيل البرنامج' : 'Download'}</button>
                <button type="button" onClick={() => navigate('/login')}>{ar ? 'لوحة التحكم' : 'Dashboard Login'}</button>
              </div>
            </div>

            <div>
              <h4 className="lp-footer-title">{ar ? 'تواصل معنا' : 'Contact'}</h4>
              <div className="lp-footer-links">
                <a href={waTrialUrl(SUPPORT_PHONE_1)} target="_blank" rel="noreferrer" dir="ltr">
                  WhatsApp: {SUPPORT_PHONE_1}
                </a>
                <a href={waTrialUrl(SUPPORT_PHONE_2)} target="_blank" rel="noreferrer" dir="ltr">
                  Support: {SUPPORT_PHONE_2}
                </a>
                <span>{ar ? 'تطبيق Windows + لوحة ويب سحابية' : 'Windows Desktop + Cloud Web App'}</span>
              </div>
            </div>
          </div>

          <div className="lp-footer-bottom">
            © 2026 {brandName} — {ar ? 'جميع الحقوق محفوظة' : 'All rights reserved'}.
          </div>
        </div>
      </footer>
    </div>
  );
}

function WhatsAppIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12.03 2C6.5 2 2 6.5 2 12.03c0 1.97.57 3.88 1.65 5.52L2.57 21.5l4.06-1.06a9.98 9.98 0 005.4 1.58h.01c5.52 0 10.02-4.5 10.03-10.02C22.07 6.5 17.56 2 12.03 2zm5.84 14.23c-.25.7-1.45 1.34-2.01 1.42-.52.08-1.18.11-1.91-.12-.44-.14-1-.33-1.72-.64-3.03-1.31-5.01-4.37-5.16-4.57-.15-.2-1.23-1.64-1.23-3.13 0-1.49.78-2.22 1.06-2.52.28-.3.61-.38.81-.38.2 0 .41 0 .59.01.19.01.44-.07.69.53.25.6.86 2.09.94 2.24.08.15.13.33.03.53-.1.2-.15.33-.3.51-.15.18-.32.4-.45.54-.15.15-.31.31-.13.61.18.3.78 1.29 1.68 2.09 1.15 1.03 2.13 1.35 2.43 1.5.3.15.48.13.66-.08.18-.2.76-.88.96-1.18.2-.3.4-.25.67-.15.27.1 1.74.82 2.04.97.3.15.5.22.57.35.08.13.08.73-.17 1.43z" />
    </svg>
  );
}
