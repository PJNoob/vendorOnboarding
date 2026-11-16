import type { GetServerSideProps } from 'next'

import { demoAuthEnabled } from '@neo/env'
import type { Country } from '@neo/schemas'
import { countryProvider } from '@/helpers/server/CountryProvider'

import { isLoopbackConnection } from '@/helpers/server/DemoIdentity'

export const getServerSideProps: GetServerSideProps<{ demoAuth: boolean; countries: Country[] }> = async ({ req }) => ({
  props: { countries: await countryProvider.list(), demoAuth: demoAuthEnabled() && isLoopbackConnection(req.socket.remoteAddress) },
})

export { Workspace as default } from '@/features/workspace/components/Workspace'
