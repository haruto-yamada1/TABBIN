/**
 * デフォルトカラー設定
 */

// デフォルトカラー値を取得する関数
export const getDefaultColor = (key: string): string =>
  defaultColors[key] || '#ffffff'

// デフォルトカラー設定
export const defaultColors: Record<string, string> = {
  accent: '#f1f5f9',
  'accent-foreground': '#0f172a',
  background: '#ffffff',
  border: '#e2e8f0',
  card: '#ffffff',
  'card-foreground': '#09090b',
  'chart-1': '#0ea5e9',
  'chart-2': '#10b981',
  'chart-3': '#f59e0b',
  'chart-4': '#ef4444',
  'chart-5': '#8b5cf6',
  destructive: '#ef4444',
  'destructive-foreground': '#ffffff',
  foreground: '#09090b',
  input: '#e2e8f0',
  muted: '#f1f5f9',
  'muted-foreground': '#64748b',
  popover: '#ffffff',
  'popover-foreground': '#09090b',
  primary: '#0ea5e9',
  'primary-foreground': '#ffffff',
  ring: '#0ea5e9',
  secondary: '#f1f5f9',
  'secondary-foreground': '#0f172a',
  sidebar: '#f8fafc',
  'sidebar-accent': '#f1f5f9',
  'sidebar-accent-foreground': '#0f172a',
  'sidebar-border': '#e2e8f0',
  'sidebar-foreground': '#0f172a',
  'sidebar-primary': '#0ea5e9',
  'sidebar-primary-foreground': '#ffffff',
  'sidebar-ring': '#0ea5e9',
}
