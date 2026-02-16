export type JuCommandName = 'start' | 'status' | 'pause' | 'resume' | 'reprioritize' | 'message' | 'stop';

export interface ParsedStartCommand {
  command: 'start';
  goal: string;
  actor: string;
  authToken: string;
  idempotencyKey: string;
}

export interface ParsedStatusCommand {
  command: 'status';
  runId?: string;
  actor?: string;
  authToken?: string;
}

export interface ParsedPauseCommand {
  command: 'pause';
  reason: string;
  actor: string;
  authToken: string;
  idempotencyKey: string;
}

export interface ParsedResumeCommand {
  command: 'resume';
  reason: string;
  actor: string;
  authToken: string;
  idempotencyKey: string;
}

export interface ParsedReprioritizeCommand {
  command: 'reprioritize';
  taskId: string;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  reason: string;
  actor: string;
  authToken: string;
  idempotencyKey: string;
}

export interface ParsedMessageCommand {
  command: 'message';
  to: string;
  text: string;
  taskId?: string;
  proofUri?: string;
  proofSha256?: string;
  completeTask: boolean;
  actor: string;
  authToken: string;
  idempotencyKey: string;
}

export interface ParsedStopCommand {
  command: 'stop';
  reason: string;
  actor: string;
  authToken: string;
  idempotencyKey: string;
}

export type ParsedCommand =
  | ParsedStartCommand
  | ParsedStatusCommand
  | ParsedPauseCommand
  | ParsedResumeCommand
  | ParsedReprioritizeCommand
  | ParsedMessageCommand
  | ParsedStopCommand;
