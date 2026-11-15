# Python service, job, REST, and logging templates

Copy these shapes. Do not invent a second bootstrap. Import namespace is `applied_ai`. Folder layout is in [SCAFFOLDING.md](SCAFFOLDING.md). Coding rules are in [STANDARDS.md](STANDARDS.md).

Shared packages:

| Package | Import | Use it for |
|---------|--------|------------|
| `py/common_lib` | `applied_ai.common` | `Main`, `ApplicationRunner`, `ApplicationModule`, `ApplicationServer`, `ServiceManager`, `ConfigurationParser` |
| `py/logger_lib` | `applied_ai.logger_lib` | `ApplicationLogger` (via `Main.logger()`), `LoggerManager`, `MlflowLogger` |
| `py/rest_lib` | `applied_ai.rest` | FastAPI `RestServer`, `RestController`, `RestApplicationModule` — add this lib if missing; do not copy FastAPI bootstrap into a service |
| `py/rest_client_lib` | `applied_ai.rest_client` | Async `RestClient` — add this lib if missing; do not call `httpx`/`requests` from a manager |

Every deployable package depends on `applied-ai-common` (and therefore `applied-ai-logger-lib`). Env vars are read only in `configuration_parser.py`.

---

## Bootstrapping (every service and job)

```
ApplicationRunner.run(Module)
    → Main.initialize(Module)
        → ConfigurationParser.configuration()
        → ApplicationLogger from logger_configuration
        → Module.initialize_service_managers()  # Main.add_service_manager(...)
        → prepare / start managers
    → Module.serve() / serve_sync()             # Server talks to the manager
    → Main.finalize()                           # stop / destroy
```

Required env (from `ConfigurationParser.default_config_obj`): `APPLICATION_NAME`, `RUNTIME_MODE`, `LOG_LEVEL`. Optional: `PE_PASSPHRASE`.

`RUNTIME_MODE` is `api` | `polling` | `job` (`applied_ai.common.model.RuntimeMode`).

---

## REST service (`_service`)

Long-running HTTP API. Use `RestApplicationModule`, not a hand-rolled FastAPI app.

```
py/<name>_service/
├── src/applied_ai/<name>_service/
│   ├── __main__.py
│   ├── configuration_parser.py
│   ├── controller.py
│   ├── manager.py
│   ├── model.py
│   └── module.py
├── tests/...
├── etc/.env.schema
├── pyproject.toml
├── uv.lock
└── Makefile
```

### `model.py`

```python
from __future__ import annotations

from applied_ai.common.configuration_model import Configuration as BaseConfiguration
from applied_ai.common.model import BaseModel


class FooCreateRequest(BaseModel):
    name: str


class FooResponse(BaseModel):
    id: str
    name: str


class FooServiceConfiguration(BaseConfiguration):
    other_service_url: str
```

### `configuration_parser.py`

```python
from __future__ import annotations

import os

from applied_ai.common.configuration_parser import ConfigurationParser
from applied_ai.<name>_service.model import FooServiceConfiguration as ConfigurationModel


class FooServiceConfigurationParser(ConfigurationParser):
    """Reads env into FooServiceConfiguration"""

    def __init__(self):
        super().__init__(self.default_config_obj(), ConfigurationModel)

    def default_config_obj(self) -> dict:
        """Returns the service configuration"""
        default_config_obj = super().default_config_obj()
        config_obj = {"other_service_url": os.environ["OTHER_SERVICE_URL"]}
        return FooServiceConfigurationParser.populate_config_obj(
            default_config_obj=default_config_obj, config_obj=config_obj
        )
```

Required keys use `os.environ["KEY"]`. Optional keys use `.get` only when the model field is truly optional.

### `manager.py`

```python
from __future__ import annotations

from applied_ai.common.base import Main
from applied_ai.common.service_management import ServiceManager
from applied_ai.<name>_service.model import FooCreateRequest, FooResponse, FooServiceConfiguration


class FooServiceManager(ServiceManager):
    """Owns Foo business logic"""

    def __init__(self, configuration: FooServiceConfiguration | None = None):
        super().__init__()
        self._configuration = configuration or Main.configuration()

    async def create_foo(self, request: FooCreateRequest) -> FooResponse:
        """Creates a Foo"""
        Main.logger().debug("creating foo %s", request.name)
        return FooResponse(id="foo-1", name=request.name)
```

Config from `Main.configuration()`, never `os.environ`. HTTP calls go through `RestClient` (below), not `httpx` in the manager.

### `controller.py`

