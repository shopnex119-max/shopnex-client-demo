import { useEffect, useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpLeft, Download, FilePlus2, Plus, Printer, Search, ShoppingBag, ShoppingCart } from 'lucide-react';
import type { AppLanguage, PageKey } from '../../app/types';
import { getInvoiceDetails, getInvoices, getPhase1InvoiceQr, type InvoiceDetail, type SavedInvoice } from '../../app/api';
import InvoiceReceipt, { buildDemoQrPayload, type InvoiceReceiptPayload } from './InvoiceReceipt';

type InvoiceRecord = { id: string; invoiceId?: string; name: string; date: string; channel: string; amount: string; state: string; invoiceType: 'tax' | 'simplified' | 'demo'; uploadStatus: 'uploaded' | 'not_uploaded' };
type ReceiptState = { invoice: InvoiceReceiptPayload; qrBase64: string | null; qrDisclaimer: string; sellerName?: string; vatNumber?: string; demoMode: boolean };

const demoRecords: InvoiceRecord[] = [];


function toMinor(value: string | number): bigint {
  const match = String(value).trim().match(/^(-?)(\d+)(?:\.(\d*))?$/);
  if (!match) return 0n;
  let minor = BigInt(match[2]) * 100n + BigInt(((match[3] ?? '') + '00').slice(0, 2));
  if ((match[3] ?? '').length > 2 && match[3][2] >= '5') minor += 1n;
  return match[1] ? -minor : minor;
}

function formatMoney(value: bigint, ar: boolean) {
  const sign = value < 0n ? '−' : '';
  const absolute = value < 0n ? -value : value;
  const locale = ar ? 'ar-SA' : 'en-US';
  const whole = new Intl.NumberFormat(locale).format(absolute / 100n);
  const fraction = new Intl.NumberFormat(locale, { useGrouping: false, minimumIntegerDigits: 2, maximumFractionDigits: 0 }).format(Number(absolute % 100n));
  return `${sign}${whole}${ar ? '٫' : '.'}${fraction} ${ar ? 'ر.س' : 'SAR'}`;
}

function toRecord(invoice: SavedInvoice, lang: AppLanguage): InvoiceRecord {
  const date = new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA-u-ca-gregory' : 'en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Riyadh' }).format(new Date(invoice.created_at));
  const state = invoice.status === 'paid' ? (lang === 'ar' ? 'مدفوعة' : 'Paid') : invoice.status === 'partially_paid' ? (lang === 'ar' ? 'مدفوعة جزئيًا' : 'Partially paid') : (lang === 'ar' ? 'مسودة' : 'Draft');
  return { id: invoice.invoice_number, invoiceId: invoice.id, name: lang === 'ar' ? 'عميل نقدي' : 'Walk-in customer', date, channel: lang === 'ar' ? 'نقطة بيع · محلي' : 'POS · Local', amount: invoice.total, state, invoiceType: invoice.invoice_type === 'tax' ? 'tax' : 'simplified', uploadStatus: 'not_uploaded' };
}

function demoSummaryInvoice(record: InvoiceRecord): InvoiceReceiptPayload {
  const total = record.amount;
  const paid = ['مدفوعة', 'Paid'].includes(record.state) ? total : '0.00';
  return {
    id: record.id, invoice_number: record.id, customer_name: record.name, invoice_type: record.invoiceType === 'tax' ? 'tax' : 'simplified',
    status: record.state, subtotal: total, discount_total: '0.00', taxable_subtotal: total,
    vat_total: '0.00', total, amount_paid: paid, change_due: '0.00', currency: 'SAR',
    created_at: new Date().toISOString(), lines: [],
    payments: paid === '0.00' ? [] : [{ id: `demo-${record.id}`, method: 'cash', amount: paid, created_at: new Date().toISOString() }],
  };
}

