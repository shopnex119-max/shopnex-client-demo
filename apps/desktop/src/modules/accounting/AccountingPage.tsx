import { useEffect, useState, type FormEvent } from 'react';
import { AlertTriangle, BookOpen, CheckCircle2, FileCheck2, Plus, ReceiptText, RefreshCw, Scale, ShieldCheck, Wallet } from 'lucide-react';
import type { AppLanguage } from '../../app/types';
import { createTaxRule, getJournals, getPayables, getReceivables, getTaxRules, getTrialBalance, type TrialBalanceRow } from '../../app/api';
import { formatValue, parseMinor } from '../../app/finance';

type Props = { lang: AppLanguage; demoMode: boolean; canManage: boolean };
type Tab = 'trial' | 'journals' | 'balances' | 'tax';
const demoAccounts: TrialBalanceRow[] = [];

const demoJournals: any[] = [];
const demoRules = [
  { id:'r1',code:'SHOPNEX-STD-15',version:1,name_ar:'ضريبة قياسية',name_en:'Standard VAT',category:'standard',rate:'15.00',effective_from:'2020-07-01',effective_to:null,reason_required:false,code_scope:'internal_shopnex_code_not_zatca_code' },
  { id:'r2',code:'SHOPNEX-ZERO',version:1,name_ar:'نسبة صفرية',name_en:'Zero-rated',category:'zero_rated',rate:'0.00',effective_from:'2020-07-01',effective_to:null,reason_required:false,code_scope:'internal_shopnex_code_not_zatca_code' },
];
const demoReceivables: any[] = [];
const demoPayables: any[] = [];

