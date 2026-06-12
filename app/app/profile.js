import { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { api, steamLoginUrl } from '../src/api';
import { useAuth } from '../src/context/AuthContext';
import { useTheme } from '../src/context/ThemeContext';

export default function Profile() {
  const { colors } = useTheme();
  const { user, refresh, logout, setUser } = useAuth();
  const router = useRouter();
  const [username, setUsername] = useState(user?.username ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const [password, setPassword] = useState('');
  const [steamId, setSteamId] = useState(user?.steam_id ?? '');
  const [qr, setQr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [scanner, setScanner] = useState(false);
  const [scanned, setScanned] = useState(null);
  const [permission, requestPermission] = useCameraPermissions();

  useEffect(() => { api.qr().then((d) => setQr(d.encoded)).catch(() => {}); }, []);

  const pickImage = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.5, base64: true, allowsEditing: true, aspect: [1, 1] });
    if (!res.canceled) {
      const uri = `data:image/jpeg;base64,${res.assets[0].base64}`;
      const { user } = await api.updateProfile({ immagine_profilo: uri });
      setUser(user);
    }
  };

  const removeImage = () => {
    Alert.alert('Foto profilo', 'Rimuovere la foto profilo?', [
      { text: 'Annulla', style: 'cancel' },
      { text: 'Rimuovi', style: 'destructive', onPress: async () => {
        const { user } = await api.updateProfile({ immagine_profilo: null });
        setUser(user);
      } },
    ]);
  };

  const saveProfile = async () => {
    if (!username.trim()) { Alert.alert('Username obbligatorio', 'Il nome utente non può essere vuoto.'); return; }
    setBusy(true);
    try {
      const body = { username: username.trim(), bio };
      if (password) body.password = password;
      await api.updateProfile(body);
      await refresh();
      setPassword('');
      api.qr().then((d) => setQr(d.encoded)).catch(() => {}); // QR carries the username
      Alert.alert('Salvato', 'Profilo aggiornato.');
    } catch (e) { Alert.alert('Errore', e.message); }
    finally { setBusy(false); }
  };

  const pairSteam = async () => {
    if (!steamId.trim()) return Alert.alert('Steam', 'Inserisci il tuo SteamID64.');
    try {
      await api.steamPair(steamId.trim());
      await refresh();
      Alert.alert('Steam collegato', 'La sincronizzazione della libreria è stata avviata (coda).');
    } catch (e) { Alert.alert('Errore', e.message); }
  };

  const unlinkSteam = () => {
    Alert.alert(
      'Scollega Steam',
      'Verranno rimossi dalla tua libreria anche tutti i giochi importati da Steam (con i relativi diari). I giochi aggiunti manualmente restano. Continuare?',
      [
        { text: 'Annulla', style: 'cancel' },
        { text: 'Scollega', style: 'destructive', onPress: async () => {
          try {
            const { removed } = await api.steamUnlink();
            await refresh();
            setSteamId('');
            Alert.alert('Steam scollegato', `Rimossi ${removed} giochi importati da Steam.`);
          } catch (e) { Alert.alert('Errore', e.message); }
        } },
      ],
    );
  };

  // "Sign in through Steam" via OpenID 2.0 inside a WebBrowser auth session.
  const loginWithSteam = async () => {
    try {
      const redirectUrl = Linking.createURL('steam-callback');
      const result = await WebBrowser.openAuthSessionAsync(steamLoginUrl(redirectUrl), redirectUrl);
      if (result.type !== 'success' || !result.url) return;
      const { queryParams } = Linking.parse(result.url);
      if (queryParams?.status === 'ok') {
        if (queryParams.steamid) setSteamId(String(queryParams.steamid));
        await refresh();
        Alert.alert('Steam collegato', 'Libreria in sincronizzazione (coda). Achievement e statistiche verranno scaricati.');
      } else {
        Alert.alert('Steam', `Login non riuscito: ${queryParams?.reason ?? 'sconosciuto'}`);
      }
    } catch (e) { Alert.alert('Errore', e.message); }
  };

  const openScanner = async () => {
    if (!permission?.granted) { const r = await requestPermission(); if (!r.granted) return; }
    setScanned(null); setScanner(true);
  };

  const input = { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border, borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 12 };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 }}>
        <Pressable onPress={() => router.back()}><Ionicons name="arrow-back" size={22} color={colors.text} /></Pressable>
        <Text style={{ color: colors.text, fontWeight: '800', fontSize: 18 }}>Profilo</Text>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: 'center', marginBottom: 20 }}>
          <Pressable onPress={pickImage}>
            {user?.immagine_profilo
              ? <Image source={{ uri: user.immagine_profilo }} style={{ width: 96, height: 96, borderRadius: 48 }} />
              : <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontSize: 32, fontWeight: '800' }}>{user?.username?.slice(0, 2).toUpperCase()}</Text></View>}
            <View style={{ position: 'absolute', bottom: 0, right: 0, backgroundColor: colors.surface, borderRadius: 999, padding: 6, borderWidth: 1, borderColor: colors.border }}><Ionicons name="camera" size={16} color={colors.text} /></View>
          </Pressable>
          {user?.immagine_profilo ? (
            <Pressable onPress={removeImage} style={{ marginTop: 10 }}>
              <Text style={{ color: colors.danger, fontWeight: '700', fontSize: 13 }}>Rimuovi foto</Text>
            </Pressable>
          ) : null}
        </View>

        <Text style={label(colors)}>Username</Text>
        <TextInput style={input} value={username} onChangeText={setUsername} autoCapitalize="none" />
        <Text style={label(colors)}>Bio</Text>
        <TextInput style={[input, { minHeight: 60, textAlignVertical: 'top' }]} value={bio} onChangeText={setBio} multiline />
        <Text style={label(colors)}>Nuova password</Text>
        <TextInput style={input} value={password} onChangeText={setPassword} secureTextEntry placeholder="Lascia vuoto per non cambiare" placeholderTextColor={colors.textMuted} />

        <Pressable onPress={saveProfile} disabled={busy} style={{ backgroundColor: colors.primary, borderRadius: 10, padding: 14, alignItems: 'center', marginBottom: 24 }}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>Salva modifiche</Text>}
        </Pressable>

        {/* QR code */}
        <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16, marginBottom: 8 }}>Il tuo QR profilo</Text>
        <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 12 }}>Gli altri utenti possono scansionarlo per vedere username, giochi giocati e obiettivi raggiunti.</Text>
        <View style={{ alignItems: 'center', backgroundColor: '#fff', alignSelf: 'center', padding: 16, borderRadius: 16 }}>
          {qr ? <QRCode value={qr} size={180} /> : <ActivityIndicator color={colors.primary} />}
        </View>

        <Pressable onPress={openScanner} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 16, backgroundColor: colors.surface, borderRadius: 10, padding: 14, borderWidth: 1, borderColor: colors.border }}>
          <Ionicons name="scan" size={18} color={colors.text} />
          <Text style={{ color: colors.text, fontWeight: '700' }}>Scansiona QR di un amico</Text>
        </Pressable>

        {/* Steam */}
        <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16, marginTop: 28, marginBottom: 8 }}>Steam</Text>

        {user?.steam_id ? (
          <>
            {/* clearly-connected banner */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.accent + '22', borderColor: colors.accent, borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 12 }}>
              <Ionicons name="logo-steam" size={26} color={colors.accent} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.accent, fontWeight: '800' }}>Account Steam collegato</Text>
                <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>SteamID {user.steam_id}</Text>
              </View>
              <Ionicons name="checkmark-circle" size={22} color={colors.accent} />
            </View>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable onPress={() => api.steamPair(user.steam_id).then(() => Alert.alert('Steam', 'Ri-sincronizzazione avviata.')).catch((e) => Alert.alert('Errore', e.message))}
                style={{ flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, backgroundColor: '#1b2838', borderRadius: 10, padding: 13 }}>
                <Ionicons name="sync" size={16} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Ri-sincronizza</Text>
              </Pressable>
              <Pressable onPress={loginWithSteam}
                style={{ flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, backgroundColor: '#171a21', borderRadius: 10, padding: 13 }}>
                <Ionicons name="logo-steam" size={16} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Cambia account</Text>
              </Pressable>
            </View>

            <Pressable onPress={unlinkSteam} style={{ marginTop: 14, alignItems: 'center' }}>
              <Text style={{ color: colors.danger, fontWeight: '700', fontSize: 13 }}>Scollega Steam</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 8 }}>Accedi con Steam per sincronizzare giochi posseduti, achievement e statistiche.</Text>
            <Pressable onPress={loginWithSteam} style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, backgroundColor: '#171a21', borderRadius: 10, padding: 14, marginBottom: 12 }}>
              <Ionicons name="logo-steam" size={18} color="#fff" />
              <Text style={{ color: '#fff', fontWeight: '700' }}>Accedi con Steam</Text>
            </Pressable>
            <Text style={{ color: colors.textMuted, fontSize: 11, marginBottom: 6 }}>oppure inserisci manualmente lo SteamID64:</Text>
            <TextInput style={input} value={steamId} onChangeText={setSteamId} placeholder="76561197960435530" placeholderTextColor={colors.textMuted} keyboardType="numeric" />
            <Pressable onPress={pairSteam} style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, backgroundColor: '#1b2838', borderRadius: 10, padding: 14 }}>
              <Ionicons name="sync" size={18} color="#fff" />
              <Text style={{ color: '#fff', fontWeight: '700' }}>Collega manualmente</Text>
            </Pressable>
          </>
        )}

        <Pressable onPress={() => { logout(); }} style={{ marginTop: 32, alignItems: 'center' }}>
          <Text style={{ color: colors.danger, fontWeight: '700' }}>Esci</Text>
        </Pressable>
      </ScrollView>
      </KeyboardAvoidingView>

      {/* QR scanner */}
      <Modal visible={scanner} animationType="slide" onRequestClose={() => setScanner(false)}>
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          {!scanned ? (
            <CameraView style={{ flex: 1 }} barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={({ data }) => { try { setScanned(JSON.parse(data)); } catch { setScanned({ raw: data }); } }} />
          ) : (
            <SafeAreaView style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
              <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800', marginBottom: 16 }}>Profilo scansionato</Text>
              <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>👤 {scanned.username ?? scanned.raw}</Text>
              <View style={{ flexDirection: 'row', gap: 20, marginTop: 12 }}>
                <Text style={{ color: '#ccc' }}>🎮 Posseduti: <Text style={{ color: '#fff', fontWeight: '700' }}>{scanned.posseduti ?? scanned.giochi_giocati ?? 0}</Text></Text>
                <Text style={{ color: '#ccc' }}>🏆 Completati: <Text style={{ color: '#fff', fontWeight: '700' }}>{scanned.completati ?? 0}</Text></Text>
              </View>
              {scanned.top_completati?.length > 0 && (
                <View style={{ marginTop: 18 }}>
                  <Text style={{ color: '#9A9AAE', fontWeight: '700', marginBottom: 6 }}>Completati di recente</Text>
                  {scanned.top_completati.map((t) => <Text key={t} style={{ color: '#fff', marginTop: 2 }}>🏆 {t}</Text>)}
                </View>
              )}
              {scanned.top_posseduti?.length > 0 && (
                <View style={{ marginTop: 16 }}>
                  <Text style={{ color: '#9A9AAE', fontWeight: '700', marginBottom: 6 }}>Nella sua libreria</Text>
                  {scanned.top_posseduti.map((t) => <Text key={t} style={{ color: '#ccc', marginTop: 2 }}>🎮 {t}</Text>)}
                </View>
              )}
              <Pressable onPress={() => setScanned(null)} style={{ marginTop: 24, alignSelf: 'flex-start', backgroundColor: '#7C5CFF', borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10 }}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>Scansiona un altro</Text>
              </Pressable>
            </SafeAreaView>
          )}
          <Pressable onPress={() => setScanner(false)} style={{ position: 'absolute', top: 50, right: 20, backgroundColor: '#0008', borderRadius: 999, padding: 10 }}>
            <Ionicons name="close" size={24} color="#fff" />
          </Pressable>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const label = (colors) => ({ color: colors.textMuted, fontSize: 12, fontWeight: '700', marginBottom: 6 });
