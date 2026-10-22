/**
 * Regras de dependência do ADR-001 (docs/13-padroes-de-arquitetura.md).
 * Executado por `npm run lint:arch` e na CI. Qualquer violação falha o build.
 */
const API = '^apps/api/src/';

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Regra 6: sem dependências circulares.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'engine-is-pure',
      severity: 'error',
      comment: 'Regra 1: o motor só depende de si mesmo e do zod.',
      from: { path: '^packages/engine/src/' },
      to: { dependencyTypes: ['npm', 'npm-dev', 'npm-peer', 'npm-optional', 'core'], pathNot: 'node_modules/zod/' },
    },
    {
      name: 'engine-no-monorepo',
      severity: 'error',
      comment: 'Regra 1: o motor não importa outros pacotes do monorepo.',
      from: { path: '^packages/engine/src/' },
      to: { path: '^(apps|packages/contracts)/' },
    },
    {
      name: 'http-only-use-cases',
      severity: 'error',
      comment: 'Regra 2: controllers chamam apenas casos de uso (e o tipo do serviço genérico de cadastro).',
      from: { path: `${API}http/` },
      to: { path: `${API}application/`, pathNot: `${API}application/(use-cases/|crud\\.ts$)` },
    },
    {
      name: 'http-not-to-persistence',
      severity: 'error',
      comment: 'Regra 2: controllers HTTP falam só com a camada de aplicação.',
      from: { path: `${API}http/` },
      to: { path: [`${API}persistence/`, 'node_modules/drizzle-orm/', 'node_modules/pg/'] },
    },
    {
      name: 'application-not-to-orm',
      severity: 'error',
      comment: 'Regra 3: a aplicação não usa o ORM nem o driver do banco.',
      from: { path: `${API}application/` },
      to: { path: ['node_modules/drizzle-orm/', 'node_modules/pg/'] },
    },
    {
      name: 'application-persistence-allowlist',
      severity: 'error',
      comment: 'Regra 3: a aplicação acessa dados só por repositórios, consultas, unit of work e tipos de linha.',
      from: { path: `${API}application/` },
      to: { path: `${API}persistence/`, pathNot: `${API}persistence/(repositories/|queries/|unit-of-work\\.ts$|models\\.ts$)` },
    },
    {
      name: 'domain-services-not-to-use-cases',
      severity: 'error',
      comment: 'Regra 3: serviços de domínio (application/*.ts) não dependem de casos de uso.',
      from: { path: `${API}application/[^/]+\\.ts$` },
      to: { path: `${API}application/use-cases/` },
    },
    {
      name: 'use-cases-are-independent',
      severity: 'error',
      comment: 'Regra 3: um caso de uso não chama outro; o que for comum vira serviço de domínio.',
      from: { path: `${API}application/use-cases/([^/]+)\\.ts$` },
      to: { path: `${API}application/use-cases/`, pathNot: `${API}application/use-cases/$1\\.ts$` },
    },
    {
      name: 'application-not-to-http',
      severity: 'error',
      comment: 'Regra 3: a aplicação não conhece HTTP.',
      from: { path: `${API}application/` },
      to: { path: [`${API}http/`, 'node_modules/fastify/', 'node_modules/@fastify/'] },
    },
    {
      name: 'persistence-is-bottom',
      severity: 'error',
      comment: 'Regra 4: a persistência não importa camadas superiores.',
      from: { path: `${API}persistence/` },
      to: { path: [`${API}(application|http|jobs|integrations)/`] },
    },
    {
      name: 'adapters-are-isolated',
      severity: 'error',
      comment: 'Regra 5: adaptadores de integração não importam aplicação, HTTP nem persistência.',
      from: { path: `${API}integrations/` },
      to: { path: [`${API}(application|http|persistence|jobs)/`] },
    },
    {
      name: 'jobs-not-to-persistence',
      severity: 'error',
      comment: 'Tarefas agendadas usam a camada de aplicação, nunca o banco diretamente.',
      from: { path: `${API}jobs/` },
      to: { path: [`${API}persistence/(?!unit-of-work\\.ts$)`, 'node_modules/drizzle-orm/'] },
    },
    {
      name: 'shared-is-leaf',
      severity: 'error',
      comment: 'shared/ é folha: não importa nenhuma camada.',
      from: { path: `${API}shared/` },
      to: { path: [`${API}(application|http|persistence|integrations|jobs|config)/`] },
    },
    {
      name: 'web-feature-isolation',
      severity: 'error',
      comment: 'Regra 7: uma feature não importa outra; o que é comum vai para components/ ou lib/.',
      from: { path: '^apps/web/src/features/([^/]+)/' },
      to: { path: '^apps/web/src/features/', pathNot: '^apps/web/src/features/$1/' },
    },
    {
      name: 'web-shared-not-to-features',
      severity: 'error',
      comment: 'Regra 7: components/ e lib/ não importam features/.',
      from: { path: '^apps/web/src/(components|lib|theme)/' },
      to: { path: '^apps/web/src/features/' },
    },
    {
      name: 'web-lib-not-to-components',
      severity: 'error',
      comment: 'Regra 7: lib/ não importa components/.',
      from: { path: '^apps/web/src/lib/' },
      to: { path: '^apps/web/src/components/' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)(dist|node_modules|test|e2e|scripts)/|\\.test\\.tsx?$' },
    tsPreCompilationDeps: true,
    combinedDependencies: true,
    enhancedResolveOptions: { exportsFields: ['exports'], conditionNames: ['import', 'require', 'node', 'default', 'types'] },
  },
};
