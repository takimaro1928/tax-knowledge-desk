import {
  approveKnowledge,
  clearAuthSession,
  getAuthSession,
  getConnectionMode,
  loadKnowledge,
  rejectKnowledge,
  restoreAuthSession,
  signInWithPassword,
  signOutAuth,
  createKnowledge,
} from './api.js?v=20260326-auth1';
import { readAppConfig, saveAppConfig } from './config.js?v=20260326-auth1';

const CATEGORY_ORDER = [
  '法人税',
  '所得税',
  '消費税',
  '社会保険・労務',
  '電帳法・インボイス',
  '業務手順',
  'その他',
];

const CATEGORY_CLASS = {
  法人税: 'cat-corporate',
  所得税: 'cat-income',
  消費税: 'cat-consumption',
  '社会保険・労務': 'cat-social',
  '電帳法・インボイス': 'cat-invoice',
  業務手順: 'cat-workflow',
  その他: 'cat-other',
};

const state = {
  knowledge: [],
  activeTab: 'home',
  selectedKnowledgeId: null,
  searchQuery: '',
  suggestedCategory: 'その他',
  noteStatus: '',
  noteStatusTone: 'neutral',
  configStatus: '',
  formCategoryManual: false,
  authSession: getAuthSession(),
  authStatus: '',
  authStatusTone: 'neutral',
  authSubmitting: false,
};

const els = {
  appShell: document.querySelector('.app-shell'),
  settingsBackdrop: document.querySelector('#settings-backdrop'),
  settingsPanel: document.querySelector('#settings-panel'),
  settingsOpen: document.querySelector('#settings-open'),
  settingsClose: document.querySelector('#settings-close'),
  configForm: document.querySelector('#config-form'),
  configUrl: document.querySelector('#config-url'),
  configAnonKey: document.querySelector('#config-anon-key'),
  configMockMode: document.querySelector('#config-mock-mode'),
  configReset: document.querySelector('#config-reset'),
  configStatus: document.querySelector('#config-status'),
  connectionModeLabel: document.querySelector('#connection-mode-label'),
  authStateLabel: document.querySelector('#auth-state-label'),
  logoutButton: document.querySelector('#logout-button'),
  headerPendingCount: document.querySelector('#header-pending-count'),
  pendingTabBadge: document.querySelector('#pending-tab-badge'),
  tabBar: document.querySelector('#tab-bar'),
  tabButtons: [...document.querySelectorAll('.tab-button')],
  authScreen: document.querySelector('#auth-screen'),
  loginForm: document.querySelector('#login-form'),
  loginEmail: document.querySelector('#login-email'),
  loginPassword: document.querySelector('#login-password'),
  loginSubmit: document.querySelector('#login-submit'),
  loginStatus: document.querySelector('#login-status'),
  homeScreen: document.querySelector('#home-screen'),
  libraryScreen: document.querySelector('#library-screen'),
  pendingScreen: document.querySelector('#pending-screen'),
  noteForm: document.querySelector('#note-form'),
  noteBody: document.querySelector('#note-body'),
  titlePreview: document.querySelector('#title-preview'),
  noteCategory: document.querySelector('#note-category'),
  applyAiCategory: document.querySelector('#apply-ai-category'),
  predictedCategoryTag: document.querySelector('#predicted-category-tag'),
  noteStatus: document.querySelector('#note-status'),
  pendingList: document.querySelector('#pending-list'),
  libraryEyebrow: document.querySelector('#library-eyebrow'),
  libraryTitle: document.querySelector('#library-title'),
  libraryCaption: document.querySelector('#library-caption'),
  searchField: document.querySelector('#search-field'),
  searchInput: document.querySelector('#search-input'),
  knowledgeList: document.querySelector('#knowledge-list'),
  knowledgeDetail: document.querySelector('#knowledge-detail'),
};

init();

async function init() {
  populateCategorySelect();
  bindEvents();
  hydrateConfigForm();
  resetComposer();
  registerServiceWorker();
  await syncAuthState();
  await refreshKnowledge();
}

