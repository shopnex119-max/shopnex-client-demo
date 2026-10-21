import { useEffect, useMemo, useState } from 'react';
import { ClipboardCheck, Download, FileCheck2, PackageSearch, RotateCcw, Search, SlidersHorizontal, Warehouse } from 'lucide-react';
import type { AppLanguage } from '../../app/types';
import { getProducts, type CatalogProduct } from '../../app/api';

type CountLine = CatalogProduct & { counted: string; note: string };
type CountStatus = 'draft' | 'submitted' | 'posted';

const fallback: CatalogProduct[] = [
  { id: 'count-1', sku: 'FD-001', name: 'برجر لحم', category: 'وجبات', price: '32.00', vat_rate: '15.00', tax_category: 'standard', tax_reason: '', tax_rule_id: null, quantity: '80.000', average_cost: '18.00', price_includes_vat: false, active: true },
  { id: 'count-2', sku: 'FD-002', name: 'بيتزا مارغريتا', category: 'وجبات', price: '38.00', vat_rate: '15.00', tax_category: 'standard', tax_reason: '', tax_rule_id: null, quantity: '60.000', average_cost: '21.00', price_includes_vat: false, active: true },
  { id: 'count-3', sku: 'CF-001', name: 'قهوة مختصة', category: 'مشروبات', price: '18.00', vat_rate: '15.00', tax_category: 'standard', tax_reason: '', tax_rule_id: null, quantity: '120.000', average_cost: '7.00', price_includes_vat: false, active: true },
  { id: 'count-4', sku: 'DR-001', name: 'مياه معدنية', category: 'مشروبات', price: '3.00', vat_rate: '15.00', tax_category: 'standard', tax_reason: '', tax_rule_id: null, quantity: '300.000', average_cost: '1.00', price_includes_vat: true, active: true },
];

function money(value: number, ar: boolean) { return `${new Intl.NumberFormat(ar ? 'ar-SA' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} ${ar ? 'ر.س' : 'SAR'}`; }
function num(value: string | number) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }

