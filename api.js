import { APP_CONFIG } from './config.js?v=20260326-auth1';

const MOCK_STORAGE_KEY = 'knowledge-desk-mock-store';
const AUTH_STORAGE_KEY = 'knowledge-desk-auth-session';
const KNOWLEDGE_IMAGE_BUCKET = 'knowledge-images';
const SESSION_REFRESH_SKEW_MS = 60 * 1000;

let currentSession = readStoredSession();
let supabaseAuthClient = null;
let supabaseAuthCacheKey = '';
let supabaseAuthSubscribed = false;

class ApiError extends Error {
  constructor(message, code = 'API_ERROR', status = null) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

function createId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `mock-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function timestamp() {
  return new Date().toISOString();
}

function unixTime() {
  return Math.floor(Date.now() / 1000);
}

function isRemoteConfigured() {
  return Boolean(APP_CONFIG.supabaseUrl && APP_CONFIG.supabaseAnonKey && !APP_CONFIG.useMockData);
}

export function getConnectionMode() {
  return isRemoteConfigured() ? 'supabase' : 'mock';
}

function normalizeSessionPayload(payload) {
  const source =
    payload?.session && typeof payload.session === 'object' && payload.session.access_token
      ? payload.session
      : payload;

  if (!source?.access_token) {
    return null;
  }

  const expiresIn = Number(source.expires_in ?? 0);
  const expiresAt =
    Number(source.expires_at ?? 0) ||
    (expiresIn > 0 ? unixTime() + expiresIn : 0);

  return {
    access_token: source.access_token,
    refresh_token: source.refresh_token ?? '',
    token_type: source.token_type ?? 'bearer',
    expires_in: expiresIn > 0 ? expiresIn : Math.max(expiresAt - unixTime(), 0),
    expires_at: expiresAt,
    user: source.user ?? payload?.user ?? null,
  };
}

function readStoredSession() {
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    return normalizeSessionPayload(JSON.parse(raw));
  } catch {
    return null;
  }
}

function persistSession(session) {
  const normalized = normalizeSessionPayload(session);
  currentSession = normalized;

  if (!normalized) {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
    return null;
  }

  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

function sessionNeedsRefresh(session) {
  if (!session?.expires_at) return false;
  return session.expires_at * 1000 <= Date.now() + SESSION_REFRESH_SKEW_MS;
}

function authBaseHeaders() {
  return {
    apikey: APP_CONFIG.supabaseAnonKey,
  };
}

function getSupabaseAuthClient() {
  if (!isRemoteConfigured()) return null;
  if (!globalThis.supabase?.createClient) return null;

  const cacheKey = `${APP_CONFIG.supabaseUrl}::${APP_CONFIG.supabaseAnonKey}`;
  if (!supabaseAuthClient || supabaseAuthCacheKey !== cacheKey) {
    supabaseAuthClient = globalThis.supabase.createClient(APP_CONFIG.supabaseUrl, APP_CONFIG.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
    supabaseAuthCacheKey = cacheKey;
    supabaseAuthSubscribed = false;
  }

  if (!supabaseAuthSubscribed) {
    supabaseAuthClient.auth.onAuthStateChange((_event, session) => {
      persistSession(session);
    });
    supabaseAuthSubscribed = true;
  }

  return supabaseAuthClient;
}

function apiHeaders() {
  const session = currentSession ?? readStoredSession();
  if (!session?.access_token) {
    throw new ApiError('ログインが必要です。メールアドレスとパスワードでログインしてください。', 'AUTH_REQUIRED', 401);
  }

  return {
    ...authBaseHeaders(),
    Authorization: `Bearer ${session.access_token}`,
  };
}

function mapApiError(response, rawText) {
  let message = rawText || `Request failed: ${response.status}`;
  let code = 'API_ERROR';

  try {
    const parsed = JSON.parse(rawText);
    message = parsed.message ?? parsed.error ?? message;
    code = parsed.code ?? code;

    if (parsed.code === 'PGRST205' && typeof parsed.message === 'string' && parsed.message.includes('public.knowledge')) {
      return new ApiError('Supabase 側に knowledge テーブルがありません。schema.sql を実行してください。', code, response.status);
    }
  } catch {
    message = rawText || message;
  }

  if (response.status === 401 || response.status === 403) {
    return new ApiError('ログインの有効期限が切れました。再度ログインしてください。', 'AUTH_REQUIRED', response.status);
  }

  return new ApiError(message, code, response.status);
}

function mapStorageError(response, rawText) {
  let message = rawText || `Storage request failed: ${response.status}`;

  try {
    const parsed = JSON.parse(rawText);
    message = parsed.message ?? parsed.error ?? parsed.error_description ?? message;

    if (typeof message === 'string' && message.toLowerCase().includes('bucket')) {
      return new ApiError(
        `Supabase Storage の ${KNOWLEDGE_IMAGE_BUCKET} バケットが見つかりません。schema.sql を実行してください。`,
        'STORAGE_BUCKET_MISSING',
        response.status,
      );
    }
  } catch {
    if (rawText && rawText.toLowerCase().includes('bucket')) {
      return new ApiError(
        `Supabase Storage の ${KNOWLEDGE_IMAGE_BUCKET} バケットが見つかりません。schema.sql を実行してください。`,
        'STORAGE_BUCKET_MISSING',
        response.status,
      );
    }
  }

  if (response.status === 401 || response.status === 403) {
    return new ApiError('ログインの有効期限が切れました。再度ログインしてください。', 'AUTH_REQUIRED', response.status);
  }

  return new ApiError(message, 'STORAGE_ERROR', response.status);
}

function mapAuthError(response, rawText) {
  let message = rawText || `Auth request failed: ${response.status}`;
  let code = 'AUTH_ERROR';

  try {
    const parsed = JSON.parse(rawText);
    message = parsed.msg ?? parsed.message ?? parsed.error_description ?? parsed.error ?? message;
    code = parsed.code ?? parsed.error ?? code;
  } catch {
    message = rawText || message;
  }

  if (response.status === 400 || response.status === 401) {
    return new ApiError('メールアドレスまたはパスワードが正しくありません。', 'INVALID_CREDENTIALS', response.status);
  }

  return new ApiError(message, code, response.status);
}

async function request(path, init = {}) {
  const headers = {
    ...apiHeaders(),
    ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    ...(init.headers ?? {}),
  };

  const response = await fetch(`${APP_CONFIG.supabaseUrl}/rest/v1${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    const rawText = await response.text();
    const error = mapApiError(response, rawText);
    if (error.code === 'AUTH_REQUIRED') {
      persistSession(null);
    }
    throw error;
  }

  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    return response.text();
  }

  return response.json();
}

