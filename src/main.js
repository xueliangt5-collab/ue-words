import { createIcons, icons } from 'lucide';
import './styles.css';
import { BUILTIN_TERMS } from './terms.js';
import SPEECH_ASSETS from './speech-assets.json';
import {
  DEFAULT_SETTINGS,
  addActivity,
  clearAllLearningData,
  deleteCustomTerm,
  exportDatabase,
  getActivity,
  getAllProgress,
  getCustomTerms,
  getSettings,
  importDatabase,
  saveCustomTerm,
  saveProgress,
  saveSetting,
} from './db.js';
import {
  REVIEW_RATINGS,
  buildReviewQueue,
  calculateStreak,
  isDue,
  localDateKey,
  previewIntervals,
  scheduleReview,
} from './review.js';
import {
  getCloudUser,
  isCloudConfigured,
  onCloudAuthChange,
  sendLoginLink,
  signOutCloud,
  syncNow,
} from './sync.js';

const app = document.getElementById('app');
const baseCategories = [
  'UE 基础',
  '蓝图逻辑',
  '资源与渲染',
  '动画与碰撞',
  '游戏测试',
  '故障与性能',
  '构建与网络',
  '游戏开发',
  '性能分析',
  '软件工程',
  '图形与渲染',
  'AI 与数据',
  '项目管理',
  '通用英语',
];

const state = {
  view: 'library',
  terms: [],
  customTerms: [],
  progress: [],
  progressMap: new Map(),
  activity: [],
  settings: { ...DEFAULT_SETTINGS },
  selectedId: 'actor',
  search: '',
  category: '',
  threadCategory: '',
  listMode: 'all',
  reviewSession: null,
  reviewRevealed: false,
  installPrompt: null,
  installedApp: false,
  installChecked: false,
  cloudUser: null,
  cloudRestoring: true,
  syncing: false,
  lastSpokenTermId: '',
};

let syncTimer;
let speechRequestId = 0;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  })[character]);
}

function textList(value) {
  if (Array.isArray(value)) return value.map(item => String(item || '').trim()).filter(Boolean);
  const item = String(value || '').trim();
  return item ? [item] : [];
}

function identityKey(value) {
  return String(value || '').normalize('NFKC').toLocaleLowerCase().replace(/[\s:._/\\()[\]{}-]+/g, '');
}

function termIdentityKeys(term) {
  return [term.term, term.spokenForm, ...textList(term.aliases)].map(identityKey).filter(Boolean);
}

function relatedTermRecords(term) {
  return Array.isArray(term.relatedTerms)
    ? term.relatedTerms.filter(item => item && typeof item === 'object' && String(item.term || '').trim())
    : [];
}

function contextRecords(term) {
  return Array.isArray(term.contexts)
    ? term.contexts.filter(item => item && typeof item === 'object' && String(item.phrase || '').trim())
    : [];
}

function searchableTermText(term) {
  const related = relatedTermRecords(term).flatMap(item => [item.term, item.relation, item.explanation]);
  const contexts = contextRecords(term).flatMap(item => [item.phrase, item.explanation, item.experience]);
  return [
    term.term,
    ...textList(term.aliases),
    term.spokenForm,
    term.threadCategory,
    term.ipa,
    term.zh,
    term.definition,
    term.example,
    term.exampleZh,
    term.tags,
    term.source,
    ...textList(term.usageNotes),
    ...related,
    ...contexts,
  ].join(' ').toLocaleLowerCase();
}

function icon(name) {
  return `<i data-lucide="${name}" aria-hidden="true"></i>`;
}

function hydrateIcons() {
  createIcons({ icons, attrs: { width: 18, height: 18, 'stroke-width': 1.8 } });
}

function allCategories() {
  return [...new Set([...baseCategories, ...state.terms.map(term => term.category).filter(Boolean)])];
}

function allThreadCategories() {
  return [...new Set(state.terms.map(term => term.threadCategory).filter(Boolean))].sort((left, right) => left.localeCompare(right, 'en'));
}

