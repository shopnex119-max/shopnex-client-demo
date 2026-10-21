export type PageKey = 'overview' | 'zatca' | 'invoices' | 'sales' | 'inventory' | 'inventory-count' | 'products' | 'purchasing' | 'accounting' | 'customers' | 'reports' | 'restaurant' | 'kitchen' | 'guest' | 'crm' | 'hr' | 'settings' | 'users' | 'coming-soon';

export type AppLanguage = 'ar' | 'en';
export type ThemeMode = 'dark' | 'light';

export interface AppPage {
  key: PageKey;
  label: string;
  labelEn: string;
  icon: string;
  group?: string;
  groupEn?: string;
  ready?: boolean;
}
