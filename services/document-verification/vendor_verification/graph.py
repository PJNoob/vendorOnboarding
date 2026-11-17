import asyncio
import re
import unicodedata
from datetime import date
from typing import Protocol, TypedDict

from langgraph.graph import END, START, StateGraph

from .models import Comparison, Document, Evidence, Extraction, Finding, Report, VerificationRequest


class Extractor(Protocol):
    async def extract(self, document: Document) -> Extraction: ...


class State(TypedDict, total=False):
    request: VerificationRequest
    extracted: list[Extraction]
    findings: list[Finding]
    report: Report


RULE_KINDS = {
    'BANK_BENEFICIARY': {'BANK'},
    'CERTIFICATE_SCOPE': {'CERTIFICATE'},
    'ENTITY_CONSISTENCY': {'REGISTRATION'},
    'TAX_PROFILE': {'TAX'},
}
FIELD_RULES = {
    'legal_name': {'BANK_BENEFICIARY', 'ENTITY_CONSISTENCY', 'TAX_PROFILE'},
    'registry_id': {'ENTITY_CONSISTENCY'},
    'address': {'ENTITY_CONSISTENCY'},
    'country': {'ENTITY_CONSISTENCY'},
    'account': {'BANK_BENEFICIARY'},
    'tax_id': {'TAX_PROFILE'},
    'vat_id': {'TAX_PROFILE'},
    'site': {'CERTIFICATE_SCOPE'},
    'activity': {'CERTIFICATE_SCOPE'},
    'standard': {'CERTIFICATE_SCOPE'},
    'expires_on': {'CERTIFICATE_SCOPE'},
}
# Scope, standard, and expiry can legitimately vary between certificates/annexes.
CROSS_FIELDS = {'legal_name', 'registry_id', 'account', 'tax_id', 'vat_id', 'address'}


def compact(value: str) -> str:
    return ''.join(c for c in unicodedata.normalize('NFKC', value).casefold() if c.isalnum())


# Legal-form words that suppliers and banks abbreviate differently ("Acme Limited" vs "ACME LTD").
LEGAL_FORMS = [
    (r'\blimited\b', 'ltd'), (r'\bincorporated\b', 'inc'), (r'\bcorporation\b', 'corp'),
    (r'\bcompany\b', 'co'), (r'\bprivate\b', 'pvt'), (r'\bl\.\s?l\.\s?c\.?', 'llc'), (r'&', 'and'),
]


def normalized(field: str, value: str) -> str:
    # Identifier punctuation is significant, except whitespace and common separators.
    if field in {'account', 'country', 'registry_id', 'tax_id', 'vat_id'}:
        return re.sub(r'[\s-]', '', value).upper()
    if field == 'legal_name':
        text = unicodedata.normalize('NFKC', value).casefold()
        for pattern, replacement in LEGAL_FORMS:
            text = re.sub(pattern, replacement, text)
        return compact(text)
    return compact(value)


# The registration country is checked only on registration evidence; a bank letter
# or tax form can legitimately name another country (the bank's, the tax office's).
COUNTRY_KINDS = {'REGISTRATION'}


def supported(document: Document, field) -> bool:
    page = next((p for p in document.pages if p.page == field.page), None)
    if not page or field.quote not in page.text:
        return False
    if field.field == 'country':
        # The model returns an ISO 3166-1 alpha-2 code for a country, state or emirate
        # printed in the quote ("Delaware" -> US, "Dubai" -> AE), so the code itself is not
        # in the quote. The verbatim quote keeps the reviewer able to check the mapping.
        return bool(re.fullmatch(r'[A-Z]{2}', field.value))
    return bool(compact(field.value) and compact(field.value) in compact(field.quote))


