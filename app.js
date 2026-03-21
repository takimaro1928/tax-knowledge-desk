import {
  approveKnowledge,
  createKnowledge,
  deleteKnowledge,
  getConnectionMode,
  loadKnowledge,
  rejectKnowledge,
  uploadKnowledgeImage,
  updateKnowledge,
} from './api.js';
import { readAppConfig, saveAppConfig } from './config.js';

const CATEGORIES = [
  '法人税',
  '所得税',
  '消費税',
  '社会保険・労務',
  '電帳法・インボイス',
  '業務手順',
  'その他',
];

const SOURCE_LABELS = {
  manual: '手動入力',
  ai: 'AI提案',
};

const state = {
  knowledge: [],
  selectedKnowledgeId: null,
  editingKnowledgeId: null,
  filters: {
    query: '',
    category: 'all',
    status: 'all',
    sort: 'updated_at',
  },
  formCategoryManual: false,
  suggestedCategory: 'その他',
  formStatus: '',
  configStatus: '',
  loading: false,
  pendingImageFile: null,
  pendingImagePreviewUrl: '',
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
  metrics: document.querySelector('#metrics'),
  heroSuggestionLabel: document.querySelector('#hero-suggestion-label'),
  heroPendingCount: document.querySelector('#hero-pending-count'),
  searchInput: document.querySelector('#search-input'),
  categoryFilter: document.querySelector('#category-filter'),
  statusFilter: document.querySelector('#status-filter'),
  sortSelect: document.querySelector('#sort-select'),
  knowledgeList: document.querySelector('#knowledge-list'),
  knowledgeDetail: document.querySelector('#knowledge-detail'),
  pendingList: document.querySelector('#pending-list'),
  formTitle: document.querySelector('#form-title'),
  knowledgeForm: document.querySelector('#knowledge-form'),
  knowledgeTitle: document.querySelector('#knowledge-title'),
  knowledgeBody: document.querySelector('#knowledge-body'),
  knowledgeCategory: document.querySelector('#knowledge-category'),
  aiCategoryLabel: document.querySelector('#ai-category-label'),
  applyAiCategory: document.querySelector('#apply-ai-category'),
  knowledgeImageUrl: document.querySelector('#knowledge-image-url'),
  knowledgeImageFile: document.querySelector('#knowledge-image-file'),
  imagePreview: document.querySelector('#image-preview'),
  imageUploadCaption: document.querySelector('#image-upload-caption'),
  resetForm: document.querySelector('#reset-form'),
  deleteKnowledge: document.querySelector('#delete-knowledge'),
  formStatus: document.querySelector('#form-status'),
};

init();

async function init() {
  populateCategorySelects();
  bindEvents();
  hydrateConfigForm();
  resetEditor();
  registerServiceWorker();
  await refreshKnowledge();
}

