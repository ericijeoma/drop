// ────────────────────────────────────────────────────────────
// src/components/RideRequestCard.tsx
// Swipeable card for drivers to accept/decline incoming rides.
// Reanimated worklets run on UI thread — smooth even under load.
// ────────────────────────────────────────────────────────────

import { View, Text, StyleSheet, Dimensions, AccessibilityInfo } from 'react-native';
import { Gesture, GestureDetector }  from 'react-native-gesture-handler';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withSpring, withTiming, runOnJS,
  interpolate, Extrapolation,
}                                    from 'react-native-reanimated';
import { useTheme }                  from '@/shared/lib/theme';
import { formatNaira, formatDistance, formatDuration } from '@/shared/utils/format';

const SCREEN_W       = Dimensions.get('window').width;
const SWIPE_THRESHOLD = SCREEN_W * 0.35;

interface RideRequestCardProps {
  pickupAddress:  string;
  dropoffAddress: string;
  fareAmount:     number;
  distanceKm:     number;
  durationSec:    number;
  vehicleType:    string;
  onAccept:       () => void;
  onDecline:      () => void;
}

export function RideRequestCard({
  pickupAddress,
  dropoffAddress,
  fareAmount,
  distanceKm,
  durationSec,
  vehicleType,
  onAccept,
  onDecline,
}: RideRequestCardProps) {
  const theme      = useTheme();
  const translateX = useSharedValue(0);
  const opacity    = useSharedValue(1);

  function handleAccept() {
    'worklet';
    translateX.value = withTiming(SCREEN_W, {}, () => { runOnJS(onAccept)(); });
  }

  function handleDecline() {
    'worklet';
    translateX.value = withTiming(-SCREEN_W, {}, () => { runOnJS(onDecline)(); });
  }

  const gesture = Gesture.Pan()
    .onUpdate((e) => {
      'worklet';
      translateX.value = e.translationX;
      opacity.value    = interpolate(
        Math.abs(e.translationX),
        [0, SWIPE_THRESHOLD],
        [1, 0.7],
        Extrapolation.CLAMP
      );
    })
    .onEnd((e) => {
      'worklet';
      if (e.translationX > SWIPE_THRESHOLD)       handleAccept();
      else if (e.translationX < -SWIPE_THRESHOLD) handleDecline();
      else {
        translateX.value = withSpring(0);
        opacity.value    = withSpring(1);
      }
    });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    opacity:   opacity.value,
  }));

  const acceptOpacity = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [0, SWIPE_THRESHOLD], [0, 1], Extrapolation.CLAMP),
  }));

  const declineOpacity = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [-SWIPE_THRESHOLD, 0], [1, 0], Extrapolation.CLAMP),
  }));

  return (
    <View style={styles.container}>
      <Animated.Text style={[styles.swipeLabel, { color: theme.success }, acceptOpacity]}>
        ACCEPT
      </Animated.Text>
      <Animated.Text style={[styles.swipeLabel, styles.swipeLabelRight, { color: theme.danger }, declineOpacity]}>
        DECLINE
      </Animated.Text>

      <GestureDetector gesture={gesture}>
        <Animated.View
          style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }, cardStyle]}
          accessible
          accessibilityLabel={`New ride request. ${formatNaira(fareAmount)} fare. From ${pickupAddress} to ${dropoffAddress}. ${formatDistance(distanceKm)}, about ${formatDuration(durationSec)}.`}
          accessibilityHint="Swipe right to accept, swipe left to decline"
          accessibilityRole="none"
        >
          <Text style={[styles.fare, { color: theme.brand }]}>{formatNaira(fareAmount)}</Text>
          <Text style={[styles.vehicle, { color: theme.textSecondary }]}>{vehicleType}</Text>

          <View style={styles.row}>
            <View style={[styles.dot, { backgroundColor: theme.brand }]} />
            <Text style={[styles.address, { color: theme.text }]} numberOfLines={2}>
              {pickupAddress}
            </Text>
          </View>
          <View style={[styles.line, { backgroundColor: theme.border }]} />
          <View style={styles.row}>
            <View style={[styles.dot, { backgroundColor: theme.danger }]} />
            <Text style={[styles.address, { color: theme.text }]} numberOfLines={2}>
              {dropoffAddress}
            </Text>
          </View>

          <View style={styles.meta}>
            <Text style={[styles.metaText, { color: theme.textSecondary }]}>
              {formatDistance(distanceKm)}
            </Text>
            <Text style={[styles.metaText, { color: theme.textSecondary }]}>
              ~{formatDuration(durationSec)}
            </Text>
          </View>

          <Text style={[styles.hint, { color: theme.textTertiary }]}>
            Swipe right to accept · Swipe left to decline
          </Text>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, justifyContent: 'center', alignItems: 'center' },
  card:           { width: SCREEN_W - 32, borderRadius: 20, padding: 24, gap: 12, borderWidth: 1 },
  fare:           { fontSize: 36, fontWeight: '700' },
  vehicle:        { fontSize: 13, textTransform: 'capitalize', marginTop: -8 },
  row:            { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  dot:            { width: 10, height: 10, borderRadius: 5, marginTop: 4, flexShrink: 0 },
  line:           { width: 2, height: 20, marginLeft: 4 },
  address:        { flex: 1, fontSize: 15, lineHeight: 22 },
  meta:           { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  metaText:       { fontSize: 13 },
  hint:           { textAlign: 'center', fontSize: 12, marginTop: 4 },
  swipeLabel:     { position: 'absolute', left: 32, fontSize: 24, fontWeight: '800', letterSpacing: 2, zIndex: 10 },
  swipeLabelRight:{ left: undefined, right: 32 },
});