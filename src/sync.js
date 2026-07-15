import { createClient } from '@supabase/supabase-js';
import {
  addMissingActivity,
  getActivity,
  getAllProgress,
  getCustomTerms,
  getSettingRecords,
  replaceCustomTerms,
  replaceProgress,
  replaceSettings,
} from './db.js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const client = url && anonKey
  ? createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

export function isCloudConfigured() {
  return Boolean(client);
}

export async function getCloudUser() {
  if (!client) return null;
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  return data.session?.user || null;
}

export async function sendLoginLink(email) {
  if (!client) throw new Error('云同步尚未配置');
  const { error } = await client.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: new URL(import.meta.env.BASE_URL, window.location.origin).href },
  });
  if (error) throw error;
}

export async function signOutCloud() {
  if (!client) return;
  const { error } = await client.auth.signOut();
  if (error) throw error;
}

export function onCloudAuthChange(callback) {
  if (!client) return () => {};
  const { data } = client.auth.onAuthStateChange((_event, session) => callback(session?.user || null));
  return () => data.subscription.unsubscribe();
}

function updatedAt(record, fallback = 0) {
  const value = record?.updatedAt || record?.updated_at;
  return value ? new Date(value).getTime() : fallback;
}

function mergeRecords(localRecords, remoteRows, keyName) {
  const merged = new Map(localRecords.map(record => [record[keyName], record]));
  const push = [];

  for (const row of remoteRows) {
    const remote = { ...row.payload, updatedAt: row.updated_at };
    const key = remote[keyName];
    const local = merged.get(key);
    if (!local || updatedAt(remote) > updatedAt(local)) merged.set(key, remote);
    else if (updatedAt(local) > updatedAt(remote)) push.push(local);
  }

  const remoteKeys = new Set(remoteRows.map(row => row.payload[keyName]));
  for (const local of localRecords) {
    if (!remoteKeys.has(local[keyName])) push.push(local);
  }

  return { merged: Array.from(merged.values()), push };
}

async function requireUser() {
  const user = await getCloudUser();
  if (!user) throw new Error('请先登录后再同步');
  return user;
}

export async function syncNow() {
  if (!client) throw new Error('云同步尚未配置');
  const user = await requireUser();

  const [localTerms, localProgress, localSettings, localActivity] = await Promise.all([
    getCustomTerms({ includeDeleted: true }),
    getAllProgress(),
    getSettingRecords(),
    getActivity(),
  ]);

  const [termResult, progressResult, settingResult, activityResult] = await Promise.all([
    client.from('user_terms').select('id,payload,updated_at').eq('user_id', user.id),
    client.from('review_progress').select('term_id,payload,updated_at').eq('user_id', user.id),
    client.from('user_settings').select('key,value,updated_at').eq('user_id', user.id),
    client.from('review_activity').select('client_id,payload,reviewed_at').eq('user_id', user.id),
  ]);

  const firstError = [termResult, progressResult, settingResult, activityResult].find(result => result.error)?.error;
  if (firstError) throw firstError;

  const terms = mergeRecords(localTerms, termResult.data, 'id');
  const progress = mergeRecords(localProgress, progressResult.data, 'termId');
  const remoteSettings = settingResult.data.map(row => ({ key: row.key, value: row.value, updatedAt: row.updated_at }));
  const settings = mergeRecords(localSettings, remoteSettings.map(record => ({ payload: record, updated_at: record.updatedAt })), 'key');

  await Promise.all([
    replaceCustomTerms(terms.merged),
    replaceProgress(progress.merged),
    replaceSettings(settings.merged),
    addMissingActivity(activityResult.data.map(row => ({ ...row.payload, clientId: row.client_id, reviewedAt: row.reviewed_at }))),
  ]);

  const termRows = terms.push.map(record => ({ user_id: user.id, id: record.id, payload: record, updated_at: record.updatedAt }));
  const progressRows = progress.push.map(record => ({ user_id: user.id, term_id: record.termId, payload: record, updated_at: record.updatedAt }));
  const settingRows = settings.push.map(record => ({ user_id: user.id, key: record.key, value: record.value, updated_at: record.updatedAt }));
  const knownRemoteActivity = new Set(activityResult.data.map(row => row.client_id));
  const activityRows = localActivity
    .filter(record => record.clientId && !knownRemoteActivity.has(record.clientId))
    .map(record => ({
      user_id: user.id,
      client_id: record.clientId,
      payload: record,
      reviewed_at: record.reviewedAt,
    }));

  const writes = [];
  if (termRows.length) writes.push(client.from('user_terms').upsert(termRows));
  if (progressRows.length) writes.push(client.from('review_progress').upsert(progressRows));
  if (settingRows.length) writes.push(client.from('user_settings').upsert(settingRows));
  if (activityRows.length) writes.push(client.from('review_activity').upsert(activityRows));
  const writeResults = await Promise.all(writes);
  const writeError = writeResults.find(result => result.error)?.error;
  if (writeError) throw writeError;

  return { terms: terms.merged.length, progress: progress.merged.length };
}