function populateCategorySelects() {
  els.categoryFilter.innerHTML = ['<option value="all">すべて</option>']
    .concat(CATEGORIES.map((category) => `<option value="${category}">${category}</option>`))
    .join('');

  els.knowledgeCategory.innerHTML = CATEGORIES.map(
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

    state.configStatus = '接続設定を保存しました。';
    renderConfigPanel();
    setSettingsOpen(false);
    await refreshKnowledge();
  });

  els.configReset.addEventListener('click', async () => {
    saveAppConfig({
      supabaseUrl: '',
      supabaseAnonKey: '',
      useMockData: true,
    });
    hydrateConfigForm();
    state.configStatus = '設定を初期化しました。モックデータに切り替えます。';
    renderConfigPanel();
    await refreshKnowledge();
  });

  els.searchInput.addEventListener('input', () => {
    state.filters.query = els.searchInput.value.trim();
    renderExplorer();
  });

  els.categoryFilter.addEventListener('change', () => {
    state.filters.category = els.categoryFilter.value;
    renderExplorer();
  });

  els.statusFilter.addEventListener('change', () => {
    state.filters.status = els.statusFilter.value;
    renderExplorer();
  });

  els.sortSelect.addEventListener('change', () => {
    state.filters.sort = els.sortSelect.value;
    renderExplorer();
  });

  els.knowledgeList.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-knowledge-id]');
    if (!trigger) return;
    selectKnowledge(trigger.dataset.knowledgeId);
  });

  els.pendingList.addEventListener('click', async (event) => {
    const trigger = event.target.closest('[data-action][data-knowledge-id]');
    if (!trigger) return;

    const knowledgeId = trigger.dataset.knowledgeId;
    const action = trigger.dataset.action;

    if (action === 'view') {
      selectKnowledge(knowledgeId);
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

  els.knowledgeForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    await handleSave();
  });

  els.resetForm.addEventListener('click', () => {
    resetEditor();
    renderForm();
  });

  els.deleteKnowledge.addEventListener('click', async () => {
    if (!state.editingKnowledgeId) {
      state.formStatus = '削除するナレッジを選択してください。';
      renderForm();
      return;
    }

    const target = getKnowledgeById(state.editingKnowledgeId);
    if (!target) return;

    if (!window.confirm(`「${target.title}」を削除します。よろしいですか？`)) return;

    try {
      await deleteKnowledge(target.id);
      state.formStatus = 'ナレッジを削除しました。';
      state.selectedKnowledgeId = state.selectedKnowledgeId === target.id ? null : state.selectedKnowledgeId;
      resetEditor();
      await refreshKnowledge();
    } catch (error) {
      state.formStatus = error.message;
      renderForm();
    }
  });

  [els.knowledgeTitle, els.knowledgeBody].forEach((input) => {
    input.addEventListener('input', () => {
      updateSuggestedCategory();
    });
  });

  els.knowledgeCategory.addEventListener('change', () => {
    state.formCategoryManual = true;
    renderForm();
  });

  els.applyAiCategory.addEventListener('click', () => {
    state.formCategoryManual = false;
    els.knowledgeCategory.value = state.suggestedCategory;
    renderForm();
  });

  els.knowledgeImageUrl.addEventListener('input', () => {
    clearPendingImageSelection({ keepFileInput: false });
    renderImagePreview(els.knowledgeImageUrl.value.trim());
  });

  els.knowledgeImageFile.addEventListener('change', async () => {
    const [file] = els.knowledgeImageFile.files ?? [];
    if (!file) {
      clearPendingImageSelection({ keepFileInput: true });
      renderForm();
      return;
    }

    if (!file.type.startsWith('image/')) {
      clearPendingImageSelection({ keepFileInput: false });
      state.formStatus = '画像ファイルを選択してください。';
      renderForm();
      return;
    }

    setPendingImageFile(file);
    state.formStatus = '画像は保存時に Supabase Storage へアップロードされます。';
    renderForm();
  });
}

async function refreshKnowledge() {
  state.loading = true;
  renderMetrics();
  renderExplorer();
  renderDetail();
  renderPending();

  try {
    state.knowledge = await loadKnowledge();
    if (!getKnowledgeById(state.selectedKnowledgeId)) {
      state.selectedKnowledgeId = state.knowledge[0]?.id ?? null;
    }
    if (state.editingKnowledgeId) {
      const editing = getKnowledgeById(state.editingKnowledgeId);
      if (editing) {
        loadEditor(editing);
      }
    }
    renderAll();
  } catch (error) {
    state.formStatus = error.message;
    renderAll();
  } finally {
    state.loading = false;
    renderAll();
  }
}

function renderAll() {
  renderConfigPanel();
  renderMetrics();
  renderExplorer();
  renderDetail();
  renderPending();
  renderForm();
}

function renderConfigPanel() {
  const mode = getConnectionMode();
  els.connectionModeLabel.textContent = mode === 'supabase' ? 'Supabase' : 'モック';
  els.configStatus.textContent = state.configStatus;
}

function hydrateConfigForm() {
  const config = readAppConfig();
  els.configUrl.value = config.supabaseUrl ?? '';
  els.configAnonKey.value = config.supabaseAnonKey ?? '';
  els.configMockMode.checked = Boolean(config.useMockData);
}

