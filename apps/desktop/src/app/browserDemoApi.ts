import type {
  CatalogProduct, CreateInvoiceInput, InvoiceDetail, InvoiceLineRecord,
  InvoicePaymentRecord, ModuleName, ModuleRecord, ZatcaPublicConfig,
} from './api';
import { calculateLineMinor, parseMinor, parseQuantityThousandths, toDecimalString, toQuantityString } from './finance';

const STORAGE_KEY = 'shopnex:interactive-preview:v2-empty';
const PAYMENT_METHODS_KEY = 'shopnex.payment-methods.v1';
type PublicModule = 'restaurant' | 'crm' | 'hr';
type DemoState = {
  version: 2;
  products: CatalogProduct[];
  invoices: InvoiceDetail[];
  modules: Record<PublicModule, ModuleRecord[]>;
};

function initialState(): DemoState {
  return { version: 2, products: [], invoices: [], modules: { restaurant: [], crm: [], hr: [] } };
}

export function resetPreviewData(): { message: string; deleted_counts: Record<string, number>; preserved_records_present: Record<string, number> } {
  const previous = readState();
  const deleted_counts = {
    invoices: previous.invoices.length,
    products: previous.products.filter((product) => !product.id.startsWith('preview-')).length,
    customers: previous.modules.crm.length,
    restaurant_records: previous.modules.restaurant.length,
    hr_records: previous.modules.hr.length,
  };
  window.localStorage.removeItem(PAYMENT_METHODS_KEY);
  writeState(initialState());
  return { message: 'Browser preview data reset completed', deleted_counts, preserved_records_present: { sample_products_reloaded: 0, demo_data_reloaded: 0 } };
}

function readState(): DemoState {
  if (typeof window === 'undefined') throw new Error('Browser-local preview requires a browser.');
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const fresh = initialState();
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
      return fresh;
    }
    const parsed = JSON.parse(raw) as Partial<DemoState>;
    if (parsed.version !== 2 || !Array.isArray(parsed.products) || !Array.isArray(parsed.invoices) || !parsed.modules) {
      throw new Error('The stored preview data format is unsupported. Clear this site’s browser data and reload.');
    }
    return parsed as DemoState;
  } catch (error) {
    if (error instanceof Error && error.message.includes('stored preview data format')) throw error;
    throw new Error('Browser storage is unavailable. No preview record was saved. Enable local storage and reload.');
  }
}

function writeState(state: DemoState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    window.dispatchEvent(new CustomEvent('shopnex:preview-updated'));
  } catch {
    throw new Error('Could not save to this browser’s storage. Free some storage and try again; no API request was sent.');
  }
}

function id(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}
function fail(message: string): never { throw new Error(message); }
function bodyOf(init?: RequestInit): Record<string, unknown> {
  if (typeof init?.body !== 'string') return {};
  try { return JSON.parse(init.body) as Record<string, unknown>; }
  catch { return fail('Invalid preview request body.'); }
}
function money(value: bigint): string { return toDecimalString(value); }
function sortNewest<T extends { created_at: string }>(rows: T[]): T[] { return [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at)); }

