/**
 * Checks if an error message indicates a credential/OAuth error.
 */
export function isCredentialErrorMessage(errorMessage: string): boolean {
  const pattern =
    /Credential for user identity\([^)]*\) is not found for the connection/i;
  return pattern.test(errorMessage);
}

/**
 * Extracts the login URL from a credential error message.
 * Pattern: error message containing a URL for connection setup
 * @returns The login URL or undefined if not found
 */
export function findLoginURLFromCredentialErrorMessage(
  errorMessage: string,
): string | undefined {
  const pattern =
    /please login first to the connection by visiting\s+(https?:\/\/[^\s]+)/i;
  const match = errorMessage.match(pattern);
  return match?.[1];
}

/**
 * Extracts the connection name from a credential error message.
 * Pattern: "for the connection 'connection_name'"
 * @returns The connection name or undefined if not found
 */
export function findConnectionNameFromCredentialErrorMessage(
  errorMessage: string,
): string | undefined {
  const pattern = /for the connection\s+'([^']+)'/i;
  const match = errorMessage.match(pattern);
  return match?.[1];
}