function renderMetrics() {
  const published = state.knowledge.filter((item) => !item.is_pending);
  const pending = state.knowledge.filter((item) => item.is_pending);
  const categoryCount = new Set(published.map((item) => item.category)).size;
  const updatedThisWeek = published.filter((item) => isWithinDays(item.updated_at, 7)).length;

  els.metrics.innerHTML = [
    metricCard('登録済みナレッジ', `${published.length}件`, '公開済みの記事数'),
    metricCard('承認待ち提案', `${pending.length}件`, 'Agent 17 からの保存提案'),
    metricCard('利用カテゴリ数', `${categoryCount}種`, '現在使われているカテゴリ'),
    metricCard('今週の更新', `${updatedThisWeek}件`, '直近7日で更新された記事'),
  ].join('');

  els.heroPendingCount.textContent = `${pending.length}件`;
}

function metricCard(label, value, caption) {
  return `
    <article class="metric-card">
      <span class="eyebrow">${label}</span>
      <strong>${value}</strong>
      <p class="helper-text">${caption}</p>
    </article>
  `;
}

function renderExplorer() {
  const items = filteredKnowledge();

  if (!items.length) {
    els.knowledgeList.innerHTML = '<div class="empty-card">条件に合うナレッジが見つかりません。</div>';
    return;
  }

  els.knowledgeList.innerHTML = items
    .map((item) => {
      const summary = escapeHtml(trimText(item.body, 110));
      return `
        <button class="knowledge-card ${item.id === state.selectedKnowledgeId ? 'is-active' : ''}" type="button" data-knowledge-id="${item.id}">
          <div class="knowledge-meta">
            <span class="tag">${escapeHtml(item.category)}</span>
            <span class="tag ${item.is_pending ? 'pending' : 'manual'}">${item.is_pending ? '承認待ち' : sourceLabel(item.source)}</span>
          </div>
          <h3>${escapeHtml(item.title)}</h3>
          <p>${summary}</p>
          <div class="knowledge-meta">
            <span>登録: ${formatDate(item.created_at)}</span>
            <span>更新: ${formatDate(item.updated_at)}</span>
          </div>
        </button>
      `;
    })
    .join('');
}

function renderDetail() {
  const knowledge = getKnowledgeById(state.selectedKnowledgeId);
  if (!knowledge) {
    els.knowledgeDetail.className = 'knowledge-detail empty-card';
    els.knowledgeDetail.textContent = '一覧からナレッジを選択すると内容が表示されます。';
    return;
  }

  const imageMarkup = knowledge.image_url
    ? `<img class="knowledge-detail-image" src="${escapeAttribute(knowledge.image_url)}" alt="${escapeAttribute(knowledge.title)}" />`
    : '';

  els.knowledgeDetail.className = 'knowledge-detail';
  els.knowledgeDetail.innerHTML = `
    <div class="detail-meta">
      <span class="tag">${escapeHtml(knowledge.category)}</span>
      <span class="tag ${knowledge.is_pending ? 'pending' : 'manual'}">${knowledge.is_pending ? '承認待ち' : sourceLabel(knowledge.source)}</span>
      <span>登録: ${formatDate(knowledge.created_at)}</span>
      <span>更新: ${formatDate(knowledge.updated_at)}</span>
    </div>
    <h3>${escapeHtml(knowledge.title)}</h3>
    ${imageMarkup}
    <div class="knowledge-detail-body">${escapeHtml(knowledge.body)}</div>
  `;
}

function renderPending() {
  const pendingItems = state.knowledge.filter((item) => item.is_pending);

  if (!pendingItems.length) {
    els.pendingList.innerHTML = '<div class="empty-card">承認待ちの提案はありません。</div>';
    return;
  }

  els.pendingList.innerHTML = pendingItems
    .map(
      (item) => `
        <article class="pending-card">
          <div class="pending-meta">
            <span class="tag pending">承認待ち</span>
            <span>${escapeHtml(item.category)}</span>
            <span>提案日: ${formatDate(item.created_at)}</span>
          </div>
          <h3>${escapeHtml(item.title)}</h3>
          <p>${escapeHtml(trimText(item.body, 160))}</p>
          <div class="pending-actions">
            <button class="button ghost small" type="button" data-action="view" data-knowledge-id="${item.id}">内容を見る</button>
            <button class="button primary small" type="button" data-action="approve" data-knowledge-id="${item.id}">承認して保存</button>
            <button class="button danger small" type="button" data-action="reject" data-knowledge-id="${item.id}">却下</button>
          </div>
        </article>
      `,
    )
    .join('');
}

