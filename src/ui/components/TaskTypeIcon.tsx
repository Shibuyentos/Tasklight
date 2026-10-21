import { faStripeS } from '@fortawesome/free-brands-svg-icons';
import {
  faBug,
  faCode,
  faHandshake,
  faHashtag,
  faMoneyBill,
  faPalette,
  faPencilRuler,
  faPenToSquare,
  faUserCog,
  type IconDefinition,
} from '@fortawesome/free-solid-svg-icons';

/**
 * Ícones dos tipos de tarefa do workspace, pelo nome que o ClickUp usa (nomes da versão 5 do
 * Font Awesome). A origem informada pela API não é confiável: `stripe-s` vem como `fas`, mas é
 * um ícone de marca.
 */
const TYPE_ICONS: Readonly<Record<string, IconDefinition>> = {
  'user-cog': faUserCog,
  hashtag: faHashtag,
  code: faCode,
  handshake: faHandshake,
  'pen-to-square': faPenToSquare,
  palette: faPalette,
  bug: faBug,
  'pencil-ruler': faPencilRuler,
  'money-bill': faMoneyBill,
  'stripe-s': faStripeS,
};

export function hasTaskTypeIcon(name: string | null | undefined): name is string {
  return name != null && name in TYPE_ICONS;
}

/** Desenha só o caminho do ícone, sem o runtime do Font Awesome. */
export function TaskTypeIcon(props: {
  name: string;
  color: string;
  size?: number;
  class?: string;
}) {
  const definition = () => TYPE_ICONS[props.name];
  const size = () => props.size ?? 13.33;

  return (
    <svg
      width={size()}
      height={size()}
      viewBox={`0 0 ${definition()?.icon[0] ?? 0} ${definition()?.icon[1] ?? 0}`}
      fill="currentColor"
      aria-hidden="true"
      class={props.class}
      style={{ color: props.color }}
      data-icon={props.name}
      data-testid="type-icon"
    >
      <path d={[definition()?.icon[4] ?? ''].flat().join(' ')} />
    </svg>
  );
}
