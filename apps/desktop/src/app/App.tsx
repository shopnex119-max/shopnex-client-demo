import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import {
  Activity, BarChart3, BriefcaseBusiness, Building2,
  ChefHat, ChevronDown, ChevronLeft, CircleHelp,
  Command, CreditCard, FileText, Globe2, LayoutDashboard, LifeBuoy,
  Menu, Moon, Package, PanelRightClose, PanelRightOpen, Search, Settings2, ShieldCheck,
  ShoppingCart, Sun, UtensilsCrossed, Users, WalletCards, Warehouse, X,
} from 'lucide-react';
import type { AppPage, AppLanguage, PageKey, ThemeMode } from './types';
import { getAuthStatus, isPublicPreview, setAccessToken, type UserProfile } from './api';
import AuthGate from './AuthGate';
import NotificationBell from './NotificationBell';
import SensitiveAccessGate, { type ProtectedPage } from './SensitiveAccessGate';
import Dashboard from '../modules/dashboard/Dashboard';
import ZatcaPage from '../modules/zatca/ZatcaPage';
import OperationsPage from '../modules/sales/OperationsPage';
import InventoryPage from '../modules/inventory/InventoryPage';
import InventoryCountPage from '../modules/inventory/InventoryCountPage';
import SettingsPage from '../modules/setup/SettingsPage';
import UserManagementPage from '../modules/setup/UserManagementPage';
import ModuleWorkspace from '../modules/workspace/ModuleWorkspace';
import PosPage from '../modules/pos/PosPage';
import KitchenPage from '../modules/restaurant/KitchenPage';
import GuestPage from '../modules/restaurant/GuestPage';
import PurchasingPage from '../modules/purchasing/PurchasingPage';
import AccountingPage from '../modules/accounting/AccountingPage';
const ReportsPage = lazy(() => import('../modules/reports/ReportsPage'));

const nav: AppPage[] = [
  { key: 'overview', label: 'نظرة عامة', labelEn: 'Overview', icon: 'dashboard', group: 'مركز القيادة', groupEn: 'Command center', ready: true },
  { key: 'sales', label: 'الكاشير ونقطة البيع', labelEn: 'Cashier & POS', icon: 'pos', group: 'التشغيل', groupEn: 'Operations', ready: true },
  { key: 'invoices', label: 'الفواتير والمبيعات', labelEn: 'Invoices & sales', icon: 'invoice', group: 'التشغيل', groupEn: 'Operations', ready: true },
  { key: 'purchasing', label: 'المشتريات', labelEn: 'Purchasing', icon: 'purchase', group: 'التشغيل', groupEn: 'Operations', ready: true },
  { key: 'inventory', label: 'المخزون والمستودعات', labelEn: 'Inventory & warehouses', icon: 'inventory', group: 'التشغيل', groupEn: 'Operations', ready: true },
  { key: 'inventory-count', label: 'الجرد والتسويات', labelEn: 'Stock count & adjustments', icon: 'inventory', group: 'التشغيل', groupEn: 'Operations', ready: true },
  { key: 'products', label: 'المنتجات', labelEn: 'Products', icon: 'products', group: 'التشغيل', groupEn: 'Operations', ready: true },
  { key: 'customers', label: 'العملاء والموردون', labelEn: 'Customers & suppliers', icon: 'users', group: 'العلاقات', groupEn: 'Relationships', ready: true },
  { key: 'restaurant', label: 'المطاعم والمطبخ', labelEn: 'Restaurant & kitchen', icon: 'kitchen', group: 'الضيافة', groupEn: 'Hospitality', ready: true },
  { key: 'kitchen', label: 'شاشة المطبخ', labelEn: 'Kitchen display', icon: 'kitchen', group: 'الضيافة', groupEn: 'Hospitality', ready: true },
  { key: 'guest', label: 'شاشة الضيف والطلب', labelEn: 'Guest ordering screen', icon: 'guest', group: 'الضيافة', groupEn: 'Hospitality', ready: true },
  { key: 'crm', label: 'CRM والولاء', labelEn: 'CRM & loyalty', icon: 'crm', group: 'العلاقات', groupEn: 'Relationships', ready: true },
  { key: 'accounting', label: 'المحاسبة والضريبة', labelEn: 'Accounting & tax', icon: 'accounting', group: 'المالية', groupEn: 'Finance', ready: true },
  { key: 'zatca', label: 'زاتكا والفوترة', labelEn: 'ZATCA & e-invoicing', icon: 'zatca', group: 'المالية', groupEn: 'Finance', ready: true },
  { key: 'reports', label: 'التقارير والتحليلات', labelEn: 'Reports & analytics', icon: 'reports', group: 'الرؤية', groupEn: 'Insights', ready: true },
  { key: 'hr', label: 'الموظفون والموارد البشرية', labelEn: 'People & HR', icon: 'people', group: 'الإدارة', groupEn: 'Administration', ready: true },
  { key: 'settings', label: 'إعدادات النظام', labelEn: 'System settings', icon: 'settings', group: 'الإدارة', groupEn: 'Administration', ready: true },
  { key: 'users', label: 'المستخدمون والصلاحيات', labelEn: 'Users & permissions', icon: 'users', group: 'الإدارة', groupEn: 'Administration', ready: true },
];

