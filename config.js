const STORAGE_KEY = 'knowledge-desk-config';

const DEFAULT_CONFIG = {
  supabaseUrl: '',
  supabaseAnonKey: '',
  useMockData: true,
  lockConnectionSettings: false,
};

function readStoredConfig() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

const bootConfig = window.KNOWLEDGE_APP_CONFIG ?? window.PAYROLL_APP_CONFIG ?? {};

export const APP_CONFIG = {
  ...DEFAULT_CONFIG,
  ...readStoredConfig(),
  ...bootConfig,
};

export function saveAppConfig(nextConfig) {
  const merged = {
    ...DEFAULT_CONFIG,
    ...APP_CONFIG,
    ...nextConfig,
  };

  Object.assign(APP_CONFIG, merged);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  window.__KNOWLEDGE_APP_CONFIG__ = APP_CONFIG;
  return APP_CONFIG;
}

export function readAppConfig() {
  return { ...APP_CONFIG };
}

export function isConnectionSettingsLocked() {
  return Boolean(APP_CONFIG.lockConnectionSettings);
}
