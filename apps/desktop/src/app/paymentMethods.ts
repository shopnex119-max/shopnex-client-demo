export interface PaymentMethod {
  code: string;
  labelAr: string;
  labelEn: string;
  kind: 'cash' | 'electronic';
}

export const DEFAULT_PAYMENT_METHODS: PaymentMethod[] = [
  { code: 'cash', labelAr: 'نقدًا', labelEn: 'Cash', kind: 'cash' },
  { code: 'card', labelAr: 'بطاقة بنكية', labelEn: 'Card', kind: 'electronic' },
  { code: 'bank_transfer', labelAr: 'تحويل بنكي', labelEn: 'Bank transfer', kind: 'electronic' },
  { code: 'wallet', labelAr: 'محفظة إلكترونية', labelEn: 'E-wallet', kind: 'electronic' },
];

const STORAGE_KEY = 'shopnex.payment-methods.v1';

export function loadPaymentMethods(): PaymentMethod[] {
  if (typeof window === 'undefined') return DEFAULT_PAYMENT_METHODS;
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (!Array.isArray(value)) return DEFAULT_PAYMENT_METHODS;
    const methods = value.filter((item): item is PaymentMethod => Boolean(item && typeof item.code === 'string' && typeof item.labelAr === 'string' && typeof item.labelEn === 'string' && (item.kind === 'cash' || item.kind === 'electronic')));
    return methods.length ? methods : DEFAULT_PAYMENT_METHODS;
  } catch {
    return DEFAULT_PAYMENT_METHODS;
  }
}

export function savePaymentMethods(methods: PaymentMethod[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(methods));
  window.dispatchEvent(new Event('shopnex-payment-methods-changed'));
}

export function paymentLabel(code: string, ar: boolean, methods = loadPaymentMethods()): string {
  const method = methods.find((item) => item.code === code);
  return method ? (ar ? method.labelAr : method.labelEn) : code;
}
