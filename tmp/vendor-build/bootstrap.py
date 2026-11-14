from pathlib import Path
import json,re
root=Path('tmp/vendor-build/project')
def write(path,content):
 p=root/path;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(content.strip()+'\n')
def obj(path,data):write(path,json.dumps(data,indent=2,sort_keys=True))
write('pnpm-workspace.yaml','packages:\n  - apps/*\n  - packages/*')
obj('package.json',{'name':'vendor-onboarding','private':True,'packageManager':'pnpm@10.15.0','scripts':{'dev':'pnpm --filter @neo/builder dev','worker':'pnpm --filter @neo/builder worker','build':'pnpm --filter @neo/builder build','seed':'pnpm --filter @neo/builder seed'}})
for pkg,deps in {'env':{'@t3-oss/env-nextjs':'0.13.8','zod':'^4.1.0'},'prisma':{'@prisma/client':'6.19.0','@neo/env':'workspace:*'},'schemas':{'zod':'^4.1.0'}}.items():
 files={'env':{'.':'./env.ts'},'prisma':{'.':'./index.ts','./client':'./client.ts','./repositories':'./repositories/index.ts'},'schemas':{'.':'./index.ts'}}[pkg]
 data={'name':'@neo/'+pkg,'private':True,'type':'module','exports':files,'dependencies':deps}
 if pkg=='prisma':
  data.update(devDependencies={'prisma':'6.19.0'},scripts={k:'prisma '+v+' --schema postgresql/schema.prisma' for k,v in {'db:generate':'generate','migrate:deploy':'migrate deploy','migrate:dev':'migrate dev --create-only'}.items()})
 obj(f'packages/{pkg}/package.json',data)
obj('apps/builder/package.json',{'name':'@neo/builder','private':True,'scripts':{'build':'next build','dev':'next dev','start':'next start','seed':'tsx --tsconfig tsconfig.json src/helpers/server/seed.ts','worker':'tsx --tsconfig tsconfig.json src/helpers/server/worker.ts'},'dependencies':{'@google-cloud/storage':'^7.17.0','@neo/env':'workspace:*','@neo/prisma':'workspace:*','@neo/schemas':'workspace:*','@trpc/client':'^11.7.0','@trpc/server':'^11.7.0','better-auth':'^1.4.0','bullmq':'^5.63.0','ioredis':'^5.8.0','next':'^16.0.0','react':'^19.2.0','react-dom':'^19.2.0','superjson':'^2.2.0','tsx':'^4.20.0','zod':'^4.1.0','zod-openapi':'^5.4.0'},'devDependencies':{'@types/node':'^22.0.0','@types/react':'^19.0.0','@types/react-dom':'^19.0.0','typescript':'^5.9.0'}})
obj('apps/builder/tsconfig.json',{'compilerOptions':{'strict':True,'noImplicitAny':True,'noEmit':True,'target':'ES2022','module':'ESNext','moduleResolution':'bundler','jsx':'react-jsx','esModuleInterop':True,'skipLibCheck':True,'paths':{'@/*':['./src/*']}},'include':['next-env.d.ts','src/**/*.ts','src/**/*.tsx']})
write('apps/builder/next.config.mjs',"""export default {
  transpilePackages: ['@neo/env', '@neo/prisma', '@neo/schemas'],
}
""")
write('.gitignore','.env\n.env.local\n.next/\nnode_modules/\n*.tsbuildinfo')
obj('.prettierrc.json',{'semi':False,'singleQuote':True,'trailingComma':'es5'})
schema=Path('tmp/technical/schema.prisma').read_text()
schema=schema.replace('  url = env("DATABASE_URL")','  url = env("DATABASE_URL")\n  schemas = ["public"]')
schema=re.sub(r'((?:model|enum) \w+ \{[^}]+)\n}',r'\1\n  @@schema("public")\n}',schema)
schema=schema.replace('  emailKey String\n  tokenHash','  recipientCiphertext Bytes\n  emailKey String\n  tokenHash')
schema=schema.replace('  payloadCiphertext Bytes','  payloadCiphertext Bytes?')
schema=schema.replace('  objectKey String @unique','  objectKey String\n  cleanGeneration String?\n  cleanKey String?')
schema=schema.replace('  sourceRef String?','  sourceRef String?\n  evidenceJson Json?')
schema=schema.replace('  supplierMessage String?','  supplierMessage String?\n  originIssueId String?\n  checkRule String?')
write('packages/prisma/postgresql/schema.prisma',schema)
write('packages/prisma/index.ts',"export * from '@prisma/client'")
write('packages/prisma/client.ts',"""import { PrismaClient } from '@prisma/client'

import { env } from '@neo/env'

export class DatabaseClient {
  static create() {
    const url = new URL(env.DATABASE_URL)
    url.searchParams.set('connection_limit', String(env.DATABASE_POOL_SIZE))
    return new PrismaClient({ datasourceUrl: url.toString(), log: [] })
  }
}

export const prisma = DatabaseClient.create()
""")
write('packages/prisma/repositories/base/BaseRepository.ts',"""import type { Prisma } from '@prisma/client'

import { prisma } from '../../client'

export type TransactionClient = Prisma.TransactionClient

export abstract class BaseRepository {
  protected static getClient(transaction?: TransactionClient) {
    return transaction ?? prisma
  }

  static async lockTenant(tenantId: string, transaction: TransactionClient) {
    await transaction.$queryRaw`SELECT id FROM "Tenant" WHERE id = ${tenantId} FOR UPDATE`
  }

  static runInTransaction<T>(operation: (transaction: TransactionClient) => Promise<T>) {
    return prisma.$transaction(operation)
  }
}
""")
ops={'User':'findUnique','Session':'findUnique','Tenant':'upsert','Membership':'count findFirst findMany updateMany upsert','BuyerEnrollment':'findMany updateMany upsert','PolicyVersion':'findFirst upsert','OnboardingCase':'create findFirst findMany updateMany','Invitation':'create findFirst findUnique updateMany','CaseAccess':'findFirst findMany updateMany upsert','Submission':'create findFirst findMany updateMany','CompanyProfile':'create upsert','TaxProfile':'create upsert','BankProfile':'create upsert','Qualification':'createMany deleteMany','OwnershipEntity':'createMany deleteMany','OwnershipEdge':'count createMany deleteMany','Document':'count create findFirst findMany updateMany','Extraction':'create findFirst','CheckRun':'create findFirst','CheckEvidence':'createMany','Issue':'create createMany findFirst updateMany','Decision':'create findMany','Supplier':'create findFirst','WorkItem':'create findFirst findMany updateMany','OutboxEvent':'create findMany updateMany','Notification':'create findFirst updateMany','IdempotencyRecord':'create deleteMany findUnique','AuditEvent':'create findMany'}
barrel=["export { BaseRepository, type TransactionClient } from './base/BaseRepository'"]
for name, names in sorted(ops.items()):
 member=name[0].lower()+name[1:]
 methods=[]
 for op in sorted(names.split()):
  arg=f'Prisma.{name}{op[0].upper()+op[1:]}Args'
  methods.append(f"""  static {op}<T extends {arg}>(args: Prisma.SelectSubset<T, {arg}>, tx?: TransactionClient) {{
    return {name}Repository.getClient(tx).{member}.{op}(args)
  }}""")
 path=f'{member}/{name}Repository'
 write(f'packages/prisma/repositories/{path}.ts',"import type { Prisma } from '@prisma/client'\n\nimport { BaseRepository, type TransactionClient } from '../base/BaseRepository'\n\n"+f'export class {name}Repository extends BaseRepository {{\n'+'\n\n'.join(methods)+'\n}')
 barrel.append(f"export {{ {name}Repository }} from './{path}'")
