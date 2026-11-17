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


def test_report_distinguishes_matches_mismatches_and_missing_evidence():
    payload = request()
    payload['expected'][1]['value'] = 'AB123'
    payload['expected'][3]['value'] = '9999'
    source = provider()
    source.fields['bank'] = [field('account', '4567')]
    identity, bank = run(payload, source).findings

    registry = identity.comparisons[1]
    assert (registry.status, registry.declared, registry.observed) == ('MATCH', 'AB123', ['AB-123'])
    assert bank.comparisons[0].status == 'MISSING_EVIDENCE'
    assert bank.comparisons[0].observed == []
    assert (bank.comparisons[1].status, bank.comparisons[1].observed) == ('MISMATCH', ['4567'])
    assert bank.result == 'REVIEW'


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
    finding = run(payload, source).findings[0]
    assert finding.result == 'REVIEW'
    assert finding.message == ('Conflicting address values: "1 Main Street" (Registration document, page 1) '
                               'vs "1 Main St" (Bank letter, page 1).')


def test_conflicting_account_numbers_are_masked():
    payload = request()
    payload['documents'][0]['pages'][0]['text'] += ' 99998888'
    source = provider()
    source.fields['registration'].append(field('account', '99998888'))
    message = run(payload, source).findings[1].message
    assert 'ending 8888 (Registration document, page 1) vs ending 4567 (Bank letter, page 1)' in message
    assert '9999' not in message


def test_missing_required_document_requires_review():
    payload = request()
    payload['documents'] = payload['documents'][:1]
    assert all(f.result == 'REVIEW' for f in run(payload).findings)


def test_unreadable_page_prevents_clean_recommendation():
    payload = request()
    payload['documents'][0]['pages'].append({'documentId': 'registration', 'page': 2, 'text': ''})
    assert run(payload).recommendation == 'NEEDS_REVIEW'


def test_source_supported_fields_at_minimum_confidence_are_accepted():
    source = provider()
    source.fields['registration'][0]['confidence'] = 0.5
    finding = run(source=source).findings[0]
    assert finding.result == 'PASS'
    assert finding.comparisons[0].status == 'MATCH'


def test_invented_and_low_confidence_values_require_review():
    for change in [{'quote': 'not in the document'}, {'value': 'Invented'}, {'confidence': 0.49}, {'page': 2}]:
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


def test_certificate_model_route_requires_auth_and_redacts_failures():
    from unittest.mock import AsyncMock
    from vendor_verification.models import CertificateGenerationResponse

    source = provider()
    source.generate_certificate_evidence = AsyncMock(side_effect=[
        CertificateGenerationResponse(model='gemini-test', text='{"inspect": [1]}'),
        RuntimeError('private certificate excerpt'),
    ])
    path = '/v1/certificate-scope/generate'
    payload = {'instruction': 'Select evidence.', 'data': '{"index": [1]}'}
    headers = {'Authorization': f'Bearer {TOKEN}'}
    with TestClient(create_app(source, TOKEN)) as client:
        assert client.post(path, json=payload).status_code in {401, 403}
        assert client.post(path, headers=headers, json={**payload, 'data': 'x' * 100_001}).status_code == 422
        success = client.post(path, headers=headers, json=payload)
        assert success.status_code == 200
        assert success.headers['cache-control'] == 'no-store'
        assert success.json() == {'model': 'gemini-test', 'text': '{"inspect": [1]}'}
        failure = client.post(path, headers=headers, json=payload)
        assert failure.status_code == 503
        assert 'private certificate' not in failure.text
        assert source.generate_certificate_evidence.await_count == 2


def test_legal_name_normalization_accepts_legal_form_spellings():
    from vendor_verification.graph import normalized
    assert normalized('legal_name', 'Cedar Meridian QA Calibration Limited') == normalized('legal_name', 'CEDAR MERIDIAN QA CALIBRATION LTD.')
    assert normalized('legal_name', 'Smith & Sons L.L.C.') == normalized('legal_name', 'Smith and Sons LLC')
    assert normalized('legal_name', 'Acme Ltd') != normalized('legal_name', 'Acme Holdings Ltd')