function populateCategorySelect() {
  els.noteCategory.innerHTML = CATEGORY_ORDER.map(
    (category) => `<option value="${category}">${category}</option>`,
  ).join('');
}

function bindEvents() {
  els.settingsOpen.addEventListener('click', () => setSettingsOpen(true));
  els.settingsClose.addEventListener('click', () => setSettingsOpen(false));
  els.settingsBackdrop.addEventListener('click', () => setSettingsOpen(false));

  els.configForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    saveAppConfig({
      supabaseUrl: els.configUrl.value.trim(),
      supabaseAnonKey: els.configAnonKey.value.trim(),
      useMockData: els.configMockMode.checked,
    });

    clearAuthSession();
    state.authSession = null;
    state.configStatus = '接続設定を保存しました。';
    state.authStatus = getConnectionMode() === 'supabase'
      ? '接続設定を保存しました。続けてログインしてください。'
      : '';
    state.authStatusTone = 'neutral';
    setSettingsOpen(false);
    renderConfigPanel();
    await refreshKnowledge();
  });

  els.configReset.addEventListener('click', async () => {
    saveAppConfig({
      supabaseUrl: '',
      supabaseAnonKey: '',
      useMockData: true,
    });

    clearAuthSession();
    state.authSession = null;
    hydrateConfigForm();
    state.configStatus = '設定を初期化しました。モックデータに切り替えます。';
    state.authStatus = '';
    state.authStatusTone = 'neutral';
    renderConfigPanel();
    await refreshKnowledge();
  });

  els.tabButtons.forEach((button) => {
    button.addEventListener('click', () => setActiveTab(button.dataset.tab));
  });

  els.loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    await handleLogin();
  });

  els.logoutButton.addEventListener('click', async () => {
    await handleLogout();
  });

  els.noteBody.addEventListener('input', () => {
    updateSuggestedCategory();
  });

  els.noteBody.addEventListener('keydown', async (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      await handleSaveNote();
    }
  });

  els.noteCategory.addEventListener('change', () => {
    state.formCategoryManual = true;
    renderHome();
  });

  els.applyAiCategory.addEventListener('click', () => {
    state.formCategoryManual = false;
    els.noteCategory.value = state.suggestedCategory;
    renderHome();
  });

  els.noteForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    await handleSaveNote();
  });

  els.pendingList.addEventListener('click', async (event) => {
    const trigger = event.target.closest('[data-action][data-knowledge-id]');
    if (!trigger) return;

    const knowledgeId = trigger.dataset.knowledgeId;
    const action = trigger.dataset.action;

    if (action === 'view') {
      openKnowledgeInCategory(knowledgeId);
      return;
    }

    if (action === 'approve') {
      await handleApprove(knowledgeId);
      return;
    }

    if (action === 'reject') {
      await handleReject(knowledgeId);
    }
  });

  els.knowledgeList.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-knowledge-id]');
    if (!trigger) return;
    state.selectedKnowledgeId = trigger.dataset.knowledgeId;
    renderLibrary();
  });

  els.searchInput.addEventListener('input', () => {
    state.searchQuery = els.searchInput.value.trim();
    renderLibrary();
  });
}

async function syncAuthState() {
  if (getConnectionMode() !== 'supabase') {
    state.authSession = null;
    state.authStatus = '';
    state.authStatusTone = 'neutral';
    renderAll();
    return;
  }

  state.authSession = await restoreAuthSession();
  if (!state.authSession) {
    state.authStatus = 'メールアドレスとパスワードでログインしてください。';
    state.authStatusTone = 'neutral';
  } else {
    state.authStatus = '';
    state.authStatusTone = 'neutral';
  }

  renderAll();
}

function canUseApp() {
  return getConnectionMode() === 'mock' || Boolean(state.authSession?.access_token);
}

function needsLogin() {
  return getConnectionMode() === 'supabase' && !state.authSession?.access_token;
}

