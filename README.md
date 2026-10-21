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

## Scripts

| Script | O que faz |
| --- | --- |
| `npm run dev` | servidor de desenvolvimento |
| `npm run build` | build de produção em `dist/` |
| `npm run preview` | serve o build localmente |
| `npm run typecheck` | checagem de tipos |
| `npm run lint` | lint e formatação (Biome) |
| `npm run format` | corrige formatação e organiza imports |
| `npm run test` | testes (Vitest) |
| `npm run check` | typecheck, lint e testes |
