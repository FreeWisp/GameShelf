import { Platform } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../api';

// Expo Go (storeClient) removed remote push on Android since SDK 53. Even just
// *importing* expo-notifications there triggers a console error (its
// TokenAutoRegistration side-effect registers a push-token listener on import).
// So in Expo Go we never import the module at all — notifications simply no-op.
// In a dev/standalone build everything works (lazy-loaded below).
const isExpoGo =
  Constants.appOwnership === 'expo' || Constants.executionEnvironment === 'storeClient';

let Notifications = null;
async function loadNotifications() {
  if (isExpoGo) return null;
  if (!Notifications) {
    Notifications = await import('expo-notifications');
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  }
  return Notifications;
}

async function ensurePermission(N) {
  const { status } = await N.getPermissionsAsync();
  if (status === 'granted') return true;
  const req = await N.requestPermissionsAsync();
  return req.status === 'granted';
}

/**
 * Register an Expo push token on the backend (dev/standalone builds only).
 * No-op in Expo Go.
 */
export async function registerPushNotifications() {
  const N = await loadNotifications();
  if (!N) return null;
  try {
    const Device = await import('expo-device');
    if (!Device.isDevice) return null;
    if (!(await ensurePermission(N))) return null;

    if (Platform.OS === 'android') {
      await N.setNotificationChannelAsync('default', {
        name: 'GameShelf',
        importance: N.AndroidImportance.HIGH,
        lightColor: '#7C5CFF',
      });
    }
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return null;

    const { data: token } = await N.getExpoPushTokenAsync({ projectId });
    if (token) await api.registerPushToken(token).catch(() => {});
    return token;
  } catch {
    return null;
  }
}

/**
 * Local notification for new Epic free games. Works in dev/standalone builds;
 * in Expo Go it's a no-op (the free games are still shown in the News tab).
 */
export async function notifyEpicFreeLocally() {
  const N = await loadNotifications();
  if (!N) return;
  try {
    if (!(await ensurePermission(N))) return;
    const { free } = await api.epicFree();
    if (!free?.length) return;

    const seenRaw = (await AsyncStorage.getItem('gameshelf.epicSeen')) ?? '[]';
    const seen = new Set(JSON.parse(seenRaw));
    const fresh = free.filter((g) => !seen.has(g.id));
    if (!fresh.length) return;

    const titles = fresh.map((g) => g.title).join(', ');
    await N.scheduleNotificationAsync({
      content: {
        title: '🎁 Nuovi giochi gratis su Epic!',
        body: fresh.length === 1 ? `${titles} è gratis ora su Epic Games.` : `Gratis ora: ${titles}`,
        data: { type: 'epic_free' },
      },
      trigger: null,
    });

    const updated = [...seen, ...fresh.map((g) => g.id)];
    await AsyncStorage.setItem('gameshelf.epicSeen', JSON.stringify(updated));
  } catch { /* best effort */ }
}