async function storageRequest(path, init = {}) {
  const headers = {
    ...apiHeaders(),
    ...(init.headers ?? {}),
  };

  const response = await fetch(`${APP_CONFIG.supabaseUrl}/storage/v1${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    const rawText = await response.text();
    const error = mapStorageError(response, rawText);
    if (error.code === 'AUTH_REQUIRED') {
      persistSession(null);
    }
    throw error;
  }

  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    return response.text();
  }

  return response.json();
}

async function authRequest(path, init = {}) {
  const headers = {
    ...authBaseHeaders(),
    ...(!(init.body instanceof FormData) && init.body ? { 'Content-Type': 'application/json' } : {}),
    ...(init.headers ?? {}),
  };

  const response = await fetch(`${APP_CONFIG.supabaseUrl}/auth/v1${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    const rawText = await response.text();
    throw mapAuthError(response, rawText);
  }

  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    return response.text();
  }

  return response.json();
}

async function refreshSession(refreshToken) {
  const payload = await authRequest('/token?grant_type=refresh_token', {
    method: 'POST',
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  const nextSession = persistSession(payload);
  if (!nextSession?.access_token) {
    throw new ApiError('セッションの更新に失敗しました。再度ログインしてください。', 'AUTH_REFRESH_FAILED', 401);
  }

  return nextSession;
}

function safeFileExtension(file) {
  const byName = file.name?.includes('.') ? file.name.split('.').pop() : '';
  if (byName) {
    return String(byName).toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
  }

  const byType = file.type?.split('/').pop();
  return byType ? byType.toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin' : 'bin';
}

function buildStoragePath(file, knowledgeId = null) {
  const today = new Date().toISOString().slice(0, 10);
  const extension = safeFileExtension(file);
  const recordId = knowledgeId || createId();
  const uploadId = createId();
  return `knowledge/${today}/${recordId}/${uploadId}.${extension}`;
}

function buildPublicStorageUrl(path) {
  return `${APP_CONFIG.supabaseUrl}/storage/v1/object/public/${KNOWLEDGE_IMAGE_BUCKET}/${path}`;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new ApiError('画像の読み込みに失敗しました。', 'FILE_READ_ERROR'));
    reader.readAsDataURL(file);
  });
}

