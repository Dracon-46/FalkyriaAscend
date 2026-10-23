import { useSmoothScroll } from './lib/animation';
import { useTheme } from './lib/theme';
import { Engineering, FinalCta, Footer } from './sections/Engineering';
import { Hero } from './sections/Hero';
import { HowItWorks } from './sections/HowItWorks';
import { Nav } from './sections/Nav';
import { Platforms } from './sections/Platforms';
import { Principles } from './sections/Principles';
import { Progression } from './sections/Progression';
import { Showcase } from './sections/Showcase';
import { Themes } from './sections/Themes';

export function App() {
  useSmoothScroll();
  const { theme, setTheme } = useTheme();
  return (
    <>
      <a href="#como-funciona" className="btn btn-primary btn-sm sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60]">
        Pular para o conteúdo
      </a>
      <Nav theme={theme} setTheme={setTheme} />
      <main>
        <Hero />
        <HowItWorks />
        <Showcase />
        <Progression />
        <Principles />
        <Themes theme={theme} setTheme={setTheme} />
        <Platforms />
        <Engineering />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
