import { skillLoader } from './skill-loader';
import type { SkillDefinition } from '../../shared/types';

export function getSkillRegistry(): SkillDefinition[] {
  return skillLoader.getAll();
}

export function getSkillById(id: string): SkillDefinition | undefined {
  return skillLoader.getById(id);
}

export function getSkillsByCategory(category: string): SkillDefinition[] {
  return skillLoader.getByCategory(category);
}

export function searchSkills(query: string): SkillDefinition[] {
  return skillLoader.search(query);
}
