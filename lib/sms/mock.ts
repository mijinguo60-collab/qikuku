import { randomUUID } from 'crypto';
import type { SmsProvider, SmsSendInput, SmsSendResult } from './types';

/** Test-only transport. It intentionally exposes no code and is never selectable in production. */
export class MockSmsProvider implements SmsProvider {
  async sendVerificationCode(_input: SmsSendInput): Promise<SmsSendResult> {
    void _input;
    return { providerRequestId: `mock-${randomUUID()}`, providerStatusCode: 'Ok' };
  }
}
