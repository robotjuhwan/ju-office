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
    return snapshot.orgView
        .map((persona, index) => `
      <div class="sprite ${persona.role === 'CEO' ? 'ceo' : 'worker'}" style="--x:${index};--delay:${index * 0.2}s">
        <span class="sprite-label">${escapeHtml(persona.personaId)}</span>
      </div>
    `)
        .join('');
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
    const snapshot = (await response.json());
    renderSnapshot(snapshot, document);
}
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    void boot();
}
