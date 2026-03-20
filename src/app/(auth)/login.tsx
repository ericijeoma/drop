// ════════════════════════════════════════════════════════════
// AUTH SCREENS
// ════════════════════════════════════════════════════════════

// src/app/(auth)/login.tsx
import { useState }                    from 'react';
import { View, Text, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets }           from 'react-native-safe-area-context';
import { useMutation }                 from '@tanstack/react-query';
import { useRouter }                   from 'expo-router';
import { useTheme }                    from '@/shared/lib/theme';
import { LoginUseCase }                from '@/domains/auth/usecases/LoginUseCase';
import { SupabaseAuthRepository }      from '@/shared/repositories/SupabaseAuthRepository';
import  PhoneInput                   from '@/components/Input/PhoneInput';
import PrimaryButton                from '@/components/Button/PrimaryButton';
import { ThemeToggle }                 from '@/components/ThemeToggle';
import {styles}                        from '@/shared/styles';

const authRepo = new SupabaseAuthRepository();
const useCase  = new LoginUseCase(authRepo);

export function LoginScreen() {
  const theme   = useTheme();
  const insets  = useSafeAreaInsets();
  const router  = useRouter();
  const [phone, setPhone]       = useState('');
  const [otp,   setOtp]         = useState('');
  const [stage, setStage]       = useState<'phone' | 'otp'>('phone');
  const [phoneError, setPhoneError] = useState('');
  const [otpError,   setOtpError]   = useState('');

  const sendOtpMutation = useMutation({
    mutationFn: () => useCase.sendOtp(phone),
    onSuccess:  () => { setStage('otp'); setPhoneError(''); },
    onError:    (e: Error) => setPhoneError(e.message),
  });

  const verifyMutation = useMutation({
    mutationFn: () => useCase.verifyOtp(phone, otp),
    onSuccess:  (user) => {
      if (user.isAdmin())    router.replace('/(admin)/dashboard');
      else if (user.isDriver()) router.replace('/(driver)/dashboard');
      else                   router.replace('/(customer)');
    },
    onError: (e: Error) => setOtpError(e.message),
  });

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.loginContainer, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.loginHeader}>
          <ThemeToggle />
        </View>

        <Text style={[styles.loginTitle, { color: theme.text }]} accessibilityRole="header">
          Drop
        </Text>
        <Text style={[styles.loginSubtitle, { color: theme.textSecondary }]}>
          {stage === 'phone' ? 'Enter your phone number to get started' : `Enter the 6-digit code sent to ${phone}`}
        </Text>

        {stage === 'phone' ? (
          <>
            <PhoneInput
              value={phone}
              onChangeText={setPhone}
              error={phoneError}
              autoFocus
            />
            <PrimaryButton
              label="Send code"
              onPress={() => sendOtpMutation.mutate()}
              loading={sendOtpMutation.isPending}
              disabled={phone.length < 10}
              accessibilityHint="We will send a 6-digit code to your phone number"
            />
          </>
        ) : (
          <>
            <PhoneInput
              value={otp}
              onChangeText={setOtp}
              error={otpError}
              autoFocus
            />
            <PrimaryButton
              label="Verify"
              onPress={() => verifyMutation.mutate()}
              loading={verifyMutation.isPending}
              disabled={otp.length !== 6}
            />
            <PrimaryButton
              label="Resend code"
              onPress={() => sendOtpMutation.mutate()}
              loading={sendOtpMutation.isPending}
              variant="ghost"
            />
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}


export default LoginScreen;