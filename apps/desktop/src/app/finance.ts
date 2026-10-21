export type Minor = bigint;

function unsignedParts(value: string | number): { whole: bigint; fraction: string; negative: boolean } | null {
  const normalized = String(value).trim().replace(/,/g, '');
  const match = normalized.match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if (!match) return null;
  return { negative: match[1] === '-', whole: BigInt(match[2]), fraction: match[3] ?? '' };
}

export function parseMinor(value: string | number): Minor {
  const parts = unsignedParts(value);
  if (!parts) return 0n;
  const digits = (parts.fraction + '00').slice(0, 2);
  const next = parts.fraction[2] ? Number(parts.fraction[2]) : 0;
  let cents = parts.whole * 100n + BigInt(digits || '00');
  if (next >= 5) cents += 1n;
  return parts.negative ? -cents : cents;
}

export function parseQuantityThousandths(value: string | number): bigint {
  const parts = unsignedParts(value);
  if (!parts) return 0n;
  const digits = (parts.fraction + '000').slice(0, 3);
  const next = parts.fraction[3] ? Number(parts.fraction[3]) : 0;
  let qty = parts.whole * 1000n + BigInt(digits || '000');
  if (next >= 5) qty += 1n;
  return parts.negative ? -qty : qty;
}

export function parseRateBasisPoints(value: string | number): bigint {
  const parts = unsignedParts(value);
  if (!parts) return 0n;
  const digits = (parts.fraction + '00').slice(0, 2);
  const rate = parts.whole * 100n + BigInt(digits || '00');
  return parts.negative ? -rate : rate;
}

export function divideHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) return 0n;
  return (numerator + denominator / 2n) / denominator;
}

export function calculateLineMinor(input: {
  quantity: string | number; unitPrice: string | number; discountPercent: string | number;
  vatRate: string | number; priceIncludesVat?: boolean;
}) {
  const gross = divideHalfUp(parseQuantityThousandths(input.quantity) * parseMinor(input.unitPrice), 1000n);
  const discount = divideHalfUp(gross * parseRateBasisPoints(input.discountPercent), 10000n);
  const afterDiscount = gross - discount;
  const vatRate = parseRateBasisPoints(input.vatRate);
  if (input.priceIncludesVat && vatRate > 0n) {
    const taxable = divideHalfUp(afterDiscount * 10000n, 10000n + vatRate);
    return { gross, discount, taxable, vat: afterDiscount - taxable, total: afterDiscount };
  }
  const taxable = afterDiscount;
  const vat = divideHalfUp(taxable * vatRate, 10000n);
  return { gross, discount, taxable, vat, total: taxable + vat };
}

export function formatMinor(value: bigint, ar: boolean): string {
  const sign = value < 0n ? '−' : '';
  const absolute = value < 0n ? -value : value;
  const whole = absolute / 100n;
  const fraction = (absolute % 100n).toString().padStart(2, '0');
  return `${sign}${new Intl.NumberFormat(ar ? 'ar-SA' : 'en-US', { maximumFractionDigits: 0 }).format(whole)}.${fraction} ${ar ? 'ر.س' : 'SAR'}`;
}

export function formatValue(value: string | number | bigint, ar: boolean): string {
  if (typeof value === 'bigint') return formatMinor(value, ar);
  return formatMinor(parseMinor(value), ar);
}

export function toDecimalString(cents: bigint): string {
  const sign = cents < 0n ? '-' : '';
  const absolute = cents < 0n ? -cents : cents;
  const whole = absolute / 100n;
  const fraction = (absolute % 100n).toString().padStart(2, '0');
  return `${sign}${whole}.${fraction}`;
}

export function toQuantityString(thousandths: bigint): string {
  const sign = thousandths < 0n ? '-' : '';
  const absolute = thousandths < 0n ? -thousandths : thousandths;
  const whole = absolute / 1000n;
  const fraction = (absolute % 1000n).toString().padStart(3, '0');
  return `${sign}${whole}.${fraction}`;
}
