import asyncio
import hmac
import logging
import os
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import ValidationError

from .graph import build_graph
from .models import CertificateGenerationRequest, CertificateGenerationResponse, Report, VerificationRequest

logger = logging.getLogger('vendor_verification')
MAX_BYTES = 10_485_760


def create_app(providers=None, token=None):
    service_token = token or os.environ.get('DOCUMENT_SERVICE_TOKEN', '')
    if len(service_token) < 32:
        raise RuntimeError('DOCUMENT_SERVICE_TOKEN must contain at least 32 characters')

    @asynccontextmanager
    async def lifespan(app):
        nonlocal providers
        if providers is None:
            from .providers import GoogleProviders
            providers = GoogleProviders()
        yield

    app = FastAPI(title='Vendor document verification', lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
    bearer = HTTPBearer()

    async def authorized(credentials: HTTPAuthorizationCredentials = Depends(bearer)):
        if not hmac.compare_digest(credentials.credentials, service_token):
            raise HTTPException(status_code=401, detail='Unauthorized')

    # Do not echo supplier documents or extracted PII in validation errors.
    @app.exception_handler(RequestValidationError)
    async def invalid(_request, _error):
        return JSONResponse(status_code=422, content={'detail': 'Invalid processing request'})

    @app.middleware('http')
    async def limit_body(request, call_next):
        # Request streams are bounded in both routes. Content-Length is an early rejection.
        try:
            if int(request.headers.get('content-length', '0')) > MAX_BYTES:
                return JSONResponse(status_code=413, content={'detail': 'Request too large'})
        except ValueError:
            return JSONResponse(status_code=400, content={'detail': 'Invalid content length'})
        response = await call_next(request)
        response.headers['Cache-Control'] = 'no-store'
        return response

    async def body(request, limit=MAX_BYTES):
        content = bytearray()
        async for chunk in request.stream():
            content.extend(chunk)
            if len(content) > limit:
                raise HTTPException(status_code=413, detail='Request too large')
        return bytes(content)

    @app.get('/health')
    async def health():
        return {'status': 'ok'}

    @app.post('/v1/extract/{document_id}', dependencies=[Depends(authorized)])
    async def extract(document_id: str, request: Request):
        content = await body(request)
        if len(document_id) > 128 or not content.startswith(b'%PDF-'):
            raise HTTPException(status_code=422, detail='A PDF document is required')
        try:
            pages = await asyncio.wait_for(providers.pages(document_id, content), timeout=110)
            return {'pages': [p.model_dump() for p in pages]}
        except Exception:
            logger.warning('document.extraction.failed')
            raise HTTPException(status_code=503, detail='Document extraction unavailable') from None

    @app.post('/v1/verify', response_model=Report, dependencies=[Depends(authorized)])
    async def verify(request: Request):
        try:
            payload = VerificationRequest.model_validate_json(await body(request))
        except ValidationError:
            raise HTTPException(status_code=422, detail='Invalid verification request') from None
        try:
            state = await asyncio.wait_for(build_graph(providers).ainvoke({'request': payload}), timeout=110)
            logger.info('document.verification.completed')
            return state['report']
        except Exception:
            logger.warning('document.verification.failed')
            raise HTTPException(status_code=503, detail='Document verification unavailable') from None

    @app.post('/v1/certificate-scope/generate', response_model=CertificateGenerationResponse, dependencies=[Depends(authorized)])
    async def generate_certificate_scope(request: Request):
        try:
            payload = CertificateGenerationRequest.model_validate_json(await body(request, limit=512_000))
        except ValidationError:
            raise HTTPException(status_code=422, detail='Invalid certificate scope request') from None
        try:
            return await asyncio.wait_for(providers.generate_certificate_evidence(payload), timeout=40)
        except Exception:
            logger.warning('certificate.scope.model.unavailable')
            raise HTTPException(status_code=503, detail='Certificate scope model unavailable') from None

    return app
