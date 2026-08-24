import "react-native-gesture-handler";
import React, { useEffect, useState } from "react";
import { I18nManager, View } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as SplashScreen from "expo-splash-screen";
import {
  Cairo_400Regular,
  Cairo_600SemiBold,
  Cairo_700Bold,
  useFonts,
} from "@expo-google-fonts/cairo";

import { loadSession } from "../src/api/client";
import { useMe } from "../src/api/queries";
import { ThemeProvider } from "../src/theme/ThemeProvider";

// التطبيق عربي بالكامل، فالاتجاه يُفرض ولا يُترك للغة الجهاز.
I18nManager.allowRTL(true);
I18nManager.forceRTL(true);

SplashScreen.preventAutoHideAsync().catch(() => {});

/**
 * ذاكرة الطلبات.
 *
 * `staleTime` دقيقة: التنقّل بين الشاشات لا يعيد سؤال الخادم عمّا سأله قبل
 * لحظات، وهو ما يجعل الفتح فوريًا. و`gcTime` ساعة ليبقى المحفوظ حاضرًا حين
 * تعود إلى شاشة تركتها.
 */
const client = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      gcTime: 60 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Cairo_400Regular,
    Cairo_600SemiBold,
    Cairo_700Bold,
  });
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    loadSession().finally(() => setSessionReady(true));
  }, []);

  useEffect(() => {
    if (fontsLoaded && sessionReady) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, sessionReady]);

  if (!fontsLoaded || !sessionReady) return null;

  return (
    <QueryClientProvider client={client}>
      <SafeAreaProvider>
        <Themed />
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}

/** السمة تأتي من الخادم، فتُقرأ داخل موفّر الاستعلامات لا خارجه. */
function Themed() {
  const { data: me } = useMe();
  return (
    <ThemeProvider server={me?.theme ?? null}>
      <Gate />
    </ThemeProvider>
  );
}

/**
 * الحارس: من لا جلسة له يُدفع إلى الدخول، ومن له جلسة لا يرى شاشة الدخول.
 */
function Gate() {
  const { data: me, isLoading, isError } = useMe();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    const inAuth = segments[0] === "(auth)";
    if (isLoading) return;
    if ((isError || !me) && !inAuth) router.replace("/(auth)/login");
    if (me && inAuth) router.replace("/(tabs)");
  }, [me, isLoading, isError, segments]);

  return (
    <View style={{ flex: 1 }}>
      {/* كل ما يُفتح من «المزيد» يدخل من الجانب، فالرجوع يبقى مفهومًا.
          الشاشات الجذرية (الدخول والتبويبات) تتلاشى بلا اتجاه. */}
      <Stack
        screenOptions={{ headerShown: false, animation: "slide_from_left" }}
      >
        <Stack.Screen name="(auth)/login" options={{ animation: "fade" }} />
        <Stack.Screen name="(tabs)" options={{ animation: "fade" }} />
        <Stack.Screen name="animal/[id]" />
        <Stack.Screen name="money/index" />
        <Stack.Screen name="parties/index" />
        <Stack.Screen name="milk/index" />
        <Stack.Screen name="inventory/index" />
        <Stack.Screen name="purchases/index" />
        <Stack.Screen name="sales/index" />
        <Stack.Screen name="founding/index" />
        <Stack.Screen name="reports/index" />
        <Stack.Screen name="audit/index" />
        <Stack.Screen name="settings/profile" />
        <Stack.Screen name="settings/lists" />
        <Stack.Screen name="settings/users" />
        <Stack.Screen name="settings/theme" />
      </Stack>
    </View>
  );
}