def scope_report(site_text, activity_text, declared_site='Kabul', declared_activity='CALIBRATION'):
    payload = {
        'submissionId': 'submission', 'requiredKinds': ['CERTIFICATE'], 'rules': ['CERTIFICATE_SCOPE'],
        'expected': [
            {'field': 'site', 'value': declared_site, 'rule': 'CERTIFICATE_SCOPE', 'kind': 'CERTIFICATE'},
            {'field': 'activity', 'value': declared_activity, 'rule': 'CERTIFICATE_SCOPE', 'kind': 'CERTIFICATE'},
        ],
        'documents': [{'documentId': 'cert', 'kind': 'CERTIFICATE', 'pages': [{
            'documentId': 'cert', 'page': 1, 'text': ' '.join(filter(None, [site_text, activity_text]))}]}],
    }
    fields = [field(name, text) for name, text in (('site', site_text), ('activity', activity_text)) if text]
    finding = run(payload, FakeProvider({'cert': fields})).findings[0]
    return {c.field: c.status for c in finding.comparisons}


def test_scope_matches_prose_descriptions_of_declared_values():
    statuses = scope_report('Kabul, Afghanistan', 'Industrial metrology and calibration services')
    assert statuses == {'site': 'MATCH', 'activity': 'MATCH'}


def test_scope_still_reports_unrelated_values_and_missing_evidence():
    assert scope_report('Kandahar', 'Catering and cleaning services') == {'site': 'MISMATCH', 'activity': 'MISMATCH'}
    assert scope_report('', 'Calibration laboratory') == {'site': 'MISSING_EVIDENCE', 'activity': 'MATCH'}


def test_scope_containment_does_not_apply_to_identifiers():
    from vendor_verification.graph import matches
    assert not matches('account', '4567', '1234567')
    assert not matches('tax_id', 'AB1', 'AB12')
    assert not matches('site', 'apply', 'Kabul, Afghanistan')
    assert matches('site', 'Kabul laboratory', 'Kabul Afghanistan laboratory')


def country_request(declared='US'):
    payload = request()
    payload['expected'].append({'field': 'country', 'value': declared, 'rule': 'ENTITY_CONSISTENCY', 'kind': 'REGISTRATION'})
    payload['documents'][0]['pages'][0]['text'] = 'Acme AB-123 incorporated in the State of Delaware'
    return payload


def country_provider(code='US', kind_doc='registration'):
    source = provider()
    source.fields[kind_doc] = source.fields[kind_doc] + [
        field('country', code, quote='State of Delaware' if kind_doc == 'registration' else 'Acme 4567')]
    return source


def country_finding(report):
    finding = next(f for f in report.findings if f.rule == 'ENTITY_CONSISTENCY')
    return finding, next(c for c in finding.comparisons if c.field == 'country')


def test_registration_country_matching_the_declared_country_passes():
    finding, comparison = country_finding(run(country_request('US'), country_provider('US')))
    assert finding.result == 'PASS'
    assert comparison.status == 'MATCH' and comparison.observed == ['US']


def test_registration_from_another_country_needs_review():
    finding, comparison = country_finding(run(country_request('AE'), country_provider('US')))
    assert finding.result == 'REVIEW'
    assert 'registered in US, but the application declares AE' in finding.message
    assert comparison.status == 'MISMATCH' and comparison.observed == ['US']


def test_a_registration_without_a_printed_country_is_not_flagged():
    finding, comparison = country_finding(run(country_request('US'), provider()))
    assert finding.result == 'PASS'
    assert comparison.status == 'MISSING_EVIDENCE'


def test_country_on_other_documents_is_ignored_and_names_are_rejected():
    # A bank letter naming the bank's country does not count as the vendor's country.
    finding, comparison = country_finding(run(country_request('AE'), country_provider('US', 'bank')))
    assert finding.result == 'PASS' and comparison.status == 'MISSING_EVIDENCE'
    # A country name instead of an ISO code is unverifiable and sent to review.
    finding, _ = country_finding(run(country_request('US'), country_provider('United States')))
    assert finding.result == 'REVIEW'
