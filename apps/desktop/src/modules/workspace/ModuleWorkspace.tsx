import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Activity, ChefHat, CirclePlus, Clock3, Gift, Search, Users, UserRoundPlus, Utensils, UserCheck, RefreshCw, Trash2 } from 'lucide-react';
import type { AppLanguage } from '../../app/types';
import { createModuleRecord, deleteModuleRecord, getModuleRecords, updateModuleRecord, type ModuleName, type ModuleRecord } from '../../app/api';

type WorkspaceTab = 'orders' | 'tables' | 'kitchen';
type FieldSpec = { key: string; ar: string; en: string; type?: 'text' | 'number' | 'select'; options?: { value: string; ar: string; en: string }[]; required?: boolean };

const demoRecords: Record<ModuleName, ModuleRecord[]> = { restaurant: [], crm: [], hr: [] };


const copy = {
  restaurant: { ar: 'المطاعم والمطبخ', en: 'Restaurant & kitchen', descriptionAr: 'تابع الطلبات والطاولات وحالة تجهيز المطبخ في مساحة واحدة.', descriptionEn: 'Track orders, tables, and kitchen preparation in one workspace.' },
  crm: { ar: 'CRM والولاء', en: 'CRM & loyalty', descriptionAr: 'نظّم سجل العملاء ونقاط الولاء وشرائح التواصل.', descriptionEn: 'Manage customer records, loyalty points, and customer segments.' },
  hr: { ar: 'الموظفون والموارد البشرية', en: 'People & HR', descriptionAr: 'إدارة دليل الموظفين وأقسامهم وحالة العمل الأساسية.', descriptionEn: 'Manage the employee directory, departments, and basic work status.' },
} as const;

function text(value: unknown) { return value === undefined || value === null ? '' : String(value); }

