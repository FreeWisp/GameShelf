import { Alert, Linking, Pressable, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../src/context/ThemeContext';

const SUPPORT_EMAIL = 'gameshelfunisa@gmail.com';

export default function Settings() {
  const { colors, mode, toggle } = useTheme();
  const router = useRouter();
  const version = Constants.expoConfig?.version ?? '1.0.0';

  const contact = () => {
    const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Supporto GameShelf')}`;
    Linking.openURL(url).catch(() => Alert.alert('Contatti', `Scrivici a ${SUPPORT_EMAIL}`));
  };

  const Row = ({ icon, title, right, onPress }) => (
    <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: colors.border }}>
      <Ionicons name={icon} size={20} color={colors.text} />
      <Text style={{ color: colors.text, fontWeight: '600', marginLeft: 12, flex: 1 }}>{title}</Text>
      {right}
    </Pressable>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 }}>
        <Pressable onPress={() => router.back()}><Ionicons name="arrow-back" size={22} color={colors.text} /></Pressable>
        <Text style={{ color: colors.text, fontWeight: '800', fontSize: 18 }}>Impostazioni</Text>
      </View>

      <View style={{ padding: 16, gap: 12 }}>
        <Row icon={mode === 'dark' ? 'moon' : 'sunny'} title={`Tema ${mode === 'dark' ? 'scuro' : 'chiaro'}`}
          right={<Switch value={mode === 'dark'} onValueChange={toggle} trackColor={{ true: colors.primary }} />} />

        <Row icon="mail-outline" title="Contatta gli sviluppatori" onPress={contact}
          right={<Ionicons name="chevron-forward" size={18} color={colors.textMuted} />} />

        <Row icon="information-circle-outline" title="Versione app"
          right={<Text style={{ color: colors.textMuted }}>{version}</Text>} />
      </View>

      <Text style={{ color: colors.textMuted, fontSize: 12, textAlign: 'center', marginTop: 'auto', marginBottom: 24 }}>
        GameShelf · {SUPPORT_EMAIL}
      </Text>
    </SafeAreaView>
  );
}
