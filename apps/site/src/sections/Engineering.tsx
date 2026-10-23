import { Download } from 'lucide-react';
import { motion } from 'motion/react';
import { GithubMark, NumberTicker, Section, SectionHeader, Shield } from '../components';
import { PROJECT_STATS, RELEASES_URL, REPO_URL, WIKI_URL } from '../data';

const STACK = ['React 19', 'Fastify 5', 'PostgreSQL 16', 'Drizzle ORM', 'Zod', 'Tailwind CSS 4', 'Capacitor 8', 'Vitest', 'Playwright', 'GitHub Actions'];

export function Engineering() {
  return (
    <Section className="section">
      <SectionHeader eyebrow="Engenharia" title="Feito com cuidado de produto">
        Regras de jogo num motor puro e testado, servidor como fonte da verdade, livro-razão imutável para cada moeda e auditoria de tudo.
      </SectionHeader>
      <div className="stats stats-vertical bg-base-200 border-base-300 w-full border shadow lg:stats-horizontal" data-reveal>
        {PROJECT_STATS.map((s) => (
          <div key={s.label} className="stat">
            <div className="stat-value text-primary">
              <NumberTicker value={s.value} />
            </div>
            <div className="stat-title text-base-content/90 text-base whitespace-normal">{s.label}</div>
            <div className="stat-desc whitespace-normal">{s.hint}</div>
          </div>
        ))}
      </div>
      <ul className="mt-10 flex flex-wrap justify-center gap-2">
        {STACK.map((t) => (
          <li key={t} className="badge badge-lg badge-outline" data-reveal>
            {t}
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function FinalCta() {
  return (
    <Section className="section">
      <div className="card bg-base-200 border-primary/40 glow overflow-hidden border shadow-2xl" data-reveal>
        <div className="card-body items-center py-16 text-center">
          <motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}>
            <Shield className="size-20" />
          </motion.div>
          <h2 className="mt-4 text-4xl font-semibold md:text-5xl">Comece sua campanha</h2>
          <p className="text-base-content/75 mt-3 max-w-xl text-lg">O primeiro nível é só o começo. O resto é consistência.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <a href={RELEASES_URL} className="btn btn-primary btn-lg gap-2">
              <Download className="size-5" /> Baixar para Android
            </a>
            <a href={REPO_URL} className="btn btn-outline btn-lg gap-2">
              <GithubMark className="size-5" /> Ver o código
            </a>
          </div>
        </div>
      </div>
    </Section>
  );
}

export function Footer() {
  return (
    <footer className="footer footer-horizontal footer-center bg-base-200 text-base-content/70 border-base-300 border-t p-10">
      <nav className="grid grid-flow-col gap-5">
        <a className="link link-hover" href={WIKI_URL}>
          Wiki
        </a>
        <a className="link link-hover" href={`${REPO_URL}/releases`}>
          Releases
        </a>
        <a className="link link-hover" href={`${REPO_URL}/blob/main/CHANGELOG.md`}>
          Novidades
        </a>
        <a className="link link-hover" href={`${REPO_URL}/security/policy`}>
          Segurança
        </a>
      </nav>
      <aside className="flex items-center gap-2">
        <Shield className="size-6" />
        <p>Ascend, um produto Falkyria.</p>
      </aside>
    </footer>
  );
}
