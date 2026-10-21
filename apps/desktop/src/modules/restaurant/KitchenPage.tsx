import { useEffect, useMemo, useState } from 'react';
import { Check, ChefHat, Clock3, Flame, RefreshCw, Utensils, Volume2 } from 'lucide-react';
import type { AppLanguage } from '../../app/types';
import { getModuleRecords, updateModuleRecord, type ModuleRecord } from '../../app/api';

const preview: ModuleRecord[] = [];

const stages = [
  { key: 'new', ar: 'طلبات جديدة', en: 'New orders', color: 'new' },
  { key: 'preparing', ar: 'قيد التحضير', en: 'Preparing', color: 'preparing' },
  { key: 'ready', ar: 'جاهز للتقديم', en: 'Ready to serve', color: 'ready' },
] as const;
function text(value: unknown) { return value === undefined || value === null ? '' : String(value); }

export default function KitchenPage({ lang, demoMode }: { lang: AppLanguage; demoMode: boolean }) {
  const ar = lang === 'ar';
  const t = (a: string, e: string) => ar ? a : e;
  const [records, setRecords] = useState<ModuleRecord[]>(demoMode ? preview : []);
  const [loading, setLoading] = useState(!demoMode);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    let active = true;
    const refresh = () => {
      getModuleRecords('restaurant').then((items) => { if (active) setRecords(items.filter((item) => item.data.type === 'order')); })
        .catch((e: unknown) => { if (active) setError(e instanceof Error ? e.message : 'Could not load orders.'); })
        .finally(() => { if (active) setLoading(false); });
    };
    setLoading(true); refresh();
    if (demoMode) {
      window.addEventListener('storage', refresh);
      window.addEventListener('shopnex:preview-updated', refresh);
      const timer = window.setInterval(refresh, 2500);
      return () => { active = false; window.clearInterval(timer); window.removeEventListener('storage', refresh); window.removeEventListener('shopnex:preview-updated', refresh); };
    }
    return () => { active = false; };
  }, [demoMode]);
  const orders = useMemo(() => records.filter((record) => !['served', 'cancelled'].includes(text(record.data.status))), [records]);
  const update = async (record: ModuleRecord, status: string) => {
    setSaving(record.id); setError(''); setNotice('');
    try {
      const updated = await updateModuleRecord('restaurant', record.id, { ...record.data, status });
      setRecords((current) => current.map((item) => item.id === record.id ? updated : item));
      if (demoMode) setNotice(t('حُفظ تحديث الحالة في هذا المتصفح فقط.','Status update saved in this browser only.'));
    } catch (e) { setError(e instanceof Error ? e.message : t('تعذر تحديث الطلب.','Could not update order.')); }
    finally { setSaving(null); }
  };
  const nextAction = (status: string) => status === 'new' ? { status: 'preparing', ar: 'بدء التحضير', en: 'Start preparing' } : status === 'preparing' ? { status: 'ready', ar: 'جاهز للتقديم', en: 'Mark ready' } : { status: 'served', ar: 'تم التقديم', en: 'Mark served' };
  const timeLabel = (record: ModuleRecord) => record.created_at ? new Intl.DateTimeFormat(ar ? 'ar-SA' : 'en-US', { hour: '2-digit', minute: '2-digit' }).format(new Date(record.created_at)) : t('الآن','Now');

  return <section className="kitchen-page">
    <header className="kitchen-heading"><div><div className="eyebrow"><span className="eyebrow-star">✦</span>{t('التشغيل · شاشة المطبخ','OPERATIONS · KITCHEN DISPLAY')}</div><h1>{t('شاشة المطبخ','Kitchen display')}<span className="heading-period">.</span></h1><p>{t('رتّب الطلبات حسب الأولوية وحالة التحضير.','Keep tickets moving by priority and preparation status.')}</p></div><div className="kitchen-live"><i className={demoMode ? 'offline' : ''}/><span>{demoMode ? t('مزامنة هذا المتصفح','THIS BROWSER') : t('تحديث يدوي','MANUAL REFRESH')}</span><button className="icon-button" title={t('تحديث','Refresh')} onClick={() => { setLoading(true); getModuleRecords('restaurant').then((items) => setRecords(items.filter((item) => item.data.type === 'order'))).catch((e: unknown) => setError(e instanceof Error ? e.message : 'Error')).finally(() => setLoading(false)); }}><RefreshCw size={16}/></button></div></header>
    {demoMode && <div className="kitchen-preview-banner"><ChefHat size={16}/>{t('الطلبات الجديدة من شاشة الضيف والكاشير تظهر هنا. السجل محفوظ بهذا المتصفح فقط، وليس نظام مطعم مباشرًا.','New guest and cashier tickets appear here. Records stay in this browser only; this is not a live restaurant system.')}</div>}
    {notice && <div className="pos-notice preview"><Check size={15}/>{notice}</div>}{error && <div className="pos-notice error">{error}</div>}
    <div className="kitchen-stat-row"><div className="kitchen-stat"><span className="metric-icon amber"><Clock3 size={17}/></span><div><small>{t('طلبات مفتوحة','OPEN TICKETS')}</small><b>{orders.length}</b></div></div><div className="kitchen-stat"><span className="metric-icon blue"><ChefHat size={17}/></span><div><small>{t('قيد التحضير','PREPARING')}</small><b>{orders.filter((order) => order.data.status === 'preparing').length}</b></div></div><div className="kitchen-stat"><span className="metric-icon teal"><Check size={17}/></span><div><small>{t('جاهز للتقديم','READY')}</small><b>{orders.filter((order) => order.data.status === 'ready').length}</b></div></div><div className="kitchen-audio"><Volume2 size={16}/><span>{t('تنبيهات الصوت غير مفعلة','Audio alerts off')}</span></div></div>
    {loading ? <div className="pos-empty">{t('جارٍ تحميل الطلبات…','Loading kitchen tickets…')}</div> : <div className="kitchen-board">{stages.map((stage) => {
      const group = orders.filter((record) => record.data.status === stage.key);
      return <section className={`kitchen-column ${stage.color}`} key={stage.key}><header><div><span className="kitchen-column-dot"/><b>{t(stage.ar, stage.en)}</b></div><span>{group.length}</span></header><div className="kitchen-tickets">{group.length === 0 ? <div className="kitchen-column-empty">{t('لا توجد طلبات','No tickets')}</div> : group.map((record) => {
        const data = record.data;
        const items = Array.isArray(data.items) ? data.items as { name?: string; quantity?: number; note?: string }[] : [];
        const action = nextAction(text(data.status));
        return <article className={`kitchen-ticket ${data.priority === 'urgent' ? 'urgent' : ''}`} key={record.id}><div className="ticket-topline"><b>{text(data.name) || `#${record.id.slice(-4)}`}</b><span className="ticket-time"><Clock3 size={12}/>{timeLabel(record)}</span></div><div className="ticket-location"><Utensils size={13}/>{text(data.location) || t('بدون تحديد طاولة','No table assigned')}{data.priority === 'urgent' && <span className="ticket-urgent"><Flame size={11}/>{t('أولوية','PRIORITY')}</span>}</div><div className="ticket-items">{items.length ? items.map((item, index) => <div className="ticket-item" key={`${record.id}-${index}`}><b>{item.quantity ?? 1}×</b><span>{item.name ?? t('صنف','Item')}</span>{item.note && <small>{item.note}</small>}</div>) : <div className="ticket-no-items">{t('تفاصيل الأصناف غير متاحة لهذا السجل.','Item details are not attached to this ticket.')}</div>}</div><div className="ticket-bottom"><span>{data.amount ? `${text(data.amount)} ${t('ر.س','SAR')}` : t('طلب مطبخ','Kitchen ticket')}</span><button className={`button compact ${stage.key === 'ready' ? 'button-outline' : 'button-primary'}`} disabled={saving === record.id} onClick={() => update(record, action.status)}>{saving === record.id ? t('جارٍ…','Saving…') : t(action.ar, action.en)}</button></div></article>;
      })}</div></section>;
    })}</div>}
  </section>;
}
