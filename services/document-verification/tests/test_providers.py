import asyncio
import io
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest
from google.genai import types
from pypdf import PdfWriter

from vendor_verification.models import Extraction
from vendor_verification.providers import GoogleProviders


def pdf(pages, encrypted=False):
    writer = PdfWriter()
    for _ in range(pages):
        writer.add_blank_page(width=72, height=72)
    if encrypted:
        writer.encrypt('secret')
    output = io.BytesIO()
    writer.write(output)
    return output.getvalue()


def ocr_provider(generate):
    provider = GoogleProviders.__new__(GoogleProviders)
    provider.model = 'gemini-3.8-flash'
    provider.gemini = SimpleNamespace(aio=SimpleNamespace(models=SimpleNamespace(generate_content=generate)))
    provider.render_page = Mock(side_effect=lambda _pdf, page: str(page).encode())
    return provider


def ocr_response(text, reason=types.FinishReason.STOP):
    return SimpleNamespace(candidates=[SimpleNamespace(finish_reason=reason)], text=text)


def test_ocr_preserves_page_numbers_when_gemini_responses_finish_out_of_order():
    async def generate(*, model, contents, config):
        assert model == 'gemini-3.8-flash'
        assert config.response_schema.type == types.Type.STRING
        part = contents.parts[0].inline_data
        assert part.mime_type == 'image/png'
        page = int(part.data)
        if page == 1:
            await second_page_finished.wait()
        elif page == 2:
            second_page_finished.set()
        return ocr_response(json.dumps(f'Page {page}'))

    async def extract():
        nonlocal second_page_finished
        second_page_finished = asyncio.Event()
        return await provider.pages('document', pdf(50))

    second_page_finished = None
    provider = ocr_provider(AsyncMock(side_effect=generate))
    pages = asyncio.run(extract())
    assert [(page.documentId, page.page, page.text) for page in pages] == [
        ('document', index, f'Page {index}') for index in range(1, 51)]


def test_unsupported_pdfs_do_not_call_ocr():
    generate = AsyncMock()
    provider = ocr_provider(generate)
    assert asyncio.run(provider.pages('document', pdf(51))) == []
    assert asyncio.run(provider.pages('document', pdf(1, encrypted=True))) == []
    provider.render_page.assert_not_called()
    generate.assert_not_called()


@pytest.mark.parametrize('response', [
    ocr_response(json.dumps('A' * 10001)),
    ocr_response('"partial', types.FinishReason.MAX_TOKENS),
])
def test_oversized_or_truncated_transcripts_are_unreadable(response):
    provider = ocr_provider(AsyncMock(return_value=response))
    assert asyncio.run(provider.transcribe_page(b'png')) == ''


def test_blocked_ocr_fails_instead_of_returning_an_empty_transcript():
    response = ocr_response(None, types.FinishReason.SAFETY)
    provider = ocr_provider(AsyncMock(return_value=response))
    with pytest.raises(RuntimeError, match='did not complete'):
        asyncio.run(provider.transcribe_page(b'png'))


def test_gemini_accepts_typed_extraction_schema():
    config = types.GenerateContentConfig(response_mime_type='application/json', response_schema=Extraction)
    assert config.response_schema is Extraction


def test_generation_schema_keeps_types_and_runtime_validation_stays_strict():
    from pydantic import ValidationError
    schema = GoogleProviders.response_schema()
    types.GenerateContentConfig(response_mime_type='application/json', response_schema=schema)
    serialized = json.dumps(schema)
    assert 'maxItems' not in serialized
    assert 'maximum' not in serialized
    assert schema['required'] == ['fields']
    assert schema['$defs']['ExtractedField']['properties']['field']['enum']
    value = {'field': 'legal_name', 'value': 'Acme', 'page': 1, 'quote': 'Acme', 'confidence': 0.99}
    for invalid in [
        {'fields': [value] * 101},
        {'fields': [{**value, 'confidence': 1.1}]},
        {'fields': [{**value, 'field': 'invented'}]},
        {'fields': [{**value, 'page': 0}]},
        {'fields': [{**value, 'quote': ''}]},
        {'fields': [value], 'unexpected': True},
    ]:
        with pytest.raises(ValidationError):
            Extraction.model_validate(invalid)


def test_certificate_generation_reuses_the_document_gemini_model():
    from vendor_verification.models import CertificateGenerationRequest

    provider = GoogleProviders.__new__(GoogleProviders)
    provider.model = 'configured-document-model'
    generate = AsyncMock(side_effect=[
        SimpleNamespace(text='{"fields": []}'),
        SimpleNamespace(text='{"inspect": [1]}'),
    ])
    provider.gemini = SimpleNamespace(aio=SimpleNamespace(models=SimpleNamespace(generate_content=generate)))
    from vendor_verification.models import Document
    asyncio.run(provider.extract(Document(documentId='certificate', kind='CERTIFICATE', pages=[])))
    result = asyncio.run(provider.generate_certificate_evidence(CertificateGenerationRequest(
        instruction='Select evidence pages', data='{"index": [1]}',
    )))
    first, second = [call.kwargs for call in generate.await_args_list]
    assert first['model'] == second['model'] == result.model == 'configured-document-model'
    assert second['contents'] == '{"index": [1]}'
    assert second['config'].response_mime_type == 'application/json'
    assert result.text == '{"inspect": [1]}'
