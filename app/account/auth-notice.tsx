const messages: Record<string, string> = {
  callback: 'This sign-in or confirmation link could not be completed. Try again from this device, or sign in with email.',
  'sign-in': 'Sign in to view your account.',
  unavailable: 'Account services are temporarily unavailable.',
  'signed-out': 'You have been signed out.',
  expired: 'This reset link expired or could not be verified. Request a new one below.',
  'password-updated': 'Your password was updated.',
};

export async function AuthNotice({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const { notice } = await searchParams;
  return typeof notice === 'string' && Object.hasOwn(messages, notice)
    ? <p className="gr-auth-status mb-4!" role="status">{messages[notice]}</p> : null;
}
