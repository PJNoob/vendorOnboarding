import type { Prisma } from '@prisma/client'

import { BaseRepository, type TransactionClient } from '../base/BaseRepository'

export class DocumentRepository extends BaseRepository {
  static count<T extends Prisma.DocumentCountArgs>(args: Prisma.SelectSubset<T, Prisma.DocumentCountArgs>, tx?: TransactionClient) {
    return DocumentRepository.getClient(tx).document.count(args)
  }

  static create<T extends Prisma.DocumentCreateArgs>(args: Prisma.SelectSubset<T, Prisma.DocumentCreateArgs>, tx?: TransactionClient) {
    return DocumentRepository.getClient(tx).document.create(args)
  }

  static findFirst<T extends Prisma.DocumentFindFirstArgs>(args: Prisma.SelectSubset<T, Prisma.DocumentFindFirstArgs>, tx?: TransactionClient) {
    return DocumentRepository.getClient(tx).document.findFirst(args)
  }

  static findMany<T extends Prisma.DocumentFindManyArgs>(args: Prisma.SelectSubset<T, Prisma.DocumentFindManyArgs>, tx?: TransactionClient) {
    return DocumentRepository.getClient(tx).document.findMany(args)
  }

  static updateMany<T extends Prisma.DocumentUpdateManyArgs>(args: Prisma.SelectSubset<T, Prisma.DocumentUpdateManyArgs>, tx?: TransactionClient) {
    return DocumentRepository.getClient(tx).document.updateMany(args)
  }
}
