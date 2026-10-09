import { Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Link } from '@/components/ui/link';
import type { components } from '@/lib/api/schema';

type TeamNode = components['schemas']['TeamNodeDto'];

function Branch({ node }: { node: TeamNode }) {
  return (
    <li>
      <Link href={`/equipos/${node.id}`}>{node.name}</Link>
      {node.children.length > 0 ? (
        <ul className="mt-s10 ml-s10 flex flex-col gap-s10 border-l border-border pl-s20">
          {node.children.map((child) => (
            <Branch key={child.id} node={child} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/** Árbol de equipos (la raíz es la organización). Presentacional. */
export function TeamTreeView({ tree, emptyAction }: { tree: TeamNode[]; emptyAction?: ReactNode }) {
  if (tree.length === 0) {
    return (
      <EmptyState
        icon={<Users size={32} strokeWidth={1.75} aria-hidden="true" />}
        title="Todavía no hay equipos"
        description="Los equipos se organizan en un árbol que empieza en la organización."
        action={emptyAction}
      />
    );
  }
  return (
    <Card>
      <ul className="flex flex-col gap-s10">
        {tree.map((node) => (
          <Branch key={node.id} node={node} />
        ))}
      </ul>
    </Card>
  );
}
