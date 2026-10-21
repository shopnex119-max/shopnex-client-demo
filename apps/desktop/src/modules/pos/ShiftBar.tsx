import { useCallback, useEffect, useState } from 'react';
import { Banknote, Check, Plus, X } from 'lucide-react';
import './shift-bar.css';
import type { AppLanguage } from '../../app/types';
import { addCashMovement, closeShift, getCurrentShift, openShift, type ShiftInfo } from '../../app/api';

type Panel = null | 'open' | 'movement' | 'close' | 'report';

const money = (value: string | number | null | undefined, ar: boolean) =>
  `${Number(value ?? 0).toFixed(2)} ${ar ? 'ر.س' : 'SAR'}`;

export default function ShiftBar({ lang }: { lang: AppLanguage }) {
  const ar = lang === 'ar';
  const t = (a: string, e: string) => (ar ? a : e);
  const [shift, setShift] = useState<ShiftInfo | null>(null);
  const [report, setReport] = useState<ShiftInfo | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [amount, setAmount] = useState('0');
  const [movementType, setMovementType] = useState<'cash_in' | 'cash_out'>('cash_out');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');

  const refresh = useCallback(async () => {
    try {
      const result = await getCurrentShift();
      setShift(result.shift);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('تعذر تحميل الوردية.', 'Could not load the shift.'));
    } finally { setLoaded(true); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const openPanel = (next: Panel) => { setPanel(next); setError(''); setAmount('0'); setReason(''); setNotes(''); };
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : t('تعذر تنفيذ العملية.', 'The action failed.')); }
    finally { setBusy(false); }
  };

  const submitOpen = () => run(async () => { setShift(await openShift(amount || '0')); setPanel(null); });
  const submitMovement = () => run(async () => {
    setShift(await addCashMovement({ movement_type: movementType, amount, reason: reason.trim() }));
    setPanel(null);
  });
  const submitClose = () => run(async () => {
    const closed = await closeShift({ counted_cash: amount || '0', notes: notes.trim() });
    setReport(closed); setShift(null); setPanel('report');
  });

  if (!loaded) return null;
  const variance = Number(report?.variance ?? 0);

  return <>
    <div className="shift-bar" role="group" aria-label={t('وردية الكاشير', 'Cashier shift')}>
      {shift ? <>
        <span className="shift-chip shift-open"><Banknote size={14}/>{t(`وردية #${shift.shift_number} مفتوحة`, `Shift #${shift.shift_number} open`)}</span>
        <button className="button" onClick={() => openPanel('movement')}><Plus size={14}/>{t('حركة نقدية', 'Cash in/out')}</button>
        <button className="button" onClick={() => openPanel('close')}>{t('إغلاق الوردية وتسليم الدرج', 'Close shift & hand over')}</button>
      </> : <>
        <span className="shift-chip shift-closed">{t('لا توجد وردية مفتوحة', 'No open shift')}</span>
        <button className="button button-primary" onClick={() => openPanel('open')}>{t('فتح وردية', 'Open shift')}</button>
      </>}
      {error && !panel && <span className="shift-error">{error}</span>}
    </div>

    {panel && <div className="shift-overlay" onMouseDown={() => !busy && panel !== 'report' && setPanel(null)}>
      <section className={`shift-modal ${panel === 'report' ? 'shift-report-print' : ''}`} role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <div className="shift-modal-head">
          <h2>{panel === 'open' ? t('فتح وردية', 'Open shift')
            : panel === 'movement' ? t('حركة نقدية في الدرج', 'Drawer cash movement')
            : panel === 'close' ? t('إغلاق الوردية', 'Close shift')
            : t('تقرير تسليم الدرج', 'Drawer handover report')}</h2>
          <button className="icon-button shift-no-print" aria-label={t('إغلاق', 'Close')} onClick={() => setPanel(null)} disabled={busy}><X size={16}/></button>
        </div>

        {panel === 'open' && <>
          <label className="shift-field"><span>{t('الرصيد الافتتاحي في الدرج (فكة)', 'Opening float in the drawer')}</span>
            <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus/></label>
          <button className="button button-primary" onClick={submitOpen} disabled={busy}><Check size={15}/>{t('ابدأ الوردية', 'Start shift')}</button>
        </>}

        {panel === 'movement' && <>
          <div className="shift-toggle">
            <button className={movementType === 'cash_out' ? 'active' : ''} onClick={() => setMovementType('cash_out')}>{t('سحب من الدرج', 'Cash out')}</button>
            <button className={movementType === 'cash_in' ? 'active' : ''} onClick={() => setMovementType('cash_in')}>{t('إضافة للدرج', 'Cash in')}</button>
          </div>
          <label className="shift-field"><span>{t('المبلغ', 'Amount')}</span>
            <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus/></label>
          <label className="shift-field"><span>{t('السبب (إجباري)', 'Reason (required)')}</span>
            <input value={reason} maxLength={240} onChange={(e) => setReason(e.target.value)}/></label>
          <button className="button button-primary" onClick={submitMovement} disabled={busy || Number(amount) <= 0 || reason.trim().length < 3}><Check size={15}/>{t('تسجيل', 'Record')}</button>
        </>}

        {panel === 'close' && <>
          <p className="shift-hint">{t('عُدّ النقدية في الدرج وأدخل المبلغ الفعلي. سيحسب النظام الفرق بعد التأكيد.', 'Count the cash in the drawer and enter the actual amount. The system calculates any difference after you confirm.')}</p>
          <label className="shift-field"><span>{t('النقدية المعدودة فعليًا', 'Counted cash')}</span>
            <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus/></label>
          <label className="shift-field"><span>{t('ملاحظات (إجبارية عند وجود فرق)', 'Notes (required if there is a difference)')}</span>
            <textarea value={notes} maxLength={1000} onChange={(e) => setNotes(e.target.value)} rows={3}/></label>
          <button className="button button-primary" onClick={submitClose} disabled={busy}><Check size={15}/>{t('تأكيد الإغلاق', 'Confirm close')}</button>
        </>}

        {panel === 'report' && report && <div className="shift-report">
          <div className="shift-report-grid">
            <div><span>{t('الوردية', 'Shift')}</span><b>#{report.shift_number}</b></div>
            <div><span>{t('الكاشير', 'Cashier')}</span><b>{report.cashier_name}</b></div>
            <div><span>{t('الفتح', 'Opened')}</span><b>{new Date(report.opened_at).toLocaleString(ar ? 'ar-SA' : 'en-GB')}</b></div>
            <div><span>{t('الإغلاق', 'Closed')}</span><b>{report.closed_at ? new Date(report.closed_at).toLocaleString(ar ? 'ar-SA' : 'en-GB') : ''}</b></div>
            <div><span>{t('عدد الفواتير', 'Invoices')}</span><b>{report.invoice_count}</b></div>
            <div><span>{t('إجمالي المبيعات', 'Gross sales')}</span><b>{money(report.gross_sales, ar)}</b></div>
            <div><span>{t('مبيعات نقدية', 'Cash sales')}</span><b>{money(report.cash_sales, ar)}</b></div>
            <div><span>{t('مبيعات شبكة', 'Card sales')}</span><b>{money(report.card_sales, ar)}</b></div>
            <div><span>{t('تحويل بنكي', 'Bank transfer')}</span><b>{money(report.bank_transfer_sales, ar)}</b></div>
            <div><span>{t('طرق أخرى', 'Other')}</span><b>{money(report.other_sales, ar)}</b></div>
            <div><span>{t('رصيد افتتاحي', 'Opening float')}</span><b>{money(report.opening_float, ar)}</b></div>
            <div><span>{t('إضافات / سحوبات', 'Cash in / out')}</span><b>{money(report.cash_in, ar)} / {money(report.cash_out, ar)}</b></div>
            <div><span>{t('المتوقع في الدرج', 'Expected cash')}</span><b>{money(report.expected_cash, ar)}</b></div>
            <div><span>{t('المعدود فعليًا', 'Counted cash')}</span><b>{money(report.counted_cash, ar)}</b></div>
          </div>
          <div className={`shift-variance ${variance === 0 ? 'ok' : 'diff'}`}>
            {variance === 0 ? t('لا يوجد فرق', 'No difference')
              : variance < 0 ? t(`عجز ${money(Math.abs(variance), ar)}`, `Shortage ${money(Math.abs(variance), ar)}`)
              : t(`زيادة ${money(variance, ar)}`, `Surplus ${money(variance, ar)}`)}
          </div>
          {report.notes && <p className="shift-hint">{t('ملاحظات:', 'Notes:')} {report.notes}</p>}
          <div className="shift-signatures"><span>{t('توقيع الكاشير', 'Cashier signature')}</span><span>{t('توقيع المستلم', 'Receiver signature')}</span></div>
          <div className="shift-report-actions shift-no-print">
            <button className="button button-primary" onClick={() => window.print()}>{t('طباعة التقرير', 'Print report')}</button>
            <button className="button" onClick={() => setPanel(null)}>{t('تم', 'Done')}</button>
          </div>
        </div>}

        {error && <div className="shift-error">{error}</div>}
      </section>
    </div>}
  </>;
}
