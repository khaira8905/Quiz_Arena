import type { ErrorCode } from "./errors";
import type { LiveSettingsPatch } from "./schemas";
import type {
  GamePhase,
  HostCommand,
  HostView,
  PlayerSummary,
  PlayerView,
  ProjectorView,
} from "./game";

/**
 * Socket.IO contract. Both the server (`new Server<ClientToServerEvents, ServerToClientEvents>`)
 * and the client (`io() as Socket<ServerToClientEvents, ClientToServerEvents>`) are typed
 * from these interfaces, so a renamed field breaks the build on both sides.
 *
 * Design: phase transitions are delivered as full role-specific snapshots
 * (`session:state`) rather than deltas. Snapshots are tiny for players (<1 KB), make
 * reconnection trivial (the next snapshot is the whole truth) and remove ordering bugs.
 * High-frequency facts (joins, answer counts) are sent as small deltas to hosts only.
 */

export type Ack<T> = (response: AckResponse<T>) => void;
export type AckResponse<T> =
  { ok: true; data: T } | { ok: false; error: { code: ErrorCode; message: string } };

export interface JoinPayload {
  code: string;
  nickname: string;
}

export interface JoinResult {
  participantId: string;
  /** Opaque reconnect credential. Stored by the client per game code. */
  token: string;
  view: PlayerView;
}

export interface ReconnectPayload {
  code: string;
  token: string;
}

export interface AnswerPayload {
  questionId: string;
  optionId: string;
}

export interface AnswerReceipt {
  questionId: string;
  optionId: string;
  receivedAt: number;
}

export interface TimerSyncRequest {
  clientTime: number;
}

export interface TimerSyncResponse {
  clientTime: number;
  serverTime: number;
}

export interface HostAttachPayload {
  code: string;
}

export interface HostCommandPayload {
  code: string;
  command: HostCommand;
  /** The phase and question the sender was looking at (see hostCommandSchema). */
  expected?: { phase: GamePhase; questionIndex: number };
  /** ADJUST_TIMER: seconds to add (negative removes). */
  amount?: number;
}

export interface ClientToServerEvents {
  "session:join": (payload: JoinPayload, ack: Ack<JoinResult>) => void;
  "player:reconnect": (payload: ReconnectPayload, ack: Ack<JoinResult>) => void;
  "session:leave": () => void;
  "question:answer": (payload: AnswerPayload, ack: Ack<AnswerReceipt>) => void;
  "timer:sync": (payload: TimerSyncRequest, ack: (res: TimerSyncResponse) => void) => void;
  "host:attach": (payload: HostAttachPayload, ack: Ack<HostView>) => void;
  /** The stage: projector windows and the host's projector preview. Host-authenticated. */
  "projector:attach": (payload: HostAttachPayload, ack: Ack<ProjectorView>) => void;
  "host:command": (payload: HostCommandPayload, ack: Ack<HostView>) => void;
  /** Lobby-only changes to the running session's settings. */
  "host:settings": (
    payload: { code: string; patch: LiveSettingsPatch },
    ack: Ack<HostView>,
  ) => void;
  "host:kick": (payload: { code: string; participantId: string }, ack: Ack<null>) => void;
}

export interface ServerToClientEvents {
  /** Full role-specific snapshot. Sent on attach/reconnect and on every phase change. */
  "session:state": (view: PlayerView | HostView | ProjectorView) => void;
  /** Host-only roster deltas. */
  "session:player_joined": (player: PlayerSummary) => void;
  "session:player_left": (payload: { participantId: string }) => void;
  "session:player_status": (payload: { participantId: string; connected: boolean }) => void;
  /** Throttled live counters. */
  "session:player_count": (payload: { count: number; connected: number }) => void;
  "question:progress": (payload: {
    questionId: string;
    answered: number;
    distribution: Record<string, number>;
  }) => void;
  /** Stage-safe answer counter (no distribution) for projectors. */
  "question:answered": (payload: { questionId: string; answered: number }) => void;
  /** Pushed when the deadline moves (pause/resume/adjust) so clocks re-align. */
  "timer:sync": (payload: {
    serverTime: number;
    deadline: number;
    paused: boolean;
    remainingMs: number;
    durationMs: number;
  }) => void;
  /** The server is closing this seat (kicked, replaced, game deleted). */
  "session:closed": (payload: { code: ErrorCode; message: string }) => void;
}

export interface SocketData {
  role: "anonymous" | "player" | "host" | "projector";
  userId: string | null;
  gameCode: string | null;
  participantId: string | null;
}
