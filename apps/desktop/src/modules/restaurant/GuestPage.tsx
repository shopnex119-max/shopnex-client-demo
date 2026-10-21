import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Clock3, Minus, Plus, ShoppingBag, UtensilsCrossed } from 'lucide-react';
import type { AppLanguage } from '../../app/types';
import { createModuleRecord } from '../../app/api';
import { formatMinor, parseMinor, toDecimalString } from '../../app/finance';

const menu = [
  { id: 'burger', ar: 'برجر لحم كلاسيكي', en: 'Classic beef burger', descriptionAr: 'لحم مشوي، جبنة شيدر، خس وصلصة البيت', descriptionEn: 'Grilled beef, cheddar, lettuce and house sauce', price: '32.00', category: 'وجبات', categoryEn: 'Mains', symbol: '🍔', color: 'rose', prep: '١٢–١٥ دقيقة' },
  { id: 'pizza', ar: 'بيتزا مارغريتا', en: 'Margherita pizza', descriptionAr: 'طماطم طازجة، موزاريلا وريحان', descriptionEn: 'Fresh tomato, mozzarella and basil', price: '38.00', category: 'وجبات', categoryEn: 'Mains', symbol: '🍕', color: 'amber', prep: '١٥–٢٠ دقيقة' },
  { id: 'coffee', ar: 'قهوة اليوم', en: 'Coffee of the day', descriptionAr: 'قهوة محمصة بعناية، تحضير طازج', descriptionEn: 'Carefully roasted, freshly prepared', price: '18.00', category: 'مشروبات', categoryEn: 'Drinks', symbol: '☕', color: 'coffee', prep: '٤–٦ دقائق' },
  { id: 'fries', ar: 'بطاطس مقرمشة', en: 'Crispy fries', descriptionAr: 'بطاطس ذهبية مع بهارات خاصة', descriptionEn: 'Golden fries with house seasoning', price: '12.00', category: 'إضافات', categoryEn: 'Sides', symbol: '🍟', color: 'gold', prep: '٦–٨ دقائق' },
  { id: 'cake', ar: 'كيك الشوكولاتة', en: 'Chocolate cake', descriptionAr: 'كاكاو غني وكريمة مخفوقة', descriptionEn: 'Rich cocoa with whipped cream', price: '22.00', category: 'حلويات', categoryEn: 'Desserts', symbol: '🍰', color: 'violet', prep: 'جاهز للتقديم' },
  { id: 'salad', ar: 'سلطة الحديقة', en: 'Garden salad', descriptionAr: 'خضروات طازجة وصلصة ليمون', descriptionEn: 'Fresh greens with lemon dressing', price: '16.00', category: 'إضافات', categoryEn: 'Sides', symbol: '🥗', color: 'green', prep: '٥–٧ دقائق' },
];

type Basket = Record<string, number>;

