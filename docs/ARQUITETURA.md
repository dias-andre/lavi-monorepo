# Arquitetura e funcionamento

Este documento descreve o que está implementado neste repositório e o que ainda parece incompleto. O projeto é um backend acadêmico arquivado; nomes de rotas e fluxos podem mudar caso o código seja retomado.

## Visão geral

```text
Aplicativo cliente
   ├── HTTP ─────> API (Elysia) ───> PostgreSQL
   │                    ├──────────> Redis (evento de pedido)
   │                    └──────────> AWS S3 (imagens)
   └── Socket.IO ─> Realtime ──────> PostgreSQL / API / Redis

Worker ──> Redis (fila de notificações; trabalho incompleto)
```

Cada pasta é um pacote Bun separado. Não existe workspace raiz nem script único para instalar, testar ou iniciar o monorepo.

## `api/`: API HTTP e domínio

O início da aplicação está em `api/src/index.ts`. Em produção ele tenta iniciar em modo cluster; nos demais ambientes inicia um servidor Elysia. `api/src/infra/http/app.ts` agrega as rotas, disponibiliza OpenAPI em `/openapi`, redireciona `/` para essa documentação e expõe `/ping` como verificação simples.

As rotas delegam aos serviços de domínio, que por sua vez chamam repositórios Drizzle. A montagem das dependências fica em `api/src/generators/index.ts`. As entidades/tabelas estão em `api/src/infra/database/tables/schema/`, e as migrações SQL existentes estão em `api/drizzle/`.

| Módulo | Responsabilidade principal |
| --- | --- |
| `customer` | Cadastro, autenticação, perfil, pedidos do cliente e notificações |
| `member` | Contas de equipe/gerência, autenticação, associações a lavanderias |
| `laundry` | Cadastro e consulta de lavanderias, pedidos e banners/imagem |
| `catalog-item` | Itens e preços do catálogo de uma lavanderia |
| `order` | Criação e atualização de pedidos e itens associados |
| `feedback` | Avaliações de lavanderias e imagens associadas |
| `notifications` | Consulta e atualização de status de notificações |
| `chat` | Conversas e mensagens persistidas |

Os caminhos centrais visíveis no código incluem `/customers`, `/members`, `/laundries`, `/catalogs`, `/orders`, `/feedbacks`, `/notifications` e `/chats`. Os métodos e subcaminhos variam conforme o módulo. A lista efetiva de rotas e seus schemas pode ser consultada pelo OpenAPI quando a API inicia com sucesso.

### Banco e migrações

O banco é PostgreSQL. `api/src/infra/database/conn.ts` cria a conexão Drizzle usando `DATABASE_URL` e verifica a conexão com `SELECT 1` na inicialização. O schema define, entre outras, tabelas para clientes, membros, lavanderias, pedidos, itens do catálogo, avaliações, notificações e chat. A configuração do Drizzle está em `api/drizzle.config.ts`.

Os scripts do pacote da API incluem `db:schema` (geração de migrações) e `db:migrate` (aplicação de migrações). A configuração procura `.env.development` ou `.env.production` dentro de `api/`, conforme `NODE_ENV`.

### Segurança e arquivos

`CryptoProvider` e `JwtProvider` concentram operações de criptografia/HMAC e JWT; os serviços de cliente e membro os usam em fluxos de cadastro/autenticação. `S3Provider` e `MediaService` tratam imagens e banners. As chaves e credenciais são configuradas por ambiente. O repositório não deve ser considerado auditado: a existência desses componentes não garante que todos os caminhos validem autorização, exposição de campos sensíveis ou configuração segura de segredos.

## `realtime/`: eventos Socket.IO

O serviço valida algumas variáveis de ambiente, conecta ao Redis e inicia o servidor Socket.IO pelo engine para Bun. Clientes podem emitir `customer-auth` ou `member-auth`; o serviço valida o token chamando endpoints HTTP da API e então coloca o socket em salas como `user:<id>`, `customers`, `members` e `laundry:<id>`.

O evento `create-message` grava uma mensagem no PostgreSQL e emite atualizações para os participantes e a sala da lavanderia. O serviço também se inscreve no canal Redis `order-created`: quando recebe um pedido publicado pela API, emite notificações em tempo real e solicita à API que persista uma notificação para o cliente.

O código também contém eventos de notificação geral. A autorização desses eventos precisa ser revista antes de expor o serviço a clientes externos.

## `worker/`: estado do processamento assíncrono

O `worker/src/index.ts` atual somente imprime `Hello via Bun!`; não chama validação de ambiente nem inicializa o consumidor. `worker/src/redis/queues/notification.ts` contém um loop com `BLPOP` e uma função `executeTask` demonstrativa, mas essa implementação não está ligada ao ponto de entrada e não executa uma ação de negócio útil. Portanto, tarefas assíncronas não devem ser consideradas operacionais por meio deste serviço.

## Eventos Redis e fluxo de pedidos

Ao criar um pedido, a API salva o pedido e seus itens e publica o payload no canal Redis `order-created`. O serviço `realtime` consome esse canal, emite eventos para sockets e registra a notificação do cliente por meio da API. A chamada do publisher no endpoint de criação não é aguardada, e o publisher captura erros sem propagar falha; assim, um pedido pode ser criado mesmo que o evento não seja entregue.

Há também um provedor de fila que faz `RPUSH`, enquanto o consumidor rascunhado usa `BLPOP`. Esse caminho não corresponde ao fluxo de pedidos (que usa Pub/Sub) e ainda não tem tarefa concluída.

## Executar localmente com Podman

