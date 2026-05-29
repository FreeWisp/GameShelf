import { useEffect } from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/context/ThemeContext';
import { registerPushNotifications, notifyEpicFreeLocally } from '../../src/lib/notifications';

export default function TabsLayout() {
  const { colors } = useTheme();

  useEffect(() => {
    // Register for push + run the local Epic free-games check once logged in.
    registerPushNotifications();
    notifyEpicFreeLocally();
  }, []);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
      }}
    >
      <Tabs.Screen name="index" options={{
        title: 'Home',
        tabBarIcon: ({ color, size }) => <Ionicons name="home" color={color} size={size} />,
      }} />
      <Tabs.Screen name="search" options={{
        title: 'Cerca',
        tabBarIcon: ({ color, size }) => <Ionicons name="search" color={color} size={size} />,
      }} />
      <Tabs.Screen name="news" options={{
        title: 'News',
        tabBarIcon: ({ color, size }) => <Ionicons name="newspaper" color={color} size={size} />,
      }} />
    </Tabs>
  );
}
