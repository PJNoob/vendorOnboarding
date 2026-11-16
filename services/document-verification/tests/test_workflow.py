import asyncio

from fastapi.testclient import TestClient

from vendor_verification.app import create_app
from vendor_verification.graph import build_graph
from vendor_verification.models import Extraction, VerificationRequest

TOKEN = 'test-token-' * 4


class FakeProvider:
    def __init__(self, fields=None, fail=False):
        self.fields = fields or {}
        self.fail = fail

    async def extract(self, document):
        if self.fail:
            raise TimeoutError('private supplier text must never appear in the response')
        return Extraction(fields=self.fields.get(document.documentId, []))

    async def pages(self, document_id, content):
        if self.fail:
            raise TimeoutError()
        from vendor_verification.models import Page
        return [Page(documentId=document_id, page=1, text='Acme 123')]


def field(name, value, **kwargs):
    return {'field': name, 'value': value, 'page': 1, 'quote': value, 'confidence': 0.99, **kwargs}


def request():
    return {
        'submissionId': 'submission', 'requiredKinds': ['REGISTRATION', 'BANK'],
        'rules': ['ENTITY_CONSISTENCY', 'BANK_BENEFICIARY'],
        'expected': [
            {'field': 'legal_name', 'value': 'Acme', 'rule': 'ENTITY_CONSISTENCY', 'kind': 'REGISTRATION'},
            {'field': 'registry_id', 'value': 'AB-123', 'rule': 'ENTITY_CONSISTENCY', 'kind': 'REGISTRATION'},
            {'field': 'legal_name', 'value': 'Acme', 'rule': 'BANK_BENEFICIARY', 'kind': 'BANK'},
            {'field': 'account', 'value': '4567', 'rule': 'BANK_BENEFICIARY', 'kind': 'BANK'},
        ],
        'documents': [
            {'documentId': 'registration', 'kind': 'REGISTRATION', 'pages': [{'documentId': 'registration', 'page': 1, 'text': 'Acme AB-123'}]},
            {'documentId': 'bank', 'kind': 'BANK', 'pages': [{'documentId': 'bank', 'page': 1, 'text': 'Acme 4567'}]},
        ],
    }


def provider():
    return FakeProvider({'registration': [field('legal_name', 'Acme'), field('registry_id', 'AB-123')],
                         'bank': [field('legal_name', 'Acme'), field('account', '4567')]})


def run(payload=None, source=None):
    graph = build_graph(source or provider())
    return asyncio.run(graph.ainvoke({'request': VerificationRequest.model_validate(payload or request())}))['report']


def test_matching_documents_produce_a_recommendation_only():
    report = run()
    assert report.recommendation == 'CONSISTENT'
    assert all(f.result == 'PASS' for f in report.findings)
    assert not hasattr(report, 'approved')


def test_conflicting_vendor_names_include_both_documents():
    payload = request()
    payload['documents'][1]['pages'][0]['text'] = 'Other 4567'
    source = provider()
    source.fields['bank'][0] = field('legal_name', 'Other')
    report = run(payload, source)
    assert report.recommendation == 'NEEDS_REVIEW'
    assert all(f.result == 'REVIEW' for f in report.findings)
    assert {e.documentId for e in report.findings[0].evidence} == {'bank', 'registration'}


def test_identifier_formatting_is_normalized():
    payload = request()
    payload['expected'][1]['value'] = 'AB123'
    assert run(payload).recommendation == 'CONSISTENT'


def test_address_variations_require_review():
    payload = request()
    payload['documents'][0]['pages'][0]['text'] += ' 1 Main Street'
    payload['documents'][1]['pages'][0]['text'] += ' 1 Main St'
    source = provider()
    source.fields['registration'].append(field('address', '1 Main Street'))
    source.fields['bank'].append(field('address', '1 Main St'))
    assert run(payload, source).findings[0].result == 'REVIEW'


def test_missing_required_document_requires_review():
    payload = request()
    payload['documents'] = payload['documents'][:1]
    assert all(f.result == 'REVIEW' for f in run(payload).findings)


def test_unreadable_page_prevents_clean_recommendation():
    payload = request()
    payload['documents'][0]['pages'].append({'documentId': 'registration', 'page': 2, 'text': ''})
    assert run(payload).recommendation == 'NEEDS_REVIEW'


def test_invented_and_low_confidence_values_require_review():
    for change in [{'quote': 'not in the document'}, {'value': 'Invented'}, {'confidence': 0.2}, {'page': 2}]:
        source = provider()
        source.fields['registration'][0].update(change)
        assert run(source=source).findings[0].result == 'REVIEW'


def test_ownership_names_do_not_conflict_with_vendor():
    payload = request()
    payload['documents'].append({'documentId': 'owners', 'kind': 'OWNERSHIP', 'pages': [{'documentId': 'owners', 'page': 1, 'text': 'Another owner'}]})
    source = provider()
    source.fields['owners'] = [field('legal_name', 'Another owner')]
    assert run(payload, source).recommendation == 'CONSISTENT'


def test_expired_and_ambiguous_certificate_dates_require_review():
    for expiry in ['2020-01-01', '01/02/2030']:
        payload = request()
        payload['rules'] = ['CERTIFICATE_SCOPE']
        payload['expected'] = []
        payload['requiredKinds'] = ['CERTIFICATE']
        payload['documents'] = [{'documentId': 'cert', 'kind': 'CERTIFICATE', 'pages': [{'documentId': 'cert', 'page': 1, 'text': expiry}]}]
        report = run(payload, FakeProvider({'cert': [field('expires_on', expiry)]}))
        assert report.recommendation == 'NEEDS_REVIEW'


def test_source_document_ids_and_duplicate_pages_are_validated():
    from pydantic import ValidationError
    import pytest
    payload = request()
    payload['documents'][0]['pages'][0]['documentId'] = 'someone-else'
    with pytest.raises(ValidationError):
        VerificationRequest.model_validate(payload)


def test_service_requires_token_and_returns_no_store():
    with TestClient(create_app(provider(), TOKEN)) as client:
        assert client.post('/v1/verify', json=request()).status_code in {401, 403}
        assert client.post('/v1/verify', headers={'Authorization': 'Bearer wrong'}, json=request()).status_code == 401
        response = client.post('/v1/verify', headers={'Authorization': f'Bearer {TOKEN}'}, json=request())
        assert response.status_code == 200
        assert response.headers['cache-control'] == 'no-store'
        assert response.json()['recommendation'] == 'CONSISTENT'


def test_service_redacts_provider_errors_and_invalid_model_data():
    with TestClient(create_app(FakeProvider(fail=True), TOKEN)) as client:
        response = client.post('/v1/verify', headers={'Authorization': f'Bearer {TOKEN}'}, json=request())
        assert response.status_code == 503
        assert 'private supplier' not in response.text
        assert client.post('/v1/verify', headers={'Authorization': f'Bearer {TOKEN}'}, json={'secret': 'sensitive'}).status_code == 422


def test_extraction_and_size_limits():
    with TestClient(create_app(provider(), TOKEN)) as client:
        headers = {'Authorization': f'Bearer {TOKEN}', 'Content-Type': 'application/pdf'}
        response = client.post('/v1/extract/document', content=b'%PDF-test', headers=headers)
        assert response.status_code == 200
        assert response.json()['pages'][0]['documentId'] == 'document'
        assert client.post('/v1/extract/document', content=b'bad', headers=headers).status_code == 422
        assert client.post('/v1/extract/document', content=b'x', headers={**headers, 'Content-Length': '10485761'}).status_code == 413
