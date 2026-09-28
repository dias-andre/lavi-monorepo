# Laví API

![Bun](https://img.shields.io/badge/Bun-%23000000.svg?style=for-the-badge&logo=bun&logoColor=white)
![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white)
![Postgres](https://img.shields.io/badge/postgres-%23316192.svg?style=for-the-badge&logo=postgresql&logoColor=white)
![Docker](https://img.shields.io/badge/docker-%230db7ed.svg?style=for-the-badge&logo=docker&logoColor=white)
![GitHub Actions](https://img.shields.io/badge/github%20actions-%232671E5.svg?style=for-the-badge&logo=githubactions&logoColor=white)

![Maintainer](https://img.shields.io/badge/maintainer-https--dre-blue)

> **Projeto arquivado.** Este repositório foi desenvolvido como trabalho de conclusão de curso e não recebe manutenção regular. O código contém bugs e lacunas conhecidos; não considere o sistema pronto para produção nem use dados ou credenciais reais sem uma revisão técnica e de segurança.

## Sobre o projeto

A **Laví API** é o backend de uma plataforma de lavanderias. O repositório é um monorepo com uma API HTTP, um serviço de comunicação em tempo real e um worker planejado. A API reúne fluxos de clientes, lavanderias, pedidos, catálogo, avaliações, notificações e conversas.

O código usa Bun e TypeScript. A API HTTP foi construída com Elysia e Drizzle ORM, com PostgreSQL para persistência, Redis para eventos e filas e AWS S3 para arquivos. O serviço em tempo real usa Socket.IO.

## Estado atual e limitações

- A API tem implementação para os principais módulos do domínio, mas há poucos testes automatizados no repositório e eles não cobrem os fluxos completos.
- `worker` ainda é um scaffold: seu ponto de entrada só imprime uma mensagem. Existe um consumidor Redis separado, mas não é iniciado pelo ponto de entrada e sua tarefa atual é apenas ilustrativa.
- A configuração local de Podman Compose prepara API, realtime, PostgreSQL, Redis e migrações com valores de desenvolvimento. Não há uma composição de produção mantida; o workflow antigo de deploy precisa de revisão.
- Recursos de upload para S3 não funcionam com os placeholders locais: precisam de credenciais AWS e bucket configurado.
- A action de deploy parece ter caminhos e nomes de repositório antigos e não deve ser considerada uma implantação funcional sem revisão.
- A autenticação e as permissões devem ser auditadas. Algumas rotas são montadas antes do validador de sessão, e eventos do Socket.IO incluem eventos de notificação sem controle de autorização demonstrado no código.

Esses pontos são um retrato do código encontrado, não uma lista exaustiva de defeitos. Consulte [a documentação da arquitetura e operação](docs/ARQUITETURA.md) para detalhes e para entender cada parte do monorepo.

## Estrutura do repositório

```text
api/        API HTTP, regras de negócio, banco, arquivos e migrações
realtime/   Socket.IO, autenticação de conexões e eventos de chat/notificação
worker/     início de consumidor de fila Redis, ainda sem processamento útil
ci/         atalho para iniciar a demo com Podman Compose
docker-compose.yaml
            ambiente local de demonstração (Podman Compose)
docs/       documentação de arquitetura e estado conhecido
```

## Como explorar

Para subir o ambiente local com Podman, copie o exemplo de variáveis e inicie os serviços:

```sh
cp .env.example .env
podman-compose up --build
```

Como alternativa, `bash ci/start.sh` executa o mesmo comando. Passe `-d` ao script para iniciar em segundo plano.

Quando a API iniciar, as migrações do PostgreSQL são aplicadas automaticamente. A documentação OpenAPI fica em `http://localhost:3000/openapi` e o endpoint de saúde em `http://localhost:3000/ping`. O serviço Socket.IO fica na porta `3300`.

Para iniciar em segundo plano, use `podman-compose up --build -d`; para acompanhar a saída, `podman-compose logs -f`; para parar os serviços, `podman-compose down`. Os dados do PostgreSQL ficam em um volume Podman e são preservados ao parar os containers. O projeto não foi validado para produção.

Os pacotes são independentes e cada serviço possui seu próprio `package.json` e lockfile do Bun. O procedimento acima cobre o ambiente de demonstração local; consulte [ARQUITETURA.md](docs/ARQUITETURA.md) para conhecer os requisitos de S3 e as limitações antes de avaliar outros cenários.

## Documentação

- [Arquitetura, fluxos, módulos e problemas conhecidos](docs/ARQUITETURA.md)

## Créditos

EQUIPE: André de Oliveira, Arthur Rolemberg, Beatriz Bezerra,
Eduardo Rossi e Gabriel Durbano.

DESENVOLVEDORES:

- André Dias [@https-dre](https://github.com/https-dre)
- Arthur Rolemberg [@Massivo5040](https://github.com/Massivo5040)

ORIENTADORA: Nathane De Castro.

## Contato

André Dias - [diaso.andre@outlook.com](mailto:diaso.andre@outlook.com)
