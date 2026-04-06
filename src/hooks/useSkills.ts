import { useState, useEffect, useCallback, useMemo } from 'react';
import { listBuildorSkills } from '@/utils/commands/skills';
import { listProjectSkills } from '@/utils/commands/skills';
import type { BuildorSkill, ProjectSkill } from '@/types/skill';
import type { ActiveSkillDescription } from '@/utils/buildSystemPrompt';
import { buildorEvents } from '@/utils/buildorEvents';

interface UseSkillsOptions {
  repoPath?: string;
  projectName?: string;
}

interface UseSkillsResult {
  buildorSkills: BuildorSkill[];
  projectSkills: ProjectSkill[];
  filteredBuildorSkills: BuildorSkill[];
  filteredProjectSkills: ProjectSkill[];
  activeEyeballs: Set<string>;
  activeSkillDescriptions: ActiveSkillDescription[];
  toggleEyeball: (name: string) => void;
  search: (query: string) => void;
  searchQuery: string;
  loading: boolean;
  refresh: () => void;
}

const EYEBALL_STORAGE_KEY = 'buildor-active-eyeballs';

function loadPersistedEyeballs(projectName: string): Set<string> {
  try {
    const raw = localStorage.getItem(`${EYEBALL_STORAGE_KEY}:${projectName}`);
    if (raw) return new Set(JSON.parse(raw));
  } catch { /* ignore */ }
  return new Set();
}

function persistEyeballs(projectName: string, eyeballs: Set<string>) {
  try {
    localStorage.setItem(`${EYEBALL_STORAGE_KEY}:${projectName}`, JSON.stringify([...eyeballs]));
  } catch { /* ignore */ }
}

export function useSkills({ repoPath, projectName }: UseSkillsOptions): UseSkillsResult {
  const [buildorSkills, setBuildorSkills] = useState<BuildorSkill[]>([]);
  const [projectSkills, setProjectSkills] = useState<ProjectSkill[]>([]);
  const [activeEyeballs, setActiveEyeballs] = useState<Set<string>>(() =>
    loadPersistedEyeballs(projectName || '')
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);

  const loadSkills = useCallback(async () => {
    setLoading(true);
    try {
      const [buildor, project] = await Promise.all([
        listBuildorSkills().catch(() => [] as BuildorSkill[]),
        repoPath ? listProjectSkills(repoPath).catch(() => [] as ProjectSkill[]) : Promise.resolve([] as ProjectSkill[]),
      ]);
      setBuildorSkills(buildor);
      setProjectSkills(project);
    } finally {
      setLoading(false);
    }
  }, [repoPath]);

  // Load on mount and when repoPath changes
  useEffect(() => {
    loadSkills();
  }, [loadSkills]);

  // Reload persisted eyeballs when project changes
  useEffect(() => {
    setActiveEyeballs(loadPersistedEyeballs(projectName || ''));
  }, [projectName]);

  // Re-fetch skills after a sync (shared skills repo pull)
  useEffect(() => {
    const handler = (event: { data: unknown }) => {
      const data = event.data as { reason?: string };
      if (data?.reason === 'sync') {
        loadSkills();
      }
    };
    buildorEvents.on('skill-activated', handler);
    return () => { buildorEvents.off('skill-activated', handler); };
  }, [loadSkills]);

  const toggleEyeball = useCallback((name: string) => {
    setActiveEyeballs((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      persistEyeballs(projectName || '', next);
      return next;
    });
  }, [projectName]);

  const search = useCallback((query: string) => {
    setSearchQuery(query);
  }, []);

  // Filter by scope: general skills always visible, project skills only when matching
  const scopedBuildorSkills = useMemo(() => {
    return buildorSkills.filter((s) => {
      if (!s.scope || s.scope === 'general') return true;
      if (s.scope === 'project' && s.projects && projectName) {
        return s.projects.includes(projectName);
      }
      return false;
    });
  }, [buildorSkills, projectName]);

  const filteredBuildorSkills = useMemo(() => {
    if (!searchQuery) return scopedBuildorSkills;
    const q = searchQuery.toLowerCase();
    return scopedBuildorSkills.filter((s) =>
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.tags?.some((t) => t.toLowerCase().includes(q))
    );
  }, [scopedBuildorSkills, searchQuery]);

  const filteredProjectSkills = useMemo(() => {
    if (!searchQuery) return projectSkills;
    const q = searchQuery.toLowerCase();
    return projectSkills.filter((s) =>
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q)
    );
  }, [projectSkills, searchQuery]);

  // Resolve active eyeball skills to their descriptions for system prompt injection
  const activeSkillDescriptions = useMemo((): ActiveSkillDescription[] => {
    if (activeEyeballs.size === 0) return [];
    return buildorSkills
      .filter((s) => activeEyeballs.has(s.name))
      .map((s) => ({ name: s.name, description: s.description, skillDir: s.skillDir }));
  }, [buildorSkills, activeEyeballs]);

  return {
    buildorSkills,
    projectSkills,
    filteredBuildorSkills,
    filteredProjectSkills,
    activeEyeballs,
    activeSkillDescriptions,
    toggleEyeball,
    search,
    searchQuery,
    loading,
    refresh: loadSkills,
  };
}
