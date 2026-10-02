import type { FinalResults } from "@quizarena/shared";
import type { Db } from "../db";

export interface ParticipantRecord {
  id: string;
  nickname: string;
  nicknameKey: string;
  tokenHash: string;
}

export interface AnswerRecord {
  participantId: string;
  questionId: string;
  questionIndex: number;
  optionId: string;
  isCorrect: boolean;
  responseMs: number;
  points: number;
  receivedAt: number;
}

/**
 * The engine's only window to storage. Keeping it this narrow lets the engine be tested
 * in-memory and makes the write pattern explicit: one insert per join, one batched insert
 * per scored question, one transaction at the end.
 */
export interface GamePersistence {
  participantJoined(sessionId: string, p: ParticipantRecord): Promise<void>;
  participantRemoved(sessionId: string, participantId: string): Promise<void>;
  sessionStarted(sessionId: string, at: number): Promise<void>;
  answersScored(sessionId: string, answers: AnswerRecord[]): Promise<void>;
  sessionFinished(sessionId: string, at: number, results: FinalResults): Promise<void>;
}

export class PrismaGamePersistence implements GamePersistence {
  constructor(private readonly db: Db) {}

  async participantJoined(sessionId: string, p: ParticipantRecord) {
    await this.db.participant.create({
      data: {
        id: p.id,
        sessionId,
        nickname: p.nickname,
        nicknameKey: p.nicknameKey,
        tokenHash: p.tokenHash,
      },
    });
  }

  async participantRemoved(sessionId: string, participantId: string) {
    // Lobby leavers are deleted so their nickname is free again; in-game removals are kept for history.
    await this.db.participant.updateMany({
      where: { id: participantId, sessionId },
      data: { removed: true, leftAt: new Date(), nicknameKey: `removed:${participantId}` },
    });
  }

  async sessionStarted(sessionId: string, at: number) {
    await this.db.quizSession.update({
      where: { id: sessionId },
      data: { status: "LIVE", startedAt: new Date(at) },
    });
  }

  async answersScored(sessionId: string, answers: AnswerRecord[]) {
    if (answers.length === 0) return;
    await this.db.participantAnswer.createMany({
      data: answers.map((a) => ({ ...a, sessionId, receivedAt: new Date(a.receivedAt) })),
      skipDuplicates: true,
    });
  }

  async sessionFinished(sessionId: string, at: number, results: FinalResults) {
    await this.db.$transaction([
      this.db.quizResult.createMany({
        data: results.standings.map((s) => ({
          sessionId,
          participantId: s.participantId,
          rank: s.rank,
          score: s.score,
          correctCount: s.correctCount,
          answeredCount: s.answeredCount,
          totalQuestions: results.playedQuestions,
          avgResponseMs: s.avgResponseMs === null ? null : Math.round(s.avgResponseMs),
          bestStreak: s.bestStreak,
        })),
        skipDuplicates: true,
      }),
      this.db.quizSession.update({
        where: { id: sessionId },
        data: { status: "FINISHED", endedAt: new Date(at) },
      }),
    ]);
  }
}

/** For tests and local simulations. Records calls so assertions can inspect them. */
export class MemoryGamePersistence implements GamePersistence {
  readonly participants: ParticipantRecord[] = [];
  readonly answers: AnswerRecord[] = [];
  finished: FinalResults | null = null;
  started = false;

  async participantJoined(_s: string, p: ParticipantRecord) {
    this.participants.push(p);
  }
  async participantRemoved() {}
  async sessionStarted() {
    this.started = true;
  }
  async answersScored(_s: string, answers: AnswerRecord[]) {
    this.answers.push(...answers);
  }
  async sessionFinished(_s: string, _at: number, results: FinalResults) {
    this.finished = results;
  }
}
