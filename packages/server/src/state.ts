import type { Session, HookPayload, ServerMessage } from "./types.js";
import { SESSION_TIMEOUT_MS, USER_INPUT_TOOLS } from "./types.js";

type StateChangeCallback = (message: ServerMessage) => void;

// Convex integration
let ConvexHttpClient: any = null;
let api: any = null;
let convexClient: any = null;

async function loadConvex() {
  try {
    const convexBrowser = await import('convex/browser');
    ConvexHttpClient = convexBrowser.ConvexHttpClient;

    // Dynamic import of Herd's Convex API
    const herdApi = await import(process.env.HOME + '/.claude/command-center/convex/_generated/api.js');
    api = herdApi.api;

    const convexUrl = process.env.CONVEX_URL || 'https://third-bass-320.convex.cloud';
    convexClient = new ConvexHttpClient(convexUrl);
    console.log('Connected to Herd via Convex');
  } catch (error) {
    console.log('Convex not available, using hooks only');
  }
}

class SessionState {
  private sessions: Map<string, Session> = new Map();
  private listeners: Set<StateChangeCallback> = new Set();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private convexInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Start cleanup interval for stale sessions
    this.cleanupInterval = setInterval(() => {
      this.cleanupStaleSessions();
    }, 30_000); // Check every 30 seconds

    // Initialize Convex integration
    loadConvex().then(() => {
      if (convexClient) {
        // Poll Convex for active sessions every 2 seconds
        this.convexInterval = setInterval(() => {
          this.syncWithHerd();
        }, 2000);
      }
    });
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
    const waitingForInput = sessions.filter(
      (s) => s.status === "waiting_for_input"
    ).length;
    return {
      type: "state",
      blocked: working === 0,
      sessions: sessions.length,
      working,
      waitingForInput,
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
        promptSession.status = "working";
        promptSession.waitingForInputSince = undefined;
        promptSession.lastActivity = new Date();
        break;

      case "PreToolUse":
        this.ensureSession(session_id, payload.cwd);
        const toolSession = this.sessions.get(session_id)!;
        // Check if this is a user input tool
        if (payload.tool_name && USER_INPUT_TOOLS.includes(payload.tool_name)) {
          toolSession.status = "waiting_for_input";
          toolSession.waitingForInputSince = new Date();
        } else if (toolSession.status === "waiting_for_input") {
          // If waiting for input, only reset after 500ms (to ignore immediate tool calls like Edit)
          const elapsed = Date.now() - (toolSession.waitingForInputSince?.getTime() ?? 0);
          if (elapsed > 500) {
            toolSession.status = "working";
            toolSession.waitingForInputSince = undefined;
          }
        } else {
          toolSession.status = "working";
        }
        toolSession.lastActivity = new Date();
        break;

      case "Stop":
        this.ensureSession(session_id, payload.cwd);
        const idleSession = this.sessions.get(session_id)!;
        if (idleSession.status === "waiting_for_input") {
          // If waiting for input, only reset after 500ms (to ignore immediate Stop after AskUserQuestion)
          const elapsed = Date.now() - (idleSession.waitingForInputSince?.getTime() ?? 0);
          if (elapsed > 500) {
            idleSession.status = "idle";
            idleSession.waitingForInputSince = undefined;
          }
        } else {
          idleSession.status = "idle";
        }
        idleSession.lastActivity = new Date();
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
    let idled = 0;

    for (const [id, session] of this.sessions) {
      // Remove completely stale sessions (no activity for SESSION_TIMEOUT_MS)
      if (now - session.lastActivity.getTime() > SESSION_TIMEOUT_MS) {
        this.sessions.delete(id);
        removed++;
      }
      // Auto-idle sessions that have been "working" for 10+ seconds without activity
      else if (session.status === "working" && now - session.lastActivity.getTime() > 10_000) {
        session.status = "idle";
        idled++;
        console.log(`Auto-idled session ${id} (no activity for 10s)`);
      }
    }

    if (removed > 0 || idled > 0) {
      this.broadcast();
    }
  }

  private async syncWithHerd(): Promise<void> {
    if (!convexClient || !api) return;

    try {
      // Query active sessions from Herd's Convex
      const herdSessions = await convexClient.query(api.sessions.getActive);

      // Merge with existing hook-based sessions
      const now = Date.now();
      const herdSessionIds = new Set<string>();

      for (const herdSession of herdSessions) {
        herdSessionIds.add(herdSession.sessionId);

        // Get or create session
        let session = this.sessions.get(herdSession.sessionId);
        if (!session) {
          session = {
            id: herdSession.sessionId,
            status: 'working', // Active in Herd = working
            lastActivity: new Date(herdSession.lastActivity),
            cwd: herdSession.projectPath,
          };
          this.sessions.set(herdSession.sessionId, session);
        } else {
          // Update from Herd data
          session.status = 'working'; // Active in Herd = working
          session.lastActivity = new Date(herdSession.lastActivity);
          session.cwd = herdSession.projectPath;
        }
      }

      // Remove sessions that are no longer active in Herd
      // (but keep hook-based sessions that might be newer)
      const changed = herdSessions.length > 0;
      if (changed) {
        this.broadcast();
      }
    } catch (error) {
      // Silently fail if Convex query fails
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

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    if (this.convexInterval) {
      clearInterval(this.convexInterval);
    }
    this.sessions.clear();
    this.listeners.clear();
  }
}

export const state = new SessionState();
