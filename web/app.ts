export type SnapshotLike = {
  generatedAt: string;
  staleAfterSec: number;
  runSummary: {
    runId: string;
    goal: string;
    status: string;
    autopilot?: {
      phase?: string;
      state?: string;
      qaResult?: string;
      qaCyclesCompleted?: number;
      qaMaxCycles?: number;
      validationRoundsCompleted?: number;
      validationMaxRounds?: number;
      approvals?: {
        architect?: string;
        security?: string;
        code?: string;
      };
    };
    metrics: {
      tasksTotal: number;
      tasksDone: number;
      proofsVerified: number;
    };
  };
  orgView: Array<{
    personaId: string;
    role: string;
    assignmentCount: number;
    objective: string;
    character?: {
      avatar: string;
      style: string;
      accentColor: string;
    };
    coordinates?: {
      xPct: number;
      yPct: number;
      zone: string;
      room: string;
    };
  }>;
  taskBoard: Array<{
    taskId: string;
    title: string;
    status: string;
    priority: string;
    ownerPersonaId: string;
    proofIds: string[];
  }>;
  commandFeed: Array<{
    eventId: string;
    command: string;
    actor: string;
    timestamp: string;
  }>;
  artifactPanel: Array<{
    proofId: string;
    taskId: string;
    uri: string;
    status: string;
    reasonCode: string;
  }>;
};

const SNAPSHOT_PATH = './data/snapshot.json';
const POLL_INTERVAL_MS = 30_000;
const MAX_REFRESH_LABEL_SECONDS = 120;

export function computeIsStale(snapshot: SnapshotLike, nowMs = Date.now()): boolean {
  const generatedMs = Date.parse(snapshot.generatedAt);
  if (Number.isNaN(generatedMs)) {
    return true;
  }
  return nowMs - generatedMs > snapshot.staleAfterSec * 1000;
}

function formatTimeAgo(timestamp: string, nowMs = Date.now()): string {
  const valueMs = Date.parse(timestamp);
  if (Number.isNaN(valueMs)) {
    return 'unknown update time';
  }

  const deltaSeconds = Math.max(0, Math.floor((nowMs - valueMs) / 1000));
  if (deltaSeconds < 5) {
    return 'just now';
  }

  if (deltaSeconds < 60) {
    return `${deltaSeconds}s ago`;
  }

  const deltaMinutes = Math.floor(deltaSeconds / 60);
  if (deltaMinutes < 60) {
    return `${deltaMinutes}m ago`;
  }

  const deltaHours = Math.floor(deltaMinutes / 60);
  return `${deltaHours}h ago`;
}

function updateRefreshMeta(
  stale: boolean,
  generatedAt: string,
  refreshSecRemaining: number,
  isError: boolean,
  docRoot: Document
): void {
  const staleBadge = docRoot.getElementById('stale-badge');
  if (staleBadge) {
    staleBadge.textContent = isError ? 'ERROR' : stale ? 'STALE' : 'LIVE';
    staleBadge.className = `badge ${isError ? 'error' : stale ? 'stale' : 'live'}`;
  }

  const refreshBadge = docRoot.getElementById('refresh-badge');
  if (refreshBadge) {
    refreshBadge.textContent = isError ? 'Auto refresh paused' : `Auto refresh in ${Math.max(0, refreshSecRemaining)}s`;
    refreshBadge.className = `meta-badge ${isError ? 'error' : ''}`;
  }

  const ageLabel = docRoot.getElementById('snapshot-age');
  if (ageLabel) {
    ageLabel.textContent = isError
      ? 'Snapshot load failed. Keeping last known state.'
      : `Snapshot updated ${formatTimeAgo(generatedAt)}.`;
  }
}

