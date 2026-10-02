-- CreateEnum
CREATE TYPE "QuizStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('MULTIPLE_CHOICE', 'TRUE_FALSE');

-- CreateEnum
CREATE TYPE "ScoringMode" AS ENUM ('SPEED', 'ACCURACY');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('LOBBY', 'LIVE', 'FINISHED', 'ABANDONED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quiz" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "coverImageUrl" TEXT,
    "status" "QuizStatus" NOT NULL DEFAULT 'DRAFT',
    "defaultTimerSec" INTEGER NOT NULL DEFAULT 20,
    "scoringMode" "ScoringMode" NOT NULL DEFAULT 'SPEED',
    "streakBonus" BOOLEAN NOT NULL DEFAULT true,
    "randomizeQuestions" BOOLEAN NOT NULL DEFAULT false,
    "randomizeAnswers" BOOLEAN NOT NULL DEFAULT false,
    "showLeaderboard" BOOLEAN NOT NULL DEFAULT true,
    "showCorrectAnswers" BOOLEAN NOT NULL DEFAULT true,
    "showAnswerStats" BOOLEAN NOT NULL DEFAULT true,
    "allowLateJoin" BOOLEAN NOT NULL DEFAULT false,
    "participantLimit" INTEGER NOT NULL DEFAULT 200,
    "soundEnabled" BOOLEAN NOT NULL DEFAULT true,
    "nicknameFilter" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quiz_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "quizId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "type" "QuestionType" NOT NULL DEFAULT 'MULTIPLE_CHOICE',
    "text" TEXT NOT NULL DEFAULT '',
    "imageUrl" TEXT,
    "timeLimitSec" INTEGER,
    "points" INTEGER NOT NULL DEFAULT 1000,
    "explanation" TEXT NOT NULL DEFAULT '',
    "randomizeAnswers" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnswerOption" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "text" TEXT NOT NULL DEFAULT '',
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "AnswerOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizSession" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "quizId" TEXT,
    "hostId" TEXT NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'LOBBY',
    "quizSnapshot" JSONB NOT NULL,
    "quizTitle" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "QuizSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Participant" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "nicknameKey" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "removed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Participant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParticipantAnswer" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "questionIndex" INTEGER NOT NULL,
    "optionId" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,
    "responseMs" INTEGER NOT NULL,
    "points" INTEGER NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParticipantAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizResult" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "correctCount" INTEGER NOT NULL,
    "answeredCount" INTEGER NOT NULL,
    "totalQuestions" INTEGER NOT NULL,
    "avgResponseMs" INTEGER,
    "bestStreak" INTEGER NOT NULL,

    CONSTRAINT "QuizResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Quiz_ownerId_updatedAt_idx" ON "Quiz"("ownerId", "updatedAt");

-- CreateIndex
CREATE INDEX "Quiz_ownerId_status_idx" ON "Quiz"("ownerId", "status");

-- CreateIndex
CREATE INDEX "Question_quizId_order_idx" ON "Question"("quizId", "order");

-- CreateIndex
CREATE INDEX "AnswerOption_questionId_order_idx" ON "AnswerOption"("questionId", "order");

-- CreateIndex
CREATE INDEX "QuizSession_code_status_idx" ON "QuizSession"("code", "status");

-- CreateIndex
CREATE INDEX "QuizSession_hostId_createdAt_idx" ON "QuizSession"("hostId", "createdAt");

-- CreateIndex
CREATE INDEX "QuizSession_quizId_idx" ON "QuizSession"("quizId");

-- CreateIndex
CREATE INDEX "Participant_sessionId_idx" ON "Participant"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "Participant_sessionId_nicknameKey_key" ON "Participant"("sessionId", "nicknameKey");

-- CreateIndex
CREATE INDEX "ParticipantAnswer_sessionId_questionIndex_idx" ON "ParticipantAnswer"("sessionId", "questionIndex");

-- CreateIndex
CREATE UNIQUE INDEX "ParticipantAnswer_participantId_questionId_key" ON "ParticipantAnswer"("participantId", "questionId");

-- CreateIndex
CREATE UNIQUE INDEX "QuizResult_participantId_key" ON "QuizResult"("participantId");

-- CreateIndex
CREATE INDEX "QuizResult_sessionId_rank_idx" ON "QuizResult"("sessionId", "rank");

-- AddForeignKey
ALTER TABLE "Quiz" ADD CONSTRAINT "Quiz_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnswerOption" ADD CONSTRAINT "AnswerOption_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizSession" ADD CONSTRAINT "QuizSession_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizSession" ADD CONSTRAINT "QuizSession_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Participant" ADD CONSTRAINT "Participant_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "QuizSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParticipantAnswer" ADD CONSTRAINT "ParticipantAnswer_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "QuizSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParticipantAnswer" ADD CONSTRAINT "ParticipantAnswer_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizResult" ADD CONSTRAINT "QuizResult_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "QuizSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizResult" ADD CONSTRAINT "QuizResult_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
