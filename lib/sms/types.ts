export type SmsSendInput = {
  phoneE164: string;
  code: string;
};

export type SmsSendResult = {
  providerRequestId?: string;
  providerStatusCode?: string;
};

export interface SmsProvider {
  // eslint-disable-next-line no-unused-vars
  sendVerificationCode(input: SmsSendInput): Promise<SmsSendResult>;
}

export type SmsProviderFailureCategory = 'configuration' | 'rate_limited' | 'provider' | 'network';

export class SmsProviderError extends Error {
  public readonly category: SmsProviderFailureCategory;
  public readonly providerStatusCode?: string;

  constructor(
    message: string,
    category: SmsProviderFailureCategory = 'provider',
    providerStatusCode?: string,
  ) {
    super(message);
    this.name = 'SmsProviderError';
    this.category = category;
    this.providerStatusCode = providerStatusCode;
  }
}
