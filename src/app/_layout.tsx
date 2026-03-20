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

import { useEffect, useRef }             from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { GestureHandlerRootView }        from 'react-native-gesture-handler';
import { SafeAreaProvider }              from 'react-native-safe-area-context';
import { PersistQueryClientProvider }    from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister }   from '@tanstack/query-async-storage-persister';
import AsyncStorage                      from '@react-native-async-storage/async-storage';
import { StatusBar }                     from 'expo-status-bar';
import { useColorScheme }                from 'nativewind';
import * as Notifications                from 'expo-notifications';
import * as Device                       from 'expo-device';
import { StripeProvider }                from '@stripe/stripe-react-native';
import Constants                         from 'expo-constants';
import { queryClient }                   from '@/shared/lib/queryClient';
import { supabase }                      from '@/shared/lib/supabase';
import { useAuth }                       from '@/shared/hooks/useAuth';
import { useNetworkMonitor }             from '@/shared/hooks/useNetworkMonitor';
import { SupabaseDriverRepository }      from '@/shared/repositories/SupabaseDriverRepository';
import { preventAutoHideAsync, hideAsync } from 'expo-splash-screen';
import { logger }                        from '@/shared/lib/logger';

// ── Notification display behaviour while app is foregrounded ──
// Show a banner even when the app is open (e.g. driver gets a ride request
// while already in the app on a different screen)

preventAutoHideAsync();

Notifications.setNotificationHandler({
  // ✅ Fix — add the two new required fields
handleNotification: async () => ({
  shouldShowAlert:  true,
  shouldShowBanner: true,   // ← add
  shouldShowList:   true,   // ← add
  shouldPlaySound:  true,
  shouldSetBadge:   false,
}),
});

const persister = createAsyncStoragePersister({
  storage:      AsyncStorage,
  key:          'drop-query-cache',
  throttleTime: 1000,
});

const stripeKey = Constants.expoConfig?.extra?.stripePublishableKey as string;
const driverRepo = new SupabaseDriverRepository();

// ─────────────────────────────────────────────────────────────
// AuthGuard — sits inside providers, has access to auth state
// ─────────────────────────────────────────────────────────────
function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading }     = useAuth();
  const segments              = useSegments();
  const router                = useRouter();
  const appState              = useRef<AppStateStatus>(AppState.currentState);
  const notifResponseListener = useRef<Notifications.EventSubscription | undefined>(undefined);
  const notifReceivedListener = useRef<Notifications.EventSubscription | undefined>(undefined);


  // ── Network monitor (always active) ────────────────────────
  useNetworkMonitor();

  // ── Push notification setup ─────────────────────────────────
  useEffect(() => {
    if (!user) return;

    registerForPushNotifications(user.id, user.isDriver());

    // ── Listener 1: App is OPEN and a notification arrives ────
    // Drivers get a banner for incoming ride requests
    notifReceivedListener.current = Notifications.addNotificationReceivedListener(
      (notification) => {
        logger.info('Notification received in foreground', {
          type: notification.request.content.data?.type,
        });
      }
    );

    // ── Listener 2: User TAPS the notification ─────────────────
    // Deep link the driver directly to the request screen
    notifResponseListener.current = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data as Record<string, string>;

        if (data.rideId && user.isDriver()) {
          router.push({ pathname: '/(driver)/ride-request', params:{ rideId:data.rideId}});
        }

        if (data.orderId && user.isDriver()) {
          router.push(`/(driver)/delivery-request?orderId=${data.orderId}`);
        }
      }
    );

    // ── App returns from background ───────────────────────────
    // Check if the user was tapped into the app via a notification
    // while the app was backgrounded (not fully killed)
    const appStateSubscription = AppState.addEventListener(
      'change',
      async (nextState) => {
        if (
          appState.current.match(/inactive|background/) &&
          nextState === 'active'
        ) {
          // Check if there's a notification response waiting
          const response = await Notifications.getLastNotificationResponse();
          if (response) {
            const data = response.notification.request.content.data as Record<string, string>;
            if (data.rideId  && user.isDriver()) router.push(`/(driver)/ride-request?rideId=${data.rideId}`);
            if (data.orderId && user.isDriver()) router.push(`/(driver)/delivery-request?orderId=${data.orderId}`);
          }
        }
        appState.current = nextState;
      }
    );

    return () => {
      notifReceivedListener.current?.remove();
      notifResponseListener.current?.remove();
      appStateSubscription.remove();
    };
  }, [user, router]);

  // ── Auth guard — redirect based on role ────────────────────
  useEffect(() => {
    if (loading) return;
    hideAsync();

    const seg        = segments[0] as string;
    const inAuth     = seg === '(auth)';
    const inAdmin    = seg === '(admin)';
    const inDriver   = seg === '(driver)';
    const inCustomer = seg === '(customer)';

    // Not logged in → always go to login
    if (!user && !inAuth) {
      router.replace('/(auth)/login');
      return;
    }

    // Logged in but on auth screen → go to correct home
    if (user && inAuth) {
      if (user.isAdmin())    router.replace('/(admin)/dashboard');
      else if (user.isDriver()) router.replace('/(driver)/dashboard');
      else                   router.replace('/(customer)');
      return;
    }

    // Role guard: customer trying to access driver screens
    if (user?.isCustomer() && (inDriver || inAdmin)) {
      router.replace('/(customer)');
      return;
    }

    // Role guard: driver trying to access customer screens
    if (user?.isDriver() && (inCustomer || inAdmin)) {
      router.replace('/(driver)/dashboard');
      return;
    }

    // Role guard: non-admin trying to access admin screens
    if (user && !user.isAdmin() && inAdmin) {
      if (user.isDriver()) router.replace('/(driver)/dashboard');
      else                 router.replace('/(customer)');
    }
  }, [user, loading, segments, router]);

  return <>{children}</>;
}

// ─────────────────────────────────────────────────────────────
// Push notification registration
// ─────────────────────────────────────────────────────────────
async function registerForPushNotifications(
  userId:   string,
  isDriver: boolean
): Promise<void> {
  // Expo Go does not support push notifications — skip silently
  if (!Device.isDevice) {
    logger.info('Push notifications skipped — not a physical device');
    return;
  }

  try {
    // Check existing permission
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    // Request permission if not already granted
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      logger.warn('Push notification permission denied', { userId });
      return;
    }

    // Get the Expo push token
    // projectId comes from app.json — needed for Expo's push service
    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    const token = await Notifications.getExpoPushTokenAsync({ projectId });

    logger.info('Push token registered', { userId, isDriver });

    // Store token:
    // - For drivers: stored in drivers.fcm_token for ride/delivery notifications
    // - For customers: stored in users table for ride status notifications
    if (isDriver) {
      // Get driver profile then update FCM token
      const driver = await driverRepo.getByUserId(userId);
      if (driver) {
        await driverRepo.updateFcmToken(driver.id, token.data);
      }
    } else {
      // For customers, store token in users table (add fcm_token column if not present)
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

// ─────────────────────────────────────────────────────────────
// Root layout — outermost wrapper
// ─────────────────────────────────────────────────────────────
export default function RootLayout() {
  const { colorScheme } = useColorScheme();

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
                {/*
                  Expo Router auto-registers all screens from the file system.
                  We only need to define custom options here.
                  All screens default to headerShown: false — each screen
                  manages its own header/back button.
                */}
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