export default function OperationsPage({ lang, mode, demoMode, canManage }: { lang: AppLanguage; mode: PageKey | 'purchasing'; demoMode: boolean; canManage: boolean }) {
  const ar = lang === 'ar';
  const pos = mode === 'sales';
  const purchasing = mode === 'purchasing';
  const title = pos ? (ar ? 'نقطة البيع والمبيعات' : 'Point of sale & sales') : purchasing ? (ar ? 'المشتريات' : 'Purchasing') : (ar ? 'الفواتير والمبيعات' : 'Invoices & sales');
  const [search, setSearch] = useState('');
  const [records, setRecords] = useState<InvoiceRecord[]>(demoMode ? demoRecords : []);
  const [loading, setLoading] = useState(!demoMode);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(false);
  const [openingId, setOpeningId] = useState('');
  const [receipt, setReceipt] = useState<ReceiptState | null>(null);
  const [typeFilter, setTypeFilter] = useState<'all' | 'tax' | 'simplified'>('all');
  const [uploadFilter, setUploadFilter] = useState<'all' | 'uploaded' | 'not_uploaded'>('all');

  useEffect(() => {
    let active = true;
    if (demoMode) {
      setLoading(true);
      getInvoices().then((items) => { if (active) setRecords([...items.map((invoice) => toRecord(invoice, lang)), ...demoRecords]); })
        .catch(() => { if (active) setRecords(demoRecords); })
        .finally(() => { if (active) setLoading(false); });
      return () => { active = false; };
    }
    if (mode === 'invoices') {
      setLoading(true);
      getInvoices().then((items) => { if (active) setRecords(items.map((invoice) => toRecord(invoice, lang))); })
        .catch((e: unknown) => { if (active) setError(e instanceof Error ? e.message : (ar ? 'تعذر تحميل الفواتير.' : 'Could not load invoices.')); })
        .finally(() => { if (active) setLoading(false); });
    } else { setRecords([]); setLoading(false); }
    return () => { active = false; };
  }, [demoMode, mode, lang, ar]);

  const visible = useMemo(() => records.filter((record) => `${record.id} ${record.name} ${record.channel}`.toLowerCase().includes(search.toLowerCase()) && (typeFilter === 'all' || record.invoiceType === typeFilter) && (uploadFilter === 'all' || record.uploadStatus === uploadFilter)), [records, search, typeFilter, uploadFilter]);
  const totalMinor = records.reduce((sum, record) => sum + toMinor(record.amount), 0n);
  const recordCount = BigInt(records.length);
  const averageMinor = recordCount === 0n ? 0n : (() => {
    const quotient = totalMinor / recordCount;
    const remainder = totalMinor % recordCount;
    const absoluteRemainder = remainder < 0n ? -remainder : remainder;
    if (absoluteRemainder * 2n < recordCount) return quotient;
    return quotient + (totalMinor < 0n ? -1n : 1n);
  })();
  const t = (a: string, e: string) => ar ? a : e;
  const stateIsPaid = (state: string) => ['مدفوعة', 'مدفوعة جزئيًا', 'Paid', 'Partially paid'].includes(state);
  const stateIsDraft = (state: string) => ['مسودة', 'Draft'].includes(state);

  const openInvoice = async (record: InvoiceRecord) => {
    setError(''); setOpeningId(record.id);
    if (!record.invoiceId) {
      const invoice = demoSummaryInvoice(record);
      setReceipt({
        invoice, qrBase64: buildDemoQrPayload(invoice), demoMode: true,
        qrDisclaimer: t('بيانات المثال وQR تجريبيان، ولا يمثلان فاتورة حقيقية أو مستندًا مرسلًا لزاتكا.', 'Sample invoice and QR only; not a real invoice or a document submitted to ZATCA.'),
      });
      setOpeningId('');
      return;
    }
    try {
      const detail: InvoiceDetail = await getInvoiceDetails(record.invoiceId);
      let qrBase64: string | null = null;
      let qrDisclaimer = demoMode
        ? t('QR توضيحي فقط؛ لا يمثل رمز زاتكا أو فاتورة مرسلة للهيئة.','Illustrative QR only; not a ZATCA QR or a submitted invoice.')
        : t('أدخل الاسم النظامي ورقم VAT في إعدادات زاتكا لإظهار QR المحلي.', 'Set the legal seller name and VAT number in ZATCA settings to show the local QR.');
      let sellerName: string | undefined;
      let vatNumber: string | undefined;
      if (demoMode) qrBase64 = buildDemoQrPayload(detail);
      else {
        try {
          const qr = await getPhase1InvoiceQr(detail.id);
          qrBase64 = qr.qr_base64; qrDisclaimer = qr.disclaimer; sellerName = qr.seller_name; vatNumber = qr.vat_number;
        } catch { /* Invoice viewing and printing do not depend on QR setup. */ }
      }
      setReceipt({ invoice: detail, qrBase64, qrDisclaimer, sellerName, vatNumber, demoMode });
    } catch (e) {
      setError(e instanceof Error ? e.message : t('تعذر تحميل تفاصيل الفاتورة.', 'Could not load invoice details.'));
    } finally { setOpeningId(''); }
  };

  return <section className="operations-page">
    <div className="page-heading-row">
      <div><div className="eyebrow"><span className="eyebrow-star">✦</span>{t('مساحة العمل · العمليات', 'WORKSPACE · OPERATIONS')}</div><h1>{title}<span className="heading-period">.</span></h1><p>{demoMode ? t('يعرض فواتير المثال ومبيعات هذا المتصفح فقط.','Sample invoices and this browser’s sales only.') : t('سجل فواتير محفوظة محليًا أو بيانات معاينة واضحة.', 'Local invoice register, or clearly marked preview data.')}</p></div>
      <div className="heading-actions"><span className={`demo-pill ${demoMode ? '' : 'module-live-pill'}`}><i/>{demoMode ? t('بيانات معاينة', 'PREVIEW DATA') : t('بيانات محلية', 'LOCAL DATA')}</span>{canManage && <button className="button button-primary" onClick={() => setNotice(true)}><Plus size={15}/>{pos ? t('بيع جديد', 'New sale') : purchasing ? t('طلب شراء', 'New purchase') : t('فاتورة جديدة', 'New invoice')}</button>}</div>
    </div>
    {notice && <div className="inline-alert warning"><span><ShoppingBag size={16}/></span>{t('ابدأ البيع من شاشة الكاشير. لا ينشئ هذا الزر فاتورة غير مكتملة.', 'Open the cashier screen to record sales; this button does not create an empty invoice.')}<button className="icon-button" onClick={() => setNotice(false)}><ArrowDownLeft size={15}/></button></div>}
    {error && <div className="module-notice error">{error}</div>}
    <div className="operations-summary">
      <div className="panel ops-summary-card"><span className="metric-icon teal"><ShoppingBag size={17}/></span><span className="eyebrow">{demoMode ? t('إجمالي تجريبي', 'PREVIEW TOTAL') : t('إجمالي الفواتير', 'INVOICE TOTAL')}</span><b>{formatMoney(totalMinor, ar)}</b><span className="muted-cell">{t('مجموع المستندات المعروضة', 'sum of listed invoices')}</span></div>
      <div className="panel ops-summary-card"><span className="metric-icon blue"><FilePlus2 size={17}/></span><span className="eyebrow">{t('عدد المستندات', 'DOCUMENT COUNT')}</span><b>{records.length.toLocaleString(ar ? 'ar-SA' : 'en-US')}</b><span className="muted-cell">{t('فواتير في السجل', 'invoices in register')}</span></div>
      <div className="panel ops-summary-card"><span className="metric-icon violet"><ShoppingCart size={17}/></span><span className="eyebrow">{t('متوسط الفاتورة', 'AVERAGE INVOICE')}</span><b>{formatMoney(averageMinor, ar)}</b><span className="muted-cell">{t('محسوب من السجل الظاهر', 'calculated from visible register')}</span></div>
    </div>
    <article className="panel records-panel">
      <div className="panel-heading"><div><span className="eyebrow">{t('سجل المستندات', 'DOCUMENT REGISTER')}</span><h2>{t('الفواتير الأخيرة', 'Recent invoices')}</h2></div>
        <div className="table-actions"><label className="table-search"><Search size={15}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('بحث في الفواتير', 'Search invoices')}/></label><select className="invoice-filter-select" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as typeof typeFilter)}><option value="all">{t('كل الأنواع', 'All types')}</option><option value="tax">{t('ضريبية', 'Tax')}</option><option value="simplified">{t('غير ضريبية / مبسطة', 'Non-tax / simplified')}</option></select><select className="invoice-filter-select" value={uploadFilter} onChange={(event) => setUploadFilter(event.target.value as typeof uploadFilter)}><option value="all">{t('كل حالات الرفع', 'All upload states')}</option><option value="uploaded">{t('مرفوعة', 'Uploaded')}</option><option value="not_uploaded">{t('غير مرفوعة', 'Not uploaded')}</option></select><button className="icon-button export-button" title={t('تصدير', 'Export')}><Download size={16}/></button></div>
      </div>
      <div className="invoice-table-wrap"><table className="data-table"><thead><tr><th>{t('رقم المستند', 'Reference')}</th><th>{t('العميل', 'Customer')}</th><th>{t('التاريخ', 'Date')}</th><th>{t('القناة / الفرع', 'Channel / branch')}</th><th>{t('حالة الدفع', 'Payment status')}</th><th>{t('حالة الرفع', 'Upload status')}</th><th>{t('الإجمالي', 'Total')}</th><th/></tr></thead>
        <tbody>{visible.map((record) => <tr key={record.id}><td><b className="mono-cell">{record.id}</b><small className="finance-subcell">{record.invoiceType === 'tax' ? t('فاتورة ضريبية', 'Tax invoice') : t('فاتورة مبسطة / غير ضريبية', 'Simplified / non-tax invoice')}</small></td><td>{record.name}</td><td className="muted-cell">{record.date}</td><td className="muted-cell">{record.channel}</td><td><span className={`status-chip ${stateIsPaid(record.state) ? 'green' : stateIsDraft(record.state) ? 'slate' : 'amber'}`}><i/>{record.state}</span></td><td><span className="status-chip amber"><i/>{record.uploadStatus === 'uploaded' ? t('مرفوعة', 'Uploaded') : t('غير مرفوعة', 'Not uploaded')}</span></td><td className="amount-cell">{formatMoney(toMinor(record.amount), ar)}</td><td><button className="icon-button row-arrow" aria-label={t('فتح وطباعة الفاتورة', 'Open and print invoice')} title={t('فتح وطباعة', 'Open / print')} disabled={openingId === record.id} onClick={() => void openInvoice(record)}><Printer size={15}/><ArrowUpLeft size={11}/></button></td></tr>)}</tbody>
      </table>{loading && <div className="module-empty">{t('جارٍ تحميل سجل الفواتير…', 'Loading invoices…')}</div>}{!loading && visible.length === 0 && <div className="module-empty">{demoMode ? t('لا توجد بيانات معاينة مطابقة.', 'No matching preview records.') : t('لا توجد فواتير محفوظة بعد. استخدم شاشة الكاشير لتسجيل أول بيع.', 'No saved invoices yet. Use the cashier to record the first sale.')}</div>}</div>
      <div className="table-footer"><span>{ar ? `عرض ${visible.length} من ${records.length} مستندات` : `Showing ${visible.length} of ${records.length} documents`}</span><div><button className="icon-button" disabled><ArrowDownLeft size={15}/></button><span>1 / 1</span><button className="icon-button" disabled><ArrowUpLeft size={15}/></button></div></div>
    </article>
    {receipt && <InvoiceReceipt invoice={receipt.invoice} qrBase64={receipt.qrBase64} qrDisclaimer={receipt.qrDisclaimer} sellerName={receipt.sellerName} vatNumber={receipt.vatNumber} lang={lang} demoMode={receipt.demoMode} onClose={() => setReceipt(null)}/>}
  </section>;
}