function renderForm() {
  const editing = getKnowledgeById(state.editingKnowledgeId);
  els.formTitle.textContent = editing ? 'ナレッジ編集' : 'ナレッジ登録';
  els.aiCategoryLabel.textContent = state.suggestedCategory;
  els.heroSuggestionLabel.textContent = state.suggestedCategory;
  els.formStatus.textContent = state.formStatus;
  els.imageUploadCaption.textContent =
    state.pendingImageFile
      ? `選択中: ${state.pendingImageFile.name} を保存時にアップロードします。`
      : getConnectionMode() === 'supabase'
        ? 'Supabase 接続時は画像ファイルを Storage に保存し、image_url には公開URLを記録します。'
        : 'モックモードでは画像ファイルをローカル保存用の data URL として保持します。';
  renderImagePreview(els.knowledgeImageUrl.value.trim());
}

function resetEditor() {
  state.editingKnowledgeId = null;
  state.formCategoryManual = false;
  state.formStatus = '';
  clearPendingImageSelection({ keepFileInput: false });
  els.knowledgeForm.reset();
  els.knowledgeCategory.value = CATEGORIES[0];
  updateSuggestedCategory();
}

function loadEditor(knowledge) {
  state.editingKnowledgeId = knowledge.id;
  state.formStatus = '';
  state.formCategoryManual = true;
  clearPendingImageSelection({ keepFileInput: false });
  els.knowledgeTitle.value = knowledge.title;
  els.knowledgeBody.value = knowledge.body;
  els.knowledgeCategory.value = knowledge.category;
  els.knowledgeImageUrl.value = knowledge.image_url ?? '';
  updateSuggestedCategory();
}

function selectKnowledge(knowledgeId) {
  const knowledge = getKnowledgeById(knowledgeId);
  if (!knowledge) return;
  state.selectedKnowledgeId = knowledgeId;
  loadEditor(knowledge);
  renderAll();
}

async function handleSave() {
  const payload = readFormPayload();
  if (!payload) return;

  try {
    if (state.pendingImageFile) {
      state.formStatus = '画像をアップロードしています...';
      renderForm();
      payload.image_url = await uploadKnowledgeImage(state.pendingImageFile, state.editingKnowledgeId);
    }

    let saved;

    if (state.editingKnowledgeId) {
      const original = getKnowledgeById(state.editingKnowledgeId);
      saved = await updateKnowledge(state.editingKnowledgeId, {
        ...payload,
        source: original?.source ?? 'manual',
        is_pending: original?.is_pending ?? false,
      });
      state.formStatus = 'ナレッジを更新しました。';
    } else {
      saved = await createKnowledge({
        ...payload,
        source: 'manual',
        is_pending: false,
      });
      state.formStatus = 'ナレッジを登録しました。';
    }

    state.selectedKnowledgeId = saved.id;
    state.editingKnowledgeId = saved.id;
    clearPendingImageSelection({ keepFileInput: false });
    await refreshKnowledge();
  } catch (error) {
    state.formStatus = error.message;
    renderForm();
  }
}

async function handleApprove(knowledgeId) {
  const knowledge = getKnowledgeById(knowledgeId);
  if (!knowledge) return;

  try {
    const approved = await approveKnowledge(knowledgeId, {
      category: knowledge.category || classifyCategory(knowledge.title, knowledge.body),
    });
    state.selectedKnowledgeId = approved.id;
    state.editingKnowledgeId = approved.id;
    state.formStatus = 'AI提案を承認して保存しました。';
    await refreshKnowledge();
  } catch (error) {
    state.formStatus = error.message;
    renderForm();
  }
}