export default function ModuleWorkspace({ module, lang, demoMode, canManage = false }: { module: ModuleName; lang: AppLanguage; demoMode: boolean; canManage?: boolean }) {
  const ar = lang === 'ar';
  const t = (a: string, e: string) => ar ? a : e;
  const [records, setRecords] = useState<ModuleRecord[]>([]);
  const [tab, setTab] = useState<WorkspaceTab>('orders');
  const [query, setQuery] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(!demoMode);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setError('');
    if (demoMode) {
      setRecords(demoRecords[module].map((record) => ({ ...record, data: { ...record.data } })));
      setLoading(false);
      return () => { active = false; };
    }
    setLoading(true);
    getModuleRecords(module).then((items) => { if (active) setRecords(items); })
      .catch((e: unknown) => { if (active) setError(e instanceof Error ? e.message : t('تعذر تحميل البيانات.','Could not load records.')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [module, demoMode]);

  const moduleRecords = useMemo(() => records.filter((record) => {
    if (module === 'restaurant') return record.data.type === (tab === 'tables' ? 'table' : 'order');
    return true;
  }), [records, module, tab]);
  const visible = useMemo(() => moduleRecords.filter((record) => JSON.stringify(record.data).toLowerCase().includes(query.toLowerCase())), [moduleRecords, query]);

  const fields: FieldSpec[] = module === 'restaurant'
    ? tab === 'tables'
      ? [
        { key: 'name', ar: 'اسم الطاولة', en: 'Table name', required: true },
        { key: 'seats', ar: 'عدد المقاعد', en: 'Seats', type: 'number', required: true },
        { key: 'status', ar: 'الحالة', en: 'Status', type: 'select', options: [{ value: 'available', ar: 'متاحة', en: 'Available' }, { value: 'occupied', ar: 'مشغولة', en: 'Occupied' }] },
      ]
      : [
        { key: 'name', ar: 'رقم / اسم الطلب', en: 'Order reference', required: true },
        { key: 'location', ar: 'الطاولة أو نوع الطلب', en: 'Table or order type', required: true },
        { key: 'amount', ar: 'الإجمالي (ر.س)', en: 'Total (SAR)', type: 'number', required: true },
      ]
    : module === 'crm'
      ? [
        { key: 'name', ar: 'اسم العميل', en: 'Customer name', required: true },
        { key: 'phone', ar: 'رقم الجوال', en: 'Phone number', required: true },
        { key: 'email', ar: 'البريد الإلكتروني', en: 'Email' },
        { key: 'segment', ar: 'شريحة العميل', en: 'Customer segment', type: 'select', options: [{ value: 'new', ar: 'جديد', en: 'New' }, { value: 'regular', ar: 'دائم', en: 'Regular' }, { value: 'vip', ar: 'مميز', en: 'VIP' }] },
      ]
      : [
        { key: 'name', ar: 'اسم الموظف', en: 'Employee name', required: true },
        { key: 'role', ar: 'المسمى الوظيفي', en: 'Job title', required: true },
        { key: 'department', ar: 'القسم', en: 'Department', required: true },
        { key: 'phone', ar: 'رقم الجوال', en: 'Phone number' },
      ];

  const saveRecord = async (data: Record<string, unknown>, existing?: ModuleRecord): Promise<boolean> => {
    setBusy(true); setError(''); setNotice('');
    try {
      if (demoMode) {
        setRecords((current) => existing
          ? current.map((item) => item.id === existing.id ? { ...item, data: { ...item.data, ...data } } : item)
          : [{ id: `demo-${Date.now()}`, module, data, created_at: '', updated_at: '' }, ...current]);
        setNotice(t('تم تحديث عرض تجريبي فقط؛ لن تُحفظ البيانات بعد إغلاق البرنامج.','Preview updated only; changes are not saved after closing the app.'));
        return true;
      } else if (existing) {
        const updated = await updateModuleRecord(module, existing.id, data);
        setRecords((current) => current.map((item) => item.id === updated.id ? updated : item));
        setNotice(t('تم حفظ التحديث.','Changes saved.'));
      } else {
        const created = await createModuleRecord(module, data);
        setRecords((current) => [created, ...current]);
        setNotice(t('تمت إضافة السجل وحفظه محليًا.','Record added and saved locally.'));
      }
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : t('تعذر حفظ السجل.','Could not save the record.'));
      return false;
    } finally { setBusy(false); }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const data: Record<string, unknown> = Object.fromEntries(form.entries());
    if (module === 'restaurant') {
      if (tab === 'tables') { data.type = 'table'; data.seats = Number(data.seats || 2); data.status ||= 'available'; }
      else { data.type = 'order'; data.amount = Number(data.amount || 0).toFixed(2); data.status = 'new'; }
    } else if (module === 'crm') { data.points = 0; data.total_spend = '0.00'; }
    else { data.status = 'active'; }
    const saved = await saveRecord(data);
    if (saved) { setFormOpen(false); formElement.reset(); }
  };

  const updateStatus = async (record: ModuleRecord, next: string) => saveRecord({ ...record.data, status: next }, record);
  const addPoints = async (record: ModuleRecord) => saveRecord({ ...record.data, points: Number(record.data.points || 0) + 10 }, record);
  const deleteRecord = async (record: ModuleRecord) => {
    if (!canManage || !window.confirm(t('هل تريد حذف هذا السجل نهائيًا؟', 'Delete this record permanently?'))) return;
    setBusy(true); setError(''); setNotice('');
    try {
      if (!demoMode) await deleteModuleRecord(module, record.id);
      setRecords((current) => current.filter((item) => item.id !== record.id));
      setNotice(t('تم حذف السجل بصلاحية المدير.', 'Record deleted with administrator permission.'));
    } catch (e) { setError(e instanceof Error ? e.message : t('تعذر حذف السجل.', 'Could not delete the record.')); }
    finally { setBusy(false); }
  };
  const title = copy[module];
  const orders = records.filter((record) => record.data.type === 'order');
  const tables = records.filter((record) => record.data.type === 'table');
  const occupied = tables.filter((record) => record.data.status === 'occupied').length;
  const totalPoints = records.reduce((sum, record) => sum + Number(record.data.points || 0), 0);
  const activeStaff = records.filter((record) => record.data.status === 'active').length;

  return <section className="module-workspace">
    <div className="page-heading-row">
      <div><div className="eyebrow"><span className="eyebrow-star">✦</span>{t('مساحة العمل · الوحدات','WORKSPACE · MODULES')}</div><h1>{t(title.ar, title.en)}<span className="heading-period">.</span></h1><p>{t(title.descriptionAr, title.descriptionEn)}</p></div>
      <div className="heading-actions"><span className={`demo-pill ${demoMode ? '' : 'module-live-pill'}`}><i/>{demoMode ? t('عرض تجريبي','DEMO PREVIEW') : t('بيانات محلية','LOCAL DATA')}</span><button className="button button-primary" onClick={() => setFormOpen((open) => !open)}><CirclePlus size={15}/>{module === 'restaurant' ? t(tab === 'tables' ? 'إضافة طاولة' : 'طلب جديد', tab === 'tables' ? 'Add table' : 'New order') : module === 'crm' ? t('إضافة عميل','Add customer') : t('إضافة موظف','Add employee')}</button></div>
    </div>

    {demoMode && <div className="module-notice preview"><Activity size={16}/><span>{t('هذه بيانات للعرض فقط. سجّل الدخول إلى مساحة العمل المحلية لحفظ السجلات في قاعدة بياناتك.','This is preview data only. Sign in to the local workspace to save records to your database.')}</span></div>}
    {notice && <div className={`module-notice ${demoMode ? 'preview' : 'success'}`}><UserCheck size={16}/><span>{notice}</span></div>}
    {error && <div className="module-notice error"><RefreshCw size={16}/><span>{error}</span><button className="button button-outline compact" onClick={() => window.location.reload()}>{t('إعادة التحميل','Reload')}</button></div>}

    <div className="module-summary-grid">
      {module === 'restaurant' ? <>
        <article className="panel module-summary-card"><span className="metric-icon teal"><Utensils size={17}/></span><span className="eyebrow">{t('الطلبات المفتوحة','OPEN ORDERS')}</span><b>{orders.filter((r) => r.data.status !== 'served').length}</b><small>{t('طلبات تحتاج متابعة','orders to track')}</small></article>
        <article className="panel module-summary-card"><span className="metric-icon blue"><ChefHat size={17}/></span><span className="eyebrow">{t('قيد التحضير','IN PREPARATION')}</span><b>{orders.filter((r) => r.data.status === 'preparing').length}</b><small>{t('في قائمة المطبخ','in kitchen queue')}</small></article>
        <article className="panel module-summary-card"><span className="metric-icon violet"><Users size={17}/></span><span className="eyebrow">{t('الطاولات المشغولة','OCCUPIED TABLES')}</span><b>{occupied}<small> / {tables.length}</small></b><small>{t('إشغال الطاولات المسجل','recorded table occupancy')}</small></article>
      </> : module === 'crm' ? <>
        <article className="panel module-summary-card"><span className="metric-icon teal"><Users size={17}/></span><span className="eyebrow">{t('العملاء المسجلون','CUSTOMERS')}</span><b>{records.length}</b><small>{t('سجل محلي للعملاء','local customer records')}</small></article>
        <article className="panel module-summary-card"><span className="metric-icon violet"><Gift size={17}/></span><span className="eyebrow">{t('نقاط الولاء','LOYALTY POINTS')}</span><b>{totalPoints.toLocaleString(ar ? 'ar-SA' : 'en-US')}</b><small>{t('رصيد النقاط المسجل','recorded points balance')}</small></article>
        <article className="panel module-summary-card"><span className="metric-icon blue"><UserRoundPlus size={17}/></span><span className="eyebrow">{t('عملاء مميزون','VIP CUSTOMERS')}</span><b>{records.filter((r) => r.data.segment === 'vip').length}</b><small>{t('ضمن شريحة VIP','in the VIP segment')}</small></article>
      </> : <>
        <article className="panel module-summary-card"><span className="metric-icon teal"><Users size={17}/></span><span className="eyebrow">{t('إجمالي الموظفين','EMPLOYEES')}</span><b>{records.length}</b><small>{t('سجل الموظفين المحلي','local staff records')}</small></article>
        <article className="panel module-summary-card"><span className="metric-icon blue"><UserCheck size={17}/></span><span className="eyebrow">{t('على رأس العمل','ACTIVE')}</span><b>{activeStaff}</b><small>{t('موظفون بحالة نشطة','employees marked active')}</small></article>
        <article className="panel module-summary-card"><span className="metric-icon amber"><Clock3 size={17}/></span><span className="eyebrow">{t('في إجازة','ON LEAVE')}</span><b>{records.filter((r) => r.data.status === 'on_leave').length}</b><small>{t('الحالة المسجلة حاليًا','currently recorded status')}</small></article>
      </>}
    </div>

    <article className="panel module-records-panel">
      <div className="panel-heading module-panel-heading"><div><span className="eyebrow">{module === 'restaurant' ? t('التشغيل اليومي','DAILY OPERATIONS') : module === 'crm' ? t('إدارة العلاقات','RELATIONSHIP MANAGEMENT') : t('إدارة الفريق','TEAM MANAGEMENT')}</span><h2>{module === 'restaurant' ? t(tab === 'tables' ? 'الطاولات' : tab === 'kitchen' ? 'قائمة تجهيز المطبخ' : 'الطلبات', tab === 'tables' ? 'Tables' : tab === 'kitchen' ? 'Kitchen queue' : 'Orders') : module === 'crm' ? t('دليل العملاء والولاء','Customer & loyalty directory') : t('دليل الموظفين','Employee directory')}</h2></div>
        <label className="module-search"><Search size={15}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('بحث في السجلات','Search records')}/></label></div>
      {module === 'restaurant' && <div className="module-tabs" role="tablist"><button className={tab === 'orders' ? 'active' : ''} onClick={() => setTab('orders')}>{t('الطلبات','Orders')}</button><button className={tab === 'tables' ? 'active' : ''} onClick={() => setTab('tables')}>{t('الطاولات','Tables')}</button><button className={tab === 'kitchen' ? 'active' : ''} onClick={() => setTab('kitchen')}>{t('المطبخ','Kitchen')}<span>{orders.filter((r) => ['new', 'preparing'].includes(text(r.data.status))).length}</span></button></div>}
      {formOpen && <form className="module-form" onSubmit={submit}><div className="module-form-grid">{fields.map((field) => <label className="module-field" key={field.key}><span>{t(field.ar, field.en)}</span>{field.type === 'select' ? <select name={field.key} defaultValue={field.options?.[0]?.value}>{field.options?.map((option) => <option key={option.value} value={option.value}>{t(option.ar, option.en)}</option>)}</select> : <input name={field.key} type={field.type ?? 'text'} min={field.type === 'number' ? '0' : undefined} step={field.key === 'amount' ? '0.01' : field.key === 'seats' ? '1' : undefined} required={field.required} placeholder={t(field.ar, field.en)}/>}</label>)}</div><div className="module-form-actions"><button type="button" className="button button-outline" onClick={() => setFormOpen(false)}>{t('إلغاء','Cancel')}</button><button className="button button-primary" disabled={busy}>{busy ? t('جارٍ الحفظ…','Saving…') : t('حفظ السجل','Save record')}</button></div></form>}
      {loading ? <div className="module-empty"><RefreshCw className="spin" size={18}/>{t('جارٍ تحميل السجلات…','Loading records…')}</div> : visible.length === 0 ? <div className="module-empty"><span>{t('لا توجد سجلات مطابقة. أضف أول سجل للبدء.','No matching records. Add your first record to get started.')}</span></div> : <div className="module-record-list">
        {visible.map((record) => <ModuleRecordRow key={record.id} record={record} module={module} lang={lang} canManage={canManage} onUpdate={updateStatus} onAddPoints={addPoints} onDelete={deleteRecord}/>) }
      </div>}
      <div className="module-list-footer"><span>{t('السجلات المعروضة','Records shown')}: {visible.length}</span><span>{demoMode ? t('غير محفوظة','not saved') : t('تُحفظ محليًا','saved locally')}</span></div>
    </article>
    {module === 'hr' && <p className="module-footnote">{t('هذه الوحدة توفر دليل الموظفين الأساسي فقط؛ معالجة الرواتب والحضور والمستندات الرسمية ليست ضمن هذا التحديث.','This module provides a basic employee directory only; payroll, attendance, and official records are outside this update.')}</p>}
  </section>;
}