function formatTime(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function showToast(message, type = 'success') {
  const region = document.querySelector('.toast-region');
  const toast = document.createElement('div');
  toast.className = `toast ${type === 'error' ? 'error' : ''}`;
  toast.setAttribute('role', 'status');
  toast.innerHTML = `${icon(type === 'error' ? 'circle-alert' : 'circle-check')}<span>${escapeHtml(message)}</span>`;
  region.appendChild(toast);
  hydrateIcons();
  window.setTimeout(() => toast.remove(), 3200);
}

function cloudLabel() {
  if (!isCloudConfigured()) return '本机模式';
  if (state.cloudRestoring) return '正在恢复登录';
  if (state.syncing) return '正在同步';
  if (state.cloudUser) return '云端已连接';
  return '等待登录';
}

function renderShell() {
  app.innerHTML = `
    <div class="app-shell">
      <header class="topbar">
        <div class="brand" aria-label="UE 术语随身学">
          <span class="brand-mark">UE</span>
          <span class="brand-copy"><strong>UE 术语随身学</strong><span>Unreal Engine · Game QA</span></span>
        </div>
        <nav class="main-nav" aria-label="主要导航">
          <button class="nav-button" type="button" data-view="library">${icon('library')}<span>词库</span></button>
          <button class="nav-button" type="button" data-view="review">${icon('layers')}<span>复习</span></button>
          <button class="nav-button" type="button" data-view="progress">${icon('chart-no-axes-column-increasing')}<span>进度</span></button>
          <button class="nav-button" type="button" data-view="settings">${icon('settings-2')}<span>设置</span></button>
        </nav>
        <div class="topbar-actions">
          <span class="sync-indicator ${state.cloudUser ? 'is-online' : ''}" id="sync-indicator"><span class="sync-dot"></span><span>${cloudLabel()}</span></span>
          <button class="button" id="install-button" type="button" hidden>${icon('download')}<span>安装</span></button>
        </div>
      </header>
      <main class="app-main" id="view-root"></main>
      <div class="speech-player" id="speech-player" hidden>
        <audio id="speech-audio" controls preload="none"></audio>
        <button class="icon-button" id="close-speech-player" type="button" aria-label="关闭读音播放器">${icon('x')}</button>
      </div>
      <div class="toast-region" aria-live="polite"></div>
      ${termDialogMarkup()}
      ${installDialogMarkup()}
      <input class="sr-only" id="backup-file" type="file" accept="application/json,.json">
    </div>
  `;

  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
  document.getElementById('install-button').addEventListener('click', installApp);
  document.getElementById('close-speech-player').addEventListener('click', stopOnlineVoice);
  bindTermDialog();
  bindInstallDialog();
  updateChrome();
}

function updateChrome() {
  document.querySelectorAll('[data-view]').forEach(button => {
    button.setAttribute('aria-selected', String(button.dataset.view === state.view));
  });
  const indicator = document.getElementById('sync-indicator');
  if (indicator) {
    indicator.classList.toggle('is-online', Boolean(state.cloudUser));
    indicator.querySelector('span:last-child').textContent = cloudLabel();
  }
  const installButton = document.getElementById('install-button');
  if (installButton) {
    const status = installStatus();
    installButton.hidden = status === 'installed' || status === 'checking';
    installButton.setAttribute('aria-label', status === 'prompt-ready' ? '安装到设备' : '查看安装方法');
    installButton.innerHTML = `${icon(status === 'prompt-ready' ? 'download' : 'smartphone')}<span>${status === 'prompt-ready' ? '安装' : '安装方法'}</span>`;
  }
  hydrateIcons();
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function installStatus() {
  if (isStandalone() || state.installedApp) return 'installed';
  if (state.installPrompt) return 'prompt-ready';
  if (!state.installChecked) return 'checking';
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ? 'manual-ios' : 'manual-browser';
}

async function refreshInstallStatus() {
  state.installedApp = isStandalone();
  if (state.installedApp) localStorage.setItem('ue-words-installed', 'true');
  const recordedInstall = localStorage.getItem('ue-words-installed') === 'true';
  if (!state.installedApp && 'getInstalledRelatedApps' in navigator) {
    try {
      const relatedApps = await navigator.getInstalledRelatedApps();
      state.installedApp = relatedApps.length > 0 || recordedInstall;
    } catch {
      // Some browsers expose the API but do not allow it for every install source.
      state.installedApp = recordedInstall;
    }
  } else if (!state.installedApp) {
    state.installedApp = recordedInstall;
  }
  state.installChecked = true;
  updateChrome();
  if (state.view === 'settings') renderSettings();
}

function installDialogMarkup() {
  return `
    <dialog id="install-dialog">
      <div class="dialog-header">
        <h2 id="install-dialog-title">添加到设备</h2>
        <button class="icon-button" id="close-install-dialog" type="button" aria-label="关闭">${icon('x')}</button>
      </div>
      <div class="dialog-body install-help" id="install-dialog-body"></div>
      <div class="dialog-footer"><button class="button primary" id="confirm-install-help" type="button">知道了</button></div>
    </dialog>
  `;
}

function bindInstallDialog() {
  const dialog = document.getElementById('install-dialog');
  document.getElementById('close-install-dialog').addEventListener('click', () => dialog.close());
  document.getElementById('confirm-install-help').addEventListener('click', () => dialog.close());
}

function showInstallHelp() {
  const dialog = document.getElementById('install-dialog');
  const body = document.getElementById('install-dialog-body');
  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isAndroid = /Android/.test(navigator.userAgent);
  if (isIos) {
    body.innerHTML = `<div class="install-help-step">${icon('share-2')}<span><strong>1. 点击浏览器底部的分享按钮</strong><small>请使用 Safari 打开当前页面。</small></span></div><div class="install-help-step">${icon('square-plus')}<span><strong>2. 选择“添加到主屏幕”</strong><small>确认名称后点击“添加”。</small></span></div>`;
  } else if (isAndroid) {
    body.innerHTML = `<div class="install-help-step">${icon('ellipsis-vertical')}<span><strong>1. 打开浏览器菜单</strong><small>通常位于浏览器右上角。</small></span></div><div class="install-help-step">${icon('square-plus')}<span><strong>2. 选择“安装应用”或“添加到主屏幕”</strong><small>不同浏览器的名称可能略有不同。</small></span></div>`;
  } else {
    body.innerHTML = `<div class="install-help-step">${icon('monitor-down')}<span><strong>在地址栏或浏览器菜单中选择安装</strong><small>Chrome 和 Edge 通常会显示“安装应用”入口。若没有入口，请确认当前页面使用 HTTPS 打开。</small></span></div>`;
  }
  dialog.showModal();
  hydrateIcons();
}

async function hydrate({ render = true } = {}) {
  const [customTerms, progress, settings, activity] = await Promise.all([
    getCustomTerms(),
    getAllProgress(),
    getSettings(),
    getActivity(),
  ]);
  state.customTerms = customTerms;
  state.terms = [...BUILTIN_TERMS, ...customTerms].sort((left, right) => left.term.localeCompare(right.term, 'en'));
  state.progress = progress;
  state.progressMap = new Map(progress.map(record => [record.termId, record]));
  state.settings = settings;
  state.activity = activity.sort((left, right) => new Date(right.reviewedAt) - new Date(left.reviewedAt));
  if (!state.terms.some(term => term.id === state.selectedId)) state.selectedId = state.terms[0]?.id || '';
  if (render) renderCurrentView();
}

function setView(view) {
  state.view = view;
  if (view === 'review') startReviewSession();
  renderCurrentView();
}

function renderCurrentView() {
  updateChrome();
  if (state.view === 'library') renderLibrary();
  if (state.view === 'review') renderReview();
  if (state.view === 'progress') renderProgress();
  if (state.view === 'settings') renderSettings();
  hydrateIcons();
}

function filteredTerms() {
  const query = state.search.trim().toLocaleLowerCase();
  return state.terms.filter(term => {
    const progress = state.progressMap.get(term.id);
    const matchesMode = state.listMode === 'all'
      || (state.listMode === 'favorites' && progress?.favorite)
      || (state.listMode === 'custom' && term.custom);
    const matchesCategory = !state.category || term.category === state.category;
    const matchesThread = !state.threadCategory || term.threadCategory === state.threadCategory;
    const haystack = searchableTermText(term);
    return matchesMode && matchesCategory && matchesThread && (!query || haystack.includes(query));
  });
}

function renderLibrary() {
  const results = filteredTerms();
  if (!results.some(term => term.id === state.selectedId)) state.selectedId = results[0]?.id || '';
  const selected = results.find(term => term.id === state.selectedId);
  const root = document.getElementById('view-root');
  root.innerHTML = `
    <div class="view-header">
      <div><h1>术语词库</h1><p>共 ${state.terms.length} 条，个人词条 ${state.customTerms.length} 条</p></div>
      <div class="header-actions">
        <button class="button primary" id="add-term" type="button">${icon('plus')}添加术语</button>
        <button class="button" id="start-review" type="button">${icon('layers')}开始今日复习</button>
      </div>
    </div>
    <div class="library-toolbar">
      <label class="search-field">
        <span class="sr-only">搜索术语或中文</span>
        ${icon('search')}
        <input class="field" id="term-search" type="search" value="${escapeHtml(state.search)}" placeholder="搜索英文、中文、解释或标签">
      </label>
      <label>
        <span class="sr-only">分类</span>
        <select class="select" id="category-filter">
          <option value="">全部分类</option>
          ${allCategories().map(category => `<option value="${escapeHtml(category)}" ${category === state.category ? 'selected' : ''}>${escapeHtml(category)}</option>`).join('')}
        </select>
      </label>
      <label>
        <span class="sr-only">线程分类</span>
        <select class="select" id="thread-filter">
          <option value="">全部线程</option>
          ${allThreadCategories().map(category => `<option value="${escapeHtml(category)}" ${category === state.threadCategory ? 'selected' : ''}>${escapeHtml(category)}</option>`).join('')}
        </select>
      </label>
      <div class="segmented-control" aria-label="词条范围">
        ${[['all', '全部'], ['favorites', '收藏'], ['custom', '个人']].map(([value, label]) => `<button class="segmented-button" type="button" data-list-mode="${value}" aria-pressed="${state.listMode === value}">${label}</button>`).join('')}
      </div>
    </div>
    <div class="library-layout">
      <section class="term-list-panel" aria-label="术语列表">
        <div class="result-count"><span>${results.length} 个结果</span><span>${state.category || '全部分类'}</span></div>
        <div class="term-list">
          ${results.length ? results.map(term => termListItem(term)).join('') : '<div class="empty-list">没有匹配的术语</div>'}
        </div>
      </section>
      <section class="term-detail" id="term-detail" aria-live="polite">
        ${selected ? `${mobileTermNavMarkup(results, selected)}${termDetailMarkup(selected)}` : '<div class="empty-list">没有匹配的术语</div>'}
      </section>
    </div>
    <div class="mobile-term-picker" id="mobile-term-picker" hidden>
      <button class="mobile-picker-backdrop" id="close-term-picker-backdrop" type="button" aria-label="关闭词表"></button>
      <section class="mobile-picker-sheet" role="dialog" aria-modal="true" aria-labelledby="mobile-picker-title">
        <div class="mobile-picker-header">
          <span><strong id="mobile-picker-title">选择术语</strong><small>${results.length} 个结果</small></span>
          <button class="icon-button" id="close-term-picker" type="button" aria-label="关闭词表">${icon('x')}</button>
        </div>
        <div class="mobile-picker-list">
          ${results.length ? results.map(term => termListItem(term)).join('') : '<div class="empty-list">没有匹配的术语</div>'}
        </div>
      </section>
    </div>
  `;

  document.getElementById('add-term').addEventListener('click', () => openTermDialog());
  document.getElementById('start-review').addEventListener('click', () => setView('review'));
  const search = document.getElementById('term-search');
  search.addEventListener('input', event => {
    state.search = event.target.value;
    const position = event.target.selectionStart;
    renderLibrary();
    const nextSearch = document.getElementById('term-search');
    nextSearch.focus();
    nextSearch.setSelectionRange(position, position);
  });
  document.getElementById('category-filter').addEventListener('change', event => {
    state.category = event.target.value;
    renderLibrary();
  });
  document.getElementById('thread-filter').addEventListener('change', event => {
    state.threadCategory = event.target.value;
    renderLibrary();
  });
  document.querySelectorAll('[data-list-mode]').forEach(button => button.addEventListener('click', () => {
    state.listMode = button.dataset.listMode;
    renderLibrary();
  }));
  document.querySelectorAll('[data-term-id]').forEach(button => button.addEventListener('click', () => {
    document.body.classList.remove('picker-open');
    state.selectedId = button.dataset.termId;
    renderLibrary();
  }));
  document.getElementById('previous-term')?.addEventListener('click', () => navigateLibraryTerm(-1));
  document.getElementById('next-term')?.addEventListener('click', () => navigateLibraryTerm(1));
  document.getElementById('open-term-picker')?.addEventListener('click', openMobileTermPicker);
  document.getElementById('close-term-picker')?.addEventListener('click', closeMobileTermPicker);
  document.getElementById('close-term-picker-backdrop')?.addEventListener('click', closeMobileTermPicker);
  bindTermDetail(selected);
  bindMobileTermSwipe();
  hydrateIcons();
}

function mobileTermNavMarkup(results, selected) {
  const index = results.findIndex(term => term.id === selected.id);
  return `
    <nav class="mobile-term-nav" aria-label="切换术语">
      <button class="icon-button" id="previous-term" type="button" aria-label="上一个术语" ${index <= 0 ? 'disabled' : ''}>${icon('chevron-left')}</button>
      <button class="mobile-term-position" id="open-term-picker" type="button" aria-label="打开术语列表">
        ${icon('list')}<span><strong>${index + 1} / ${results.length}</strong><small>选择术语</small></span>
      </button>
      <button class="icon-button" id="next-term" type="button" aria-label="下一个术语" ${index >= results.length - 1 ? 'disabled' : ''}>${icon('chevron-right')}</button>
    </nav>
  `;
}

function navigateLibraryTerm(offset) {
  const results = filteredTerms();
  const currentIndex = results.findIndex(term => term.id === state.selectedId);
  const nextIndex = Math.min(results.length - 1, Math.max(0, currentIndex + offset));
  if (nextIndex === currentIndex || nextIndex < 0) return;
  state.selectedId = results[nextIndex].id;
  renderLibrary();
}

function openMobileTermPicker() {
  const picker = document.getElementById('mobile-term-picker');
  picker.hidden = false;
  document.body.classList.add('picker-open');
  document.getElementById('close-term-picker').focus();
}

function closeMobileTermPicker() {
  document.getElementById('mobile-term-picker').hidden = true;
  document.body.classList.remove('picker-open');
  document.getElementById('open-term-picker')?.focus();
}

function bindMobileTermSwipe() {
  const detail = document.getElementById('term-detail');
  if (!detail) return;
  let startX = 0;
  let startY = 0;
  let tracking = false;
  detail.addEventListener('touchstart', event => {
    if (event.target.closest('button, input, select, textarea, a')) return;
    const touch = event.changedTouches[0];
    startX = touch.clientX;
    startY = touch.clientY;
    tracking = true;
  }, { passive: true });
  detail.addEventListener('touchend', event => {
    if (!tracking) return;
    tracking = false;
    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - startX;
    const deltaY = touch.clientY - startY;
    if (Math.abs(deltaX) < 60 || Math.abs(deltaX) < Math.abs(deltaY) * 1.25) return;
    navigateLibraryTerm(deltaX < 0 ? 1 : -1);
  }, { passive: true });
}

function termListItem(term) {
  const progress = state.progressMap.get(term.id);
  const reviewed = Number(progress?.reviewCount || 0);
  return `
    <button class="list-item ${term.id === state.selectedId ? 'is-selected' : ''}" type="button" data-term-id="${escapeHtml(term.id)}">
      <span><span class="list-primary">${escapeHtml(term.term)}</span><span class="list-secondary">${escapeHtml(term.zh)}</span></span>
      <span class="list-meta">${progress?.favorite ? icon('star') : reviewed ? reviewed : ''}</span>
    </button>
  `;
}

function termDetailMarkup(term) {
  const progress = state.progressMap.get(term.id);
  const aliases = textList(term.aliases);
  const relatedTerms = relatedTermRecords(term);
  const contexts = contextRecords(term);
  const usageNotes = textList(term.usageNotes);
  return `
    <div class="term-detail-header">
      <div>
        <h2>${escapeHtml(term.term)}</h2>
        <p class="term-ipa">${escapeHtml(term.ipa || (term.spokenForm ? '代码标识符' : '暂无音标'))}</p>
        ${term.spokenForm ? `<p class="term-spoken">读法：${escapeHtml(term.spokenForm)}</p>` : ''}
      </div>
      <div class="inline-actions">
        <button class="icon-button ${progress?.favorite ? 'is-active' : ''}" id="favorite-term" type="button" aria-label="${progress?.favorite ? '取消收藏' : '收藏术语'}">${icon('star')}</button>
        <button class="icon-button" id="speak-term" type="button" aria-label="朗读术语">${icon('volume-2')}</button>
      </div>
    </div>
    <div class="term-meta-row"><span class="term-category">${escapeHtml(term.category)}</span>${term.threadCategory ? `<span class="status-badge">${icon('cpu')}线程：${escapeHtml(term.threadCategory)}</span>` : ''}${term.custom ? '<span class="status-badge">个人词条</span>' : ''}${progress?.reviewCount ? `<span class="status-badge">已复习 ${progress.reviewCount} 次</span>` : '<span class="status-badge">未学习</span>'}</div>
    ${aliases.length ? `<div class="alias-row"><span>别名</span>${aliases.map(alias => `<code>${escapeHtml(alias)}</code>`).join('')}</div>` : ''}
    <p class="term-meaning">${escapeHtml(term.zh)}</p>
    <p class="term-definition">${escapeHtml(term.definition)}</p>
    ${term.example ? `<div class="example"><p lang="en">${escapeHtml(term.example)}</p>${term.exampleZh ? `<p>${escapeHtml(term.exampleZh)}</p>` : ''}</div>` : ''}
    ${contexts.length ? `
      <section class="knowledge-section" aria-label="场景与经验">
        <h3>${icon('scan-search')}场景与经验</h3>
        <div class="context-list">
          ${contexts.map(context => `
            <article class="context-item">
              <code class="context-phrase">${escapeHtml(context.phrase)}</code>
              ${context.explanation ? `<p>${escapeHtml(context.explanation)}</p>` : ''}
              ${context.experience ? `<p class="experience-note">${icon('lightbulb')}<span>${escapeHtml(context.experience)}</span></p>` : ''}
            </article>
          `).join('')}
        </div>
      </section>
    ` : ''}
    ${usageNotes.length ? `
      <section class="knowledge-section" aria-label="使用提示">
        <h3>${icon('lightbulb')}使用提示</h3>
        <ul class="usage-note-list">${usageNotes.map(note => `<li>${escapeHtml(note)}</li>`).join('')}</ul>
      </section>
    ` : ''}
    ${relatedTerms.length ? `
      <section class="knowledge-section" aria-label="关联术语">
        <h3>${icon('network')}关联术语</h3>
        <div class="relation-list">
          ${relatedTerms.map(item => `
            <button class="relation-button" type="button" data-related-term="${escapeHtml(item.term)}">
              <span><strong>${escapeHtml(item.term)}</strong>${item.relation ? `<span>${escapeHtml(item.relation)}</span>` : ''}</span>
              ${item.explanation ? `<small>${escapeHtml(item.explanation)}</small>` : ''}
            </button>
          `).join('')}
        </div>
      </section>
    ` : ''}
    <div class="inline-actions">
      <button class="button primary" id="study-term" type="button">${icon('graduation-cap')}练习这个术语</button>
      ${term.example ? `<button class="button" id="speak-example" type="button">${icon('audio-lines')}朗读例句</button>` : ''}
      ${term.custom ? `<button class="button" id="edit-term" type="button">${icon('pencil')}编辑</button><button class="button danger" id="delete-term" type="button">${icon('trash-2')}删除</button>` : ''}
    </div>
  `;
}

function bindTermDetail(term) {
  if (!term) return;
  document.getElementById('speak-term').addEventListener('click', () => speak(term.spokenForm || term.term));
  document.getElementById('favorite-term').addEventListener('click', () => toggleFavorite(term));
  document.getElementById('study-term').addEventListener('click', () => {
    state.view = 'review';
    state.reviewSession = { queue: [term], completed: 0, total: 1, manual: true };
    state.reviewRevealed = false;
    renderCurrentView();
  });
  document.getElementById('speak-example')?.addEventListener('click', () => speak(term.example));
  document.getElementById('edit-term')?.addEventListener('click', () => openTermDialog(term));
  document.getElementById('delete-term')?.addEventListener('click', () => removeCustomTerm(term));
  document.querySelectorAll('[data-related-term]').forEach(button => button.addEventListener('click', () => {
    const targetKey = identityKey(button.dataset.relatedTerm);
    const target = state.terms.find(item => termIdentityKeys(item).includes(targetKey));
    state.search = target ? '' : button.dataset.relatedTerm;
    state.category = '';
    state.threadCategory = '';
    state.listMode = 'all';
    if (target) state.selectedId = target.id;
    renderLibrary();
  }));
}

async function toggleFavorite(term) {
  const existing = state.progressMap.get(term.id) || { termId: term.id, favorite: false, reviewCount: 0 };
  const saved = await saveProgress({ ...existing, favorite: !existing.favorite });
  state.progressMap.set(term.id, saved);
  state.progress = [...state.progressMap.values()];
  renderLibrary();
  queueCloudSync();
}

function todayNewReviews() {
  const today = localDateKey();
  return state.activity.filter(item => item.wasNew && localDateKey(item.reviewedAt) === today).length;
}

function startReviewSession({ force = false } = {}) {
  if (state.reviewSession && !force) return;
  const remainingNew = Math.max(0, Number(state.settings.dailyNewLimit) - todayNewReviews());
  const queue = buildReviewQueue(state.terms, state.progressMap, remainingNew);
  state.reviewSession = { queue, completed: 0, total: queue.length, manual: false };
  state.reviewRevealed = false;
  state.lastSpokenTermId = '';
}

function renderReview() {
  startReviewSession();
  const root = document.getElementById('view-root');
  const session = state.reviewSession;
  const term = session.queue[0];
  const progress = term ? state.progressMap.get(term.id) : null;
  const intervals = term && state.reviewRevealed ? previewIntervals(progress) : {};
  const completionRatio = session.total ? Math.round((session.completed / session.total) * 100) : 100;
  root.innerHTML = `
    <div class="view-header review-layout">
      <div><h1>今日复习</h1><p>FSRS 会根据你的记忆反馈安排下次出现时间</p></div>
      <div class="review-controls">
        <div class="segmented-control" aria-label="复习方向">
          <button class="segmented-button" type="button" data-direction="en-zh" aria-pressed="${state.settings.reviewDirection === 'en-zh'}">英 → 中</button>
          <button class="segmented-button" type="button" data-direction="zh-en" aria-pressed="${state.settings.reviewDirection === 'zh-en'}">中 → 英</button>
        </div>
      </div>
    </div>
    <div class="review-layout">
      <div class="review-status"><span>${session.completed} / ${session.total}</span><span>${session.queue.length} 个待复习</span></div>
      <div class="review-progress-track" aria-label="今日复习进度"><div class="review-progress-fill" style="width:${completionRatio}%"></div></div>
      ${term ? reviewCardMarkup(term, intervals) : completionMarkup(session.completed)}
    </div>
  `;

  document.querySelectorAll('[data-direction]').forEach(button => button.addEventListener('click', async () => {
    state.settings.reviewDirection = button.dataset.direction;
    await saveSetting('reviewDirection', button.dataset.direction);
    state.reviewRevealed = false;
    renderReview();
    queueCloudSync();
  }));

  if (term) {
    document.getElementById('review-speak').addEventListener('click', () => speak(term.term));
    document.getElementById('reveal-answer')?.addEventListener('click', () => {
      state.reviewRevealed = true;
      renderReview();
    });
    document.querySelectorAll('[data-rating]').forEach(button => button.addEventListener('click', () => rateReview(term, Number(button.dataset.rating))));
    if (state.settings.autoSpeak && state.settings.reviewDirection === 'en-zh' && state.lastSpokenTermId !== term.id) {
      state.lastSpokenTermId = term.id;
      window.setTimeout(() => speak(term.term), 80);
    }
  } else {
    document.getElementById('back-library').addEventListener('click', () => setView('library'));
    document.getElementById('refresh-review').addEventListener('click', () => {
      state.reviewSession = null;
      startReviewSession({ force: true });
      renderReview();
    });
  }
  hydrateIcons();
}

function reviewCardMarkup(term, intervals) {
  const englishFirst = state.settings.reviewDirection === 'en-zh';
  const front = englishFirst ? term.term : term.zh;
  const secondary = englishFirst ? term.ipa : term.category;
  return `
    <article class="review-card">
      <div class="review-card-front">
        <span class="term-category">${escapeHtml(term.category)}</span>
        <h2>${escapeHtml(front)}</h2>
        <p class="term-ipa">${escapeHtml(secondary || '')}</p>
        <button class="icon-button" id="review-speak" type="button" aria-label="朗读英文">${icon('volume-2')}</button>
      </div>
      ${state.reviewRevealed ? `
        <div class="review-answer">
          <h3>${escapeHtml(englishFirst ? term.zh : term.term)}</h3>
          ${!englishFirst && term.ipa ? `<p class="term-ipa">${escapeHtml(term.ipa)}</p>` : ''}
          <p>${escapeHtml(term.definition)}</p>
          ${term.example ? `<p class="muted" lang="en">${escapeHtml(term.example)}</p>` : ''}
        </div>
      ` : `<div class="inline-actions"><button class="button primary" id="reveal-answer" type="button">${icon('eye')}显示答案</button></div>`}
    </article>
    ${state.reviewRevealed ? `<div class="review-actions">${REVIEW_RATINGS.map(rating => `
      <button class="rating-button ${rating.className}" type="button" data-rating="${rating.value}"><span>${rating.label}</span><small>${escapeHtml(intervals[rating.value])}</small></button>
    `).join('')}</div>` : ''}
  `;
}

function completionMarkup(completed) {
  return `
    <div class="completion">
      <div class="completion-icon">${icon('check')}</div>
      <h2>本轮复习完成</h2>
      <p class="muted">完成 ${completed} 个术语</p>
      <div class="inline-actions" style="justify-content:center">
        <button class="button primary" id="back-library" type="button">${icon('library')}返回词库</button>
        <button class="button" id="refresh-review" type="button">${icon('refresh-cw')}检查到期词条</button>
      </div>
    </div>
  `;
}

async function rateReview(term, rating) {
  const existing = state.progressMap.get(term.id) || { termId: term.id, favorite: false, reviewCount: 0 };
  const wasNew = !existing.card;
  const card = scheduleReview(existing, rating);
  const progress = await saveProgress({
    ...existing,
    termId: term.id,
    card,
    reviewCount: Number(existing.reviewCount || 0) + 1,
    lastRating: rating,
    lastReviewedAt: new Date().toISOString(),
  });
  await addActivity({ termId: term.id, rating, wasNew });
  state.progressMap.set(term.id, progress);
  state.progress = [...state.progressMap.values()];
  state.activity.unshift({ termId: term.id, rating, wasNew, reviewedAt: new Date().toISOString() });
  state.reviewSession.queue.shift();
  state.reviewSession.completed += 1;
  state.reviewRevealed = false;
  state.lastSpokenTermId = '';
  renderReview();
  queueCloudSync();
}

function renderProgress() {
  const learned = state.progress.filter(item => item.reviewCount > 0).length;
  const today = localDateKey();
  const reviewedToday = state.activity.filter(item => localDateKey(item.reviewedAt) === today).length;
  const streak = calculateStreak(state.activity);
  const due = state.progress.filter(item => isDue(item)).length;
  const root = document.getElementById('view-root');
  root.innerHTML = `
    <div class="view-header"><div><h1>学习进度</h1><p>${due} 个已学术语当前到期</p></div><div class="header-actions"><button class="button primary" id="progress-review" type="button">${icon('layers')}继续复习</button></div></div>
    <div class="stats-grid">
      <div class="stat-card"><p class="stat-label">已学习术语</p><p class="stat-value">${learned}</p></div>
      <div class="stat-card"><p class="stat-label">今日复习</p><p class="stat-value">${reviewedToday}</p></div>
      <div class="stat-card"><p class="stat-label">连续学习</p><p class="stat-value">${streak} 天</p></div>
    </div>
    <div class="progress-layout">
      <section class="section-panel"><h2>分类掌握</h2><div class="category-progress-list">${categoryProgressMarkup()}</div></section>
      <section class="section-panel"><h2>最近复习</h2><div class="activity-list">${recentActivityMarkup()}</div></section>
    </div>
  `;
  document.getElementById('progress-review').addEventListener('click', () => {
    state.reviewSession = null;
    setView('review');
  });
  hydrateIcons();
}

function categoryProgressMarkup() {
  return allCategories().map(category => {
    const terms = state.terms.filter(term => term.category === category);
    const reviewed = terms.filter(term => state.progressMap.get(term.id)?.reviewCount > 0).length;
    const percent = terms.length ? Math.round((reviewed / terms.length) * 100) : 0;
    return `
      <div>
        <div class="category-progress-header"><span>${escapeHtml(category)}</span><span class="muted">${reviewed} / ${terms.length}</span></div>
        <div class="progress-bar" aria-label="${escapeHtml(category)} ${percent}%"><span style="width:${percent}%"></span></div>
      </div>
    `;
  }).join('');
}

function recentActivityMarkup() {
  if (!state.activity.length) return '<div class="empty-list">完成第一次复习后会显示记录</div>';
  return state.activity.slice(0, 8).map(activity => {
    const term = state.terms.find(item => item.id === activity.termId);
    const rating = REVIEW_RATINGS.find(item => item.value === activity.rating);
    return `
      <div class="activity-row">
        <span class="activity-copy"><strong>${escapeHtml(term?.term || activity.termId)}</strong><span>${escapeHtml(rating?.label || '已复习')}</span></span>
        <span class="activity-time">${escapeHtml(formatTime(activity.reviewedAt))}</span>
      </div>
    `;
  }).join('');
}

function renderSettings() {
  const root = document.getElementById('view-root');
  root.innerHTML = `
    <div class="view-header"><div><h1>设置</h1><p>学习节奏、安装、同步与备份</p></div></div>
    <div class="settings-layout">
      <section class="section-panel">
        <h2>学习偏好</h2>
        <div class="settings-list">
          <div class="setting-row">
            <span class="setting-copy"><strong>每日新词</strong><span class="setting-description">到期复习之外，每天加入的新术语数量</span></span>
            <select class="select setting-control" id="daily-limit">${[5, 8, 10, 15, 20].map(value => `<option value="${value}" ${Number(state.settings.dailyNewLimit) === value ? 'selected' : ''}>${value} 个</option>`).join('')}</select>
          </div>
          <div class="setting-row">
            <span class="setting-copy"><strong>发音语速</strong><span class="setting-description">术语与例句使用同一语速</span></span>
            <select class="select setting-control" id="speech-rate">${[[0.7, '慢速 0.7×'], [0.85, '学习 0.85×'], [1, '正常 1.0×']].map(([value, label]) => `<option value="${value}" ${Number(state.settings.speechRate) === value ? 'selected' : ''}>${label}</option>`).join('')}</select>
          </div>
          <div class="setting-row">
            <span class="setting-copy"><strong>自动朗读</strong><span class="setting-description">英译中复习时自动朗读英文术语</span></span>
            <label class="setting-control"><input id="auto-speak" type="checkbox" ${state.settings.autoSpeak ? 'checked' : ''}> 开启</label>
          </div>
        </div>
      </section>
      <div class="settings-list">
        <section class="section-panel">
          <h2>设备与云端</h2>
          <div class="cloud-state">
            <span class="cloud-state-icon">${icon(state.cloudUser ? 'cloud-check' : 'cloud')}</span>
            <span><strong>${cloudStatusTitle()}</strong><span>${cloudStatusSubtitle()}</span></span>
          </div>
          ${cloudControlsMarkup()}
          <div class="inline-actions" style="margin-top:12px">
            ${settingsInstallMarkup()}
          </div>
        </section>
        <section class="section-panel">
          <h2>数据</h2>
          <div class="inline-actions">
            <button class="button" id="export-backup" type="button">${icon('download')}导出备份</button>
            <button class="button" id="import-backup" type="button">${icon('upload')}导入词库或备份</button>
            <button class="button danger" id="reset-learning" type="button">${icon('rotate-ccw')}重置进度</button>
          </div>
        </section>
      </div>
    </div>
  `;

  document.getElementById('daily-limit').addEventListener('change', event => updateSetting('dailyNewLimit', Number(event.target.value)));
  document.getElementById('speech-rate').addEventListener('change', event => updateSetting('speechRate', Number(event.target.value)));
  document.getElementById('auto-speak').addEventListener('change', event => updateSetting('autoSpeak', event.target.checked));
  document.getElementById('settings-install').addEventListener('click', installApp);
  document.getElementById('export-backup').addEventListener('click', exportBackup);
  document.getElementById('import-backup').addEventListener('click', () => document.getElementById('backup-file').click());
  document.getElementById('reset-learning').addEventListener('click', resetLearning);
  document.getElementById('backup-file').onchange = importBackup;
  document.getElementById('cloud-login')?.addEventListener('submit', requestLoginLink);
  document.getElementById('sync-now')?.addEventListener('click', performCloudSync);
  document.getElementById('cloud-signout')?.addEventListener('click', signOut);
  hydrateIcons();
}

function cloudStatusTitle() {
  if (!isCloudConfigured()) return '本机离线模式';
  if (state.cloudRestoring) return '正在恢复登录';
  if (state.cloudUser) return state.cloudUser.email || '云端已连接';
  return '登录后跨设备同步';
}

function cloudStatusSubtitle() {
  if (!isCloudConfigured()) return '部署时连接 Supabase 后启用账号同步';
  if (state.cloudRestoring) return '正在读取此设备保存的登录状态';
  if (state.syncing) return '正在合并本机与云端记录';
  if (state.cloudUser) return '词条、收藏与复习进度已纳入同步';
  return '使用邮箱验证码登录';
}

function cloudControlsMarkup() {
  if (!isCloudConfigured()) return '<span class="status-badge">云端未配置</span>';
  if (state.cloudRestoring) return '<span class="status-badge">请稍候</span>';
  if (state.cloudUser) {
    return `<div class="inline-actions"><button class="button primary" id="sync-now" type="button" ${state.syncing ? 'disabled' : ''}>${icon('refresh-cw')}立即同步</button><button class="button" id="cloud-signout" type="button">退出登录</button></div>`;
  }
  return `
    <form class="login-form" id="cloud-login">
      <label><span class="sr-only">邮箱</span><input class="field" id="cloud-email" type="email" required placeholder="你的邮箱"></label>
      <button class="button primary" type="submit">发送登录链接</button>
    </form>
  `;
}

function settingsInstallMarkup() {
  const status = installStatus();
  if (status === 'installed') return `<button class="button installed-button" id="settings-install" type="button" disabled>${icon('badge-check')}已安装到此设备</button>`;
  if (status === 'checking') return `<button class="button" id="settings-install" type="button" disabled>${icon('loader-circle')}正在检测</button>`;
  if (status === 'prompt-ready') return `<button class="button" id="settings-install" type="button">${icon('download')}安装到设备</button>`;
  return `<button class="button" id="settings-install" type="button">${icon('smartphone')}查看安装方法</button>`;
}

async function updateSetting(key, value) {
  state.settings[key] = value;
  await saveSetting(key, value);
  showToast('设置已保存');
  queueCloudSync();
}

function termDialogMarkup() {
  return `
    <dialog id="term-dialog">
      <form id="term-form">
        <div class="dialog-header"><h2 id="term-dialog-title">添加术语</h2><button class="icon-button" id="close-term-dialog" type="button" aria-label="关闭">${icon('x')}</button></div>
        <div class="dialog-body">
          <input id="term-id" type="hidden">
          <div class="form-grid">
            <label class="form-group"><span class="form-label">英文术语 *</span><input class="field" id="term-name" required></label>
            <label class="form-group"><span class="form-label">中文名称 *</span><input class="field" id="term-zh" required></label>
            <label class="form-group"><span class="form-label">音标</span><input class="field" id="term-ipa" placeholder="例如 /ˈæktər/"></label>
            <label class="form-group"><span class="form-label">分类</span><select class="select" id="term-category"></select></label>
            <label class="form-group full"><span class="form-label">简明解释 *</span><textarea class="textarea" id="term-definition" required></textarea></label>
            <label class="form-group"><span class="form-label">英文例句</span><input class="field" id="term-example"></label>
            <label class="form-group"><span class="form-label">例句翻译</span><input class="field" id="term-example-zh"></label>
            <label class="form-group full"><span class="form-label">搜索标签</span><input class="field" id="term-tags" placeholder="蓝图, 对象, 场景"></label>
          </div>
          <p class="form-error" id="term-form-error" role="alert"></p>
        </div>
        <div class="dialog-footer"><button class="button" id="cancel-term" type="button">取消</button><button class="button primary" type="submit">${icon('save')}保存</button></div>
      </form>
    </dialog>
  `;
}

function bindTermDialog() {
  const dialog = document.getElementById('term-dialog');
  document.getElementById('close-term-dialog').addEventListener('click', () => dialog.close());
  document.getElementById('cancel-term').addEventListener('click', () => dialog.close());
  document.getElementById('term-form').addEventListener('submit', submitTerm);
  dialog.addEventListener('close', () => {
    document.getElementById('term-form').reset();
    document.getElementById('term-id').value = '';
    document.getElementById('term-form-error').textContent = '';
  });
}

function openTermDialog(term = null) {
  const dialog = document.getElementById('term-dialog');
  document.getElementById('term-dialog-title').textContent = term ? '编辑个人术语' : '添加术语';
  document.getElementById('term-category').innerHTML = allCategories().map(category => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join('');
  document.getElementById('term-id').value = term?.id || '';
  document.getElementById('term-name').value = term?.term || '';
  document.getElementById('term-zh').value = term?.zh || '';
  document.getElementById('term-ipa').value = term?.ipa || '';
  document.getElementById('term-category').value = term?.category || baseCategories[0];
  document.getElementById('term-definition').value = term?.definition || '';
  document.getElementById('term-example').value = term?.example || '';
  document.getElementById('term-example-zh').value = term?.exampleZh || '';
  document.getElementById('term-tags').value = term?.tags || '';
  dialog.showModal();
  document.getElementById('term-name').focus();
}

async function submitTerm(event) {
  event.preventDefault();
  const id = document.getElementById('term-id').value;
  const name = document.getElementById('term-name').value.trim();
  const duplicate = state.terms.find(term => term.term.toLocaleLowerCase() === name.toLocaleLowerCase() && term.id !== id);
  if (duplicate) {
    document.getElementById('term-form-error').textContent = `“${duplicate.term}” 已存在于词库中。`;
    return;
  }
  const existing = id ? state.customTerms.find(term => term.id === id) : null;
  const saved = await saveCustomTerm({
    ...existing,
    id: id || `custom-${crypto.randomUUID()}`,
    term: name,
    zh: document.getElementById('term-zh').value.trim(),
    ipa: document.getElementById('term-ipa').value.trim(),
    category: document.getElementById('term-category').value,
    definition: document.getElementById('term-definition').value.trim(),
    example: document.getElementById('term-example').value.trim(),
    exampleZh: document.getElementById('term-example-zh').value.trim(),
    tags: document.getElementById('term-tags').value.trim(),
  });
  state.selectedId = saved.id;
  document.getElementById('term-dialog').close();
  await hydrate();
  showToast(id ? '个人术语已更新' : '新术语已加入词库');
  queueCloudSync();
}

async function removeCustomTerm(term) {
  if (!window.confirm(`确定删除“${term.term}”吗？`)) return;
  await deleteCustomTerm(term);
  state.selectedId = 'actor';
  await hydrate();
  showToast('个人术语已删除');
  queueCloudSync();
}

function speechText(text) {
  return String(text || '').replace(/\([^)]*\)/g, '').replace(/\//g, ' ').trim();
}

function stopOnlineVoice() {
  const player = document.getElementById('speech-player');
  const audio = document.getElementById('speech-audio');
  audio?.pause();
  if (player) player.hidden = true;
}

function speechSources(text) {
  const localFile = SPEECH_ASSETS[text];
  const sources = [];
  if (localFile) sources.push(`${import.meta.env.BASE_URL}audio/${localFile}`);
  sources.push(`https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(text)}&type=2`);
  return sources;
}

function speakWithAudio(text, requestId) {
  if (!text || requestId !== speechRequestId) return;
  const player = document.getElementById('speech-player');
  const audio = document.getElementById('speech-audio');
  if (!player || !audio) return;
  const sources = speechSources(text);
  let sourceIndex = 0;
  let reported = false;
  const reportFailure = () => {
    if (reported || requestId !== speechRequestId) return;
    sourceIndex += 1;
    if (sourceIndex < sources.length) {
      audio.src = sources[sourceIndex];
      audio.load();
      audio.play().catch(() => {});
      return;
    }
    reported = true;
    showToast('当前浏览器无法播放读音，请使用 Safari 或 Chrome 打开', 'error');
  };
  audio.onerror = reportFailure;
  audio.onended = () => {
    if (requestId === speechRequestId) player.hidden = true;
  };
  audio.src = sources[sourceIndex];
  player.hidden = false;
  audio.load();
  // Restricted webviews can reject scripted playback; native controls remain available for a second tap.
  audio.play().catch(() => {});
}

function speak(text) {
  const cleanedText = speechText(text);
  if (!cleanedText) return;
  const requestId = ++speechRequestId;
  stopOnlineVoice();

  if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) {
    speakWithAudio(cleanedText, requestId);
    return;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(cleanedText);
  utterance.lang = 'en-US';
  utterance.rate = Number(state.settings.speechRate || 0.85);
  const voices = window.speechSynthesis.getVoices();
  const voice = voices.find(item => /^en-US/i.test(item.lang)) || voices.find(item => /^en/i.test(item.lang));
  if (voice) utterance.voice = voice;
  utterance.onerror = event => {
    if (requestId !== speechRequestId || ['canceled', 'interrupted'].includes(event.error)) return;
    speakWithAudio(cleanedText, requestId);
  };
  window.speechSynthesis.speak(utterance);
}

async function exportBackup() {
  const data = await exportDatabase();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `ue-words-backup-${localDateKey()}.json`;
  link.click();
  URL.revokeObjectURL(url);
  showToast('备份已导出');
}

async function importBackup(event) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (data.format === 'ue-game-glossary' && Array.isArray(data.terms)) {
      const result = await importGlossaryTerms(data.terms);
      await hydrate();
      const skipped = result.skipped ? `，跳过 ${result.skipped} 个已有词条` : '';
      showToast(`已导入 ${result.saved} 个术语${skipped}`);
    } else {
      await importDatabase(data);
      await hydrate();
      showToast('备份已导入');
    }
    queueCloudSync();
  } catch (error) {
    showToast(error.message || '导入失败', 'error');
  } finally {
    event.target.value = '';
  }
}

async function importGlossaryTerms(terms) {
  const knownTerms = new Map();
  for (const term of state.terms) {
    for (const key of termIdentityKeys(term)) knownTerms.set(key, term);
  }
  let saved = 0;
  let skipped = 0;

  for (const [index, rawTerm] of terms.entries()) {
    if (!rawTerm || typeof rawTerm !== 'object') throw new Error(`第 ${index + 1} 个术语格式不正确`);
    const term = String(rawTerm.term || '').trim();
    const zh = String(rawTerm.zh || '').trim();
    const definition = String(rawTerm.definition || '').trim();
    if (!term || !zh || !definition) throw new Error(`第 ${index + 1} 个术语缺少英文、中文或解释`);

    const aliases = textList(rawTerm.aliases);
    const duplicate = [term, ...aliases].map(identityKey).map(key => knownTerms.get(key)).find(Boolean);
    if (duplicate && !duplicate.custom) {
      skipped += 1;
      continue;
    }

    const record = {
      id: duplicate?.id || String(rawTerm.id || `custom-${crypto.randomUUID()}`).trim(),
      term,
      zh,
      ipa: String(rawTerm.ipa || '').trim(),
      category: String(rawTerm.category || '其他').trim(),
      definition,
      example: String(rawTerm.example || '').trim(),
      exampleZh: String(rawTerm.exampleZh || '').trim(),
      tags: Array.isArray(rawTerm.tags) ? rawTerm.tags.join(' ') : String(rawTerm.tags || '').trim(),
      spokenForm: String(rawTerm.spokenForm || '').trim(),
      threadCategory: String(rawTerm.threadCategory || '').trim(),
      source: String(rawTerm.source || '').trim(),
      aliases,
      relatedTerms: relatedTermRecords(rawTerm).map(item => ({
        term: String(item.term || '').trim(),
        relation: String(item.relation || '').trim(),
        explanation: String(item.explanation || '').trim(),
      })),
      contexts: contextRecords(rawTerm).map(item => ({
        phrase: String(item.phrase || '').trim(),
        explanation: String(item.explanation || '').trim(),
        experience: String(item.experience || '').trim(),
      })),
      usageNotes: textList(rawTerm.usageNotes),
    };
    const stored = await saveCustomTerm(record);
    for (const key of termIdentityKeys(stored)) knownTerms.set(key, stored);
    saved += 1;
  }

  return { saved, skipped };
}

async function resetLearning() {
  if (!window.confirm('确定清空收藏、复习进度和学习记录吗？个人词条会保留。')) return;
  await clearAllLearningData();
  state.reviewSession = null;
  await hydrate();
  showToast('学习进度已重置');
  queueCloudSync();
}

async function installApp() {
  const status = installStatus();
  if (status === 'installed') {
    showToast('此设备已安装应用');
    return;
  }
  if (!state.installPrompt) {
    showInstallHelp();
    return;
  }
  const prompt = state.installPrompt;
  prompt.prompt();
  const choice = await prompt.userChoice;
  state.installPrompt = null;
  if (choice.outcome === 'accepted') {
    state.installedApp = true;
    localStorage.setItem('ue-words-installed', 'true');
    showToast('应用已安装');
  } else {
    showToast('已取消安装');
  }
  updateChrome();
  if (state.view === 'settings') renderSettings();
}

async function requestLoginLink(event) {
  event.preventDefault();
  const email = document.getElementById('cloud-email').value.trim();
  try {
    await sendLoginLink(email);
    showToast('登录链接已发送到邮箱');
  } catch (error) {
    showToast(error.message || '发送失败', 'error');
  }
}

async function signOut() {
  try {
    await signOutCloud();
    state.cloudUser = null;
    renderSettings();
  } catch (error) {
    showToast(error.message || '退出失败', 'error');
  }
}

async function performCloudSync({ quiet = false } = {}) {
  if (!state.cloudUser || state.syncing) return;
  state.syncing = true;
  updateChrome();
  if (state.view === 'settings') renderSettings();
  try {
    await syncNow();
    await hydrate({ render: false });
    if (!quiet) showToast('云端同步完成');
  } catch (error) {
    if (!quiet) showToast(error.message || '同步失败', 'error');
  } finally {
    state.syncing = false;
    renderCurrentView();
  }
}

function queueCloudSync() {
  if (!state.cloudUser || !isCloudConfigured()) return;
  window.clearTimeout(syncTimer);
  syncTimer = window.setTimeout(() => performCloudSync({ quiet: true }), 900);
}

function registerPwaEvents() {
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    state.installPrompt = event;
    updateChrome();
    if (state.view === 'settings') renderSettings();
  });
  window.addEventListener('appinstalled', () => {
    const newlyInstalled = !state.installedApp;
    state.installPrompt = null;
    state.installedApp = true;
    state.installChecked = true;
    localStorage.setItem('ue-words-installed', 'true');
    updateChrome();
    if (state.view === 'settings') renderSettings();
    if (newlyInstalled) showToast('应用已安装');
  });
  window.matchMedia('(display-mode: standalone)').addEventListener?.('change', refreshInstallStatus);
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => showToast('离线缓存初始化失败', 'error'));
  }
}

async function initializeCloud() {
  onCloudAuthChange(async user => {
    const changed = user?.id !== state.cloudUser?.id;
    state.cloudUser = user;
    state.cloudRestoring = false;
    updateChrome();
    if (changed && user) await performCloudSync({ quiet: true });
    else if (state.view === 'settings') renderSettings();
  });
  try {
    state.cloudUser = await getCloudUser();
  } catch {
    state.cloudUser = null;
  } finally {
    state.cloudRestoring = false;
    updateChrome();
    if (state.view === 'settings') renderSettings();
  }
  if (state.cloudUser) await performCloudSync({ quiet: true });
}

async function initialize() {
  renderShell();
  registerPwaEvents();
  await refreshInstallStatus();
  await hydrate();
  await initializeCloud();
}

initialize().catch(error => {
  document.getElementById('view-root').innerHTML = `<div class="completion"><h2>应用初始化失败</h2><p class="muted">${escapeHtml(error.message)}</p></div>`;
});
