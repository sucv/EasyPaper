from __future__ import annotations
from pydantic import BaseModel, Field
from typing import Literal


class PaperEntry(BaseModel):
    paper_id: str
    title: str
    authors: list[str] = Field(default_factory=list)
    year: int | None = None
    venue: str | None = None
    abstract: str | None = None
    citation_count: int | None = None
    source: Literal["accessible_db", "inaccessible_db", "arxiv", "user_provided"]
    pdf_url: str | None = None
    indexed: bool = False


class PaperMetadata(BaseModel):
    paper_id: str
    title: str
    authors: list[str] = Field(default_factory=list)
    year: int | None = None
    venue: str | None = None
    abstract: str | None = None
    citation_count: int | None = None
    source: str = ""


class IdeaPaper(BaseModel):
    paper_id: str
    title: str
    authors: list[str] = Field(default_factory=list)
    year: int | None = None
    venue: str | None = None
    abstract: str | None = None
    citation_count: int | None = None
    source: str = "accessible_db"
    pdf_url: str | None = None
    status: Literal["pending", "indexed", "retrieved"] = "pending"


class ReportInfo(BaseModel):
    filename: str
    display_name: str
    path: str


class IdeaState(BaseModel):
    idea_text: str
    idea_slug: str
    papers: list[IdeaPaper] = Field(default_factory=list)
    reports: list[ReportInfo] = Field(default_factory=list)


class ProjectState(BaseModel):
    project_id: str
    indexed_papers: dict[str, PaperMetadata] = Field(default_factory=dict)
    ideas: list[IdeaState] = Field(default_factory=list)


# Request/Response models
class SearchRequest(BaseModel):
    method: Literal["boolean", "vector", "arxiv"]
    query: str
    filters: dict = Field(default_factory=dict)
    # filters: {years: list[int], venues: list[str], accessible: bool}


class DedupCheckRequest(BaseModel):
    title: str


class DedupCheckResponse(BaseModel):
    duplicate: bool
    matched_title: str | None = None
    similarity: float = 0.0


class CitationRequest(BaseModel):
    title: str


class CitationResponse(BaseModel):
    citation_count: int | None = None
    openalex_id: str | None = None


class CreateIdeaRequest(BaseModel):
    idea_text: str


class AssignPapersRequest(BaseModel):
    papers: list[PaperEntry]


class RetrieveRequest(BaseModel):
    paper_ids: list[str]

class ResearchRequest(BaseModel):
    writing_prompt: str


class BusyStateResponse(BaseModel):
    busy: bool
    operation: str | None = None
    idea_slug: str | None = None


class ChatMessageRequest(BaseModel):
    message: str
    scope: str = "all"


class ChatSessionCreate(BaseModel):
    scope: str = "all"


class ChatSessionUpdate(BaseModel):
    title: str | None = None
    scope: str | None = None