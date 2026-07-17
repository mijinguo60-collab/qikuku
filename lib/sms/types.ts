export type SmsSendInput = { phone: string; code: string };
export interface SmsProvider { send(input: SmsSendInput): Promise<void>; }

export class SmsProviderError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = 'SmsProviderError';
  }
}