def build_graph(extractor: Extractor):
    async def extract(state: State):
        semaphore = asyncio.Semaphore(4)

        async def one(document):
            if not any(p.text.strip() for p in document.pages):
                return Extraction(fields=[])
            async with semaphore:
                return await extractor.extract(document)

        return {'extracted': await asyncio.gather(*(one(d) for d in state['request'].documents))}

    def compare(state: State):
        request = state['request']
        evidence: list[Evidence] = []
        unresolved: set[str] = set()
        for document, extracted in zip(request.documents, state['extracted'], strict=True):
            for field in extracted.fields:
                if field.field == 'country' and document.kind not in COUNTRY_KINDS:
                    continue
                if not supported(document, field) or field.confidence < 0.85:
                    unresolved.update(FIELD_RULES[field.field])
                    continue
                # Ownership declarations list other entities: do not compare their names
                # and identifiers to the vendor's identity.
                if document.kind == 'OWNERSHIP':
                    continue
                evidence.append(Evidence(documentId=document.documentId, page=field.page,
                                         field=field.field, value=field.value, quote=field.quote))
        by_id = {d.documentId: d for d in request.documents}
        missing = {kind for kind in request.requiredKinds if not any(
            d.kind == kind and d.pages and all(p.text.strip() for p in d.pages) for d in request.documents)}
        unreadable = any(not d.pages or any(not p.text.strip() for p in d.pages) for d in request.documents)
        findings = []
        for rule in request.rules:
            reasons: list[str] = []
            relevant = [e for e in evidence if rule in FIELD_RULES[e.field]]
            if missing:
                reasons.append('Required evidence is missing or unreadable: ' + ', '.join(sorted(missing)) + '.')
            if unreadable:
                reasons.append('Some submitted pages are unreadable and need manual review.')
            if rule in unresolved:
                reasons.append('Some extracted fields could not be verified against the source or have low confidence.')
            if not any(by_id[e.documentId].kind in RULE_KINDS[rule] for e in relevant):
                reasons.append('No supported fields were extracted from the required evidence.')
            comparisons: list[Comparison] = []
            for expected in [e for e in request.expected if e.rule == rule]:
                candidates = [e for e in relevant if e.field == expected.field and by_id[e.documentId].kind == expected.kind]
                declared = normalized(expected.field, expected.value)
                matched = any(normalized(e.field, e.value) == declared for e in candidates)
                # Many registration certificates do not print a country. Only a country that is
                # printed and differs from the declared one needs review.
                if not matched and expected.field == 'country' and candidates:
                    shown = ', '.join(dict.fromkeys(e.value for e in candidates))
                    reasons.append(f'The registration document shows the company is registered in {shown}, '
                                   f'but the application declares {expected.value}.')
                elif not matched and expected.field != 'country':
                    reasons.append(f'The declared {expected.field} needs verification against {expected.kind} evidence.')
                status = 'MATCH' if matched else 'MISMATCH' if candidates else 'MISSING_EVIDENCE'
                comparisons.append(Comparison(field=expected.field, kind=expected.kind, declared=expected.value,
                                              observed=list(dict.fromkeys(e.value for e in candidates)), status=status))
            for field_name in sorted(CROSS_FIELDS):
                if rule not in FIELD_RULES[field_name]:
                    continue
                candidates = [e for e in evidence if e.field == field_name]
                if len({normalized(e.field, e.value) for e in candidates}) > 1:
                    reasons.append(f'Conflicting {field_name} values appear in the submitted evidence.')
            if rule == 'CERTIFICATE_SCOPE':
                for item in relevant:
                    if item.field != 'expires_on':
                        continue
                    try:
                        expires = date.fromisoformat(item.value)
                    except ValueError:
                        reasons.append('Certificate expiry date is ambiguous.')
                    else:
                        if expires < date.today():
                            reasons.append('A certificate has expired.')
            # Include both sides of conflicts, including documents outside a rule's main kind.
            findings.append(Finding(rule=rule, result='REVIEW' if reasons else 'PASS',
                                    code='DOCUMENT_REVIEW_REQUIRED' if reasons else 'DOCUMENTS_CONSISTENT',
                                    message=' '.join(dict.fromkeys(reasons)) if reasons else 'Document fields are consistent.',
                                    evidence=relevant, comparisons=comparisons))
        return {'findings': findings}

    def report(state: State):
        return {'report': Report(submissionId=state['request'].submissionId,
                                 recommendation='NEEDS_REVIEW' if any(f.result != 'PASS' for f in state['findings']) else 'CONSISTENT',
                                 findings=state['findings'])}

    graph = StateGraph(State)
    graph.add_node('extract_fields', extract)
    graph.add_node('cross_verify', compare)
    graph.add_node('review_report', report)
    graph.add_edge(START, 'extract_fields')
    graph.add_edge('extract_fields', 'cross_verify')
    graph.add_edge('cross_verify', 'review_report')
    graph.add_edge('review_report', END)
    return graph.compile()