async function refreshKnowledge() {
  if (!canUseApp()) {
    state.knowledge = [];
    ensureSelectionForActiveTab();
    renderAll();
    return;
  }

  try {
    state.knowledge = await loadKnowledge();
  } catch (error) {
    if (error.code === 'AUTH_REQUIRED') {
      clearAuthSession();
      state.authSession = null;
      state.authStatus = error.message;
      state.authStatusTone = 'error';
      state.knowledge = [];
    } else {
      state.noteStatus = error.message;
      state.noteStatusTone = 'error';
    }
  }

  ensureSelectionForActiveTab();
  renderAll();
}

function renderAll() {
  renderConfigPanel();
  renderHeader();
  renderTabs();
  renderAuthScreen();
  renderHome();
  renderLibrary();
  renderPendingScreen();
}

function renderConfigPanel() {
  const mode = getConnectionMode();
  els.connectionModeLabel.textContent = mode === 'supabase' ? 'Supabase' : 'モック';
  els.configStatus.textContent = state.configStatus;
}

function renderHeader() {
  const pendingCount = canUseApp() ? pendingKnowledge().length : 0;
  const isSupabase = getConnectionMode() === 'supabase';
  const email = state.authSession?.user?.email ?? '';

  els.authStateLabel.textContent = isSupabase ? (email || (state.authSession ? 'ログイン中' : '未ログイン')) : '不要';
  els.logoutButton.hidden = !isSupabase || !state.authSession;
  els.headerPendingCount.textContent = `${pendingCount}件`;
  els.pendingTabBadge.hidden = pendingCount < 1;
  els.pendingTabBadge.textContent = String(pendingCount);
}

function renderTabs() {
  els.tabBar.hidden = !canUseApp();
  els.tabButtons.forEach((button) => {
    button.classList.toggle('is-active', button.dataset.tab === state.activeTab);
  });
}

function renderAuthScreen() {
  const show = needsLogin();
  els.authScreen.hidden = !show;
  if (!show) return;

  els.loginSubmit.disabled = state.authSubmitting;
  els.loginSubmit.textContent = state.authSubmitting ? 'ログイン中...' : 'ログイン';
  els.loginStatus.textContent = state.authStatus;
  els.loginStatus.className = `helper-text status-message is-${state.authStatusTone}`;
}

function renderHome() {
  const isActive = state.activeTab === 'home' && canUseApp();
  els.homeScreen.hidden = !isActive;
  if (!isActive) return;

  const title = buildAutoTitle(els.noteBody.value.trim());
  els.titlePreview.textContent = `タイトル候補: ${title}`;
  els.noteStatus.textContent = state.noteStatus;
  els.noteStatus.className = `helper-text status-message is-${state.noteStatusTone}`;
  els.predictedCategoryTag.innerHTML = categoryTag(state.suggestedCategory);

  if (!state.formCategoryManual) {
    els.noteCategory.value = state.suggestedCategory;
  }
}

function renderLibrary() {
  const isActive = !['home', 'pending'].includes(state.activeTab) && canUseApp();
  els.libraryScreen.hidden = !isActive;
  if (!isActive) return;

  const items = visibleKnowledgeForActiveTab();
  ensureSelection(items);
  renderLibraryHeader(items);
  renderKnowledgeList(items);
  renderDetail(items);
}

function renderPendingScreen() {
  const isActive = state.activeTab === 'pending' && canUseApp();
  els.pendingScreen.hidden = !isActive;
  if (!isActive) return;
  renderPendingList();
}

function renderLibraryHeader(items) {
  const isSearch = state.activeTab === 'search';
  els.libraryEyebrow.textContent = isSearch ? 'Search' : 'Category';
  els.libraryTitle.textContent = isSearch ? '横断検索' : state.activeTab;
  els.searchField.hidden = !isSearch;
  els.searchInput.value = state.searchQuery;

  if (isSearch) {
    if (state.searchQuery) {
      els.libraryCaption.textContent = `「${state.searchQuery}」の検索結果 ${items.length}件`;
    } else {
      els.libraryCaption.textContent = 'キーワードを入力すると、全カテゴリを横断して検索できます。';
    }
    return;
  }

  els.libraryCaption.textContent = `${state.activeTab}のナレッジを新しい順で${items.length}件表示しています。`;
}

