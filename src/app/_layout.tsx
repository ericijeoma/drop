// src/app/_layout.tsx
//
// Root layout — the single entry point for the entire Drop app.
// Every screen in the app is a child of this layout.
//
// Responsibilities (in order of execution):
//   1. Wrap app in all providers (Gesture, SafeArea, QueryClient, Stripe)
//   2. Register device for push notifications → store FCM token on driver profile
//   3. Listen for incoming push notifications → deep link driver to ride/delivery request
//   4. Auth guard → redirect to correct home screen based on role
//   5. Network monitor → flush offline queue on reconnect
//
// File path: src/app/_layout.tsx

import { useEffect, useRef }                    from 'react';
import { AppState, type AppStateStatus }         from 'react-native';
import { Stack, useRouter, useSegments }         from 'expo-router';
import { GestureHandlerRootView }                from 'react-native-gesture-handler';
import { SafeAreaProvider }                      from 'react-native-safe-area-context';
import { PersistQueryClientProvider }            from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister }           from '@tanstack/query-async-storage-persister';
import AsyncStorage                              from '@react-native-async-storage/async-storage';
import { StatusBar }                             from 'expo-status-bar';
import { useColorScheme }                        from 'nativewind';
import { isDevice }                              from 'expo-device';
import { StripeProvider }                        from '@stripe/stripe-react-native';
import Constants, { ExecutionEnvironment }       from 'expo-constants';
import { preventAutoHideAsync, hideAsync }       from 'expo-splash-screen';

// ── Type-only import — zero side effects, safe in Expo Go ──────────────────
import type { EventSubscription }               from 'expo-notifications';

import { queryClient }                           from '@/shared/lib/queryClient';
import { supabase }                              from '@/shared/lib/supabase';
import { useAuth }                               from '@/shared/hooks/useAuth';
import { useNetworkMonitor }                     from '@/shared/hooks/useNetworkMonitor';
import { SupabaseDriverRepository }              from '@/shared/repositories/SupabaseDriverRepository';
import { logger }                                from '@/shared/lib/logger';

// ── Detect Expo Go once at module level ────────────────────────────────────
// Must be resolved before any expo-notifications code runs.
// expo-notifications triggers DevicePushTokenAutoRegistration.fx.js as a
// module-level side effect, which throws in Expo Go SDK 53+.
// All notification imports are therefore done lazily via dynamic import()
// and are gated on this flag — keeping the module safe to load in Expo Go.
const isExpoGo =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

preventAutoHideAsync();

const persister = createAsyncStoragePersister({
  storage:      AsyncStorage,
  key:          'drop-query-cache',
  throttleTime: 1000,
});

const stripeKey  = Constants.expoConfig?.extra?.stripePublishableKey as string;
const driverRepo = new SupabaseDriverRepository();

