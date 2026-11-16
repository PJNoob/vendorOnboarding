import type { NextApiRequest, NextApiResponse } from 'next'
import { DocumentTransfer } from '@/helpers/server/DocumentTransfer'

export const config = { api: { bodyParser: false } }
export default function upload(request: NextApiRequest, response: NextApiResponse) {
  return DocumentTransfer.handle(request, response, true)
}
