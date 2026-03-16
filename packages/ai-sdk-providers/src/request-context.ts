export function shouldInjectContextForEndpoint(
  endpointTask: string | undefined,
): boolean {
  const API_PROXY = process.env.API_PROXY;

  if (API_PROXY) {
    return true;
  }

  return (
    endpointTask === 'agent/v2/chat' || endpointTask === 'agent/v1/responses'
  );
}
