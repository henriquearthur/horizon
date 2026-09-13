# 2. O Bloqueio não usa scoped label

Data: 2026-09-13

## Status

Aceito.

## Contexto

Status, Prioridade e Projeto são gravados como Labels Horizon no formato
`horizon::<campo>::<valor>`. O GitLab trata qualquer label com `::` como
_scoped label_ e mantém apenas uma label por escopo: aplicar
`horizon::status::Concluído` remove `horizon::status::Backlog` sozinho, que é
exatamente o que queremos para um campo de valor único.

O Bloqueio não é um campo de valor único. Uma Issue pode bloquear várias
outras. Se o vínculo fosse escrito como `horizon::blocks::<alvo>`, todas as
labels de bloqueio da mesma Issue cairiam no escopo `horizon::blocks` e o
GitLab manteria apenas a última — a Issue nunca bloquearia mais de uma.

## Decisão

O vínculo de bloqueio usa um nome sem `::`:

```
horizon-blocks:<projeto origem>:<iid origem>:<projeto alvo>:<iid alvo>
```

A label mora na Issue que bloqueia. As duas direções são derivadas lendo as
labels de todo o Escopo, então `é bloqueada por` não precisa de gravação no
outro lado.

## Consequências

- Uma Issue pode ter quantos bloqueios forem necessários.
- O prefixo `horizon-` entra no conjunto de Labels Horizon, que a interface
  esconde da lista de labels (`isHorizonLabel`).
- Um vínculo cujo outro lado está fora do Escopo continua legível, marcado como
  fora de alcance, em vez de sumir.
