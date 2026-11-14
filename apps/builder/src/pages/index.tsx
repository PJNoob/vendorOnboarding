import type { GetServerSideProps } from 'next'

import { demoAuthEnabled } from '@neo/env'

import { isLoopbackConnection } from '@/helpers/server/DemoIdentity'

export const getServerSideProps: GetServerSideProps<{ demoAuth: boolean }> = async ({ req }) => ({
  props: { demoAuth: demoAuthEnabled() && isLoopbackConnection(req.socket.remoteAddress) },
})

export { Workspace as default } from '@/features/workspace/components/Workspace'
