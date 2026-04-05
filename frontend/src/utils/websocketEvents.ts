export type WsEventType =
  | 'index_progress'
  | 'index_complete'
  | 'index_error'
  | 'retrieve_progress'
  | 'retrieve_complete'
  | 'research_progress'
  | 'research_complete'
  | 'busy_state'
  | 'error';