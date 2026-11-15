# GenAIStudio — Strict Coding Standards (claude.local.md)

---
alwaysApply: true
---

## 1. Error Handling — Try/Catch/Except

### 1.1 Single Statement in Try Block (STRICT)

Every `try` block MUST contain exactly **one** executable statement. If you need to guard multiple calls, use separate `try` blocks or extract into a helper that itself throws.

```python
# FORBIDDEN — multiple statements in try
try:
    user = await fetch_user(user_id)
    workspace = await fetch_workspace(workspace_id)
    result = await process(user, workspace)
except Exception:
    logger.error("something failed")

# CORRECT — one statement per try
try:
    user = await fetch_user(user_id)
except Exception:
    raise

try:
    workspace = await fetch_workspace(workspace_id)
except Exception:
    raise
```

```typescript
// FORBIDDEN — multiple statements in try
try {
  const user = await fetchUser(userId)
  const workspace = await fetchWorkspace(workspaceId)
  await process(user, workspace)
} catch (error) {
  console.log('failed')
}

// CORRECT — one statement per try, always re-raise
try {
  const user = await fetchUser(userId)
} catch (error) {
  throw error
}
```

### 1.2 Never Log Inside Catch — Always Re-raise with Full Stack Trace (STRICT)

Catch blocks MUST NOT contain logging. They MUST re-raise the original exception so the full stack trace propagates to the caller.

```python
# FORBIDDEN — logging in except, swallowing trace
try:
    result = await service.execute(payload)
except Exception as e:
    logger.error(f"Execution failed: {e}")
    return None

# CORRECT — re-raise preserving full stack trace
try:
    result = await service.execute(payload)
except Exception:
    raise
```

```typescript
// FORBIDDEN — logging in catch, swallowing trace
try {
  const result = await service.execute(payload)
} catch (error) {
  console.error('Execution failed:', error)
  return null
}

// CORRECT — re-throw preserving full stack trace
try {
  const result = await service.execute(payload)
} catch (error) {
  throw error
}
```

If you need to wrap with context, wrap and re-raise:

```python
try:
    result = await service.execute(payload)
except Exception as e:
    raise RuntimeError("service execution failed") from e
```

```typescript
try {
  const result = await service.execute(payload)
} catch (error) {
  throw new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: 'service execution failed',
    cause: error,
  })
}
```

---

## 2. Static Variables — Class Variables Only (STRICT)

All reusable string constants, numeric constants, and configuration keys MUST be defined as **static class variables** in UPPER_SNAKE_CASE. Reference them via the **class name**, never via `self`.

```python
# CORRECT — static class variables referenced by class name
class KnowledgeBaseManager(ServiceManager):
    _DEFAULT_CHUNK_SIZE = 512
    _DEFAULT_OVERLAP = 50
    _ERROR_KB_NOT_FOUND = "knowledge base not found"
    _KEY_PROVIDER_TYPE = "provider_type"

    def process(self, config: dict):
        chunk_size = config.get(
            KnowledgeBaseManager._KEY_PROVIDER_TYPE,
            KnowledgeBaseManager._DEFAULT_CHUNK_SIZE,
        )
        if not self._kb:
            raise ValueError(KnowledgeBaseManager._ERROR_KB_NOT_FOUND)

# FORBIDDEN — inline strings, self-referencing statics
class KnowledgeBaseManager(ServiceManager):
    def process(self, config: dict):
        chunk_size = config.get("provider_type", 512)  # magic string + magic number
        if not self._kb:
            raise ValueError("knowledge base not found")  # free-flow string (OK only in raise)
```

```typescript
// CORRECT — constants at module scope or as static class members
const DEFAULT_PAGE_SIZE = 20
const ERROR_CREDENTIAL_NOT_FOUND = 'credential not found'

class ChannelService {
  private static readonly MAX_RETRIES = 3

  process() {
    for (let i = 0; i < ChannelService.MAX_RETRIES; i++) { ... }
  }
}

// FORBIDDEN — magic numbers inline
class ChannelService {
  process() {
    for (let i = 0; i < 3; i++) { ... }  // magic number
  }
}
```

---

## 3. Environment Variable Access (STRICT — DO NOT VIOLATE)

### 3.1 Python Standard Services — Configuration Parser Pattern

Environment variables MUST be read **only** in `configuration_parser.py`. Service managers and business logic access configuration via `Main.configuration()`.

For **required** variables, use `os.environ["KEY"]` (fails fast with `KeyError`). NEVER use `os.environ.get()` with default values for required fields.

```python
# CORRECT — configuration_parser.py (see py/knowledge_base_service)
class KBConfigurationParser(RestConfigurationParser):
    def default_config_obj(self) -> dict:
        default_config_obj = super().default_config_obj()
        config_obj = {
            "source_bucket": os.environ["SOURCE_FILES_S3_BUCKET_NAME"],
            "source_region": os.environ["SOURCE_FILES_S3_BUCKET_REGION"],
        }
        return KBConfigurationParser.populate_config_obj(
            default_config_obj=default_config_obj, config_obj=config_obj
        )

# CORRECT — manager.py accesses via Main.configuration()
class KBManager(ServiceManager):
    def __init__(self):
        configuration = Main.configuration()
        self._source_bucket = configuration.source_bucket

# FORBIDDEN — direct os.environ in manager
class KBManager(ServiceManager):
    def process(self):
        bucket = os.environ.get("SOURCE_FILES_S3_BUCKET_NAME", "")
```

### 3.2 Python Agentic Flow Service — Config File Pattern

The agentic flow service uses `pydantic_settings.BaseSettings` in `config.py`. All env vars are defined there. Components use `get_config()`.