function createInvoice(state: DemoState, input: Record<string, unknown>): InvoiceDetail {
  const lines = Array.isArray(input.lines) ? input.lines as CreateInvoiceInput['lines'] : [];
  const payments = Array.isArray(input.payments) ? input.payments as CreateInvoiceInput['payments'] : [];
  if (!lines.length) return fail('Add at least one product before checkout.');
  const lineRecords: InvoiceLineRecord[] = [];
  let subtotal = 0n; let discountTotal = 0n; let taxableSubtotal = 0n; let vatTotal = 0n; let total = 0n;
  const stockNeeds = new Map<string, bigint>();
  for (const line of lines) {
    const product = state.products.find((item) => item.id === line.product_id && item.active);
    if (!product) return fail('A selected product is not available in this browser preview.');
    const qty = parseQuantityThousandths(line.quantity);
    const discount = parseMinor(line.discount_percent);
    if (qty <= 0n || discount < 0n || discount > 10000n) return fail('Check the quantity and discount values.');
    const available = parseQuantityThousandths(product.quantity);
    const nextNeed = (stockNeeds.get(product.id) ?? 0n) + qty;
    if (nextNeed > available) return fail(`Not enough preview stock for ${product.name}.`);
    stockNeeds.set(product.id, nextNeed);
    const rate = product.tax_category === 'standard' ? product.vat_rate : '0';
    const calculated = calculateLineMinor({ quantity: line.quantity, unitPrice: product.price, discountPercent: line.discount_percent, vatRate: rate, priceIncludesVat: product.price_includes_vat });
    subtotal += calculated.gross; discountTotal += calculated.discount; taxableSubtotal += calculated.taxable; vatTotal += calculated.vat; total += calculated.total;
    lineRecords.push({
      id: id('line'), description: product.name, sku: product.sku, quantity: toQuantityString(qty), unit_price: product.price,
      discount_percent: line.discount_percent, discount_amount: money(calculated.discount), taxable_amount: money(calculated.taxable),
      vat_rate: rate, tax_category: product.tax_category, tax_reason: product.tax_reason, vat_amount: money(calculated.vat),
      total_amount: money(calculated.total), price_includes_vat: product.price_includes_vat,
    });
  }
  let tendered = 0n;
  for (const payment of payments) {
    const amount = parseMinor(payment.amount);
    if (amount < 0n) return fail('Payment amounts cannot be negative.');
    tendered += amount;
  }
  if (!payments.length || tendered <= 0n) return fail('Record a positive payment before checkout.');
  const amountPaid = tendered > total ? total : tendered;
  const now = new Date().toISOString();
  const invoiceId = id('invoice');
  let paymentRemaining = amountPaid;
  const paymentRecords: InvoicePaymentRecord[] = payments.map((payment) => {
    const proposed = parseMinor(payment.amount);
    const applied = proposed < paymentRemaining ? proposed : paymentRemaining;
    paymentRemaining -= applied;
    return { id: id('payment'), method: payment.method, amount: money(applied), created_at: now };
  }).filter((payment) => parseMinor(payment.amount) > 0n);
  const invoice: InvoiceDetail = {
    id: invoiceId, invoice_number: String(input.invoice_number || `DEMO-${Date.now()}`), customer_name: String(input.customer_name || 'عميل معاينة'),
    invoice_type: 'simplified', status: amountPaid >= total ? 'paid' : amountPaid > 0n ? 'partially_paid' : 'unpaid',
    subtotal: money(subtotal), discount_total: money(discountTotal), taxable_subtotal: money(taxableSubtotal), vat_total: money(vatTotal),
    total: money(total), amount_paid: money(amountPaid), change_due: money(tendered > total ? tendered - total : 0n), currency: 'SAR', created_at: now,
    lines: lineRecords, payments: paymentRecords,
  };
  state.products = state.products.map((product) => {
    const used = stockNeeds.get(product.id);
    return used ? { ...product, quantity: toQuantityString(parseQuantityThousandths(product.quantity) - used) } : product;
  });
  state.invoices.unshift(invoice);
  return invoice;
}