function renderPendingList() {
  const items = pendingKnowledge();

  if (!items.length) {
    els.pendingList.innerHTML = '<div class="empty-card">承認待ちの提案はありません。</div>';
    return;
  }

  els.pendingList.innerHTML = items
    .map(
      (item) => `
        <article class="pending-card">
          <div class="pending-meta">
            <span class="mini-badge pending">承認待ち</span>
            ${categoryTag(item.category)}
            <span>提案日: ${formatDate(item.created_at)}</span>
          </div>
          <h3>${escapeHtml(item.title)}</h3>
          <p>${escapeHtml(trimText(item.body, 170))}</p>
          <div class="pending-actions">
            <button class="button ghost small" type="button" data-action="view" data-knowledge-id="${item.id}">内容を見る</button>
            <button class="button primary small" type="button" data-action="approve" data-knowledge-id="${item.id}">承認</button>
            <button class="button danger small" type="button" data-action="reject" data-knowledge-id="${item.id}">却下</button>
          </div>
        </article>
      `,
    )
    .join('');
}

function renderKnowledgeList(items) {
  if (state.activeTab === 'search' && !state.searchQuery) {
    els.knowledgeList.innerHTML = '<div class="empty-card">キーワードを入力すると、全カテゴリのナレッジがここに並びます。</div>';
    return;
  }

  if (!items.length) {
    els.knowledgeList.innerHTML = state.activeTab === 'search'
      ? '<div class="empty-card">一致するナレッジは見つかりませんでした。語句を変えて再検索してください。</div>'
      : '<div class="empty-card">このカテゴリのナレッジはまだありません。ホームから最初のノートを保存できます。</div>';
    return;
  }

  els.knowledgeList.innerHTML = items
    .map(
      (item) => `
        <button class="knowledge-card ${item.id === state.selectedKnowledgeId ? 'is-active' : ''}" type="button" data-knowledge-id="${item.id}">
          <div class="knowledge-meta">
            ${categoryTag(item.category)}
            <span>${formatDate(item.created_at)}</span>
          </div>
          <h3>${escapeHtml(item.title)}</h3>
          <p>${escapeHtml(trimText(item.body, 120))}</p>
        </button>
      `,
    )
    .join('');
}

function renderDetail(items) {
  const knowledge = items.find((item) => item.id === state.selectedKnowledgeId) ?? null;
  if (!knowledge) {
    els.knowledgeDetail.className = 'knowledge-detail empty-card';
    els.knowledgeDetail.textContent = state.activeTab === 'search' && !state.searchQuery
      ? 'キーワードを入力して検索すると、ここに詳細が表示されます。'
      : '左の一覧からナレッジを選ぶと、ここに詳細が表示されます。';
    return;
  }

  els.knowledgeDetail.className = 'knowledge-detail';
  els.knowledgeDetail.innerHTML = `
    <div class="detail-meta">
      ${categoryTag(knowledge.category)}
      <span>登録日: ${formatDate(knowledge.created_at)}</span>
      <span>更新日: ${formatDate(knowledge.updated_at)}</span>
    </div>
    <h3>${escapeHtml(knowledge.title)}</h3>
    <div class="knowledge-detail-body">${escapeHtml(knowledge.body)}</div>
  `;
}