```python
# CORRECT — config.py (see py/agentic_flow_service/src/studio/config.py)
class AgenticFlowConfig(BaseSettings):
    aws_region: str
    channel_gateway_api_key: str
    # NO defaults for required fields

# CORRECT — usage in any module
from studio.config import get_config
config = get_config()
region = config.aws_region

# FORBIDDEN — direct os.environ anywhere outside config.py
region = os.environ.get("AWS_REGION", "ap-southeast-1")
```

### 3.3 TypeScript — env.ts Pattern

All environment variables MUST be defined in `packages/env/env.ts` using `@t3-oss/env-nextjs` with Zod schemas. Access them via the exported `env` object. NEVER use `process.env` directly outside `env.ts`.

```typescript
// CORRECT — packages/env/env.ts
import { createEnv } from '@t3-oss/env-nextjs'
import { z } from 'zod'

export const env = createEnv({
  server: {
    ENCRYPTION_SECRET: z.string().length(32),
    ANALYTICS_SERVICE_URL: z.string().url().optional(),
  },
})

// CORRECT — usage in any module
import { env } from '@typebot.io/env'
const secret = env.ENCRYPTION_SECRET

// FORBIDDEN — direct process.env
const secret = process.env.ENCRYPTION_SECRET
const url = process.env['ANALYTICS_SERVICE_URL'] ?? ''
```

### 3.4 No Default Values for Required Environment Variables (STRICT)

```python
# FORBIDDEN — silently defaults
bucket = os.environ.get("S3_BUCKET_NAME", "")
timeout = int(os.environ.get("TIMEOUT", "30"))

# CORRECT — fails immediately if missing
bucket = os.environ["S3_BUCKET_NAME"]
```

---

## 4. No Magic Numbers or Magic Strings (STRICT)

Every literal number or string used more than once, or representing a configurable/domain value, MUST be a named constant.

```python
# FORBIDDEN
if retry_count > 3:
    await asyncio.sleep(0.5)
    response = requests.get(url, timeout=30)

# CORRECT
class RetryPolicy:
    _MAX_RETRY_COUNT = 3
    _RETRY_DELAY_SECONDS = 0.5
    _REQUEST_TIMEOUT_SECONDS = 30

    def execute(self):
        if self._retry_count > RetryPolicy._MAX_RETRY_COUNT:
            await asyncio.sleep(RetryPolicy._RETRY_DELAY_SECONDS)
            response = requests.get(url, timeout=RetryPolicy._REQUEST_TIMEOUT_SECONDS)
```

```typescript
// FORBIDDEN
if (retries > 3) { ... }
const result = items.slice(0, 20)

// CORRECT
const MAX_RETRIES = 3
const DEFAULT_PAGE_SIZE = 20

if (retries > MAX_RETRIES) { ... }
const result = items.slice(0, DEFAULT_PAGE_SIZE)
```

---

## 5. Function and Member Ordering (STRICT)

### 5.1 All Functions, Methods, and Members MUST Be Alphabetically Sorted

Within a class, order as:
1. Static/class variables (UPPER_SNAKE_CASE, alphabetical)
2. `__init__` / constructor
3. Private methods (alphabetical)
4. Public methods (alphabetical)

```python
# CORRECT — alphabetical ordering
class AnalyticsManager(ServiceManager):
    _DEFAULT_LIMIT = 100
    _KEY_WORKSPACE_ID = "workspace_id"

    def __init__(self, clickhouse_client, db_config):
        self._clickhouse_client = clickhouse_client
        self._db_config = db_config

    def _build_query(self, params: dict) -> str: ...
    def _validate_date_range(self, start: str, end: str) -> None: ...

    def fetch_metrics(self, workspace_id: str) -> list: ...
    def list_dashboards(self, workspace_id: str) -> list: ...
```

### 5.2 Dictionary Keys — Alphabetical

```python
# CORRECT
config_obj = {
    "application_name": application_name,
    "clickhouse_host": os.environ["CLICKHOUSE_HOST"],
    "clickhouse_port": int(os.environ["CLICKHOUSE_PORT"]),
    "db_service_configuration": db_config,
}

# FORBIDDEN — unordered keys
config_obj = {
    "db_service_configuration": db_config,
    "application_name": application_name,
    "clickhouse_port": int(os.environ["CLICKHOUSE_PORT"]),
    "clickhouse_host": os.environ["CLICKHOUSE_HOST"],
}
```

### 5.3 Import Ordering

Imports MUST be grouped and sorted:
1. Standard library
2. Third-party
3. Internal project

Within each group, alphabetical. No wildcard imports. No lazy imports inside functions.

```python
# CORRECT
import os
from typing import Type

from fastapi import APIRouter
from pydantic import BaseModel

from studio.common.base import Main
from studio.common.service_management import ServiceManager
```

### 5.4 TypeScript — Router Keys, Object Keys, All Alphabetical

```typescript
// CORRECT — router keys sorted (see apps/builder/src/features/channels/api/router.ts)
export const channelsRouter = router({
  createChannel,
  createCredential,
  deleteChannel,
  deleteCredential,
  getExistingCredentials,
  getForm,
  listAvailableChannels,
  updateChannel,
  updateCredential,
})
```

---

## 6. No Free-Flowing Functions in TypeScript (STRICT)

Every function MUST be encapsulated — either as a method on a class, inside a module/namespace, or as an exported named constant from a feature module. No loose `function foo()` declarations scattered across files.

```typescript
// FORBIDDEN — free-floating function
function calculateTotal(items: Item[]): number {
  return items.reduce((sum, i) => sum + i.price, 0)
}

// CORRECT — exported from a module, or as a class static
export const calculateTotal = (items: Item[]): number =>
  items.reduce((sum, i) => sum + i.price, 0)

// CORRECT — in a class
class PricingService {
  static calculateTotal(items: Item[]): number {
    return items.reduce((sum, i) => sum + i.price, 0)
  }
}
```