const ADMIN_ROLES = new Set(['super admin', 'company admin', 'admin', 'owner', 'administrator']);
const PAGE_PERMISSION: Partial<Record<PageKey, string>> = {
  overview: 'dashboard.view', sales: 'sales.view', invoices: 'sales.view',
  inventory: 'inventory.view', 'inventory-count': 'inventory.view', products: 'inventory.view',
  purchasing: 'purchasing.view', customers: 'crm.view', crm: 'crm.view',
  restaurant: 'restaurant.view', kitchen: 'restaurant.view', guest: 'restaurant.view',
  accounting: 'accounting.view', zatca: 'zatca.view', reports: 'reports.view', hr: 'hr.view',
  settings: 'settings.view', users: 'users.manage',
};

function isAdministrator(role: string | undefined): boolean {
  return ADMIN_ROLES.has((role ?? '').trim().toLowerCase());
}

function profileHasPermission(profile: UserProfile | null, permission: string): boolean {
  if (!profile) return false;
  if (isAdministrator(profile.role)) return true;
  const grants = new Set(profile.permissions ?? []);
  return grants.has(permission) || (permission.endsWith('.view') && grants.has(`${permission.slice(0, -5)}.manage`));
}

const iconMap: Record<string, typeof LayoutDashboard> = {
  dashboard: LayoutDashboard, pos: CreditCard, invoice: FileText, purchase: ShoppingCart,
  inventory: Warehouse, products: Package, users: Users, kitchen: ChefHat, guest: UtensilsCrossed, crm: BriefcaseBusiness,
  accounting: WalletCards, zatca: ShieldCheck, reports: BarChart3, people: Building2, settings: Settings2,
};

function BrandMark() {
  return <div className="brand-mark" aria-hidden="true"><span className="orbit orbit-a"/><span className="orbit orbit-b"/><span className="brand-core"/></div>;
}

