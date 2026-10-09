import { readFileSync } from 'fs';
import { join } from 'path';
import { findCompensationViolations } from './schema-guard';

describe('schema-guard (REQ-AUD-2)', () => {
  it('el schema.prisma actual no contiene campos ni modelos de compensación', () => {
    const schema = readFileSync(join(__dirname, '..', 'prisma', 'schema.prisma'), 'utf8');
    expect(findCompensationViolations(schema)).toEqual([]);
  });

  it('falla si se agrega un campo salary', () => {
    const schema = `model User {
  id     String @id
  salary Decimal
}`;
    expect(findCompensationViolations(schema)).toEqual([
      { kind: 'field', name: 'salary', parent: 'User' },
    ]);
  });

  it('falla si se agrega un campo bonus', () => {
    const schema = `model User {
  id    String @id
  bonus Int
}`;
    expect(findCompensationViolations(schema)).toEqual([
      { kind: 'field', name: 'bonus', parent: 'User' },
    ]);
  });

  it('falla si existe un modelo PerformanceRating', () => {
    const schema = `model PerformanceRating {
  id    String @id
  value Int
}`;
    const violations = findCompensationViolations(schema);
    expect(violations).toContainEqual({
      kind: 'model',
      name: 'PerformanceRating',
      parent: '',
    });
  });

  it('detecta valores de enum prohibidos', () => {
    const schema = `enum Grade {
  JUNIOR
  PAY_GRADE_A
}`;
    expect(findCompensationViolations(schema)).toEqual([
      { kind: 'enumValue', name: 'PAY_GRADE_A', parent: 'Grade' },
    ]);
  });

  it('ignora comentarios y atributos de bloque', () => {
    const schema = `model User {
  id String @id // sin salary acá
  // bonus: comentario
  @@index([id])
}`;
    expect(findCompensationViolations(schema)).toEqual([]);
  });
});