function remainingSeconds(nextAtMs: number, nowMs: number): number {
  return Math.max(0, Math.round((nextAtMs - nowMs) / 1000));
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const officeFloorZones = [
  { cssClass: 'zone-executive', label: 'Executive Suite' },
  { cssClass: 'zone-planning', label: 'Planning Room' },
  { cssClass: 'zone-engineering', label: 'Engineering Lab' },
  { cssClass: 'zone-build', label: 'Build Bay' },
  { cssClass: 'zone-ops', label: 'Ops NOC' }
] as const;
const accentColorPattern = /^#[0-9a-fA-F]{6}$/;
const roleProfileByRole: Record<
  string,
  {
    avatar: string;
    style: string;
    accentColor: string;
    zone: string;
    room: string;
    xPct: number;
    yPct: number;
  }
> = {
  CEO: {
    avatar: '👑',
    style: 'executive-luminary',
    accentColor: '#8b5cf6',
    zone: 'Executive Suite',
    room: 'Strategy Desk',
    xPct: 14,
    yPct: 18
  },
  CTO: {
    avatar: '🧠',
    style: 'systems-sage',
    accentColor: '#0ea5e9',
    zone: 'Engineering Lab',
    room: 'Architecture Pod',
    xPct: 34,
    yPct: 58
  },
  PM: {
    avatar: '🧭',
    style: 'roadmap-curator',
    accentColor: '#f59e0b',
    zone: 'Planning Room',
    room: 'Backlog Board',
    xPct: 70,
    yPct: 27
  },
  ENG: {
    avatar: '🛠️',
    style: 'build-artisan',
    accentColor: '#10b981',
    zone: 'Build Bay',
    room: 'Test Bench',
    xPct: 50,
    yPct: 74
  },
  OPS: {
    avatar: '🚀',
    style: 'mission-orchestrator',
    accentColor: '#ec4899',
    zone: 'Ops NOC',
    room: 'Publish Console',
    xPct: 82,
    yPct: 63
  }
};
const roleFlairByRole: Record<
  string,
  {
    flair: string;
    title: string;
    focus: string;
  }
> = {
  CEO: {
    flair: '✨',
    title: 'Executive Lead',
    focus: 'Strategy'
  },
  CTO: {
    flair: '🛰️',
    title: 'Systems Steward',
    focus: 'Architecture'
  },
  PM: {
    flair: '🗺️',
    title: 'Planning Captain',
    focus: 'Roadmap'
  },
  ENG: {
    flair: '⚙️',
    title: 'Implementation Ace',
    focus: 'Build'
  },
  OPS: {
    flair: '📡',
    title: 'Launch Commander',
    focus: 'Reliability'
  }
};

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function roleClassToken(role: string): string {
  return role.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-');
}

function safeString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function safeNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function sanitizeAccentColor(value: unknown, fallback: string): string {
  const candidate = safeString(value, fallback);
  return accentColorPattern.test(candidate) ? candidate : fallback;
}

function sanitizeCssTimeSeconds(value: number): string {
  const normalized = Math.max(0, Math.min(12, safeNumber(value, 0)));
  const rounded = Math.round(normalized * 100) / 100;
  return `${rounded}s`;
}

function buildSpriteInlineStyle(xPct: number, yPct: number, delaySec: number, accentColor: string): string {
  return `--x:${clampPercent(xPct)};--y:${clampPercent(yPct)};--delay:${sanitizeCssTimeSeconds(delaySec)};--accent:${sanitizeAccentColor(
    accentColor,
    '#64748b'
  )}`;
}

function defaultRoleProfile(role: string): (typeof roleProfileByRole)[string] {
  return roleProfileByRole[role] ?? {
    avatar: '🧑‍💻',
    style: 'team-specialist',
    accentColor: '#64748b',
    zone: 'Main Floor',
    room: 'Shared Desk',
    xPct: 50,
    yPct: 50
  };
}

function defaultRoleFlair(role: string): (typeof roleFlairByRole)[string] {
  return roleFlairByRole[role] ?? {
    flair: '🔹',
    title: 'Team Specialist',
    focus: 'Execution'
  };
}

function collectZoneLoad(snapshot: SnapshotLike): Array<{ label: string; count: number }> {
  const loadByZone = new Map<string, number>();

  for (const zone of officeFloorZones) {
    loadByZone.set(zone.label, 0);
  }

  const personas = Array.isArray(snapshot.orgView) ? snapshot.orgView : [];
  for (const persona of personas) {
    const normalized = normalizePersona(persona, 0);
    const zone = normalized.coordinates.zone;
    const current = loadByZone.get(zone) ?? 0;
    loadByZone.set(zone, current + 1);
  }

  return officeFloorZones.map((zone) => ({
    label: zone.label,
    count: loadByZone.get(zone.label) ?? 0
  }));
}

function normalizePersona(
  persona: SnapshotLike['orgView'][number],
  index: number
): Required<SnapshotLike['orgView'][number]> {
  const role = safeString(persona.role, 'WORKER');
  const profile = defaultRoleProfile(role);
  const fallbackX = clampPercent(profile.xPct + (index % 3) * 2);
  const fallbackY = clampPercent(profile.yPct + (index % 2) * 2);
  const coordinates = persona.coordinates;
  const character = persona.character;

  return {
    personaId: safeString(persona.personaId, `persona-${index + 1}`),
    role,
    assignmentCount: Math.max(0, Math.round(safeNumber(persona.assignmentCount, 0))),
    objective: safeString(persona.objective, 'No objective provided'),
    character: {
      avatar: safeString(character?.avatar, profile.avatar),
      style: safeString(character?.style, profile.style),
      accentColor: sanitizeAccentColor(character?.accentColor, profile.accentColor)
    },
    coordinates: {
      xPct: clampPercent(safeNumber(coordinates?.xPct, fallbackX)),
      yPct: clampPercent(safeNumber(coordinates?.yPct, fallbackY)),
      zone: safeString(coordinates?.zone, profile.zone),
      room: safeString(coordinates?.room, profile.room)
    }
  };
}

function normalizeSnapshot(raw: unknown): SnapshotLike {
  const fallback: SnapshotLike = {
    generatedAt: new Date().toISOString(),
    staleAfterSec: 300,
    runSummary: {
      runId: 'none',
      goal: 'No active run',
      status: 'stopped',
      autopilot: {
        phase: 'none',
        state: 'stale'
      },
      metrics: { tasksTotal: 0, tasksDone: 0, proofsVerified: 0 }
    },
    orgView: [],
    taskBoard: [],
    commandFeed: [],
    artifactPanel: []
  };

  if (!raw || typeof raw !== 'object') {
    return fallback;
  }

  const value = raw as Partial<SnapshotLike>;
  const rawRunSummary = value.runSummary ?? fallback.runSummary;
  const rawMetrics = rawRunSummary.metrics ?? fallback.runSummary.metrics;

  return {
    generatedAt: safeString(value.generatedAt, fallback.generatedAt),
    staleAfterSec: Math.max(1, Math.round(safeNumber(value.staleAfterSec, fallback.staleAfterSec))),
    runSummary: {
      runId: safeString(rawRunSummary.runId, fallback.runSummary.runId),
      goal: safeString(rawRunSummary.goal, fallback.runSummary.goal),
      status: safeString(rawRunSummary.status, fallback.runSummary.status),
      autopilot: typeof rawRunSummary.autopilot === 'object' && rawRunSummary.autopilot !== null ? rawRunSummary.autopilot : fallback.runSummary.autopilot,
      metrics: {
        tasksTotal: Math.max(0, Math.round(safeNumber(rawMetrics.tasksTotal, fallback.runSummary.metrics.tasksTotal))),
        tasksDone: Math.max(0, Math.round(safeNumber(rawMetrics.tasksDone, fallback.runSummary.metrics.tasksDone))),
        proofsVerified: Math.max(
          0,
          Math.round(safeNumber(rawMetrics.proofsVerified, fallback.runSummary.metrics.proofsVerified))
        )
      }
    },
    orgView: Array.isArray(value.orgView) ? value.orgView : fallback.orgView,
    taskBoard: Array.isArray(value.taskBoard) ? value.taskBoard : fallback.taskBoard,
    commandFeed: Array.isArray(value.commandFeed) ? value.commandFeed : fallback.commandFeed,
    artifactPanel: Array.isArray(value.artifactPanel) ? value.artifactPanel : fallback.artifactPanel
  };
}

export function renderRunSummary(snapshot: SnapshotLike): string {
  const metrics = snapshot.runSummary.metrics;
  return `
    <div class="card">
      <div><strong>${escapeHtml(snapshot.runSummary.runId)}</strong> — ${escapeHtml(snapshot.runSummary.status)}</div>
      <div>${escapeHtml(snapshot.runSummary.goal)}</div>
      <div class="row">
        <span>Tasks: ${metrics.tasksDone}/${metrics.tasksTotal}</span>
        <span>Verified proofs: ${metrics.proofsVerified}</span>
      </div>
    </div>
  `;
}

function renderVisibilityStream(snapshot: SnapshotLike, previousSnapshot: SnapshotLike | undefined): string {
  const stream: string[] = [];
  const latestEvent = snapshot.commandFeed[0];
  const currentDone = snapshot.runSummary.metrics.tasksDone;
  const previousDone = previousSnapshot?.runSummary.metrics.tasksDone ?? currentDone;
  const currentProofs = snapshot.artifactPanel.length;
  const previousProofs = previousSnapshot?.artifactPanel.length ?? currentProofs;
  const deltaDone = Math.max(0, currentDone - previousDone);
  const deltaProofs = Math.max(0, currentProofs - previousProofs);
  const busiestZone = collectZoneLoad(snapshot).sort((a, b) => b.count - a.count)[0];

  const autopilotState = snapshot.runSummary.autopilot;
  const phase = safeString(autopilotState?.phase, 'idle');
  const autopilotStatus = safeString(autopilotState?.state, 'untracked');
  stream.push(
    `<span class="visibility-line"><strong>Visibility:</strong> ${escapeHtml(phase)} phase · ${escapeHtml(autopilotStatus)}</span>`
  );

  if (latestEvent) {
    const actor = safeString(latestEvent.actor, 'system');
    const command = safeString(latestEvent.command, 'none');
    const at = formatTimeAgo(latestEvent.timestamp);
    stream.push(`<span class="visibility-line">Latest command ${escapeHtml(command)} by ${escapeHtml(actor)} (${at})</span>`);
  }

  if (deltaDone || deltaProofs) {
    const updates: string[] = [];
    if (deltaDone) {
      updates.push(`${deltaDone} task${deltaDone === 1 ? '' : 's'} completed`);
    }

    if (deltaProofs) {
      updates.push(`${deltaProofs} proof${deltaProofs === 1 ? '' : 's'} verified`);
    }

    stream.push(`<span class="visibility-line">Activity: ${updates.join(' · ')}</span>`);
  }

  const progressText = `${escapeHtml(String(currentDone))}/${escapeHtml(
    String(snapshot.runSummary.metrics.tasksTotal)
  )} done`;
  stream.push(`<span class="visibility-line">Run progress ${progressText}</span>`);

  stream.push(
    `<span class="visibility-line">Floor load: ${escapeHtml(busiestZone.label)} leading (${escapeHtml(String(busiestZone.count))})</span>`
  );

  return stream.join('');
}

export function renderOrgSprites(snapshot: SnapshotLike): string {
  const zonesMarkup = officeFloorZones
    .map(
      (zone) => `
      <div class="floor-zone ${zone.cssClass}">
        <span class="zone-label">${escapeHtml(zone.label)}</span>
      </div>
    `
    )
    .join('');

  const floorPlanMarkup = `
    <div class="floor-plan" aria-hidden="true">
      ${zonesMarkup}
      <div class="floor-corridor"></div>
    </div>
  `;

  const occupancyMarkup = `
    <div class="floor-occupancy">
      ${collectZoneLoad(snapshot)
        .map(
          (zone) => `
          <span class="occupancy-chip">${escapeHtml(zone.label)}: ${zone.count}</span>
        `
        )
        .join('')}
    </div>
  `;

  if (snapshot.orgView.length === 0) {
    return `${floorPlanMarkup}${occupancyMarkup}<div class="floor-empty">No active personas</div>`;
  }

  const spritesMarkup = snapshot.orgView
    .map(
      (persona, index) => {
        const normalizedPersona = normalizePersona(persona, index);
        const roleToken = roleClassToken(normalizedPersona.role);
        const roleFlair = defaultRoleFlair(normalizedPersona.role);
        const xPct = normalizedPersona.coordinates.xPct;
        const yPct = normalizedPersona.coordinates.yPct;
        const assignmentCountLabel = `${normalizedPersona.assignmentCount} assignment${
          normalizedPersona.assignmentCount === 1 ? '' : 's'
        }`;
        return `
      <div
        class="sprite sprite-role-${roleToken}"
        style="${buildSpriteInlineStyle(xPct, yPct, index * 0.16, normalizedPersona.character.accentColor)}"
      >
        <span class="sprite-aura" aria-hidden="true"></span>
        <span class="sprite-signature sprite-signature-${roleToken}" aria-hidden="true"></span>
        <span class="sprite-avatar-wrap">
          <span class="sprite-avatar" aria-hidden="true">${escapeHtml(normalizedPersona.character.avatar)}</span>
          <span class="sprite-flair" aria-hidden="true">${escapeHtml(roleFlair.flair)}</span>
        </span>
        <span class="sprite-nameplate">
          <span class="sprite-label">${escapeHtml(normalizedPersona.personaId)}</span>
          <span class="sprite-style-chip">${escapeHtml(normalizedPersona.character.style)}</span>
        </span>
        <span class="sprite-meta-row">
          <span class="sprite-role-chip">${escapeHtml(normalizedPersona.role)} · ${escapeHtml(roleFlair.title)}</span>
          <span class="sprite-focus-chip">${escapeHtml(roleFlair.focus)}</span>
          <span class="sprite-assignment-chip">${escapeHtml(assignmentCountLabel)}</span>
        </span>
        <span class="sprite-objective">${escapeHtml(normalizedPersona.objective)}</span>
        <span class="sprite-coordinates">
          📍 ${escapeHtml(normalizedPersona.coordinates.zone)} / ${escapeHtml(normalizedPersona.coordinates.room)} · (${xPct}, ${yPct})
        </span>
      </div>
    `;
      }
    )
    .join('');

  return `${floorPlanMarkup}${occupancyMarkup}<div class="sprite-layer">${spritesMarkup}</div>`;
}

export function renderTaskBoard(snapshot: SnapshotLike): string {
  if (snapshot.taskBoard.length === 0) {
    return '<div class="card">No tasks</div>';
  }
  return snapshot.taskBoard
    .map(
      (task) => `
      <div class="card">
        <strong>${escapeHtml(task.taskId)}</strong> ${escapeHtml(task.title)}
        <div>${escapeHtml(task.priority)} · ${escapeHtml(task.status)} · owner ${escapeHtml(task.ownerPersonaId)}</div>
        <div>proofs: ${task.proofIds.map(escapeHtml).join(', ') || 'none'}</div>
      </div>
    `
    )
    .join('');
}

export function renderCommandFeed(snapshot: SnapshotLike): string {
  if (snapshot.commandFeed.length === 0) {
    return '<div class="card">No command events yet</div>';
  }
  return snapshot.commandFeed
    .map(
      (event) => `
      <div class="card">
        <strong>${escapeHtml(event.command)}</strong> by ${escapeHtml(event.actor)}
        <div>${escapeHtml(event.eventId)} · ${escapeHtml(event.timestamp)}</div>
      </div>
    `
    )
    .join('');
}

export function renderArtifactPanel(snapshot: SnapshotLike): string {
  if (snapshot.artifactPanel.length === 0) {
    return '<div class="card">No artifacts yet</div>';
  }
  return snapshot.artifactPanel
    .map(
      (artifact) => `
      <div class="card">
        <strong>${escapeHtml(artifact.proofId)}</strong> (${escapeHtml(artifact.status)})
        <div>task ${escapeHtml(artifact.taskId)} · ${escapeHtml(artifact.reasonCode)}</div>
        <div>${escapeHtml(artifact.uri)}</div>
      </div>
    `
    )
    .join('');
}

export function renderSnapshot(snapshot: SnapshotLike, root: Document, previousSnapshot?: SnapshotLike): void {
  const isStale = computeIsStale(snapshot);
  const nextRefreshAt = Date.now() + POLL_INTERVAL_MS;
  updateRefreshMeta(isStale, snapshot.generatedAt, Math.min(MAX_REFRESH_LABEL_SECONDS, remainingSeconds(nextRefreshAt, Date.now())), false, root);

  const runSummary = root.getElementById('run-summary');
  if (runSummary) {
    runSummary.innerHTML = renderRunSummary(snapshot);
  }

  const officeFloor = root.getElementById('office-floor');
  if (officeFloor) {
    officeFloor.innerHTML = renderOrgSprites(snapshot);
  }

  const taskBoard = root.getElementById('task-board');
  if (taskBoard) {
    taskBoard.innerHTML = renderTaskBoard(snapshot);
  }

  const commandFeed = root.getElementById('command-feed');
  if (commandFeed) {
    commandFeed.innerHTML = renderCommandFeed(snapshot);
  }

  const artifactPanel = root.getElementById('artifact-panel');
  if (artifactPanel) {
    artifactPanel.innerHTML = renderArtifactPanel(snapshot);
  }

  const visibilityChannel = root.getElementById('visibility-channel');
  if (visibilityChannel) {
    visibilityChannel.innerHTML = `<div class="visibility-headline">Investor Visibility Channel</div><div class="visibility-stream">${renderVisibilityStream(
      snapshot,
      previousSnapshot
    )}</div>`;
  }
}

export async function boot(): Promise<void> {
  let latestSnapshot: SnapshotLike | undefined;
  let previousSnapshot: SnapshotLike | undefined;
  let nextRefreshAt = Date.now() + POLL_INTERVAL_MS;

  const refresh = async (): Promise<void> => {
    try {
      const response = await fetch(SNAPSHOT_PATH, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`Failed to load snapshot: ${response.status}`);
      }

      const snapshot = normalizeSnapshot(await response.json());
      latestSnapshot = snapshot;
      nextRefreshAt = Date.now() + POLL_INTERVAL_MS;
      renderSnapshot(snapshot, document, previousSnapshot);
      previousSnapshot = snapshot;
    } catch {
      if (!latestSnapshot) {
        throw new Error('Failed to load snapshot and no previous snapshot exists.');
      }

      updateRefreshMeta(true, latestSnapshot.generatedAt, remainingSeconds(nextRefreshAt, Date.now()), true, document);
    }
  };

  const refreshLabel = (): void => {
    if (!latestSnapshot) {
      return;
    }

    const isStale = computeIsStale(latestSnapshot);
    const remaining = remainingSeconds(nextRefreshAt, Date.now());
    updateRefreshMeta(isStale, latestSnapshot.generatedAt, Math.min(MAX_REFRESH_LABEL_SECONDS, remaining), false, document);
  };

  await refresh();
  setInterval(() => {
    void refresh();
  }, POLL_INTERVAL_MS);
  setInterval(() => {
    refreshLabel();
  }, 1000);
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  void boot();
}