tRPC procedures are the established exception — they export `protectedProcedure()` chains as named constants (see `apps/builder/src/features/channels/api/createCredential.ts`).

---

## 7. Everything Sorted (STRICT)

This applies universally:
- Import statements
- Class members and methods
- Function parameters (where semantically appropriate)
- Object/dictionary keys
- Enum values
- Zod schema fields
- tRPC router keys
- Constructor assignments (`self._alpha` before `self._beta`)
- Local variable declarations

---

## 8. JSON Keys Must Not Be NULL (STRICT)

API responses and serialized JSON MUST NOT contain keys with `null` values. Omit the key entirely or use a sentinel/default.

```typescript
// FORBIDDEN — null keys in response
return {
  agentId: null,
  channelType: 'whatsapp',
  credentialId: null,
}

// CORRECT — omit null keys
return {
  channelType: 'whatsapp',
}

// If the schema requires the key, use a meaningful default or mark optional
const outputSchema = z.object({
  channelType: z.string(),
  credentialId: z.string().optional(),
})
```

---

## 9. All APIs Must Have OpenAPI Spec (STRICT)

### 9.1 TypeScript tRPC — Use `.meta({ openapi })` on Every Procedure

Every tRPC procedure MUST include `.meta({ openapi: { ... } })` with method, path, summary, and tags. Full procedure kinds, middleware, and copy-paste templates: [TRPC.md](TRPC.md), [architecture.md](architecture.md), [procedure-template.md](procedure-template.md).

```typescript
// CORRECT (see apps/builder/src/features/channels/api/createCredential.ts)
export const createCredential = protectedProcedure(requiredPermissions)
  .meta({
    openapi: {
      method: 'POST',
      path: '/v1/channels/credentials',
      protect: true,
      summary: 'Create channel credential',
      tags: ['Channels', 'Credentials'],
    },
  })
  .input(inputSchema)
  .output(outputSchema)
  .mutation(async ({ input, ctx }) => { ... })

// FORBIDDEN — missing openapi meta
export const createCredential = protectedProcedure(requiredPermissions)
  .input(inputSchema)
  .mutation(async ({ input }) => { ... })
```

### 9.2 Python FastAPI — Endpoints Are Already OpenAPI

FastAPI auto-generates OpenAPI. Ensure every endpoint has `summary`, `tags`, and typed request/response models.

---

## 10. Dockerfile — No Root User (STRICT)

Every Dockerfile MUST create a non-root user and switch to it before `CMD`/`ENTRYPOINT`.

```dockerfile
# CORRECT — Python service pattern (see infra/docker/analytics_service/Dockerfile)
RUN groupadd --gid 1001 appuser \
    && useradd --uid 1001 --gid 1001 --create-home --shell /bin/bash appuser
COPY --from=builder --chown=appuser:appuser /app/py/service/.venv /app/py/service/.venv
USER appuser
CMD ["service-name"]

# CORRECT — Node.js service pattern (see Dockerfile root)
COPY --from=builder --chown=node:node /app/apps/${SCOPE}/.next/standalone ./
USER node
ENTRYPOINT ["./entrypoint.sh"]

# FORBIDDEN — running as root
COPY --from=builder /app .
CMD ["python", "-m", "studio.service"]
```

---

## 11. No `hasattr`, `getattr`, or Redundant Defensive Patterns (STRICT)

### 11.1 Python — No `hasattr`/`getattr` for Known Attributes

If a class or model defines an attribute, access it directly. `hasattr`/`getattr` with defaults hide bugs and indicate weak typing.

```python
# FORBIDDEN
if hasattr(config, 'encryption_secret'):
    secret = config.encryption_secret
secret = getattr(config, 'encryption_secret', '')

# CORRECT — direct access, model guarantees the field exists
secret = config.encryption_secret
```

### 11.2 TypeScript — No Loose Optional Chaining on Known Types

```typescript
// FORBIDDEN — defensive chaining on a type that guarantees the field
const name = user?.name ?? ''

// CORRECT — if the type says it exists, access it
const name = user.name
```

---

## 12. Strong Modeling — No `Optional`/`None` Defaults in Pydantic or Zod (STRICT)

### 12.1 Pydantic Models — No Defaults, No Optional Unless Truly Nullable

Fields in `model.py` MUST declare only the type. No `= None`, no `Optional[str] = None`, no default values. Defaults belong in `configuration_parser.py`.

```python
# FORBIDDEN — defaults and Optional in model.py
class ServiceConfiguration(BaseModel):
    aws_region: str = "ap-southeast-1"
    opensearch_url: Optional[str] = None
    max_retries: int = 5

# CORRECT — model.py: strict types only
class ServiceConfiguration(BaseModel):
    aws_region: str
    max_retries: int
    opensearch_url: str

# Defaults go in configuration_parser.py
class ServiceConfigurationParser(RestConfigurationParser):
    _DEFAULT_AWS_REGION = "ap-southeast-1"
    _DEFAULT_MAX_RETRIES = 5
```

If a field is genuinely optional at the domain level (e.g., a field that the user may or may not provide), add a small comment explaining why:

```python
class UserProfile(BaseModel):
    email: str
    name: str
    phone: str  # optional in domain — user may skip; comment required if loosening
```

### 12.2 Zod Schemas — No `.optional()` or `.default()` Without Justification

```typescript
// FORBIDDEN — loose modeling
const inputSchema = z.object({
  agentId: z.string().optional(),
  channelType: z.string().optional().default(''),
  name: z.string().nullable(),
})

// CORRECT — strict modeling
const inputSchema = z.object({
  agentId: z.string().min(1),
  channelType: z.string().min(1),
  name: z.string().min(1),
})
```

