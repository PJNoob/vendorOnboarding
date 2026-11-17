import asyncio
import re
from typing import Protocol, TypedDict

from langgraph.graph import END, START, StateGraph

from .models import AgentDecision, AgentRequest, Candidate, Document, Evidence, Expected, FieldName, Resolution

MAX_TOOL_STEPS = 3
CONCURRENCY = 4
# Wrong "same" verdicts on these fields would mean paying the wrong account or accepting the wrong entity,
# so the agent may only clear formatting differences, and code verifies it.
IDENTIFIER_FIELDS = {'account', 'registry_id', 'tax_id', 'vat_id'}


class Decider(Protocol):
    async def decide(self, request: AgentRequest) -> AgentDecision: ...


class ConflictState(TypedDict, total=False):
    request: AgentRequest
    decision: AgentDecision
    steps: int


def identifier_core(value: str) -> str:
    return re.sub(r'[^0-9a-z]', '', value.casefold())


def same_identifier(values: list[str]) -> bool:
    """Equal after dropping separators; one leading two-letter country prefix ("GB123") is allowed."""
    cores = {identifier_core(value) for value in values}
    return len(cores) == 1 or len({re.sub(r'^[a-z]{2}(?=\d)', '', core) for core in cores}) == 1


def unresolved(field: FieldName, candidates: list[Evidence], reason: str) -> Resolution:
    return Resolution(field=field, verdict='UNRESOLVED', reason=reason, evidence=candidates)


def build_agent(decider: Decider, documents: dict[str, Document], expected: list[Expected]):
    def read_page(decision: AgentDecision) -> str:
        document = documents.get(decision.documentId or '')
        page = next((p for p in document.pages if p.page == decision.page), None) if document else None
        return f'Page text of {decision.documentId} page {decision.page}:\n{page.text}' if page else 'Page not found.'

    def get_declared(field: FieldName) -> str:
        values = [e.value for e in expected if e.field == field]
        return f'Declared {field}: ' + ('; '.join(dict.fromkeys(values)) if values else 'none declared.')

    async def decide(state: ConflictState):
        request = state['request']
        request = request.model_copy(update={'canUseTools': state.get('steps', 0) < MAX_TOOL_STEPS})
        return {'request': request, 'decision': await decider.decide(request)}

    def act(state: ConflictState):
        request, decision = state['request'], state['decision']
        if decision.action == 'read_page':
            note = read_page(decision)
        else:
            note = get_declared(request.field)
        return {'request': request.model_copy(update={'observations': [*request.observations, note]}),
                'steps': state.get('steps', 0) + 1}

    def route(state: ConflictState):
        decision = state['decision']
        if decision.action == 'resolve' or not state['request'].canUseTools:
            return END
        return 'act'

    graph = StateGraph(ConflictState)
    graph.add_node('decide', decide)
    graph.add_node('act', act)
    graph.add_edge(START, 'decide')
    graph.add_conditional_edges('decide', route, {'act': 'act', END: END})
    graph.add_edge('act', 'decide')
    return graph.compile()


def finalize(field: FieldName, candidates: list[Evidence], decision: AgentDecision) -> Resolution:
    if decision.action != 'resolve' or not decision.verdict or not (decision.reason or '').strip():
        return unresolved(field, candidates, 'The agent could not reach a verdict within its step limit.')
    if field in IDENTIFIER_FIELDS and decision.verdict != 'UNRESOLVED' and not (
            decision.verdict == 'SAME_ENTITY' and same_identifier([e.value for e in candidates])):
        return unresolved(field, candidates, 'The agent proposed a match but the identifiers differ beyond formatting, '
                                             'so manual review is required.')
    return Resolution(field=field, verdict=decision.verdict, reason=decision.reason.strip(), evidence=candidates)


async def resolve_conflicts(decider: Decider, conflicts: dict[FieldName, list[Evidence]],
                            documents: dict[str, Document], expected: list[Expected]) -> dict[FieldName, Resolution]:
    agent = build_agent(decider, documents, expected)
    semaphore = asyncio.Semaphore(CONCURRENCY)

    async def one(field: FieldName, candidates: list[Evidence]) -> Resolution:
        request = AgentRequest(
            field=field, observations=[], canUseTools=True,
            candidates=[Candidate(documentId=e.documentId, kind=documents[e.documentId].kind, page=e.page,
                                  value=e.value, quote=e.quote) for e in candidates])
        try:
            async with semaphore:
                state = await agent.ainvoke({'request': request, 'steps': 0})
            return finalize(field, candidates, state['decision'])
        except Exception:
            return unresolved(field, candidates, 'The resolution agent was unavailable, so manual review is required.')

    results = await asyncio.gather(*(one(field, candidates) for field, candidates in conflicts.items()))
    return {resolution.field: resolution for resolution in results}
