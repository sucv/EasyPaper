export interface Paper {
  paper_id: string;
  title: string;
  authors: string[];
  year: number | null;
  venue: string | null;
  abstract: string | null;
  citation_count: number | null;
  source: string;
  pdf_url: string | null;
  indexed: boolean;
  status: string;
}

export interface ReportInfo {
  filename: string;
  display_name: string;
  path: string;
}

export interface IdeaState {
  idea_text: string;
  idea_slug: string;
  papers: Paper[];
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
  pages_processed: number;
  pdfs_processed: number;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  by_operation: Record<string, { prompt_tokens: number; completion_tokens: number; calls: number }>;
  by_model: Record<string, {
    prompt_tokens: number;
    completion_tokens: number;
    calls: number;
    input_price_per_1m: number;
    output_price_per_1m: number;
  }>;
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
  input_price_per_1m: number;
  output_price_per_1m: number;
}