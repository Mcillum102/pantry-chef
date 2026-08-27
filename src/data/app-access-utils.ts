export function shouldShowKitchenLoading(input: {
  configured: boolean;
  status: string;
  hasSession: boolean;
  hasHousehold: boolean;
}) {
  if (!input.configured) return false;
  if (input.status === 'loading') return true;
  if (!input.hasSession || input.hasHousehold) return false;
  return !['needs-household', 'signed-out', 'not-configured', 'error'].includes(input.status);
}
