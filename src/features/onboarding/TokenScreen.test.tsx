import { render, screen } from '@solidjs/testing-library';
import userEvent from '@testing-library/user-event';
import type { JSX } from 'solid-js';
import { createStore } from 'solid-js/store';
import { describe, expect, it, vi } from 'vitest';
import { ServicesProvider, useServices } from '../../app/ServicesContext';
import type { SessionNotice, SessionState } from '../../store/session';
import type { SessionService, SubmitResult } from '../../sync/session';
import { OfflineScreen } from './OfflineScreen';
import { StorageNotice } from './StorageNotice';
import { TokenScreen } from './TokenScreen';

function fakeSession(
  overrides: Partial<SessionService> = {},
  notice: SessionNotice = null,
): SessionService {
  const [state] = createStore<SessionState>({
    status: 'needs-token',
    notice,
    user: null,
    workspaces: [],
    workspaceId: null,
  });
  return {
    state,
    boot: vi.fn(async () => {}),
    submitToken: vi.fn(async (): Promise<SubmitResult> => 'ok'),
    signOut: vi.fn(async () => {}),
    selectWorkspace: vi.fn(),
    handleUnauthorized: vi.fn(async () => {}),
    ...overrides,
  };
}

function renderWith(session: SessionService, ui: () => JSX.Element) {
  return render(() => <ServicesProvider services={{ session }}>{ui()}</ServicesProvider>);
}

describe('TokenScreen', () => {
  it('envia o texto exatamente como foi digitado', async () => {
    const user = userEvent.setup();
    const session = fakeSession();
    renderWith(session, () => <TokenScreen />);

    await user.type(screen.getByLabelText('Token pessoal da API'), ' pk_42_ABC123 ');
    await user.click(screen.getByRole('button', { name: 'Conectar' }));

    expect(session.submitToken).toHaveBeenCalledWith(' pk_42_ABC123 ');
  });

  it('mostra "Verificando…" e desabilita o botão durante a validação', async () => {
    const user = userEvent.setup();
    let finish: (result: SubmitResult) => void = () => {};
    const session = fakeSession({
      submitToken: vi.fn(
        () =>
          new Promise<SubmitResult>((resolve) => {
            finish = resolve;
          }),
      ),
    });
    renderWith(session, () => <TokenScreen />);

    await user.type(screen.getByLabelText('Token pessoal da API'), 'pk_42_ABC123');
    await user.click(screen.getByRole('button', { name: 'Conectar' }));

    expect(screen.getByRole('button', { name: 'Verificando…' })).toBeDisabled();
    finish('network');
    expect(await screen.findByRole('button', { name: 'Conectar' })).toBeEnabled();
  });

  it.each<[SubmitResult, string]>([
    ['invalid-format', 'O token deve começar com pk_ e ser copiado inteiro.'],
    ['invalid-token', 'O ClickUp recusou este token. Gere um novo e tente de novo.'],
    ['network', 'Sem conexão com o ClickUp. Verifique a internet e tente de novo.'],
  ])('resultado %s mostra a mensagem certa', async (result, message) => {
    const user = userEvent.setup();
    const session = fakeSession({ submitToken: vi.fn(async () => result) });
    renderWith(session, () => <TokenScreen />);

    await user.type(screen.getByLabelText('Token pessoal da API'), 'pk_42_ABC123');
    await user.click(screen.getByRole('button', { name: 'Conectar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
  });

  it('ao abrir depois de um token recusado, já explica o motivo', () => {
    renderWith(fakeSession({}, 'invalid-token'), () => <TokenScreen />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'O ClickUp recusou este token. Gere um novo e tente de novo.',
    );
  });

  it('o link de ajuda abre as configurações de apps do ClickUp em nova aba', () => {
    renderWith(fakeSession(), () => <TokenScreen />);

    const link = screen.getByRole('link', { name: 'Onde encontro meu token?' });
    expect(link).toHaveAttribute('href', 'https://app.clickup.com/settings/apps');
    expect(link).toHaveAttribute('target', '_blank');
  });
});

describe('OfflineScreen', () => {
  it('tenta conectar de novo', async () => {
    const user = userEvent.setup();
    const session = fakeSession();
    renderWith(session, () => <OfflineScreen />);

    expect(screen.getByRole('heading', { name: 'Sem conexão com o ClickUp' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(session.boot).toHaveBeenCalledOnce();
  });
});

describe('StorageNotice', () => {
  it('avisa quando o token não pôde ser salvo e pode ser fechado', async () => {
    const user = userEvent.setup();
    renderWith(fakeSession({}, 'storage'), () => <StorageNotice />);

    expect(screen.getByRole('status')).toHaveTextContent(
      'Não foi possível salvar o token neste navegador. Você precisará colá-lo de novo na próxima vez.',
    );
    await user.click(screen.getByRole('button', { name: 'Fechar aviso' }));

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('não aparece sem o aviso', () => {
    renderWith(fakeSession(), () => <StorageNotice />);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('useServices', () => {
  it('falha com mensagem clara fora do provider', () => {
    function Orphan() {
      useServices();
      return null;
    }

    expect(() => render(() => <Orphan />)).toThrow('ServicesProvider');
  });
});
