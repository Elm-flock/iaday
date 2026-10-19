import type { HelpSection } from '../help-data';
import { TOC_LABEL } from '../messages';

/** Índice del manual: H2 con sus H3 (el H1 es el título de la página). */
export function ManualToc({ sections }: { sections: HelpSection[] }) {
  const groups: { h2: HelpSection; children: HelpSection[] }[] = [];
  for (const s of sections) {
    if (s.level === 2) groups.push({ h2: s, children: [] });
    else if (s.level === 3) groups.at(-1)?.children.push(s);
  }
  return (
    <nav
      id="indice"
      aria-label={TOC_LABEL}
      className="flex flex-col gap-s15 text-body-sm lg:sticky lg:top-s20 lg:max-h-[calc(100vh-4rem)] lg:self-start lg:overflow-y-auto print:hidden"
    >
      <p className="text-body font-bold text-ink">{TOC_LABEL}</p>
      <ol className="flex flex-col gap-s15">
        {groups.map(({ h2, children }) => (
          <li key={h2.anchor} className="flex flex-col gap-s5">
            <a
              href={`#${h2.anchor}`}
              className="rounded-sm font-bold text-ink underline-offset-2 hover:text-primary-text hover:underline"
            >
              {h2.title}
            </a>
            {children.length > 0 ? (
              <ul className="flex flex-col gap-s5 border-l border-border pl-s10">
                {children.map((c) => (
                  <li key={c.anchor}>
                    <a
                      href={`#${c.anchor}`}
                      className="rounded-sm text-ink-muted underline-offset-2 hover:text-primary-text hover:underline"
                    >
                      {c.title}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ol>
    </nav>
  );
}
