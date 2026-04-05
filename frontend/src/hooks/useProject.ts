import { useState, useCallback } from 'react';
import type { ProjectState } from '../types';

const API = '/api';

export function useProject() {
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectState, setProjectState] = useState<ProjectState | null>(null);
  const [projects, setProjects] = useState<string[]>([]);

  const fetchProjects = useCallback(async () => {
    const res = await fetch(`${API}/projects`);
    const data = await res.json();
    setProjects(data.projects || []);
  }, []);

  const createProject = useCallback(async (name?: string) => {
    const res = await fetch(`${API}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(name ? { name } : {}),
    });
    const data = await res.json();
    setProjectId(data.project_id);
    await fetchProjects();
    return data.project_id;
  }, [fetchProjects]);

  const loadProject = useCallback(async (pid: string) => {
    setProjectId(pid);
    const res = await fetch(`${API}/projects/${pid}`);
    const data = await res.json();
    setProjectState(data);
    return data;
  }, []);

  const refreshProject = useCallback(async () => {
    if (!projectId) return;
    await loadProject(projectId);
  }, [projectId, loadProject]);

  return {
    projectId, setProjectId, projectState, projects,
    fetchProjects, createProject, loadProject, refreshProject,
  };
}