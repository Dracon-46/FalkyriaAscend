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
      name: 'http-not-to-persistence',
      severity: 'error',
      comment: 'Regra 2: controllers HTTP falam só com a camada de aplicação.',
      from: { path: `${API}http/` },
      to: { path: [`${API}persistence/`, 'node_modules/drizzle-orm/', 'node_modules/pg/'] },
    },
    {
      name: 'application-not-to-orm',
      severity: 'error',
      comment: 'Regra 3: a aplicação acessa dados só por repositórios, consultas e unit of work.',
      from: { path: `${API}application/` },
      to: { path: ['node_modules/drizzle-orm/', 'node_modules/pg/', `${API}persistence/(schema|client|migrate|admin-registry)`] },
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
