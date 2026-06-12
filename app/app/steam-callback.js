import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import { waitForJob } from '../src/api';
import { useAuth } from '../src/context/AuthContext';
import { useTheme } from '../src/context/ThemeContext';

// Deep-link landing for the Steam OpenID return. The backend has verified the
// assertion, paired the account and queued the library sync (job id in params).
// We FOLLOW the job here so the user sees a spinner and the real outcome
// instead of landing on a not-yet-synced library.
export default function SteamCallback() {
  const { status, reason, job } = useLocalSearchParams();
  const router = useRouter();
  const { refresh } = useAuth();
  const { colors } = useTheme();
  const ok = status !== 'error';
  const [message, setMessage] = useState('Sto importando la tua libreria…');
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      try { WebBrowser.dismissBrowser(); } catch { /* no-op */ }

      if (ok && job) {
        try {
          const result = await waitForJob(String(job), { timeoutMs: 120000 });
          if (result?.privacy && result.privacy !== 'public') {
            setMessage('Profilo Steam privato: giochi non accessibili. Controlla la privacy su Steam.');
          } else {
            setMessage(`${result?.linked ?? 0} giochi importati (${result?.owned ?? 0} posseduti su Steam).`);
          }
        } catch (e) {
          setMessage(e.message);
        }
      }
      try { await refresh(); } catch { /* ignore */ }
      setDone(true);
      setTimeout(() => router.replace(ok ? '/(tabs)' : '/profile'), 1400);
    })();
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <Ionicons name={ok ? 'logo-steam' : 'alert-circle-outline'} size={64} color={ok ? colors.primary : colors.danger} />
      <Text style={{ color: colors.text, fontSize: 20, fontWeight: '800', marginTop: 16, textAlign: 'center' }}>
        {ok ? (done ? 'Fatto!' : 'Steam collegato!') : 'Collegamento non riuscito'}
      </Text>
      <Text style={{ color: colors.textMuted, marginTop: 8, textAlign: 'center' }}>
        {ok ? message : `Motivo: ${reason ?? 'sconosciuto'}`}
      </Text>
      {ok && !done ? <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} /> : null}
    </View>
  );
}
