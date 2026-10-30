import { useId } from 'react';
import { COMPANY_NAME, COMPANY_URL } from '../../lib/brand';
import { cx } from './primitives';

/** Logo da Falkyria. O corpo usa a cor do texto (acompanha o tema); o olho mantém o azul da marca. */
export function FalkyriaLogo({ size = 16, className }: { size?: number; className?: string }) {
  const mask = useId();
  return (
    <svg viewBox="40 0 480 500" width={size} height={size} className={cx('shrink-0', className)} aria-hidden="true">
      <mask id={mask} maskUnits="userSpaceOnUse" x="0" y="0" width="600" height="600">
        <rect width="600" height="600" fill="#fff" />
        <g fill="#000">
          <polygon points="254,118 278,118 233.6,340 209.6,340" />
          <polygon points="254,118 560,35.4 560,59.4 254,142" />
          <polygon points="235.2,212 560,124.3 560,148.3 235.2,236" />
        </g>
      </mask>
      <path
        d="M54 198L58 160Q66 130 100 112Q120 102 150 96L205 100L300 74L400 42L504 14L486 58L492 84L452 150L460 178L410 232Q362 268 318 302Q284 336 272 392L238 494L184 412Q138 300 118 212L100 178Q84 166 70 176Z"
        fill="currentColor"
        mask={`url(#${mask})`}
      />
      <polygon points="118,130 158,120 148,139 124,142" fill="#00A6FF" />
    </svg>
  );
}

/** Assinatura "Um produto Falkyria", com link para a página da marca. */
export function FalkyriaSignature({ className }: { className?: string }) {
  return (
    <a
      href={COMPANY_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={cx('inline-flex items-center gap-1.5 text-xs tracking-[0.25em] text-faint uppercase transition-colors hover:text-muted', className)}
    >
      <FalkyriaLogo size={16} />
      Um produto {COMPANY_NAME}
    </a>
  );
}
