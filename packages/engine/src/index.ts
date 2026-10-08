/**
 * @attune/engine — the engagement intelligence layer.
 *
 * Detect → Understand → Intervene → Observe → Adapt, as pure TypeScript with no I/O, so the same
 * engine runs in the browser (offline included), on a server, or inside a simulation.
 */
export * from "./types";
export * from "./config";
export { extractSignals, expectedLatencyMs, type SignalContext } from "./signals";
export { readState, engagementIndex, evidenceFor, scoreStates, softmax } from "./state-engine";
export {
  selectIntervention,
  rulesFor,
  effectivenessFor,
  type PolicyContext,
  type PolicyResult,
} from "./policy";
export {
  serveActivity,
  focusConcept,
  targetDifficulty,
  type ActivityRequest,
  type ServedActivity,
} from "./activity-engine";
export { explainDecision } from "./why";
export {
  createLearner,
  probabilityCorrect,
  applyAnswer,
  applyControl,
  applyCheckin,
  applyChoice,
  evaluateOutcome,
  applyOutcome,
  takeSnapshot,
  type CreateLearnerInput,
} from "./learner-model";
export {
  startSession,
  dispatch,
  endSession,
  nextDay,
  setMode,
  elapsedMinutes,
  resumeSession,
  requestIntervention,
  type SessionState,
  type StartOptions,
  type CheckinInput,
} from "./orchestrator";
export {
  sessionMetrics,
  growthMoments,
  learnerPatterns,
  categoryStats,
  type SessionMetrics,
  type GrowthMoment,
  type Pattern,
  type Rate,
  type CategoryStat,
} from "./metrics";
export { simulateActivity, type SimPersona, type SimStep } from "./simulator";
export {
  SCENARIOS,
  scenarioById,
  type DemoScenario,
  type ScenarioId,
  type OnboardingAnswers,
} from "./scenarios";
export { simulateCohort, type CohortReport, type CohortOptions } from "./cohort";
export { createRng, type Rng } from "./rng";
export { learnerEventSchema, syncBatchSchema, type SyncBatch, type SyncAck } from "./schemas";
export { QUESTIONS, GUIDED, MICRO_WINS, CHALLENGES } from "./content/practice";
export {
  EXPLANATIONS,
  CURIOSITY_PATHS,
  MISSIONS,
  REFLECTIONS,
  BREAKS,
} from "./content/experiences";
