# Changelog

## v0.2.0

### Removed
- Removed the Agent/Subagent for each research panel, since the autonomous agent is not able to choose the correct skills and tools for the task. 
- Disabled the Chat Agent from accessing research report and retrieval files. Now the Chat Agent is a pure RAG chatbot on indexed papers.

### Added
- Defined deterministic LangGraph nodes as the research agent, with the tasks in `/tasks` to do exactly what I want.
- Add the shimmer loading effect for multiple widgets so that when the app launched, user would know there is a loading phase.