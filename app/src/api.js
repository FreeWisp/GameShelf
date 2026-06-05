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

async function request(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth && inMemoryToken) headers.Authorization = `Bearer ${inMemoryToken}`;

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
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

  // folders (HashMap)
  folders: () => request('/folders'),
  createFolder: (nome_cartella, emoji) => request('/folders', { method: 'POST', body: { nome_cartella, emoji } }),
  renameFolder: (name, nuovo_nome, emoji) => request(`/folders/${encodeURIComponent(name)}`, { method: 'PATCH', body: { nuovo_nome, emoji } }),
  setFolderEmoji: (name, emoji) => request(`/folders/${encodeURIComponent(name)}`, { method: 'PATCH', body: { emoji } }),
  reorderFolders: (order) => request('/folders/reorder', { method: 'PATCH', body: { order } }),
  deleteFolder: (name) => request(`/folders/${encodeURIComponent(name)}`, { method: 'DELETE' }),
  addToFolder: (name, game) => request(`/folders/${encodeURIComponent(name)}/games`, { method: 'POST', body: { game } }),
  removeFromFolder: (name, gameId) => request(`/folders/${encodeURIComponent(name)}/games/${gameId}`, { method: 'DELETE' }),

  // news
  news: () => request('/news', { auth: false }),

  // profile
  me: () => request('/profile/me'),
  updateProfile: (b) => request('/profile/me', { method: 'PATCH', body: b }),
  steamPair: (steamId) => request('/profile/steam-pair', { method: 'POST', body: { steamId } }),
  qr: () => request('/profile/qr'),
  registerPushToken: (token) => request('/profile/push-token', { method: 'POST', body: { token } }),

  // epic free games
  epicFree: () => request('/epic/free', { auth: false }),
};
