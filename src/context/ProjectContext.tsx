import React, { createContext, useContext, useState, useEffect } from 'react';
import { Project } from '../types';
import { MOCK_PROJECTS } from '../constants';

interface ProjectContextType {
  projects: Project[];
  forkProject: (parentId: string, newMetadata: Partial<Project>, customRecipe: any) => void;
  getProject: (owner: string, name: string) => Project | undefined;
  updateProject: (id: string, updates: Partial<Project>) => void;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const [projects, setProjects] = useState<Project[]>(() => {
    if (typeof window === 'undefined') return MOCK_PROJECTS;
    try {
      const saved = localStorage.getItem('opensoyce-projects');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error('Failed to load projects:', e);
    }
    return MOCK_PROJECTS;
  });

  const saveProjects = (newProjects: Project[]) => {
    setProjects(newProjects);
    if (typeof window !== 'undefined') {
      localStorage.setItem('opensoyce-projects', JSON.stringify(newProjects));
    }
  };

  const updateProject = (id: string, updates: Partial<Project>) => {
    saveProjects(projects.map(p => p.id === id ? { ...p, ...updates } : p));
  };

  const getProject = (owner: string, name: string) => {
    return projects.find(p => p.owner.toLowerCase() === owner.toLowerCase() && p.name.toLowerCase() === name.toLowerCase());
  };

  const forkProject = (parentId: string, newMetadata: Partial<Project>, customRecipe: any) => {
    const parent = projects.find(p => p.id === parentId);
    if (!parent) return;

    const newFork: Project = {
      ...parent,
      ...newMetadata,
      id: `fork-${Date.now()}`,
      parentId: parent.id,
      parentName: parent.name,
      parentOwner: parent.owner,
      isFork: true,
      lastScanned: 'Just now',
      status: 'Unverified',
      stars: 0,
      forks: 0,
      customRecipe: customRecipe
    };

    saveProjects([...projects, newFork]);
  };

  return (
    <ProjectContext.Provider value={{ projects, forkProject, getProject, updateProject }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProjects() {
  const context = useContext(ProjectContext);
  if (context === undefined) {
    throw new Error('useProjects must be used within a ProjectProvider');
  }
  return context;
}
