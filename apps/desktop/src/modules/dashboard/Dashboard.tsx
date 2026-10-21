import { ArrowDownLeft, ArrowUpLeft, ArrowUpRight, BookOpenCheck, Boxes, CircleAlert, FileCheck2, FileText, Plus, ShieldAlert, ShoppingBag, WalletCards } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { AppLanguage, PageKey } from '../../app/types';

const salesSeries = [{ day: 'السبت', actual: 0, previous: 0 }, { day: 'الأحد', actual: 0, previous: 0 }, { day: 'الإثنين', actual: 0, previous: 0 }, { day: 'الثلاثاء', actual: 0, previous: 0 }, { day: 'الأربعاء', actual: 0, previous: 0 }, { day: 'الخميس', actual: 0, previous: 0 }, { day: 'الجمعة', actual: 0, previous: 0 }];
const recent: { id: string; customer: string; time: string; amount: string; status: string; color: string }[] = [];

function Metric({ icon: Icon, label, value, change, positive, tint }: { icon: typeof FileText; label: string; value: string; change: string; positive?: boolean; tint: string }) {
  return <article className="metric-card glass-card">
    <div className="metric-top"><span className={`metric-icon ${tint}`}><Icon size={18}/></span><span className="metric-period">اليوم <span>·</span> كل الفروع</span></div>
    <div className="metric-label">{label}</div><div className="metric-value">{value}<small> ر.س</small></div>
    <div className={`metric-change ${positive ? 'change-up' : 'change-down'}`}>{positive ? <ArrowUpRight size={14}/> : <ArrowDownLeft size={14}/>}<b>{change}</b><span>مقارنة بالأمس</span></div>
  </article>;
}