export default function AccountingPage({ lang, demoMode, canManage }: Props) {
  const ar = lang === 'ar';
  const t = (a: string, e: string) => ar ? a : e;
  const [tab, setTab] = useState<Tab>('trial');
  const [accounts, setAccounts] = useState<TrialBalanceRow[]>(demoMode ? demoAccounts : []);
  const [debitTotal, setDebitTotal] = useState<string | number>('0.00');
  const [creditTotal, setCreditTotal] = useState<string | number>('0.00');
  const [balanced, setBalanced] = useState(true);
  const [journals, setJournals] = useState<any[]>(demoMode ? demoJournals : []);
  const [receivables, setReceivables] = useState<any[]>(demoMode ? demoReceivables : []);
  const [payables, setPayables] = useState<any[]>(demoMode ? demoPayables : []);
  const [taxRules, setTaxRules] = useState<any[]>(demoMode ? demoRules : []);
  const [loading, setLoading] = useState(!demoMode);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [ruleFormOpen, setRuleFormOpen] = useState(false);
  const [savingRule, setSavingRule] = useState(false);

  const refresh = async () => {
    if (demoMode) return;
    setLoading(true); setError('');
    try {
      const [trial, journalList, arList, apList, rules] = await Promise.all([getTrialBalance(), getJournals(), getReceivables(), getPayables(), getTaxRules()]);
      setAccounts(trial.accounts); setDebitTotal(trial.debit_total); setCreditTotal(trial.credit_total); setBalanced(trial.balanced);
      setJournals(journalList); setReceivables(arList); setPayables(apList); setTaxRules(rules);
    } catch (e) { setError(e instanceof Error ? e.message : t('تعذر تحميل الدفاتر.','Could not load ledgers.')); }
    finally { setLoading(false); }
  };
  useEffect(() => { void refresh(); }, [demoMode]);
  const amount = (value: string | number | bigint) => formatValue(value, ar);
  const accountBalance = (key: string) => accounts.find((row) => row.system_key === key)?.balance ?? '0.00';
  const receivableAmount = receivables.reduce((sum, row) => sum + parseMinor(row.balance_due || 0), 0n);
  const payableAmount = payables.reduce((sum, row) => sum + parseMinor(row.balance_due || 0), 0n);
  const cashAndBank = parseMinor(accountBalance('cash')) + parseMinor(accountBalance('bank'));
  const netVat = parseMinor(accountBalance('vat_output')) - parseMinor(accountBalance('vat_input'));

  const saveRule = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const data = {
      code: String(form.get('code') || '').trim(), name_ar: String(form.get('name_ar') || '').trim(), name_en: String(form.get('name_en') || '').trim(),
      category: String(form.get('category') || 'standard'), rate: String(form.get('rate') || '0'), effective_from: String(form.get('effective_from') || ''),
      effective_to: String(form.get('effective_to') || '') || undefined, reason_required: form.get('reason_required') === 'on',
    };
    setSavingRule(true); setError(''); setNotice('');
    try {
      if (demoMode) { setTaxRules((current) => [...current, { ...data, version: 2, id: `demo-rule-${Date.now()}`, effective_to: data.effective_to ?? null, code_scope: 'internal_shopnex_code_not_zatca_code' }]); setNotice(t('تم تحديث المعاينة فقط؛ لم تُحفظ قاعدة ضريبية.','Preview updated only; no tax rule was persisted.')); }
      else { const created = await createTaxRule(data); setTaxRules((current) => [...current, created].sort((a, b) => a.code.localeCompare(b.code) || a.version - b.version)); setNotice(t(`تم إنشاء الإصدار ${created.version} مع حفظ الإصدارات السابقة.`,`Version ${created.version} saved; prior tax-rule versions were retained.`)); }
      setRuleFormOpen(false); event.currentTarget.reset();
    } catch (e) { setError(e instanceof Error ? e.message : t('تعذر حفظ قاعدة الضريبة.','Could not save the tax rule.')); }
    finally { setSavingRule(false); }
  };

  return <section className="finance-page accounting-page">
    <div className="page-heading-row"><div><div className="eyebrow"><span className="eyebrow-star">✦</span>{t('مساحة العمل · الإدارة المالية','WORKSPACE · FINANCE')}</div><h1>{t('المحاسبة والضريبة','Accounting & tax')}<span className="heading-period">.</span></h1><p>{t('قيود مزدوجة، ميزان مراجعة، دفتر أستاذ، ذمم الموردين والعملاء وقواعد VAT بإصدارات مؤرخة.','Double-entry journals, trial balance, general ledger, receivables/payables and versioned VAT rules.')}</p></div><div className="heading-actions"><span className={`demo-pill ${demoMode ? '' : 'module-live-pill'}`}><i/>{demoMode ? t('بيانات معاينة','PREVIEW DATA') : t('قيود محلية','LOCAL JOURNALS')}</span><button className="button button-outline" onClick={() => void refresh()} disabled={loading || demoMode}><RefreshCw size={14}/>{t('تحديث','Refresh')}</button></div></div>
    {demoMode && <div className="finance-alert preview"><AlertTriangle size={17}/><span>{t('الموقع العام يعرض أرقامًا توضيحية مؤقتة. الحسابات الفعلية لا تعمل إلا عبر API وقاعدة بيانات التطبيق المحلي.','The public site shows temporary sample values. Live accounting requires the local app API/database.')}</span></div>}
    <div className="finance-alert warning"><ShieldCheck size={17}/><span>{t('الميزان يبدأ من القيود المنشأة بعد هذا الإصدار؛ لا تُنشأ قيود تاريخية تلقائيًا لفواتير قديمة، كما أن إغلاق الفترات/صلاحيات إعادة الفتح لم تُفعّل بعد.','The ledger starts with entries posted after this release; historic invoices are not back-posted. Period closing/reopening permissions are not enabled yet.')}</span></div>
    {notice && <div className={`finance-alert ${demoMode ? 'preview' : 'success'}`}><CheckCircle2 size={17}/><span>{notice}</span></div>}
    {error && <div className="finance-alert error"><AlertTriangle size={17}/><span>{error}</span></div>}
    <div className="finance-kpi-grid"><article className="panel finance-kpi"><span className="metric-icon teal"><Wallet size={17}/></span><small>{t('النقد والبنك','CASH & BANK')}</small><b>{amount(cashAndBank)}</b><span>{t('أرصدة قيود مُرحّلة','posted-journal balances')}</span></article><article className="panel finance-kpi"><span className="metric-icon blue"><ReceiptText size={17}/></span><small>{t('الذمم المدينة','RECEIVABLES')}</small><b>{amount(receivableAmount)}</b><span>{receivables.length} {t('فاتورة غير مسددة بالكامل','open invoices')}</span></article><article className="panel finance-kpi"><span className="metric-icon amber"><BookOpen size={17}/></span><small>{t('الذمم الدائنة','PAYABLES')}</small><b>{amount(payableAmount)}</b><span>{payables.length} {t('فاتورة مورد مفتوحة','open supplier bills')}</span></article><article className="panel finance-kpi"><span className="metric-icon violet"><Scale size={17}/></span><small>{t('صافي VAT التقديري','ESTIMATED NET VAT')}</small><b>{amount(netVat)}</b><span>{t('ليس إقرارًا ضريبيًا مُقدّمًا','not a filed return')}</span></article></div>
    <div className="finance-tabs" role="tablist"><button className={tab === 'trial' ? 'active' : ''} onClick={() => setTab('trial')}><Scale size={15}/>{t('ميزان المراجعة','Trial balance')}</button><button className={tab === 'journals' ? 'active' : ''} onClick={() => setTab('journals')}><BookOpen size={15}/>{t('قيود اليومية','Journal entries')}</button><button className={tab === 'balances' ? 'active' : ''} onClick={() => setTab('balances')}><Wallet size={15}/>{t('الذمم والأستاذ','Balances & ledger')}</button><button className={tab === 'tax' ? 'active' : ''} onClick={() => setTab('tax')}><FileCheck2 size={15}/>{t('قواعد الضريبة','Tax rules')}</button></div>

    {tab === 'trial' && <article className="panel finance-record-panel"><div className="panel-heading"><div><span className="eyebrow">{t('دليل الحسابات','CHART OF ACCOUNTS')}</span><h2>{t('ميزان المراجعة','Trial balance')}</h2></div><span className={`status-chip ${balanced ? 'green' : 'red'}`}><i/>{balanced ? t('متوازن','Balanced') : t('غير متوازن — راجع القيود','Out of balance')}</span></div><div className="invoice-table-wrap"><table className="data-table finance-table"><thead><tr><th>{t('الرمز','Code')}</th><th>{t('الحساب','Account')}</th><th>{t('النوع','Type')}</th><th>{t('مدين','Debit')}</th><th>{t('دائن','Credit')}</th><th>{t('الرصيد الطبيعي','Balance')}</th></tr></thead><tbody>{accounts.map((row) => <tr key={row.id}><td><code>{row.code}</code></td><td><b>{ar ? row.name_ar : row.name_en}</b><small className="finance-subcell">{row.system_key}</small></td><td className="muted-cell">{row.account_type}</td><td className="amount-cell">{amount(row.debit_total)}</td><td className="amount-cell">{amount(row.credit_total)}</td><td className="amount-cell">{amount(row.balance)}</td></tr>)}</tbody><tfoot><tr><th colSpan={3}>{t('الإجمالي','TOTAL')}</th><th className="amount-cell">{amount(debitTotal)}</th><th className="amount-cell">{amount(creditTotal)}</th><th>{balanced ? '✓' : '!'}</th></tr></tfoot></table>{loading && <div className="module-empty">{t('جارٍ تحميل الحسابات…','Loading accounts…')}</div>}</div></article>}

    {tab === 'journals' && <article className="panel finance-record-panel"><div className="panel-heading"><div><span className="eyebrow">{t('مصدر آلي قابل للتتبع','TRACEABLE SOURCES')}</span><h2>{t('آخر القيود المحاسبية','Recent journal entries')}</h2></div><span className="status-chip green"><i/>{t('مدين = دائن','Debit = credit')}</span></div><div className="journal-list">{journals.map((journal) => <details className="journal-card" key={journal.id}><summary><span><b className="mono-cell">{journal.entry_number}</b><small>{journal.description}</small></span><span className="journal-meta"><small>{journal.source_type}</small><time>{new Date(journal.created_at).toLocaleDateString(ar ? 'ar-SA' : 'en-GB')}</time></span></summary><div className="invoice-table-wrap"><table className="data-table finance-table"><thead><tr><th>{t('الحساب','Account')}</th><th>{t('الوصف','Memo')}</th><th>{t('مدين','Debit')}</th><th>{t('دائن','Credit')}</th></tr></thead><tbody>{journal.lines.map((line: any, index: number) => <tr key={index}><td>{ar ? line.account_ar : line.account_en} <code>{line.account_code}</code></td><td>{line.memo}</td><td className="amount-cell">{amount(line.debit)}</td><td className="amount-cell">{amount(line.credit)}</td></tr>)}</tbody></table></div></details>)}{!journals.length && !loading && <div className="module-empty">{t('لا توجد قيود بعد. تُنشأ القيود تلقائيًا عند ترحيل بيع أو فاتورة مشتريات أو دفعة.','No journals yet. Sales, supplier bills and payments post their entries automatically.')}</div>}</div></article>}

    {tab === 'balances' && <div className="finance-two-column"><article className="panel finance-record-panel"><div className="panel-heading"><div><span className="eyebrow">{t('تحصيل العملاء','CUSTOMER COLLECTIONS')}</span><h2>{t('الذمم المدينة','Accounts receivable')}</h2></div></div><div className="invoice-table-wrap"><table className="data-table finance-table"><thead><tr><th>{t('الفاتورة / العميل','Invoice / customer')}</th><th>{t('العمر','Age')}</th><th>{t('الإجمالي','Total')}</th><th>{t('المدفوع','Paid')}</th><th>{t('الرصيد','Balance')}</th></tr></thead><tbody>{receivables.map((row, i) => <tr key={i}><td><b>{row.invoice_number}</b><small className="finance-subcell">{row.customer}</small></td><td><span className="status-chip amber"><i/>{row.age_bucket}</span></td><td>{amount(row.total)}</td><td>{amount(row.paid)}</td><td className="amount-cell">{amount(row.balance_due)}</td></tr>)}</tbody></table>{!receivables.length && <div className="module-empty">{t('لا توجد ذمم مدينة مفتوحة.','No open receivables.')}</div>}</div></article><article className="panel finance-record-panel"><div className="panel-heading"><div><span className="eyebrow">{t('تسديد الموردين','SUPPLIER PAYMENTS')}</span><h2>{t('الذمم الدائنة','Accounts payable')}</h2></div></div><div className="invoice-table-wrap"><table className="data-table finance-table"><thead><tr><th>{t('الفاتورة / المورد','Bill / supplier')}</th><th>{t('المتأخر','Overdue')}</th><th>{t('الإجمالي','Total')}</th><th>{t('المدفوع','Paid')}</th><th>{t('الرصيد','Balance')}</th></tr></thead><tbody>{payables.map((row, i) => <tr key={i}><td><b>{row.purchase_number}</b><small className="finance-subcell">{row.supplier}</small></td><td><span className={`status-chip ${row.days_overdue ? 'amber' : 'green'}`}><i/>{row.days_overdue} {t('يوم','days')}</span></td><td>{amount(row.total)}</td><td>{amount(row.paid)}</td><td className="amount-cell">{amount(row.balance_due)}</td></tr>)}</tbody></table>{!payables.length && <div className="module-empty">{t('لا توجد ذمم دائنة مفتوحة.','No open payables.')}</div>}</div></article></div>}

    {tab === 'tax' && <><article className="panel finance-record-panel"><div className="panel-heading"><div><span className="eyebrow">{t('قواعد مُؤرخة غير قابلة للاستبدال الصامت','VERSIONED EFFECTIVE-DATED RULES')}</span><h2>{t('إصدارات معدلات وتصنيفات الضريبة','Tax-rate and category versions')}</h2></div>{canManage && <button className="button button-primary" onClick={() => setRuleFormOpen((v) => !v)}><Plus size={14}/>{t('إصدار قاعدة جديدة','New rule version')}</button>}</div><div className="finance-alert info"><ShieldCheck size={16}/><span>{t('معرّفات SHOPNEX داخلية وليست رموز زاتكا الرسمية. احتفِظ بالأساس القانوني ورمز السبب مع المنشأة؛ النظام لا يرسل إقرارًا ضريبيًا.','SHOPNEX rule codes are internal, not official ZATCA codes. Confirm legal basis/reason with your business; this system does not file a tax return.')}</span></div>{ruleFormOpen && canManage && <form className="finance-form compact-finance-form" onSubmit={saveRule}><div className="finance-form-grid"><label><span>{t('الرمز الداخلي','Internal code')}</span><input name="code" required maxLength={40} placeholder="SA-STD"/></label><label><span>{t('الاسم العربي','Arabic name')}</span><input name="name_ar" required maxLength={160}/></label><label><span>{t('الاسم الإنجليزي','English name')}</span><input name="name_en" required maxLength={160}/></label><label><span>{t('التصنيف','Category')}</span><select name="category"><option value="standard">{t('قياسي','Standard')}</option><option value="zero_rated">{t('صفري','Zero rated')}</option><option value="exempt">{t('معفى','Exempt')}</option><option value="out_of_scope">{t('خارج النطاق','Out of scope')}</option></select></label><label><span>{t('النسبة %','Rate %')}</span><input name="rate" type="number" min="0" max="100" step="0.01" defaultValue="15.00" required/></label><label><span>{t('تاريخ السريان','Effective from')}</span><input name="effective_from" type="date" required defaultValue={new Date().toISOString().slice(0,10)}/></label><label><span>{t('ينتهي في (اختياري)','Effective to (optional)')}</span><input name="effective_to" type="date"/></label><label className="finance-check"><span>{t('يتطلب سبب إعفاء','Reason required')}</span><input name="reason_required" type="checkbox"/></label></div><div className="finance-form-actions"><button type="button" className="button button-outline" onClick={() => setRuleFormOpen(false)}>{t('إلغاء','Cancel')}</button><button className="button button-primary" disabled={savingRule}>{savingRule ? t('جارٍ الحفظ…','Saving…') : t('حفظ إصدار جديد','Save new version')}</button></div></form>}<div className="invoice-table-wrap"><table className="data-table finance-table"><thead><tr><th>{t('الرمز / الإصدار','Code / version')}</th><th>{t('التصنيف','Category')}</th><th>{t('النسبة','Rate')}</th><th>{t('ساري من','From')}</th><th>{t('ساري إلى','To')}</th><th>{t('السبب','Reason')}</th></tr></thead><tbody>{taxRules.map((rule) => <tr key={rule.id}><td><b>{rule.code}</b><small className="finance-subcell">v{rule.version}</small></td><td>{rule.category}</td><td>{rule.rate}%</td><td>{rule.effective_from}</td><td>{rule.effective_to || '—'}</td><td>{rule.reason_required ? t('مطلوب','Required') : t('حسب الحالة','As applicable')}</td></tr>)}</tbody></table></div></article></>}
    <div className="finance-footnote"><ShieldCheck size={14}/>{t('قيود هذه الوحدة للدفاتر التشغيلية وليست مراجعة محاسب قانوني. قيود المصدر غير قابلة للحذف بصمت؛ اعتمد إجراء عكس/تسوية موثقًا عند الحاجة.','Operational accounting records are not a substitute for a licensed accountant’s review. Source journals are not silently deleted; use a documented reversal/adjustment workflow when needed.')}</div>
  </section>;
}
