export type ApiErrorKind =
  | 'unauthorized'
  | 'rate_limited'
  | 'server'
  | 'network'
  | 'timeout'
  | 'http';

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status?: number;
  readonly retryAfterMs?: number;

  constructor(
    kind: ApiErrorKind,
    message: string,
    init: { status?: number; retryAfterMs?: number } = {},
  ) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = init.status;
    this.retryAfterMs = init.retryAfterMs;
  }
}

/** O POST foi aceito, mas a tarefa criada ainda não foi confirmada por uma leitura. */
export class TaskCreationConfirmationError extends Error {
  readonly taskId: string | null;
  constructor(taskId: string | null, cause?: unknown) {
    super('A criação foi aceita, mas a confirmação está indisponível', { cause });
    this.name = 'TaskCreationConfirmationError';
    this.taskId = taskId;
  }
}
