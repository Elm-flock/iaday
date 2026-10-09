import { readFileSync } from 'fs';
import { join } from 'path';
import { AUDIT_ACTIONS } from './dto/audit.dto';

describe('Privacidad del AuditLog', () => {
  it('ninguna acción auditable refiere a feedback (su contenido nunca se audita)', () => {
    expect(AUDIT_ACTIONS.length).toBeGreaterThan(0);
    expect(AUDIT_ACTIONS.filter((a) => /feedback/i.test(a))).toEqual([]);
  });

  it('las acciones del DTO coinciden con el enum AuditAction del schema', () => {
    const schema = readFileSync(join(__dirname, '../../prisma/schema.prisma'), 'utf8');
    const body = /enum AuditAction \{([^}]*)\}/.exec(schema)?.[1] ?? '';
    const fromSchema = body.split(/\s+/).filter(Boolean).sort();
    expect([...AUDIT_ACTIONS].sort()).toEqual(fromSchema);
  });
});
