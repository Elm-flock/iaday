/**
 * Guard anti-compensación (REQ-AUD-2).
 * Parsea el texto de un schema.prisma (modelos, campos y enums) y detecta
 * nombres que sugieran compensación / rating / ranking de RR.HH.
 * Funciones puras: reciben el schema como string.
 */

export const FORBIDDEN_PATTERN =
  /salar|bonus|compens|payroll|pay.?grade|merit|raise|incentive|equity|stock|rating|performance.?review|rank/i;

export interface SchemaViolation {
  kind: 'model' | 'field' | 'enum' | 'enumValue';
  name: string;
  /** Modelo o enum que contiene el nombre (vacío para modelos/enums de primer nivel). */
  parent: string;
}

function stripComments(schema: string): string {
  return schema
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n');
}

export function findCompensationViolations(schema: string): SchemaViolation[] {
  const violations: SchemaViolation[] = [];
  const blockRegex = /^\s*(model|enum)\s+(\w+)\s*\{([\s\S]*?)^\s*\}/gm;
  const source = stripComments(schema);

  for (const match of source.matchAll(blockRegex)) {
    const [, blockKind, blockName, body] = match;
    if (FORBIDDEN_PATTERN.test(blockName)) {
      violations.push({
        kind: blockKind === 'model' ? 'model' : 'enum',
        name: blockName,
        parent: '',
      });
    }
    for (const rawLine of body.split('\n')) {
      const line = rawLine.trim();
      // Ignora vacíos y atributos de bloque (@@index, @@unique, @@id...).
      if (!line || line.startsWith('@@')) continue;
      const token = line.split(/\s+/)[0];
      if (!FORBIDDEN_PATTERN.test(token)) continue;
      violations.push({
        kind: blockKind === 'model' ? 'field' : 'enumValue',
        name: token,
        parent: blockName,
      });
    }
  }
  return violations;
}
