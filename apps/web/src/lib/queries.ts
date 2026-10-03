"use client";

import type { ArenaTheme } from "@quizarena/shared/appearance";
import type { QuestionInput } from "@quizarena/shared/schemas";

import type {
  DashboardDto,
  QuestionDto,
  QuizDto,
  QuizSummaryDto,
  SessionResultsDto,
  SessionSummaryDto,
  UserDto,
} from "@quizarena/shared/dto";
import type { MediaAssetDto, MediaConfigDto } from "@quizarena/shared/media";
import type { QuestionUpdateInput, QuizUpdateInput } from "@quizarena/shared/schemas";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { WAKE_RETRIES, WAKE_RETRY_MS, isServerWaking } from "./server-wake";

export const keys = {
  me: ["me"] as const,
  dashboard: ["dashboard"] as const,
  quizzes: (status?: string) => ["quizzes", status ?? "all"] as const,
  quiz: (id: string) => ["quiz", id] as const,
  sessions: (scope: string) => ["sessions", scope] as const,
  session: (id: string) => ["session", id] as const,
  results: (id: string) => ["results", id] as const,
  mediaConfig: ["media-config"] as const,
  media: (q: string, sort: string, unused: boolean) => ["media", q, sort, unused] as const,
};

/* ---------------------------------------------------------------- auth */

export function useMe() {
  return useQuery({
    queryKey: keys.me,
    queryFn: () => api<{ user: UserDto }>("/auth/me").then((r) => r.user),
    // A sleeping server is retried for ~90s; anything else (401, 4xx) fails at once.
    retry: (count, err) => isServerWaking(err) && count < WAKE_RETRIES,
    retryDelay: WAKE_RETRY_MS,
    staleTime: 5 * 60_000,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string; password: string }) =>
      api<{ user: UserDto }>("/auth/login", { method: "POST", json: input }),
    retry: (count, err) => isServerWaking(err) && count < WAKE_RETRIES,
    retryDelay: WAKE_RETRY_MS,
    onSuccess: (r) => qc.setQueryData(keys.me, r.user),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api("/auth/logout", { method: "POST" }),
    onSettled: () => qc.clear(),
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name?: string; currentPassword?: string; newPassword?: string }) =>
      api<{ user: UserDto }>("/auth/me", { method: "PATCH", json: input }),
    onSuccess: (r) => qc.setQueryData(keys.me, r.user),
  });
}

/* ---------------------------------------------------------------- dashboard & quizzes */

export function useDashboard() {
  return useQuery({ queryKey: keys.dashboard, queryFn: () => api<DashboardDto>("/dashboard") });
}

export function useQuizzes(status?: "DRAFT" | "PUBLISHED") {
  return useQuery({
    queryKey: keys.quizzes(status),
    queryFn: () =>
      api<{ quizzes: QuizSummaryDto[] }>(`/quizzes${status ? `?status=${status}` : ""}`).then(
        (r) => r.quizzes,
      ),
  });
}

export function useQuiz(id: string) {
  return useQuery({
    queryKey: keys.quiz(id),
    queryFn: () => api<{ quiz: QuizDto }>(`/quizzes/${id}`).then((r) => r.quiz),
  });
}

const invalidateLists = (qc: QueryClient) => {
  void qc.invalidateQueries({ queryKey: ["quizzes"] });
  void qc.invalidateQueries({ queryKey: keys.dashboard });
};

/** Bulk add from a spreadsheet import; the server answers with the updated quiz. */
export function useImportQuestions(quizId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (questions: QuestionInput[]) =>
      api<{ quiz: QuizDto; imported: number }>(`/quizzes/${quizId}/questions/import`, {
        method: "POST",
        json: { questions },
      }),
    onSuccess: ({ quiz }) => {
      qc.setQueryData(keys.quiz(quiz.id), quiz);
      invalidateLists(qc);
    },
  });
}

export function useCreateQuiz() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      title: string;
      description?: string;
      theme?: ArenaTheme;
      questions?: QuestionInput[];
    }) => api<{ quiz: QuizDto }>("/quizzes", { method: "POST", json: input }).then((r) => r.quiz),
    onSuccess: (quiz) => {
      qc.setQueryData(keys.quiz(quiz.id), quiz);
      invalidateLists(qc);
    },
  });
}

export function useUpdateQuiz(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: QuizUpdateInput) =>
      api<{ quiz: QuizDto }>(`/quizzes/${id}`, { method: "PATCH", json: patch }).then(
        (r) => r.quiz,
      ),
    onSuccess: (quiz) => {
      qc.setQueryData(keys.quiz(id), quiz);
      invalidateLists(qc);
    },
  });
}