Enum values in Zod schemas MUST use named constants, not inline strings:

```typescript
// CORRECT (see apps/builder/src/features/channels/common/schemas.ts)
const AUTH_TYPE_API_KEY = 'api_key'
const AUTH_TYPE_OAUTH = 'oauth'
const AUTH_TYPE_PUBLIC = 'public'

export const authTypeSchema = z.enum([
  AUTH_TYPE_API_KEY,
  AUTH_TYPE_OAUTH,
  AUTH_TYPE_PUBLIC,
])

// FORBIDDEN — inline string literals
export const authTypeSchema = z.enum(['api_key', 'oauth', 'public'])
```

---

## 13. Deprecated Code — Delete, Never Keep (STRICT)

When refactoring, **remove** the old code entirely. Do NOT mark it `@deprecated`, do NOT comment it out, do NOT keep a `// TODO: remove` next to it. Dead code is deleted immediately.

```python
# FORBIDDEN — keeping deprecated code
# @deprecated — use new_fetch_user instead
def fetch_user(user_id: str): ...

def new_fetch_user(user_id: str): ...

# CORRECT — old function is deleted, new one takes its name
def fetch_user(user_id: str): ...
```

```typescript
// FORBIDDEN
/** @deprecated use fetchUserV2 */
export const fetchUser = () => { ... }
export const fetchUserV2 = () => { ... }

// CORRECT — just replace
export const fetchUser = () => { ... }
```

---

## 14. Database Migrations — Generate via Make, Never Write by Hand (STRICT)

Prisma migration files MUST be generated using the Makefile command in `packages/prisma/`. NEVER write migration SQL by hand unless seeding data. Package layout, Makefile targets, and generator scripts: [prisma-package.md](prisma-package.md).

```bash
# CORRECT — generate migration
cd packages/prisma
make prisma-generate-migrations NAME='add_channel_credential_resource_type'

# Then apply
make prisma-apply-migrations

# FORBIDDEN — manually creating migration.sql files
mkdir -p packages/prisma/postgresql/migrations/20260428_my_migration/
echo "ALTER TABLE ..." > migration.sql
```

The only exception is **seed data** scripts which may be hand-written SQL.

---

## 15. No Unnecessary Comments or Docstrings (STRICT)

### 15.1 Comments Are Prohibited Unless Critical

Do NOT add comments that narrate code behavior. Comments are allowed ONLY for critical, non-obvious information.

```python
# FORBIDDEN
# Loop through users
for user in users:
    # Check if user is active
    if user.is_active:
        # Process the user
        process(user)

# CORRECT — no comments needed, code is self-documenting
for user in users:
    if user.is_active:
        process(user)
```

### 15.2 Docstrings — Single Line Only, Capital Letter Start

```python
# CORRECT
def fetch_user(user_id: str) -> User:
    """Fetches user by ID from the database"""
    ...

# FORBIDDEN — multi-line docstring
def fetch_user(user_id: str) -> User:
    """
    Fetches a user from the database.
    
    Args:
        user_id: The user ID to look up.
    
    Returns:
        The User object.
    """
    ...
```

---

## 16. Service Naming Conventions

### 16.1 Python Service Names

Services follow `snake_case` naming with a suffix indicating their type:

| Suffix | Purpose | Example |
|--------|---------|---------|
| `_service` | Long-running REST/gRPC service | `analytics_service`, `knowledge_base_service`, `voice_backend_service` |
| `_job` | One-shot EKS batch job | `data_ingestion_job`, `mcp_deployment_job`, `event_processor_job` |
| `_lib` | Shared library (no entry point) | `channels_lib`, `llm_lib`, `guardrails_lib`, `memory_store_lib` |
| `_mcp_service` | MCP tool service | `s3_mcp_service`, `kb_retrieval_mcp_service`, `chart_mcp_service` |
| `_scheduling_service` | Cron/scheduling service | `voice_scheduling_service`, `channels_scheduling_service` |

### 16.2 Directory Structure (Standard Service)

Full repo tree, language roots, infra, and Makefile rules: [SCAFFOLDING.md](SCAFFOLDING.md). In this repository the import namespace is `applied_ai` (not `studio`).

```
py/<service_name>/
├── src/applied_ai/<service_name>/
│   ├── __init__.py
│   ├── __main__.py              # ApplicationRunner.run(<Module>)
│   ├── configuration_parser.py  # Env vars → typed config
│   ├── controller.py            # FastAPI endpoints (REST)
│   ├── manager.py               # Business logic (extends ServiceManager)
│   ├── components.py            # Collaborators used by the manager
│   ├── model.py                 # ALL enums + pydantic models
│   └── module.py                # DI wiring (extends RestApplicationModule)
├── tests/
├── etc/.env.schema
├── pyproject.toml
├── uv.lock
└── Makefile
```

Python components stay in that package's `components.py` (or `components/`). Shared collaborators go in a `_lib`. Never a repo-root `components/` directory.

### 16.3 TypeScript Feature Structure

This repo puts Next.js under `apps/` and shared libraries under `packages/`, not `ts/`. Feature UI components stay inside the feature. tRPC layout and templates: [TRPC.md](TRPC.md).

```
apps/builder/src/features/<feature>/
├── api/
│   ├── router.ts                # tRPC router (keys alphabetical)
│   ├── createFoo.ts             # Individual procedures
│   ├── deleteFoo.ts
│   └── listFoo.ts
├── common/
│   ├── helpers.ts               # Shared utilities
│   └── schemas.ts               # Zod schemas + constants
├── helpers/                     # PascalCase utility classes, static methods
├── components/
│   └── FooPanel.tsx             # React components for this feature
└── hooks/
    └── useFoo.ts                # React hooks
```