export default function App() {
  const [authMode, setAuthMode] = useState<'checking' | 'setup' | 'login' | 'demo' | 'authenticated'>('checking');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [page, setPage] = useState<PageKey>('overview');
  const [comingPage, setComingPage] = useState<AppPage | null>(null);
  const [lang, setLang] = useState<AppLanguage>('ar');
  const [theme, setTheme] = useState<ThemeMode>('dark');
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [sensitiveUnlockFor, setSensitiveUnlockFor] = useState<ProtectedPage | null>(null);
  const isDesktopApp = Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
  useEffect(() => {
    if (isPublicPreview) { setAuthMode('demo'); return; }
    let active = true;
    getAuthStatus()
      .then((status) => { if (active) setAuthMode(status.setup_required ? 'setup' : 'login'); })
      .catch(() => { if (active) setAuthMode('login'); });
    return () => { active = false; };
  }, [isDesktopApp, isPublicPreview]);
  useEffect(() => { setSensitiveUnlockFor(null); }, [page]);
  const completeSensitiveUnlock = (protectedPage: ProtectedPage, user: UserProfile) => {
    if (!isPublicPreview) {
      setProfile(user);
      setAuthMode('authenticated');
    }
    setSensitiveUnlockFor(protectedPage);
  };
  const isAr = lang === 'ar';
  const t = (ar: string, en: string) => isAr ? ar : en;
  const activePage = useMemo(() => page === 'coming-soon' && comingPage ? comingPage : nav.find((item) => item.key === page && item.ready) ?? nav[0], [page, comingPage]);
  const hasPermission = (permission: string) => authMode === 'demo' || (authMode === 'authenticated' && profileHasPermission(profile, permission));
  const canOpenPage = (key: PageKey) => authMode !== 'authenticated' || (key === 'users' ? isAdministrator(profile?.role) : !PAGE_PERMISSION[key] || hasPermission(PAGE_PERMISSION[key]!));
  const groups = useMemo(() => {
    const filtered = nav.filter((item) => canOpenPage(item.key) && `${item.label} ${item.labelEn}`.toLowerCase().includes(query.toLowerCase()));
    return [...new Set(filtered.map((item) => isAr ? item.group : item.groupEn))].map((group) => ({
      name: group ?? '', items: filtered.filter((item) => (isAr ? item.group : item.groupEn) === group),
    }));
  }, [query, isAr, authMode, profile]);
  useEffect(() => {
    if (authMode === 'authenticated' && !canOpenPage(page)) setPage('overview');
  }, [page, profile, authMode]);

  const choosePage = (item: AppPage) => {
    setSensitiveUnlockFor(null);
    if (!canOpenPage(item.key)) { setMobileOpen(false); return; }
    if (item.ready) setPage(item.key);
    else { setComingPage(item); setPage('coming-soon'); }
    setMobileOpen(false);
  };

  if (authMode === 'checking') return <div className="auth-loading" dir={isAr ? 'rtl' : 'ltr'}><div className="brand-mark"><span className="orbit orbit-a"/><span className="orbit orbit-b"/><span className="brand-core"/></div><span>SHOPNEX</span></div>;
  if (authMode === 'setup' || authMode === 'login') return <AuthGate mode={authMode} lang={lang} onSuccess={(user) => { setProfile(user); setAuthMode('authenticated'); }} onDemo={() => setAuthMode('demo')} allowDemo={false}/>;

  return (
    <div className={`app-shell ${theme}`} dir={isAr ? 'rtl' : 'ltr'} lang={lang}>
      <div className="space-backdrop" aria-hidden="true"><span className="nebula nebula-one"/><span className="nebula nebula-two"/><span className="star-field"/></div>
      <aside className={`sidebar ${collapsed ? 'sidebar-collapsed' : ''} ${mobileOpen ? 'sidebar-mobile-open' : ''}`}>
        <div className="brand-row">
          <BrandMark />
          {!collapsed && <div className="brand-copy"><strong>SHOPNEX</strong><span>ULTIMATE <i>•</i> BUSINESS OS</span></div>}
          <button className="icon-button sidebar-mobile-close" aria-label={t('إغلاق القائمة','Close menu')} onClick={() => setMobileOpen(false)}><X size={18}/></button>
        </div>
        {!collapsed && <button className="workspace-switcher"><span className="workspace-icon"><Building2 size={16}/></span><span className="workspace-copy"><b>SHOPNEX</b><small>{t('مساحة العمل المحلية','Local workspace')}</small></span><ChevronDown size={15}/></button>}
        <div className="sidebar-search"><Search size={15}/>{!collapsed && <input aria-label={t('ابحث في القائمة','Search navigation')} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('بحث سريع','Quick search')} />} {!collapsed && <kbd>⌘ K</kbd>}</div>
        <nav className="nav-scroll" aria-label={t('التنقل الرئيسي','Main navigation')}>
          {groups.map((group) => <div className="nav-group" key={group.name}>
            {!collapsed && <div className="nav-group-title">{group.name}</div>}
            {group.items.map((item, index) => {
              const Icon = iconMap[item.icon] ?? Package;
              const selected = page === item.key && (item.key !== 'coming-soon' || item.label === comingPage?.label);
              return <button className={`nav-item ${selected ? 'nav-item-active' : ''}`} key={`${item.label}-${index}`} onClick={() => choosePage(item)} title={collapsed ? (isAr ? item.label : item.labelEn) : undefined}>
                <Icon size={17} strokeWidth={selected ? 2.1 : 1.75}/>{!collapsed && <><span>{isAr ? item.label : item.labelEn}</span>{item.key === 'zatca' && <span className="nav-dot"/>}{!item.ready && <span className="nav-soon">{t('قريبًا','SOON')}</span>}</>}
              </button>;
            })}
          </div>)}
        </nav>
        <div className="sidebar-bottom">
          {!collapsed && <div className="connection-card"><div className="connection-orb"><Activity size={15}/></div><div><b>{authMode === 'demo' ? t('وضع عرض تجريبي','Demo preview') : t('جلسة محلية','Local session')}</b><span><i className={`status-pulse ${authMode === 'demo' ? 'pulse-amber' : ''}`}/> {authMode === 'demo' ? t('API غير متصلة','API not connected') : t('اتصال محلي محمي','Secured local session')}</span></div></div>}
          {canOpenPage('settings') && <button className="nav-item support-link" onClick={() => setPage('settings')}><LifeBuoy size={17}/>{!collapsed && <span>{t('المساعدة والدعم','Help & support')}</span>}</button>}
          <div className="user-profile"><div className="avatar">{profile?.display_name.slice(0, 1) ?? 'م'}</div>{!collapsed && <div className="user-copy"><b>{profile?.display_name ?? t('وضع العرض التجريبي','Demo mode')}</b><small>{profile?.role ?? 'SHOPNEX · DEMO'}</small></div>}{!collapsed && authMode === 'authenticated' && <button className="icon-button" onClick={() => { setAccessToken(null); setProfile(null); setAuthMode('login'); }} aria-label={t('تسجيل الخروج','Sign out')}><ChevronDown size={15}/></button>}</div>
        </div>
      </aside>
      {mobileOpen && <button className="mobile-scrim" aria-label={t('إغلاق القائمة','Close navigation')} onClick={() => setMobileOpen(false)}/>}
      <main className="main-panel">
        <header className="topbar">
          <div className="topbar-leading">
            <button className="icon-button mobile-menu-button" aria-label={t('فتح القائمة','Open navigation')} onClick={() => setMobileOpen(true)}><Menu size={19}/></button>
            <button className="icon-button collapse-button" aria-label={collapsed ? t('توسيع القائمة','Expand sidebar') : t('طي القائمة','Collapse sidebar')} onClick={() => setCollapsed(!collapsed)}>{collapsed ? <PanelRightOpen size={18}/> : <PanelRightClose size={18}/>}</button>
            <div className="breadcrumb"><span>{t(activePage.group ?? '', activePage.groupEn ?? '')}</span><ChevronLeft size={14}/><strong>{t(activePage.label, activePage.labelEn)}</strong></div>
          </div>
          <div className="topbar-actions">
            <div className="topbar-search"><Search size={16}/><input placeholder={t('ابحث عن فاتورة، منتج، عميل…','Search invoices, products, customers…')} aria-label={t('بحث شامل','Global search')}/><kbd>⌘ K</kbd></div>
            <button className="icon-button language-button" onClick={() => setLang(isAr ? 'en' : 'ar')} title={t('Switch to English','التبديل إلى العربية')}><Globe2 size={17}/><span>{isAr ? 'EN' : 'ع'}</span></button>
            <button className="icon-button theme-button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={t('تغيير المظهر','Switch theme')}>{theme === 'dark' ? <Sun size={17}/> : <Moon size={17}/>}</button>
            <NotificationBell lang={lang} enabled={authMode === 'authenticated'} onNavigate={(target) => { if (canOpenPage(target)) setPage(target); }}/>
            <div className="topbar-divider"/>
            <div className="clock-status"><span className={`clock-indicator ${authMode === 'demo' ? 'pulse-amber' : ''}`}/><span>{authMode === 'demo' ? t('عرض تجريبي','Demo preview') : t('جلسة محلية','Local session')}</span></div>
          </div>
        </header>
        <div className="page-content" key={`${page}-${lang}`}>
          {page === 'overview' && <Dashboard lang={lang} onNavigate={(target) => { if (canOpenPage(target)) setPage(target); }}/>}
          {page === 'zatca' && (authMode === 'demo' || sensitiveUnlockFor === 'zatca' ? <ZatcaPage lang={lang} demoMode={authMode === 'demo'}/> : <SensitiveAccessGate page="zatca" lang={lang} onUnlock={(user) => completeSensitiveUnlock('zatca', user)} onCancel={() => setPage('overview')}/>)}
          {page === 'sales' && <PosPage lang={lang} demoMode={authMode === 'demo'} canSell={hasPermission('sales.create')}/>}
          {page === 'invoices' && <OperationsPage lang={lang} mode="invoices" demoMode={authMode === 'demo'} canManage={hasPermission('sales.create')}/>}
          {page === 'inventory' && <InventoryPage lang={lang} demoMode={authMode === 'demo'} canManage={hasPermission('inventory.manage')}/>}
          {page === 'inventory-count' && <InventoryCountPage lang={lang} demoMode={authMode === 'demo'} canManage={hasPermission('inventory.manage')}/>}
          {page === 'products' && <InventoryPage lang={lang} productsOnly demoMode={authMode === 'demo'} canManage={hasPermission('inventory.manage')}/>}
          {page === 'restaurant' && <ModuleWorkspace module="restaurant" lang={lang} demoMode={authMode === 'demo'} canManage={hasPermission('restaurant.manage')}/>}
          {page === 'kitchen' && <KitchenPage lang={lang} demoMode={authMode === 'demo'}/>}
          {page === 'guest' && <GuestPage lang={lang} demoMode={authMode === 'demo'}/>}
          {page === 'crm' && <ModuleWorkspace module="crm" lang={lang} demoMode={authMode === 'demo'} canManage={hasPermission('crm.manage')}/>}
          {page === 'hr' && <ModuleWorkspace module="hr" lang={lang} demoMode={authMode === 'demo'} canManage={hasPermission('hr.manage')}/>}
          {page === 'settings' && <SettingsPage lang={lang} demoMode={authMode === 'demo'} canReset={authMode === 'demo' || (authMode === 'authenticated' && isAdministrator(profile?.role))} onNavigateToZatca={() => { setSensitiveUnlockFor(null); setPage('zatca'); }} />}
          {page === 'users' && <UserManagementPage lang={lang}/>}
          {page === 'coming-soon' && <ComingSoon lang={lang} title={isAr ? comingPage?.label : comingPage?.labelEn}/>}
          {page === 'purchasing' && <PurchasingPage lang={lang} demoMode={authMode === 'demo'} canManage={hasPermission('purchasing.manage')}/>}
          {page === 'accounting' && <AccountingPage lang={lang} demoMode={authMode === 'demo'} canManage={hasPermission('accounting.manage')}/>}
          <Suspense fallback={page === 'reports' ? <div className="finance-loading">{t('جارٍ تحميل لوحة التحليلات…','Loading analytics dashboard…')}</div> : null}>
            {page === 'reports' && <ReportsPage lang={lang} demoMode={authMode === 'demo'}/>}
          </Suspense>
          {page === 'customers' && <ModuleWorkspace module="crm" lang={lang} demoMode={authMode === 'demo'}/>}
        </div>
        <footer className="app-footer"><span>SHOPNEX ULTIMATE <i>·</i> v0.6.0</span><span>{t('تشغيل محلي، حسابات متعددة، وصلاحيات حسب الدور','Local operation, multiple users, role-based access')} <ShieldCheck size={13}/></span></footer>
      </main>
    </div>
  );
}

function ComingSoon({ lang, title }: { lang: AppLanguage; title?: string }) {
  const isAr = lang === 'ar';
  return <section className="coming-soon-page"><div className="coming-orbit"><Command size={26}/></div><span className="eyebrow">{isAr ? 'وحدة SHOPNEX' : 'SHOPNEX MODULE'}</span><h1>{title ?? (isAr ? 'نوسّع المدار' : 'Expanding the orbit')}</h1><p>{isAr ? 'هذه الوحدة ضمن خارطة SHOPNEX وتُفعّل ضمن مرحلة التوسع القادمة. بياناتك تبقى محلية وآمنة.' : 'This module is on the SHOPNEX roadmap and will be enabled in a future expansion. Your data stays local and secure.'}</p><div className="coming-caption"><CircleHelp size={16}/>{isAr ? 'لا توجد عمليات تجريبية مضللة — كل شيء واضح قبل التفعيل.' : 'No pretend workflows — what is active is clearly marked.'}</div></section>;
}
