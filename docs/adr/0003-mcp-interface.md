# ADR 0003 — Compartilhar as operações de domínio do Horizon com uma interface MCP

Status: aceita; implementação pendente.

O Horizon precisa de uma interface para agentes com paridade completa das
operações de domínio disponíveis na UI, além das operações de implementação
de issues. O contrato ficará em `packages/mcp`, com ferramentas pequenas e
transporte Streamable HTTP servido por `apps/web`, compartilhando as regras
de negócio e a Conexão existente com a interface web.

## Limites e reutilização

Reutilizar `packages/domain` e extrair pacotes comuns quando necessário, sem
duplicar as regras da interface web nos handlers MCP. `packages/mcp` concentra
schemas, descrições e handlers; `apps/web` fornece o transporte e injeta as
dependências. Um aplicativo separado e transporte stdio ficam fora da entrega
inicial.

A paridade inclui consultas e alterações de Issues, comentários, Status,
Prioridade, Labels, responsáveis e demais campos editáveis, Sub-issues,
Bloqueios, Projetos, Views salvas, configuração do Escopo e metadados.
Preferências puramente visuais, como tema, ficam fora. As ferramentas usam o
Escopo configurado: chamadas de Issue não podem substituí-lo para acessar
repositórios arbitrários. A gestão explícita do Escopo continua disponível,
assim como na UI.

Código novo, nomes das ferramentas, schemas, descrições e textos gerados nos
comentários serão em inglês. A UI mantém seus rótulos em português. Os ADRs
podem ser escritos em português.

## Implantação

O servidor escutará em `0.0.0.0`, sem autenticação MCP, para uso pessoal na
máquina do usuário e na Tailnet. A configuração de rede controla quem alcança
a porta: escutar em todas as interfaces não restringe o acesso ao Tailscale.
Quem alcançar o endpoint poderá executar suas operações com a credencial do
Provider mantida no servidor. Publicação na internet está fora do escopo,
coerentemente com o [ADR 0001](0001-conexao-vem-do-ambiente.md).

## Ciclo de implementação

| Ferramenta       | Status de origem              | Status resultante | Corpo do comentário                                  |
| ---------------- | ----------------------------- | ----------------- | ---------------------------------------------------- |
| `start_issue`    | Backlog                       | Em andamento      | Mensagem de início gerada pelo servidor              |
| `handoff_issue`  | Em andamento                  | Pausada           | `handoff_text` obrigatório, preservado integralmente |
| `resume_issue`   | Pausada                       | Em andamento      | Mensagem de retomada gerada pelo servidor            |
| `complete_issue` | Qualquer Status não concluído | Concluído         | Report obrigatório da implementação                  |

Chamadas já refletidas no estado final devem ser idempotentes; transições
semanticamente inválidas retornam conflito. Não será exigida chave de
idempotência do chamador. O Status sozinho não comprova que o comentário foi
publicado: uma repetição precisa reconciliar os dois efeitos antes de informar
sucesso e evitar duplicar uma atividade já registrada.

`Pausada` passa a ser um Status oficial no domínio, na UI e nos filtros. Os
valores internos e MCP previstos são `backlog`, `in_progress`, `paused` e
`completed`, mantendo os rótulos da UI em português. O código atual e as labels
persistidas usam valores em português; a implementação precisa preservar
labels e Views existentes por mapeamento de compatibilidade ou migração, sem
passar a tratá-las silenciosamente como valores desconhecidos.

O agente chamador usa a skill externa do usuário em
`~/.agents/skills/handoff` para preparar `handoff_text`. O Horizon não distribui
nem executa essa skill: a ferramenta MCP recebe seu resultado e registra o
handoff.

## Catálogo publicado

O catálogo só anuncia ferramentas implementadas: uma ferramenta que falha
sempre custa mais ao agente do que a sua ausência. Views salvas e Sub-issues
seguem previstas nesta decisão, mas `list_views` e `create_sub_issue` saem do
catálogo até existir implementação.

Cada ferramenta declara no `inputSchema` todos os parâmetros que aceita, com
enum nos valores canônicos, e um argumento não declarado é `validation_error`
com a lista aceita — nunca um filtro silenciosamente ignorado. As leituras de
coleção devolvem resumos paginados; a descrição das Issues só vem quando
pedida.

## Identificação nos comentários

Toda ferramenta MCP que cria comentários, inclusive a ferramenta genérica,
exige os campos estruturados `model`, `harness` e `session_id`. Eles são
negociados uma vez por conexão, nos cabeçalhos `X-Horizon-Model`,
`X-Horizon-Harness` e `Mcp-Session-Id` — o `clientInfo` do MCP serve de
`harness` padrão —, e os argumentos de mesmo nome continuam disponíveis como
override por chamada. O servidor valida os campos e acrescenta uma citação
Markdown de no máximo duas linhas no texto-fonte, seguida do corpo. Exemplo:

```markdown
> **Model:** `gpt-6` · **Harness:** `Codex` · **Session:** `abc123`

Implementation report or handoff text.
```

Comentários humanos feitos pela UI não exigem esses metadados. A escrita
compartilhada precisa distinguir comentários humanos daqueles originados pelo
MCP.

## Falhas e concorrência

Validar identificadores, Escopo, metadados, corpo e transição antes de realizar
alterações. Coordenar Status e comentário como uma operação lógica, com
controle otimista de conflitos diante do estado atual no Provider. Retornar
erros estruturados de ferramenta, como `validation_error`, `not_found`,
`conflict` e `provider_error`, incluindo o estado atual quando disponível.

O Provider não oferece uma transação atômica entre Status e comentário. Uma
falha parcial precisa informar os efeitos aplicados, os que falharam e os de
resultado desconhecido, além de indicar se foi possível reler o estado.
Nunca informar sucesso completo com apenas um efeito aplicado. Uma eventual
compensação não pode sobrescrever alterações intervenientes de outro agente
ou usuário.

Esta decisão estabelece o comportamento desejado, sem prometer execução
exatamente uma vez. O desenho da implementação ainda precisa especificar
reconciliação de repetições, compensação e limites de concorrência suportados
pelo Provider antes de afirmar essas garantias. Esta documentação não
implementa mecanismos de bloqueio ou transação.

As referências de Issue e o tratamento de ambiguidades estão definidos no
[ADR 0004](0004-friendly-issue-id-resolution.md).
