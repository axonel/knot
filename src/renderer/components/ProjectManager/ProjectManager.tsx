import React, { useState, useEffect, useCallback } from 'react';
import type { Project } from '../../../shared/types.js';
import { ProjectList } from './ProjectList.js';
import { ProjectDetail } from './ProjectDetail.js';
import { SessionDetail } from './SessionDetail.js';

export const ProjectManager: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    try {
      setIsLoading(true);
      const list = await window.knotApi?.projects.list(true);
      setProjects(list || []);
    } catch (err: unknown) {
      console.error('Failed to fetch projects:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const selectedProject = projects.find((p) => p.id === selectedProjectId) || null;

  if (selectedProjectId && selectedSessionId) {
    return (
      <SessionDetail
        sessionId={selectedSessionId}
        onBack={() => setSelectedSessionId(null)}
        onSessionUpdated={fetchProjects}
      />
    );
  }

  if (selectedProjectId && selectedProject) {
    return (
      <ProjectDetail
        project={selectedProject}
        onBack={() => {
          setSelectedProjectId(null);
          setSelectedSessionId(null);
        }}
        onSelectSession={(sessId) => setSelectedSessionId(sessId)}
        onProjectUpdated={fetchProjects}
      />
    );
  }

  return (
    <ProjectList
      projects={projects}
      isLoading={isLoading}
      onSelectProject={(projId) => {
        setSelectedProjectId(projId);
        setSelectedSessionId(null);
      }}
      onRefresh={fetchProjects}
    />
  );
};
