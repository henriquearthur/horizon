# ADR 0001 — A Conexão vem do ambiente

- Status: aceita
- Data: 2026-09-12
- Issue: #14

## Contexto

A Conexão (URL e token do GitLab) era cadastrada na UI, cifrada em disco com
`HORIZON_ENCRYPTION_KEY` e liberada por um cookie de sessão cujo hash ficava no
mesmo arquivo. Só existia um hash de sessão por instalação, então qualquer
segunda aba, reinício sem a chave de criptografia ou troca de cookie derrubava a
sessão. Na prática o Horizon "desconectava" sozinho e devolvia o usuário para a
tela de configuração inicial.

O Horizon é auto-hospedado e de um usuário só. Tratar a credencial como dado de
sessão criava um ciclo de vida que a aplicação não precisava ter.

## Decisão

A Conexão passa a fazer parte do deployment: `HORIZON_GITLAB_URL` e
`HORIZON_GITLAB_TOKEN` são lidos do ambiente (`.env.local` em desenvolvimento).

Consequências diretas:

- Não há mais cadastro de token na UI, criptografia em disco nem cookie de sessão.
- `/setup` fica só com a seleção do Escopo, e mostra um diagnóstico quando o
  ambiente está incompleto ou o token não alcança o GitLab.
- O único dado em disco é o Escopo, em `.horizon/scope.json`.

## Consequências

O Horizon não autentica mais quem abre a página: quem alcança a porta vê os
issues do Escopo. Isso é aceitável para um serviço pessoal atrás do Tailscale,
mas precisa de uma camada de autenticação antes de qualquer exposição mais
ampla. O token, por outro lado, deixa de ser exposto por qualquer rota.