```python
from __future__ import annotations

from fastapi import APIRouter

from applied_ai.<name>_service.manager import FooServiceManager
from applied_ai.<name>_service.model import FooCreateRequest, FooResponse
from applied_ai.rest.controller import RestController


class FooRestController(RestController):
    """HTTP API for Foo"""

    _PREFIX = "/v1/foos"
    _TAG = "foos"

    def __init__(self, manager: FooServiceManager):
        super().__init__()
        self._manager = manager

    def prepare(self, application) -> None:
        """Registers routes"""
        router = APIRouter(prefix=FooRestController._PREFIX, tags=[FooRestController._TAG])
        router.add_api_route(
            "",
            self.create_foo,
            methods=["POST"],
            response_model=FooResponse,
            summary="Create foo",
        )
        application.include_router(router)

    async def create_foo(self, request: FooCreateRequest) -> FooResponse:
        """Creates a foo"""
        return await self._manager.create_foo(request)
```

Endpoints need `summary`, `tags`, and typed request/response models (STANDARDS §9).

### `module.py`

```python
from __future__ import annotations

from applied_ai.common.base import Main
from applied_ai.<name>_service.configuration_parser import FooServiceConfigurationParser as ConfigurationParser
from applied_ai.<name>_service.controller import FooRestController
from applied_ai.<name>_service.manager import FooServiceManager
from applied_ai.rest.module import RestApplicationModule


class FooServiceApplicationModule(RestApplicationModule):
    """Foo REST service"""

    DESCRIPTION = "foo service"

    def initialize_configuration_parser(self, *args, **kwargs) -> ConfigurationParser:
        """Initializes the configuration parser"""
        return ConfigurationParser()

    async def initialize_service_managers(self) -> None:
        """Initializes all service managers"""
        await super().initialize_service_managers()
        Main.add_service_manager(FooServiceManager())

    def initialize_controllers(self, application) -> None:
        """Wires HTTP controllers"""
        super().initialize_controllers(application)
        manager = Main.service_manager(FooServiceManager.__name__)
        FooRestController(manager).prepare(application)
```

If `py/rest_lib` does not exist yet, add it (`RestServer`, `RestController`, `RestConfigurationParser`, `RestApplicationModule`) instead of pasting FastAPI lifespan into the service.

### `__main__.py`

```python
from applied_ai.common.application_runner import ApplicationRunner
from applied_ai.<name>_service.module import FooServiceApplicationModule


def main():
    ApplicationRunner.run(FooServiceApplicationModule, use_internal_event_loop=True)


if __name__ == "__main__":
    main()
```

`pyproject.toml` script: `<name>-service = "applied_ai.<name>_service.__main__:main"`.

Protocol-specific HTTP that is not a public REST API (e.g. SageMaker `/ping` + `/invocations`) subclasses `ApplicationServer` and implements `serve_sync` — see `py/scoring_service`. Do not use that pattern for a JSON REST API.

---

## REST client (`py/rest_client_lib`)

Outbound HTTP from a manager. One client instance, typed models in, typed models out.

```python
from applied_ai.rest_client.client import RestClient
from applied_ai.<name>_service.model import FooCreateRequest, FooResponse


class OtherServiceClient:
    _PATH_FOOS = "/v1/foos"

    def __init__(self, rest_client: RestClient):
        self._rest_client = rest_client

    async def create_foo(self, request: FooCreateRequest) -> FooResponse:
        """Creates a foo on the other service"""
        payload = await self._rest_client.post(
            OtherServiceClient._PATH_FOOS, json=request.model_dump()
        )
        return FooResponse.model_validate(payload)
```

Wire it in the manager from configuration (`other_service_url`, timeouts, retries). Methods on `RestClient`: `get`, `post`, `put`, `patch`, `delete`, `post_multipart`.

Forbidden in services and jobs: `import httpx`, `import requests`, `urllib.request`. If `py/rest_client_lib` is missing, add it; do not inline a client.

---

## Job (`_job`)

One-shot process. Same Module / Parser / Manager as a service. `ApplicationServer.serve_sync` calls `manager.run()` once and returns.

```
py/<name>_job/
├── src/applied_ai/<name>_job/
│   ├── __main__.py
│   ├── configuration_parser.py
│   ├── components.py
│   ├── manager.py
│   ├── model.py
│   ├── module.py
│   └── server.py
```

### `server.py`

```python
from typing import Any

from applied_ai.common.application_server import ApplicationServer
from applied_ai.common.base import Main
from applied_ai.<name>_job.manager import FooJobManager


class FooJobApplicationServer(ApplicationServer):
    """Runs the job once"""

    def serve_sync(self) -> Any:
        """Serves the application"""
        manager: FooJobManager = Main.service_manager(FooJobManager.__name__)
        return manager.run()
```

### `module.py`

```python
from applied_ai.common.application_module import ApplicationModule
from applied_ai.common.base import Main
from applied_ai.<name>_job.configuration_parser import FooJobConfigurationParser as ConfigurationParser
from applied_ai.<name>_job.manager import FooJobManager
from applied_ai.<name>_job.server import FooJobApplicationServer as ApplicationServer


class FooJobApplicationModule(ApplicationModule):
    """Foo job"""

    DESCRIPTION = "foo job"

    def initialize_application_server(self, *args, **kwargs) -> ApplicationServer:
        """Initializes the application server"""
        return ApplicationServer(*args, **kwargs)

    def initialize_configuration_parser(self, *args, **kwargs) -> ConfigurationParser:
        """Initializes the configuration parser"""
        return ConfigurationParser()

    async def initialize_service_managers(self) -> None:
        """Initializes all service managers"""
        await super().initialize_service_managers()
        Main.add_service_manager(FooJobManager())
```

