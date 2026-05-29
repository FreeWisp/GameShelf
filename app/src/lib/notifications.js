import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../api';

// Foreground notifications: show banner + play sound.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function ensurePermission() {
  const { status } = await Notifications.getPermissionsAsync();
  if (status === 'granted') return true;
  const req = await Notifications.requestPermissionsAsync();
  return req.status === 'granted';
}

/**
 * Ask permission, obtain an Expo push token and register it on the backend so
 * the server can push Epic free-game alerts. Remote push needs a dev/standalone
 * build with an EAS projectId; in Expo Go this may be unavailable, in which case
 * we still rely on local notifications (see notifyEpicFree).
 */
export async function registerPushNotifications() {
  try {
    if (!Device.isDevice) return null;
    if (!(await ensurePermission())) return null;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'GameShelf',
        importance: Notifications.AndroidImportance.HIGH,
        lightColor: '#7C5CFF',
      });
    }

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return null; // can't get a remote token without an EAS project

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    if (token) await api.registerPushToken(token).catch(() => {});
    return token;
  } catch {
    return null;
  }
}

/**
 * Local fallback that works everywhere (incl. Expo Go): compares the current
 * Epic free games against what we last saw and fires a local notification for
 * any new free title.
 */
export async function notifyEpicFreeLocally() {
  try {
    if (!(await ensurePermission())) return;
    const { free } = await api.epicFree();
    if (!free?.length) return;

    const seenRaw = (await AsyncStorage.getItem('gameshelf.epicSeen')) ?? '[]';
    const seen = new Set(JSON.parse(seenRaw));
    const fresh = free.filter((g) => !seen.has(g.id));
    if (!fresh.length) return;

    const titles = fresh.map((g) => g.title).join(', ');
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '🎁 Nuovi giochi gratis su Epic!',
        body: fresh.length === 1 ? `${titles} è gratis ora su Epic Games.` : `Gratis ora: ${titles}`,
        data: { type: 'epic_free' },
      },
      trigger: null, // deliver immediately
    });

    const updated = [...seen, ...fresh.map((g) => g.id)];
    await AsyncStorage.setItem('gameshelf.epicSeen', JSON.stringify(updated));
  } catch { /* best effort */ }
}
