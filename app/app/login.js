import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../src/context/AuthContext';
import { useTheme } from '../src/context/ThemeContext';

export default function Login() {
  const { colors } = useTheme();
  const { login } = useAuth();
  const [email, setEmail] = useState('demo@gameshelf.app');
  const [password, setPassword] = useState('demo1234');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async () => {
    setErr(null); setBusy(true);
    try { await login(email.trim(), password); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const input = {
    backgroundColor: colors.surface, color: colors.text, borderColor: colors.border,
    borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 12, fontSize: 16,
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
        <Text style={{ color: colors.primary, fontSize: 40, fontWeight: '800', textAlign: 'center' }}>GameShelf</Text>
        <Text style={{ color: colors.textMuted, textAlign: 'center', marginBottom: 32 }}>La tua libreria di gioco, ovunque.</Text>

        <TextInput style={input} placeholder="Email o username" placeholderTextColor={colors.textMuted}
          autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
        <TextInput style={input} placeholder="Password" placeholderTextColor={colors.textMuted}
          secureTextEntry value={password} onChangeText={setPassword} />

        {err && <Text style={{ color: colors.danger, marginBottom: 12 }}>{err}</Text>}

        <Pressable onPress={onSubmit} disabled={busy}
          style={{ backgroundColor: colors.primary, padding: 16, borderRadius: 12, alignItems: 'center', opacity: busy ? 0.6 : 1 }}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Accedi</Text>}
        </Pressable>

        <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 20 }}>
          <Text style={{ color: colors.textMuted }}>Non hai un account? </Text>
          <Link href="/register" style={{ color: colors.primary, fontWeight: '700' }}>Registrati</Link>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