async function handleLogin() {
  const email = els.loginEmail.value.trim();
  const password = els.loginPassword.value;

  if (!email || !password) {
    state.authStatus = 'メールアドレスとパスワードを入力してください。';
    state.authStatusTone = 'error';
    renderAuthScreen();
    return;
  }

  state.authSubmitting = true;
  state.authStatus = 'ログイン中です...';
  state.authStatusTone = 'neutral';
  renderAll();

  try {
    state.authSession = await signInWithPassword({ email, password });
    state.authSubmitting = false;
    state.authStatus = '';
    state.authStatusTone = 'neutral';
    els.loginPassword.value = '';
    state.activeTab = 'home';
    await refreshKnowledge();
    requestAnimationFrame(() => els.noteBody.focus());
  } catch (error) {
    state.authSubmitting = false;
    state.authSession = null;
    state.authStatus = error.message;
    state.authStatusTone = 'error';
    renderAll();
  }
}

async function handleLogout() {
  await signOutAuth();
  state.authSession = null;
  state.knowledge = [];
  state.selectedKnowledgeId = null;
  state.authStatus = 'ログアウトしました。';
  state.authStatusTone = 'neutral';
  renderAll();
  requestAnimationFrame(() => els.loginEmail.focus());
}

async function handleSaveNote() {
  const body = els.noteBody.value.trim();
  if (!body) {
    state.noteStatus = 'ノート本文を入力してください。';
    state.noteStatusTone = 'error';
    renderHome();
    return;
  }

  const category = els.noteCategory.value || state.suggestedCategory;
  const title = buildAutoTitle(body);

  try {
    const saved = await createKnowledge({
      title,
      body,
      category,
      source: 'manual',
      is_pending: false,
    });

    state.noteStatus = `「${saved.title}」を ${saved.category} に保存しました。`;
    state.noteStatusTone = 'success';
    state.selectedKnowledgeId = saved.id;
    resetComposer();
    await refreshKnowledge();
    requestAnimationFrame(() => els.noteBody.focus());
  } catch (error) {
    if (error.code === 'AUTH_REQUIRED') {
      clearAuthSession();
      state.authSession = null;
      state.authStatus = error.message;
      state.authStatusTone = 'error';
      await refreshKnowledge();
      return;
    }

    state.noteStatus = error.message;
    state.noteStatusTone = 'error';
    renderHome();
  }
}

async function handleApprove(knowledgeId) {
  const knowledge = getKnowledgeById(knowledgeId);
  if (!knowledge) return;

  try {
    await approveKnowledge(knowledgeId, {
      category: knowledge.category || classifyCategory(knowledge.title, knowledge.body),
    });
    state.noteStatus = '承認待ちのナレッジを保存しました。';
    state.noteStatusTone = 'success';
    await refreshKnowledge();
  } catch (error) {
    if (error.code === 'AUTH_REQUIRED') {
      clearAuthSession();
      state.authSession = null;
      state.authStatus = error.message;
      state.authStatusTone = 'error';
      await refreshKnowledge();
      return;
    }

    state.noteStatus = error.message;
    state.noteStatusTone = 'error';
    renderHome();
  }
}

async function handleReject(knowledgeId) {
  const knowledge = getKnowledgeById(knowledgeId);
  if (!knowledge) return;
  if (!window.confirm(`「${knowledge.title}」を却下します。よろしいですか？`)) return;

  try {
    await rejectKnowledge(knowledgeId);
    state.noteStatus = '承認待ちのナレッジを却下しました。';
    state.noteStatusTone = 'neutral';
    if (state.selectedKnowledgeId === knowledgeId) {
      state.selectedKnowledgeId = null;
    }
    await refreshKnowledge();
  } catch (error) {
    if (error.code === 'AUTH_REQUIRED') {
      clearAuthSession();
      state.authSession = null;
      state.authStatus = error.message;
      state.authStatusTone = 'error';
      await refreshKnowledge();
      return;
    }

    state.noteStatus = error.message;
    state.noteStatusTone = 'error';
    renderHome();
  }
}

function openKnowledgeInCategory(knowledgeId) {
  const knowledge = getKnowledgeById(knowledgeId);
  if (!knowledge) return;
  state.selectedKnowledgeId = knowledgeId;
  setActiveTab(knowledge.category);
}

