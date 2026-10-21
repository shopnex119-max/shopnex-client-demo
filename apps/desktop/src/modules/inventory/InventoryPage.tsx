import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowDownLeft, ArrowUpLeft, Boxes, CircleAlert, Package, Plus, Search, Warehouse } from 'lucide-react';
import type { AppLanguage } from '../../app/types';
import { createProduct, getProducts, type CatalogProduct } from '../../app/api';

type StockFlag = 'متوفر' | 'منخفض' | 'نفد';
type InventoryProduct = { id: string; sku: string; name: string; category: string; qty: number; price: string; averageCost: string; location: string; flag: StockFlag; vatRate: string; taxCategory: string; taxReason: string; includesVat: boolean };

const previewProducts: InventoryProduct[] = [];

function asRow(product: CatalogProduct): InventoryProduct {
  const qty = Number(product.quantity);
  return { id: product.id, sku: product.sku, name: product.name, category: product.category, qty, price: product.price, averageCost: product.average_cost, location: 'المستودع المحلي', flag: qty <= 0 ? 'نفد' : qty <= 10 ? 'منخفض' : 'متوفر', vatRate: product.vat_rate, taxCategory: product.tax_category, taxReason: product.tax_reason, includesVat: product.price_includes_vat };
}

export default function InventoryPage({ lang, productsOnly = false, demoMode, canManage = true }: { lang: AppLanguage; productsOnly?: boolean; demoMode: boolean; canManage?: boolean }) {
  const ar = lang === 'ar';
  const t = (a: string, e: string) => ar ? a : e;
  const [products, setProducts] = useState<InventoryProduct[]>(demoMode ? previewProducts : []);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [formOpen, setFormOpen] = useState(false);
  const [loading, setLoading] = useState(!demoMode);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    if (demoMode) {
      getProducts().then((items) => { if (active) setProducts(items.map(asRow)); })
        .catch(() => { if (active) setProducts(previewProducts); })
        .finally(() => { if (active) setLoading(false); });
      return () => { active = false; };
    }
    setLoading(true);
    getProducts().then((items) => { if (active) setProducts(items.map(asRow)); })
      .catch((e: unknown) => { if (active) setError(e instanceof Error ? e.message : t('تعذر تحميل الأصناف.','Could not load products.')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [demoMode]);

  const visible = useMemo(() => products.filter((product) => `${product.name} ${product.sku} ${product.category}`.toLowerCase().includes(query.toLowerCase()) && (filter === 'all' || (filter === 'low' && product.flag !== 'متوفر') || (filter === 'available' && product.flag === 'متوفر'))), [products, query, filter]);
  const lowStock = products.filter((product) => product.flag === 'منخفض').length;
  const outOfStock = products.filter((product) => product.flag === 'نفد').length;

  const addProduct = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const input = {
      sku: String(data.get('sku') ?? '').trim(),
      name: String(data.get('name') ?? '').trim(),
      category: String(data.get('category') ?? '').trim() || (ar ? 'عام' : 'General'),
      price: String(data.get('price') ?? '0'),
      average_cost: String(data.get('average_cost') ?? '0'),
      vat_rate: String(data.get('vat_rate') ?? '15'),
      tax_category: String(data.get('tax_category') ?? 'standard') as 'standard' | 'zero_rated' | 'exempt' | 'out_of_scope',
      tax_reason: String(data.get('tax_reason') ?? '').trim(),
      quantity: String(data.get('quantity') ?? '0'),
      price_includes_vat: data.get('price_includes_vat') === 'on',
    };
    setSaving(true); setError(''); setNotice('');
    try {
      const created = await createProduct(input);
      setProducts((current) => [asRow(created), ...current]);
      setNotice(demoMode ? t('تم حفظ الصنف في تخزين هذا المتصفح؛ وسيظهر في الكاشير.','Product saved in this browser and will appear in the cashier.') : t('تم حفظ الصنف في قاعدة البيانات المحلية.','Product saved to the local database.'));
      setFormOpen(false); form.reset();
    } catch (e) { setError(e instanceof Error ? e.message : t('تعذر حفظ الصنف.','Could not save product.')); }
    finally { setSaving(false); }
  };

  return <section className="inventory-page">
    <div className="page-heading-row"><div><div className="eyebrow"><span className="eyebrow-star">✦</span>{t('مساحة العمل · المخزون','WORKSPACE · INVENTORY')}</div><h1>{productsOnly ? t('المنتجات والتصنيفات','Products & categories') : t('المخزون والمستودعات','Inventory & warehouses')}<span className="heading-period">.</span></h1><p>{t('أدر كتالوج الأسعار والأرصدة المعتمدة في نقطة البيع.','Manage the product catalog and stock used by the cashier.')}</p></div><div className="heading-actions"><span className={`demo-pill ${demoMode ? '' : 'module-live-pill'}`}><i/>{demoMode ? t('بيانات معاينة','PREVIEW DATA') : t('بيانات محلية','LOCAL DATA')}</span>{canManage && <button className="button button-primary" onClick={() => { setFormOpen((open) => !open); setNotice(''); setError(''); }}><Plus size={15}/>{t('إضافة صنف','Add product')}</button>}</div></div>
    {notice && <div className={`module-notice ${demoMode ? 'preview' : 'success'}`}><Boxes size={15}/><span>{notice}</span></div>}
    {error && <div className="module-notice error"><CircleAlert size={15}/><span>{error}</span></div>}
    {formOpen && canManage && <form className="module-form inventory-product-form" onSubmit={addProduct}><div className="module-form-grid"><label className="module-field"><span>SKU</span><input name="sku" required maxLength={80} placeholder="FD-001"/></label><label className="module-field"><span>{t('اسم الصنف','Product name')}</span><input name="name" required maxLength={240} placeholder={t('مثال: قهوة مختصة','e.g. Specialty coffee')}/></label><label className="module-field"><span>{t('الفئة','Category')}</span><input name="category" maxLength={120} defaultValue="عام"/></label><label className="module-field"><span>{t('سعر البيع (ر.س)','Sales price (SAR)')}</span><input name="price" type="number" min="0" step="0.01" required defaultValue="0.00"/></label><label className="module-field"><span>{t('التكلفة الافتتاحية للوحدة','Opening unit cost')}</span><input name="average_cost" type="number" min="0" step="0.01" required defaultValue="0.00"/></label><label className="module-field"><span>{t('معدل الضريبة %','VAT rate %')}</span><input name="vat_rate" type="number" min="0" max="100" step="0.01" required defaultValue="15.00"/></label><label className="module-field"><span>{t('معالجة الضريبة','Tax treatment')}</span><select name="tax_category" defaultValue="standard"><option value="standard">{t('قياسي','Standard')}</option><option value="zero_rated">{t('صفري','Zero-rated')}</option><option value="exempt">{t('معفى','Exempt')}</option><option value="out_of_scope">{t('خارج النطاق','Out of scope')}</option></select></label><label className="module-field"><span>{t('سبب المعاملة الضريبية','Tax reason')}</span><input name="tax_reason" maxLength={240} placeholder={t('مطلوب عند الإعفاء أو خارج النطاق','Required for exempt / out of scope')}/></label><label className="module-field"><span>{t('الرصيد الافتتاحي','Opening stock')}</span><input name="quantity" type="number" min="0" step="0.001" required defaultValue="0"/></label><label className="module-field inventory-vat-toggle"><input name="price_includes_vat" type="checkbox"/><span>{t('سعر البيع شامل الضريبة','Sales price includes VAT')}</span></label></div><div className="module-form-actions"><button type="button" className="button button-outline" onClick={() => setFormOpen(false)}>{t('إلغاء','Cancel')}</button><button className="button button-primary" disabled={saving}>{saving ? t('جارٍ الحفظ…','Saving…') : t('حفظ الصنف','Save product')}</button></div></form>}
    <div className="operations-summary inventory-summary"><div className="panel ops-summary-card"><span className="metric-icon teal"><Package size={17}/></span><span className="eyebrow">{t('أصناف الكتالوج','CATALOG ITEMS')}</span><b>{products.length.toLocaleString(ar ? 'ar-SA' : 'en-US')}</b><span className="muted-cell">{t('أصناف ظاهرة في النظام','products in this workspace')}</span></div><div className="panel ops-summary-card"><span className="metric-icon amber"><CircleAlert size={17}/></span><span className="eyebrow">{t('رصيد منخفض','LOW STOCK')}</span><b>{lowStock.toLocaleString(ar ? 'ar-SA' : 'en-US')}</b><span className="change-down">{t('عند ١٠ وحدات أو أقل','10 units or less')}</span></div><div className="panel ops-summary-card"><span className="metric-icon blue"><Warehouse size={17}/></span><span className="eyebrow">{t('نفد رصيدها','OUT OF STOCK')}</span><b>{outOfStock.toLocaleString(ar ? 'ar-SA' : 'en-US')}</b><span className="muted-cell">{t('تحتاج إعادة تزويد','needs replenishment')}</span></div></div>
    <article className="panel records-panel"><div className="panel-heading"><div><span className="eyebrow">{t('كتالوج الأصناف','ITEM CATALOG')}</span><h2>{productsOnly ? t('المنتجات','Products') : t('الأصناف والأرصدة','Items & stock')}</h2></div><div className="table-actions"><label className="table-search"><Search size={15}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('ابحث بالاسم أو الرمز','Search name or SKU')}/></label><select className="filter-select" value={filter} onChange={(event) => setFilter(event.target.value)} aria-label={t('تصفية المخزون','Filter inventory')}><option value="all">{t('كل الأصناف','All items')}</option><option value="available">{t('متوفر','Available')}</option><option value="low">{t('منخفض / نافد','Low / out')}</option></select></div></div><div className="invoice-table-wrap"><table className="data-table inventory-table"><thead><tr><th>{t('الصنف','Item')}</th><th>SKU</th><th>{t('الفئة','Category')}</th><th>{t('المتوفر','On hand')}</th><th>{t('التكلفة المتوسطة','Avg. cost')}</th><th>{t('سعر البيع','Sales price')}</th><th>{t('المعالجة الضريبية','Tax')}</th><th>{t('الحالة','Status')}</th><th/></tr></thead><tbody>{visible.map((product) => <tr key={product.id}><td><span className="product-cell-icon"><Package size={15}/></span><b>{product.name}</b></td><td><code>{product.sku}</code></td><td className="muted-cell">{product.category}</td><td className={`stock-cell ${product.flag !== 'متوفر' ? 'stock-low' : ''}`}><b>{product.qty}</b><small> {t('وحدة','units')}</small></td><td className="amount-cell">{product.averageCost} <small>{t('ر.س','SAR')}</small></td><td className="amount-cell">{product.price} <small>{t('ر.س','SAR')}{product.includesVat ? ` · ${t('شامل','incl.')}` : ''}</small></td><td className="muted-cell">{product.taxCategory}{product.taxReason ? ` · ${product.taxReason}` : ''}</td><td><span className={`status-chip ${product.flag === 'متوفر' ? 'green' : product.flag === 'منخفض' ? 'amber' : 'red'}`}><i/>{t(product.flag, product.flag === 'متوفر' ? 'Available' : product.flag === 'منخفض' ? 'Low' : 'Out')}</span></td><td><button className="icon-button row-arrow" aria-label={t('فتح الصنف','Open product')}><ArrowUpLeft size={15}/></button></td></tr>)}</tbody></table>{!loading && visible.length === 0 && <div className="module-empty">{products.length ? t('لا توجد أصناف مطابقة.','No matching products.') : t('لا توجد أصناف بعد. أضف صنفًا للبدء في البيع.','No products yet. Add a product to begin selling.')}</div>}{loading && <div className="module-empty">{t('جارٍ تحميل كتالوج الأصناف…','Loading catalog…')}</div>}</div><div className="table-footer"><span>{ar ? `${visible.length} أصناف معروضة` : `${visible.length} products shown`}</span><div><button className="icon-button" disabled><ArrowDownLeft size={15}/></button><span>1 / 1</span><button className="icon-button" disabled><ArrowUpLeft size={15}/></button></div></div></article>
    <div className="inventory-footnote"><Boxes size={14}/>{demoMode ? t('كتالوج المعاينة محفوظ في هذا المتصفح فقط.','Preview catalog is saved in this browser only.') : t('يقرأ الكاشير الأسعار والضرائب والأرصدة من هذا الكتالوج المحلي.','The cashier reads prices, tax rates, and stock from this local catalog.')}</div>
  </section>;
}
