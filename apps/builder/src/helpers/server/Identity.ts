import type { Input } from '@neo/schemas'

import { Queries } from './Queries'
import { type Actor, Security } from './Security'

export class Identity {
  static async select(actor: Actor, input: Input<'select'>) {
    const next = { ...actor, tenantId: input.tenantId }
    await Security.buyer(next, Queries.READERS)
    return Queries.identity(next)
  }
}