write('packages/prisma/repositories/index.ts','\n'.join(barrel))
keys={'APP_URL':'z.url()','BETTER_AUTH_SECRET':'z.string().min(32)','BOOTSTRAP_ADMIN_EMAIL':'z.email()','DATABASE_POOL_SIZE':'z.coerce.number().int().positive()','DATABASE_URL':'z.url()','DEMO_SCREENING':'z.enum(RuntimeValues.BOOLEAN)','EMAIL_FROM':'z.email()','GCS_CLEAN_BUCKET':'z.string().min(1)','GCS_QUARANTINE_BUCKET':'z.string().min(1)','GOOGLE_CLIENT_ID':'z.string().min(1)','GOOGLE_CLIENT_SECRET':'z.string().min(1)','PII_KEY':'z.string().regex(RuntimeValues.HEX_KEY)','REDIS_URL':'z.url()','RESEND_API_KEY':'z.string().min(1)','SCREENING_TOKEN':'z.string().min(1)','SCREENING_URL':'z.url()'}
write('packages/env/env.ts',"""import { createEnv } from '@t3-oss/env-nextjs'
import { z } from 'zod'

class RuntimeValues {
  static readonly BOOLEAN = ['false', 'true'] as const
  static readonly HEX_KEY = /^[a-fA-F0-9]{64}$/
}

export const env = createEnv({
  experimental__runtimeEnv: {},
  server: {
"""+''.join(f'    {k}: {v},\n' for k,v in sorted(keys.items()))+"""  },
  skipValidation: process.env.NEXT_PHASE === 'phase-production-build',
})
""")
write('apps/builder/.env.schema','\n'.join(k+'=' for k in sorted(keys)))
