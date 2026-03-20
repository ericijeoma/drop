// stripe-react-native.web.js
export const useStripe = () => ({
  initPaymentSheet: async () => ({ error: null }),
  presentPaymentSheet: async () => ({ error: null }),
});
export const StripeProvider = ({ children }) => children;
export const CardField = () => null;
export const CardForm = () => null;