function ModuleRecordRow({ record, module, lang, canManage, onUpdate, onAddPoints, onDelete }: { record: ModuleRecord; module: ModuleName; lang: AppLanguage; canManage: boolean; onUpdate: (record: ModuleRecord, status: string) => void; onAddPoints: (record: ModuleRecord) => void; onDelete: (record: ModuleRecord) => void }) {
  const ar = lang === 'ar';
  const d = record.data;
  const status = text(d.status);
  const t = (a: string, e: string) => ar ? a : e;
  const statusLabel = (value: string) => ({ new: t('جديد','New'), preparing: t('قيد التحضير','Preparing'), ready: t('جاهز','Ready'), served: t('مكتمل','Served'), available: t('متاحة','Available'), occupied: t('مشغولة','Occupied'), active: t('على رأس العمل','Active'), on_leave: t('في إجازة','On leave'), inactive: t('غير نشط','Inactive'), vip: 'VIP', regular: t('دائم','Regular'), new_customer: t('جديد','New') } as Record<string, string>)[value] ?? value;
  const labelClass = ['ready', 'available', 'active', 'served'].includes(status) ? 'green' : ['preparing', 'occupied', 'on_leave'].includes(status) ? 'amber' : 'slate';
  let action: { label: string; next: string } | null = null;
  if (module === 'restaurant' && d.type === 'table') action = { label: t(status === 'occupied' ? 'إتاحة الطاولة' : 'تسجيل إشغال', status === 'occupied' ? 'Mark available' : 'Mark occupied'), next: status === 'occupied' ? 'available' : 'occupied' };
  else if (module === 'restaurant' && status !== 'served') action = { label: t(status === 'new' ? 'بدء التحضير' : status === 'preparing' ? 'تحديد كجاهز' : 'إكمال الطلب', status === 'new' ? 'Start preparation' : status === 'preparing' ? 'Mark ready' : 'Complete order'), next: status === 'new' ? 'preparing' : status === 'preparing' ? 'ready' : 'served' };
  else if (module === 'hr') action = { label: t(status === 'active' ? 'تسجيل إجازة' : 'إعادة إلى العمل', status === 'active' ? 'Mark on leave' : 'Return to work'), next: status === 'active' ? 'on_leave' : 'active' };
  return <div className="module-record-row">
    <div className="module-record-avatar">{module === 'restaurant' ? d.type === 'table' ? <Users size={17}/> : <ChefHat size={17}/> : module === 'crm' ? <Users size={17}/> : <UserCheck size={17}/>}</div>
    <div className="module-record-main"><b>{text(d.name)}</b><span>{module === 'restaurant' ? d.type === 'table' ? t(`${text(d.seats)} مقاعد`, `${text(d.seats)} seats`) : `${text(d.location)}${d.amount ? ` · ${Number(d.amount).toLocaleString(ar ? 'ar-SA' : 'en-US', { minimumFractionDigits: 2 })} ${t('ر.س','SAR')}` : ''}` : module === 'crm' ? `${text(d.phone)}${d.email ? ` · ${text(d.email)}` : ''}` : `${text(d.role)} · ${text(d.department)}${d.phone ? ` · ${text(d.phone)}` : ''}`}</span></div>
    {module === 'crm' && <div className="module-record-extra"><strong>{Number(d.points || 0).toLocaleString(ar ? 'ar-SA' : 'en-US')}</strong><small>{t('نقطة','points')}</small></div>}
    {module === 'crm' && <span className={`status-chip ${d.segment === 'vip' ? 'amber' : d.segment === 'regular' ? 'green' : 'slate'}`}><i/>{statusLabel(text(d.segment) || 'new_customer')}</span>}
    {module !== 'crm' && <span className={`status-chip ${labelClass}`}><i/>{statusLabel(status)}</span>}
    {canManage && (module === 'crm' ? <button className="button button-outline compact" onClick={() => onAddPoints(record)}>{t('+١٠ نقاط','+10 points')}</button> : action && <button className="button button-outline compact" onClick={() => onUpdate(record, action!.next)}>{action.label}</button>)}
    {canManage && <button className="icon-button danger-action" onClick={() => void onDelete(record)} aria-label={t('حذف السجل','Delete record')} title={t('حذف بصلاحية المدير','Delete as administrator')}><Trash2 size={15}/></button>}
  </div>;
}