O Compose principal agora descreve um ambiente local de demonstração com PostgreSQL, Redis, API e realtime. O worker não é iniciado porque ainda não processa tarefas. Com Podman e `podman-compose` instalados:

```sh
cp .env.example .env
podman-compose up --build
```

O primeiro início constrói as imagens e a API aplica as migrações do Drizzle antes de iniciar o servidor. A API responde em `http://localhost:3000`; OpenAPI fica em `/openapi` e a verificação simples em `/ping`. O Socket.IO escuta na porta `3300`. Para executar em segundo plano, acrescente `-d`; `podman-compose logs -f` acompanha os logs e `podman-compose down` para os containers. O volume `lavi_postgres_data` mantém o banco entre reinícios.

O ambiente usa chaves e credenciais locais de exemplo e não é adequado para produção. Os fluxos de upload de arquivos precisam de credenciais AWS válidas e de um bucket S3 existente; os valores placeholder só permitem que os serviços iniciem. A composição local não tenta imitar o S3.

Não há Compose de produção mantido; o workflow antigo de deploy não é coberto por estas instruções. Para executar processos fora dos containers, cada pacote tem scripts `dev` e `start`, mas será necessário fornecer as mesmas dependências e variáveis descritas abaixo.

Variáveis observadas no código:

| Serviço | Variáveis usadas ou validadas |
| --- | --- |
| API | `DATABASE_URL`, `ENCRYPT_CORE_KEY`, `BLIND_KEY`, `JWT_KEY`, `BUCKET_NAME`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `REDIS_HOST`, `REDIS_PORT`, `PORT`, `NODE_ENV` |
| Realtime | `API_ADDR` (URL completa), `WS_PORT`, `REDIS_HOST`, `REDIS_PORT`, `DATABASE_URL`, `NODE_ENV` |
| Worker | `REDIS_HOST`, `REDIS_PORT`, `NODE_ENV` (o consumidor não é iniciado pelo entrypoint atual) |

As validações de ambiente não são completas nem iguais entre os serviços. A API usa `REDIS_PORT` em tempo de execução, embora seu schema de validação não o exija. As conexões de banco também são construídas em realtime mesmo que `DATABASE_URL` não esteja no schema de validação dele. O Compose local fornece explicitamente essas variáveis.

## Problemas conhecidos no repositório

Estes itens podem impedir execução ou causar comportamento inesperado; não são uma auditoria exaustiva.

1. **Não há composição de produção.** O Compose disponível é somente para a demo local, com credenciais e defaults de desenvolvimento. O workflow de deploy antigo não deve ser tratado como caminho de produção funcional.
2. **Worker sem trabalho conectado.** O entrypoint não executa consumidor e a função de processamento existente é só ilustrativa.
3. **Eventos de socket sem autorização suficiente demonstrada.** Eventos de notificação global estão registrados no servidor. Revise identidade, autorização e limites de emissão antes de uso público.
4. **Cluster da API não supervisiona workers.** O modo cluster cria um processo por CPU, sem lógica visível de substituição/encerramento coordenado; isso merece revisão operacional.
5. **CI/CD aparentemente obsoleto.** `.github/workflows/deploy.yml` usa caminhos/nome de projeto que não combinam claramente com este repositório, e depende de scripts remotos e segredos externos.
6. **Cobertura de testes reduzida.** Os testes presentes verificam principalmente ping e cadastro básico de cliente; não dão segurança sobre permissões, pedidos, pagamentos, mídia ou operação distribuída.
7. **Permissões incompletas em rotas HTTP.** O validador de sessão do cliente é montado apenas antes de um subconjunto de rotas de cliente. Rotas de cadastro de membro, criação de notificações, consultas de chat e diversos recursos de lavanderia/pedido são montados sem um guard visível. Onde o guard existe, o código valida o token, mas os handlers ainda aceitam IDs vindos da URL sem comparar explicitamente com a identidade do token. Isso pode permitir acesso cruzado entre contas.
8. **Upload de imagem de lavanderia atualiza o repositório errado.** `MediaService.uploadLaundryProfileImage` encontra a lavanderia, mas persiste o `profile_url` via `customerRepository.update`; a imagem pode ir para o S3 sem atualizar a lavanderia corretamente.
9. **Validação de imagens de avaliação parece invertida.** `MediaService.uploadFeedbackImages` lança “Feedback não encontrado” quando `findById` retorna um registro existente; o caminho normal de upload pode rejeitar avaliações válidas e aceitar IDs inexistentes até a inserção.
10. **Notificação de membro usa o fluxo de cliente.** A rota `/members/:memberId/notifications` chama `createCustomerNotification`, que procura o ID na tabela de clientes e grava `userType: "customer"`. O método de serviço próprio para membro existe, mas essa rota não o utiliza.
11. **Exclusão de banner deixa registro persistido.** A rotina apaga o objeto do S3, mas não remove a linha correspondente da tabela de banners. A listagem pode continuar retornando um banner cujo arquivo já foi removido.
12. **Expiração do JWT longa.** `JwtProvider` emite tokens com validade de um ano. Isso amplia o impacto de uma credencial vazada e deve ser revisto junto com revogação e renovação de sessão.
13. **Consulta de mensagens não exige identidade visível.** `GET /messages/:chat_id` retorna mensagens pelo ID da conversa sem um controle de autorização no handler. Dados de conversa devem ser tratados como privados.

## Testes

O pacote `api` usa `bun:test`; os testes ficam em `api/tests/`. Não há script `test` declarado no `package.json`, então a execução deve ser feita conforme a configuração local do Bun e pode exigir ambiente de banco. A existência desses testes não implica cobertura abrangente.
