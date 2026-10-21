/** Seta triangular: aponta para a direita fechada e para baixo aberta. */
export function Caret(props: { open: boolean; size?: number }) {
  const size = () => props.size ?? 16;

  return (
    <svg
      width={size()}
      height={size()}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
      style={{ transform: props.open ? 'rotate(90deg)' : undefined }}
    >
      <path d="M6.25 4.6c0-.5.56-.79.96-.5l4.2 3.08a.62.62 0 0 1 0 1l-4.2 3.08a.62.62 0 0 1-.96-.5V4.6Z" />
    </svg>
  );
}
