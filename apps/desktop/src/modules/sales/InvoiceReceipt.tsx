import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Printer, X } from 'lucide-react';
import JsBarcode from 'jsbarcode';
import { QRCodeSVG } from 'qrcode.react';
import './invoice-print.css';
import type { AppLanguage } from '../../app/types';
import type { InvoiceDetail } from '../../app/api';
import { paymentLabel } from '../../app/paymentMethods';

export interface InvoiceReceiptPayload extends InvoiceDetail {}

export function buildDemoQrPayload(invoice: Pick<InvoiceReceiptPayload, 'created_at' | 'total' | 'vat_total'>): string {
  const values: [number, string][] = [
    [1, 'SHOPNEX DEMO'], [2, 'NOT-A-REAL-VAT'], [3, invoice.created_at],
    [4, String(invoice.total)], [5, String(invoice.vat_total)],
  ];
  const bytes: number[] = [];
  values.forEach(([tag, value]) => {
    const encoded = new TextEncoder().encode(value);
    bytes.push(tag, encoded.length, ...encoded);
  });
  return btoa(bytes.map((byte) => String.fromCharCode(byte)).join(''));
}

export default function InvoiceReceipt({
  invoice,
  qrBase64,
  qrDisclaimer,
  sellerName,
  vatNumber,
  lang,
  demoMode,
  onClose,
}: {
  invoice: InvoiceReceiptPayload;
  qrBase64: string | null;
  qrDisclaimer: string;
  sellerName?: string;
  vatNumber?: string;
  lang: AppLanguage;
  demoMode: boolean;
  onClose: () => void;
}) {
  const ar = lang === 'ar';
  const t = (a: string, e: string) => ar ? a : e;
  const barcodeRef = useRef<SVGSVGElement>(null);
  const [barcodeError, setBarcodeError] = useState(false);

  useEffect(() => {
    if (!barcodeRef.current || !invoice.invoice_number) return;
    try {
      JsBarcode(barcodeRef.current, invoice.invoice_number, {
        format: 'CODE128',
        displayValue: false,
        width: 1.8,
        height: 42,
        margin: 2,
        lineColor: '#111827',
        background: '#ffffff',
      });
      setBarcodeError(false);
    } catch {
      setBarcodeError(true);
    }
  }, [invoice.invoice_number]);

  const formatMoney = (value: string | number) => {
    const match = String(value).trim().match(/^([+-]?)(\d+)(?:\.(\d+))?$/);
    if (!match) return `— ${ar ? 'ر.س' : 'SAR'}`;
    const inputFraction = match[3] ?? '';
    let minor = BigInt(match[2]) * 100n + BigInt((inputFraction + '00').slice(0, 2));
    if (inputFraction.length > 2 && inputFraction[2] >= '5') minor += 1n;
    if (match[1] === '-') minor = -minor;
    const sign = minor < 0n ? '−' : '';
    const absolute = minor < 0n ? -minor : minor;
    const locale = ar ? 'ar-SA' : 'en-US';
    const whole = new Intl.NumberFormat(locale).format(absolute / 100n);
    const fractionText = new Intl.NumberFormat(locale, { useGrouping: false, minimumIntegerDigits: 2, maximumFractionDigits: 0 }).format(Number(absolute % 100n));
    return `${sign}${whole}${ar ? '٫' : '.'}${fractionText} ${ar ? 'ر.س' : 'SAR'}`;
  };
  const quantityText = (value: string | number) => new Intl.NumberFormat(ar ? 'ar-SA' : 'en-US', { maximumFractionDigits: 3 }).format(Number(value));
  const dateText = new Intl.DateTimeFormat(ar ? 'ar-SA-u-ca-gregory' : 'en-GB', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Riyadh',
  }).format(new Date(invoice.created_at));
  const paymentName = (method: string) => paymentLabel(method, ar);
  const invoiceTypeName = invoice.invoice_type === 'tax'
    ? t('فاتورة ضريبية', 'Tax invoice')
    : invoice.invoice_type === 'simplified'
      ? t('فاتورة ضريبية مبسطة', 'Simplified tax invoice')
      : invoice.invoice_type;

  return createPortal(<div className="invoice-print-overlay" onMouseDown={onClose}>
    <section className="invoice-print-modal" role="dialog" aria-modal="true" aria-label={t('معاينة وطباعة الفاتورة', 'Invoice preview and print')} onMouseDown={(event) => event.stopPropagation()}>
      <div className="invoice-print-actions">
        <span>{t('معاينة الطباعة', 'Print preview')}</span>
        <div>
          <button className="button button-primary" onClick={() => window.print()}><Printer size={15}/>{t('طباعة / حفظ PDF', 'Print / Save PDF')}</button>
          <button className="icon-button" aria-label={t('إغلاق المعاينة', 'Close preview')} onClick={onClose}><X size={17}/></button>
        </div>
      </div>
      <article className="invoice-print-paper" dir={ar ? 'rtl' : 'ltr'}>
        <header className="receipt-brand-row">
          <div className="receipt-brand-mark">S</div>
          <div className="receipt-brand-copy"><b>{sellerName || 'SHOPNEX'}</b><small>{t('فاتورة مبيعات', 'Sales invoice')}</small></div>
          <span className={`receipt-mode-badge ${demoMode ? 'receipt-demo' : ''}`}>{demoMode ? t('معاينة فقط', 'DEMO ONLY') : t('محفوظة محليًا', 'SAVED LOCALLY')}</span>
        </header>

        <div className="receipt-title-row">
          <div><span className="eyebrow">{t('رقم الفاتورة', 'INVOICE NUMBER')}</span><h1>{invoice.invoice_number}</h1></div>
          <span className="receipt-invoice-type">{invoiceTypeName}</span>
        </div>
        <div className="receipt-meta-grid">
          <div><span>{t('التاريخ والوقت', 'Date & time')}</span><b>{dateText}</b></div>
          <div><span>{t('العميل', 'Customer')}</span><b>{invoice.customer_name || t('عميل نقدي', 'Walk-in customer')}</b></div>
          {invoice.customer_vat_number && <div><span>{t('رقم تسجيل VAT للمشتري', 'Buyer VAT registration')}</span><b dir="ltr">{invoice.customer_vat_number}</b></div>}
          {invoice.customer_address && <div><span>{t('عنوان المشتري', 'Buyer address')}</span><b>{invoice.customer_address}</b></div>}
          {vatNumber && <div><span>{t('رقم تسجيل VAT للبائع', 'Seller VAT registration')}</span><b dir="ltr">{vatNumber}</b></div>}
          <div><span>{t('العملة', 'Currency')}</span><b>{invoice.currency || 'SAR'}</b></div>
        </div>

        <div className="receipt-lines-wrap">
          {invoice.lines.length > 0 ? <table className="receipt-lines-table">
            <thead><tr><th>{t('الصنف', 'Item')}</th><th>{t('الكمية', 'Qty')}</th><th>{t('السعر', 'Price')}</th><th>{t('الإجمالي', 'Total')}</th></tr></thead>
            <tbody>{invoice.lines.map((line) => <tr key={line.id}>
              <td><b>{line.description}</b><small>{line.sku}{Number(line.discount_amount) > 0 ? ` · ${t('خصم', 'discount')} ${formatMoney(line.discount_amount)}` : ''}</small></td>
              <td>{quantityText(line.quantity)}</td>
              <td>{formatMoney(line.unit_price)}</td>
              <td><b>{formatMoney(line.total_amount)}</b></td>
            </tr>)}</tbody>
          </table> : <div className="receipt-no-lines">{t('هذه بيانات سجل معاينة مختصرة؛ أنشئ عملية بيع من شاشة الكاشير لطباعة فاتورة مفصلة.', 'This is a summary preview record. Create a sale in the cashier to print an itemized invoice.')}</div>}
        </div>

        <div className="receipt-totals">
          {invoice.lines.length > 0 ? <>
          <div><span>{t('المجموع قبل الخصم', 'Subtotal before discount')}</span><b>{formatMoney(invoice.subtotal)}</b></div>
          <div><span>{t('إجمالي الخصم', 'Total discount')}</span><b>−{formatMoney(invoice.discount_total)}</b></div>
          <div><span>{t('الوعاء الخاضع للضريبة', 'Taxable subtotal')}</span><b>{formatMoney(invoice.taxable_subtotal)}</b></div>
          <div><span>{t('ضريبة القيمة المضافة', 'VAT')}</span><b>{formatMoney(invoice.vat_total)}</b></div>
          <div className="receipt-grand-total"><span>{t('الإجمالي شامل الضريبة', 'Total including VAT')}</span><b>{formatMoney(invoice.total)}</b></div>
          </> : <div className="receipt-grand-total"><span>{t('إجمالي سجل المعاينة', 'Preview record total')}</span><b>{formatMoney(invoice.total)}</b></div>}
          <div><span>{t('المدفوع', 'Paid')}</span><b>{formatMoney(invoice.amount_paid)}</b></div>
          {Number(invoice.change_due) > 0 && <div><span>{t('الباقي للعميل', 'Change due')}</span><b>{formatMoney(invoice.change_due)}</b></div>}
        </div>

        {invoice.payments.length > 0 && <div className="receipt-payments"><span className="eyebrow">{t('وسيلة الدفع', 'PAYMENT METHOD')}</span>{invoice.payments.map((payment) => <div key={payment.id}><span>{paymentName(payment.method)}</span><b>{formatMoney(payment.amount)}</b></div>)}</div>}

        <div className="receipt-codes">
          <div className="receipt-barcode-block">
            <span className="eyebrow">{t('باركود رقم الفاتورة', 'INVOICE NUMBER BARCODE')}</span>
            {barcodeError ? <small>{t('تعذر توليد الباركود لهذا الرقم.', 'Could not encode this invoice number.')}</small> : <svg ref={barcodeRef} className="receipt-barcode" role="img" aria-label={t(`باركود الفاتورة ${invoice.invoice_number}`, `Barcode for invoice ${invoice.invoice_number}`)}/>}
            <code>{invoice.invoice_number}</code>
          </div>
          {qrBase64 && <div className="receipt-qr-block">
            <span className="eyebrow">{t('رمز QR', 'QR CODE')}</span>
            <div className="receipt-qr-box"><QRCodeSVG value={qrBase64} size={150} bgColor="#ffffff" fgColor="#111827" level="H" includeMargin shapeRendering="crispEdges"/></div>
            <small>{t('امسح لقراءة بيانات QR', 'Scan to read QR payload')}</small>
          </div>}
        </div>

        <footer className="receipt-footer">
          <b>{t('شكرًا لزيارتكم', 'Thank you for your visit')}</b>
          <span>{t('نسخة مطبوعة محليًا — لا تعني الإبلاغ أو التخليص من زاتكا.', 'Locally printed copy — this does not mean the invoice was reported to or cleared by ZATCA.')}</span>
          {qrDisclaimer && <small>{qrDisclaimer}</small>}
        </footer>
      </article>
    </section>
  </div>, document.body);
}
