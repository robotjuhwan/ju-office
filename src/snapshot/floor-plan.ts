import type { Persona } from '../types/run.js';

export interface PersonaCharacterProfile {
  avatar: string;
  style: string;
  accentColor: string;
}

export interface PersonaCoordinatesProfile {
  xPct: number;
  yPct: number;
  zone: string;
  room: string;
}

export interface PersonaFloorProfile {
  character: PersonaCharacterProfile;
  coordinates: PersonaCoordinatesProfile;
}

type PersonaRole = Persona['role'];

const roleFloorProfiles: Record<PersonaRole, PersonaFloorProfile> = {
  CEO: {
    character: { avatar: '👑', style: 'executive-luminary', accentColor: '#8b5cf6' },
    coordinates: { xPct: 16, yPct: 18, zone: 'Executive Suite', room: 'Strategy Desk' }
  },
  CTO: {
    character: { avatar: '🧠', style: 'systems-sage', accentColor: '#0ea5e9' },
    coordinates: { xPct: 34, yPct: 62, zone: 'Engineering Lab', room: 'Architecture Pod' }
  },
  PM: {
    character: { avatar: '🧭', style: 'roadmap-curator', accentColor: '#f59e0b' },
    coordinates: { xPct: 70, yPct: 28, zone: 'Planning Room', room: 'Backlog Board' }
  },
  ENG: {
    character: { avatar: '🛠️', style: 'build-artisan', accentColor: '#10b981' },
    coordinates: { xPct: 52, yPct: 76, zone: 'Build Bay', room: 'Test Bench' }
  },
  OPS: {
    character: { avatar: '🚀', style: 'mission-orchestrator', accentColor: '#ec4899' },
    coordinates: { xPct: 84, yPct: 64, zone: 'Ops NOC', room: 'Publish Console' }
  }
};

const explicitFloorProfilesByRoleAndId: Record<string, PersonaFloorProfile> = {
  'CEO:ceo-001': {
    character: { avatar: '👑', style: 'executive-luminary', accentColor: '#8b5cf6' },
    coordinates: { xPct: 14, yPct: 18, zone: 'Executive Suite', room: 'Strategy Desk' }
  },
  'CTO:cto-001': {
    character: { avatar: '🧠', style: 'systems-sage', accentColor: '#0ea5e9' },
    coordinates: { xPct: 34, yPct: 58, zone: 'Engineering Lab', room: 'Architecture Pod' }
  },
  'PM:pm-001': {
    character: { avatar: '🧭', style: 'roadmap-curator', accentColor: '#f59e0b' },
    coordinates: { xPct: 70, yPct: 27, zone: 'Planning Room', room: 'Backlog Board' }
  },
  'ENG:eng-001': {
    character: { avatar: '🛠️', style: 'build-artisan', accentColor: '#10b981' },
    coordinates: { xPct: 50, yPct: 74, zone: 'Build Bay', room: 'Test Bench' }
  },
  'OPS:ops-001': {
    character: { avatar: '🚀', style: 'mission-orchestrator', accentColor: '#ec4899' },
    coordinates: { xPct: 82, yPct: 63, zone: 'Ops NOC', room: 'Publish Console' }
  }
};

function clampPct(value: number): number {
  return Math.max(4, Math.min(96, Math.round(value)));
}

function stableHash(seed: string): number {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function deterministicOffset(seed: string): number {
  return (stableHash(seed) % 7) - 3;
}

function cloneProfile(profile: PersonaFloorProfile): PersonaFloorProfile {
  return {
    character: { ...profile.character },
    coordinates: { ...profile.coordinates }
  };
}

function profileKey(role: PersonaRole, personaId: string): string {
  return `${role}:${personaId}`;
}

function buildFallbackProfile(role: PersonaRole, personaId: string): PersonaFloorProfile {
  const base = roleFloorProfiles[role];
  const xOffset = deterministicOffset(`${profileKey(role, personaId)}:x`);
  const yOffset = deterministicOffset(`${profileKey(role, personaId)}:y`);

  return {
    character: { ...base.character },
    coordinates: {
      ...base.coordinates,
      xPct: clampPct(base.coordinates.xPct + xOffset),
      yPct: clampPct(base.coordinates.yPct + yOffset)
    }
  };
}

export function resolvePersonaFloorProfile(personaId: string, role: PersonaRole): PersonaFloorProfile {
  const explicit = explicitFloorProfilesByRoleAndId[profileKey(role, personaId)];
  if (explicit) {
    return cloneProfile(explicit);
  }

  return buildFallbackProfile(role, personaId);
}
