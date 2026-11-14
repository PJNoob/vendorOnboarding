export const demoIdentity = {
  email: 'demo-admin@example.test',
  id: 'demo-admin',
  name: 'Demo Admin',
  tenantId: 'harbor-biolabs-demo',
} as const

export function isLoopbackConnection(address?: string) {
  return address === '::1' || address === '127.0.0.1' || address === '::ffff:127.0.0.1'
}
