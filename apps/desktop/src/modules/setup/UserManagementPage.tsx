import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { BadgeCheck, KeyRound, Pencil, RefreshCw, Save, ShieldCheck, UserPlus, Users, UserX, X } from 'lucide-react';
import type { AppLanguage } from '../../app/types';
import {
  createManagedUser, getManagedUsers, getUserManagementMeta, updateManagedUser,
  type ManagedUser, type PermissionItem, type UserManagementMeta,
} from '../../app/api';

type Props = { lang: AppLanguage };

export default function UserManagementPage({ lang }: Props) {
  const ar = lang === 'ar';
  const t = (a: string, e: string) => ar ? a : e;
  const [meta, setMeta] = useState<UserManagementMeta | null>(null);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('Cashier');
  const [permissions, setPermissions] = useState<string[]>([]);
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = async () => {
    setLoading(true);
    try {
      const [metadata, list] = await Promise.all([getUserManagementMeta(), getManagedUsers()]);
      setMeta(metadata);
      setUsers(list);
      if (!editing) {
        const cashier = metadata.roles.find((item) => item.name === 'Cashier');
        setPermissions(cashier?.permissions ?? []);
      }
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('تعذر تحميل الحسابات.','Could not load user accounts.'));
    } finally { setLoading(false); }
  };

  useEffect(() => { void refresh(); }, []);

  const groupedPermissions = useMemo(() => {
    if (!meta) return [];
    const groupNames: Record<string, [string, string]> = {
      dashboard: ['الرئيسية', 'Dashboard'], sales: ['المبيعات', 'Sales'], inventory: ['المخزون', 'Inventory'],
      purchasing: ['المشتريات', 'Purchasing'], accounting: ['المحاسبة', 'Accounting'], reports: ['التقارير', 'Reports'],
      crm: ['العملاء وCRM', 'Customers & CRM'], restaurant: ['المطعم', 'Restaurant'], hr: ['الموارد البشرية', 'Human resources'],
      zatca: ['الفوترة الإلكترونية', 'E-invoicing'], settings: ['الإعدادات', 'Settings'], users: ['إدارة المستخدمين', 'User management'],
    };
    const groups = new Map<string, PermissionItem[]>();
    for (const item of meta.permissions) groups.set(item.group, [...(groups.get(item.group) ?? []), item]);
    return Array.from(groups.entries()).map(([key, items]) => ({ key, label: groupNames[key]?.[ar ? 0 : 1] ?? key, items }));
  }, [meta, ar]);

  const startEdit = (user: ManagedUser) => {
    setEditing(user); setUsername(user.username); setDisplayName(user.display_name); setPassword('');
    setRole(user.role); setPermissions(user.permissions); setActive(user.active); setNotice(''); setError('');
    document.querySelector('.users-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const resetForm = () => {
    setEditing(null); setUsername(''); setDisplayName(''); setPassword(''); setRole('Cashier'); setActive(true); setNotice(''); setError('');
    const cashier = meta?.roles.find((item) => item.name === 'Cashier');
    setPermissions(cashier?.permissions ?? []);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      let successMessage: string;
      if (editing) {
        await updateManagedUser(editing.id, {
          display_name: displayName.trim(), role, permissions, active,
          ...(password.trim() ? { password } : {}),
        });
        successMessage = t('تم تحديث حساب الموظف.','Employee account updated.');
      } else {
        await createManagedUser({ username: username.trim(), display_name: displayName.trim(), password, role, permissions });
        successMessage = t('تم إنشاء حساب الموظف.','Employee account created.');
      }
      await refresh(); resetForm(); setNotice(successMessage);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('تعذر حفظ الحساب.','Could not save user account.'));
    } finally { setBusy(false); }
  };

  const togglePermission = (key: string) => {
    setPermissions((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key); else next.add(key);
      if (key.endsWith('.manage')) {
        const view = `${key.slice(0, -7)}.view`;
        if (next.has(key)) next.add(view);
      }
      return Array.from(next);
    });
  };

  const toggleActive = async (user: ManagedUser) => {
    try {
      await updateManagedUser(user.id, { active: !user.active });
      setNotice(user.active ? t('تم إيقاف الحساب.','Account disabled.') : t('تم تفعيل الحساب.','Account activated.'));
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : t('تعذر تغيير حالة الحساب.','Could not change account status.')); }
  };

  const activeCount = users.filter((user) => user.active).length;
  return <section className="users-page">
    <div className="page-heading-row">
      <div><div className="eyebrow"><span className="eyebrow-star">✦</span>{t('الإدارة · التحكم في الوصول','ADMINISTRATION · ACCESS CONTROL')}</div>
        <h1>{t('المستخدمون والصلاحيات','Users & permissions')}<span className="heading-period">.</span></h1>
        <p>{t('أنشئ حسابًا مستقلًا لكل موظف، وحدد ما يستطيع مشاهدته أو تعديله. التغييرات تُطبّق مباشرةً على خادم البرنامج المحلي.','Give each employee a separate account, then choose what they can view or change. Permissions are enforced by the local API.')}</p>
      </div>
      <button className="button button-outline" onClick={() => void refresh()} disabled={loading}><RefreshCw size={14}/>{t('تحديث','Refresh')}</button>
    </div>

    <div className="users-summary">
      <article className="panel users-stat"><span className="users-stat-icon"><Users size={18}/></span><div><b>{users.length}</b><small>{t('إجمالي الحسابات','Total accounts')}</small></div></article>
      <article className="panel users-stat"><span className="users-stat-icon users-stat-green"><BadgeCheck size={18}/></span><div><b>{activeCount}</b><small>{t('حسابات نشطة','Active accounts')}</small></div></article>
      <article className="panel users-stat"><span className="users-stat-icon users-stat-amber"><ShieldCheck size={18}/></span><div><b>{t('محلي','Local')}</b><small>{t('دخول دون إنترنت','Offline sign-in')}</small></div></article>
    </div>

    <article className="panel users-editor">
      <div className="panel-heading"><div><span className="eyebrow">{editing ? t('تعديل حساب','EDIT ACCOUNT') : t('حساب جديد','NEW ACCOUNT')}</span><h2>{editing ? editing.display_name : t('إضافة موظف','Add an employee')}</h2></div>
        {editing && <button className="icon-button" title={t('إلغاء التعديل','Cancel editing')} onClick={resetForm}><X size={17}/></button>}
      </div>
      <form onSubmit={save}>
        <div className="users-form-grid">
          <label className="form-field"><span>{t('اسم العرض','Display name')}</span><input required maxLength={200} value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder={t('اسم الموظف','Employee name')}/></label>
          <label className="form-field"><span>{t('اسم المستخدم','Username')}</span><input required minLength={3} maxLength={120} disabled={!!editing} value={username} onChange={(e) => setUsername(e.target.value)} placeholder="cashier01" autoComplete="off"/></label>
          <label className="form-field"><span>{t('الدور','Role')}</span><select value={role} onChange={(e) => { const value = e.target.value; setRole(value); setPermissions(meta?.roles.find((item) => item.name === value)?.permissions ?? []); }}>{(meta?.roles ?? []).map((item) => <option key={item.name} value={item.name}>{roleLabel(item.name, ar)}</option>)}</select></label>
          <label className="form-field"><span>{editing ? t('كلمة مرور جديدة (اتركها فارغة للإبقاء عليها)','New password (leave blank to keep current)') : t('كلمة المرور','Password')}</span><div className="users-password-field"><KeyRound size={15}/><input type="password" required={!editing} minLength={12} maxLength={256} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('١٢ حرفًا على الأقل','At least 12 characters')} autoComplete="new-password"/></div></label>
        </div>
        {editing && <label className="users-active-toggle"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)}/><span>{t('الحساب نشط ويمكنه تسجيل الدخول','Account active and allowed to sign in')}</span></label>}
        <div className="users-permissions-heading"><div><h3>{t('الصلاحيات التفصيلية','Detailed permissions')}</h3><p>{t('صلاحية الإدارة تتضمن العرض تلقائيًا. تغيير الدور يحمّل إعداداته الافتراضية ويمكنك تخصيصها.','Manage permission includes view. Changing the role loads its defaults; customize them below.')}</p></div><span className="users-permission-count">{permissions.length} {t('صلاحية','permissions')}</span></div>
        <div className="users-permission-grid">{groupedPermissions.map((group) => <section className="users-permission-group" key={group.key}><h4>{group.label}</h4>{group.items.map((item) => <label className="users-permission-item" key={item.key}><input type="checkbox" checked={permissions.includes(item.key)} onChange={() => togglePermission(item.key)}/><span>{ar ? item.ar : item.en}</span>{item.key.endsWith('.manage') && <small>{t('إدارة','Manage')}</small>}</label>)}</section>)}</div>
        {error && <div className="finance-alert danger"><span>{error}</span></div>}
        {notice && <div className="finance-alert success"><span>{notice}</span></div>}
        <div className="users-form-actions"><button className="button button-primary" disabled={busy || loading}>{busy ? t('جارٍ الحفظ…','Saving…') : editing ? <><Save size={15}/>{t('حفظ التعديلات','Save changes')}</> : <><UserPlus size={15}/>{t('إنشاء الحساب','Create account')}</>}</button>{editing && <button type="button" className="button button-outline" onClick={resetForm}>{t('إلغاء','Cancel')}</button>}</div>
      </form>
    </article>

    <article className="panel users-list-panel">
      <div className="panel-heading"><div><span className="eyebrow">{t('الحسابات المحلية','LOCAL ACCOUNTS')}</span><h2>{t('فريق العمل','Your team')}</h2></div><span className="users-permission-count">{users.length} {t('مستخدم','users')}</span></div>
      {loading ? <div className="finance-loading">{t('جارٍ تحميل الحسابات…','Loading accounts…')}</div> : users.length === 0 ? <div className="module-empty">{t('لا توجد حسابات بعد. أنشئ أول حساب موظف من النموذج.','No accounts yet. Create the first employee account above.')}</div> : <div className="invoice-table-wrap"><table className="data-table users-table"><thead><tr><th>{t('الموظف','Employee')}</th><th>{t('اسم المستخدم','Username')}</th><th>{t('الدور','Role')}</th><th>{t('الصلاحيات','Permissions')}</th><th>{t('الحالة','Status')}</th><th>{t('إجراءات','Actions')}</th></tr></thead><tbody>{users.map((user) => <tr key={user.id}><td><b>{user.display_name}</b><small className="finance-subcell">{new Date(user.created_at).toLocaleDateString(ar ? 'ar-SA' : 'en-GB')}</small></td><td><code>{user.username}</code></td><td><span className="users-role-chip">{roleLabel(user.role, ar)}</span></td><td>{user.permissions.length}</td><td><span className={`status-chip ${user.active ? 'green' : 'slate'}`}><i/>{user.active ? t('نشط','Active') : t('موقوف','Disabled')}</span></td><td><div className="users-row-actions"><button className="button button-outline compact" onClick={() => startEdit(user)}><Pencil size={13}/>{t('تعديل','Edit')}</button><button className={`button compact ${user.active ? 'button-danger' : 'button-outline'}`} onClick={() => void toggleActive(user)} aria-label={user.active ? t('إيقاف الحساب','Disable account') : t('تفعيل الحساب','Activate account')}>{user.active ? <UserX size={13}/> : <BadgeCheck size={13}/>}</button></div></td></tr>)}</tbody></table></div>}
    </article>
  </section>;
}

function roleLabel(role: string, ar: boolean): string {
  const labels: Record<string, [string, string]> = {
    Administrator: ['مدير النظام', 'Administrator'], Manager: ['مدير', 'Manager'], Accountant: ['محاسب', 'Accountant'],
    Warehouse: ['أمين مخزن', 'Warehouse'], Cashier: ['كاشير', 'Cashier'], Custom: ['مخصص', 'Custom'],
    'Super Admin': ['مدير النظام', 'Administrator'], 'Company Admin': ['مدير المنشأة', 'Company administrator'],
  };
  return labels[role]?.[ar ? 0 : 1] ?? role;
}
