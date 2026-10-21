# Performance

## Estado da medição

O build de produção da etapa de leitura de tarefas foi gerado em 21/10/2026.
As medições anteriores abaixo são uma referência da casca inicial, sem a lista de
tarefas. Elas não comprovam o consumo nem o tempo de abertura da versão atual.

| Métrica | ClickUp, referência anterior | Tasklight, casca inicial |
| --- | --- | --- |
| Chrome inteiro, uma aba | aproximadamente 1.036 MB | 270 MB |
| Processo da página | 753 MB | 19–27 MB |
| Heap JavaScript | não comparado neste ensaio | 2,7 MB |
| Nós de DOM | não comparados neste ensaio | 59 com sidebar recolhida; 87 expandida |
| JavaScript inicial comprimido com gzip | não medido com o mesmo método | 52,7 KB |

O total do navegador inclui processos de suporte. Ele deve ser registrado
separadamente do processo da página e do heap JavaScript.

## Etapa de leitura de tarefas

O build registrou **239,22 KB de JavaScript, ou 79,69 KB gzip**, e verificou a ausência
de tokens no conteúdo de `dist/`. O resultado fica abaixo da meta de 150 KB gzip;
memória, DOM e tempo de abertura ainda precisam ser medidos
na aplicação de produção com tarefas carregadas.

| Métrica | Meta | Validação atual |
| --- | --- | --- |
| Memória privada do processo da página | até 150 MB | pendente |
| Heap JavaScript | até 30 MB | pendente |
| Nós de DOM | até 1.500 | pendente |
| Tempo até mostrar tarefas com snapshot | menos de 2 s | pendente no navegador |
| JavaScript inicial gzip | até 150 KB | 79,69 KB |

Os testes automatizados verificam a abertura a partir do snapshot antes da resposta
da API, a revalidação da sessão em segundo plano, o descarte de respostas antigas e
a interrupção da sincronização ao trocar ou fechar o workspace. Esses testes
verificam o comportamento; não medem o tempo percebido em um navegador real.

A lista com dados reais e a navegação de ida e volta para Hoje e atrasadas foram
conferidas no Chrome em 21/10/2026, no servidor de desenvolvimento. Essa conferência
não substitui o ensaio de produção nas condições abaixo.

## Como repetir

1. Execute `npm run check` e `npm run build`.
2. Sirva `dist/` com `npm run preview`. O snapshot e o token pertencem à origem:
   trocar de porta cria um ambiente de armazenamento diferente.
3. Use uma aba, viewport de 1919×910 e o mesmo perfil do Chrome nas duas aplicações.
   Registre também a versão do navegador e as condições da máquina.
4. Com o gerenciador de tarefas do Chrome, registre o processo da página e o heap
   JavaScript. Registre o total do Chrome separadamente.
5. Conte os nós DOM depois da sincronização e durante a rolagem. A lista deve manter
   apenas as linhas próximas à área visível renderizadas.
6. Meça a primeira abertura sem snapshot e três reaberturas com snapshot. Compare
   o instante da primeira linha visível com o da primeira resposta da API.
7. Sem modificar tarefas, confira os grupos, a alternância de fechadas, a expansão
   de subtarefas, a navegação entre workspaces e a leitura sem conexão.

Faça a comparação de dados com as duas aplicações atualizadas no mesmo instante.
Contagens antigas podem mudar com atribuições, exclusões e alterações de status.
Tarefas da Personal List podem aparecer a mais no Tasklight: a API não apresentou um
campo confiável para distingui-las neste fluxo. A ausência de um espaço na navegação
não é usada para excluir tarefas, pois também ocorre em tarefas compartilhadas.

Screenshots, respostas da API e outros registros com dados privados ficam fora do
repositório público. Não inclua o token em capturas, logs ou relatórios.
