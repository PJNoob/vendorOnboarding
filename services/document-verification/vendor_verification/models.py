from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator

Kind = Literal['BANK', 'CERTIFICATE', 'OWNERSHIP', 'REGISTRATION', 'TAX']
Rule = Literal['BANK_BENEFICIARY', 'CERTIFICATE_SCOPE', 'ENTITY_CONSISTENCY', 'TAX_PROFILE']
FieldName = Literal['legal_name', 'registry_id', 'account', 'tax_id', 'vat_id', 'address', 'country', 'site', 'activity', 'standard', 'expires_on']


class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid')


class Page(StrictModel):
    documentId: str = Field(min_length=1, max_length=128)
    page: int = Field(ge=1, le=50)
    text: str = Field(max_length=10000)


class Document(StrictModel):
    documentId: str = Field(min_length=1, max_length=128)
    kind: Kind
    pages: list[Page] = Field(max_length=50)

    @model_validator(mode='after')
    def check_pages(self):
        if any(p.documentId != self.documentId for p in self.pages):
            raise ValueError('page belongs to a different document')
        if len({p.page for p in self.pages}) != len(self.pages):
            raise ValueError('duplicate page')
        return self


class Expected(StrictModel):
    field: FieldName
    value: str = Field(min_length=1, max_length=200)
    rule: Rule
    kind: Kind


class VerificationRequest(StrictModel):
    submissionId: str = Field(min_length=1, max_length=128)
    requiredKinds: list[Kind] = Field(min_length=1, max_length=5)
    rules: list[Rule] = Field(max_length=4)
    documents: list[Document] = Field(max_length=20)
    expected: list[Expected] = Field(max_length=100)

    @model_validator(mode='after')
    def unique_documents(self):
        if len({d.documentId for d in self.documents}) != len(self.documents):
            raise ValueError('duplicate document')
        return self


class ExtractedField(StrictModel):
    field: FieldName
    value: str = Field(min_length=1, max_length=500)
    page: int = Field(ge=1, le=50)
    quote: str = Field(min_length=1, max_length=1000)
    confidence: float = Field(ge=0, le=1)


class Extraction(StrictModel):
    fields: list[ExtractedField] = Field(max_length=100)


class Evidence(StrictModel):
    documentId: str
    page: int
    field: FieldName
    value: str
    quote: str


class Comparison(StrictModel):
    field: FieldName
    kind: Kind
    declared: str
    observed: list[str]
    status: Literal['MATCH', 'MISMATCH', 'MISSING_EVIDENCE']


Verdict = Literal['SAME_ENTITY', 'DIFFERENT_ROLE', 'UNRESOLVED']


class Resolution(StrictModel):
    field: FieldName
    verdict: Verdict
    reason: str = Field(min_length=1, max_length=600)
    evidence: list[Evidence]


class Candidate(StrictModel):
    documentId: str
    kind: Kind
    page: int
    value: str
    quote: str


class AgentRequest(StrictModel):
    field: FieldName
    candidates: list[Candidate]
    observations: list[str]
    canUseTools: bool


class AgentDecision(StrictModel):
    action: Literal['read_page', 'get_declared', 'resolve']
    documentId: str | None = None
    page: int | None = None
    verdict: Verdict | None = None
    reason: str | None = Field(default=None, max_length=600)


class Finding(StrictModel):
    rule: Rule
    result: Literal['PASS', 'REVIEW']
    code: str
    message: str
    evidence: list[Evidence]
    comparisons: list[Comparison] = Field(default_factory=list)
    resolutions: list[Resolution] = Field(default_factory=list)


class Report(StrictModel):
    submissionId: str
    version: str = 'langgraph-gemini-v4'
    recommendation: Literal['CONSISTENT', 'NEEDS_REVIEW']
    findings: list[Finding]


class CertificateGenerationRequest(StrictModel):
    instruction: str = Field(min_length=1, max_length=1024)
    data: str = Field(min_length=1, max_length=100_000)


class CertificateGenerationResponse(StrictModel):
    model: str = Field(min_length=1, max_length=128)
    text: str = Field(min_length=1, max_length=10_000)
