import os
import yaml
from pathlib import Path
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()


class LLMModelConfig(BaseModel):
    model: str = "openai:gpt-4.1-mini"
    temperature: float = 0
    max_tokens: int | None = None          # max output tokens (all providers)
    reasoning: bool = False                 # enable reasoning/thinking mode
    reasoning_effort: str | None = None     # "low", "medium", "high" (OpenAI o1/o3)
    thinking_budget: int | None = None      # token budget for thinking (Anthropic/Gemini)
    top_p: float | None = None              # nucleus sampling
    top_k: int | None = None                # top-k sampling (Anthropic/Gemini)
    stop: list[str] | None = None           # stop sequences


class LLMConfig(BaseModel):
    default_model: str = "openai:gpt-4.1-mini"
    metadata_extractor: LLMModelConfig = LLMModelConfig()
    tree_builder: LLMModelConfig = LLMModelConfig()
    tree_search: LLMModelConfig = LLMModelConfig()
    report_writer: LLMModelConfig = LLMModelConfig(temperature=0.3)
    chat_agent: LLMModelConfig = LLMModelConfig(temperature=0.3)


class EmbeddingConfig(BaseModel):
    provider: str = "ollama"  # ollama, openai, google, cohere, voyageai, huggingface
    model: str = "nomic-embed-text"


class ChromaConfig(BaseModel):
    accessible_collection: str = "accessible_papers"
    inaccessible_collection: str = "inaccessible_papers"
    persist_directory: str = "./chroma_db"


class MarkerConfig(BaseModel):
    api_url: str = "https://www.datalab.to/api/v1/marker"
    max_concurrency: int = 5


class OpenAlexConfig(BaseModel):
    base_url: str = "https://api.openalex.org"


class ArxivConfig(BaseModel):
    default_max_results: int = 100


class SearchConfig(BaseModel):
    max_results_per_search: int = 200


class ProjectConfig(BaseModel):
    projects_root: str = "./projects"


class TreeConfig(BaseModel):
    if_thinning: bool = False
    min_token_threshold: int = 5000
    summary_token_threshold: int = 200
    if_add_node_summary: str = "yes"


class ChatConfig(BaseModel):
    summarization_token_threshold: int = 8000
    max_papers_per_search: int = 10
    auto_title_model: str = "openai:gpt-4.1-mini"


class SubagentConfig(BaseModel):
    model: str | None = None  # None = inherit from parent
    temperature: float | None = None
    max_tokens: int | None = None
    skills: list[str] = []
    custom_tools: list[str] = []


class RetrievalConfig(BaseModel):
    max_concurrency: int = 5


class CitationConfig(BaseModel):
    batch_size: int = 10
    max_concurrency: int = 5


class AgentConfig(BaseModel):
    model: str | None = None  # None = use llm_config default
    temperature: float | None = None
    max_tokens: int | None = None
    reasoning: bool = False
    reasoning_effort: str | None = None
    thinking_budget: int | None = None
    top_p: float | None = None
    top_k: int | None = None
    skills: list[str] = []
    custom_tools: list[str] = []
    subagents: dict[str, SubagentConfig] = {}


class AgentsConfig(BaseModel):
    chat: AgentConfig = AgentConfig()
    research: AgentConfig = AgentConfig()


class ObservabilityConfig(BaseModel):
    langsmith_enabled: bool = False


class AvailableModel(BaseModel):
    id: str
    display_name: str
    model_kwargs: dict = {}


class ResearchTaskConfig(BaseModel):
    max_worker_concurrency: int = 5


class AppConfig(BaseModel):
    llm_config: LLMConfig = LLMConfig()
    embedding_config: EmbeddingConfig = EmbeddingConfig()
    chroma_config: ChromaConfig = ChromaConfig()
    marker_config: MarkerConfig = MarkerConfig()
    openalex_config: OpenAlexConfig = OpenAlexConfig()
    arxiv_config: ArxivConfig = ArxivConfig()
    search_config: SearchConfig = SearchConfig()
    project_config: ProjectConfig = ProjectConfig()
    tree_config: TreeConfig = TreeConfig()
    chat_config: ChatConfig = ChatConfig()
    retrieval_config: RetrievalConfig = RetrievalConfig()
    citation_config: CitationConfig = CitationConfig()
    observability: ObservabilityConfig = ObservabilityConfig()
    agents: AgentsConfig = AgentsConfig()
    research_task_config: ResearchTaskConfig = ResearchTaskConfig()
    available_models: list[AvailableModel] = []


def load_config(config_path: str = None) -> AppConfig:
    if config_path is None:
        root = Path(__file__).parent.parent / "config.yaml"
        local = Path(__file__).parent / "config.yaml"
        if root.exists():
            config_path = root
        elif local.exists():
            config_path = local
        else:
            config_path = root
    config_path = Path(config_path)
    if config_path.exists():
        with open(config_path, "r") as f:
            raw = yaml.safe_load(f) or {}
        cfg = AppConfig(**raw)
    else:
        cfg = AppConfig()

    # Set Ollama base URL for both litellm and langchain integrations
    ollama_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    # litellm uses OLLAMA_API_BASE
    if not os.getenv("OLLAMA_API_BASE"):
        os.environ["OLLAMA_API_BASE"] = ollama_url

    return cfg


# Singleton
_config: AppConfig | None = None


def get_config() -> AppConfig:
    global _config
    if _config is None:
        _config = load_config()
    return _config