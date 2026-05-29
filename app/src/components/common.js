import { Image, Text, View } from 'react-native';

export const STATUS_META = {
  da_iniziare: { label: 'DA INIZIARE', color: '#9A9AAE', icon: '○' },
  in_corso: { label: 'DA CONTINUARE', color: '#22C55E', icon: '◐' },
  completato: { label: 'COMPLETATO', color: '#7C5CFF', icon: '✓' },
};

export const STATUS_ORDER = ['da_iniziare', 'in_corso', 'completato'];

const PLACEHOLDER = 'https://placehold.co/300x400/17171F/9A9AAE?text=No+Cover';

export function GameCover({ url, size = 'md', style }) {
  const dims = { sm: { w: 56, h: 76 }, md: { w: 110, h: 150 }, lg: { w: 130, h: 180 } }[size];
  return (
    <Image
      source={{ uri: url || PLACEHOLDER }}
      style={[{ width: dims.w, height: dims.h, borderRadius: 10, backgroundColor: '#1F1F2A' }, style]}
      resizeMode="cover"
    />
  );
}

export function Stars({ rating, max = 5, color = '#F5B301' }) {
  // rating is 0-100; convert to 0-5
  const stars = Math.round((rating ?? 0) / 20);
  return (
    <Text style={{ color, fontSize: 13, letterSpacing: 1 }}>
      {'★'.repeat(stars)}{'☆'.repeat(Math.max(0, max - stars))}
    </Text>
  );
}

export function Pill({ children, color = '#2A2A38', textColor = '#F2F2F7', style }) {
  return (
    <View style={[{ backgroundColor: color, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }, style]}>
      <Text style={{ color: textColor, fontSize: 11, fontWeight: '600' }}>{children}</Text>
    </View>
  );
}
