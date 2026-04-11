# Changelog

## v0.3.0

### Added
- Better usage summary panel for approximating the cost.
- Better dialog for Download, Retrieve, and Run Task buttons. For Retrieve button, user can see the page numbers of PDFs, view each PDFs, and decide the page range for the OCR.
- The latest 15 queries are preserved after page reloaded or server restarted.

## v0.2.0

### Removed
- Removed the Agent/Subagent for each research panel, since the autonomous agent is not able to choose the correct skills and tools for the task. 
- Disabled the Chat Agent from accessing research report and retrieval files. Now the Chat Agent is a pure RAG chatbot on indexed papers.

### Added
- Defined deterministic LangGraph nodes as the research agent, with the tasks in `/tasks` to do exactly what I want.
- Add the shimmer loading effect for multiple widgets so that when the app launched, user would know there is a loading phase.