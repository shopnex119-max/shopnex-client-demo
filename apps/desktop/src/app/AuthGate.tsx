import { useState, type FormEvent } from 'react';
import { AlertTriangle, ArrowUpLeft, Eye, EyeOff, KeyRound, LockKeyhole, ShieldCheck, Sparkles, UserRound } from 'lucide-react';
import { createOwner, login, setAccessToken, type UserProfile } from './api';
import type { AppLanguage } from './types';

export default function AuthGate({ mode, lang, onSuccess, onDemo, allowDemo = true }: {
  mode: 'setup' | 'login'; lang: AppLanguage; onSuccess: (profile: UserProfile) => void; onDemo: () => void; allowDemo?: boolean;
}) {
  const ar = lang === 'ar';
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const setup = mode === 'setup';

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError('');
    if (setup && password !== confirm) { setError(ar ? 'كلمتا المرور غير متطابقتين.' : 'Passwords do not match.'); return; }
    if (password.length < 12) { setError(ar ? 'استخدم كلمة مرور من ١٢ حرفًا على الأقل.' : 'Use a password with at least 12 characters.'); return; }
    setBusy(true);
    try {
      const result = setup
        ? await createOwner({ username, password, display_name: displayName || username })
        : await login({ username, password });
      setAccessToken(result.access_token);
      onSuccess({ user_id: result.user_id, username: result.username, display_name: result.display_name, role: result.role, permissions: result.permissions });
    } catch (e) {
      setError(e instanceof Error ? e.message : (ar ? 'تعذر إكمال العملية.' : 'Could not complete the request.'));
    } finally { setBusy(false); }
  };
  const t = (a: string, e: string) => ar ? a : e;
  return <main className="auth-screen" dir={ar ? 'rtl' : 'ltr'} lang={lang}>
    <div className="auth-nebula auth-nebula-a"/><div className="auth-nebula auth-nebula-b"/><div className="auth-stars"/>
    <div className="auth-brand"><span className="auth-brand-mark"><i/><b/><em/></span><div><strong>SHOPNEX</strong><small>ULTIMATE · BUSINESS OS</small></div></div>
    <section className="auth-card">
      <div className="auth-icon"><LockKeyhole size={21}/></div>
      <span className="eyebrow"><Sparkles size={12}/>{setup ? t('إعداد مساحة عمل محلية','LOCAL WORKSPACE SETUP') : t('مصادقة محلية','LOCAL AUTHENTICATION')}</span>
      <h1>{setup ? t('ابدأ مدارتك','Start your orbit') : t('مرحبًا بعودتك','Welcome back')}<i>.</i></h1>
      <p className="auth-intro">{setup ? t('أنشئ حساب المالك الأول. كلمة المرور تُحفظ بتجزئة Argon2id على هذا الجهاز.','Create the first owner account. Your password is stored as an Argon2id hash on this device.') : t('سجّل الدخول إلى مساحة عمل SHOPNEX المحلية.','Sign in to your local SHOPNEX workspace.')}</p>
      <form onSubmit={submit} className="auth-form">
        {setup && <label><span>{t('اسم العرض','Display name')}</span><div className="auth-input"><UserRound size={15}/><input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder={t('الاسم أو اسم المنشأة','Your name or company')} autoComplete="name" maxLength={200}/></div></label>}
        <label><span>{t('اسم المستخدم','Username')}</span><div className="auth-input"><UserRound size={15}/><input value={username} onChange={(e) => setUsername(e.target.value)} placeholder={t('اسم مستخدم محلي','Local username')} autoComplete="username" minLength={3} maxLength={120} required/></div></label>
        <label><span>{t('كلمة المرور','Password')}{setup && <small>{t('١٢ حرفًا على الأقل','12+ characters')}</small>}</span><div className="auth-input"><KeyRound size={15}/><input type={visible ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={setup ? 'new-password' : 'current-password'} minLength={12} maxLength={256} required/><button type="button" className="auth-visibility" onClick={() => setVisible(!visible)} aria-label={t('إظهار كلمة المرور','Show password')}>{visible ? <EyeOff size={15}/> : <Eye size={15}/>}</button></div></label>
        {setup && <label><span>{t('تأكيد كلمة المرور','Confirm password')}</span><div className="auth-input"><KeyRound size={15}/><input type={visible ? 'text' : 'password'} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" minLength={12} maxLength={256} required/></div></label>}
        {error && <div className="auth-error"><AlertTriangle size={15}/><span>{error}</span></div>}
        <button className="button button-primary auth-submit" disabled={busy}>{busy ? t('جارٍ التحقق…','Verifying…') : setup ? t('إنشاء حساب المالك','Create owner account') : t('تسجيل الدخول','Sign in')}<ArrowUpLeft size={15}/></button>
      </form>
      <div className="auth-trust"><ShieldCheck size={15}/><span>{t('الحساب محلي. لا مزامنة أو نقل إلى السحابة.','Local account. No cloud sync or transfer.')}</span></div>
      {allowDemo && <button className="auth-demo-button" onClick={onDemo}>{t('متابعة بعرض تجريبي فقط','Continue in demo mode only')}</button>}
    </section>
    <footer className="auth-footer">SHOPNEX ULTIMATE <i>·</i> {t('تشغيل محلي أولًا','LOCAL-FIRST')}</footer>
  </main>;
}
