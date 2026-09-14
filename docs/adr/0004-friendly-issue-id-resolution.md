# ADR 0004 — Resolver IDs amigáveis existentes sem alterar seus prefixos

Status: aceita; resolução MCP pendente de implementação.

O Horizon já exibe IDs amigáveis, mas o algoritmo de exibição não garante
unicidade. Vamos preservar esses códigos e permitir sua resolução pelo MCP
apenas quando não houver ambiguidade no Escopo, sem introduzir um cadastro de
prefixos nem alterar automaticamente os códigos exibidos.

## Comportamento existente

A função `issueCode`, em `apps/web/src/lib/issue-presentation.ts`, separa
`project.path` por hífens e underscores, descarta partes vazias e usa a inicial
de cada parte quando há múltiplas partes. Caso contrário, usa os dois primeiros
caracteres de `project.path`. O prefixo é convertido para maiúsculas e recebe
`-<iid>`; sem metadados do repositório, a exibição usa `#<iid>`.

Assim, tanto `data-control` quanto `data-center` produzem `DC`. O namespace
não participa da geração do prefixo. A navegação atual da UI usa referências
técnicas; não existe um mecanismo de resolução de colisões para reutilizar.

## Resolução pelo MCP

Uma referência de Issue aceita exatamente uma destas alternativas estruturadas:

```json
{ "project_path": "group/data-control", "issue_iid": 123 }
```

```json
{ "friendly_id": "DC-123" }
```

`project_path` é o caminho completo do repositório no Provider, incluindo seu
namespace. Ambas as formas respeitam o Escopo configurado. Na implementação,
a lógica existente de geração deve ir para um pacote compartilhado, evitando
divergência entre a exibição na UI e a resolução pelo MCP.

Resolver o prefixo entre os repositórios do Escopo. Se múltiplos repositórios
compartilharem o prefixo, retornar um conflito estruturado de ambiguidade com
os caminhos candidatos e exigir `project_path` mais `issue_iid`. Não escolher
um repositório pela presença da Issue no cache nem selecionar silenciosamente
o primeiro resultado. Havendo um único repositório, resolver o IID nele;
repositórios ou Issues inexistentes retornam erro estruturado de não encontrado.

Os códigos amigáveis são atalhos, não identidades permanentes: renomear um
repositório ou alterar o Escopo pode mudar um código ou torná-lo ambíguo. O MCP
precisa manter referências técnicas nos resultados para permitir desambiguação.

A expansão automática e o cadastro explícito de prefixos foram descartados
porque introduziriam novas regras de identidade e mudariam a exibição existente
apenas para atender à interface adicional.