function setActiveTab(tabId) {
  if (!canUseApp()) return;
  state.activeTab = tabId;
  ensureSelectionForActiveTab();
  renderAll();
}

function ensureSelectionForActiveTab() {
  if (!canUseApp()) {
    state.selectedKnowledgeId = null;
    return;
  }

  if (state.activeTab === 'home' || state.activeTab === 'pending') return;
  ensureSelection(visibleKnowledgeForActiveTab());
}

function ensureSelection(items) {
  if (items.some((item) => item.id === state.selectedKnowledgeId)) return;
  state.selectedKnowledgeId = items[0]?.id ?? null;
}

function visibleKnowledgeForActiveTab() {
  const published = publishedKnowledge();

  if (state.activeTab === 'search') {
    if (!state.searchQuery) return [];
    const query = state.searchQuery.toLowerCase();
    return published.filter((item) => {
      const haystack = `${item.title}\n${item.body}\n${item.category}`.toLowerCase();
      return haystack.includes(query);
    });
  }

  return published.filter((item) => item.category === state.activeTab);
}

function pendingKnowledge() {
  return [...state.knowledge]
    .filter((item) => item.is_pending)
    .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());
}

function publishedKnowledge() {
  return [...state.knowledge]
    .filter((item) => !item.is_pending)
    .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());
}

function resetComposer() {
  state.formCategoryManual = false;
  els.noteBody.value = '';
  updateSuggestedCategory();
}

function updateSuggestedCategory() {
  const body = els.noteBody.value.trim();
  const title = buildAutoTitle(body);
  state.suggestedCategory = classifyCategory(title, body);
  if (!state.formCategoryManual) {
    els.noteCategory.value = state.suggestedCategory;
  }
  renderHome();
}

function buildAutoTitle(body) {
  if (!body) return '無題ノート';
  const firstLine = body
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean);
  return trimText(firstLine || body.replace(/\s+/g, ' ').trim(), 34) || '無題ノート';
}

function classifyCategory(title, body) {
  const text = `${title}\n${body}`.toLowerCase();

  const keywordMap = [
    ['法人税', ['法人税', '別表', '交際費', '役員報酬', '減価償却', '定期同額給与', '申告書']],
    ['所得税', ['所得税', '年末調整', '源泉', '扶養控除', '定額減税', '確定申告', '住宅ローン控除']],
    ['消費税', ['消費税', '簡易課税', '課税売上', '仕入税額控除', '2割特例', '免税事業者']],
    ['社会保険・労務', ['社会保険', '算定基礎', '月額変更', '労働保険', '雇用保険', '傷病手当', '育休', '労務']],
    ['電帳法・インボイス', ['電帳法', '電子帳簿保存法', 'インボイス', '適格請求書', '登録番号', 'スキャナ保存']],
    ['業務手順', ['手順', 'フロー', 'チェックリスト', '対応方法', '回収', '提出', '顧問先', 'Slack', 'Agent 17']],
  ];

  for (const [category, keywords] of keywordMap) {
    if (keywords.some((keyword) => text.includes(keyword.toLowerCase()))) {
      return category;
    }
  }

  return 'その他';
}

function categoryTag(category) {
  return `<span class="tag category-tag ${CATEGORY_CLASS[category] ?? 'cat-other'}">${escapeHtml(category)}</span>`;
}

function getKnowledgeById(id) {
  return state.knowledge.find((item) => item.id === id) ?? null;
}

function hydrateConfigForm() {
  const config = readAppConfig();
  els.configUrl.value = config.supabaseUrl ?? '';
  els.configAnonKey.value = config.supabaseAnonKey ?? '';
  els.configMockMode.checked = Boolean(config.useMockData);
}

function setSettingsOpen(open) {
  els.appShell.classList.toggle('is-settings-open', open);
  els.settingsBackdrop.hidden = !open;
  els.settingsPanel.setAttribute('aria-hidden', String(!open));
}

function formatDate(value) {
  if (!value) return '未設定';
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));
}

function trimText(text, maxLength) {
  if (!text) return '';
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
