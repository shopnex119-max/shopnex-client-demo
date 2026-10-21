import { useEffect, useMemo, useRef, useState } from 'react';
import ShiftBar from './ShiftBar';
import { BadgePercent, Banknote, Check, CreditCard, Minus, Plus, Search, ShoppingBag, Trash2, Utensils, WalletCards } from 'lucide-react';
import type { AppLanguage } from '../../app/types';
import { createInvoice, createModuleRecord, getInvoiceDetails, getPhase1InvoiceQr, getProducts, type CatalogProduct } from '../../app/api';
import InvoiceReceipt, { buildDemoQrPayload, type InvoiceReceiptPayload } from '../sales/InvoiceReceipt';
import { loadPaymentMethods, type PaymentMethod } from '../../app/paymentMethods';

type Product = CatalogProduct & { tint?: string; symbol?: string };
type Cart = Record<string, number>;
type ReceiptState = { invoice: InvoiceReceiptPayload; qrBase64: string | null; qrDisclaimer: string; sellerName?: string; vatNumber?: string; demoMode: boolean };

const previewProducts: Product[] = [];

const categoriesEn = ['All', 'Meals', 'Drinks', 'Sides', 'Desserts'];
const categoryFor = (value: string, ar: boolean) => {
  if (ar) return value;
  return ({ وجبات: 'Meals', مشروبات: 'Drinks', إضافات: 'Sides', حلويات: 'Desserts' } as Record<string, string>)[value] ?? value;
};

function scaled(value: string | number, digits = 2): bigint {
  const [whole = '0', fraction = ''] = String(value).trim().split('.');
  if (!/^[+-]?\d*(\.\d*)?$/.test(String(value).trim())) return 0n;
  const negative = whole.startsWith('-');
  const magnitude = negative ? whole.slice(1) : whole;
  const factor = 10n ** BigInt(digits);
  const fractionValue = BigInt((fraction + '0'.repeat(digits)).slice(0, digits) || '0');
  const result = BigInt(magnitude || '0') * factor + fractionValue;
  return negative ? -result : result;
}

function roundDivide(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator / 2n) / denominator;
}

