declare module 'virtual:tasklight/dev-token' {
  /** Token do `.env.local`, disponível só no `vite dev`; `null` no build e nos testes. */
  const token: string | null;
  export default token;
}