export default function GuestPage({ lang, demoMode }: { lang: AppLanguage; demoMode: boolean }) {
  const ar = lang === 'ar';
  const t = (a: string, e: string) => ar ? a : e;
  const [category, setCategory] = useState('الكل');
  const [basket, setBasket] = useState<Basket>({});
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [table] = useState('T-08');
  const [orderReference, setOrderReference] = useState('');
  const [error, setError] = useState('');
  const categories = [
    { ar: 'الكل', en: 'All' }, { ar: 'وجبات', en: 'Mains' }, { ar: 'مشروبات', en: 'Drinks' }, { ar: 'إضافات', en: 'Sides' }, { ar: 'حلويات', en: 'Desserts' },
  ];
  const visible = category === 'الكل' ? menu : menu.filter((item) => item.category === category);
  const count = Object.values(basket).reduce((sum, quantity) => sum + quantity, 0);
  const subtotal = useMemo(() => menu.reduce((sum, item) => sum + parseMinor(item.price) * BigInt(basket[item.id] ?? 0), 0n), [basket]);
  const update = (id: string, delta: number) => {
    setSubmitted(false); setOrderReference(''); setError('');
    setBasket((current) => {
      const next = Math.max(0, (current[id] ?? 0) + delta);
      const result = { ...current };
      if (next === 0) delete result[id]; else result[id] = next;
      return result;
    });
  };
  const submit = async () => {
    if (!count || submitting) return;
    setSubmitting(true); setError('');
    const reference = `G-${Date.now().toString(36).toUpperCase()}`;
    try {
      const created = await createModuleRecord('restaurant', {
        type: 'order', order_ref: reference, name: `طلب ${reference}`, location: `طاولة ${table} · شاشة الضيف`,
        amount: toDecimalString(subtotal), status: 'new', priority: 'normal', source: demoMode ? 'guest-browser-preview' : 'guest-screen',
        items: menu.filter((item) => basket[item.id]).map((item) => ({ name: item.ar, quantity: basket[item.id], note: '' })),
      });
      setOrderReference(String(created.data.order_ref ?? reference));
      setSubmitted(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('تعذر إرسال الطلب إلى شاشة المطبخ.', 'Could not send the order to the kitchen display.'));
    } finally { setSubmitting(false); }
  };

  return <section className="guest-page">
    <header className="guest-header"><div className="guest-brand"><span className="guest-brand-symbol"><UtensilsCrossed size={20}/></span><div><strong>SHOPNEX <span>TABLE</span></strong><small>{t('مطعم المدار · الرياض', 'ORBIT RESTAURANT · RIYADH')}</small></div></div><div className="guest-table"><span>{t('طاولتك', 'YOUR TABLE')}</span><b>{table}</b><i/></div></header>
    <div className="guest-welcome"><div><span className="eyebrow">{t('أهلًا بك في مطعم المدار', 'WELCOME TO ORBIT')}</span><h1>{t('نكهات تستحق', 'Good food,')}<br/><em>{t('التجربة.', 'worth sharing.')}</em></h1><p>{t('اختر من قائمتنا وسيصل طلبك إلى طابور المطبخ في مساحة المعاينة.', 'Choose from the menu and send your ticket to this preview’s kitchen queue.')}</p></div><div className="guest-welcome-art"><span>✦</span><span>☕</span><i/></div></div>
    <div className="guest-categories" role="tablist">{categories.map((item) => <button key={item.ar} className={category === item.ar ? 'active' : ''} onClick={() => setCategory(item.ar)}>{ar ? item.ar : item.en}</button>)}</div>
    <div className="guest-body"><div className="guest-menu-grid">{visible.map((item) => <article className="guest-menu-card" key={item.id}><div className={`guest-dish-art ${item.color}`}><span>{item.symbol}</span><i>{t('مُحضّر طازجًا', 'FRESHLY MADE')}</i></div><div className="guest-dish-copy"><div><span className="guest-category-label">{ar ? item.category : item.categoryEn}</span><h2>{ar ? item.ar : item.en}</h2><p>{ar ? item.descriptionAr : item.descriptionEn}</p></div><div className="guest-dish-bottom"><b>{item.price} <small>{t('ر.س', 'SAR')}</small></b>{basket[item.id] ? <div className="guest-quantity"><button onClick={() => update(item.id, -1)} aria-label={t('تقليل', 'Decrease')}><Minus size={15}/></button><strong>{basket[item.id]}</strong><button onClick={() => update(item.id, 1)} aria-label={t('زيادة', 'Increase')}><Plus size={15}/></button></div> : <button className="guest-add" onClick={() => update(item.id, 1)}><Plus size={15}/>{t('أضف للطلب', 'Add')}</button>}</div></div></article>)}</div>
      <aside className="guest-order-card"><div className="guest-order-heading"><div><span className="eyebrow">{t('طلبك', 'YOUR ORDER')}</span><h2>{t('السلة', 'Basket')}</h2></div><span className="guest-count">{count}</span></div><div className="guest-order-lines">{count === 0 ? <div className="guest-order-empty"><ShoppingBag size={21}/><span>{t('أضف أول صنف إلى طلبك', 'Add your first menu item')}</span></div> : menu.filter((item) => basket[item.id]).map((item) => <div className="guest-order-line" key={item.id}><span className="guest-order-emoji">{item.symbol}</span><div><b>{ar ? item.ar : item.en}</b><small><Clock3 size={11}/>{item.prep}</small></div><div className="guest-line-price"><strong>{formatMinor(parseMinor(item.price) * BigInt(basket[item.id]), ar)}</strong><span>×{basket[item.id]}</span></div></div>)}</div><div className="guest-order-total"><span>{t('المجموع', 'Subtotal')}</span><b>{formatMinor(subtotal, ar)}</b></div><div className="guest-tax-note">{t('هذه معاينة طلب وليست فاتورة؛ تُحتسب الضريبة عند تسجيل البيع عبر الكاشير.', 'This is an order preview, not an invoice; VAT is calculated when the cashier records a sale.')}</div><button className="guest-submit" disabled={!count || submitting} onClick={() => void submit()}>{submitting ? t('جارٍ الإرسال…', 'Sending…') : submitted ? <><Check size={17}/>{t('تم إرسال الطلب للمطبخ', 'Order sent to kitchen')}</> : <>{t('إرسال الطلب', 'Place order')} {ar ? <ArrowLeft size={17}/> : <ArrowRight size={17}/>}</>}</button>{submitted && <p className="guest-preview-note" role="status">{demoMode ? t(`تذكرة ${orderReference} حُفظت في هذا المتصفح فقط وستظهر في شاشة المطبخ هنا. لم يتم تحصيل مبلغ أو إرسال طلب حقيقي.`, `Ticket ${orderReference} is saved in this browser only and appears on this preview’s kitchen screen. No payment was taken and no live order was sent.`) : t(`تم حفظ تذكرة ${orderReference} في نظام المطعم المحلي؛ لم يتم تحصيل مبلغ.`, `Ticket ${orderReference} was saved to the local restaurant system; no payment was taken.`)}</p>}{error && <p className="guest-preview-note" role="alert">{error}</p>}</aside></div>
    <footer className="guest-footer"><span>SHOPNEX <i>·</i> {t('قائمة رقمية', 'DIGITAL MENU')}</span><span>{t('أخبرنا إن كان لديك أي حساسية غذائية.', 'Please let us know about any food allergies.')}</span></footer>
  </section>;
}