function minorText(value: bigint): string {
  const sign = value < 0n ? '-' : '';
  const absolute = value < 0n ? -value : value;
  return `${sign}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
}

function formatMoney(value: bigint, ar: boolean): string {
  const sign = value < 0n ? '−' : '';
  const absolute = value < 0n ? -value : value;
  const locale = ar ? 'ar-SA' : 'en-US';
  const whole = new Intl.NumberFormat(locale).format(absolute / 100n);
  const fraction = new Intl.NumberFormat(locale, { useGrouping: false, minimumIntegerDigits: 2, maximumFractionDigits: 0 }).format(Number(absolute % 100n));
  return `${sign}${whole}${ar ? '٫' : '.'}${fraction} ${ar ? 'ر.س' : 'SAR'}`;
}

function calculateCart(products: Product[], cart: Cart, discountPercent: string) {
  const requestedRate = scaled(discountPercent || '0');
  const rate = requestedRate < 0n ? 0n : requestedRate > 10000n ? 10000n : requestedRate;
  return Object.entries(cart).reduce((sum, [id, quantity]) => {
    const product = products.find((item) => item.id === id);
    if (!product) return sum;
    const gross = scaled(product.price) * BigInt(quantity);
    const discount = roundDivide(gross * rate, 10000n);
    const afterDiscount = gross - discount;
    const vatRate = scaled(product.vat_rate);
    let taxable = afterDiscount;
    let vat = 0n;
    let total = afterDiscount;
    if (product.price_includes_vat && vatRate > 0n) {
      taxable = roundDivide(afterDiscount * 10000n, 10000n + vatRate);
      vat = afterDiscount - taxable;
    } else if (!product.price_includes_vat) {
      vat = roundDivide(taxable * vatRate, 10000n);
      total += vat;
    }
    sum.subtotal += gross;
    sum.discount += discount;
    sum.taxable += taxable;
    sum.vat += vat;
    sum.total += total;
    sum.lines.push({ product, quantity, gross, discount, taxable, vat, total });
    return sum;
  }, { subtotal: 0n, discount: 0n, taxable: 0n, vat: 0n, total: 0n, lines: [] as { product: Product; quantity: number; gross: bigint; discount: bigint; taxable: bigint; vat: bigint; total: bigint }[] });
}

export default function PosPage({ lang, demoMode, canSell = true }: { lang: AppLanguage; demoMode: boolean; canSell?: boolean }) {
  const ar = lang === 'ar';
  const t = (a: string, e: string) => ar ? a : e;
  const [products, setProducts] = useState<Product[]>(demoMode ? previewProducts : []);
  const [cart, setCart] = useState<Cart>({});
  const [category, setCategory] = useState('الكل');
  const [query, setQuery] = useState('');
  const [discount, setDiscount] = useState('0');
  const [cashAmount, setCashAmount] = useState('0');
  const [cardAmount, setCardAmount] = useState('0');
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>(loadPaymentMethods);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('');
  const [customAmount, setCustomAmount] = useState('0');
  const [invoiceType, setInvoiceType] = useState<'simplified' | 'tax'>('simplified');
  const [loading, setLoading] = useState(!demoMode);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptState | null>(null);
  const [buyerName, setBuyerName] = useState('');
  const [buyerVat, setBuyerVat] = useState('');
  const [buyerAddress, setBuyerAddress] = useState('');
  const checkoutKeyRef = useRef('');
  const searchRef = useRef<HTMLInputElement>(null);
  const taxInvoice = invoiceType === 'tax';
  const buyerInvalid = taxInvoice && (!buyerName.trim() || !/^3\d{13}3$/.test(buyerVat.trim()));

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // A retry may only reuse the same idempotency key while the basket and tender are unchanged.
  useEffect(() => { checkoutKeyRef.current = ''; }, [cart, discount, cashAmount, cardAmount, customAmount, invoiceType, buyerName, buyerVat, buyerAddress]);

  useEffect(() => {
    let active = true;
    if (demoMode) {
      getProducts().then((items) => { if (active) setProducts(items as Product[]); })
        .catch(() => { if (active) setProducts(previewProducts); })
        .finally(() => { if (active) setLoading(false); });
      return () => { active = false; };
    }
    getProducts().then((items) => { if (active) setProducts(items); })
      .catch((e: unknown) => { if (active) setError(e instanceof Error ? e.message : t('تعذر تحميل الأصناف','Could not load products')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [demoMode]);
  useEffect(() => {
    const refresh = () => setPaymentMethods(loadPaymentMethods());
    window.addEventListener('shopnex-payment-methods-changed', refresh);
    refresh();
    return () => window.removeEventListener('shopnex-payment-methods-changed', refresh);
  }, []);
  useEffect(() => {
    const custom = paymentMethods.find((method) => !['cash', 'card'].includes(method.code));
    if (custom && !selectedPaymentMethod) setSelectedPaymentMethod(custom.code);
  }, [paymentMethods, selectedPaymentMethod]);

  const categoriesToShow = useMemo(() => ['الكل', ...new Set(products.map((product) => product.category))], [products]);
  const visibleProducts = useMemo(() => products.filter((product) => {
    const matchesCategory = category === 'الكل' || product.category === category;
    const matchesQuery = `${product.name} ${product.sku}`.toLowerCase().includes(query.trim().toLowerCase());
    return matchesCategory && matchesQuery;
  }), [products, category, query]);
  const totals = useMemo(() => calculateCart(products, cart, discount), [products, cart, discount]);
  const cashMinor = scaled(cashAmount || '0');
  const cardMinor = scaled(cardAmount || '0');
  const customMinor = scaled(customAmount || '0');
  const selectedCustomMethod = paymentMethods.find((method) => method.code === selectedPaymentMethod && !['cash', 'card'].includes(method.code));
  const tendered = cashMinor + cardMinor + customMinor;
  const discountMinor = scaled(discount || '0');
  const invalidDiscount = discountMinor < 0n || discountMinor > 10000n;
  const due = totals.total > tendered ? totals.total - tendered : 0n;
  const change = tendered > totals.total ? tendered - totals.total : 0n;
  const invalidPayment = change > 0n && (cardMinor > 0n || (customMinor > 0n && selectedCustomMethod?.kind !== 'cash'));

  const changeQuantity = (product: Product, delta: number) => {
    if (!canSell) return;
    setNotice('');
    setCart((current) => {
      const next = Math.max(0, Math.min(Number(product.quantity), (current[product.id] ?? 0) + delta));
      const result = { ...current };
      if (next === 0) delete result[product.id];
      else result[product.id] = next;
      return result;
    });
  };

  const checkout = async () => {
    if (!canSell) return;
    if (demoMode) {
      if (!totals.lines.length || tendered === 0n || invalidPayment || invalidDiscount) return;
      setSaving(true); setError(''); setNotice('');
      try {
        const payments = [
          ...(cashMinor > 0n ? [{ method: 'cash' as const, amount: minorText(cashMinor) }] : []),
          ...(cardMinor > 0n ? [{ method: 'card' as const, amount: minorText(cardMinor) }] : []),
          ...(selectedCustomMethod && customMinor > 0n ? [{ method: selectedCustomMethod.code, amount: minorText(customMinor) }] : []),
        ];
        const invoiceNumber = `DEMO-${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
        const saved = await createInvoice({
          invoice_number: invoiceNumber, customer_name: ar ? 'عميل معاينة' : 'Preview customer',
          lines: totals.lines.map(({ product, quantity }) => ({ product_id: product.id, quantity: String(quantity), discount_percent: discount || '0' })), invoice_type: invoiceType,
          payments,
        });
        const detail = await getInvoiceDetails(saved.id);
        const kitchenItems = totals.lines.filter(({ product }) => ['وجبات', 'مشروبات', 'إضافات', 'حلويات'].includes(product.category));
        let kitchenNote = '';
        if (kitchenItems.length) {
          try {
            const ticket = await createModuleRecord('restaurant', {
              type: 'order', name: `طلب ${saved.invoice_number}`, location: 'الكاشير · استلام', amount: saved.total,
              status: 'new', priority: 'normal', source: 'cashier-preview',
              items: kitchenItems.map(({ product, quantity }) => ({ name: product.name, quantity, note: '' })),
            });
            kitchenNote = ` · ${t('تذكرة المطبخ','Kitchen ticket')} ${String(ticket.data.name ?? '')}`;
          } catch { kitchenNote = ` · ${t('تعذر إنشاء تذكرة المطبخ','Kitchen ticket could not be saved')}`; }
        }
        setReceipt({
          invoice: detail, qrBase64: buildDemoQrPayload(detail), demoMode: true,
          qrDisclaimer: t('QR توضيحي فقط، لا يمثل رمز زاتكا ولا يُرسل أي بيانات للهيئة.', 'Illustrative QR only; not a ZATCA QR and no data is sent to the authority.'),
        });
        setNotice(`${t('حُفظت فاتورة المعاينة في هذا المتصفح فقط','Preview invoice saved in this browser only')}: ${saved.invoice_number} · ${formatMoney(scaled(saved.total), ar)}${change > 0n ? ` · ${t('الباقي','Change')} ${formatMoney(scaled(saved.change_due), ar)}` : ''}${kitchenNote}`);
        setCart({}); setDiscount('0'); setCashAmount('0'); setCardAmount('0'); setCustomAmount('0'); setInvoiceType('simplified');
        void getProducts().then((items) => setProducts(items as Product[])).catch(() => undefined);
      } catch (e) { setError(e instanceof Error ? e.message : t('تعذر حفظ فاتورة المعاينة.','Could not save the preview invoice.')); }
      finally { setSaving(false); }
      return;
    }
    if (totals.lines.length === 0 || tendered === 0n || invalidPayment || invalidDiscount || buyerInvalid) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const payments = [
        ...(cashMinor > 0n ? [{ method: 'cash' as const, amount: minorText(cashMinor) }] : []),
        ...(cardMinor > 0n ? [{ method: 'card' as const, amount: minorText(cardMinor) }] : []),
        ...(selectedCustomMethod && customMinor > 0n ? [{ method: selectedCustomMethod.code, amount: minorText(customMinor) }] : []),
      ];
      if (!checkoutKeyRef.current) {
        checkoutKeyRef.current = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
      }
      const saved = await createInvoice({
        // The server assigns the legal sequential invoice number; the key only protects against duplicate retries.
        idempotency_key: checkoutKeyRef.current,
        customer_name: taxInvoice ? buyerName.trim() : (ar ? 'عميل نقدي' : 'Walk-in customer'),
        customer_vat_number: taxInvoice ? buyerVat.trim() : '',
        customer_address: taxInvoice ? buyerAddress.trim() : '',
        invoice_type: invoiceType,
        lines: totals.lines.map(({ product, quantity }) => ({ product_id: product.id, quantity: String(quantity), discount_percent: discount || '0' })),
        payments,
      });
      setNotice(`${t('تم حفظ الفاتورة','Invoice saved')}: ${saved.invoice_number} · ${t('الإجمالي','Total')} ${formatMoney(scaled(saved.total), ar)}${change > 0n ? ` · ${t('الباقي','Change')} ${formatMoney(scaled(saved.change_due), ar)}` : ''}`);
      setCart({}); setDiscount('0'); setCashAmount('0'); setCardAmount('0'); setCustomAmount('0'); setInvoiceType('simplified');
      setBuyerName(''); setBuyerVat(''); setBuyerAddress(''); checkoutKeyRef.current = '';
      void getProducts().then(setProducts).catch(() => undefined);
      try {
        const detail = await getInvoiceDetails(saved.id);
        let qrBase64: string | null = null;
        let qrDisclaimer = t('أدخل الاسم النظامي ورقم VAT في إعدادات زاتكا لإنشاء معاينة QR محلية.', 'Set the legal seller name and VAT number in ZATCA settings to create a local QR preview.');
        let sellerName: string | undefined;
        let vatNumber: string | undefined;
        try {
          const qr = await getPhase1InvoiceQr(saved.id);
          qrBase64 = qr.qr_base64; qrDisclaimer = qr.disclaimer; sellerName = qr.seller_name; vatNumber = qr.vat_number;
        } catch { /* The invoice is saved even when seller QR settings are incomplete. */ }
        setReceipt({ invoice: detail, qrBase64, qrDisclaimer, sellerName, vatNumber, demoMode: false });
      } catch {
        setError(t(`حُفظت الفاتورة ${saved.invoice_number} بنجاح، لكن تعذر تحميل تفاصيل الطباعة. يمكنك فتحها من سجل الفواتير.`, `Invoice ${saved.invoice_number} was saved, but its print details could not be loaded. Open it from the invoice register.`));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('تعذر حفظ الفاتورة','Could not save the invoice'));
    } finally { setSaving(false); }
  };

  const useCashForRemaining = () => { setCashAmount(minorText(totals.total > cardMinor ? totals.total - cardMinor : 0n)); };
  const useCardForRemaining = () => { setCardAmount(minorText(totals.total > cashMinor + customMinor ? totals.total - cashMinor - customMinor : 0n)); };
  const useCustomForRemaining = () => { setCustomAmount(minorText(totals.total > cashMinor + cardMinor ? totals.total - cashMinor - cardMinor : 0n)); };

  return <section className="pos-page">
    <header className="pos-heading">
      <div><div className="eyebrow"><span className="eyebrow-star">✦</span>{t('التشغيل · نقطة البيع','OPERATIONS · CASHIER')}</div><h1>{t('نقطة البيع','Point of sale')}<span className="heading-period">.</span></h1><p>{t('أضف الأصناف، راجع الضريبة، وسجّل المدفوعات في تدفق واحد.','Build the basket, verify tax, and record tender in one fast flow.')}</p></div>
      <div className="pos-session"><span className={`status-pulse ${demoMode ? 'pulse-amber' : ''}`}/><div><b>{t('الكاشير · الرياض','Cashier · Riyadh')}</b><small>{demoMode ? t('معاينة محفوظة بهذا المتصفح','Saved in this browser') : t('جلسة محلية','Local session')}</small></div></div>
    </header>
    {!demoMode && canSell && <ShiftBar lang={lang}/>}
    {demoMode && <div className="pos-notice preview"><ShoppingBag size={16}/><span>{t('يمكنك تجربة البيع؛ تحفظ الفواتير والمخزون في هذا المتصفح فقط. لا تُرسل مبيعات حقيقية أو بيانات إلى زاتكا.','Try a sale: invoices and stock are saved in this browser only. No real sales or data are sent to ZATCA.')}</span></div>}
    {notice && <div className="pos-notice success"><Check size={16}/><span>{notice}</span></div>}
    {error && <div className="pos-notice error"><span>{error}</span></div>}
    <div className="pos-layout">
      <section className="pos-catalog panel">
        <div className="pos-catalog-heading"><div><span className="eyebrow">{t('كتالوج الأصناف','PRODUCT CATALOG')}</span><h2>{t('اختَر الأصناف','Choose items')}</h2></div><span className="pos-catalog-count">{visibleProducts.length} {t('صنف','items')}</span></div>
        <label className="pos-search"><Search size={17}/><input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('ابحث بالاسم أو رمز الصنف…','Search name or SKU…')} autoComplete="off"/><kbd>Ctrl K</kbd></label>
        <div className="pos-categories" role="tablist">{categoriesToShow.map((item, index) => <button key={item} className={category === item ? 'active' : ''} onClick={() => setCategory(item)}>{item === 'الكل' ? (ar ? item : categoriesEn[0]) : categoryFor(item, ar)}{index === 0 && <span>{products.length}</span>}</button>)}</div>
        {loading ? <div className="pos-empty">{t('جارٍ تحميل كتالوج الأصناف…','Loading product catalog…')}</div> : visibleProducts.length === 0 ? <div className="pos-empty">{products.length ? t('لا توجد أصناف مطابقة للبحث.','No products match this search.') : t('لا توجد أصناف في الكتالوج. أضف منتجات من وحدة المخزون أولًا.','Catalog is empty. Add products in Inventory before opening sales.')}</div> : <div className="pos-product-grid">{visibleProducts.map((product) => <button className="pos-product-card" key={product.id} onClick={() => changeQuantity(product, 1)} disabled={!canSell || Number(product.quantity) <= 0}>
          <span className={`pos-product-art ${product.tint ?? 'teal'}`}><span>{product.symbol ?? '◈'}</span><i>{product.category}</i></span>
          <span className="pos-product-name">{product.name}</span><span className="pos-product-meta">{product.sku} · {t('متوفر','stock')} {product.quantity}</span>
          <span className="pos-product-price">{formatMoney(scaled(product.price), ar)}{product.price_includes_vat && <small>{t('شامل الضريبة','incl. VAT')}</small>}</span>
          <span className="pos-add-mark"><Plus size={15}/></span>
        </button>)}</div>}
      </section>

      <aside className="pos-checkout panel">
        <div className="pos-checkout-heading"><div><span className="eyebrow">{t('معاملة جديدة','NEW TRANSACTION')}</span><h2>{t('سلة البيع','Sale basket')}</h2></div><button className="icon-button" aria-label={t('مسح السلة','Clear basket')} onClick={() => { setCart({}); setCashAmount('0'); setCardAmount('0'); setNotice(''); }} disabled={!canSell || !totals.lines.length}><Trash2 size={16}/></button></div>
        <div className="pos-cart-list">{totals.lines.length === 0 ? <div className="pos-cart-empty"><span className="pos-cart-icon"><ShoppingBag size={21}/></span><b>{t('السلة فارغة','Basket is empty')}</b><small>{t('أضف صنفًا من الكتالوج لبدء البيع.','Add an item from the catalog to start a sale.')}</small></div> : totals.lines.map((line) => <div className="pos-cart-row" key={line.product.id}>
          <div className="pos-cart-symbol">{line.product.symbol ?? <Utensils size={16}/>}</div><div className="pos-cart-description"><b>{line.product.name}</b><small>{formatMoney(scaled(line.product.price), ar)} · {line.product.vat_rate}% {t('ضريبة','VAT')}</small><div className="pos-quantity-control"><button onClick={() => changeQuantity(line.product, -1)} aria-label={t('تقليل الكمية','Decrease quantity')}><Minus size={12}/></button><span>{line.quantity}</span><button onClick={() => changeQuantity(line.product, 1)} aria-label={t('زيادة الكمية','Increase quantity')}><Plus size={12}/></button></div></div><strong>{formatMoney(line.total, ar)}</strong>
        </div>)}</div>
        <div className="pos-discount-field"><label htmlFor="pos-discount"><BadgePercent size={15}/>{t('خصم على السلة','Basket discount')}</label><div><input id="pos-discount" type="number" min="0" max="100" step="0.01" value={discount} onChange={(event) => setDiscount(event.target.value)} disabled={!canSell || !totals.lines.length}/><span>%</span></div></div>
        <div className="pos-total-lines"><div><span>{t('المجموع قبل الخصم','Gross subtotal')}</span><b>{formatMoney(totals.subtotal, ar)}</b></div><div><span>{t('الخصم','Discount')}</span><b className="discount-value">−{formatMoney(totals.discount, ar)}</b></div><div><span>{t('الضريبة','VAT')}</span><b>{formatMoney(totals.vat, ar)}</b></div><div className="pos-grand-total"><span>{t('الإجمالي المستحق','Amount due')}</span><b>{formatMoney(totals.total, ar)}</b></div></div>
        <div className="pos-payment-heading"><span className="eyebrow">{t('توزيع الدفع','PAYMENT SPLIT')}</span><span>{t('ريال سعودي','SAR')}</span></div>
        <label className="pos-invoice-type"><span>{t('نوع الفاتورة', 'Invoice type')}</span><select value={invoiceType} onChange={(event) => setInvoiceType(event.target.value as 'simplified' | 'tax')}><option value="simplified">{t('فاتورة ضريبية مبسطة (للأفراد B2C)', 'Simplified tax invoice (B2C)')}</option><option value="tax">{t('فاتورة ضريبية (للمنشآت B2B)', 'Standard tax invoice (B2B)')}</option></select></label>
        {taxInvoice && <div className="pos-buyer-fields">
          <label><span>{t('اسم المشتري (إجباري)', 'Buyer legal name (required)')}</span><input value={buyerName} maxLength={240} onChange={(event) => setBuyerName(event.target.value)}/></label>
          <label><span>{t('الرقم الضريبي للمشتري (15 رقمًا يبدأ وينتهي بـ 3)', 'Buyer VAT number (15 digits, starts and ends with 3)')}</span><input dir="ltr" inputMode="numeric" value={buyerVat} maxLength={15} onChange={(event) => setBuyerVat(event.target.value.replace(/\D/g, ''))}/></label>
          <label><span>{t('عنوان المشتري', 'Buyer address')}</span><input value={buyerAddress} maxLength={300} onChange={(event) => setBuyerAddress(event.target.value)}/></label>
          {buyerInvalid && <small className="pos-buyer-hint">{t('أدخل اسم المشتري ورقمه الضريبي الصحيح لإصدار فاتورة ضريبية.', 'Enter the buyer name and a valid VAT number to issue a tax invoice.')}</small>}
        </div>}
        <div className="pos-payment-row"><label><Banknote size={15}/>{t('نقدًا','Cash')}</label><input type="number" min="0" step="0.01" inputMode="decimal" aria-label={t('المبلغ النقدي','Cash amount')} value={cashAmount} onChange={(event) => setCashAmount(event.target.value)} onFocus={(event) => event.currentTarget.select()}/><button className="pos-fill-button" onClick={useCashForRemaining}>{t('المبلغ كامل','Full')}</button></div>
        <div className="pos-payment-row"><label><CreditCard size={15}/>{t('بطاقة','Card')}</label><input type="number" min="0" step="0.01" inputMode="decimal" aria-label={t('مبلغ البطاقة','Card amount')} value={cardAmount} onChange={(event) => setCardAmount(event.target.value)} onFocus={(event) => event.currentTarget.select()}/><button className="pos-fill-button" onClick={useCardForRemaining}>{t('المبلغ كامل','Full')}</button></div>
        {selectedCustomMethod && <div className="pos-payment-row"><label><WalletCards size={15}/>{ar ? selectedCustomMethod.labelAr : selectedCustomMethod.labelEn}</label><input type="number" min="0" step="0.01" inputMode="decimal" aria-label={ar ? selectedCustomMethod.labelAr : selectedCustomMethod.labelEn} value={customAmount} onChange={(event) => setCustomAmount(event.target.value)} onFocus={(event) => event.currentTarget.select()}/><button className="pos-fill-button" onClick={useCustomForRemaining}>{t('المبلغ كامل','Full')}</button></div>}
        {paymentMethods.filter((method) => !['cash', 'card'].includes(method.code)).length > 1 && <label className="pos-payment-method-select"><span>{t('طريقة إضافية', 'Additional method')}</span><select value={selectedPaymentMethod} onChange={(event) => { setSelectedPaymentMethod(event.target.value); setCustomAmount('0'); }}>{paymentMethods.filter((method) => !['cash', 'card'].includes(method.code)).map((method) => <option key={method.code} value={method.code}>{ar ? method.labelAr : method.labelEn}</option>)}</select></label>}
        <div className={`pos-payment-balance ${invalidPayment || invalidDiscount ? 'has-error' : ''}`}><span>{invalidDiscount ? t('الخصم الأقصى ١٠٠٪','Discount limit is 100%') : invalidPayment ? t('الزيادة تكون نقدًا فقط','Change is cash-only') : due > 0n ? t('متبقي غير محصّل','Balance remaining') : t('الباقي للعميل','Change due')}</span><b>{formatMoney(invalidPayment ? 0n : due > 0n ? due : change, ar)}</b></div>
        <button className="button button-primary pos-complete" onClick={checkout} disabled={!canSell || !totals.lines.length || tendered === 0n || invalidPayment || invalidDiscount || buyerInvalid || saving}><WalletCards size={17}/>{saving ? t('جارٍ تسجيل البيع…','Recording sale…') : demoMode ? t('معاينة الدفع','Preview checkout') : t('تسجيل البيع','Record sale')}</button>
        <small className="pos-server-note">{demoMode ? t('المعاينة لا تنشئ معاملة فعلية.','Preview does not create a real transaction.') : t('يعيد الخادم احتساب السعر والضريبة من سجل الصنف قبل الحفظ.','Server rechecks catalog prices and tax before commit.')}</small>
      </aside>
    </div>
    {receipt && <InvoiceReceipt invoice={receipt.invoice} qrBase64={receipt.qrBase64} qrDisclaimer={receipt.qrDisclaimer} sellerName={receipt.sellerName} vatNumber={receipt.vatNumber} lang={lang} demoMode={receipt.demoMode} onClose={() => setReceipt(null)}/>}
  </section>;
}
