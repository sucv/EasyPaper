export interface PaperEntry {
  paper_id: string;
  title: string;
  authors: string[];
  year: number | null;
  venue: string | null;
  abstract: string | null;
  citation_count: number | null;
  source: 'accessible_db' | 'inaccessible_db' | 'arxiv' | 'user_provided';
  pdf_url: string | null;
  indexed: boolean;
}

export interface IdeaPaper {
  paper_id: string;
  title: string;
  authors: string[];
  year: number | null;
  venue: string | null;
  abstract: string | null;
  citation_count: number | null;
  source: string;
  pdf_url: string | null;
  status: 'pending' | 'indexed' | 'retrieved';
}

export interface ReportInfo {
  filename: string;
  display_name: string;
  path: string;
}

export interface IdeaState {
  idea_text: string;
  idea_slug: string;
  papers: IdeaPaper[];
  reports: ReportInfo[];
}

export interface ProjectState {
  project_id: string;
  indexed_papers: Record<string, any>;
  ideas: IdeaState[];
}

export interface SearchFilters {
  years: number[];
  venues: string[];
  accessible: boolean;
}

export interface WsEvent {
  type: string;
  [key: string]: any;
}

export interface BusyState {
  busy: boolean;
  operation: string | null;
  idea_slug: string | null;
}

export interface ChatSession {
  thread_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
  scope: string;
  token_usage: { prompt: number; completion: number };
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface UsageData {
  pdfs_indexed: number;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  by_operation: Record<string, { prompt_tokens: number; completion_tokens: number; calls: number }>;
}

export interface TaskConfig {
  task_id: string;
  display_name: string;
  description: string;
}

export interface ModelConfig {
  id: string;
  display_name: string;
  model_kwargs: Record<string, any>;
}