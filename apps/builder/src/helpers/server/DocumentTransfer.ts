import type { NextApiRequest, NextApiResponse } from 'next'
import { TRPCError } from '@trpc/server'
import { env } from '@neo/env'
import { DocumentRepository } from '@neo/prisma/repositories'
import { Values } from '@neo/schemas'
import { ContextFactory } from './context'
import { Commands } from './Commands'
import { localGoogleStorageEnabled } from './LocalGoogleStorage'
import { ObjectStore } from './Providers'
import { Queries } from './Queries'
import { Security } from './Security'

export class DocumentTransfer {
  static async handle(request: NextApiRequest, response: NextApiResponse, upload: boolean) {
    response.setHeader('Cache-Control', 'no-store')
    if (!localGoogleStorageEnabled()) return response.status(404).json({ error: 'Unavailable' })
    if (request.method !== (upload ? 'PUT' : 'GET')) {
      response.setHeader('Allow', upload ? 'PUT' : 'GET')
      return response.status(405).json({ error: 'Method not allowed' })
    }
    try {
      const { actor } = await ContextFactory.create({ req: request })
      if (!actor) return response.status(401).json({ error: 'Sign in to access documents' })
      const value = upload ? request.query.key : request.query.documentId
      if (typeof value !== 'string' || value.length > 128) return response.status(400).json({ error: 'Invalid document reference' })
      const document = await DocumentRepository.findFirst({ where: upload ? { objectKey: value, status: 'RESERVED' } : { id: value, status: 'CLEAN' }, include: { submission: true } })
      if (!document) return response.status(404).json({ error: 'Document is unavailable' })
      if (upload) {
        if (request.headers.origin !== new URL(env.APP_URL).origin) return response.status(403).json({ error: 'Use the application to upload documents' })
        await Security.access(actor, document.submission.caseId)
        const current = await Commands.current({ ...actor, tenantId: document.tenantId }, document.submission.caseId)
        Commands.require(current.row.status === 'DRAFT' && !current.snapshot.submittedAt && current.snapshot.id === document.submissionId, 'Select the current editable draft')
        Commands.require(Date.now() - document.createdAt.getTime() < Commands.DAY_MS, 'Upload reservation expired')
        if (request.headers['content-type'] !== ObjectStore.PDF) return response.status(415).json({ error: 'A PDF is required' })
        const chunks: Buffer[] = []
        let size = 0
        for await (const chunk of request) {
          const bytes = Buffer.from(chunk)
          size += bytes.length
          if (size > Values.MAX_FILE || size > (document.sizeBytes ?? 0)) return response.status(413).json({ error: 'File exceeds the reserved size' })
          chunks.push(bytes)
        }
        if (size !== document.sizeBytes) return response.status(400).json({ error: 'File size differs from the reservation' })
        const bytes = Buffer.concat(chunks)
        if (bytes.subarray(0, 5).toString() !== '%PDF-') return response.status(415).json({ error: 'A PDF is required' })
        await ObjectStore.STORAGE.bucket(env.GCS_QUARANTINE_BUCKET).file(document.objectKey).save(bytes, {
          contentType: ObjectStore.PDF, resumable: false, preconditionOpts: { ifGenerationMatch: 0 },
        })
        return response.status(204).end()
      }
      const scoped = Security.isBuyer(actor) ? { ...actor, tenantId: document.tenantId } : actor
      await Queries.download(scoped, { caseId: document.submission.caseId, documentId: document.id })
      const [bytes] = await ObjectStore.STORAGE.bucket(env.GCS_CLEAN_BUCKET).file(document.cleanKey!, { generation: document.cleanGeneration! }).download()
      response.setHeader('Content-Type', ObjectStore.PDF)
      response.setHeader('Content-Disposition', `attachment; filename="${document.kind}.pdf"`)
      response.setHeader('X-Content-Type-Options', 'nosniff')
      return response.status(200).send(bytes)
    } catch (error) {
      if (error instanceof TRPCError) return response.status(error.code === 'FORBIDDEN' ? 403 : error.code === 'NOT_FOUND' ? 404 : 409).json({ error: error.message })
      return response.status(503).json({ error: 'Document transfer is unavailable. Try again.' })
    }
  }
}
