import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

// --- Resolve the backend base URL -------------------------------------------
// Override with EXPO_PUBLIC_API_URL (e.g. http://192.168.1.20:4000) when running
// on a physical device. Otherwise we try to auto-detect the dev machine host so
// Expo Go / emulators reach the local backend out of the box.
function resolveBaseUrl() {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL;

  const hostUri =
    Constants.expoConfig?.hostUri ||
    Constants.expoGoConfig?.debuggerHost ||
    Constants.manifest2?.extra?.expoGo?.debuggerHost;
  const host = hostUri?.split(':')[0];

  if (host && host !== 'localhost' && host !== '127.0.0.1') return `http://${host}:4000`;
  // Android emulator maps the host loopback to 10.0.2.2
  if (Platform.OS === 'android') return 'http://10.0.2.2:4000';
  return 'http://localhost:4000';
}

export const API_URL = resolveBaseUrl();

const TOKEN_KEY = 'gameshelf.token';
let inMemoryToken = null;

export async function setToken(token) {
  inMemoryToken = token;
  if (token) await AsyncStorage.setItem(TOKEN_KEY, token);
  else await AsyncStorage.removeItem(TOKEN_KEY);
}

export async function loadToken() {
  inMemoryToken = await AsyncStorage.getItem(TOKEN_KEY);
  return inMemoryToken;
}

export function getToken() {
  return inMemoryToken;
}

// Build the "Sign in through Steam" URL (opened in a WebBrowser auth session).
export function steamLoginUrl(returnUrl) {
  return `${API_URL}/auth/steam/login?link=${encodeURIComponent(inMemoryToken ?? '')}&return=${encodeURIComponent(returnUrl)}`;
}

async function request(path, { method = 'GET', body, auth = true, timeout = 20000 } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth && inMemoryToken) headers.Authorization = `Bearer ${inMemoryToken}`;

  let res;
  // Abort slow requests so the UI fails fast with a clear message instead of
  // hanging (e.g. phone on a different network than the backend).
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (e) {
    if (e?.name === 'AbortError') {
      throw new Error('Il server non risponde. Verifica che il backend sia avviato e che il telefono sia sulla stessa rete.');
    }
    throw new Error('Impossibile raggiungere il server. Controlla che il backend sia avviato.');
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; }
  catch { throw new Error(`Risposta non valida dal server (HTTP ${res.status})`); }
  if (!res.ok) throw new Error(data.error || `Errore ${res.status}`);
  return data;
}

export const api = {
  // auth
  register: (b) => request('/auth/register', { method: 'POST', body: b, auth: false }),
  login: (b) => request('/auth/login', { method: 'POST', body: b, auth: false }),

  // games
  popular: (limit = 16) => request(`/games/popular?limit=${limit}`, { auth: false }),
  search: (q) => request(`/games/search?q=${encodeURIComponent(q)}`, { auth: false }),
  game: (id) => request(`/games/${id}`, { auth: false }),
  fetchCommunity: (id) => request(`/games/${id}/community`, { method: 'POST' }),

  // library
  library: () => request('/library'),
  addToLibrary: (b) => request('/library', { method: 'POST', body: b }),
  updateEntry: (id, b) => request(`/library/${id}`, { method: 'PATCH', body: b }),
  removeEntry: (id) => request(`/library/${id}`, { method: 'DELETE' }),

  // diary
  diary: (possessoId) => request(`/library/${possessoId}/diary`),
  addNote: (possessoId, b) => request(`/library/${possessoId}/diary`, { method: 'POST', body: b }),
  updateNote: (possessoId, noteId, b) => request(`/library/${possessoId}/diary/${noteId}`, { method: 'PATCH', body: b }),
  deleteNote: (possessoId, noteId) => request(`/library/${possessoId}/diary/${noteId}`, { method: 'DELETE' }),

  // folders (HashMap) — addressed by numeric id (names may contain any char)
  folders: () => request('/folders'),
  folder: (id) => request(`/folders/${id}`),
  createFolder: (nome_cartella, emoji) => request('/folders', { method: 'POST', body: { nome_cartella, emoji } }),
  renameFolder: (id, nuovo_nome, emoji) => request(`/folders/${id}`, { method: 'PATCH', body: { nuovo_nome, emoji } }),
  setFolderEmoji: (id, emoji) => request(`/folders/${id}`, { method: 'PATCH', body: { emoji } }),
  reorderFolders: (order) => request('/folders/reorder', { method: 'PATCH', body: { order } }),
  deleteFolder: (id) => request(`/folders/${id}`, { method: 'DELETE' }),
  addToFolder: (id, game) => request(`/folders/${id}/games`, { method: 'POST', body: { game } }),
  removeFromFolder: (id, gameId) => request(`/folders/${id}/games/${gameId}`, { method: 'DELETE' }),

  // news (auth optional: when logged in they are personalized on your library)
  news: () => request('/news'),

  // profile
  me: () => request('/profile/me'),
  updateProfile: (b) => request('/profile/me', { method: 'PATCH', body: b }),
  steamPair: (steamId) => request('/profile/steam-pair', { method: 'POST', body: { steamId } }),
  steamUnlink: () => request('/profile/steam-unlink', { method: 'POST' }),
  qr: () => request('/profile/qr'),
  registerPushToken: (token) => request('/profile/push-token', { method: 'POST', body: { token } }),

  // epic free games
  epicFree: () => request('/epic/free', { auth: false }),

  // job queue inspection
  job: (id) => request(`/jobs/${id}`, { auth: false }),
};

/**
 * Poll a queue job until it completes; resolves with the job result.
 * Used to show real progress (e.g. Steam library sync) instead of
 * fire-and-forget feedback.
 */
export async function waitForJob(jobId, { timeoutMs = 90000, intervalMs = 1500, onTick } = {}) {
  const start = Date.now();
  for (;;) {
    const { job } = await api.job(jobId);
    onTick?.(job);
    if (job.status === 'done') return job.result;
    if (job.status === 'failed') throw new Error(job.error || 'Operazione fallita');
    if (Date.now() - start > timeoutMs) {
      throw new Error('La sincronizzazione sta impiegando più del previsto: controlla la libreria tra qualche istante.');
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