Mount new feature routers on `apps/builder/src/helpers/server/routers/publicRouter.ts`. Studio handler: `pages/api/trpc/[trpc].ts`. OpenAPI handler: `pages/api/[...trpc].ts`.

### 16.4 Repository Pattern (TypeScript)

Repositories extend `BaseRepository`, use static methods only, and accept optional `TransactionClient`.

```typescript
// CORRECT (see packages/prisma/repositories/credentials/ChannelCredentialRepository.ts)
export class ChannelCredentialRepository extends BaseRepository {
  private constructor() { super() }

  static findById(id: string, tx?: TransactionClient) {
    return this.getClient(tx).channelCredential.findUnique({ where: { id } })
  }

  static listByWorkspace(workspaceId: string, tx?: TransactionClient) {
    return this.getClient(tx).channelCredential.findMany({
      where: { workspaceId, isDeleted: false },
      orderBy: { createdAt: 'desc' },
    })
  }
}
```

### 16.5 ORM Pattern (Python) — SQLAlchemy via `Main.orm_manager()`

Python services access the database through the `OrmManager` singleton, obtained via `Main.orm_manager()`. All DB operations use async sessions obtained from `with_session()`.

**Architecture:**

```
Main.orm_manager()  →  OrmManagerClient  →  OrmManager  →  SqlAlchemyDatabaseService
                                                              ↕
                                                         AsyncSession (SQLModel)
```

**Key components:**

| Component | Location | Role |
|-----------|----------|------|
| `OrmManagerClient` | `py/common/src/studio/common/orm.py` | Generic DI wrapper, returned by `Main.orm_manager()` |
| `OrmManager` | `py/orm/src/studio/orm/manager.py` | Facade extending `ServiceManager`, delegates to `SqlAlchemyDatabaseService` |
| `SqlAlchemyDatabaseService` | `py/orm/src/studio/orm/sql_alchemy/manager.py` | Actual DB operations — all CRUD methods live here |
| SQLAlchemy models | `py/orm/src/studio/orm/sql_alchemy/models/` | Table models (`public_schema_models.py`, `common_schema_models.py`, `voice_schema_models.py`) |
| Pydantic response models | `py/orm/src/studio/orm/model.py` | DTOs for ORM method return types |

**Correct access pattern in services:**

```python
# module.py — wire up ORM in initialize_orm_manager
class MyApplicationModule(RestApplicationModule):
    def initialize_orm_manager(self, *args, **kwargs):
        return OrmManagerClient(
            orm_type=self.configuration().orm_type,
            db_url=self.configuration().db_service_configuration.database_url,
            orm_manager_class=OrmManager,
        )

# manager.py — obtain ORM via Main, use with_session for DB access
class MyManager(ServiceManager):
    def __init__(self):
        self._orm_manager = Main.orm_manager()

    async def get_user(self, user_id: str):
        async with self._orm_manager.with_session() as session:
            return await self._orm_manager.get_user_by_id(db=session, user_id=user_id)
```

**FORBIDDEN patterns:**

```python
# FORBIDDEN — creating engine/session directly
from sqlalchemy.ext.asyncio import create_async_engine
engine = create_async_engine(os.environ["DATABASE_URL"])

# FORBIDDEN — importing SqlAlchemyDatabaseService directly in a service
from studio.orm.sql_alchemy.manager import SqlAlchemyDatabaseService
db = SqlAlchemyDatabaseService(db_settings=settings)

# FORBIDDEN — raw SQL outside OrmManager
async with session.begin():
    await session.execute(text("SELECT * FROM users WHERE id = :id"), {"id": user_id})
```

**Rules:**
1. Always obtain ORM via `Main.orm_manager()` — never instantiate directly
2. Always use `async with self._orm_manager.with_session() as session:` for DB access
3. All DB query methods live in `SqlAlchemyDatabaseService` — add new methods there, never write raw queries in services
4. SQLAlchemy table models go in `py/orm/src/studio/orm/sql_alchemy/models/`
5. Response/DTO models go in `py/orm/src/studio/orm/model.py`

---

## 17. Python Service File Rules (STRICT)

### 17.1 All Enums and Pydantic Models in `model.py` Only

Do NOT create `enums.py`, `types.py`, or `schemas.py` in Python services. Everything goes in `model.py`.

### 17.2 Entry Point Pattern

Copy-paste templates for REST services, jobs, Lambda/event services, RestClient, and logger_lib: [PYTHON_TEMPLATES.md](PYTHON_TEMPLATES.md).

```python
# __main__.py — always this exact pattern
from applied_ai.common.application_runner import ApplicationRunner
from applied_ai.<service_name>.module import <ServiceName>ApplicationModule

def main():
    ApplicationRunner.run(<ServiceName>ApplicationModule, use_internal_event_loop=True)
```

### 17.3 Module Pattern — DI Wiring

```python
# module.py (see py/analytics_service/src/studio/analytics_service/module.py)
class AnalyticsApplicationModule(RestApplicationModule):
    DESCRIPTION = "analytics service"

    def initialize_configuration_parser(self, *args, **kwargs):
        return ConfigurationParser()

    def initialize_orm_manager(self, *args, **kwargs):
        return OrmManagerClient(
            orm_type=self.configuration().orm_type,
            db_url=self.configuration().db_service_configuration.database_url,
            orm_manager_class=OrmManager,
        )

    async def initialize_service_managers(self):
        await super().initialize_service_managers()
        configuration = Main.configuration()
        manager = AnalyticsManager(configuration=configuration)
        Main.add_service_manager(manager)

    def initialize_controllers(self, application):
        super().initialize_controllers(application)
        manager = cast(AnalyticsManager, Main.service_manager(AnalyticsManager.__name__))
        controller = AnalyticsRestController(manager)
        controller.prepare(application)
```

---

## 18. Free-Flow String Rules

