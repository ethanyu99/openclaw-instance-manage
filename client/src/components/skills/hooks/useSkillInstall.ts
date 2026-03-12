import { useState, useCallback } from 'react';
import {
  fetchSkillRegistry, fetchInstanceSkills, installSkills, uninstallSkills,
  installRemoteSkill,
} from '@/lib/api';
import type { RemoteSkill } from '@/lib/api';
import type { SkillDefinition } from '@shared/types';

type OperationState = Record<string, 'installing' | 'uninstalling' | 'success' | 'error'>;

export function useSkillInstall(instanceId: string) {
  const [registry, setRegistry] = useState<SkillDefinition[]>([]);
  const [installedIds, setInstalledIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [opState, setOpState] = useState<OperationState>({});

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [registryRes, installedRes] = await Promise.all([
        fetchSkillRegistry(),
        fetchInstanceSkills(instanceId),
      ]);
      setRegistry(registryRes.skills);
      setInstalledIds(new Set(installedRes.skills.map(s => s.id)));
    } catch (err) {
      console.error('Failed to load skills data:', err);
    } finally {
      setLoading(false);
    }
  }, [instanceId]);

  const clearOpState = useCallback((id: string) => {
    setTimeout(() => {
      setOpState(prev => {
        const next = { ...prev };
        if (next[id] === 'success' || next[id] === 'error') delete next[id];
        return next;
      });
    }, 2000);
  }, []);

  const handleInstall = useCallback(async (skillId: string) => {
    setOpState(prev => ({ ...prev, [skillId]: 'installing' }));
    try {
      const result = await installSkills(instanceId, [skillId]);
      if (result.succeeded > 0) {
        setInstalledIds(prev => new Set([...prev, skillId]));
        setOpState(prev => ({ ...prev, [skillId]: 'success' }));
      } else {
        setOpState(prev => ({ ...prev, [skillId]: 'error' }));
      }
    } catch {
      setOpState(prev => ({ ...prev, [skillId]: 'error' }));
    }
    clearOpState(skillId);
  }, [instanceId, clearOpState]);

  const handleUninstall = useCallback(async (skillId: string) => {
    setOpState(prev => ({ ...prev, [skillId]: 'uninstalling' }));
    try {
      const result = await uninstallSkills(instanceId, [skillId]);
      if (result.succeeded > 0) {
        setInstalledIds(prev => {
          const next = new Set(prev);
          next.delete(skillId);
          return next;
        });
        setOpState(prev => ({ ...prev, [skillId]: 'success' }));
      } else {
        setOpState(prev => ({ ...prev, [skillId]: 'error' }));
      }
    } catch {
      setOpState(prev => ({ ...prev, [skillId]: 'error' }));
    }
    clearOpState(skillId);
  }, [instanceId, clearOpState]);

  const handleInstallAll = useCallback(async (skillIds: string[]) => {
    if (skillIds.length === 0) return;
    for (const id of skillIds) setOpState(prev => ({ ...prev, [id]: 'installing' }));
    try {
      const result = await installSkills(instanceId, skillIds);
      const succeeded = new Set(result.results.filter(r => r.success).map(r => r.skillId));
      setInstalledIds(prev => new Set([...prev, ...succeeded]));
      for (const id of skillIds) setOpState(prev => ({ ...prev, [id]: succeeded.has(id) ? 'success' : 'error' }));
    } catch {
      for (const id of skillIds) setOpState(prev => ({ ...prev, [id]: 'error' }));
    }
    setTimeout(() => {
      setOpState(prev => {
        const next = { ...prev };
        for (const id of skillIds) {
          if (next[id] === 'success' || next[id] === 'error') delete next[id];
        }
        return next;
      });
    }, 2000);
  }, [instanceId]);

  const handleRemoteInstall = useCallback(async (skill: RemoteSkill) => {
    setOpState(prev => ({ ...prev, [skill.slug]: 'installing' }));
    try {
      const result = await installRemoteSkill(instanceId, skill.slug, skill.name, skill.githubUrl);
      if (result.success) {
        setInstalledIds(prev => new Set([...prev, skill.slug]));
        setOpState(prev => ({ ...prev, [skill.slug]: 'success' }));
      } else {
        setOpState(prev => ({ ...prev, [skill.slug]: 'error' }));
      }
    } catch {
      setOpState(prev => ({ ...prev, [skill.slug]: 'error' }));
    }
    clearOpState(skill.slug);
  }, [instanceId, clearOpState]);

  const reset = useCallback(() => {
    setOpState({});
  }, []);

  return {
    registry,
    installedIds,
    loading,
    opState,
    loadData,
    handleInstall,
    handleUninstall,
    handleInstallAll,
    handleRemoteInstall,
    reset,
  };
}
