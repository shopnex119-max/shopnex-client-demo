import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { AlertTriangle, CalendarClock, Check, CirclePlus, CreditCard, Package, Plus, ReceiptText, Search, Truck, Wallet } from 'lucide-react';
import type { AppLanguage } from '../../app/types';
import { addPurchasePayment, createPurchase, createSupplier, getProducts, getPurchases, getSuppliers, type CatalogProduct, type CreatePurchaseInput, type PurchaseRecord, type Supplier } from '../../app/api';
import { calculateLineMinor, formatValue, parseMinor, parseQuantityThousandths, toDecimalString, toQuantityString } from '../../app/finance';

type PurchaseLineDraft = { product_id: string; quantity: string; unit_cost: string; discount_percent: string; price_includes_vat: boolean };
type Props = { lang: AppLanguage; demoMode: boolean; canManage: boolean };

const previewSuppliers: Supplier[] = [];

const previewProducts: CatalogProduct[] = [];

const previewPurchases: PurchaseRecord[] = [];


function rowStatus(status: PurchaseRecord['status'], ar: boolean) {
  return status === 'paid' ? (ar ? 'مدفوعة' : 'Paid') : status === 'partially_paid' ? (ar ? 'مدفوعة جزئيًا' : 'Partially paid') : (ar ? 'آجلة' : 'Unpaid');
}
function totalOf(records: PurchaseRecord[], key: 'total' | 'balance_due') {
  return records.reduce((sum, item) => sum + parseMinor(item[key]), 0n);
}

