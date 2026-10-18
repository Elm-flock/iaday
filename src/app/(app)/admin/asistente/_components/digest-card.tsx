'use client';

import { Bot, FileText, RefreshCw, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { refreshDigestAction, type DigestView } from '../actions';
import { internalHref } from '../messages';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Link } from '@/components/ui/link';
import { formatTime } from '@/lib/format';

/** Origen del resumen, siempre con ícono y palabra (nunca solo color). */
export function DigestSourceBadge({ source }: { source: DigestView['source'] }) {
  const ai = source === 'AI';
  const Icon = ai ? Sparkles : FileText;
  return (
    <span className="inline-flex items-center gap-s5 rounded-pill border border-border bg-surface-subtle px-s10 py-s5 text-caption text-ink">
      <Icon size={14} strokeWidth={1.75} aria-hidden="true" />
      {ai ? 'Resumen generado por IA' : 'Resumen automático (plantilla)'}
    </span>
  );
}

/** Novedades al abrir el asistente: los números salen de la base de datos, la IA solo las redacta. */
export function DigestCard({ initial }: { initial: DigestView }) {
  const [digest, setDigest] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    const result = await refreshDigestAction();
    setLoading(false);
    if (result.ok) setDigest(result.data);
    else setError(result.failure.message);
  }

  return (
    <Card
      title="Novedades"
      actions={
        <Button
          variant="secondary"
          size="sm"
          loading={loading}
          onClick={refresh}
          icon={<RefreshCw size={16} strokeWidth={1.75} aria-hidden="true" />}
        >
          Actualizar novedades
        </Button>
      }
    >
      <div className="flex flex-col gap-s15" aria-busy={loading || undefined}>
        <div className="flex flex-wrap items-center gap-s10">
          <DigestSourceBadge source={digest.source} />
          <span className="text-caption text-ink-muted">
            Actualizado a las {formatTime(digest.generatedAt)}
          </span>
        </div>
        <p className="text-body text-ink">{digest.headline}</p>
        {digest.items.length > 0 ? (
          <ul className="flex flex-col gap-s10">
            {digest.items.map((item) => {
              const href = internalHref(item.href);
              return (
                <li key={item.factKey} className="flex items-start gap-s10 text-body text-ink">
                  <Bot
                    size={18}
                    strokeWidth={1.75}
                    aria-hidden="true"
                    className="mt-px shrink-0 text-ink-muted"
                  />
                  <span>
                    <span className="font-bold tabular-nums">{item.count}</span> · {item.text}{' '}
                    {href ? (
                      <Link
                        href={href}
                        aria-label={`Resolver: ${item.text}`}
                        className="whitespace-nowrap"
                      >
                        Resolver
                      </Link>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : null}
        {error ? <Alert tone="warning">{error}</Alert> : null}
      </div>
    </Card>
  );
}
