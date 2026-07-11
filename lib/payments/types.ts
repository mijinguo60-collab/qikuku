export type PaymentProvider = 'manual' | 'wechat' | 'alipay';
export type PaymentRequest = { orderId: string; orderNo: string; amountCents: number; description: string };
export type PaymentResult = { status: 'pending' | 'paid' | 'closed' | 'refunded' | 'unavailable'; providerOrderNo?: string; message?: string };

export interface PaymentProviderAdapter {
  createPayment(input: PaymentRequest): Promise<PaymentResult>;
  queryPayment(orderNo: string): Promise<PaymentResult>;
  closePayment(orderNo: string): Promise<PaymentResult>;
  refundPayment(orderNo: string, amountCents: number): Promise<PaymentResult>;
  verifyWebhook(rawBody: string, headers: Headers): Promise<{ valid: boolean; orderNo?: string; status?: string }>;
}
