import { openDB } from 'idb';

const DB_NAME = 'ue-words-db-v1';
const DB_VERSION = 1;

const dbPromise = openDB(DB_NAME, DB_VERSION, {
  upgrade(db) {
    if (!db.objectStoreNames.contains('terms')) {
      const terms = db.createObjectStore('terms', { keyPath: 'id' });
      terms.createIndex('updatedAt', 'updatedAt');
    }
    if (!db.objectStoreNames.contains('progress')) {
      const progress = db.createObjectStore('progress', { keyPath: 'termId' });
      progress.createIndex('updatedAt', 'updatedAt');
    }
    if (!db.objectStoreNames.contains('settings')) {
      db.createObjectStore('settings', { keyPath: 'key' });
    }
    if (!db.objectStoreNames.contains('activity')) {
      const activity = db.createObjectStore('activity', { keyPath: 'id', autoIncrement: true });
      activity.createIndex('reviewedAt', 'reviewedAt');
      activity.createIndex('termId', 'termId');
    }
  },
});

export const DEFAULT_SETTINGS = {
  dailyNewLimit: 8,
  speechRate: 0.85,
  autoSpeak: false,
  reviewDirection: 'en-zh',
};

export async function getCustomTerms({ includeDeleted = false } = {}) {
  const terms = await (await dbPromise).getAll('terms');
  return includeDeleted ? terms : terms.filter(term => !term.deleted);
}

export async function saveCustomTerm(term) {
  const record = {
    ...term,
    custom: true,
    deleted: false,
    updatedAt: new Date().toISOString(),
  };
  await (await dbPromise).put('terms', record);
  return record;
}

export async function deleteCustomTerm(term) {
  await (await dbPromise).put('terms', {
    ...term,
    custom: true,
    deleted: true,
    updatedAt: new Date().toISOString(),
  });
}

export async function replaceCustomTerms(terms) {
  const db = await dbPromise;
  const transaction = db.transaction('terms', 'readwrite');
  await transaction.store.clear();
  for (const term of terms) {
    await transaction.store.put({
      ...term,
      custom: true,
      deleted: Boolean(term.deleted),
      updatedAt: term.updatedAt || new Date().toISOString(),
    });
  }
  await transaction.done;
}

export async function getAllProgress() {
  return (await dbPromise).getAll('progress');
}

export async function getProgress(termId) {
  return (await dbPromise).get('progress', termId);
}

export async function saveProgress(progress) {
  const record = { ...progress, updatedAt: new Date().toISOString() };
  await (await dbPromise).put('progress', record);
  return record;
}

export async function replaceProgress(records) {
  const db = await dbPromise;
  const transaction = db.transaction('progress', 'readwrite');
  await transaction.store.clear();
  for (const record of records) {
    await transaction.store.put(record);
  }
  await transaction.done;
}

export async function getSettings() {
  const records = await (await dbPromise).getAll('settings');
  return records.reduce((settings, record) => {
    settings[record.key] = record.value;
    return settings;
  }, { ...DEFAULT_SETTINGS });
}

export async function saveSetting(key, value) {
  await (await dbPromise).put('settings', {
    key,
    value,
    updatedAt: new Date().toISOString(),
  });
}

export async function getSettingRecords() {
  return (await dbPromise).getAll('settings');
}

export async function replaceSettings(records) {
  const db = await dbPromise;
  const transaction = db.transaction('settings', 'readwrite');
  for (const record of records) {
    await transaction.store.put(record);
  }
  await transaction.done;
}

export async function addActivity(activity) {
  await (await dbPromise).add('activity', {
    ...activity,
    clientId: activity.clientId || crypto.randomUUID(),
    reviewedAt: activity.reviewedAt || new Date().toISOString(),
  });
}

export async function addMissingActivity(records) {
  const db = await dbPromise;
  const existing = await db.getAll('activity');
  const known = new Set(existing.map(item => item.clientId).filter(Boolean));
  const transaction = db.transaction('activity', 'readwrite');
  for (const record of records) {
    if (!record.clientId || known.has(record.clientId)) continue;
    const { id, ...activity } = record;
    await transaction.store.add(activity);
    known.add(record.clientId);
  }
  await transaction.done;
}

export async function getActivity() {
  return (await dbPromise).getAll('activity');
}

export async function clearAllLearningData() {
  const db = await dbPromise;
  const transaction = db.transaction(['progress', 'activity'], 'readwrite');
  await transaction.objectStore('progress').clear();
  await transaction.objectStore('activity').clear();
  await transaction.done;
}

export async function exportDatabase() {
  const [terms, progress, settings, activity] = await Promise.all([
    getCustomTerms({ includeDeleted: true }),
    getAllProgress(),
    getSettingRecords(),
    getActivity(),
  ]);
  return {
    format: 'ue-words-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    terms,
    progress,
    settings,
    activity,
  };
}

export async function importDatabase(data) {
  if (!data || data.format !== 'ue-words-backup' || !Array.isArray(data.terms)) {
    throw new Error('备份文件格式不正确');
  }
  await replaceCustomTerms(data.terms);
  await replaceProgress(Array.isArray(data.progress) ? data.progress : []);
  await replaceSettings(Array.isArray(data.settings) ? data.settings : []);

  const db = await dbPromise;
  const transaction = db.transaction('activity', 'readwrite');
  await transaction.store.clear();
  for (const record of Array.isArray(data.activity) ? data.activity : []) {
    const { id, ...activity } = record;
    await transaction.store.add(activity);
  }
  await transaction.done;
}