async function handleReject(knowledgeId) {
  const knowledge = getKnowledgeById(knowledgeId);
  if (!knowledge) return;
  if (!window.confirm(`「${knowledge.title}」を却下します。よろしいですか？`)) return;

  try {
    await rejectKnowledge(knowledgeId);
    if (state.selectedKnowledgeId === knowledgeId) {
      state.selectedKnowledgeId = null;
    }
    if (state.editingKnowledgeId === knowledgeId) {
      resetEditor();
    }
    state.formStatus = 'AI提案を却下しました。';
    await refreshKnowledge();
  } catch (error) {
    state.formStatus = error.message;
    renderForm();
  }
}

function readFormPayload() {
  const title = els.knowledgeTitle.value.trim();
  const body = els.knowledgeBody.value.trim();
  const category = els.knowledgeCategory.value;
  const imageUrl = els.knowledgeImageUrl.value.trim();

  if (!title || !body) {
    state.formStatus = 'タイトルと本文を入力してください。';
    renderForm();
    return null;
  }

  return {
    title,
    body,
    category,
    image_url: imageUrl,
  };
}

function filteredKnowledge() {
  const query = state.filters.query.toLowerCase();

  return [...state.knowledge]
    .filter((item) => {
      if (state.filters.category !== 'all' && item.category !== state.filters.category) {
        return false;
      }

      if (state.filters.status === 'published' && item.is_pending) {
        return false;
      }

      if (state.filters.status === 'pending' && !item.is_pending) {
        return false;
      }

      if (!query) {
        return true;
      }

      const haystack = `${item.title}\n${item.body}`.toLowerCase();
      return haystack.includes(query);
    })
    .sort((left, right) => {
      const field = state.filters.sort;
      return new Date(right[field]).getTime() - new Date(left[field]).getTime();
    });
}

function updateSuggestedCategory() {
  state.suggestedCategory = classifyCategory(els.knowledgeTitle.value.trim(), els.knowledgeBody.value.trim());
  if (!state.formCategoryManual) {
    els.knowledgeCategory.value = state.suggestedCategory;
  }
  renderForm();
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

function getKnowledgeById(id) {
  return state.knowledge.find((item) => item.id === id) ?? null;
}

function sourceLabel(source) {
  return SOURCE_LABELS[source] ?? source ?? '未設定';
}

function setSettingsOpen(open) {
  els.appShell.classList.toggle('is-settings-open', open);
  els.settingsBackdrop.hidden = !open;
  els.settingsPanel.setAttribute('aria-hidden', String(!open));
}

function renderImagePreview(url) {
  const previewUrl = state.pendingImagePreviewUrl || url;

  if (!previewUrl) {
    els.imagePreview.className = 'image-preview empty-card';
    els.imagePreview.textContent = '画像を登録するとここにプレビューが表示されます。';
    return;
  }

  els.imagePreview.className = 'image-preview';
  els.imagePreview.innerHTML = `<img class="preview-image" src="${escapeAttribute(previewUrl)}" alt="プレビュー画像" />`;
}

function formatDate(value) {
  if (!value) return '未設定';
  const date = new Date(value);
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function isWithinDays(value, days) {
  if (!value) return false;
  const diff = Date.now() - new Date(value).getTime();
  return diff <= days * 24 * 60 * 60 * 1000;
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

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll('\n', '&#10;');
}

function setPendingImageFile(file) {
  clearPendingImageSelection({ keepFileInput: true });
  state.pendingImageFile = file;
  state.pendingImagePreviewUrl = URL.createObjectURL(file);
}

function clearPendingImageSelection({ keepFileInput }) {
  if (state.pendingImagePreviewUrl) {
    URL.revokeObjectURL(state.pendingImagePreviewUrl);
  }

  state.pendingImageFile = null;
  state.pendingImagePreviewUrl = '';

  if (!keepFileInput) {
    els.knowledgeImageFile.value = '';
  }
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
