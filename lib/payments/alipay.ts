import { PaymentProviderAdapter } from './types';
const unavailable = { status: 'unavailable' as const, message: '支付通道尚未开通' };
export const alipayPaymentProvider: PaymentProviderAdapter = {
  async createPayment() { return unavailable; }, async queryPayment() { return unavailable; }, async closePayment() { return unavailable; }, async refundPayment() { return unavailable; }, async verifyWebhook() { return { valid: false }; },
};
