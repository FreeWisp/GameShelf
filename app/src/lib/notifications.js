import { Alert, LogBox, Platform } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../api';

// ----------------------------------------------------------------------------
// Notifications
// Expo Go (SDK 53+) removed REMOTE push on Android, but LOCAL notifications
// still work. Importing expo-notifications in Expo Go logs a scary (harmless)
// console error about the removed remote functionality — we silence that
// specific message and use local notifications everywhere. Remote push tokens
// are only requested in a dev/standalone build.
// ----------------------------------------------------------------------------

LogBox.ignoreLogs([
  'expo-notifications: Android Push notifications',
  '`expo-notifications` functionality is not fully supported in Expo Go',
]);

const isExpoGo =
  Constants.appOwnership === 'expo' || Constants.executionEnvironment === 'storeClient';

const CONSENT_KEY = 'gameshelf.notifConsent'; // 'granted' | 'denied'
const ENGAGEMENT_MESSAGES = [
  '📚 La tua mensola ti aspetta! Dai un’occhiata al tuo backlog.',
  '🎮 A cosa stai giocando? Aggiorna i tuoi progressi su GameShelf.',
  '🏆 Hai completato qualche gioco di recente? Segnalo nella libreria!',
  '✍️ Racconta la tua ultima sessione nel diario di gioco.',
  '🎁 Controlla le news: potrebbero esserci giochi gratis su Epic!',
];

let N = null;
async function loadNotifications() {
  if (!N) {
    N = await import('expo-notifications');
    N.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  }
  return N;
}

async function ensurePermission(Notif) {
  const { status } = await Notif.getPermissionsAsync();
  if (status === 'granted') return true;
  const req = await Notif.requestPermissionsAsync();
  return req.status === 'granted';
}

/** In-app consent popup, asked once. Returns true if the user opted in. */
export function ensureNotificationConsent() {
  return AsyncStorage.getItem(CONSENT_KEY).then((stored) => {
    if (stored === 'granted') return true;
    if (stored === 'denied') return false;
    return new Promise((resolve) => {
      Alert.alert(
        'Attiva le notifiche 🔔',
        'Vuoi ricevere avvisi sui giochi gratis di Epic Games e promemoria sulla tua libreria?',
        [
          { text: 'No, grazie', style: 'cancel', onPress: async () => { await AsyncStorage.setItem(CONSENT_KEY, 'denied'); resolve(false); } },
          { text: 'Attiva', onPress: async () => { await AsyncStorage.setItem(CONSENT_KEY, 'granted'); resolve(true); } },
        ],
        { cancelable: false },
      );
    });
  });
}

/** Local notification for new Epic free games (works in Expo Go too). */
export async function notifyEpicFreeLocally(Notif) {
  try {
    const { free } = await api.epicFree();
    if (!free?.length) return;

    const seenRaw = (await AsyncStorage.getItem('gameshelf.epicSeen')) ?? '[]';
    const seen = new Set(JSON.parse(seenRaw));
    const fresh = free.filter((g) => !seen.has(g.id));
    if (!fresh.length) return;

    const titles = fresh.map((g) => g.title).join(', ');
    await Notif.scheduleNotificationAsync({
      content: {
        title: '🎁 Nuovi giochi gratis su Epic!',
        body: fresh.length === 1 ? `${titles} è gratis ora su Epic Games.` : `Gratis ora: ${titles}`,
        data: { type: 'epic_free' },
      },
      trigger: null, // immediate
    });
    await AsyncStorage.setItem('gameshelf.epicSeen', JSON.stringify([...seen, ...fresh.map((g) => g.id)]));
  } catch { /* best effort */ }
}

/** Daily local reminder with a random engagement message. */
async function scheduleEngagementReminder(Notif) {
  try {
    // Re-schedule from scratch so we never stack duplicates.
    await Notif.cancelAllScheduledNotificationsAsync();
    const msg = ENGAGEMENT_MESSAGES[Math.floor(Math.random() * ENGAGEMENT_MESSAGES.length)];
    await Notif.scheduleNotificationAsync({
      content: { title: 'GameShelf', body: msg, data: { type: 'engagement' } },
      trigger: { type: 'daily', hour: 18, minute: 30 },
    });
  } catch { /* best effort */ }
}

/** Remote Expo push token — only meaningful in a dev/standalone build. */
async function registerRemotePush(Notif) {
  if (isExpoGo) return null;
  try {
    const Device = await import('expo-device');
    if (!Device.isDevice) return null;
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return null;
    const { data: token } = await Notif.getExpoPushTokenAsync({ projectId });
    if (token) await api.registerPushToken(token).catch(() => {});
    return token;
  } catch {
    return null;
  }
}

/**
 * Entry point, called once after login: consent popup → system permission →
 * Android channel → Epic check + daily reminder (+ remote token on dev builds).
 */
export async function initNotifications() {
  try {
    if (!(await ensureNotificationConsent())) return;
    const Notif = await loadNotifications();
    if (!(await ensurePermission(Notif))) return;

    if (Platform.OS === 'android') {
      await Notif.setNotificationChannelAsync('default', {
        name: 'GameShelf',
        importance: Notif.AndroidImportance.HIGH,
        lightColor: '#7C5CFF',
      });
    }

    await registerRemotePush(Notif);
    await notifyEpicFreeLocally(Notif);
    await scheduleEngagementReminder(Notif);
  } catch { /* never break the app because of notifications */ }
}
