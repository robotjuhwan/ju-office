import type { Persona } from '../types/run.js';

export function buildDefaultPersonas(): Persona[] {
  return [
    {
      id: 'ceo-001',
      role: 'CEO',
      model: 'gpt-5.3-codex',
      specialty: 'Strategy and prioritization',
      objective: 'Convert investor goals into executable plans and prove outcomes'
    },
    {
      id: 'cto-001',
      role: 'CTO',
      model: 'gpt-5.3-codex-spark',
      specialty: 'Architecture and technical risk',
      objective: 'Own technical execution quality and delivery velocity'
    },
    {
      id: 'pm-001',
      role: 'PM',
      model: 'gpt-5.3-codex-spark',
      specialty: 'Product scoping and sequencing',
      objective: 'Maintain backlog clarity and investor-aligned priorities'
    },
    {
      id: 'eng-001',
      role: 'ENG',
      model: 'gpt-5.3-codex-spark',
      specialty: 'Implementation and testing',
      objective: 'Ship deterministic code and validated artifacts'
    },
    {
      id: 'ops-001',
      role: 'OPS',
      model: 'gpt-5.3-codex-spark',
      specialty: 'Delivery operations and publishing',
      objective: 'Maintain docs pipeline and office visibility for investor'
    }
  ];
}

export function workerPersonaIds(): string[] {
  return ['cto-001', 'pm-001', 'eng-001', 'ops-001'];
}