Free-flow strings (inline literals) are FORBIDDEN except:
1. Exception messages inside `raise` or `except` blocks
2. Error strings in `ValueError`, `RuntimeError`, `TRPCError`

Error messages MUST start with a **lowercase letter** and be short and actionable.

```python
# ALLOWED — error messages in raise
raise ValueError("invalid configuration for storage driver")
raise RuntimeError("channel credential not found")

# FORBIDDEN — inline strings in business logic
status = "active"
channel_type = data.get("channelType")

# CORRECT
_STATUS_ACTIVE = "active"
_KEY_CHANNEL_TYPE = "channelType"
status = MyClass._STATUS_ACTIVE
channel_type = data.get(MyClass._KEY_CHANNEL_TYPE)
```

---

## 19. No Free-Flow Numbers

Numeric literals MUST be defined as static class variables.

```python
# FORBIDDEN
timeout = int(os.environ.get("TIMEOUT", "30"))
if len(results) > 100:

# CORRECT
_DEFAULT_TIMEOUT = 30
_MAX_RESULTS = 100
timeout = int(os.environ.get(cls._ENV_KEY_TIMEOUT, cls._DEFAULT_TIMEOUT))
if len(results) > cls._MAX_RESULTS:
```

---

## 20. Spacing and Formatting

### 20.1 Python
- One blank line between imports and first class/function
- No blank line between definition and docstring
- No blank line after docstring before code
- One blank line between methods within a class

### 20.2 TypeScript (Prettier enforced)
- 2-space indent, single quotes, no semicolons, trailing commas (es5)
- Sort imports: Node core → third-party → project internal

---

## 21. Logging (STRICT)

### 21.1 Python — Always `Main.logger()` in services and jobs

`Main.initialize` constructs `ApplicationLogger` from `logger_lib`. The logger MUST be obtained from `Main.logger()`. NEVER use `print()`, `logging.getLogger()`, or instantiate `ApplicationLogger` in a service or job. Standalone/training code uses `LoggerManager` — see [PYTHON_TEMPLATES.md](PYTHON_TEMPLATES.md).

```python
# CORRECT — logger from Main
from applied_ai.common.base import Main

class KBManager(ServiceManager):
    def process(self, workspace_id: str):
        Main.logger().debug("processing workspace %s", workspace_id)

# FORBIDDEN — print, or a logger that is not Main.logger()
import logging
logger = logging.getLogger(__name__)

class KBManager(ServiceManager):
    def process(self, workspace_id: str):
        print(f"processing {workspace_id}")
        logger.info("processing %s", workspace_id)
```

### 21.2 TypeScript — No `console.log` Anywhere

NEVER use `console.log`, `console.info`, `console.warn`, or `console.error` in production code. Use the project's structured logging utilities if available, or throw errors (which propagate to the framework's error handler).

```typescript
// FORBIDDEN
console.log('credential created:', credentialId)
console.error('failed to fetch:', error)

// CORRECT — errors propagate via throw, no manual logging
throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'credential creation failed' })
```

### 21.3 NEVER Log Inside Catch Blocks

See Rule 1.2. Catch blocks re-raise, they do not log.

---

## 22. Shared Libraries — Use Existing, Never Reinvent (STRICT)

The monorepo provides a comprehensive set of shared libraries under `py/`. ALWAYS use these existing libraries. NEVER import raw modules (e.g., `json`, `boto3`, `cryptography`) directly in service code when a library wrapper exists. NEVER duplicate utility logic that already lives in a shared lib.

### 22.1 Core Foundation Libraries

In this repository the packages are `py/common_lib` and `py/logger_lib` (`applied_ai.common`, `applied_ai.logger_lib`). REST framework packages are `py/rest_lib` and `py/rest_client_lib` when present — templates in [PYTHON_TEMPLATES.md](PYTHON_TEMPLATES.md). Do not import raw `httpx`/`requests` when a RestClient exists or should exist.

| Library | Package | Purpose | Key Exports |
|---------|---------|---------|-------------|
| `py/common_lib/` | `applied-ai-common` | `Main`, runner, module, server, `ServiceManager`, configuration, Lambda runner | `Main`, `ServiceManager`, `ConfigurationParser`, `ApplicationModule`, `BaseModel` |
| `py/logger_lib/` | `applied-ai-logger-lib` | Application + MLflow loggers, PII redaction | `ApplicationLogger`, `LoggerManager`, `MlflowLogger` |
| `py/rest_lib/` | `applied-ai-rest` | FastAPI REST server (add if missing; do not copy FastAPI bootstrap into a service) | `RestServer`, `RestController`, `RestConfigurationParser`, `RestApplicationModule` |
| `py/rest_client_lib/` | `applied-ai-rest-client` | Async HTTP client with retry | `RestClient` (`get`, `post`, `put`, `patch`, `delete`, `post_multipart`) |
| `py/orm/` | `studio-orm` | SQLAlchemy/SQLModel async ORM for PostgreSQL (Studio); use only if this repo adds ORM | `OrmManager`, `OrmManagerClient`, `SqlAlchemyDatabaseService` |

### 22.2 AWS & Infrastructure Libraries

| Library | Package | Purpose | Key Exports |
|---------|---------|---------|-------------|
| `py/s3_lib/` | `studio-s3-lib` | S3 operations: upload/download/delete, pre-signed URLs, JSON read/write | `S3ServiceManager`, `S3Configuration` |
| `py/aws_events_lib/` | `studio-events-lib` | AWS EventBridge event publishing | `EventsServiceManager`, `EventType`, `EventConfiguration` |
| `py/queues_lib/` | `studio-queues-lib` | Message queue abstraction (SQS) — send/receive/delete | `QueueServiceManager`, `SQSQueueServiceManager`, `QueueType` |
| `py/mcp_deployment_lib/` | `studio-mcp-deployment-lib` | MCP server deployment (AgentCore + EKS) | `DeploymentServiceManager`, `DeploymentPlatform`, `DeploymentStatus` |

