import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Menu, Palette } from 'lucide-react';
import { Shield } from '../components';
import { APP_URL, THEMES, type ThemeId } from '../data';

const LINKS = [
  { href: '#como-funciona', label: 'Como funciona' },
  { href: '#por-dentro', label: 'Por dentro' },
  { href: '#progressao', label: 'Progressão' },
  { href: '#temas', label: 'Temas' },
  { href: '#plataformas', label: 'Plataformas' },
];

export function Nav({ theme, setTheme }: { theme: ThemeId; setTheme: (t: ThemeId) => void }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <motion.nav
      initial={{ y: -80 }}
      animate={{ y: 0 }}
      transition={{ type: 'spring', stiffness: 120, damping: 20, delay: 0.2 }}
      className={`navbar fixed inset-x-0 top-0 z-50 px-3 transition-colors duration-300 sm:px-6 ${
        scrolled ? 'bg-base-100/85 border-base-300 border-b backdrop-blur-md' : 'bg-transparent'
      }`}
      aria-label="Navegação principal"
    >
      <div className="navbar-start">
        <div className="dropdown lg:hidden">
          <button tabIndex={0} className="btn btn-ghost btn-square" aria-label="Abrir menu">
            <Menu className="size-5" />
          </button>
          <ul tabIndex={0} className="menu dropdown-content rounded-box bg-base-200 z-10 mt-3 w-56 p-2 shadow-lg">
            {LINKS.map((l) => (
              <li key={l.href}>
                <a href={l.href}>{l.label}</a>
              </li>
            ))}
          </ul>
        </div>
        <a href="#topo" className="btn btn-ghost gap-2 px-2 text-xl normal-case">
          <Shield className="size-8" />
          <span className="font-display font-semibold tracking-wider">Ascend</span>
        </a>
      </div>
      <div className="navbar-center hidden lg:flex">
        <ul className="menu menu-horizontal gap-1 px-1">
          {LINKS.map((l) => (
            <li key={l.href}>
              <a href={l.href} className="text-base-content/80 hover:text-base-content">
                {l.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
      <div className="navbar-end gap-1">
        <div className="dropdown dropdown-end">
          <button tabIndex={0} className="btn btn-ghost btn-sm gap-2" aria-label="Escolher tema">
            <Palette className="size-4" />
            <span className="hidden sm:inline">{THEMES.find((t) => t.id === theme)?.name}</span>
          </button>
          <ul tabIndex={0} className="menu dropdown-content rounded-box bg-base-200 z-10 mt-3 w-52 p-2 shadow-lg">
            {THEMES.map((t) => (
              <li key={t.id}>
                <button className={t.id === theme ? 'menu-active' : ''} onClick={() => setTheme(t.id)}>
                  {t.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
        <a href={APP_URL} className="btn btn-primary btn-sm">
          Entrar
        </a>
      </div>
    </motion.nav>
  );
}
