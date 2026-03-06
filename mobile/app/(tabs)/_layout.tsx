import React from 'react';
import { SymbolView } from 'expo-symbols';
import { Tabs } from 'expo-router';
import { Platform } from 'react-native';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useClientOnlyValue } from '@/components/useClientOnlyValue';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const micIcon = Platform.select({ ios: 'mic.circle.fill', default: 'mic' }) as any;
  const fragmentsIcon = Platform.select({ ios: 'square.stack.3d.up.fill', default: 'square.stack.3d.up.fill' }) as any;
  const profileIcon = Platform.select({ ios: 'person.circle.fill', default: 'person.circle.fill' }) as any;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme].tint,
        // Disable the static render of the header on web
        // to prevent a hydration error in React Navigation v6.
        headerShown: useClientOnlyValue(false, true),
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: '灵感捕手',
          tabBarIcon: ({ color }) => (
            <SymbolView
              name={micIcon}
              tintColor={color}
              size={28}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="fragments"
        options={{
          title: '碎片库',
          tabBarIcon: ({ color }) => (
            <SymbolView
              name={fragmentsIcon}
              tintColor={color}
              size={28}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: '我的',
          tabBarIcon: ({ color }) => (
            <SymbolView
              name={profileIcon}
              tintColor={color}
              size={28}
            />
          ),
        }}
      />
    </Tabs>
  );
}
