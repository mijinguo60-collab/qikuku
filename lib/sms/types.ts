export type SmsSendInput = {
  phoneE164: string;
  code: string;
};

export type SmsSendResult = {
  providerRequestId?: string;
  providerStatusCode?: string;
  providerStatusMessage?: string;
};

export interface SmsProvider {
  // eslint-disable-next-line no-unused-vars
  sendVerificationCode(input: SmsSendInput): Promise<SmsSendResult>;
}

export type SmsProviderFailureCategory = 'configuration' | 'rate_limited' | 'provider' | 'network';

export class SmsProviderError extends Error {
  public readonly category: SmsProviderFailureCategory;
  public readonly providerStatusCode?: string;
  public readonly providerStatusMessage?: string;
  public readonly providerRequestId?: string;

  constructor(
    message: string,
    category: SmsProviderFailureCategory = 'provider',
    providerStatusCode?: string,
    providerStatusMessage?: string,
    providerRequestId?: string,
  ) {
    super(message);
    this.name = 'SmsProviderError';
    this.category = category;
    this.providerStatusCode = providerStatusCode;
    this.providerStatusMessage = providerStatusMessage;
    this.providerRequestId = providerRequestId;
  }
}
