import type { Session, HookPayload, ServerMessage } from "./types.js";
import { SESSION_TIMEOUT_MS, USER_INPUT_TOOLS } from "./types.js";

type StateChangeCallback = (message: ServerMessage) => void;

class SessionState {
  private sessions: Map<string, Session> = new Map();
  private listeners: Set<StateChangeCallback> = new Set();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Start cleanup interval for stale sessions
    this.cleanupInterval = setInterval(() => {
      this.cleanupStaleSessions();
    }, 5_000); // Check every 5 seconds for faster response
  }

  subscribe(callback: StateChangeCallback): () => void {
    this.listeners.add(callback);
    // Immediately send current state to new subscriber
    callback(this.getStateMessage());
    return () => this.listeners.delete(callback);
  }

  private broadcast(): void {
    const message = this.getStateMessage();
    for (const listener of this.listeners) {
      listener(message);
    }
  }

  private getStateMessage(): ServerMessage {
    const sessions = Array.from(this.sessions.values());
    const working = sessions.filter((s) => s.status === "working").length;
    const waitingForInput = sessions.filter((s) => s.status === "waiting_for_input").length;
    const waitingForReview = sessions.filter((s) => s.status === "waiting_for_review").length;
    // Send session data (without lastActivity which isn't serializable)
    const sessionData = sessions.map(s => ({
      id: s.id,
      status: s.status,
      cwd: s.cwd,
    }));
    // Block if: no one working, OR any session needs attention (question/review)
    const needsAttention = waitingForInput > 0 || waitingForReview > 0;
    const blocked = working === 0 || needsAttention;
    return {
      type: "state",
      blocked,
      sessions: sessionData,
      working,
      waitingForInput,
      waitingForReview,
    };
  }

  handleHook(payload: HookPayload): void {
    const { session_id, hook_event_name } = payload;

    switch (hook_event_name) {
      case "SessionStart":
        this.sessions.set(session_id, {
          id: session_id,
          status: "idle",
          lastActivity: new Date(),
          cwd: payload.cwd,
        });
        console.log("Claude Code session connected");
        break;

      case "SessionEnd":
        this.sessions.delete(session_id);
        console.log("Claude Code session disconnected");
        break;

      case "UserPromptSubmit":
        this.ensureSession(session_id, payload.cwd);
        const promptSession = this.sessions.get(session_id)!;
        // User submitted prompt → Claude is about to work
        promptSession.status = "working";
        promptSession.lastActivity = new Date();
        console.log(`[${session_id.slice(0,8)}] UserPromptSubmit → working`);
        break;

      case "PreToolUse":
        this.ensureSession(session_id, payload.cwd);
        const toolSession = this.sessions.get(session_id)!;
        const isUserInputTool = payload.tool_name && USER_INPUT_TOOLS.includes(payload.tool_name);

        // User input tools (questions) always take priority
        if (isUserInputTool) {
          toolSession.status = "waiting_for_input";
          console.log(`[${session_id.slice(0,8)}] PreToolUse(${payload.tool_name}) → waiting_for_input`);
        }
        // Don't overwrite waiting_for_review with working - it's sticky
        else if (toolSession.status === "waiting_for_review") {
          console.log(`[${session_id.slice(0,8)}] PreToolUse(${payload.tool_name}) → keeping waiting_for_review`);
        }
        // All other tools → working
        else {
          toolSession.status = "working";
          console.log(`[${session_id.slice(0,8)}] PreToolUse(${payload.tool_name}) → working`);
        }
        toolSession.lastActivity = new Date();
        break;

      case "Stop":
        this.ensureSession(session_id, payload.cwd);
        const idleSession = this.sessions.get(session_id)!;
        // Don't clear waiting_for_review on Stop - only new prompt clears it
        if (idleSession.status === "waiting_for_review") {
          console.log(`[${session_id.slice(0,8)}] Stop → keeping waiting_for_review`);
          idleSession.lastActivity = new Date();
          break;
        }
        idleSession.status = "idle";
        idleSession.lastActivity = new Date();
        console.log(`[${session_id.slice(0,8)}] Stop → idle`);
        break;
    }

    this.broadcast();
  }

  private ensureSession(sessionId: string, cwd?: string): void {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, {
        id: sessionId,
        status: "idle",
        lastActivity: new Date(),
        cwd,
      });
      console.log("Claude Code session connected");
    }
  }

  private cleanupStaleSessions(): void {
    const now = Date.now();
    let removed = 0;

    for (const [id, session] of this.sessions) {
      // Remove completely stale sessions (no activity for SESSION_TIMEOUT_MS)
      if (now - session.lastActivity.getTime() > SESSION_TIMEOUT_MS) {
        this.sessions.delete(id);
        removed++;
        console.log(`Removed stale session ${id.slice(0,8)}`);
      }
      // No auto-idle - rely on Stop hook
    }

    if (removed > 0) {
      this.broadcast();
    }
  }

  getStatus(): { blocked: boolean; sessions: Session[] } {
    const sessions = Array.from(this.sessions.values());
    const working = sessions.filter((s) => s.status === "working").length;
    return {
      blocked: working === 0,
      sessions,
    };
  }

  removeSession(sessionId: string): boolean {
    const existed = this.sessions.has(sessionId);
    if (existed) {
      this.sessions.delete(sessionId);
      console.log(`Session ${sessionId.slice(0,8)} removed manually`);
      this.broadcast();
    }
    return existed;
  }

  notifyReview(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = "waiting_for_review";
      session.lastActivity = new Date();
      console.log(`[${sessionId.slice(0,8)}] Notify → waiting_for_review`);
      this.broadcast();
      return true;
    }
    return false;
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.sessions.clear();
    this.listeners.clear();
  }
}

export const state = new SessionState();