function normalizeKnowledge(record) {
  return {
    id: record.id,
    title: record.title ?? '',
    body: record.body ?? '',
    image_url: record.image_url ?? '',
    category: record.category ?? 'その他',
    source: record.source ?? 'manual',
    is_pending: Boolean(record.is_pending),
    created_at: record.created_at ?? timestamp(),
    updated_at: record.updated_at ?? record.created_at ?? timestamp(),
  };
}

function sortKnowledge(records) {
  return [...records]
    .map(normalizeKnowledge)
    .sort((left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime());
}

function seedMockData() {
  const now = timestamp();
  return sortKnowledge([
    {
      id: createId(),
      title: 'インボイス制度で登録番号の記載が不要になるケース',
      body:
        '3万円未満の公共交通機関による旅客の運送など、一定の取引は適格請求書の保存要件が緩和される。実務では支払先、金額、特例の根拠をセットでメモしておく。',
      image_url: '',
      category: '電帳法・インボイス',
      source: 'manual',
      is_pending: false,
      created_at: now,
      updated_at: now,
    },
    {
      id: createId(),
      title: '役員報酬の定期同額給与チェック手順',
      body:
        '決算確定後3か月以内の改定か、臨時改定事由に該当するかを確認する。株主総会議事録、支給月額、改定月を1件ずつ照合してメモを残す。',
      image_url: '',
      category: '法人税',
      source: 'manual',
      is_pending: false,
      created_at: now,
      updated_at: now,
    },
    {
      id: createId(),
      title: '定額減税の年調チェック順',
      body:
        '扶養人数、月次減税済額、年調減税額、控除不足額の順で確認する。顧問先からの回収資料は一覧にして不足資料を先に洗い出す。',
      image_url: '',
      category: '所得税',
      source: 'manual',
      is_pending: false,
      created_at: now,
      updated_at: now,
    },
    {
      id: createId(),
      title: 'Slack提案: 算定基礎届の回収リマインド手順を保存しますか？',
      body:
        'Agent 17 提案: 6月上旬に顧問先へ対象者一覧を送付し、固定的賃金変動の有無を確認。提出前に4月から6月の支給基礎日数をチェックする。',
      image_url: '',
      category: '社会保険・労務',
      source: 'ai',
      is_pending: true,
      created_at: now,
      updated_at: now,
    },
    {
      id: createId(),
      title: 'Slack提案: 月次巡回後の議事メモ整理フローを保存しますか？',
      body:
        'Agent 17 提案: 面談メモを受領したら、論点を税目別に分けてチーム共有チャンネルに要約。確認中の論点は「確認待ち」を明記して翌営業日に追記する。',
      image_url: '',
      category: '業務手順',
      source: 'ai',
      is_pending: true,
      created_at: now,
      updated_at: now,
    },
  ]);
}

function readMockStore() {
  try {
    const raw = window.localStorage.getItem(MOCK_STORAGE_KEY);
    if (!raw) return seedMockData();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return seedMockData();
    return sortKnowledge(parsed);
  } catch {
    return seedMockData();
  }
}

function writeMockStore(records) {
  const normalized = sortKnowledge(records);
  window.localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export function getAuthSession() {
  return currentSession ? { ...currentSession } : null;
}

export function clearAuthSession() {
  persistSession(null);
}

export async function restoreAuthSession() {
  if (!isRemoteConfigured()) {
    currentSession = null;
    return null;
  }

  const client = getSupabaseAuthClient();
  if (client) {
    const { data, error } = await client.auth.getSession();
    if (error) {
      persistSession(null);
      return null;
    }

    const session = persistSession(data?.session ?? null);
    return session ? { ...session } : null;
  }

  const stored = readStoredSession();
  if (!stored) {
    currentSession = null;
    return null;
  }

  if (!sessionNeedsRefresh(stored)) {
    currentSession = stored;
    return { ...stored };
  }

  if (!stored.refresh_token) {
    persistSession(null);
    return null;
  }

  try {
    const refreshed = await refreshSession(stored.refresh_token);
    return { ...refreshed };
  } catch {
    persistSession(null);
    return null;
  }
}

export async function signInWithPassword({ email, password }) {
  if (!isRemoteConfigured()) {
    throw new ApiError('接続設定を保存してからログインしてください。', 'CONFIG_REQUIRED', 400);
  }

  const client = getSupabaseAuthClient();
  if (client) {
    const { data, error } = await client.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      throw new ApiError('メールアドレスまたはパスワードが正しくありません。', 'INVALID_CREDENTIALS', 401);
    }

    const session = persistSession(data?.session ?? null);
    if (!session?.access_token) {
      throw new ApiError('ログインに失敗しました。', 'AUTH_SESSION_MISSING', 500);
    }

    return { ...session };
  }

  const payload = await authRequest('/token?grant_type=password', {
    method: 'POST',
    body: JSON.stringify({
      email,
      password,
    }),
  });

  const session = persistSession(payload);
  if (!session?.access_token) {
    throw new ApiError('ログインに失敗しました。', 'AUTH_SESSION_MISSING', 500);
  }

  return { ...session };
}

export async function signOutAuth() {
  const client = getSupabaseAuthClient();
  if (client) {
    try {
      await client.auth.signOut();
    } finally {
      persistSession(null);
    }
    return;
  }

  const session = currentSession ?? readStoredSession();

  if (isRemoteConfigured() && session?.access_token) {
    try {
      await authRequest('/logout', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });
    } catch {
      // local cleanup is enough for this app
    }
  }

  persistSession(null);
}