export async function handlePublicPreviewRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? 'GET').toUpperCase();
  const pathname = new URL(path, 'https://preview.invalid').pathname;
  const body = bodyOf(init);
  const state = readState();

  if (pathname === '/api/health' && method === 'GET') return { status: 'preview', database: 'browser-local-storage', integration_mode: 'offline-demo' } as T;
  if (pathname === '/api/v1/products' && method === 'GET') return state.products.filter((item) => item.active) as T;
  if (pathname === '/api/v1/products' && method === 'POST') {
    const sku = String(body.sku ?? '').trim(); const name = String(body.name ?? '').trim();
    const price = parseMinor(String(body.price ?? '')); const stock = parseQuantityThousandths(String(body.quantity ?? ''));
    const rate = parseMinor(String(body.vat_rate ?? ''));
    if (!sku || !name || price < 0n || stock < 0n || rate < 0n || rate > 10000n) return fail('Check the product name, SKU, price, stock and VAT rate.');
    if (state.products.some((item) => item.sku.toLowerCase() === sku.toLowerCase())) return fail('A product with this SKU already exists in the browser preview.');
    const product: CatalogProduct = {
      id: id('product'), sku, name, category: String(body.category ?? 'عام').trim(), price: money(price), vat_rate: money(rate),
      tax_category: String(body.tax_category ?? 'standard') as CatalogProduct['tax_category'], tax_reason: String(body.tax_reason ?? ''), tax_rule_id: null,
      quantity: toQuantityString(stock), average_cost: money(parseMinor(String(body.average_cost ?? '0'))),
      price_includes_vat: body.price_includes_vat === true, active: true,
    };
    state.products.unshift(product); writeState(state); return product as T;
  }
  if (pathname === '/api/v1/invoices' && method === 'GET') return sortNewest(state.invoices) as T;
  if (pathname === '/api/v1/invoices' && method === 'POST') {
    const invoice = createInvoice(state, body); writeState(state); return invoice as T;
  }
  const invoiceDetail = pathname.match(/^\/api\/v1\/invoices\/([^/]+)$/);
  if (invoiceDetail && method === 'GET') {
    const invoice = state.invoices.find((row) => row.id === decodeURIComponent(invoiceDetail[1]));
    return (invoice ?? fail('Invoice not found in this browser preview.')) as T;
  }

  const moduleRecords = pathname.match(/^\/api\/v1\/modules\/(restaurant|crm|hr)\/records(?:\/([^/]+))?$/);
  if (moduleRecords) {
    const module = moduleRecords[1] as ModuleName;
    const records = state.modules[module];
    if (!moduleRecords[2] && method === 'GET') return sortNewest(records) as T;
    if (!moduleRecords[2] && method === 'POST') {
      const data = body.data;
      if (!data || typeof data !== 'object' || Array.isArray(data)) return fail('A record data object is required.');
      const now = new Date().toISOString();
      const record: ModuleRecord = { id: id('record'), module, data: data as Record<string, unknown>, created_at: now, updated_at: now };
      records.unshift(record); writeState(state); return record as T;
    }
    if (moduleRecords[2] && method === 'PUT') {
      const recordId = decodeURIComponent(moduleRecords[2]); const index = records.findIndex((row) => row.id === recordId);
      if (index < 0) return fail('Record not found in this browser preview.');
      const data = body.data;
      if (!data || typeof data !== 'object' || Array.isArray(data)) return fail('A record data object is required.');
      const updated: ModuleRecord = { ...records[index], data: data as Record<string, unknown>, updated_at: new Date().toISOString() };
      records[index] = updated; writeState(state); return updated as T;
    }
  }

  if (pathname === '/api/v1/zatca/config' && method === 'GET') {
    const result: ZatcaPublicConfig = {
      configured: false, environment: new URLSearchParams(new URL(path, 'https://preview.invalid').search).get('environment') === 'production' ? 'production' : 'sandbox',
      company_name: '', vat_number: '', egs_unit: '', certificate_path: '', private_key_path: '', secret_present: false,
      certificate_present: false, private_key_present: false, adapter_ready: false, last_validation: null,
    };
    return result as T;
  }
  if (pathname.startsWith('/api/v1/zatca/')) return fail('ZATCA settings and credentials cannot be saved or transmitted from the public preview. No network request was sent.');
  if (pathname === '/api/v1/admin/reset-operational-data') return fail('Reset is disabled in the public preview.');
  return fail(`This operation is not available in the browser-only preview (${method} ${pathname}). No network request was sent.`);
}

export function previewStorageKey(): string { return STORAGE_KEY; }
