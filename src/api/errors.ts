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