export async function loadKnowledge() {
  if (!isRemoteConfigured()) {
    return readMockStore();
  }

  const payload = await request('/knowledge?select=*');
  return sortKnowledge(payload ?? []);
}

export async function uploadKnowledgeImage(file, knowledgeId = null) {
  if (!(file instanceof File)) {
    throw new ApiError('アップロードする画像ファイルが見つかりません。', 'FILE_MISSING');
  }

  if (!file.type.startsWith('image/')) {
    throw new ApiError('画像ファイルを選択してください。', 'INVALID_FILE_TYPE');
  }

  if (!isRemoteConfigured()) {
    return readFileAsDataUrl(file);
  }

  const path = buildStoragePath(file, knowledgeId);
  await storageRequest(`/${['object', KNOWLEDGE_IMAGE_BUCKET, ...path.split('/')].map(encodeURIComponent).join('/')}`, {
    method: 'POST',
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
      'x-upsert': 'true',
    },
    body: file,
  });

  return buildPublicStorageUrl(path);
}

export async function createKnowledge(input) {
  const now = timestamp();
  const record = normalizeKnowledge({
    ...input,
    id: input.id ?? createId(),
    created_at: input.created_at ?? now,
    updated_at: now,
  });

  if (!isRemoteConfigured()) {
    const store = readMockStore();
    writeMockStore([record, ...store]);
    return record;
  }

  const payload = await request('/knowledge', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(record),
  });

  return normalizeKnowledge(Array.isArray(payload) ? payload[0] : payload);
}

export async function updateKnowledge(id, patch) {
  const nextUpdatedAt = timestamp();

  if (!isRemoteConfigured()) {
    const store = readMockStore();
    const target = store.find((record) => record.id === id);
    if (!target) {
      throw new ApiError('更新対象のナレッジが見つかりません。', 'NOT_FOUND', 404);
    }

    const updated = normalizeKnowledge({
      ...target,
      ...patch,
      updated_at: nextUpdatedAt,
    });
    writeMockStore(store.map((record) => (record.id === id ? updated : record)));
    return updated;
  }

  const payload = await request(`/knowledge?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      ...patch,
      updated_at: nextUpdatedAt,
    }),
  });

  return normalizeKnowledge(Array.isArray(payload) ? payload[0] : payload);
}

export async function deleteKnowledge(id) {
  if (!isRemoteConfigured()) {
    const store = readMockStore();
    writeMockStore(store.filter((record) => record.id !== id));
    return;
  }

  await request(`/knowledge?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function approveKnowledge(id, patch = {}) {
  return updateKnowledge(id, {
    ...patch,
    is_pending: false,
  });
}

export async function rejectKnowledge(id) {
  return deleteKnowledge(id);
}
