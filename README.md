# Tasklight

Cliente leve para o ClickUp: interface familiar, uma fração da memória.

> **Cliente não oficial.** O Tasklight não tem afiliação com a ClickUp. Ele usa a
> [API pública do ClickUp](https://developer.clickup.com/) com o seu token pessoal.

## Status

Em desenvolvimento.

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
