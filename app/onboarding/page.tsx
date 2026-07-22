import { redirect } from 'next/navigation';

/** The former post-login enterprise creation flow is intentionally retired. */
export default function OnboardingPage() {
  redirect('/auth/register');
}
