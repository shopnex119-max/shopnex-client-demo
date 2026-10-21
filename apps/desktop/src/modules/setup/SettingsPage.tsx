import { useEffect, useState, type FormEvent } from 'react';
import {
  AlertTriangle, ArrowUpLeft, CheckCircle2, CreditCard, Database, Globe2, HardDrive, KeyRound, Languages,
  LockKeyhole, MonitorCog, Moon, RotateCcw, ShieldCheck, Wifi, WifiOff, X,
} from 'lucide-react';
import { getHealth, resetOperationalData, type OperationalResetResult } from '../../app/api';
import { resetPreviewData } from '../../app/browserDemoApi';
import './settings-integrations.css';
import './settings-reset.css';
import type { AppLanguage } from '../../app/types';
import { loadPaymentMethods, savePaymentMethods, type PaymentMethod } from '../../app/paymentMethods';

export default function SettingsPage({
  lang, demoMode, canReset, onNavigateToZatca,
}: {
  lang: AppLanguage;
  demoMode: boolean;
  canReset: boolean;
  onNavigateToZatca: () => void;
}) {
  const ar = lang === 'ar';
  const [health, setHealth] = useState<{ status: string; database: string; integration_mode: string } | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetPassword, setResetPassword] = useState('');
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState('');
  const [resetResult, setResetResult] = useState<OperationalResetResult | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>(loadPaymentMethods);
  const [newPaymentAr, setNewPaymentAr] = useState('');
  const [newPaymentEn, setNewPaymentEn] = useState('');
  const [newPaymentCode, setNewPaymentCode] = useState('');
  const [newPaymentKind, setNewPaymentKind] = useState<PaymentMethod['kind']>('electronic');
  const t = (a: string, e: string) => ar ? a : e;
  useEffect(() => { getHealth().then(setHealth).catch(() => setHealth(null)); }, []);
  const addPaymentMethod = (event: FormEvent) => {
    event.preventDefault();
    const labelAr = newPaymentAr.trim(); const labelEn = newPaymentEn.trim(); const code = newPaymentCode.trim().toLowerCase();
    if (!labelAr || !labelEn || !/^custom_[a-z0-9_]{1,100}$/.test(code) || paymentMethods.some((method) => method.code === code)) return;
    const next = [...paymentMethods, { code, labelAr, labelEn, kind: newPaymentKind }];
    setPaymentMethods(next); savePaymentMethods(next); setNewPaymentAr(''); setNewPaymentEn(''); setNewPaymentCode('');
  };
  const removePaymentMethod = (code: string) => {
    const next = paymentMethods.filter((method) => method.code !== code);
    setPaymentMethods(next); savePaymentMethods(next);
  };

  const closeReset = () => {
    if (resetBusy) return;
    setResetOpen(false);
    setResetPassword('');
    setResetError('');
    setResetResult(null);
  };

  const submitReset = async (event: FormEvent) => {
    event.preventDefault();
    if ((!demoMode && !canReset) || resetBusy) return;
    setResetBusy(true);
    setResetError('');
    try {
      const result = demoMode ? resetPreviewData() : await resetOperationalData(resetPassword);
      setResetResult(result);
      setResetPassword('');
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      setResetError(message.includes('Invalid account password')
        ? t('كلمة مرور الحساب غير صحيحة.', 'The account password is incorrect.')
        : message || t('تعذر تصفير البيانات.', 'Could not reset the data.'));
    } finally {
      setResetBusy(false);
    }
  };

  return <section className="settings-page">
    <div className="page-heading-row"><div><div className="eyebrow"><span className="eyebrow-star">✦</span>{t('مركز الإدارة', 'ADMINISTRATION')}</div><h1>{t('إعدادات النظام', 'System settings')}<span className="heading-period">.</span></h1><p>{t('تحكم في بيئة العمل المحلية والتكاملات الخارجية.', 'Manage your local workspace and external integrations.')}</p></div></div>
    <div className="settings-grid">
      <article className="panel setting-panel">
        <div className="panel-heading"><div><span className="eyebrow">{t('بيئة التشغيل', 'RUNTIME')}</span><h2>{t('الخدمات المحلية', 'Local services')}</h2></div><MonitorCog size={18}/></div>
        <SettingRow icon={Database} label={t('قاعدة البيانات', 'Database')} value={health?.database ?? t('غير متاحة — شغّل API', 'Unavailable — start API')} ok={health?.database === 'connected'}/>
        <SettingRow icon={Wifi} label={t('واجهة API', 'API service')} value={health?.status === 'ok' ? '127.0.0.1:8000' : t('غير متصلة', 'Disconnected')} ok={health?.status === 'ok'}/>
        <SettingRow icon={Globe2} label={t('وضع التكامل', 'Integration mode')} value={health?.integration_mode ?? 'offline-first'} ok/>
      </article>
      <article className="panel setting-panel">
        <div className="panel-heading"><div><span className="eyebrow">{t('الحماية والخصوصية', 'SECURITY & PRIVACY')}</span><h2>{t('بياناتك على جهازك', 'Your data stays local')}</h2></div><LockKeyhole size={18}/></div>
        <div className="privacy-card"><span className="privacy-icon"><ShieldCheck size={20}/></span><b>{t('لا توجد قاعدة بيانات سحابية', 'No cloud database')}</b><p>{t('يعمل SHOPNEX محليًا. يتصل بالإنترنت فقط عند إعداد تكامل خارجي مثل زاتكا.', 'SHOPNEX operates locally. Internet is used only when configuring an external integration such as ZATCA.')}</p></div>
        <SettingRow icon={HardDrive} label={t('النسخ الاحتياطي', 'Backups')} value={t('إعداد محلي — قيد الإعداد', 'Local setup — in progress')}/>
        <SettingRow icon={LockKeyhole} label={t('خزنة الأسرار', 'Credential vault')} value={t('مخزن نظام التشغيل', 'OS key store')}/>
      </article>
      <article className="panel setting-panel zatca-settings-card">
        <div className="panel-heading"><div><span className="eyebrow">{t('التكاملات الخارجية', 'EXTERNAL INTEGRATIONS')}</span><h2>{t('زاتكا والفوترة الإلكترونية', 'ZATCA e-invoicing')}</h2></div><ShieldCheck size={18}/></div>
        <div className="integration-status-line"><span className="status-chip amber"><i/>{t('غير متصل — إعداد محلي فقط', 'Not connected — local setup only')}</span></div>
        <p>{t('أدر اسم المنشأة والرقم الضريبي وبيانات EGS وبيئة الاختبار/الإنتاج من لوحة زاتكا. إرسال الفواتير للهيئة لا يُفعّل قبل اعتماد إعدادات المكلف والتحقق الرسمي في Sandbox.', 'Manage the legal seller name, VAT number, EGS details and environment in the ZATCA panel. Authority submission stays unavailable until taxpayer onboarding and official Sandbox validation are complete.')}</p>
        <div className="setting-footnote"><LockKeyhole size={14}/>{t('لا تضع أي اعتماد أو مفتاح خاص في موقع المعاينة أو المستودع العام.', 'Never place credentials or private keys in the public preview or repository.')}</div>
        <button className="button button-outline" onClick={onNavigateToZatca}><ShieldCheck size={15}/>{t('فتح إعدادات الربط', 'Open integration settings')}<ArrowUpLeft size={13}/></button>
      </article>
      <article className="panel setting-panel appearance-panel">
        <div className="panel-heading"><div><span className="eyebrow">{t('تفضيلات العرض', 'DISPLAY PREFERENCES')}</span><h2>{t('المظهر واللغة', 'Appearance & language')}</h2></div><MonitorCog size={18}/></div>
        <SettingRow icon={Moon} label={t('المظهر الافتراضي', 'Default theme')} value={t('داكن فضائي', 'Cosmic dark')}/>
        <SettingRow icon={Languages} label={t('اللغة الافتراضية', 'Default language')} value={t('العربية (RTL)', 'Arabic (RTL)')}/>
        <div className="setting-footnote"><WifiOff size={14}/>{t('تفضيلات العرض التفاعلية متاحة من الشريط العلوي.', 'Interactive display preferences are available in the top bar.')}</div>
      </article>
      <article className="panel setting-panel payment-methods-panel">
        <div className="panel-heading"><div><span className="eyebrow">{t('إعدادات البيع', 'SALES SETTINGS')}</span><h2>{t('طرق الدفع', 'Payment methods')}</h2></div><CreditCard size={18}/></div>
        <p className="payment-methods-intro">{t('أضف طرق الدفع التي تستخدمها في منشأتك، وستظهر مباشرة في شاشة الكاشير وعلى الفاتورة المطبوعة.', 'Add the payment methods used by your business. They appear in the cashier and on printed invoices.')}</p>
        <div className="payment-method-list">{paymentMethods.map((method) => <div className="payment-method-item" key={method.code}><span className="payment-method-dot"><CreditCard size={14}/></span><div><b>{ar ? method.labelAr : method.labelEn}</b><small><code>{method.code}</code> · {method.kind === 'cash' ? t('نقدي', 'Cash') : t('إلكتروني', 'Electronic')}</small></div><button type="button" className="icon-button" onClick={() => removePaymentMethod(method.code)} aria-label={t('حذف طريقة الدفع', 'Remove payment method')}><X size={14}/></button></div>)}</div>
        <form className="payment-method-form" onSubmit={addPaymentMethod}>
          <label><span>{t('المعرّف اليدوي', 'Manual ID')}</span><input value={newPaymentCode} onChange={(event) => setNewPaymentCode(event.target.value)} placeholder="custom_tamara" pattern="custom_[a-z0-9_]{1,100}" maxLength={108}/></label>
          <label><span>{t('الاسم بالعربية', 'Arabic name')}</span><input value={newPaymentAr} onChange={(event) => setNewPaymentAr(event.target.value)} placeholder={t('مثال: تمارا', 'Example: Tamara')} maxLength={60}/></label>
          <label><span>{t('الاسم بالإنجليزية', 'English name')}</span><input value={newPaymentEn} onChange={(event) => setNewPaymentEn(event.target.value)} placeholder="Example: Tamara" maxLength={60}/></label>
          <label><span>{t('نوع التسوية', 'Settlement type')}</span><select value={newPaymentKind} onChange={(event) => setNewPaymentKind(event.target.value as PaymentMethod['kind'])}><option value="electronic">{t('إلكتروني', 'Electronic')}</option><option value="cash">{t('نقدي', 'Cash')}</option></select></label>
          <button className="button button-primary" type="submit" disabled={!/^custom_[a-z0-9_]{1,100}$/.test(newPaymentCode.trim().toLowerCase()) || !newPaymentAr.trim() || !newPaymentEn.trim()}>{t('إضافة طريقة', 'Add method')}</button>
        </form>
      </article>
      <article className="panel setting-panel reset-settings-panel">
        <div className="panel-heading"><div><span className="eyebrow">{t('إجراء إداري حساس', 'SENSITIVE ADMIN ACTION')}</span><h2>{t('تصفير بيانات التشغيل', 'Reset operational data')}</h2></div><AlertTriangle size={18}/></div>
        <p>{t('يمسح الفواتير والمبيعات والمشتريات والدفعات والقيود وحركات المخزون والمنتجات والعملاء والموردين. يحتفظ بحسابات المستخدمين وبيانات المنشأة ودليل الحسابات وقواعد الضريبة وإعدادات وسجل زاتكا، ولا يمس سجلات المطاعم والمطبخ والموارد البشرية.', 'Deletes sales/invoices, purchases/payments, journal entries, inventory movements, products, CRM customers and suppliers. Preserves user accounts, company setup, chart of accounts, tax rules and ZATCA settings/history; restaurant, kitchen and HR records are not changed.')}</p>
        <div className="reset-panel-actions">
          <button className="button reset-button" disabled={!canReset} onClick={() => { setResetOpen(true); setResetError(''); setResetResult(null); }}><RotateCcw size={15}/>{t('تصفير بيانات التشغيل', 'Reset operational data')}</button>
          <span className="setting-footnote"><LockKeyhole size={14}/>{demoMode
            ? t('تصفير يدوي لبيانات المعاينة داخل هذا المتصفح فقط، ولا يتصل بأي خادم.', 'Manual reset for this browser preview only; no server or real business data is affected.')
            : canReset
              ? t('يتطلب كلمة مرور حساب المدير، وتأكيدًا قبل التنفيذ.', 'Requires the administrator account password and explicit confirmation.')
              : t('يتاح لمسؤول النظام فقط.', 'Available to system administrators only.')}</span>
        </div>
      </article>
    </div>

    {resetOpen && <div className="reset-dialog-backdrop" dir={ar ? 'rtl' : 'ltr'}>
      <section className="reset-dialog panel" role="dialog" aria-modal="true" aria-labelledby="reset-dialog-title">
        <div className="reset-dialog-heading"><span className="reset-dialog-icon"><AlertTriangle size={20}/></span><div><span className="eyebrow">{t('لا يمكن التراجع عن هذا الإجراء', 'IRREVERSIBLE ACTION')}</span><h2 id="reset-dialog-title">{t('تأكيد تصفير بيانات التشغيل', 'Confirm operational reset')}</h2></div><button className="icon-button" aria-label={t('إغلاق','Close')} onClick={closeReset} disabled={resetBusy}><X size={17}/></button></div>
        {resetResult ? <div className="reset-success" role="status"><CheckCircle2 size={20}/><div><b>{t('تم تصفير بيانات التشغيل.', 'Operational data reset completed.')}</b><p>{t('احتفظ النظام بحسابات المستخدمين والإعدادات وسجل زاتكا.', 'User accounts, setup and ZATCA history were preserved.')}</p></div></div> : <>
          <div className="reset-warning-card"><p>{t('سيتم حذف بيانات التشغيل المحلية المحددة، بما فيها سجلات العملاء. لا تُحذف إعدادات زاتكا أو الحسابات أو دليل الحسابات أو قواعد الضريبة، ولا تمس سجلات المطاعم والمطبخ والموارد البشرية.', 'The selected local operational data, including customer records, will be deleted. ZATCA settings, accounts, chart of accounts and tax rules are kept; restaurant, kitchen and HR records are not changed.')}</p></div>
          <form onSubmit={submitReset}>
            {!demoMode && <label className="form-field reset-password-field"><span>{t('أدخل كلمة مرور حساب المدير للتأكيد', 'Enter the administrator account password')}</span><div className="sensitive-password-input"><KeyRound size={15}/><input type="password" value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} autoComplete="current-password" minLength={12} maxLength={256} required disabled={!canReset}/></div></label>}
            {resetError && <div className="auth-error" role="alert"><AlertTriangle size={15}/><span>{resetError}</span></div>}
            <div className="reset-dialog-actions"><button type="button" className="button button-ghost" onClick={closeReset} disabled={resetBusy}>{t('إلغاء', 'Cancel')}</button><button className="button reset-button" disabled={resetBusy || !canReset || (!demoMode && resetPassword.length < 12)}>{resetBusy ? t('جارٍ التصفير…', 'Resetting…') : t('تأكيد التصفير', 'Confirm reset')}<RotateCcw size={15}/></button></div>
          </form>
        </>}
        {resetResult && <div className="reset-dialog-actions"><button className="button button-primary" onClick={closeReset}>{t('تم', 'Done')}</button></div>}
      </section>
    </div>}
  </section>;
}

function SettingRow({ icon: Icon, label, value, ok }: { icon: typeof Database; label: string; value: string; ok?: boolean }) {
  return <div className="setting-row"><span className="setting-row-icon"><Icon size={15}/></span><span>{label}</span><b className={ok ? 'setting-ok' : ''}>{ok && <i/>}{value}</b></div>;
}
