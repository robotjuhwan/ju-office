import { readFile } from 'node:fs/promises';

import { taskPrioritySchema } from '../contracts/task.contract.js';

interface PlannerTemplate {
  templateId: string;
  title: string;
  description: string;
  priority: string;
}

interface PlannerTemplatesConfig {
  baseTemplates: PlannerTemplate[];
}

interface KeywordRule {
  keyword: string;
  templates: PlannerTemplate[];
}

interface KeywordRulesConfig {
  rules: KeywordRule[];
}

export interface PlannedTaskSeed {
  templateId: string;
  title: string;
  description: string;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
}

export async function buildPlanSeeds(goal: string, templatesFilePath: string, keywordRulesFilePath: string): Promise<PlannedTaskSeed[]> {
  const templatesConfig = JSON.parse(await readFile(templatesFilePath, 'utf8')) as PlannerTemplatesConfig;
  const keywordConfig = JSON.parse(await readFile(keywordRulesFilePath, 'utf8')) as KeywordRulesConfig;

  const seeds: PlannedTaskSeed[] = [];
  const seen = new Set<string>();

  const tryPush = (template: PlannerTemplate): void => {
    if (seen.has(template.templateId)) {
      return;
    }
    const priority = taskPrioritySchema.parse(template.priority);
    seeds.push({
      templateId: template.templateId,
      title: template.title,
      description: template.description,
      priority
    });
    seen.add(template.templateId);
  };

  for (const baseTemplate of templatesConfig.baseTemplates) {
    tryPush(baseTemplate);
  }

  const normalizedGoal = goal.toLowerCase();
  for (const rule of keywordConfig.rules) {
    if (normalizedGoal.includes(rule.keyword.toLowerCase())) {
      for (const template of rule.templates) {
        tryPush(template);
      }
    }
  }

  return seeds;
}
