const localDevelopmentHosts = ['localhost', '127.0.0.1', '::1']

export function developmentAllowedHosts(value: string | undefined): string[] {
  const configured = (value || '')
    .split(',')
    .map(host => host.trim().toLowerCase())
    .filter(host => host.length > 0 && !host.includes('/') && !host.includes(':'))

  return [...new Set([...localDevelopmentHosts, ...configured])]
}
