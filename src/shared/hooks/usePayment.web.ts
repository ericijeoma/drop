// src/shared/hooks/usePayment.web.ts
import { useState } from 'react';

type PaymentTarget =
  | { rideId: string;  orderId?: never }
  | { orderId: string; rideId?: never  };

type UsePaymentOptions = PaymentTarget & {
  fareAmount: number;
  onSuccess:  () => void;
  onError?:   (message: string) => void;
};

interface UsePaymentResult {
  pay:        () => Promise<void>;
  isPaying:   boolean;
  isComplete: boolean;
  error:      string | null;
}

export function usePayment({
  onSuccess,
  onError,
}: UsePaymentOptions): UsePaymentResult {
  const [isPaying,   setIsPaying]   = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  const pay = async () => {
    setIsPaying(true);
    setError(null);
    // Simulate payment on web for testing UI only
    await new Promise(resolve => setTimeout(resolve, 1000));
    setIsComplete(true);
    setIsPaying(false);
    onSuccess();
  };

  return { pay, isPaying, isComplete, error };
}