### 22.3 AI/ML Libraries

| Library | Package | Purpose | Key Exports |
|---------|---------|---------|-------------|
| `py/llm_lib/` | `studio-llm-lib` | Multi-provider LLM abstraction (OpenAI, Bedrock, Azure, LiteLLM) | `LLMServiceManager`, `LLMServiceType`, `LLMConfiguration` |
| `py/guardrails_lib/` | `studio-guardrails-lib` | Multi-provider guardrail execution for input/output safety | `GuardrailsServiceManager`, `GuardrailsProvider` |
| `py/memory_store_lib/` | `studio-memory-lib` | STM + LTM memory storage with AgentCore and PostgreSQL backends | `MemoryServiceManager`, `AgentCoreMemory`, `PostgresMemory` |
| `py/opensearch_lib/` | `studio-opensearch-lib` | OpenSearch vector DB for knowledge base indexing and retrieval | `OpensearchServiceManager`, `LangchainVectorDBManager` |
| `py/vector_store_lib/` | `studio-vector-store-lib` | Unified vector store facade (OpenSearch, Neptune, S3 Vectors) | `VectorStoreServiceManager`, `VectorStoreBackendType` |

### 22.4 Knowledge Base Pipeline Libraries

| Library | Package | Purpose | Key Exports |
|---------|---------|---------|-------------|
| `py/document_parser_lib/` | `studio-document-parser-lib` | Multi-strategy doc parsing (Unstructured, LLM, Textract) | `DocumentParserServiceManager`, `ParsingStrategy` |
| `py/kb_metadata_lib/` | `studio-kb-metadata-lib` | Knowledge base metadata generation | `KnowledgeBaseMetadataManager` |
| `py/markdown_data_lib/` | `studio-markdown-data-lib` | Versioned markdown files on S3 | `MarkdownDataServiceManager` |
| `py/markdown_generator_lib/` | `studio-markdown-generator-lib` | Document-to-Markdown conversion | `MarkdownGeneratorServiceManager` |
| `py/source_data_lib/` | `studio-source-data-lib` | Source file management on S3 | `SourceDataServiceManager`, `SourceType` |
| `py/destination_data_lib/` | `studio-destination-data-lib` | Destination data management (OpenSearch index) | `DestinationDataServiceManager`, `DestinationType` |

### 22.5 Channel & Messaging Libraries

| Library | Package | Purpose | Key Exports |
|---------|---------|---------|-------------|
| `py/channels_lib/` | `studio-channels-lib` | Channel integration registry and processor framework | `ChannelsServiceManager`, `BaseChannelProcessor`, `channel_registry` |
| `py/agent_to_channel_lib/` | `studio-agent-to-channel-lib` | Routes agent output to channels (Outlook, Teams, etc.) | `AgentToChannelServiceManager`, `SendContext`, `SendResult` |
| `py/channel_to_agent_lib/` | `studio-channel-to-agent-lib` | Routes inbound channel events to agents | `ChannelToAgentServiceManager`, `AgentPayload`, `TriggerStatus` |
| `py/channel_event_trigger_lib/` | `studio-channel-event-trigger-lib` | Webhook auth + event persistence | `ChannelEventTriggerManager`, `WebhookPayload` |
| `py/collaborations_lib/` | `studio-collaborations-lib` | Outlook email/calendar integrations | `CollaborationsManager`, `OutlookService` |
| `py/ms_graph_files_lib/` | `studio-ms-graph-files-lib` | Microsoft Graph file operations | `MsGraphFilesManager` |
| `py/ms_graph_outlook_lib/` | `studio-ms-graph-outlook-lib` | Microsoft Graph Outlook SDK wrapper | `MsGraphOutlookManager` |

### 22.6 Observability

| Library | Package | Purpose | Key Exports |
|---------|---------|---------|-------------|
| `py/studiotelemetry/` | `studiotelemetry-sdk` | OpenTelemetry SDK with auto-instrumentation for 20+ AI/LLM providers | `studiotelemetry-sdk` + `opentelemetry-instrumentation-*` |
| `py/kpi_generation_lib/` | `studio-kpi-generation-lib` | KPI generation for agent analytics | `KPIGenerationType`, `KPIGenerationStatus` |

### 22.7 Critical Utility Classes in `py/common/` — USE THESE, NEVER REWRITE

| Utility | File | Purpose | FORBIDDEN Alternative |
|---------|------|---------|----------------------|
| `JsonUtilities` | `json_utilities.py` | `json_string_to_dict()`, `dict_to_json_string()`, `base64_to_dict()` | `import json; json.loads()` directly |
| `AESEncryptor` / `EncryptionUtilities` | `encryption_utilities.py` | AES-128-CBC encryption with PKCS5 padding | `from cryptography import ...` directly |
| `AWSUtilities` | `aws_utilities.py` | Factory for `bedrock-runtime`, `s3`, `neptune-graph`, `s3vectors` clients | `import boto3; boto3.client('s3')` directly |
| `AWSClientFactory` | `aws_client_factory.py` | Centralized `kms` and `s3` client creation with region from env | Raw `boto3.client()` |
| `AWSSecretsManagerUtilities` | `aws_secretmanager_utilities.py` | Secret fetching with `[[path]]` template resolution | `boto3.client('secretsmanager')` directly |
| `AWSIAMUtilities` | `aws_iam_utilities.py` | IAM role lifecycle: create, ensure, delete with policies | Raw IAM boto3 calls |
| `SecretResolverUtilities` | `secret_resolver_utilities.py` | Unified resolver for AWS Secrets Manager + HashiCorp Vault | Manual per-provider resolution |
| `RedisUtilities` | `redis_utilities.py` | `build_redis_uri()` from env vars | Manual Redis URL construction |
| `DatabaseUtilities` | `database_utilities.py` | `build_database_uri()` from env vars | Manual PostgreSQL URL construction |
| `AuthenticationUtilities` | `authentication_utilities.py` | Multi-strategy auth (API key, basic, bearer, HMAC, public) | Custom auth in services |
| `ValidationUtilities` | `validation_utilities.py` | Shared validation helpers | Inline validation logic |
| `PaginationUtilities` | `pagination_utilities.py` | Pagination helpers | Manual offset/limit calculations |
| `DatetimeUtilities` | `datetime_utilities.py` | Date/time formatting and conversion | Raw `datetime` manipulation |
| `CsvUtilities` | `csv_utilities.py` | CSV read/write helpers | `import csv` directly |
| `FilesystemUtilities` | `filesystem_utilities.py` | File system operations | Raw `os.path` / `pathlib` |

