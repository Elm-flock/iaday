import { Link2 } from 'lucide-react';
import Image from 'next/image';
import NextLink from 'next/link';
import type { ReactNode } from 'react';
import { HELP, type Block, type Inline } from '../help-data';
import { COPY_LINK, copyLinkLabel } from '../messages';
import { Link } from '@/components/ui/link';

function flatTitle(nodes: Inline[]): string {
  return nodes
    .map((n) => {
      if (n.t === 'text' || n.t === 'code') return n.v;
      if (n.t === 'strong' || n.t === 'em' || n.t === 'link') return flatTitle(n.c);
      return '';
    })
    .join('');
}

function renderInline(nodes: Inline[]): ReactNode[] {
  return nodes.map((n, i) => {
    switch (n.t) {
      case 'text':
        return n.v;
      case 'strong':
        return (
          <strong key={i} className="font-bold">
            {renderInline(n.c)}
          </strong>
        );
      case 'em':
        return <em key={i}>{renderInline(n.c)}</em>;
      case 'code':
        return (
          <code key={i} className="rounded-sm bg-surface-subtle px-s5 text-[0.95em]">
            {n.v}
          </code>
        );
      case 'br':
        return <br key={i} />;
      case 'link': {
        // `#ancla` y `/ayuda/...` son internos; el resto (http, mailto) se abre como enlace común.
        const external = !n.href.startsWith('#') && !n.href.startsWith('/');
        return external ? (
          <a
            key={i}
            href={n.href}
            rel="noopener noreferrer"
            className="rounded-sm text-primary-text underline underline-offset-2 hover:text-primary-hover"
          >
            {renderInline(n.c)}
          </a>
        ) : (
          <Link key={i} href={n.href}>
            {renderInline(n.c)}
          </Link>
        );
      }
      case 'img': {
        const size = HELP.images[n.file];
        return size ? (
          <Image
            key={i}
            src={`/ayuda/img/${n.file}`}
            alt={n.alt}
            width={size.width}
            height={size.height}
            sizes="(min-width: 1024px) 720px, 100vw"
            className="my-s15 h-auto max-w-full rounded-lg border border-border"
          />
        ) : null;
      }
    }
  });
}

/** `h1` es el título de la página: los H1 del manual no se repiten; H2 -> h2, H3 -> h3, el resto h4. */
function Heading({ block }: { block: Extract<Block, { t: 'h' }> }) {
  const title = flatTitle(block.c) || block.id;
  const base = 'group scroll-mt-s20 focus:outline-none focus-visible:underline';
  const copy = (
    <NextLink
      href={`#${block.id}`}
      data-copy-anchor=""
      aria-label={copyLinkLabel(title)}
      title={COPY_LINK}
      className="ml-s10 inline-flex rounded-sm align-middle text-ink-muted hover:text-primary-text print:hidden"
    >
      <Link2 size={18} strokeWidth={1.75} aria-hidden="true" />
    </NextLink>
  );
  if (block.level === 2) {
    return (
      <h2
        id={block.id}
        tabIndex={-1}
        className={`${base} mt-s40 border-b border-border pb-s10 text-heading-2 font-light tracking-heading text-ink`}
      >
        {renderInline(block.c)}
        {copy}
      </h2>
    );
  }
  if (block.level === 3) {
    return (
      <h3
        id={block.id}
        tabIndex={-1}
        className={`${base} mt-s30 text-heading-3 font-normal text-ink`}
      >
        {renderInline(block.c)}
        {copy}
      </h3>
    );
  }
  return (
    <h4 id={block.id} tabIndex={-1} className={`${base} mt-s20 text-body font-bold text-ink`}>
      {renderInline(block.c)}
    </h4>
  );
}

function renderBlocks(blocks: Block[], tableLabel: string): ReactNode[] {
  return blocks.map((b, i) => {
    switch (b.t) {
      case 'h':
        return b.level === 1 ? null : <Heading key={i} block={b} />;
      case 'p':
        return (
          <p key={i} className="text-body text-ink">
            {renderInline(b.c)}
          </p>
        );
      case 'ul':
      case 'ol': {
        const Tag = b.t;
        return (
          <Tag
            key={i}
            className={`flex flex-col gap-s10 pl-s30 text-body text-ink ${b.t === 'ul' ? 'list-disc' : 'list-decimal'}`}
          >
            {b.items.map((item, j) => (
              <li key={j} className="flex flex-col gap-s10 pl-s5">
                {renderBlocks(item, tableLabel)}
              </li>
            ))}
          </Tag>
        );
      }
      case 'quote':
        return (
          <blockquote
            key={i}
            className="flex flex-col gap-s10 border-l-4 border-border-strong pl-s20 text-ink-muted"
          >
            {renderBlocks(b.c, tableLabel)}
          </blockquote>
        );
      case 'code':
        return (
          <pre key={i} className="overflow-x-auto rounded-md bg-surface-subtle p-s15 text-body-sm">
            <code>{b.v}</code>
          </pre>
        );
      case 'hr':
        return <hr key={i} className="border-border" />;
      case 'table':
        return (
          <div
            key={i}
            role="region"
            aria-label={tableLabel}
            // Si la tabla no entra en pantallas angostas se desplaza: tiene que poder enfocarse con teclado.
            tabIndex={0}
            className="overflow-x-auto rounded-md border border-border"
          >
            <table className="w-full border-collapse text-left text-body-sm text-ink">
              <thead className="bg-surface-subtle">
                <tr>
                  {b.head.map((cell, j) => (
                    <th
                      key={j}
                      scope="col"
                      className="border-b border-border px-s15 py-s10 font-bold"
                    >
                      {renderInline(cell)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {b.rows.map((row, r) => (
                  <tr key={r} className="border-b border-border last:border-b-0">
                    {row.map((cell, j) => (
                      <td key={j} className="px-s15 py-s10 align-top">
                        {renderInline(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
    }
  });
}

/** Server Component: el Markdown ya viene resuelto en un AST (sin parser ni HTML crudo en el cliente). */
export function ManualContent({ blocks, label }: { blocks: Block[]; label: string }) {
  return <div className="flex max-w-3xl flex-col gap-s15">{renderBlocks(blocks, label)}</div>;
}
