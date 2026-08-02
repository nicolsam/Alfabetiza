# Referência Da API

Todas as rotas protegidas esperam:

```text
Authorization: Bearer <token>
```

Respostas comuns de erro incluem `401 Unauthorized`, `401 Invalid token`, `403 Forbidden`, `404 Not found`, erros de validação `400` e `500 Internal error`.

## Auth

- `POST /api/auth`: cadastro ou login com `action`.
- `POST /api/auth/heartbeat`: atualiza atividade de sessão para o token atual.

## Dashboard

- `GET /api/dashboard`: retorna total de alunos, distribuição por nível de leitura, alunos que precisam de atenção, nível mais comum e contagem de melhoria mensal.
- Suporta filtro opcional por query `schoolId` onde implementado pelo dashboard.

## Escolas

- `GET /api/schools`: lista escolas atribuídas ao professor atual.
- `POST /api/schools`: cria uma escola e atribui ao professor atual.
- `PUT /api/schools/[id]`: atualiza dados da escola quando o professor tem acesso.
- `DELETE /api/schools/[id]`: faz soft delete de uma escola.
- `PATCH /api/schools/[id]/restore`: restaura uma escola excluída logicamente.

## Turmas

- `GET /api/classes`: lista turmas visíveis ao professor atual. Suporta filtro por escola.
- `POST /api/classes`: cria uma turma em uma escola acessível.
- `PUT /api/classes/[id]`: atualiza ano, seção ou turno.
- `DELETE /api/classes/[id]`: faz soft delete de uma turma.
- `PATCH /api/classes/[id]/restore`: restaura uma turma excluída logicamente.

Criação e atualização de turmas validam ano, seção, turno, acesso professor-escola e duplicidade pela regra de unicidade.

## Alunos

- `GET /api/students`: lista alunos visíveis. Suporta filtro por escola e turma.
- `POST /api/students`: cria um aluno em uma turma acessível.
- `PUT /api/students/[id]`: atualiza dados do aluno.
- `DELETE /api/students/[id]`: faz soft delete de um aluno.
- `PATCH /api/students/[id]/restore`: restaura um aluno excluído logicamente.
- `PATCH /api/students/update`: cria ou substitui um nível mensal usando `referenceMonth` (`MM/AAAA`). Meses existentes retornam `409 MONTH_ALREADY_RECORDED` até o reenvio com `confirmReplace: true`.
- `GET /api/students/[id]/history`: retorna detalhes do aluno e histórico de leitura.

Números de aluno são únicos dentro de uma escola.
Avaliações de leitura são únicas por aluno, tipo de avaliação e mês de referência; o dia exato da avaliação não é armazenado.

## Níveis De Leitura

- `GET /api/levels`: retorna níveis de leitura ordenados.

Níveis de leitura são dados de referência semeados e não devem ser alterados casualmente pelo código da aplicação.

## Admin

Rotas admin exigem `isGlobalAdmin`.

- `GET /api/admin/stats`: estatísticas agregadas do dashboard admin.
- `GET /api/admin/logs`: logs de auditoria.
- `GET /api/admin/sessions`: informações de sessões ativas.

## Notas De Implementação Das Rotas

Arquivos de rota ficam em `src/app/api`. Mantenha validação perto da borda das rotas, use Prisma por meio de `src/lib/db.ts` e preserve formatos de resposta existentes, a menos que testes e consumidores do frontend sejam atualizados juntos.
