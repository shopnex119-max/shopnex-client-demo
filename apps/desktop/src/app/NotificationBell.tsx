import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Bell, CheckCircle2, PackageX, ReceiptText, Wallet } from 'lucide-react';
import { getCurrentShift, getProducts, getZatcaConfig } from './api';
import type { AppLanguage, PageKey } from './types';

type Level = 'danger' | 'warning' | 'info';
type Item = { id: string; level: Level; icon: 'stock' | 'shift' | 'zatca'; title: string; body: string; page: PageKey };

const LOW_STOCK_LIMIT = 5;

export default function NotificationBell({ lang, onNavigate, enabled }: { lang: AppLanguage; onNavigate: (page: PageKey) => void; enabled: boolean }) {
  const ar = lang === 'ar';
  const t = (a: string, e: string) => (ar ? a : e);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const box = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    const next: Item[] = [];
    try {
      const products = await getProducts();
      const active = products.filter((p) => p.active);
      const out = active.filter((p) => Number(p.quantity) <= 0);
      const low = active.filter((p) => Number(p.quantity) > 0 && Number(p.quantity) <= LOW_STOCK_LIMIT);
      if (out.length) next.push({ id: `out-${out.length}`, level: 'danger', icon: 'stock', page: 'inventory',
        title: t(`${out.length} صنف نفد من المخزون`, `${out.length} item(s) out of stock`),
        body: out.slice(0, 3).map((p) => p.name).join('، ') + (out.length > 3 ? '…' : '') });
      if (low.length) next.push({ id: `low-${low.length}`, level: 'warning', icon: 'stock', page: 'inventory',
        title: t(`${low.length} صنف على وشك النفاد`, `${low.length} item(s) running low`),
        body: low.slice(0, 3).map((p) => `${p.name} (${Number(p.quantity)})`).join('، ') + (low.length > 3 ? '…' : '') });
    } catch { /* API unreachable: reported below */ }
    try {
      const shift = await getCurrentShift();
      if (!shift) next.push({ id: 'no-shift', level: 'info', icon: 'shift', page: 'sales',
        title: t('لا توجد وردية مفتوحة', 'No open shift'), body: t('افتح وردية من شاشة الكاشير قبل البيع.', 'Open a shift from the cashier screen before selling.') });
    } catch { /* ignore */ }
    try {
      const z = await getZatcaConfig('sandbox');
      if (!z.configured) next.push({ id: 'zatca', level: 'warning', icon: 'zatca', page: 'zatca',
        title: t('زاتكا غير مُعدّة', 'ZATCA not configured'), body: t('أدخل بيانات المنشأة والرقم الضريبي من شاشة زاتكا.', 'Enter company and VAT details in the ZATCA screen.') });
    } catch { /* ignore */ }
    setItems(next);
  }, [enabled, ar]);

  useEffect(() => { void refresh(); const id = window.setInterval(() => void refresh(), 60000); return () => window.clearInterval(id); }, [refresh]);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const unread = items.filter((i) => !seen.has(i.id)).length;
  const Icon = (i: Item['icon']) => i === 'stock' ? PackageX : i === 'shift' ? Wallet : ReceiptText;

  return <div className="notif-wrap" ref={box}>
    <button className="icon-button notification-button" aria-label={t('الإشعارات', 'Notifications')} onClick={() => { setOpen(!open); if (!open) void refresh(); }}>
      <Bell size={17}/>{unread > 0 && <i/>}
    </button>
    {open && <div className="notif-panel" dir={ar ? 'rtl' : 'ltr'}>
      <div className="notif-head"><b>{t('الإشعارات', 'Notifications')}</b>
        {items.length > 0 && <button className="notif-clear" onClick={() => setSeen(new Set(items.map((i) => i.id)))}>{t('تحديد الكل كمقروء', 'Mark all read')}</button>}</div>
      {items.length === 0 ? <div className="notif-empty"><CheckCircle2 size={20}/>{t('كل شيء على ما يرام', 'All clear')}</div>
        : items.map((i) => { const I = Icon(i.icon); return <button key={i.id} className={`notif-item notif-${i.level} ${seen.has(i.id) ? 'notif-seen' : ''}`}
          onClick={() => { setSeen(new Set([...seen, i.id])); setOpen(false); onNavigate(i.page); }}>
          <span className="notif-ico">{i.level === 'danger' ? <AlertTriangle size={16}/> : <I size={16}/>}</span>
          <span><b>{i.title}</b><small>{i.body}</small></span></button>; })}
    </div>}
  </div>;
}
