import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowUpLeft, CheckCircle2, CircleHelp, Cloud, Code2, FileCheck2, FileKey2, FileText, Fingerprint, Globe2, History, KeyRound, LockKeyhole, RefreshCw, Save, Shield, ShieldCheck, Upload, XCircle } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { getInvoices, getPhase1InvoiceQr, getZatcaConfig, saveZatcaConfig, type SavedInvoice, type ZatcaPublicConfig } from '../../app/api';
import type { AppLanguage } from '../../app/types';
import './zatca-simulation.css';

type Tab = 'overview' | 'documents' | 'logs';
type SimulationReport = { outcome: 'ready' | 'incomplete' | 'blocked'; demoData: boolean; steps: { label: string; status: 'passed' | 'notice' | 'blocked'; detail: string }[] };
type CertificateSimulation = { csrRef: string; requestId: string; otp: string; status: 'otp_pending' | 'completed' };

export default function ZatcaPage({ lang, demoMode }: { lang: AppLanguage; demoMode: boolean }) {
  const isAr = lang === 'ar';
  const t = (ar: string, en: string) => isAr ? ar : en;
  const [tab, setTab] = useState<Tab>('overview');
  const [environment, setEnvironment] = useState<'sandbox' | 'production'>('sandbox');
  const [companyName, setCompanyName] = useState('');
  const [vatNumber, setVatNumber] = useState('');
  const [egsUnit, setEgsUnit] = useState('');
  const [apiCredential, setApiCredential] = useState('');
  const [certificatePath, setCertificatePath] = useState('');
  const [privateKeyPath, setPrivateKeyPath] = useState('');
  const [config, setConfig] = useState<ZatcaPublicConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [simulation, setSimulation] = useState<SimulationReport | null>(null);
  const [certificateSimulation, setCertificateSimulation] = useState<CertificateSimulation | null>(null);
  const [otpInput, setOtpInput] = useState('');
  const [certificateSimulationMessage, setCertificateSimulationMessage] = useState<{ kind: 'success' | 'warning' | 'error'; text: string } | null>(null);
  const [message, setMessage] = useState<{ kind: 'success' | 'warning' | 'error'; text: string } | null>(null);

  useEffect(() => {
    let active = true;
    getZatcaConfig(environment).then((current) => {
      if (!active) return;
      setConfig(current); setCompanyName(current.company_name);
      setVatNumber(current.vat_number); setEgsUnit(current.egs_unit);
      setCertificatePath(current.certificate_path); setPrivateKeyPath(current.private_key_path);
    }).catch(() => { if (active) setConfig(null); });
    return () => { active = false; };
  }, [environment]);

  const save = async () => {
    setMessage(null); setBusy(true);
    try {
      const updated = await saveZatcaConfig({
        environment, company_name: companyName, vat_number: vatNumber, egs_unit: egsUnit,
        certificate_path: certificatePath, private_key_path: privateKeyPath,
        api_credential: apiCredential || undefined,
      });
      setConfig(updated); setApiCredential('');
      setMessage({ kind: 'success', text: t('حُفظت بيانات المنشأة محليًا. لم يتم إجراء اتصال رسمي بزاتكا.','Company details saved locally. No official ZATCA connection was made.') });
    } catch (error) {
      const detail = error instanceof Error ? error.message : '';
      setMessage({ kind: 'error', text: detail || t('تعذر الحفظ. شغّل خدمة API المحلية وتأكد من توفر مخزن أسرار نظام التشغيل.','Could not save. Start the local API and ensure the OS key store is available.') });
    } finally { setBusy(false); }
  };

  const validate = () => {
    setLoading(true); setMessage(null);
    window.setTimeout(() => {
      setLoading(false);
      if (!companyName.trim() || !vatNumber.trim() || !egsUnit.trim()) {
        setMessage({ kind: 'warning', text: t('أكمل اسم المنشأة والرقم الضريبي ووحدة EGS للتحقق المحلي من الإعدادات. لم يتم الاتصال بزاتكا.','Enter the company name, VAT number and EGS unit for local configuration validation. No ZATCA request was made.') });
      } else {
        setMessage({ kind: 'warning', text: t('اكتمل فحص الحقول محليًا فقط. لم يُنفذ اختبار اتصال رسمي لأن محول ZATCA المعتمد والاعتمادات الرسمية غير مهيأة.','Local fields checked only. No official connection test ran because the documented ZATCA adapter and taxpayer credentials are not configured.') });
      }
    }, 450);
  };

  const simulateConnection = () => {
    setMessage(null);
    setSimulation(null);
    setSimulating(true);
    window.setTimeout(() => {
      const enteredProfile = Boolean(companyName.trim() && vatNumber.trim() && egsUnit.trim());
      const useSampleProfile = demoMode && !enteredProfile;
      const profileReady = enteredProfile || demoMode;
      const outcome: SimulationReport['outcome'] = environment !== 'sandbox' ? 'blocked' : profileReady ? 'ready' : 'incomplete';
      setSimulation({
        outcome,
        demoData: useSampleProfile,
        steps: [
          { label: t('بيئة الاختبار','Sandbox environment'), status: environment === 'sandbox' ? 'passed' : 'blocked', detail: environment === 'sandbox' ? t('المحاكاة مسموحة في بيئة الاختبار فقط.','Simulation is available in test mode only.') : t('تم إيقاف المحاكاة؛ الإنتاج يظل مقفلًا.','Simulation stopped; production remains locked.') },
          { label: t('بيانات المنشأة المطلوبة','Required business fields'), status: profileReady ? 'passed' : 'notice', detail: useSampleProfile ? t('استُخدمت بيانات نموذجية مؤقتة لهذه المحاكاة فقط.','Temporary sample data was used for this simulation only.') : profileReady ? t('الاسم والرقم الضريبي ووحدة EGS موجودة في النموذج.','Company name, VAT number and EGS unit are present in the form.') : t('أدخل الاسم والرقم الضريبي ووحدة EGS لتجربة إعداد مكتمل.','Enter the company name, VAT number and EGS unit to simulate a complete setup.') },
          { label: t('استجابة محاكي SHOPNEX','SHOPNEX mock response'), status: environment === 'sandbox' ? 'passed' : 'notice', detail: environment === 'sandbox' ? t('استجابة افتراضية ناجحة — لا تُرسل بيانات خارج التطبيق.','Mock response succeeded — no data leaves the app.') : t('لم يعمل المحاكي لأن بيئة الإنتاج مقفلة.','The mock did not run because production is locked.') },
          { label: t('الاتصال بالهيئة','Authority connection'), status: 'notice', detail: t('لم يحدث اتصال بزاتكا ولم تُرسل فاتورة أو بيانات اعتماد.','No ZATCA connection was made and no invoice or credential was sent.') },
        ],
      });
      setSimulating(false);
    }, 650);
  };

  const startCertificateSimulation = () => {
    setCertificateSimulationMessage(null);
    if (environment !== 'sandbox') {
      setCertificateSimulationMessage({ kind: 'warning', text: t('المحاكاة متاحة في Sandbox فقط؛ الإنتاج مقفل.','Simulation is available in Sandbox only; production is locked.') });
      return;
    }
    if (!companyName.trim() || !vatNumber.trim() || !egsUnit.trim()) {
      setCertificateSimulationMessage({ kind: 'warning', text: t('اكتب اسمًا ورقمًا ضريبيًا ووحدة EGS تجريبية أولًا.','Enter test values for the company name, VAT number and EGS unit first.') });
      return;
    }
    const csrRef = `SIM-CSR-${Date.now().toString(36).toUpperCase()}`;
    const requestId = `SIM-REQ-${Date.now().toString(36).toUpperCase()}`;
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    setCertificateSimulation({ csrRef, requestId, otp, status: 'otp_pending' });
    setOtpInput('');
    setCertificateSimulationMessage({ kind: 'success', text: t('تم إنشاء طلب شهادة محاكاة. استخدم رمز المحاكاة الظاهر أدناه؛ لم يُرسل شيء إلى زاتكا.','Mock certificate request created. Use the simulation code shown below; nothing was sent to ZATCA.') });
  };

  const confirmCertificateSimulation = () => {
    setCertificateSimulationMessage(null);
    if (!certificateSimulation || certificateSimulation.status !== 'otp_pending') return;
    if (!/^\d{6}$/.test(otpInput.trim())) {
      setCertificateSimulationMessage({ kind: 'warning', text: t('أدخل رمز المحاكاة المكوّن من 6 أرقام.','Enter the six-digit simulation code.') });
      return;
    }
    if (otpInput.trim() !== certificateSimulation.otp) {
      setCertificateSimulationMessage({ kind: 'error', text: t('الرمز غير مطابق. استخدم رمز المحاكاة الظاهر في البطاقة.','Code does not match. Use the simulation code shown in the card.') });
      return;
    }
    setCertificateSimulation({ ...certificateSimulation, status: 'completed' });
    setCertificateSimulationMessage({ kind: 'success', text: t('نجح تأكيد الرمز داخل المحاكاة فقط. لم تُنشأ شهادة أو مفاتيح حقيقية.','Code confirmed in the simulation only. No real certificate or keys were created.') });
  };

  return <section className="zatca-page">
    <div className="page-heading-row zatca-heading"><div><div className="eyebrow"><span className="eyebrow-star">✦</span>{t('الامتثال والتكاملات','COMPLIANCE & INTEGRATIONS')}</div><h1>{t('زاتكا والفوترة الإلكترونية','ZATCA & e-invoicing')}<span className="heading-period">.</span></h1><p>{t('إدارة إعداد المنشأة ودورة الفواتير الإلكترونية من مكان واحد.','Configure your business and manage the e-invoice lifecycle in one place.')}</p></div><div className="heading-actions"><a className="button button-ghost" href="https://zatca.gov.sa/en/E-Invoicing/SystemsDevelopers/Pages/default.aspx" target="_blank" rel="noreferrer"><Globe2 size={15}/>{t('بوابة المطورين الرسمية','Official developer portal')}<ArrowUpLeft size={13}/></a></div></div>
    <div className="compliance-disclaimer"><ShieldCheck size={16}/><span>{t('مصمم لدعم متطلبات الفوترة الإلكترونية ذات الصلة. هذه النسخة غير متصلة بزاتكا ولا تدّعي الاعتماد الرسمي.','Designed to support applicable e-invoicing requirements. This build is not connected to ZATCA and does not claim official approval.')}</span><a href="https://zatca.gov.sa/en/E-Invoicing/Introduction/Guidelines/Documents/DEVELOPER-PORTAL-MANUAL.pdf" target="_blank" rel="noreferrer">{t('اقرأ دليل المطور','Read developer guide')} <ArrowUpLeft size={12}/></a></div>
    {demoMode && <div className="inline-alert warning"><span><ShieldCheck size={17}/></span>{t('هذه معاينة عامة: يمكنك كتابة بيانات اختبارية مؤقتة لتجربة المحاكاة فقط. لا تدخل بيانات حقيقية أو اعتمادًا سريًا؛ لن تُحفظ الإعدادات والاتصال الخارجي معطل.','Public preview: you can enter temporary test values for the simulation only. Do not enter real business details or secrets; settings are not saved and external connections are disabled.')}</div>}
    <div className="zatca-status-row">
      <div className="zatca-status-main glass-card"><span className="large-status-icon"><Cloud size={21}/></span><div className="status-main-copy"><span className="eyebrow">{t('حالة الاتصال','CONNECTION STATUS')}</span><h2>{config?.configured ? t('الإعدادات محفوظة محليًا','Configuration saved locally') : t('غير موصول','Not connected')}</h2><p>{config?.configured ? t('لم يجرِ اختبار اتصال رسمي بعد','Official connection has not been tested') : t('لم تتم إضافة بيانات المنشأة بعد','Company credentials have not been added')}</p></div><span className={`status-chip ${config?.configured ? 'amber' : 'slate'}`}><i/>{config?.configured ? t('إعداد محفوظ','SAVED · NOT CONNECTED') : t('إعداد مطلوب','SETUP REQUIRED')}</span></div>
      <div className="environment-switch glass-card"><span className="eyebrow">{t('البيئة النشطة','ACTIVE ENVIRONMENT')}</span><div className="segmented-control"><button className={environment === 'sandbox' ? 'selected' : ''} onClick={() => setEnvironment('sandbox')}><Code2 size={14}/>{t('اختبار','Sandbox')}</button><button className={environment === 'production' ? 'selected production-selected' : ''} onClick={() => setEnvironment('production')}><Shield size={14}/>{t('إنتاج','Production')}</button></div><small>{environment === 'production' ? t('الإنتاج مقفل حتى إتمام التحقق الرسمي.','Production stays locked until official verification.') : t('ابدأ في بيئة الاختبار الرسمية.','Start with the official test environment.')}</small></div>
    </div>
    {message && <div className={`inline-alert ${message.kind}`}><span>{message.kind === 'success' ? <CheckCircle2 size={17}/> : <AlertTriangle size={17}/>}</span>{message.text}<button className="icon-button" aria-label="dismiss" onClick={() => setMessage(null)}><XCircle size={16}/></button></div>}
    <div className="zatca-tabs" role="tablist"><button className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}><SettingsIcon/>{t('الإعدادات','Configuration')}</button><button className={tab === 'documents' ? 'active' : ''} onClick={() => setTab('documents')}><FileText size={16}/>{t('الفواتير والوثائق','Invoices & documents')}<span className="tab-count">3</span></button><button className={tab === 'logs' ? 'active' : ''} onClick={() => setTab('logs')}><History size={16}/>{t('سجل النشاط','Activity log')}</button></div>
    {tab === 'overview' && <div className="zatca-content-grid">
      <article className="panel config-panel"><div className="panel-heading"><div><span className="eyebrow">01 — {t('ملف المنشأة','BUSINESS PROFILE')}</span><h2>{t('بيانات المنشأة','Company details')}</h2><p>{demoMode ? t('القيم مؤقتة في جلسة المتصفح وتُستخدم للمحاكاة فقط؛ لن تُحفظ.','Values are temporary in this browser session and used for simulation only; they are not saved.') : t('تُحفظ هذه البيانات محليًا في قاعدة SHOPNEX.','These details are stored locally in SHOPNEX.')}</p></div><span className="panel-step">1 / 3</span></div>
        <div className="form-grid"><label className="form-field span-two"><span>{t('اسم المنشأة كما هو مسجل','Registered company name')} <em>*</em></span><input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder={t('مثال: شركة مدار للتجارة','e.g. Orbit Trading Co.')}/></label><label className="form-field"><span>{t('رقم التسجيل الضريبي (VAT)','VAT registration number')} <em>*</em><Help/></span><input value={vatNumber} onChange={(e) => setVatNumber(e.target.value)} inputMode="numeric" placeholder="3XXXXXXXXXXXXXX" dir="ltr"/></label><label className="form-field"><span>{t('وحدة الحل التقني (EGS)','Electronic generation solution (EGS)')} <em>*</em><Help/></span><input value={egsUnit} onChange={(e) => setEgsUnit(e.target.value)} placeholder={t('حسب الإعداد الرسمي','As provisioned by ZATCA')} dir="ltr"/></label></div>
        <div className="form-divider"/><div className="panel-heading credentials-heading"><div><span className="eyebrow">02 — {t('بيانات الربط الآمن','SECURE CREDENTIALS')}</span><h2>{t('بيانات الاعتماد والشهادة','Credentials & certificate')}</h2><p>{t('أدخل القيم التي صدرت لمنشأتك فقط. لا تضعها في محادثة أو ملف عام.','Enter only credentials issued for your business. Never put them in chat or public files.')}</p></div><LockKeyhole size={18}/></div>
        <div className="secure-field"><label className="form-field"><span>{t('مفتاح / اعتماد التكامل','API key / integration credential')}<Help/></span><div className="secure-input"><KeyRound size={15}/><input disabled={demoMode} type="password" autoComplete="new-password" value={apiCredential} onChange={(e) => setApiCredential(e.target.value)} placeholder={config?.secret_present ? t('مُخزّن بأمان — اتركه فارغًا للإبقاء عليه','Saved securely — leave blank to keep') : t('أدخل الاعتماد إذا كان مطلوبًا لمسار منشأتك','Enter if required for your onboarding flow')} dir="ltr"/><span className="secure-mark">••••••</span></div><small>{t('لن يُعاد المفتاح للواجهة بعد حفظه. يُخزّن في مخزن أسرار نظام التشغيل عند توافره.','The credential is never returned to the UI. Stored in the operating system key store when available.')}</small></label></div>
        <div className="form-grid path-grid"><label className="form-field"><span>{t('مسار شهادة الحل (اختياري)','Solution certificate path (optional)')}</span><div className="path-input"><FileKey2 size={15}/><input disabled={demoMode} value={certificatePath} onChange={(e) => setCertificatePath(e.target.value)} placeholder="/path/to/certificate.pem" dir="ltr"/><Upload size={14}/></div><small>{t('احتفظ بالشهادة في مجلد محلي محدود الصلاحية.','Keep the certificate in a restricted local folder.')}</small></label><label className="form-field"><span>{t('مسار المفتاح الخاص (اختياري)','Private key path (optional)')}<LockKeyhole size={13}/></span><div className="path-input"><Fingerprint size={15}/><input disabled={demoMode} value={privateKeyPath} onChange={(e) => setPrivateKeyPath(e.target.value)} placeholder="/secure/path/private-key.pem" dir="ltr"/><Upload size={14}/></div><small>{t('لا يُرفع المفتاح الخاص ولا يُعرض في الواجهة.','The private key is not uploaded or displayed in the UI.')}</small></label></div>
        <div className="secure-note"><ShieldCheck size={17}/><p><b>{t('تخزين آمن، لا أسرار في المتصفح','Secure storage — no browser secrets')}</b><span>{t('لا يتم الحفظ في LocalStorage أو ملفات الواجهة. يتطلب حفظ الاعتماد توفر خدمة أسرار نظام التشغيل.','Credentials are not stored in LocalStorage or frontend files. Saving requires the operating system key store.')}</span></p></div>
        <div className="form-actions"><button className="button button-primary" onClick={save} disabled={busy || demoMode}><Save size={15}/>{busy ? t('جارٍ الحفظ…','Saving…') : t('حفظ الإعدادات محليًا','Save local settings')}</button><button className="button button-outline" onClick={validate} disabled={loading}>{loading ? <RefreshCw className="spin" size={15}/> : <CheckCircle2 size={15}/ >}{t('تحقق من الحقول','Validate fields')}</button><button className="button button-outline" onClick={simulateConnection} disabled={simulating}>{simulating ? <RefreshCw className="spin" size={15}/> : <Code2 size={15}/ >}{simulating ? t('جارٍ تشغيل المحاكاة…','Running simulation…') : t('محاكاة الربط','Simulate connection')}</button></div>
        {simulation && <div className={`zatca-simulation-result simulation-${simulation.outcome}`} role="status" aria-live="polite"><div className="simulation-heading"><div><span className="eyebrow">{t('اختبار محلي فقط','LOCAL SIMULATION ONLY')}</span><h3>{simulation.outcome === 'ready' ? t('المحاكاة جاهزة','Simulation passed') : simulation.outcome === 'blocked' ? t('تم إيقاف المحاكاة','Simulation blocked') : t('المحاكاة اكتملت بإعداد ناقص','Simulation completed with missing fields')}</h3></div><span className="simulation-badge">{simulation.demoData ? t('بيانات نموذجية','SAMPLE DATA') : t('محاكي محلي','LOCAL MOCK')}</span></div><ul>{simulation.steps.map((step) => <li className={`simulation-step simulation-step-${step.status}`} key={step.label}><span className="simulation-step-mark">{step.status === 'passed' ? '✓' : step.status === 'blocked' ? '×' : '!'}</span><span><b>{step.label}</b><small>{step.detail}</small></span></li>)}</ul></div>}
        <section className="zatca-onboarding-simulator" aria-labelledby="zatca-simulator-title"><div className="simulation-heading"><div><span className="eyebrow">{t('تدفق Sandbox تجريبي','SANDBOX ONBOARDING MOCK')}</span><h3 id="zatca-simulator-title">{t('محاكاة طلب الشهادة وتأكيد الرمز','Simulate certificate request & OTP')}</h3></div><span className="simulation-badge">{t('محاكاة فقط','MOCK ONLY')}</span></div><p className="simulator-explainer">{t('جرّب تجهيز مرجع CSR ورقم الطلب ورمز التأكيد داخل SHOPNEX. هذه مراجع وهمية فقط؛ لا يتم توليد CSR تشفيري أو شهادة أو مفاتيح حقيقية، ولا يحدث اتصال خارجي.','Try the CSR reference, request ID and confirmation-code flow inside SHOPNEX. These are mock references only; no cryptographic CSR, real certificate or keys are generated, and no external connection is made.')}</p><div className="mock-workflow-steps"><div className="mock-workflow-step"><span>1</span><div><b>{t('بيانات الاختبار','Test profile')}</b><small>{companyName.trim() && vatNumber.trim() && egsUnit.trim() ? t('الحقول الأساسية مكتملة','Required fields are present') : t('أكمل الاسم والرقم الضريبي ووحدة EGS','Enter name, VAT number and EGS unit')}</small></div></div><div className="mock-workflow-step"><span>2</span><div><b>{t('مرجع CSR تجريبي','Mock CSR reference')}</b><small>{certificateSimulation?.csrRef ?? t('يظهر عند بدء المحاكاة','Created when simulation starts')}</small></div></div><div className="mock-workflow-step"><span>3</span><div><b>{t('طلب الشهادة','Certificate request')}</b><small>{certificateSimulation ? `${t('رقم الطلب','Request ID')}: ${certificateSimulation.requestId}` : t('ينشأ رقم طلب تجريبي فقط','Creates a mock request ID only')}</small></div></div><div className="mock-workflow-step"><span>4</span><div><b>{t('تأكيد الرمز','Confirm code')}</b><small>{certificateSimulation?.status === 'completed' ? t('اكتمل داخل المحاكاة','Completed in mock') : certificateSimulation ? t('بانتظار إدخال رمز المحاكاة','Waiting for mock code') : t('يظهر بعد إنشاء الطلب التجريبي','Available after starting a mock request')}</small></div></div></div><div className="simulator-actions"><button className="button button-outline" onClick={startCertificateSimulation}>{certificateSimulation ? t('إعادة بدء المحاكاة','Restart simulation') : t('بدء طلب شهادة تجريبي','Start mock certificate request')}</button>{certificateSimulation?.status === 'otp_pending' && <div className="mock-otp-card"><label className="form-field"><span>{t('رمز OTP التجريبي','Mock OTP')}</span><input value={otpInput} onChange={(event) => setOtpInput(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" maxLength={6} placeholder="000000" dir="ltr"/></label><span className="mock-otp-value" dir="ltr">{certificateSimulation.otp}</span><button className="button button-primary" onClick={confirmCertificateSimulation}><CheckCircle2 size={14}/>{t('تأكيد الرمز التجريبي','Confirm mock code')}</button></div>}</div>{certificateSimulationMessage && <div className={`inline-alert ${certificateSimulationMessage.kind}`} role="status"><span>{certificateSimulationMessage.kind === 'success' ? <CheckCircle2 size={16}/> : <AlertTriangle size={16}/>}</span>{certificateSimulationMessage.text}</div>}{certificateSimulation?.status === 'completed' && <div className="mock-complete-note"><ShieldCheck size={15}/>{t('نتيجة المحاكاة فقط — لا توجد شهادة أو مفاتيح أو اعتماد صالح للاستخدام.','Mock result only — no usable certificate, keys or credentials exist.')}</div>}</section>
      </article>
      <aside className="zatca-side-column"><article className="panel workflow-panel"><div className="panel-heading"><div><span className="eyebrow">{t('مسار الإعداد','ONBOARDING FLOW')}</span><h2>{t('خطوات الربط','Integration steps')}</h2></div><CircleHelp size={16}/></div><div className="workflow-list"><WorkflowStep n="01" title={t('بيانات المنشأة','Company details')} detail={t('أدخل الرقم الضريبي ووحدة EGS','Enter VAT number and EGS')} active/><WorkflowStep n="02" title={t('شهادة الربط الرسمية','Official onboarding certificate')} detail={t('حسب خطوات حسابك في فاتورة','Follow your Fatoora portal flow')}/><WorkflowStep n="03" title={t('تحقق Sandbox','Sandbox validation')} detail={t('تحقق بالـSDK الرسمي قبل الإنتاج','Validate with the official SDK')}/><WorkflowStep n="04" title={t('تفعيل الإنتاج','Enable production')} detail={t('بعد استكمال متطلبات الجهة','After authority requirements are met')}/></div><a className="official-link" href="https://zatca.gov.sa/en/E-Invoicing/SystemsDevelopers/ComplianceEnablementToolbox/Pages/DownloadSDK.aspx" target="_blank" rel="noreferrer"><Code2 size={14}/>{t('تنزيل أدوات التحقق الرسمية','Get official validation tools')}<ArrowUpLeft size={13}/></a></article>
        <article className="panel quick-stats-panel"><div className="panel-heading"><div><span className="eyebrow">{t('حالة المستندات','DOCUMENT STATUS')}</span><h2>{t('ملخص الإرسال','Submission summary')}</h2></div><FileCheck2 size={17}/></div><div className="status-stat-list"><StatusStat label={t('بانتظار التحقق','Awaiting validation')} count="—" kind="amber"/><StatusStat label={t('مقبولة / مسجلة','Accepted / reported')} count="—" kind="green"/><StatusStat label={t('مرفوضة / بها خطأ','Rejected / with errors')} count="—" kind="red"/></div><p className="stat-footnote">{t('لا توجد وثائق حقيقية مرسلة من هذا الإصدار.','No real documents have been submitted by this build.')}</p></article>
      </aside>
    </div>}
    {tab === 'documents' && <div className="finance-alert warning"><AlertTriangle size={16}/><span>{t('رفع الفاتورة إلى الهيئة غير متاح في هذا الإصدار. يلزم محول Phase 2 والتحقق بحساب المكلف في Sandbox قبل التفعيل.','Invoice submission to the authority is not available in this build. Phase 2 adapter and taxpayer-account Sandbox validation are required before enabling it.')}</span><button className="button button-outline compact" disabled title={t('يتطلب تهيئة زاتكا الرسمية','Requires official ZATCA onboarding')}><Upload size={13}/>{t('رفع إلى زاتكا (غير مفعّل)','Submit to ZATCA (disabled)')}</button></div>}
    {tab === 'documents' && <DocumentsTab lang={lang} demoMode={demoMode}/>}
    {tab === 'logs' && <LogsTab lang={lang}/>}
  </section>;
}

function WorkflowStep({ n, title, detail, active }: { n: string; title: string; detail: string; active?: boolean }) { return <div className={`workflow-step ${active ? 'workflow-active' : ''}`}><span className="step-number">{active ? <span className="step-pulse"/> : n}</span><div><b>{title}</b><small>{detail}</small></div>{active && <span className="step-current">الآن</span>}</div>; }
function StatusStat({ label, count, kind }: { label: string; count: string; kind: string }) { return <div className="status-stat"><span className={`stat-led ${kind}`}/><span>{label}</span><b>{count}</b></div>; }
function Help() { return <span className="help-tip" title="راجع مستندات زاتكا الرسمية"><CircleHelp size={13}/></span>; }
function SettingsIcon() { return <ShieldCheck size={16}/>; }

function DocumentsTab({ lang, demoMode }: { lang: AppLanguage; demoMode: boolean }) {
  const ar = lang === 'ar';
  const t = (a: string, e: string) => ar ? a : e;
  const [invoices, setInvoices] = useState<SavedInvoice[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [qr, setQr] = useState<{ qr_base64: string; tags: { tag: number; length: number; value: string }[]; disclaimer: string } | null>(null);
  const [loading, setLoading] = useState(!demoMode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const selectedInvoice = invoices.find((invoice) => invoice.id === selectedId);

  useEffect(() => {
    let active = true;
    if (demoMode) { setInvoices([]); setSelectedId(''); setLoading(false); return () => { active = false; }; }
    setLoading(true); setError('');
    getInvoices().then((rows) => { if (active) { setInvoices(rows); setSelectedId(rows[0]?.id ?? ''); } })
      .catch((e: unknown) => { if (active) setError(e instanceof Error ? e.message : t('تعذر تحميل سجل الفواتير.','Could not load invoice register.')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [demoMode]);

  const generateQr = async () => {
    if (!selectedInvoice) return;
    setBusy(true); setError(''); setQr(null);
    try {
      if (demoMode) {
        const values = [
          [1, 'متجر العرض التجريبي'], [2, '310000000000003'], [3, selectedInvoice.created_at],
          [4, selectedInvoice.total], [5, selectedInvoice.vat_total],
        ] as [number, string][];
        const bytes: number[] = [];
        const tags = values.map(([tag, value]) => {
          const encoded = new TextEncoder().encode(value);
          bytes.push(tag, encoded.length, ...encoded);
          return { tag, length: encoded.length, value };
        });
        const binary = bytes.map((byte) => String.fromCharCode(byte)).join('');
        setQr({ qr_base64: btoa(binary), tags, disclaimer: t('QR توضيحي محلي من خمسة وسوم بصيغة المرحلة الأولى فقط؛ ليس اعتماد زاتكا ولا Phase 2.','Illustrative local five-tag Phase 1-format QR only; not ZATCA approval or Phase 2.') });
      } else {
        const result = await getPhase1InvoiceQr(selectedInvoice.id);
        setQr(result);
      }
    } catch (e) { setError(e instanceof Error ? e.message : t('تعذر توليد معاينة QR.','Could not generate QR preview.')); }
    finally { setBusy(false); }
  };

  return <div className="zatca-documents-grid"><article className="panel document-list-panel"><div className="panel-heading"><div><span className="eyebrow">{t('سجل المبيعات المحلي','LOCAL SALES REGISTER')}</span><h2>{t('فواتير البيع','Sales invoices')}</h2><p>{t('يعرض الفواتير المحفوظة محليًا. حالة الدفع لا تعني الإرسال إلى زاتكا.','Lists locally saved invoices. Payment status is not a ZATCA submission status.')}</p></div><FileText size={18}/></div><div className="invoice-table-wrap"><table className="data-table zatca-doc-table"><thead><tr><th>{t('رقم الفاتورة','Invoice')}</th><th>{t('التاريخ','Date')}</th><th>{t('الحالة المحلية','Local status')}</th><th>{t('الإجمالي','Total')}</th><th/></tr></thead><tbody>{invoices.map((invoice) => <tr key={invoice.id} className={selectedId === invoice.id ? 'selected-row' : ''}><td><b className="mono-cell">{invoice.invoice_number}</b></td><td className="muted-cell">{new Date(invoice.created_at).toLocaleDateString(ar ? 'ar-SA' : 'en-GB')}</td><td><span className="status-chip slate"><i/>{invoice.status}</span></td><td>{invoice.total} {t('ر.س','SAR')}</td><td><button className="button button-outline compact" onClick={() => { setSelectedId(invoice.id); setQr(null); }}>{t('اختيار','Select')}</button></td></tr>)}</tbody></table>{loading && <div className="module-empty">{t('جارٍ تحميل الفواتير…','Loading invoices…')}</div>}{!loading && !invoices.length && <div className="module-empty">{t('لا توجد فواتير بيع بعد. احفظ فاتورة من شاشة الكاشير أولًا.','No sales invoices yet. Save one from the cashier first.')}</div>}</div>{error && <div className="finance-alert error"><AlertTriangle size={15}/><span>{error}</span></div>}</article>
    <article className="panel qr-preview-panel"><div className="panel-heading"><div><span className="eyebrow">{t('توليد محلي · ٥ وسوم TLV','LOCAL GENERATION · 5 TLV TAGS')}</span><h2>{t('معاينة QR للفواتير','Invoice QR preview')}</h2></div><Shield size={18}/></div><p className="qr-phase-note">{t('ينشئ الخادم ترميز TLV/Base64 للوسوم 1–5 فقط بعد ضبط الاسم النظامي ورقم VAT في إعدادات زاتكا.','The server builds TLV/Base64 tags 1–5 after configuring the legal seller name and VAT number in ZATCA settings.')}</p><button className="button button-primary" disabled={!selectedInvoice || busy || loading} onClick={() => void generateQr()}>{busy ? <RefreshCw className="spin" size={14}/> : <FileCheck2 size={14}/ >}{busy ? t('جارٍ التوليد…','Generating…') : t('إنشاء معاينة QR','Generate QR preview')}</button>{qr && <><div className="qr-render"><QRCodeSVG value={qr.qr_base64} size={184} bgColor="#ffffff" fgColor="#102b2a" level="M" includeMargin/></div><code className="qr-payload">{qr.qr_base64}</code><div className="invoice-table-wrap qr-tags-wrap"><table className="data-table finance-table"><thead><tr><th>TLV</th><th>{t('الطول (بايت UTF-8)','Length (UTF-8 bytes)')}</th><th>{t('القيمة','Value')}</th></tr></thead><tbody>{qr.tags.map((tag) => <tr key={tag.tag}><td>{tag.tag}</td><td>{tag.length}</td><td className="qr-tag-value">{tag.value}</td></tr>)}</tbody></table></div><div className="finance-alert warning qr-disclaimer"><AlertTriangle size={16}/><span>{qr.disclaimer} {t('لا يوجد اتصال أو إرسال إلى الجهة.','No authority connection or submission occurred.')}</span></div></>}{!qr && <div className="qr-empty"><FileCheck2 size={23}/><span>{selectedInvoice ? t(`الفاتورة المحددة: ${selectedInvoice.invoice_number}` ,`Selected invoice: ${selectedInvoice.invoice_number}`) : t('اختر فاتورة لإنشاء QR.','Select an invoice to build a QR.')}</span></div>}<div className="finance-alert info"><ShieldCheck size={15}/><span>{t('مرحلة 2 تتطلب بيانات تشفير حقيقية وتوقيع/تجزئة وتدفق اعتماد/إبلاغ. لا نضع وسومًا تشفيرية وهمية ولا ندّعي الامتثال.','Phase 2 requires real cryptographic data, signatures/hashes and clearance/reporting flows. We do not add fake cryptographic tags or claim compliance.')}</span></div></article></div>;
}
function LogsTab({ lang }: { lang: AppLanguage }) {
  const ar = lang === 'ar';
  return <article className="panel logs-panel"><div className="panel-heading"><div><span className="eyebrow">{ar ? 'سجل تدقيق محلي' : 'LOCAL AUDIT TRAIL'}</span><h2>{ar ? 'أحداث تكامل زاتكا' : 'ZATCA integration events'}</h2><p>{ar ? 'لا توجد أحداث ربط حقيقية بعد.' : 'No real integration events yet.'}</p></div><History size={19}/></div><div className="empty-state"><div className="empty-state-icon"><History size={23}/></div><b>{ar ? 'السجل في انتظار أول إعداد' : 'Waiting for first configuration'}</b><span>{ar ? 'سيظهر هنا التحقق من الإعدادات ومحاولات الإرسال والاستجابات مع إخفاء البيانات الحساسة.' : 'Configuration checks, submission attempts and responses will appear here with sensitive values redacted.'}</span></div></article>;
}
