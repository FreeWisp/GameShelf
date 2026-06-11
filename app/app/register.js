import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../src/context/AuthContext';
import { useTheme } from '../src/context/ThemeContext';

export default function Register() {
  const { colors } = useTheme();
  const { register } = useAuth();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async () => {
    setErr(null);
    if (username.trim().length < 3) return setErr('Username troppo corto (minimo 3 caratteri).');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setErr('Inserisci un indirizzo email valido.');
    if (password.length < 6) return setErr('La password deve avere almeno 6 caratteri.');
    setBusy(true);
    try { await register(username.trim(), email.trim(), password); }
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
        <Text style={{ color: colors.text, fontSize: 28, fontWeight: '800', marginBottom: 24 }}>Crea il tuo account</Text>

        <TextInput style={input} placeholder="Username" placeholderTextColor={colors.textMuted}
          autoCapitalize="none" value={username} onChangeText={setUsername} />
        <TextInput style={input} placeholder="Email" placeholderTextColor={colors.textMuted}
          autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
        <TextInput style={input} placeholder="Password" placeholderTextColor={colors.textMuted}
          secureTextEntry value={password} onChangeText={setPassword} />

        {err && <Text style={{ color: colors.danger, marginBottom: 12 }}>{err}</Text>}

        <Pressable onPress={onSubmit} disabled={busy}
          style={{ backgroundColor: colors.primary, padding: 16, borderRadius: 12, alignItems: 'center', opacity: busy ? 0.6 : 1 }}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Registrati</Text>}
        </Pressable>

        <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 20 }}>
          <Text style={{ color: colors.textMuted }}>Hai già un account? </Text>
          <Link href="/login" style={{ color: colors.primary, fontWeight: '700' }}>Accedi</Link>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
