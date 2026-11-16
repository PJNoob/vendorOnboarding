import asyncio
import io
from types import SimpleNamespace
from unittest.mock import AsyncMock

from google.cloud import documentai_v1 as documentai
from google.genai import types
from pypdf import PdfReader, PdfWriter

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


def test_ocr_preserves_page_numbers_across_batches():
    async def process(*, request, **_kwargs):
        count = len(PdfReader(io.BytesIO(request.raw_document.content)).pages)
        return SimpleNamespace(document=documentai.Document(text='Acme', pages=[documentai.Document.Page(
            layout=documentai.Document.Page.Layout(text_anchor=documentai.Document.TextAnchor(
                text_segments=[documentai.Document.TextAnchor.TextSegment(start_index=0, end_index=4)]))) for _ in range(count)]))
    provider = GoogleProviders.__new__(GoogleProviders)
    provider.project = 'project'
    provider.location = 'us'
    provider.processor = 'processor'
    provider.ocr = SimpleNamespace(processor_path=lambda *_args: 'processor', process_document=AsyncMock(side_effect=process))
    pages = asyncio.run(provider.pages('document', pdf(16)))
    assert [page.page for page in pages] == list(range(1, 17))
    assert all(page.text == 'Acme' for page in pages)
    assert provider.ocr.process_document.await_count == 2


def test_unsupported_pdfs_do_not_call_ocr():
    provider = GoogleProviders.__new__(GoogleProviders)
    provider.ocr = SimpleNamespace(process_document=AsyncMock())
    assert asyncio.run(provider.pages('document', pdf(51))) == []
    assert asyncio.run(provider.pages('document', pdf(1, encrypted=True))) == []
    provider.ocr.process_document.assert_not_called()


def test_gemini_accepts_typed_extraction_schema():
    config = types.GenerateContentConfig(response_mime_type='application/json', response_schema=Extraction)
    assert config.response_schema is Extraction


def test_generation_schema_keeps_types_and_runtime_validation_stays_strict():
    import json
    import pytest
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
