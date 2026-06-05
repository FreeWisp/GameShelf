import { useEffect } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../src/context/AuthContext';
import { useTheme } from '../src/context/ThemeContext';

// Deep-link landing for the Steam OpenID return. The backend has already
// verified the assertion, paired the account and queued the library sync, then
// redirected here (gameshelf://steam-callback?status=ok&steamid=...). We just
// refresh the user and bounce into the app — no more "Unmatched Route".
export default function SteamCallback() {
  const { status, reason } = useLocalSearchParams();
  const router = useRouter();
  const { refresh } = useAuth();
  const { colors } = useTheme();
  const ok = status !== 'error';

  useEffect(() => {
    (async () => {
      try { WebBrowser.dismissBrowser(); } catch { /* no-op */ }
      try { await refresh(); } catch { /* ignore */ }
      setTimeout(() => router.replace(ok ? '/(tabs)' : '/profile'), 1200);
    })();
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <Ionicons name={ok ? 'logo-steam' : 'alert-circle-outline'} size={64} color={ok ? colors.primary : colors.danger} />
      <Text style={{ color: colors.text, fontSize: 20, fontWeight: '800', marginTop: 16, textAlign: 'center' }}>
        {ok ? 'Steam collegato!' : 'Collegamento non riuscito'}
      </Text>
      <Text style={{ color: colors.textMuted, marginTop: 8, textAlign: 'center' }}>
        {ok ? 'Sto importando la tua libreria…' : `Motivo: ${reason ?? 'sconosciuto'}`}
      </Text>
      {ok ? <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} /> : null}
    </View>
  );
}