// ─────────────────────────────────────────────────────────────────────────────
// AuthGuard — sits inside providers, has access to auth state
// ─────────────────────────────────────────────────────────────────────────────
function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading }     = useAuth();
  const segments              = useSegments();
  const router                = useRouter();
  const appState              = useRef<AppStateStatus>(AppState.currentState);
  const notifReceivedListener = useRef<EventSubscription | undefined>(undefined);
  const notifResponseListener = useRef<EventSubscription | undefined>(undefined);

  // ── Network monitor (always active) ────────────────────────────────────
  useNetworkMonitor();

  // ── Push notification setup ─────────────────────────────────────────────
  useEffect(() => {
    if (!user || isExpoGo) return;

    // Register device and store push token
    registerForPushNotifications(user.id, user.isDriver());

    // Dynamic named imports — only loaded on real devices outside Expo Go
    let mounted = true;

    import('expo-notifications').then(({
      addNotificationReceivedListener,
      addNotificationResponseReceivedListener,
      getLastNotificationResponse,
    }) => {
      if (!mounted) return;

      // ── Listener 1: Notification arrives while app is OPEN ─────────────
      notifReceivedListener.current = addNotificationReceivedListener(
        (notification) => {
          logger.info('Notification received in foreground', {
            type: notification.request.content.data?.type,
          });
        }
      );

      // ── Listener 2: User TAPS the notification ──────────────────────────
      notifResponseListener.current = addNotificationResponseReceivedListener(
        (response) => {
          const data = response.notification.request.content.data as Record<string, string>;
          if (data.rideId  && user.isDriver()) {
            router.push({ pathname: '/(driver)/ride-request', params: { rideId: data.rideId } });
          }
          if (data.orderId && user.isDriver()) {
            router.push(`/(driver)/delivery-request?orderId=${data.orderId}`);
          }
        }
      );

      // ── App returns from background ─────────────────────────────────────
      const appStateSubscription = AppState.addEventListener(
        'change',
        async (nextState) => {
          if (
            appState.current.match(/inactive|background/) &&
            nextState === 'active'
          ) {
            const response = await getLastNotificationResponse();
            if (response) {
              const data = response.notification.request.content.data as Record<string, string>;
              if (data.rideId  && user.isDriver()) router.push(`/(driver)/ride-request?rideId=${data.rideId}`);
              if (data.orderId && user.isDriver()) router.push(`/(driver)/delivery-request?orderId=${data.orderId}`);
            }
          }
          appState.current = nextState;
        }
      );

      // Store cleanup reference inside the .then so it runs on unmount
      notifReceivedListener.current  = notifReceivedListener.current;
      notifResponseListener.current  = notifResponseListener.current;

      // Nest cleanup here so appStateSubscription is in scope
      return () => {
        appStateSubscription.remove();
      };
    });

    return () => {
      mounted = false;
      notifReceivedListener.current?.remove();
      notifResponseListener.current?.remove();
    };
  }, [user, router]);

  // ── Auth guard — redirect based on role ──────────────────────────────────
  useEffect(() => {
    if (loading) return;
    hideAsync();

    const seg        = segments[0] as string;
    const inAuth     = seg === '(auth)';
    const inAdmin    = seg === '(admin)';
    const inDriver   = seg === '(driver)';
    const inCustomer = seg === '(customer)';

    if (!user && !inAuth) {
      router.replace('/(auth)/login');
      return;
    }

    if (user && inAuth) {
      if      (user.isAdmin())    router.replace('/(admin)/dashboard');
      else if (user.isDriver())   router.replace('/(driver)/dashboard');
      else                        router.replace('/(customer)');
      return;
    }

    if (user?.isCustomer() && (inDriver || inAdmin)) {
      router.replace('/(customer)');
      return;
    }

    if (user?.isDriver() && (inCustomer || inAdmin)) {
      router.replace('/(driver)/dashboard');
      return;
    }

    if (user && !user.isAdmin() && inAdmin) {
      if (user.isDriver()) router.replace('/(driver)/dashboard');
      else                 router.replace('/(customer)');
    }
  }, [user, loading, segments, router]);

  return <>{children}</>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Push notification registration
// ─────────────────────────────────────────────────────────────────────────────
async function registerForPushNotifications(
  userId:   string,
  isDriver: boolean,
): Promise<void> {
  if (!isDevice || isExpoGo) {
    logger.info('Push notifications skipped — Expo Go or not a physical device');
    return;
  }

  try {
    const {
      getPermissionsAsync,
      requestPermissionsAsync,
      getExpoPushTokenAsync,
    } = await import('expo-notifications');

    const { status: existingStatus } = await getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      logger.warn('Push notification permission denied', { userId });
      return;
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    const token     = await getExpoPushTokenAsync({ projectId });

    logger.info('Push token registered', { userId, isDriver });

    if (isDriver) {
      const driver = await driverRepo.getByUserId(userId);
      if (driver) await driverRepo.updateFcmToken(driver.id, token.data);
    } else {
      await supabase
        .from('users')
        .update({ fcm_token: token.data })
        .eq('id', userId);
    }
  } catch (error) {
    // Never crash the app because notifications failed
    logger.error('Push notification registration failed', { error: String(error) });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Root layout — outermost wrapper
// ─────────────────────────────────────────────────────────────────────────────
export default function RootLayout() {
  const { colorScheme } = useColorScheme();

  // ── Set notification display behaviour while app is foregrounded ──────────
  // Done here (not module level) because it requires a dynamic import
  // to safely avoid the Expo Go SDK 53 side-effect crash.
  useEffect(() => {
    if (isExpoGo) return;
    import('expo-notifications').then(({ setNotificationHandler }) => {
      setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert:  true,
          shouldShowBanner: true,
          shouldShowList:   true,
          shouldPlaySound:  true,
          shouldSetBadge:   false,
        }),
      });
    });
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StripeProvider
          publishableKey={stripeKey}
          merchantIdentifier="merchant.com.drop.app"
          urlScheme="drop"
        >
          <PersistQueryClientProvider
            client={queryClient}
            persistOptions={{ persister }}
          >
            <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
            <AuthGuard>
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="(auth)"     options={{ headerShown: false }} />
                <Stack.Screen name="(customer)" options={{ headerShown: false }} />
                <Stack.Screen name="(driver)"   options={{ headerShown: false }} />
                <Stack.Screen name="(admin)"    options={{ headerShown: false }} />
              </Stack>
            </AuthGuard>
          </PersistQueryClientProvider>
        </StripeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