export default function PurchasingPage({ lang, demoMode, canManage }: Props) {
  const ar = lang === 'ar';
  const t = (a: string, e: string) => ar ? a : e;
  const [products, setProducts] = useState<CatalogProduct[]>(demoMode ? previewProducts : []);
  const [suppliers, setSuppliers] = useState<Supplier[]>(demoMode ? previewSuppliers : []);
  const [purchases, setPurchases] = useState<PurchaseRecord[]>(demoMode ? previewPurchases : []);
  const [loading, setLoading] = useState(!demoMode);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [supplierFormOpen, setSupplierFormOpen] = useState(false);
  const [supplierBusy, setSupplierBusy] = useState(false);
  const [supplierId, setSupplierId] = useState('');
  const [lines, setLines] = useState<PurchaseLineDraft[]>([{ product_id: '', quantity: '1.000', unit_cost: '0.00', discount_percent: '0.00', price_includes_vat: false }]);
  const [initialPayment, setInitialPayment] = useState('0.00');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'bank_transfer'>('bank_transfer');
  const [activePayment, setActivePayment] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethodLater, setPaymentMethodLater] = useState('bank_transfer');
  const [paymentBusy, setPaymentBusy] = useState(false);

  useEffect(() => {
    let active = true;
    if (demoMode) {
      setProducts(previewProducts); setSuppliers(previewSuppliers); setPurchases(previewPurchases); setLoading(false);
      if (previewProducts.length) setLines((current) => current.map((line) => ({ ...line, product_id: line.product_id || previewProducts[0].id, unit_cost: line.unit_cost === '0.00' ? previewProducts[0].average_cost : line.unit_cost })));
      return () => { active = false; };
    }
    setLoading(true); setError('');
    Promise.all([getProducts(), getSuppliers(), getPurchases()]).then(([catalog, vendorList, purchaseList]) => {
      if (!active) return;
      setProducts(catalog); setSuppliers(vendorList); setPurchases(purchaseList);
      if (catalog.length) setLines((current) => current.map((line) => ({ ...line, product_id: line.product_id || catalog[0].id, unit_cost: line.unit_cost === '0.00' ? catalog[0].average_cost || '0.00' : line.unit_cost })));
    }).catch((e: unknown) => { if (active) setError(e instanceof Error ? e.message : t('تعذر تحميل بيانات المشتريات.','Could not load purchasing data.')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [demoMode]);

  const draftTotals = useMemo(() => {
    return lines.reduce((sum, line) => {
      const product = products.find((item) => item.id === line.product_id);
      if (!product) return sum;
      const result = calculateLineMinor({ quantity: line.quantity, unitPrice: line.unit_cost, discountPercent: line.discount_percent, vatRate: product.vat_rate, priceIncludesVat: line.price_includes_vat });
      return { subtotal: sum.subtotal + result.gross, discount: sum.discount + result.discount, taxable: sum.taxable + result.taxable, vat: sum.vat + result.vat, total: sum.total + result.total };
    }, { subtotal: 0n, discount: 0n, taxable: 0n, vat: 0n, total: 0n });
  }, [lines, products]);

  const visible = useMemo(() => purchases.filter((item) => `${item.purchase_number} ${item.supplier_invoice_number} ${item.supplier_name}`.toLowerCase().includes(search.toLowerCase())), [purchases, search]);
  const nextPurchaseNumber = () => `PUR-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${String(Date.now()).slice(-4)}`;
  const updateLine = (index: number, patch: Partial<PurchaseLineDraft>) => setLines((current) => current.map((line, i) => i === index ? { ...line, ...patch } : line));
  const addLine = () => setLines((current) => [...current, { product_id: products[0]?.id ?? '', quantity: '1.000', unit_cost: products[0]?.average_cost ?? '0.00', discount_percent: '0.00', price_includes_vat: false }]);

  const submitPurchase = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    if (!supplierId) { setError(t('اختر المورد أولًا.','Select a supplier first.')); return; }
    if (!lines.length || lines.some((line) => !line.product_id || parseQuantityThousandths(line.quantity) <= 0n)) { setError(t('أدخل صنفًا وكمية صحيحة لكل سطر.','Choose a product and a positive quantity for every line.')); return; }
    const paid = parseMinor(initialPayment);
    if (paid > draftTotals.total) { setError(t('الدفعة المقدمة لا يمكن أن تتجاوز إجمالي الفاتورة.','Initial payment cannot exceed the bill total.')); return; }
    const input: CreatePurchaseInput = {
      purchase_number: String(data.get('purchase_number') || nextPurchaseNumber()).trim(),
      supplier_invoice_number: String(data.get('supplier_invoice_number') || '').trim(), supplier_id: supplierId,
      due_date: String(data.get('due_date') || '') || undefined,
      lines: lines.map((line) => ({ ...line })),
      payments: paid > 0n ? [{ method: paymentMethod, amount: toDecimalString(paid) }] : [],
    };
    setSaving(true); setError(''); setNotice('');
    try {
      if (demoMode) {
        const vendor = suppliers.find((item) => item.id === supplierId)!;
        const total = draftTotals.total;
        const now = new Date().toISOString();
        const demoRecord: PurchaseRecord = {
          id: `demo-${Date.now()}`, purchase_number: input.purchase_number, supplier_invoice_number: input.supplier_invoice_number ?? '', supplier_id: supplierId, supplier_name: vendor.name,
          status: paid >= total ? 'paid' : paid > 0n ? 'partially_paid' : 'unpaid', subtotal: toDecimalString(draftTotals.subtotal), discount_total: toDecimalString(draftTotals.discount), taxable_subtotal: toDecimalString(draftTotals.taxable), vat_total: toDecimalString(draftTotals.vat), total: toDecimalString(total), amount_paid: toDecimalString(paid), balance_due: toDecimalString(total - paid), due_date: input.due_date ?? null, created_at: now, currency: 'SAR', lines: [], payments: [],
        };
        setPurchases((current) => [demoRecord, ...current]);
        setProducts((current) => current.map((product) => {
          const received = lines.reduce((sum, line) => sum + (line.product_id === product.id ? parseQuantityThousandths(line.quantity) : 0n), 0n);
          return received ? { ...product, quantity: toQuantityString(parseQuantityThousandths(product.quantity) + received) } : product;
        }));
        setNotice(t('تم تحديث معاينة مؤقتة فقط؛ لا تُحفظ ولا تُرحّل محاسبيًا.','Preview updated only; nothing was persisted or posted to accounts.'));
      } else {
        const created = await createPurchase(input);
        setPurchases((current) => [created, ...current]);
        const [catalog, vendorList] = await Promise.all([getProducts(), getSuppliers()]);
        setProducts(catalog); setSuppliers(vendorList);
        setNotice(t('تم ترحيل فاتورة المورد واستلام الكميات وتسجيل المخزون والقيود والدفعات معًا.','Supplier bill posted; receipt, stock, journal and payments were saved atomically.'));
      }
      setFormOpen(false); setInitialPayment('0.00'); setLines([{ product_id: products[0]?.id ?? '', quantity: '1.000', unit_cost: products[0]?.average_cost ?? '0.00', discount_percent: '0.00', price_includes_vat: false }]);
    } catch (e) { setError(e instanceof Error ? e.message : t('تعذر ترحيل فاتورة المشتريات.','Could not post the supplier bill.')); }
    finally { setSaving(false); }
  };

  const submitSupplier = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const input = {
      supplier_code: String(data.get('supplier_code') || '').trim(), name: String(data.get('name') || '').trim(),
      vat_number: String(data.get('vat_number') || '').trim(), phone: String(data.get('phone') || '').trim(),
      email: String(data.get('email') || '').trim(), payment_terms_days: Number(data.get('payment_terms_days') || 30),
      credit_limit: String(data.get('credit_limit') || '0.00'),
    };
    setSupplierBusy(true); setError('');
    try {
      const created = demoMode ? { ...input, id: `demo-supplier-${Date.now()}`, active: true } : await createSupplier(input);
      setSuppliers((current) => [created, ...current]); setSupplierId(created.id); setSupplierFormOpen(false);
      setNotice(t('تم حفظ المورد.','Supplier saved.'));
    } catch (e) { setError(e instanceof Error ? e.message : t('تعذر حفظ المورد.','Could not save supplier.')); }
    finally { setSupplierBusy(false); }
  };

  const recordPayment = async (purchase: PurchaseRecord) => {
    const cents = parseMinor(paymentAmount);
    if (cents <= 0n || cents > parseMinor(purchase.balance_due)) { setError(t('أدخل دفعة موجبة لا تتجاوز الرصيد المستحق.','Enter a positive amount no greater than the outstanding balance.')); return; }
    setPaymentBusy(true); setError('');
    try {
      if (demoMode) {
        setPurchases((current) => current.map((item) => item.id === purchase.id ? { ...item, amount_paid: toDecimalString(parseMinor(item.amount_paid) + cents), balance_due: toDecimalString(parseMinor(item.balance_due) - cents), status: parseMinor(item.amount_paid) + cents >= parseMinor(item.total) ? 'paid' : 'partially_paid' } : item));
        setNotice(t('أُضيفت الدفعة في المعاينة فقط.','Payment added to preview only.'));
      } else {
        const updated = await addPurchasePayment(purchase.id, { method: paymentMethodLater, amount: toDecimalString(cents), idempotency_key: crypto.randomUUID() });
        setPurchases((current) => current.map((item) => item.id === updated.id ? updated : item));
        setNotice(t('تم تسجيل الدفعة وتحديث رصيد المورد والقيد المحاسبي.','Payment recorded; supplier balance and journal updated.'));
      }
      setActivePayment(null); setPaymentAmount('');
    } catch (e) { setError(e instanceof Error ? e.message : t('تعذر تسجيل الدفعة.','Could not record payment.')); }
    finally { setPaymentBusy(false); }
  };

  return <section className="finance-page purchasing-page">
    <div className="page-heading-row"><div><div className="eyebrow"><span className="eyebrow-star">✦</span>{t('مساحة العمل · الموردون والمشتريات','WORKSPACE · SUPPLIERS & PURCHASING')}</div><h1>{t('المشتريات والموردون','Purchasing & suppliers')}<span className="heading-period">.</span></h1><p>{t('سجّل فاتورة المورد واستلام المخزون والضريبة والدفعات ضمن معاملة مترابطة.','Post a supplier bill, goods receipt, VAT, inventory and payments together.')}</p></div><div className="heading-actions"><span className={`demo-pill ${demoMode ? '' : 'module-live-pill'}`}><i/>{demoMode ? t('معاينة مؤقتة','TEMPORARY PREVIEW') : t('قاعدة محلية','LOCAL DATABASE')}</span>{canManage && <button className="button button-outline" onClick={() => { setSupplierFormOpen((v) => !v); setFormOpen(false); }}><Truck size={15}/>{t('مورد جديد','New supplier')}</button>} {canManage && <button className="button button-primary" onClick={() => { setFormOpen((v) => !v); setSupplierFormOpen(false); setNotice(''); setError(''); }}><Plus size={15}/>{t('فاتورة مشتريات','Purchase bill')}</button>}</div></div>
    {demoMode && <div className="finance-alert preview"><AlertTriangle size={17}/><span>{t('الموقع العام يعمل بمعاينة فقط: التعديلات مؤقتة داخل المتصفح. استخدم التطبيق المحلي وقاعدة بياناته لحفظ العمليات والقيود فعليًا.','The public website is preview-only: edits are temporary in the browser. Use the local app/database to persist transactions and journals.')}</span></div>}
    <div className="finance-alert info"><ReceiptText size={17}/><span>{t('تسجّل هذه الشاشة فاتورة مورد مستلمة بالكامل. أوامر الشراء وطلبات عروض الأسعار والاستلام الجزئي والمرتجعات ليست ضمن هذه الدفعة.','This screen posts a supplier invoice with a full receipt. Purchase requests, RFQs, purchase orders, partial receipts and returns are not included in this release.')}</span></div>
    {notice && <div className={`finance-alert ${demoMode ? 'preview' : 'success'}`}><Check size={17}/><span>{notice}</span></div>}
    {error && <div className="finance-alert error"><AlertTriangle size={17}/><span>{error}</span></div>}
    <div className="finance-kpi-grid"><article className="panel finance-kpi"><span className="metric-icon teal"><ReceiptText size={17}/></span><small>{t('قيمة فواتير الفترة المعروضة','BILLS SHOWN')}</small><b>{formatValue(totalOf(purchases, 'total'), ar)}</b><span>{purchases.length} {t('فاتورة مسجلة','bills listed')}</span></article><article className="panel finance-kpi"><span className="metric-icon amber"><Wallet size={17}/></span><small>{t('رصيد الموردين المستحق','SUPPLIER BALANCE DUE')}</small><b>{formatValue(totalOf(purchases, 'balance_due'), ar)}</b><span>{t('حسب الفواتير المحمّلة','across loaded bills')}</span></article><article className="panel finance-kpi"><span className="metric-icon blue"><Truck size={17}/></span><small>{t('الموردون النشطون','ACTIVE SUPPLIERS')}</small><b>{suppliers.length.toLocaleString(ar ? 'ar-SA' : 'en-US')}</b><span>{t('سجلات الموردين','supplier records')}</span></article><article className="panel finance-kpi"><span className="metric-icon violet"><Package size={17}/></span><small>{t('الأصناف في الكتالوج','CATALOG ITEMS')}</small><b>{products.length.toLocaleString(ar ? 'ar-SA' : 'en-US')}</b><span>{t('تُحدَّث عند الاستلام','updated on receipt')}</span></article></div>

    {supplierFormOpen && canManage && <form className="panel finance-form" onSubmit={submitSupplier}><div className="panel-heading"><div><span className="eyebrow">01 · {t('بيانات المورد','SUPPLIER PROFILE')}</span><h2>{t('إضافة مورد جديد','Create supplier')}</h2></div><Truck size={19}/></div><div className="finance-form-grid"><label><span>{t('رمز المورد','Supplier code')}</span><input name="supplier_code" required maxLength={80} placeholder="SUP-001"/></label><label><span>{t('اسم المورد','Supplier name')}</span><input name="name" required maxLength={240}/></label><label><span>{t('الرقم الضريبي','VAT number')}</span><input name="vat_number" inputMode="numeric" maxLength={20}/></label><label><span>{t('الهاتف','Phone')}</span><input name="phone" maxLength={40}/></label><label><span>{t('البريد','Email')}</span><input name="email" type="email" maxLength={240}/></label><label><span>{t('مهلة السداد بالأيام','Payment terms (days)')}</span><input name="payment_terms_days" type="number" min="0" max="3650" defaultValue="30"/></label><label><span>{t('حد الائتمان (ر.س)','Credit limit (SAR)')}</span><input name="credit_limit" type="number" min="0" step="0.01" defaultValue="0.00"/></label></div><div className="finance-form-actions"><button type="button" className="button button-outline" onClick={() => setSupplierFormOpen(false)}>{t('إلغاء','Cancel')}</button><button className="button button-primary" disabled={supplierBusy}>{supplierBusy ? t('جارٍ الحفظ…','Saving…') : t('حفظ المورد','Save supplier')}</button></div></form>}

    {formOpen && canManage && <form className="panel finance-form" onSubmit={submitPurchase}><div className="panel-heading"><div><span className="eyebrow">02 · {t('مستند مورد مُرحّل','POSTED SUPPLIER DOCUMENT')}</span><h2>{t('فاتورة مورد واستلام كامل','Supplier bill & full receipt')}</h2><p>{t('يحسب الخادم المجاميع والضريبة والتكلفة؛ لا تُرسل الواجهة أي إجماليات موثوقة.','The server recalculates totals, VAT and cost; client totals are only a preview.')}</p></div><ReceiptText size={19}/></div><div className="finance-form-grid"><label><span>{t('رقم المستند الداخلي','Internal reference')}</span><input name="purchase_number" required defaultValue={nextPurchaseNumber()} maxLength={80}/></label><label><span>{t('رقم فاتورة المورد','Supplier invoice number')}</span><input name="supplier_invoice_number" maxLength={80}/></label><label><span>{t('المورد','Supplier')}</span><select required value={supplierId} onChange={(e) => setSupplierId(e.target.value)}><option value="">{t('اختر موردًا','Choose supplier')}</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name} · {supplier.supplier_code}</option>)}</select></label><label><span>{t('تاريخ الاستحقاق','Due date')}</span><input name="due_date" type="date"/></label></div>
      <div className="finance-lines-heading"><div><b>{t('بنود الفاتورة','Bill lines')}</b><small>{t('تكلفة الشراء والخصم من مستند المورد','Unit cost and discount from supplier bill')}</small></div><button type="button" className="button button-outline compact" onClick={addLine}><CirclePlus size={14}/>{t('إضافة بند','Add line')}</button></div>
      <div className="finance-lines">{lines.map((line, index) => { const product = products.find((item) => item.id === line.product_id); return <div className="finance-line" key={index}><label><span>{t('الصنف','Product')}</span><select required value={line.product_id} onChange={(e) => { const item = products.find((p) => p.id === e.target.value); updateLine(index, { product_id: e.target.value, unit_cost: item?.average_cost || '0.00' }); }}><option value="">{t('اختر صنفًا','Choose product')}</option>{products.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.sku}</option>)}</select></label><label><span>{t('الكمية','Quantity')}</span><input type="number" min="0.001" step="0.001" value={line.quantity} onChange={(e) => updateLine(index, { quantity: e.target.value })}/></label><label><span>{t('تكلفة الوحدة','Unit cost')}</span><input type="number" min="0" step="0.01" value={line.unit_cost} onChange={(e) => updateLine(index, { unit_cost: e.target.value })}/></label><label><span>{t('الخصم %','Discount %')}</span><input type="number" min="0" max="100" step="0.01" value={line.discount_percent} onChange={(e) => updateLine(index, { discount_percent: e.target.value })}/></label><label className="finance-check"><span>{t('شامل ضريبة','VAT incl.')}</span><input type="checkbox" checked={line.price_includes_vat} onChange={(e) => updateLine(index, { price_includes_vat: e.target.checked })}/></label><div className="finance-line-vat"><small>{t('النسبة الحالية','Current rate')}</small><b>{product?.vat_rate ?? '—'}%</b></div><button type="button" className="icon-button finance-line-remove" disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((_, i) => i !== index))} aria-label={t('حذف البند','Remove line')}>×</button></div>; })}</div>
      <div className="finance-form-bottom"><div className="finance-payment-fields"><label><span>{t('الدفعة المقدمة','Initial payment')}</span><input type="number" min="0" step="0.01" value={initialPayment} onChange={(e) => setInitialPayment(e.target.value)}/></label><label><span>{t('طريقة الدفع','Payment method')}</span><select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)}><option value="bank_transfer">{t('تحويل بنكي','Bank transfer')}</option><option value="cash">{t('نقدًا','Cash')}</option><option value="card">{t('شبكة / بطاقة','Card')}</option></select></label></div><div className="finance-totals"><div><span>{t('قيمة البنود قبل الخصم','Gross lines')}</span><b>{formatValue(draftTotals.subtotal, ar)}</b></div><div><span>{t('الخصومات','Discounts')}</span><b>−{formatValue(draftTotals.discount, ar)}</b></div><div><span>{t('ضريبة المدخلات التقديرية','Input VAT preview')}</span><b>{formatValue(draftTotals.vat, ar)}</b></div><div className="total"><span>{t('الإجمالي التقديري','Estimated total')}</span><b>{formatValue(draftTotals.total, ar)}</b></div></div></div><div className="finance-form-actions"><button type="button" className="button button-outline" onClick={() => setFormOpen(false)}>{t('إلغاء','Cancel')}</button><button className="button button-primary" disabled={saving || !products.length || !suppliers.length}>{saving ? t('جارٍ الترحيل…','Posting…') : t('استلام وترحيل الفاتورة','Receive & post bill')}</button></div></form>}

    <article className="panel finance-record-panel"><div className="panel-heading"><div><span className="eyebrow">{t('المشتريات المسجلة','POSTED PURCHASES')}</span><h2>{t('فواتير الموردين وأرصدتهم','Supplier bills & balances')}</h2></div><label className="table-search"><Search size={15}/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('بحث برقم أو مورد','Search reference or supplier')}/></label></div><div className="invoice-table-wrap"><table className="data-table finance-table"><thead><tr><th>{t('المرجع','Reference')}</th><th>{t('المورد','Supplier')}</th><th>{t('التاريخ','Date')}</th><th>{t('الاستحقاق','Due')}</th><th>{t('الحالة','Status')}</th><th>{t('الإجمالي','Total')}</th><th>{t('المدفوع','Paid')}</th><th>{t('المتبقي','Balance')}</th><th/></tr></thead><tbody>{visible.map((purchase) => <tr key={purchase.id}><td><b className="mono-cell">{purchase.purchase_number}</b><small className="finance-subcell">{purchase.supplier_invoice_number || t('بدون رقم فاتورة مورد','No vendor ref.')}</small></td><td>{purchase.supplier_name}</td><td className="muted-cell">{new Date(purchase.created_at).toLocaleDateString(ar ? 'ar-SA' : 'en-GB')}</td><td className="muted-cell">{purchase.due_date ? new Date(`${purchase.due_date}T12:00:00`).toLocaleDateString(ar ? 'ar-SA' : 'en-GB') : '—'}</td><td><span className={`status-chip ${purchase.status === 'paid' ? 'green' : purchase.status === 'partially_paid' ? 'amber' : 'slate'}`}><i/>{rowStatus(purchase.status, ar)}</span></td><td className="amount-cell">{formatValue(purchase.total, ar)}</td><td className="amount-cell">{formatValue(purchase.amount_paid, ar)}</td><td className="amount-cell">{formatValue(purchase.balance_due, ar)}</td><td>{canManage && parseMinor(purchase.balance_due) > 0n && <button className="button button-outline compact" onClick={() => { setActivePayment(activePayment === purchase.id ? null : purchase.id); setPaymentAmount(String(purchase.balance_due)); setError(''); }}><CreditCard size={13}/>{t('سداد','Pay')}</button>}</td></tr>)}</tbody></table>{loading && <div className="module-empty">{t('جارٍ تحميل فواتير الموردين…','Loading supplier bills…')}</div>}{!loading && !visible.length && <div className="module-empty">{t('لا توجد فواتير مطابقة. سجّل أول فاتورة مورد من الأعلى.','No matching supplier bills. Post the first bill above.')}</div>}</div>{activePayment && canManage && <div className="finance-inline-payment"><b>{t('تسجيل دفعة جديدة','Record supplier payment')}</b><label><span>{t('المبلغ','Amount')}</span><input type="number" min="0.01" step="0.01" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)}/></label><label><span>{t('الطريقة','Method')}</span><select value={paymentMethodLater} onChange={(e) => setPaymentMethodLater(e.target.value)}><option value="bank_transfer">{t('تحويل بنكي','Bank transfer')}</option><option value="cash">{t('نقدًا','Cash')}</option><option value="card">{t('شبكة / بطاقة','Card')}</option></select></label><button className="button button-primary compact" disabled={paymentBusy} onClick={() => { const record = purchases.find((item) => item.id === activePayment); if (record) void recordPayment(record); }}>{paymentBusy ? t('جارٍ الحفظ…','Saving…') : t('اعتماد الدفعة','Post payment')}</button><button className="button button-outline compact" onClick={() => setActivePayment(null)}>{t('إلغاء','Cancel')}</button></div>}</article>
    <div className="finance-footnote"><CalendarClock size={14}/>{t('تاريخ الاستحقاق في تقرير الذمم يعتمد على مهلة المورد أو التاريخ المدخل؛ سجل الفاتورة غير قابل للحذف أو التعديل بعد الترحيل في هذه النسخة.','Payables aging uses the supplier terms or entered due date; posted bills cannot be silently edited or deleted in this release.')}</div>
  </section>;
}