export function useDeleteQuiz() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/quizzes/${id}`, { method: "DELETE" }),
    onSuccess: (_r, id) => {
      qc.removeQueries({ queryKey: keys.quiz(id) });
      invalidateLists(qc);
    },
  });
}

export function useDuplicateQuiz() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<{ quiz: QuizDto }>(`/quizzes/${id}/duplicate`, { method: "POST" }).then((r) => r.quiz),
    onSuccess: () => invalidateLists(qc),
  });
}

/* ---------------------------------------------------------------- questions */

/** Question mutations patch the cached quiz in place so the editor never flickers. */
function patchQuestion(qc: QueryClient, quizId: string, fn: (qs: QuestionDto[]) => QuestionDto[]) {
  qc.setQueryData<QuizDto>(keys.quiz(quizId), (q) =>
    q ? { ...q, questions: fn(q.questions), questionCount: fn(q.questions).length } : q,
  );
}

export function useAddQuestion(quizId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { type: QuestionDto["type"] }) =>
      api<{ question: QuestionDto }>(`/quizzes/${quizId}/questions`, {
        method: "POST",
        json: input,
      }).then((r) => r.question),
    onSuccess: (question) => patchQuestion(qc, quizId, (qs) => [...qs, question]),
  });
}

export function useUpdateQuestion(quizId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: QuestionUpdateInput }) =>
      api<{ question: QuestionDto }>(`/questions/${id}`, { method: "PATCH", json: patch }).then(
        (r) => r.question,
      ),
    onSuccess: (question) =>
      patchQuestion(qc, quizId, (qs) => qs.map((q) => (q.id === question.id ? question : q))),
  });
}

export function useDeleteQuestion(quizId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/questions/${id}`, { method: "DELETE" }),
    onSuccess: (_r, id) =>
      patchQuestion(qc, quizId, (qs) =>
        qs.filter((q) => q.id !== id).map((q, i) => ({ ...q, order: i })),
      ),
  });
}

export function useDuplicateQuestion(quizId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<{ question: QuestionDto }>(`/questions/${id}/duplicate`, { method: "POST" }).then(
        (r) => r.question,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.quiz(quizId) }),
  });
}

export function useReorderQuestions(quizId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (questionIds: string[]) =>
      api<{ quiz: QuizDto }>(`/quizzes/${quizId}/questions/order`, {
        method: "PUT",
        json: { questionIds },
      }).then((r) => r.quiz),
    onMutate: (ids) => {
      const prev = qc.getQueryData<QuizDto>(keys.quiz(quizId));
      patchQuestion(qc, quizId, (qs) =>
        ids.map((id, i) => ({ ...qs.find((q) => q.id === id)!, order: i })),
      );
      return { prev };
    },
    onError: (_e, _ids, ctx) => ctx?.prev && qc.setQueryData(keys.quiz(quizId), ctx.prev),
    onSuccess: (quiz) => qc.setQueryData(keys.quiz(quizId), quiz),
  });
}

/* ---------------------------------------------------------------- sessions */

export function useSessions(scope: "active" | "past" | "all") {
  return useQuery({
    queryKey: keys.sessions(scope),
    queryFn: () =>
      api<{ sessions: SessionSummaryDto[] }>(`/sessions?scope=${scope}`).then((r) => r.sessions),
  });
}

export function useSession(id: string) {
  return useQuery({
    queryKey: keys.session(id),
    queryFn: () =>
      api<{ session: SessionSummaryDto; live: { phase: string; players: number } | null }>(
        `/sessions/${id}`,
      ),
    // A running game finishes in the control room; poll so this page turns into results.
    refetchInterval: (q) => (q.state.data?.live ? 10_000 : false),
  });
}

export function useResults(id: string, enabled: boolean) {
  return useQuery({
    queryKey: keys.results(id),
    queryFn: () => api<SessionResultsDto>(`/sessions/${id}/results`),
    enabled,
  });
}

export function useStartSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (quizId: string) =>
      api<{ session: SessionSummaryDto }>("/sessions", { method: "POST", json: { quizId } }).then(
        (r) => r.session,
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["sessions"] });
      void qc.invalidateQueries({ queryKey: keys.dashboard });
    },
  });
}

/* ---------------------------------------------------------------- media */

export function useMediaConfig() {
  return useQuery({
    queryKey: keys.mediaConfig,
    queryFn: () => api<MediaConfigDto>("/media/config"),
    staleTime: 5 * 60_000,
  });
}

export function useMedia(
  { q = "", sort = "recent", unused = false }: { q?: string; sort?: string; unused?: boolean } = {},
  enabled = true,
) {
  return useQuery({
    queryKey: keys.media(q, sort, unused),
    queryFn: () => {
      const params = new URLSearchParams({ sort });
      if (q) params.set("q", q);
      if (unused) params.set("unused", "1");
      return api<{ assets: MediaAssetDto[] }>(`/media?${params}`).then((r) => r.assets);
    },
    enabled,
    placeholderData: (prev) => prev,
  });
}

/** After an upload, rename or delete: every library listing refreshes. */
export const invalidateMedia = (qc: QueryClient) => qc.invalidateQueries({ queryKey: ["media"] });

export function useRenameMedia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      api<{ asset: MediaAssetDto }>(`/media/${id}`, { method: "PATCH", json: { name } }).then(
        (r) => r.asset,
      ),
    onSuccess: () => invalidateMedia(qc),
  });
}

export function useDeleteMedia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, force }: { id: string; force?: boolean }) =>
      api<void>(`/media/${id}${force ? "?force=1" : ""}`, { method: "DELETE" }),
    onSuccess: () => {
      void invalidateMedia(qc);
      // Questions that used the image lost it.
      void qc.invalidateQueries({ queryKey: ["quiz"] });
    },
  });
}
