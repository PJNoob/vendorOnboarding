import type { NextApiRequest, NextApiResponse } from 'next'

class Liveness {
  static handle(_request: NextApiRequest, response: NextApiResponse) {
    response.status(200).json({ ok: true })
  }
}

export default Liveness.handle