export default function Dashboard({ lang, onNavigate }: { lang: AppLanguage; onNavigate: (page: PageKey) => void }) {
  const isAr = lang === 'ar';
  const t = (ar: string, en: string) => isAr ? ar : en;
  return <section className="dashboard-page">
    <div className="page-heading-row">
      <div><div className="eyebrow"><span className="eyebrow-star">✦</span>{t('الخميس، ٢ أكتوبر ٢٠٢٦','THURSDAY, OCTOBER 2, 2026')}</div><h1>{t('صباح الخير، مدير النظام','Good morning, admin')}<span className="heading-period">.</span></h1><p>{t('إليك ملخص الأداء التشغيلي لهذا اليوم.','Here is your operational pulse for today.')}</p></div>
      <div className="heading-actions"><span className="demo-pill"><i/> {t('بيانات تجريبية للعرض','DEMO DATA')}</span><button className="button button-primary" onClick={() => onNavigate('sales')}><Plus size={16}/>{t('عملية جديدة','New transaction')}</button></div>
    </div>
    <div className="metrics-grid">
      <Metric icon={ShoppingBag} label={t('إجمالي المبيعات','Gross sales')} value="0" change="0%" positive tint="teal"/>
      <Metric icon={WalletCards} label={t('صافي الربح','Net profit')} value="0" change="0%" positive tint="violet"/>
      <Metric icon={FileText} label={t('الفواتير الصادرة','Invoices issued')} value="0" change="0" positive tint="blue"/>
      <Metric icon={Boxes} label={t('أصناف منخفضة المخزون','Low stock items')} value="07" change="2 أصناف" tint="amber"/>
    </div>
    <div className="dashboard-main-grid">
      <article className="panel sales-chart-panel">
        <div className="panel-heading"><div><span className="eyebrow">{t('حركة المبيعات','SALES ACTIVITY')}</span><h2>{t('إيقاع الأسبوع','Weekly pulse')}</h2></div><button className="select-button">{t('آخر ٧ أيام','Last 7 days')} <span>⌄</span></button></div>
        <div className="chart-legend"><span><i className="legend-dot legend-current"/>{t('هذا الأسبوع','This week')}</span><span><i className="legend-dot legend-previous"/>{t('الأسبوع السابق','Previous week')}</span><strong>٠ ر.س <small>٠٪</small></strong></div>
        <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><AreaChart data={salesSeries} margin={{ top: 16, right: 4, left: 0, bottom: 0 }}>
          <defs><linearGradient id="salesGlow" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#42dfc7" stopOpacity={0.23}/><stop offset="92%" stopColor="#42dfc7" stopOpacity={0}/></linearGradient></defs>
          <CartesianGrid vertical={false} stroke="rgba(173,194,228,.09)" strokeDasharray="3 5"/>
          <XAxis dataKey={isAr ? 'day' : 'day'} tick={{ fill: '#8290a9', fontSize: 11 }} axisLine={false} tickLine={false} dy={10}/>
          <YAxis orientation={isAr ? 'right' : 'left'} tick={{ fill: '#8290a9', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}k`} width={36}/>
          <Tooltip contentStyle={{ background: '#131d30', border: '1px solid rgba(115,145,186,.25)', borderRadius: 12, color: '#f5f8ff', fontFamily: 'IBM Plex Sans Arabic', direction: isAr ? 'rtl' : 'ltr' }} formatter={(v) => [`${v} ألف ر.س`, '']} labelStyle={{ color: '#96a7c0' }}/>
          <Area type="monotone" dataKey="previous" stroke="#68738a" strokeWidth={1.5} strokeDasharray="4 5" fill="transparent"/>
          <Area type="monotone" dataKey="actual" stroke="#42dfc7" strokeWidth={2.6} fill="url(#salesGlow)" activeDot={{ r: 5, fill: '#42dfc7', stroke: '#0e1523', strokeWidth: 3 }}/>
        </AreaChart></ResponsiveContainer></div>
        <div className="chart-footer"><span>{t('المبيعات تظهر بآلاف الريالات السعودية','Sales shown in thousands of Saudi riyals')}</span><button className="text-button" onClick={() => onNavigate('reports')}>{t('عرض التقرير','View report')} <ArrowUpLeft size={14}/></button></div>
      </article>
      <article className="panel branch-panel">
        <div className="panel-heading"><div><span className="eyebrow">{t('الأداء حسب الفرع','BY LOCATION')}</span><h2>{t('مدارات الفروع','Branch orbit')}</h2></div><button className="more-button" aria-label="more">•••</button></div>
        <div className="branch-orbit-wrap"><div className="branch-orbit"><span className="orbit-ring ring-one"/><span className="orbit-ring ring-two"/><span className="orbit-center"><BuildingIcon/></span><span className="orbit-node node-north"/><span className="orbit-node node-east"/><span className="orbit-node node-west"/><span className="orbit-node node-south"/></div><div className="orbit-caption"><strong>٤</strong><span>{t('فروع نشطة','ACTIVE BRANCHES')}</span></div></div>
        <div className="branch-list"><Branch name="الرياض — العليا" amount="0" share="0%" width="0%" color="aqua"/><Branch name="جدة — الروضة" amount="0" share="0%" width="0%" color="blue"/><Branch name="الدمام — الشاطئ" amount="0" share="0%" width="0%" color="violet"/><Branch name="الخبر — المركز" amount="0" share="0%" width="0%" color="amber"/></div>
      </article>
    </div>
    <div className="dashboard-lower-grid">
      <article className="panel invoices-panel"><div className="panel-heading"><div><span className="eyebrow">{t('آخر النشاطات','LATEST ACTIVITY')}</span><h2>{t('أحدث الفواتير','Recent invoices')}</h2></div><button className="text-button" onClick={() => onNavigate('invoices')}>{t('كل الفواتير','All invoices')}<ArrowUpLeft size={14}/></button></div>
        <div className="invoice-table-wrap"><table className="data-table"><thead><tr><th>{t('رقم الفاتورة','Invoice')}</th><th>{t('العميل','Customer')}</th><th>{t('الوقت','Time')}</th><th>{t('الحالة','Status')}</th><th>{t('الإجمالي','Total')}</th></tr></thead><tbody>{recent.map((row) => <tr key={row.id}><td><b className="mono-cell">{row.id}</b></td><td>{row.customer}</td><td className="muted-cell">{row.time}</td><td><span className={`status-chip ${row.color}`}><i/>{row.status}</span></td><td className="amount-cell">{row.amount} <small>ر.س</small></td></tr>)}</tbody></table></div>
      </article>
      <article className="panel compliance-panel"><div className="panel-heading"><div><span className="eyebrow">{t('الفوترة الإلكترونية','E-INVOICING')}</span><h2>{t('مركز زاتكا','ZATCA center')}</h2></div><button className="round-arrow" onClick={() => onNavigate('zatca')} aria-label={t('فتح زاتكا','Open ZATCA')}><ArrowUpLeft size={17}/></button></div>
        <div className="zatca-status-card"><div className="zatca-emblem"><ShieldAlert size={21}/></div><div className="zatca-status-copy"><b>{t('لم يتم إعداد الربط بعد','Connection not configured')}</b><span>{t('ابدأ بإضافة بيانات المنشأة في وضع الاختبار.','Add company details to start in sandbox.')}</span></div><span className="status-chip amber"><i/>{t('يتطلب إعدادًا','SETUP')}</span></div>
        <div className="compliance-mini-stats"><div><FileCheck2 size={16}/><b>—</b><span>{t('مقبولة','Accepted')}</span></div><div><CircleAlert size={16}/><b>—</b><span>{t('بانتظار الإرسال','Pending')}</span></div><div><FileText size={16}/><b>—</b><span>{t('مرفوضة','Rejected')}</span></div></div>
        <button className="button button-outline full-width" onClick={() => onNavigate('zatca')}>{t('إعداد تكامل زاتكا','Configure ZATCA integration')}<ArrowUpLeft size={15}/></button>
      </article>
    </div>
    <div className="dashboard-footnote"><span><i className="demo-dot"/>{t('الأرقام والبيانات المعروضة توضيحية فقط — ابدأ بإعداد مساحة عملك.','Figures shown are illustrative demo data — configure your workspace to begin.')}</span><span><BookOpenCheck size={14}/>{t('التحديث الأخير قبل لحظات','Updated moments ago')}</span></div>
  </section>;
}

function Branch({ name, amount, share, width, color }: { name: string; amount: string; share: string; width: string; color: string }) {
  return <div className="branch-row"><div className="branch-row-heading"><span><i className={`branch-dot ${color}`}/>{name}</span><b>{amount} <small>ر.س</small></b><em>{share}</em></div><div className="branch-track"><i className={color} style={{ width }}/></div></div>;
}
function BuildingIcon() { return <ShoppingBag size={19} strokeWidth={1.8}/>; }
