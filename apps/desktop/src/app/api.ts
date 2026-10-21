import { handlePublicPreviewRequest } from './browserDemoApi';

export const isPublicPreview = import.meta.env.VITE_PUBLIC_PREVIEW === 'true';
const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://127.0.0.1:8000';
let accessToken: string | null = null;

export function setAccessToken(token: string | null) { accessToken = token; }

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  if (isPublicPreview) return handlePublicPreviewRequest<T>(path, init);
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.detail ?? `Request failed (${response.status})`);
  return payload as T;
}

export interface ZatcaPublicConfig {
  configured: boolean;
  environment: 'sandbox' | 'production';
  company_name: string;
  vat_number: string;
  egs_unit: string;
  certificate_path: string;
  private_key_path: string;
  secret_present: boolean;
  certificate_present: boolean;
  private_key_present: boolean;
  adapter_ready: boolean;
  last_validation: string | null;
}

export interface UserProfile { user_id: string; username: string; display_name: string; role: string; permissions: string[] }
export interface AuthResult extends UserProfile { access_token: string; token_type: 'bearer' }
export interface ManagedUser extends UserProfile { id: string; active: boolean; created_at: string }
export interface PermissionItem { key: string; group: string; ar: string; en: string }
export interface UserManagementMeta { roles: { name: string; permissions: string[] }[]; permissions: PermissionItem[] }
export async function getAuthStatus() {
  return apiRequest<{ initialized: boolean; setup_required: boolean }>('/api/v1/auth/status');
}
export async function createOwner(input: { username: string; password: string; display_name: string }) {
  return apiRequest<AuthResult>('/api/v1/auth/setup', { method: 'POST', body: JSON.stringify(input) });
}
export async function login(input: { username: string; password: string }) {
  return apiRequest<AuthResult>('/api/v1/auth/login', { method: 'POST', body: JSON.stringify(input) });
}
export async function getUserManagementMeta() { return apiRequest<UserManagementMeta>('/api/v1/admin/users/meta'); }
export async function getManagedUsers() { return apiRequest<ManagedUser[]>('/api/v1/admin/users'); }
export async function createManagedUser(input: {
  username: string; display_name: string; password: string; role: string; permissions: string[];
}) {
  return apiRequest<ManagedUser>('/api/v1/admin/users', { method: 'POST', body: JSON.stringify(input) });
}
export async function updateManagedUser(id: string, input: {
  display_name?: string; password?: string; role?: string; permissions?: string[]; active?: boolean;
}) {
  return apiRequest<ManagedUser>(`/api/v1/admin/users/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) });
}

export async function getZatcaConfig(environment: 'sandbox' | 'production' = 'sandbox') {
  return apiRequest<ZatcaPublicConfig>(`/api/v1/zatca/config?environment=${environment}`);
}
export async function saveZatcaConfig(input: {
  environment: 'sandbox' | 'production'; company_name: string; vat_number: string; egs_unit: string;
  certificate_path?: string; private_key_path?: string; api_credential?: string;
}) {
  return apiRequest<ZatcaPublicConfig>('/api/v1/zatca/config', { method: 'PUT', body: JSON.stringify(input) });
}
export async function getHealth() {
  return apiRequest<{ status: string; database: string; integration_mode: string }>('/api/health');
}
export interface OperationalResetResult {
  message: string;
  deleted_counts: Record<string, number>;
  preserved_records_present?: Record<string, number>;
}

export async function resetOperationalData(currentPassword: string) {
  return apiRequest<OperationalResetResult>('/api/v1/admin/reset-operational-data', {
    method: 'POST', body: JSON.stringify({ current_password: currentPassword }),
  });
}

export interface CatalogProduct {
  id: string;
  sku: string;
  name: string;
  category: string;
  price: string;
  vat_rate: string;
  tax_category: 'standard' | 'zero_rated' | 'exempt' | 'out_of_scope';
  tax_reason: string;
  tax_rule_id: string | null;
  quantity: string;
  average_cost: string;
  price_includes_vat: boolean;
  active: boolean;
}

export async function getProducts() {
  return apiRequest<CatalogProduct[]>('/api/v1/products');
}

export type CreateProductInput = {
  sku: string; name: string; category: string; price: string; vat_rate: string;
  tax_category?: CatalogProduct['tax_category']; tax_reason?: string;
  quantity: string; average_cost?: string; price_includes_vat: boolean;
};

export async function createProduct(input: CreateProductInput) {
  return apiRequest<CatalogProduct>('/api/v1/products', { method: 'POST', body: JSON.stringify(input) });
}

export interface CreateInvoiceInput {
  /** Ignored by the real API (the server assigns the sequential legal number); only the browser demo uses it. */
  invoice_number?: string;
  customer_name: string;
  customer_vat_number?: string;
  customer_address?: string;
  /** Same key on a retry returns the already-recorded invoice instead of creating a duplicate. */
  idempotency_key?: string;
  invoice_type: 'simplified' | 'tax';
  lines: { product_id: string; quantity: string; discount_percent: string }[];
  payments: { method: string; amount: string }[];
}

export interface SavedInvoice {
  id: string;
  invoice_number: string;
  invoice_type: 'simplified' | 'tax' | string;
  status: string;
  subtotal: string;
  discount_total: string;
  taxable_subtotal: string;
  vat_total: string;
  total: string;
  amount_paid: string;
  change_due: string;
  currency: string;
  created_at: string;
  sequence_number?: number | null;
  customer_vat_number?: string;
  customer_address?: string;
  shift_id?: string | null;
}

export interface InvoiceLineRecord {
  id: string;
  description: string;
  sku: string;
  quantity: string | number;
  unit_price: string | number;
  discount_percent: string | number;
  discount_amount: string | number;
  taxable_amount: string | number;
  vat_rate: string | number;
  tax_category: string;
  tax_reason: string;
  vat_amount: string | number;
  total_amount: string | number;
  price_includes_vat: boolean;
}

export interface InvoicePaymentRecord {
  id: string;
  method: string;
  amount: string | number;
  created_at: string;
}

export interface InvoiceDetail extends SavedInvoice {
  customer_name: string;
  invoice_type: string;
  lines: InvoiceLineRecord[];
  payments: InvoicePaymentRecord[];
}

export async function createInvoice(input: CreateInvoiceInput) {
  return apiRequest<SavedInvoice>('/api/v1/invoices', { method: 'POST', body: JSON.stringify(input) });
}

export async function getInvoices() {
  return apiRequest<SavedInvoice[]>('/api/v1/invoices');
}

export async function getInvoiceDetails(invoiceId: string) {
  return apiRequest<InvoiceDetail>(`/api/v1/invoices/${encodeURIComponent(invoiceId)}`);
}

export interface Supplier {
  id: string; supplier_code: string; name: string; vat_number: string; phone: string;
  email: string; payment_terms_days: number; credit_limit: string; active: boolean;
}
export interface SupplierInput extends Omit<Supplier, 'id' | 'active'> {}
export async function getSuppliers() { return apiRequest<Supplier[]>('/api/v1/suppliers'); }
export async function createSupplier(input: SupplierInput) {
  return apiRequest<Supplier>('/api/v1/suppliers', { method: 'POST', body: JSON.stringify(input) });
}

export interface PurchaseRecord {
  id: string; purchase_number: string; supplier_invoice_number: string; supplier_id: string;
  supplier_name: string; status: 'unpaid' | 'partially_paid' | 'paid'; subtotal: string | number;
  discount_total: string | number; taxable_subtotal: string | number; vat_total: string | number;
  total: string | number; amount_paid: string | number; balance_due: string | number;
  due_date: string | null; created_at: string; currency: string;
  lines: { product_id: string; sku: string; description: string; quantity: string | number; unit_cost: string | number;
    discount_percent: string | number; taxable_amount: string | number; vat_rate: string | number;
    vat_amount: string | number; total_amount: string | number }[];
  payments: { id: string; method: string; amount: string | number; created_at: string }[];
}
export interface CreatePurchaseInput {
  purchase_number: string; supplier_invoice_number?: string; supplier_id: string; due_date?: string;
  lines: { product_id: string; quantity: string; unit_cost: string; discount_percent: string; price_includes_vat: boolean }[];
  payments: { method: 'cash' | 'card' | 'bank_transfer' | 'wallet' | 'other'; amount: string }[];
}
export async function getPurchases() { return apiRequest<PurchaseRecord[]>('/api/v1/purchases'); }
export async function createPurchase(input: CreatePurchaseInput) {
  return apiRequest<PurchaseRecord>('/api/v1/purchases', { method: 'POST', body: JSON.stringify(input) });
}
export async function addPurchasePayment(purchaseId: string, input: { method: string; amount: string; idempotency_key: string }) {
  return apiRequest<PurchaseRecord>(`/api/v1/purchases/${encodeURIComponent(purchaseId)}/payments`, { method: 'POST', body: JSON.stringify(input) });
}

export interface FinanceReport {
  period: { start_date: string | null; end_date: string | null; timezone: string };
  currency: string;
  sales: { count: number; total: string | number; net: string | number; vat: string | number; paid: string | number; receivables: string | number };
  purchases: { count: number; total: string | number; net: string | number; vat: string | number; paid: string | number; payables: string | number };
  tax: { output_vat: string | number; input_vat: string | number; net_vat_due_estimate: string | number; filing_status: string };
  profitability: { net_sales_before_vat: string | number; cost_of_goods_sold: string | number; gross_profit_estimate: string | number; inventory_value_at_average_cost: string | number; items_with_missing_cost: number };
  payments_by_method: { method: string; amount: string | number }[];
  sales_trend: { date: string; sales: string | number }[];
  top_products: { sku: string; name: string; quantity: string | number; net_sales: string | number; vat: string | number; cost: string | number; gross_profit: string | number }[];
  supplier_performance: { supplier: string; count: number; purchases: string | number; paid: string | number; balance: string | number }[];
  data_scope: string;
}
export interface TrialBalanceRow {
  id: string; code: string; system_key: string; name_ar: string; name_en: string;
  account_type: string; normal_side: string; debit_total: string | number;
  credit_total: string | number; balance: string | number;
}
export async function getTrialBalance() {
  return apiRequest<{ accounts: TrialBalanceRow[]; debit_total: string | number; credit_total: string | number; balanced: boolean; currency: string }>('/api/v1/accounting/trial-balance');
}
export async function getJournals() { return apiRequest<any[]>('/api/v1/accounting/journals'); }
export async function getReceivables() { return apiRequest<any[]>('/api/v1/accounting/receivables'); }
export async function getPayables() { return apiRequest<any[]>('/api/v1/accounting/payables'); }
export async function getTaxRules() { return apiRequest<any[]>('/api/v1/tax/rules'); }
export async function createTaxRule(input: { code: string; name_ar: string; name_en: string; category: string; rate: string; effective_from: string; effective_to?: string; reason_required: boolean }) {
  return apiRequest<any>('/api/v1/tax/rules', { method: 'POST', body: JSON.stringify(input) });
}
export interface CashierHandoverInvoice {
  invoice_number: string; created_at: string; total: string | number; cash: string | number;
  card: string | number; bank_transfer: string | number; other: string | number; change_due: string | number;
}
export interface CashierHandoverRow {
  cashier_id: string | null; cashier_name: string; invoice_count: number; gross_sales: string | number;
  cash: string | number; card: string | number; bank_transfer: string | number; other: string | number;
  cash_change: string | number; cash_expected: string | number; items_sold: string | number;
  invoices: CashierHandoverInvoice[];
}
export async function getCashierHandover(startDate?: string, endDate?: string) {
  const query = new URLSearchParams();
  if (startDate) query.set('start_date', startDate);
  if (endDate) query.set('end_date', endDate);
  return apiRequest<{ period: { start_date: string | null; end_date: string | null; timezone: string }; cashiers: CashierHandoverRow[]; currency: string; data_scope: string }>(`/api/v1/reports/cashier-handover${query.size ? `?${query.toString()}` : ''}`);
}
export async function getFinanceReport(startDate?: string, endDate?: string) {
  const query = new URLSearchParams();
  if (startDate) query.set('start_date', startDate);
  if (endDate) query.set('end_date', endDate);
  return apiRequest<FinanceReport>(`/api/v1/reports/overview${query.size ? `?${query.toString()}` : ''}`);
}
export async function getPhase1InvoiceQr(invoiceId: string) {
  return apiRequest<{ invoice_id: string; invoice_number: string; seller_name: string; vat_number: string; format: string; qr_base64: string; tags: { tag: number; length: number; value: string }[]; phase2_ready: boolean; authority_contacted: boolean; disclaimer: string }>(`/api/v1/zatca/invoices/${encodeURIComponent(invoiceId)}/qr/phase1`);
}

export type ModuleName = 'restaurant' | 'crm' | 'hr';
export interface ModuleRecord {
  id: string;
  module: ModuleName;
  data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export async function getModuleRecords(module: ModuleName) {
  return apiRequest<ModuleRecord[]>(`/api/v1/modules/${module}/records`);
}

export async function createModuleRecord(module: ModuleName, data: Record<string, unknown>) {
  return apiRequest<ModuleRecord>(`/api/v1/modules/${module}/records`, {
    method: 'POST', body: JSON.stringify({ data }),
  });
}

export async function updateModuleRecord(module: ModuleName, id: string, data: Record<string, unknown>) {
  return apiRequest<ModuleRecord>(`/api/v1/modules/${module}/records/${encodeURIComponent(id)}`, {
    method: 'PUT', body: JSON.stringify({ data }),
  });
}

export async function deleteModuleRecord(module: ModuleName, id: string) {
  return apiRequest<void>(`/api/v1/modules/${module}/records/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

type Money = string | number;
export interface ShiftInfo {
  id: string; shift_number: number; status: 'open' | 'closed'; cashier_id: string; cashier_name: string;
  opened_at: string; closed_at: string | null; opening_float: Money; counted_cash: Money | null;
  expected_cash: Money | null; variance: Money | null; notes: string; invoice_count: number; totals_visible: boolean;
  gross_sales?: Money; cash_sales?: Money; card_sales?: Money; bank_transfer_sales?: Money; other_sales?: Money;
  change_given?: Money; cash_in?: Money; cash_out?: Money;
  invoices?: { invoice_number: string; created_at: string; total: Money; change_due: Money; invoice_type: string }[];
  movements?: { movement_type: 'cash_in' | 'cash_out'; amount: Money; reason: string; created_at: string }[];
}
export async function getCurrentShift() { return apiRequest<{ shift: ShiftInfo | null }>('/api/v1/shifts/current'); }
export async function openShift(openingFloat: string) {
  return apiRequest<ShiftInfo>('/api/v1/shifts/open', { method: 'POST', body: JSON.stringify({ opening_float: openingFloat }) });
}
export async function addCashMovement(input: { movement_type: 'cash_in' | 'cash_out'; amount: string; reason: string }) {
  return apiRequest<ShiftInfo>('/api/v1/shifts/cash-movements', { method: 'POST', body: JSON.stringify(input) });
}
export async function closeShift(input: { counted_cash: string; notes: string }) {
  return apiRequest<ShiftInfo>('/api/v1/shifts/current/close', { method: 'POST', body: JSON.stringify(input) });
}
export async function listShifts(limit = 50) { return apiRequest<ShiftInfo[]>(`/api/v1/shifts?limit=${limit}`); }