export default function InventoryCountPage({ lang, demoMode, canManage = true }: { lang: AppLanguage; demoMode: boolean; canManage?: boolean }) {
  const ar = lang === 'ar';
  const t = (a: string, e: string) => ar ? a : e;
  const [lines, setLines] = useState<CountLine[]>([]);
  const [query, setQuery] = useState('');
  const [warehouse, setWarehouse] = useState(ar ? 'المستودع الرئيسي' : 'Main warehouse');
  const [status, setStatus] = useState<CountStatus>('draft');
  const [countDate, setCountDate] = useState(new Date().toISOString().slice(0, 10));
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    getProducts().then((items) => { if (active) setLines(items.map((item) => ({ ...item, counted: item.quantity, note: '' }))); })
      .catch(() => { if (active) setLines(fallback.map((item) => ({ ...item, counted: item.quantity, note: '' }))); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const visible = useMemo(() => lines.filter((line) => `${line.name} ${line.sku} ${line.category}`.toLowerCase().includes(query.toLowerCase())), [lines, query]);
  const totals = useMemo(() => lines.reduce((sum, line) => {
    const book = num(line.quantity); const counted = num(line.counted); const variance = counted - book;
    return { book: sum.book + book, counted: sum.counted + counted, variance: sum.variance + variance, value: sum.value + variance * num(line.average_cost), countedLines: sum.countedLines + (line.counted.trim() !== '' ? 1 : 0) };
  }, { book: 0, counted: 0, variance: 0, value: 0, countedLines: 0 }), [lines]);
  const progress = lines.length ? Math.round((totals.countedLines / lines.length) * 100) : 0;

  const updateLine = (id: string, counted: string, note?: string) => setLines((current) => current.map((line) => line.id === id ? { ...line, counted, note: note ?? line.note } : line));
  const resetCounts = () => { setLines((current) => current.map((line) => ({ ...line, counted: line.quantity, note: '' }))); setStatus('draft'); setNotice(t('تمت إعادة الكميات الفعلية إلى رصيد الدفتر.', 'Counted quantities were reset to book quantities.')); };
  const save = (next: CountStatus) => { setStatus(next); setNotice(next === 'posted' ? t('تم اعتماد تسوية الجرد في المعاينة فقط. لا توجد قيد محاسبي حقيقي دون API.', 'Count adjustment posted in preview only. No real journal is created without the API.') : t('تم حفظ جلسة الجرد كمسودة.', 'Count session saved as a draft.')); };
  const exportCsv = () => {
    const rows = [[t('الرمز', 'SKU'), t('الصنف', 'Item'), t('رصيد الدفتر', 'Book qty'), t('الجرد الفعلي', 'Counted qty'), t('الفرق', 'Variance'), t('قيمة الفرق', 'Variance value'), t('ملاحظة', 'Note')], ...lines.map((line) => [line.sku, line.name, line.quantity, line.counted, String(num(line.counted) - num(line.quantity)), String((num(line.counted) - num(line.quantity)) * num(line.average_cost)), line.note])];
    const blob = new Blob([rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `shopnex-inventory-count-${countDate}.csv`; anchor.click(); URL.revokeObjectURL(url);
  };

  return <section className="finance-page inventory-count-page">
    <div className="page-heading-row"><div><div className="eyebrow"><span className="eyebrow-star">✦</span>{t('التشغيل · الرقابة على المخزون', 'OPERATIONS · STOCK CONTROL')}</div><h1>{t('جرد المخزون والتسويات', 'Inventory count & adjustments')}<span className="heading-period">.</span></h1><p>{t('أنشئ جلسة جرد قابلة للمراجعة، قارن الرصيد الدفتري بالفعلي، ثم اعتمد فرق الكمية والقيمة.', 'Create an auditable count session, compare book to physical stock, then post quantity and value variances.')}</p></div><div className="heading-actions"><span className={`demo-pill ${demoMode ? '' : 'module-live-pill'}`}><i/>{demoMode ? t('معاينة محلية للمتصفح', 'BROWSER PREVIEW') : t('قاعدة محلية', 'LOCAL DATABASE')}</span><button className="button button-outline" onClick={exportCsv}><Download size={14}/>{t('تصدير الجرد', 'Export count')}</button></div></div>
    {notice && <div className={`finance-alert ${status === 'posted' ? 'success' : 'preview'}`}><FileCheck2 size={17}/><span>{notice}</span></div>}
    <div className="count-control-bar panel"><label><span>{t('المستودع', 'Warehouse')}</span><select value={warehouse} onChange={(event) => setWarehouse(event.target.value)}><option>{t('المستودع الرئيسي', 'Main warehouse')}</option><option>{t('مستودع الرياض', 'Riyadh warehouse')}</option><option>{t('مستودع جدة', 'Jeddah warehouse')}</option></select></label><label><span>{t('تاريخ الجرد', 'Count date')}</span><input type="date" value={countDate} onChange={(event) => setCountDate(event.target.value)}/></label><label><span>{t('حالة الجلسة', 'Session status')}</span><select value={status} onChange={(event) => setStatus(event.target.value as CountStatus)}><option value="draft">{t('مسودة', 'Draft')}</option><option value="submitted">{t('بانتظار المراجعة', 'Submitted')}</option><option value="posted">{t('معتمدة', 'Posted')}</option></select></label><div className="count-progress"><div><span>{t('اكتمال العد', 'COUNT COMPLETION')}</span><b>{progress}%</b></div><div className="progress-track"><i style={{ width: `${progress}%` }}/></div><small>{totals.countedLines} / {lines.length} {t('أصناف بعدّ فعلي', 'items counted')}</small></div></div>
    <div className="finance-kpi-grid count-kpis"><article className="panel finance-kpi"><span className="metric-icon teal"><Warehouse size={17}/></span><small>{t('رصيد الدفتر', 'BOOK QUANTITY')}</small><b>{totals.book.toLocaleString(ar ? 'ar-SA' : 'en-US')}</b><span>{t('إجمالي الوحدات قبل الجرد', 'units before count')}</span></article><article className="panel finance-kpi"><span className="metric-icon blue"><ClipboardCheck size={17}/></span><small>{t('الرصيد الفعلي', 'PHYSICAL QUANTITY')}</small><b>{totals.counted.toLocaleString(ar ? 'ar-SA' : 'en-US')}</b><span>{t('الكميات التي أدخلها فريق الجرد', 'quantities entered by counters')}</span></article><article className="panel finance-kpi"><span className={`metric-icon ${totals.variance < 0 ? 'amber' : 'violet'}`}><SlidersHorizontal size={17}/></span><small>{t('فرق الكمية', 'QUANTITY VARIANCE')}</small><b>{totals.variance > 0 ? '+' : ''}{totals.variance.toLocaleString(ar ? 'ar-SA' : 'en-US')}</b><span>{t('موجب زيادة · سالب عجز', 'positive gain · negative shortage')}</span></article><article className="panel finance-kpi"><span className="metric-icon amber"><PackageSearch size={17}/></span><small>{t('قيمة الفرق', 'VARIANCE VALUE')}</small><b>{money(totals.value, ar)}</b><span>{t('بالتكلفة المتوسطة', 'at average cost')}</span></article></div>
    <article className="panel finance-record-panel"><div className="panel-heading"><div><span className="eyebrow">{t('تفاصيل جلسة الجرد', 'COUNT SESSION DETAILS')}</span><h2>{warehouse} · {countDate}</h2></div><div className="table-actions"><label className="table-search"><Search size={15}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('بحث بالصنف أو الرمز', 'Search item or SKU')}/></label><button className="button button-outline compact" onClick={resetCounts} disabled={!canManage}><RotateCcw size={14}/>{t('تصفير العد', 'Reset count')}</button></div></div><div className="invoice-table-wrap"><table className="data-table finance-table count-table"><thead><tr><th>{t('الصنف', 'Item')}</th><th>{t('الموقع', 'Location')}</th><th>{t('رصيد الدفتر', 'Book')}</th><th>{t('الجرد الفعلي', 'Physical')}</th><th>{t('الفرق', 'Variance')}</th><th>{t('قيمة الفرق', 'Value')}</th><th>{t('ملاحظة', 'Note')}</th></tr></thead><tbody>{visible.map((line) => { const variance = num(line.counted) - num(line.quantity); return <tr key={line.id}><td><b>{line.name}</b><small className="finance-subcell">{line.sku} · {line.category}</small></td><td className="muted-cell">{warehouse}</td><td className="amount-cell">{num(line.quantity)}</td><td><input className="count-input" type="number" disabled={!canManage} min="0" step="0.001" value={line.counted} onChange={(event) => updateLine(line.id, event.target.value)}/></td><td className={`amount-cell ${variance < 0 ? 'variance-negative' : variance > 0 ? 'variance-positive' : ''}`}>{variance > 0 ? '+' : ''}{variance}</td><td className="amount-cell">{money(variance * num(line.average_cost), ar)}</td><td><input className="count-note-input" disabled={!canManage} value={line.note} onChange={(event) => updateLine(line.id, line.counted, event.target.value)} placeholder={t('سبب الفرق', 'Reason')}/></td></tr>; })}</tbody></table>{loading && <div className="module-empty">{t('جارٍ تحميل الأصناف…', 'Loading items…')}</div>}{!loading && !visible.length && <div className="module-empty">{t('لا توجد أصناف مطابقة.', 'No matching items.')}</div>}</div><div className="finance-form-actions"><span className="count-review-note">{t('راجع الفروقات والملاحظات قبل الاعتماد. الاعتماد الحقيقي ينشئ قيد تسوية مخزون عند توفر API.', 'Review variances and notes before posting. A live API will create the inventory adjustment journal on posting.')}</span><button className="button button-outline" onClick={() => save('submitted')} disabled={!canManage || !lines.length}>{t('إرسال للمراجعة', 'Submit for review')}</button><button className="button button-primary" onClick={() => save('posted')} disabled={!canManage || !lines.length}>{t('اعتماد التسوية', 'Post adjustment')}</button></div></article>
  </section>;
}
