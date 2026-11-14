import type { NextApiRequest, NextApiResponse } from 'next'

import { BaseRepository } from '@neo/prisma/repositories'

class Readiness {
  static async handle(_request: NextApiRequest, response: NextApiResponse) {
    await BaseRepository.ping().then(
      () => response.status(200).json({ ok: true }),
      () => response.status(503).json({ ok: false }),
    )
  }
}

export default Readiness.handle
