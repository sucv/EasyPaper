export type WsEventType =
  | 'download_progress'
  | 'download_complete'
  | 'index_progress'
  | 'index_complete'
  | 'index_error'
  | 'retrieve_progress'
  | 'retrieve_complete'
  | 'research_progress'
  | 'research_complete'
  | 'chat_status'
  | 'chat_response'
  | 'busy_state'
  | 'error';