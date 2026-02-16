export function computeIsStale(snapshot, nowMs = Date.now()) {
    const generatedMs = Date.parse(snapshot.generatedAt);
    if (Number.isNaN(generatedMs)) {
        return true;
    }
    return nowMs - generatedMs > snapshot.staleAfterSec * 1000;
}
function escapeHtml(value) {
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
];
const accentColorPattern = /^#[0-9a-fA-F]{6}$/;
const roleProfileByRole = {
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
const roleFlairByRole = {
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
function clampPercent(value) {
    return Math.max(0, Math.min(100, Math.round(value)));
}
function roleClassToken(role) {
    return role.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-');
}
function safeString(value, fallback) {
    return typeof value === 'string' && value.length > 0 ? value : fallback;
}
function safeNumber(value, fallback) {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
function sanitizeAccentColor(value, fallback) {
    const candidate = safeString(value, fallback);
    return accentColorPattern.test(candidate) ? candidate : fallback;
}
function sanitizeCssTimeSeconds(value) {
    const normalized = Math.max(0, Math.min(12, safeNumber(value, 0)));
    const rounded = Math.round(normalized * 100) / 100;
    return `${rounded}s`;
}
function buildSpriteInlineStyle(xPct, yPct, delaySec, accentColor) {
    return `--x:${clampPercent(xPct)};--y:${clampPercent(yPct)};--delay:${sanitizeCssTimeSeconds(delaySec)};--accent:${sanitizeAccentColor(accentColor, '#64748b')}`;
}
function defaultRoleProfile(role) {
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
function defaultRoleFlair(role) {
    return roleFlairByRole[role] ?? {
        flair: '🔹',
        title: 'Team Specialist',
        focus: 'Execution'
    };
}
function normalizePersona(persona, index) {
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
function normalizeSnapshot(raw) {
    const fallback = {
        generatedAt: new Date().toISOString(),
        staleAfterSec: 300,
        runSummary: {
            runId: 'none',
            goal: 'No active run',
            status: 'stopped',
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
    const value = raw;
    const rawRunSummary = value.runSummary ?? fallback.runSummary;
    const rawMetrics = rawRunSummary.metrics ?? fallback.runSummary.metrics;
    return {
        generatedAt: safeString(value.generatedAt, fallback.generatedAt),
        staleAfterSec: Math.max(1, Math.round(safeNumber(value.staleAfterSec, fallback.staleAfterSec))),
        runSummary: {
            runId: safeString(rawRunSummary.runId, fallback.runSummary.runId),
            goal: safeString(rawRunSummary.goal, fallback.runSummary.goal),
            status: safeString(rawRunSummary.status, fallback.runSummary.status),
            metrics: {
                tasksTotal: Math.max(0, Math.round(safeNumber(rawMetrics.tasksTotal, fallback.runSummary.metrics.tasksTotal))),
                tasksDone: Math.max(0, Math.round(safeNumber(rawMetrics.tasksDone, fallback.runSummary.metrics.tasksDone))),
                proofsVerified: Math.max(0, Math.round(safeNumber(rawMetrics.proofsVerified, fallback.runSummary.metrics.proofsVerified)))
            }
        },
        orgView: Array.isArray(value.orgView) ? value.orgView : fallback.orgView,
        taskBoard: Array.isArray(value.taskBoard) ? value.taskBoard : fallback.taskBoard,
        commandFeed: Array.isArray(value.commandFeed) ? value.commandFeed : fallback.commandFeed,
        artifactPanel: Array.isArray(value.artifactPanel) ? value.artifactPanel : fallback.artifactPanel
    };
}
export function renderRunSummary(snapshot) {
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
export function renderOrgSprites(snapshot) {
    const zonesMarkup = officeFloorZones
        .map((zone) => `
      <div class="floor-zone ${zone.cssClass}">
        <span class="zone-label">${escapeHtml(zone.label)}</span>
      </div>
    `)
        .join('');
    const floorPlanMarkup = `
    <div class="floor-plan" aria-hidden="true">
      ${zonesMarkup}
      <div class="floor-corridor"></div>
    </div>
  `;
    if (snapshot.orgView.length === 0) {
        return `${floorPlanMarkup}<div class="floor-empty">No active personas</div>`;
    }
    const spritesMarkup = snapshot.orgView
        .map((persona, index) => {
        const normalizedPersona = normalizePersona(persona, index);
        const roleFlair = defaultRoleFlair(normalizedPersona.role);
        const xPct = normalizedPersona.coordinates.xPct;
        const yPct = normalizedPersona.coordinates.yPct;
        const assignmentCountLabel = `${normalizedPersona.assignmentCount} assignment${normalizedPersona.assignmentCount === 1 ? '' : 's'}`;
        return `
      <div
        class="sprite sprite-role-${roleClassToken(normalizedPersona.role)}"
        style="${buildSpriteInlineStyle(xPct, yPct, index * 0.16, normalizedPersona.character.accentColor)}"
      >
        <span class="sprite-aura" aria-hidden="true"></span>
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
    })
        .join('');
    return `${floorPlanMarkup}<div class="sprite-layer">${spritesMarkup}</div>`;
}
export function renderTaskBoard(snapshot) {
    if (snapshot.taskBoard.length === 0) {
        return '<div class="card">No tasks</div>';
    }
    return snapshot.taskBoard
        .map((task) => `
      <div class="card">
        <strong>${escapeHtml(task.taskId)}</strong> ${escapeHtml(task.title)}
        <div>${escapeHtml(task.priority)} · ${escapeHtml(task.status)} · owner ${escapeHtml(task.ownerPersonaId)}</div>
        <div>proofs: ${task.proofIds.map(escapeHtml).join(', ') || 'none'}</div>
      </div>
    `)
        .join('');
}
export function renderCommandFeed(snapshot) {
    if (snapshot.commandFeed.length === 0) {
        return '<div class="card">No command events yet</div>';
    }
    return snapshot.commandFeed
        .map((event) => `
      <div class="card">
        <strong>${escapeHtml(event.command)}</strong> by ${escapeHtml(event.actor)}
        <div>${escapeHtml(event.eventId)} · ${escapeHtml(event.timestamp)}</div>
      </div>
    `)
        .join('');
}
export function renderArtifactPanel(snapshot) {
    if (snapshot.artifactPanel.length === 0) {
        return '<div class="card">No artifacts yet</div>';
    }
    return snapshot.artifactPanel
        .map((artifact) => `
      <div class="card">
        <strong>${escapeHtml(artifact.proofId)}</strong> (${escapeHtml(artifact.status)})
        <div>task ${escapeHtml(artifact.taskId)} · ${escapeHtml(artifact.reasonCode)}</div>
        <div>${escapeHtml(artifact.uri)}</div>
      </div>
    `)
        .join('');
}
export function renderSnapshot(snapshot, root) {
    const isStale = computeIsStale(snapshot);
    const staleBadge = root.getElementById('stale-badge');
    if (staleBadge) {
        staleBadge.textContent = isStale ? 'STALE' : 'LIVE';
        staleBadge.className = `badge ${isStale ? 'stale' : 'live'}`;
    }
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
}
export async function boot() {
    const response = await fetch('./data/snapshot.json', { cache: 'no-store' });
    if (!response.ok) {
        throw new Error(`Failed to load snapshot: ${response.status}`);
    }
    const snapshot = normalizeSnapshot(await response.json());
    renderSnapshot(snapshot, document);
}
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    void boot();
}
