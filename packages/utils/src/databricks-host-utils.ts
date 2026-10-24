function normalizeHost(host: string | undefined): string {
  if (!host) {
    throw new Error(
      'Databricks host configuration required. Please set either:\n' +
        '- DATABRICKS_HOST environment variable\n' +
        '- DATABRICKS_CONFIG_PROFILE environment variable',
    );
  }

  // Remove protocol and trailing slash if present
  return host.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

export function getHostUrl(host?: string): string {
  const normalizedHost = normalizeHost(host || process.env.DATABRICKS_HOST);
  return `https://${normalizedHost}`;
}

export function getHostDomain(host?: string): string {
  return normalizeHost(host || process.env.DATABRICKS_HOST);
}
