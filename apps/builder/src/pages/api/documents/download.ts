import type { NextApiRequest, NextApiResponse } from 'next'
import { DocumentTransfer } from '@/helpers/server/DocumentTransfer'

export default function download(request: NextApiRequest, response: NextApiResponse) {
  return DocumentTransfer.handle(request, response, false)
}