```python
# FORBIDDEN — using raw json module when JsonUtilities exists
import json
data = json.loads(raw_string)
output = json.dumps(my_dict)

# CORRECT — use the shared utility
from studio.common.json_utilities import JsonUtilities
data = JsonUtilities.json_string_to_dict(raw_string)
output = JsonUtilities.dict_to_json_string(my_dict)

# FORBIDDEN — raw boto3 when AWSUtilities exists
import boto3
s3_client = boto3.client("s3", region_name="us-east-1")

# CORRECT — use the factory
from studio.common.aws_utilities import AWSUtilities
s3_client = AWSUtilities.create_s3_client(region_name="us-east-1")

# FORBIDDEN — raw encryption when EncryptionUtilities exists
from cryptography.hazmat.primitives.ciphers import Cipher
# ... 20 lines of AES setup ...

# CORRECT
from studio.common.encryption_utilities import EncryptionUtilities
encrypted = EncryptionUtilities.encrypt(plaintext)
```

### 22.8 Shared Enums in `py/common/src/studio/common/model.py`

This file contains 50+ domain enums and base models. ALWAYS import from here. NEVER re-define these in service-specific `model.py` files.

| Category | Key Enums |
|----------|-----------|
| Agents | `AgentType`, `AgentStatus`, `AgentAction` |
| Channels | `ChannelType`, `ChannelEventStatus`, `TraceChannelType` |
| Knowledge Base | `KBProviderType`, `VectorStorageType`, `DataSourceType`, `DocumentStatus`, `InHouseKnowledgeBaseOverallStatus` |
| Permissions | `ResourcePermissionAction`, `SharedRoleType` |
| Infrastructure | `EKSJobNames`, `EksJobStatus`, `ImagePullPolicy`, `ConcurrencyPolicy`, `RestartPolicy` |
| MCP | `MCPServerOverallStatus`, `MCPType`, `McpConnectionStatus` |
| Scheduling | `ScheduleStatus`, `TriggerSource`, `RuntimeMode` |
| Status | `Status`, `StatusCode`, `StatusCodeMessage`, `ExecutionStatus` |
| Retry | `RetryStrategy`, `Boto3RetryMode`, `ResilientConfig` |

```python
# FORBIDDEN — re-defining AgentType in a service model.py
class AgentType(str, Enum):
    CHATBOT = "chatbot"
    VOICE = "voice"

# CORRECT — import from common
from studio.common.model import AgentType
```

---

## 23. Type Safety

- Python: `from __future__ import annotations` in every file. Run `mypy --strict`
- TypeScript: `"strict": true`, `"noImplicitAny": true`. Avoid `any`; use generics or discriminated unions
- No `# type: ignore` or `// @ts-ignore` without a comment explaining why

---

## 24. Async/Await

- All I/O operations MUST be async
- Never mix sync and async in the same call chain
- Use `await` for every async call; never fire-and-forget

---

## 25. Testing

- Python: `pytest` + `moto` for AWS mocks, `respx` for HTTP mocks
- TypeScript: Playwright for E2E, Jest for unit
- Target ≥80% branch coverage
- Test files go in `tests/` directory
- Use markers: `@pytest.mark.unit`, `@pytest.mark.slow`

---

## 26. Security

- No secrets in code — use IAM roles, Parameter Store, or Secrets Manager
- Tag all AWS resources
- Dockerfile: non-root user always
- Never build SQL via string concatenation — use parameterized queries
- New dependencies must be vulnerability-checked

---

## 27. Repository Scaffolding (STRICT)

Follow [SCAFFOLDING.md](SCAFFOLDING.md). Summary:

- Language roots: `py/` (uv packages), `apps/` (Next.js), `packages/` (shared TS). No mixed-language package. No service at repo root.
- Python package names use a role suffix: `_service`, `_job`, `_lib`, `_pipeline`, `_tests`.
- `docs/` is architecture and runbooks. `etc/` is non-secret config (repo-wide at `etc/`, per-package at `<package>/etc/`).
- Dockerfiles, Helm charts, and Terraform live only under `infra/docker/`, `infra/helm/`, `infra/terraform/`. Compose is `infra/docker-compose.dev.yaml`. Never at repo root.
- Image build and push live in `infra/docker/Makefile` (`build-*`, `push-*`, `ecr-login`). Root Makefile delegates.
- **Makefile constants at the top only.** Every `:=` / `?=` / `=` assignment is above the first target. No new variables in the middle of the file.
- Root Makefile orchestrates: `help`, `hooks`/`check`, `install`/`test`/`clean`, `setup-dev`/`destroy-dev`, `build-*`/`push-*`, `tf-*`, `*-deploy`. Package Makefiles only `install`, `test`, `test-coverage`, `update-lock`, `clean`.
