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

## Executar ou desenvolver

Não há, no estado atual, um procedimento Docker confiável de ponta a ponta. Para trabalho local, as dependências externas esperadas são PostgreSQL, Redis e credenciais/configuração de S3, além do Bun. Cada serviço contém scripts `dev` e `start`, mas iniciar os processos exige preparar cada diretório, configurar variáveis próprias e garantir conectividade entre serviços.

Variáveis observadas no código:

| Serviço | Variáveis usadas ou validadas |
| --- | --- |
| API | `DATABASE_URL`, `ENCRYPT_CORE_KEY`, `BLIND_KEY`, `JWT_KEY`, `BUCKET_NAME`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `REDIS_HOST`, `REDIS_PORT`, `PORT`, `NODE_ENV` |
| Realtime | `API_ADDR`, `WS_PORT`, `REDIS_HOST`, `REDIS_PORT`, `DATABASE_URL`, `NODE_ENV` |
| Worker | `REDIS_HOST`, `REDIS_PORT`, `NODE_ENV` (o consumidor não é iniciado pelo entrypoint atual) |

As validações de ambiente não são completas nem iguais entre os serviços. O realtime valida `API_ADDR` como hostname, enquanto o Compose fornece um valor com protocolo (`http://api`); isso pode causar rejeição na validação. A API usa `REDIS_PORT` em tempo de execução, embora seu schema de validação não o exija. As conexões de banco também são construídas em realtime mesmo que `DATABASE_URL` não esteja no schema de validação dele.

## Problemas conhecidos no repositório

Estes itens podem impedir execução ou causar comportamento inesperado; não são uma auditoria exaustiva.

1. **Compose sem banco no conjunto base/produção.** `docker-compose.yaml` define Redis e aplicações, mas não PostgreSQL. O serviço `database` aparece apenas em `docker-compose.dev.yaml`, não no Compose de produção.
2. **Rede do banco em desenvolvimento.** O Compose base conecta API/Realtime à rede `lavi_backend`; o serviço `database` no overlay de desenvolvimento não declara essa rede. O host `database` pode não ser alcançável pelos serviços da aplicação.
3. **Porta Redis possivelmente incompatível.** O Redis da imagem usa 6379 por padrão, mas o overlay publica `${REDIS_PORT}:${REDIS_PORT}` sem configurar a porta interna do Redis. Valores diferentes de 6379 podem falhar.
4. **Ambiente e script de inicialização desalinhados.** `ci/setup.sh` copia o mesmo `.env` da raiz para três arquivos. O código e os Compose esperam configurações distintas; o exemplo antigo do README não documentava todas elas.
5. **Endereço do realtime.** O Compose define `API_ADDR=http://api`, mas o schema de validação do serviço declara `API_ADDR` como `idn-hostname`, sem protocolo.
6. **Worker sem trabalho conectado.** O entrypoint não executa consumidor e a função de processamento existente é só ilustrativa.
7. **Eventos de socket sem autorização suficiente demonstrada.** Eventos de notificação global estão registrados no servidor. Revise identidade, autorização e limites de emissão antes de uso público.
8. **Cluster da API não supervisiona workers.** O modo cluster cria um processo por CPU, sem lógica visível de substituição/encerramento coordenado; isso merece revisão operacional.
9. **CI/CD aparentemente obsoleto.** `.github/workflows/deploy.yml` usa caminhos/nome de projeto que não combinam claramente com este repositório, e depende de scripts remotos e segredos externos.
10. **Cobertura de testes reduzida.** Os testes presentes verificam principalmente ping e cadastro básico de cliente; não dão segurança sobre permissões, pedidos, pagamentos, mídia ou operação distribuída.
11. **Permissões incompletas em rotas HTTP.** O validador de sessão do cliente é montado apenas antes de um subconjunto de rotas de cliente. Rotas de cadastro de membro, criação de notificações, consultas de chat e diversos recursos de lavanderia/pedido são montados sem um guard visível. Onde o guard existe, o código valida o token, mas os handlers ainda aceitam IDs vindos da URL sem comparar explicitamente com a identidade do token. Isso pode permitir acesso cruzado entre contas.
12. **Upload de imagem de lavanderia atualiza o repositório errado.** `MediaService.uploadLaundryProfileImage` encontra a lavanderia, mas persiste o `profile_url` via `customerRepository.update`; a imagem pode ir para o S3 sem atualizar a lavanderia corretamente.
13. **Validação de imagens de avaliação parece invertida.** `MediaService.uploadFeedbackImages` lança “Feedback não encontrado” quando `findById` retorna um registro existente; o caminho normal de upload pode rejeitar avaliações válidas e aceitar IDs inexistentes até a inserção.
14. **Notificação de membro usa o fluxo de cliente.** A rota `/members/:memberId/notifications` chama `createCustomerNotification`, que procura o ID na tabela de clientes e grava `userType: "customer"`. O método de serviço próprio para membro existe, mas essa rota não o utiliza.
15. **Exclusão de banner deixa registro persistido.** A rotina apaga o objeto do S3, mas não remove a linha correspondente da tabela de banners. A listagem pode continuar retornando um banner cujo arquivo já foi removido.
16. **Expiração do JWT longa.** `JwtProvider` emite tokens com validade de um ano. Isso amplia o impacto de uma credencial vazada e deve ser revisto junto com revogação e renovação de sessão.
17. **Consulta de mensagens não exige identidade visível.** `GET /messages/:chat_id` retorna mensagens pelo ID da conversa sem um controle de autorização no handler. Dados de conversa devem ser tratados como privados.

## Testes

O pacote `api` usa `bun:test`; os testes ficam em `api/tests/`. Não há script `test` declarado no `package.json`, então a execução deve ser feita conforme a configuração local do Bun e pode exigir ambiente de banco. A existência desses testes não implica cobertura abrangente.
