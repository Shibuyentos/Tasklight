# Tasklight

Cliente leve para o ClickUp: interface familiar, uma fração da memória.

> **Cliente não oficial.** O Tasklight não tem afiliação com a ClickUp. Ele usa a
> [API pública do ClickUp](https://developer.clickup.com/) com o seu token pessoal.

## Status

Em desenvolvimento. A versão atual permite consultar tarefas atribuídas, agrupar por
status, mostrar tarefas fechadas, expandir subtarefas e consultar hoje e atrasadas.
A lista usa um snapshot local para reabrir e sincroniza as mudanças em segundo plano.
O clique em uma tarefa ainda abre o ClickUp; edição, comentários e criação de tarefas
ficam para as próximas etapas.

A API pode devolver tarefas da Personal List junto das atribuídas, enquanto a tela
correspondente do ClickUp as separa. Por enquanto, essas tarefas também aparecem no
Tasklight: tarefas compartilhadas continuam visíveis mesmo quando seu espaço não está
disponível na navegação.

As medições disponíveis e as verificações pendentes estão em
[Performance](docs/performance.md).

## Requisitos

- Node.js 26
- npm 11

## Como rodar

```bash
npm install
npm run dev
```

Depois, abra <http://localhost:5173>.

Na primeira abertura o app pede o seu token pessoal do ClickUp e o guarda só neste
navegador. Para não colar o token a cada sessão de desenvolvimento, crie um `.env.local`
com `CLICKUP_API_KEY=pk_...` (veja `.env.example`) ou copie de outro arquivo `.env` sem
exibir o valor:

```bash
npm run dev:token -- caminho/para/outro/.env
```

O token do `.env.local` só é usado pelo `npm run dev`. O `npm run build` nunca o inclui e
falha se encontrar qualquer token em `dist/`.

## Conferir medidas

A interface segue as medidas do ClickUp em 1919×910. Para comparar as duas na mesma resolução,
cole `scripts/ui-metrics.js` no console do DevTools de cada página e chame `uiMetrics(...)` com os
seletores de `scripts/ui-reference.json`. O mesmo arquivo traz os valores esperados: tamanhos com
tolerância de 1px e cores exatas.

## Scripts

| Script | O que faz |
| --- | --- |
| `npm run dev` | servidor de desenvolvimento |
| `npm run dev:token` | copia `CLICKUP_API_KEY` de outro `.env` para o `.env.local` |
| `npm run build` | build de produção em `dist/`, com verificação de segredos |
| `npm run preview` | serve o build localmente |
| `npm run typecheck` | checagem de tipos |
| `npm run lint` | lint e formatação (Biome) |
| `npm run format` | corrige formatação e organiza imports |
| `npm run test` | testes (Vitest) |
| `npm run check` | typecheck, lint e testes |

## Créditos

Os ícones dos tipos de tarefa usam [Font Awesome Free](https://fontawesome.com/),
da Fonticons, Inc., sob a licença
[Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/).
Os caminhos SVG são utilizados sem alterações no desenho, com tamanho e cor definidos
pela interface. As marcas representadas pertencem aos respectivos titulares.
