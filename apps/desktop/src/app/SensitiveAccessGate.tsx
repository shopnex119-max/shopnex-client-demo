import { useState, type FormEvent } from 'react';
import { AlertTriangle, ArrowUpLeft, KeyRound, LockKeyhole, ShieldCheck } from 'lucide-react';
import { isPublicPreview, login, setAccessToken } from './api';
import type { UserProfile } from './api';
import type { AppLanguage, PageKey } from './types';

export type ProtectedPage = Extract<PageKey, 'zatca'>;
const DEMO_PASSWORD_SHA256 = '895b13f1e984a5e710e65ce371fb5ed653359612a16bdf0d14425a4983581cce';

export default function SensitiveAccessGate({
  lang, page, onUnlock, onCancel,
}: {
  lang: AppLanguage;
  page: ProtectedPage;
  onUnlock: (user: UserProfile) => void;
  onCancel: () => void;
}) {
  const ar = lang === 'ar';
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const t = (a: string, e: string) => ar ? a : e;
  const moduleName = page === 'zatca'
    ? t('زاتكا والفوترة الإلكترونية', 'ZATCA & e-invoicing')
    : t('وحدة محمية', 'Protected module');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (isPublicPreview) {
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
        const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
        if (hash !== DEMO_PASSWORD_SHA256) {
          setError(t('كلمة المرور غير صحيحة.', 'Incorrect password.'));
          return;
        }
        setPassword('');
        onUnlock({ user_id: 'demo', username: 'demo', display_name: 'Demo access', role: 'owner', permissions: [] });
        return;
      }
      const result = await login({ username: username.trim(), password });
      setAccessToken(result.access_token);
      setPassword('');
      onUnlock({ user_id: result.user_id, username: result.username, display_name: result.display_name, role: result.role, permissions: result.permissions });
    } catch (e) {
      setError(e instanceof Error ? e.message : t('تعذر التحقق من الحساب.', 'Could not verify the account.'));
    } finally {
      setBusy(false);
    }
  };

  return <section className="sensitive-access-page" dir={ar ? 'rtl' : 'ltr'} lang={lang}>
    <article className="sensitive-access-card panel">
      <span className="sensitive-access-icon"><LockKeyhole size={24}/></span>
      <span className="eyebrow">{t('وحدة محمية بكلمة المرور', 'PASSWORD-PROTECTED MODULE')}</span>
      <h1>{moduleName}<span className="heading-period">.</span></h1>
      <p>{isPublicPreview
        ? t('أدخل كلمة مرور المعاينة لفتح شاشة زاتكا. هذا قفل تجريبي للواجهة فقط؛ يمكن تجاوزه ولا يحمي بيانات حقيقية.', 'Enter the preview password to open ZATCA. This is only a demo UI gate; it can be bypassed and does not protect real data.')
        : t('أعد إدخال بيانات حساب SHOPNEX المحلي للتحقق من هويتك قبل فتح زاتكا. لا تُحفظ كلمة المرور بعد التحقق.', 'Re-enter your local SHOPNEX account credentials to verify your identity before opening ZATCA. The password is not stored after verification.')}</p>
      {isPublicPreview && <div className="sensitive-access-warning"><ShieldCheck size={17}/><span>{t('الموقع العام لا يملك خادم تحقق؛ بيانات الشاشة أمثلة تجريبية فقط. لا تستخدم هذا القفل لحماية سجلات منشأتك.', 'The public site has no authentication server; this screen contains demo examples only. Do not rely on this gate to protect business records.')}</span></div>}
      <form className="sensitive-access-form" onSubmit={submit}>
        {!isPublicPreview && <label className="form-field"><span>{t('اسم المستخدم', 'Username')}</span><input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" minLength={3} maxLength={120} required/></label>}
        <label className="form-field"><span>{isPublicPreview ? t('كلمة المرور', 'Password') : t('كلمة مرور الحساب', 'Account password')}</span><div className="sensitive-password-input"><KeyRound size={15}/><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={isPublicPreview ? 'off' : 'current-password'} minLength={isPublicPreview ? 1 : 12} maxLength={256} required/></div></label>
        {error && <div className="auth-error" role="alert"><AlertTriangle size={15}/><span>{error}</span></div>}
        <button className="button button-primary" disabled={busy}>{busy ? t('جارٍ التحقق…', 'Verifying…') : isPublicPreview ? t('فتح الشاشة', 'Unlock screen') : t('تحقق وافتح الشاشة', 'Verify and open')}<ArrowUpLeft size={15}/></button>
      </form>
      <div className="sensitive-access-actions"><button className="button button-ghost" onClick={onCancel}>{t('العودة للرئيسية', 'Back to overview')}</button></div>
    </article>
  </section>;
}
