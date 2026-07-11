import { PaymentProviderAdapter } from './types';

export const manualPaymentProvider: PaymentProviderAdapter = {
  async createPayment() { return { status: 'pending', message: '请联系平台管理员人工确认付款' }; },
  async queryPayment() { return { status: 'pending', message: '人工订单等待确认' }; },
  async closePayment() { return { status: 'closed' }; },
  async refundPayment() { return { status: 'refunded', message: '请由平台管理员确认退款' }; },
  async verifyWebhook() { return { valid: false }; },
};
