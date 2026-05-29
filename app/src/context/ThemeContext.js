import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme } from 'react-native';

// Dark / light palettes. Default is dark to match the wireframes.
const palettes = {
  dark: {
    mode: 'dark',
    bg: '#0E0E12',
    surface: '#17171F',
    surfaceAlt: '#1F1F2A',
    border: '#2A2A38',
    text: '#F2F2F7',
    textMuted: '#9A9AAE',
    primary: '#7C5CFF',
    accent: '#22C55E',
    star: '#F5B301',
    danger: '#EF4444',
  },
  light: {
    mode: 'light',
    bg: '#F4F4F8',
    surface: '#FFFFFF',
    surfaceAlt: '#ECECF3',
    border: '#DEDEE8',
    text: '#15151C',
    textMuted: '#6B6B7B',
    primary: '#6C44FF',
    accent: '#16A34A',
    star: '#E0A000',
    danger: '#DC2626',
  },
};

const ThemeContext = createContext(null);
const KEY = 'gameshelf.theme';

export function ThemeProvider({ children }) {
  const system = useColorScheme();
  const [mode, setMode] = useState('dark');

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((v) => { if (v) setMode(v); });
  }, []);

  const setThemeMode = async (m) => {
    setMode(m);
    await AsyncStorage.setItem(KEY, m);
  };

  const toggle = () => setThemeMode(mode === 'dark' ? 'light' : 'dark');

  const value = useMemo(
    () => ({ mode, colors: palettes[mode] ?? palettes.dark, setThemeMode, toggle, system }),
    [mode, system],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