`__main__.py` is the same `ApplicationRunner.run(...)` pattern. Collaborators that are not the manager go in `components.py`.

Reference: `py/validation_evaluate_job`, `py/validation_resolve_job`, `py/endpoint_inference_job`.

---

## Event / Lambda service (`_service` + `AWSLambdaApplicationModule`)

Triggered process (EventBridge, SQS, Lambda). No REST controller.

```
src/applied_ai/<name>_service/
├── runner.py          # handler(event, context)
├── executor.py        # AWSLambdaExecutor.execute → manager
├── manager.py
├── module.py          # extends AWSLambdaApplicationModule
├── configuration_parser.py
└── model.py
```

```python
# runner.py
from applied_ai.common.aws_lambda.runner import AWSLambdaRunner
from applied_ai.<name>_service.executor import FooAWSLambdaExecutor
from applied_ai.<name>_service.module import FooServiceApplicationModule


def handler(event, context):
    """Handles the lambda invocation"""
    return AWSLambdaRunner.run(
        FooServiceApplicationModule,
        event,
        context,
        lambda_executor_class=FooAWSLambdaExecutor,
    )
```

```python
# executor.py
from typing import Any

from applied_ai.common.aws_lambda.executor import AWSLambdaExecutor
from applied_ai.common.base import Main
from applied_ai.<name>_service.manager import FooServiceManager


class FooAWSLambdaExecutor(AWSLambdaExecutor):
    """Passes the event to the manager"""

    async def execute(self, event: dict, context: Any) -> Any:
        """Handles one invocation"""
        manager: FooServiceManager = Main.service_manager(FooServiceManager.__name__)
        return manager.handle(event)
```

`module.py` extends `AWSLambdaApplicationModule` and only adds the manager. Reference: `py/mlops_trigger_service`.

---

## Logging lib — how it is used

### Services and jobs: `Main.logger()` only

`Main.initialize` constructs `ApplicationLogger` from `configuration.logger_configuration` (`LOG_LEVEL`, `APPLICATION_NAME`, PII redaction on by default). Do not construct `ApplicationLogger` or `logging.getLogger` in a service.

```python
from applied_ai.common.base import Main

Main.logger().debug("processing %s", foo_id)
Main.logger().info("serving on %s", address)
Main.logger().warning("retrying %s", foo_id)
Main.logger().exception("scoring failed")
```

- Never `print()`.
- Never `logging.getLogger(__name__)`.
- Never log inside `except` that swallows; re-raise (STANDARDS §1.2). `exception` is allowed only when the request/job must return an error response and the stack must be recorded (see `scoring_service` server).
- Do not log secrets or raw customer records. Redaction is conservative; it does not catch names.

### Standalone / training: `LoggerManager`

Use `LoggerManager` only outside `ApplicationRunner` (notebooks, scripts, training). Services that need MLflow still go through a manager, not ad-hoc `mlflow.*`.

```python
from applied_ai.logger_lib import LoggerManager
from applied_ai.logger_lib.model import (
    ApplicationLoggerConfiguration,
    LoggerLibConfiguration,
    MlflowLoggerConfiguration,
)

manager = LoggerManager(
    LoggerLibConfiguration(
        application_logger=ApplicationLoggerConfiguration(
            log_level="DEBUG",
            service_name="my-job",
        ),
        mlflow_logger=MlflowLoggerConfiguration(
            tracking_uri="http://127.0.0.1:5000",
            experiment_name="applied-ai",
            service_name="my-job",
        ),
    )
)
manager.application_logger.info("started")
mlflow_logger = manager.mlflow_logger_instance
with mlflow_logger.start_run(run_name="train"):
    mlflow_logger.log_param("epochs", 2)
    mlflow_logger.log_metric("loss", 0.1)
```

MLflow extra: `applied-ai-logger-lib[mlflow]`. Without it, application logging still works.

---

## Shared `_lib`

No `__main__.py`, no `controller.py`, no image. Export managers/utilities under `src/applied_ai/<name>_lib/`. Dependents list it in `pyproject.toml`:

```toml
dependencies = [
    "applied-ai-common",
    "applied-ai-<name>-lib",
]

[tool.uv.sources]
applied-ai-common = { path = "../common_lib", editable = true }
applied-ai-<name>-lib = { path = "../<name>_lib", editable = true }
```

`common_lib` already depends on `logger_lib`. Do not add a second logging stack.

---

## `etc/.env.schema` (every service and job)

```
APPLICATION_NAME=
RUNTIME_MODE=
LOG_LEVEL=
# service-specific required keys, empty values
OTHER_SERVICE_URL=
```

No secrets in git. Local `.env.dev` is gitignored.
