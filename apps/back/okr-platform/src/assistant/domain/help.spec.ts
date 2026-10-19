import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  MAX_CHUNK_CHARS,
  MAX_TOTAL_CHARS,
  manualsFor,
  searchChunks,
  stem,
  tokenize,
  type HelpChunk,
} from './bm25';
import {
  SUPPORTED_SCHEMA_VERSION,
  sectionsToChunks,
  toWireChunks,
  wireId,
  type HelpIndexFile,
} from './help-sections';

const BACK_COPY = join(__dirname, '../help/help-index.json');
const FRONT_FILE = join(
  __dirname,
  '../../../../../okr-platform-front/docs/manuales/help-index.json',
);
const index = JSON.parse(readFileSync(BACK_COPY, 'utf8')) as HelpIndexFile;

describe('help-index.json (copia del índice canónico del front)', () => {
  it('tiene la versión de esquema soportada y secciones', () => {
    expect(index.schemaVersion).toBe(SUPPORTED_SCHEMA_VERSION);
    expect(index.slugAlgorithm).toMatch(/^github-slugger/);
    expect(index.sections.length).toBeGreaterThan(20);
  });

  const itFront = existsSync(FRONT_FILE) ? it : it.skip;
  itFront(
    'si está el repo del front, la copia tiene el mismo sourceHash (correr `npm run assistant:help-index`)',
    () => {
      const front = JSON.parse(readFileSync(FRONT_FILE, 'utf8')) as HelpIndexFile;
      expect(index.sourceHash).toBe(front.sourceHash);
      expect(index.sections.length).toBe(front.sections.length);
    },
  );
});

describe('sectionsToChunks', () => {
  const synthetic: HelpIndexFile = {
    schemaVersion: 1,
    slugAlgorithm: 'github-slugger@2.0.0',
    sourceHash: 'x',
    manuals: [],
    sections: [
      {
        id: 'admin#portada',
        manual: 'admin',
        anchor: 'portada',
        title: 'Portada',
        level: 1,
        parent: null,
        url: '/ayuda/admin#portada',
        plainText: 'Intro',
      },
      {
        id: 'admin#usuarios',
        manual: 'admin',
        anchor: 'usuarios',
        title: 'Usuarios',
        level: 2,
        parent: null,
        url: '/ayuda/admin#usuarios',
        plainText: '',
      },
      {
        id: 'admin#cómo-creo-un-usuario',
        manual: 'admin',
        anchor: 'cómo-creo-un-usuario',
        title: 'Cómo creo un usuario',
        level: 3,
        parent: 'usuarios',
        url: '/ayuda/admin#cómo-creo-un-usuario',
        plainText: 'Entrá a Usuarios.',
      },
      {
        id: 'usuario#glosario',
        manual: 'usuario',
        anchor: 'glosario',
        title: 'Glosario',
        level: 2,
        parent: null,
        url: '/ayuda/usuario#glosario',
        plainText: 'x'.repeat(4000),
      },
    ],
  };

  it('solo H2/H3 con texto; título con ruta; manual en mayúsculas; texto acotado', () => {
    const chunks = sectionsToChunks(synthetic);
    expect(chunks.map((c) => c.id)).toEqual(['admin#cómo-creo-un-usuario', 'usuario#glosario']);
    expect(chunks[0]).toMatchObject({
      manual: 'ADMIN',
      title: 'Usuarios > Cómo creo un usuario',
      url: '/ayuda/admin#cómo-creo-un-usuario',
    });
    expect(chunks[1].manual).toBe('USUARIO');
    expect(chunks[1].text).toHaveLength(MAX_CHUNK_CHARS);
  });

  it('wireId: ASCII según el contrato del agente; toWireChunks desambigua y permite volver al id canónico', () => {
    expect(wireId('admin#cómo-creo-un-usuario')).toBe('admin#como-creo-un-usuario');
    expect(wireId('usuario#ñandú--x')).toBe('usuario#nandu-x');
    expect(wireId('admin#???')).toBe('admin#seccion');
    const a: HelpChunk = { id: 'admin#cómo', manual: 'ADMIN', title: 't', text: 'x', url: '/u1' };
    const b: HelpChunk = { id: 'admin#como', manual: 'ADMIN', title: 't', text: 'y', url: '/u2' };
    const { wire, toCanonical } = toWireChunks([a, b]);
    expect(wire.map((c) => c.id)).toEqual(['admin#como', 'admin#como-2']);
    expect(toCanonical.get('admin#como-2')).toBe(b);
  });

  it('con el índice real todos los ids de cable cumplen el patrón del contrato y son únicos', () => {
    const chunks = sectionsToChunks(index);
    expect(chunks.length).toBeGreaterThan(20);
    const { wire } = toWireChunks(chunks);
    expect(new Set(wire.map((c) => c.id)).size).toBe(wire.length);
    for (const c of wire) {
      expect(c.id).toMatch(/^(admin|usuario)#[a-z0-9-]+$/);
      expect(c.text.length).toBeGreaterThan(0);
      expect(c.text.length).toBeLessThanOrEqual(MAX_CHUNK_CHARS);
      expect(c.url.length).toBeLessThanOrEqual(300);
    }
  });
});

describe('bm25', () => {
  const chunk = (
    id: string,
    title: string,
    text: string,
    manual: 'ADMIN' | 'USUARIO' = 'ADMIN',
  ): HelpChunk => ({
    id,
    manual,
    title,
    text,
    url: `/ayuda#${id}`,
  });
  const corpus = [
    chunk(
      'admin#como-cierro-un-ciclo',
      'Ciclos > Cómo cierro un ciclo',
      'Cerrar un ciclo calcula los puntajes finales. Es irreversible.',
    ),
    chunk(
      'admin#como-creo-un-usuario',
      'Usuarios > Cómo creo un usuario',
      'Entrá a Usuarios y tocá Crear usuario con el email.',
    ),
    chunk('admin#glosario', 'Glosario', 'Ciclo: período de OKR. Usuario: persona con cuenta.'),
    chunk(
      'usuario#como-hago-un-check-in',
      'Check-ins > Cómo hago un check-in',
      'Registrá tu avance en el resultado clave.',
      'USUARIO',
    ),
  ];

  it('stem y tokenize: sin tildes ni stopwords, con sufijos recortados', () => {
    expect(stem('ciclos')).toBe('ciclo');
    expect(stem('relaciones')).toBe('rela');
    expect(stem('es')).toBe('es');
    expect(tokenize('¿Cómo cierro los CICLOS?')).toEqual(['cierro', 'ciclo']);
  });

  it('el fragmento relevante queda primero (y el título pesa)', () => {
    expect(searchChunks(corpus, '¿Cómo cierro un ciclo?', 'ADMIN')[0].id).toBe(
      'admin#como-cierro-un-ciclo',
    );
    expect(searchChunks(corpus, 'crear usuario nuevo', 'ADMIN')[0].id).toBe(
      'admin#como-creo-un-usuario',
    );
  });

  it('filtra por audiencia: líderes e integrantes solo ven el manual de uso', () => {
    expect(manualsFor('ADMIN')).toEqual(['ADMIN', 'USUARIO']);
    expect(manualsFor('MEMBER')).toEqual(['USUARIO']);
    expect(
      searchChunks(corpus, 'ciclo usuario check-in resultado', 'MEMBER').map((c) => c.id),
    ).toEqual(['usuario#como-hago-un-check-in']);
    expect(searchChunks(corpus, 'ciclo', 'LEADER')).toEqual([]);
  });

  it('sin coincidencias, sin pregunta útil o sin corpus devuelve vacío', () => {
    expect(searchChunks(corpus, 'zzzzqqq', 'ADMIN')).toEqual([]);
    expect(searchChunks(corpus, '¿y el?', 'ADMIN')).toEqual([]);
    expect(searchChunks([], 'ciclo', 'ADMIN')).toEqual([]);
  });

  it('respeta top-k y el tope total de caracteres', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      chunk(`admin#c${i}`, 'Ciclo', `ciclo ${'palabra '.repeat(20 + i)}`),
    );
    expect(searchChunks(many, 'ciclo', 'ADMIN')).toHaveLength(6);
    expect(searchChunks(many, 'ciclo', 'ADMIN', 2)).toHaveLength(2);
    const huge = Array.from({ length: 6 }, (_, i) =>
      chunk(`admin#h${i}`, 'Ciclo', `ciclo ${'z'.repeat(2990)}`),
    );
    const r = searchChunks(huge, 'ciclo', 'ADMIN');
    expect(r.reduce((a, c) => a + c.text.length, 0)).toBeLessThanOrEqual(MAX_TOTAL_CHARS);
    expect(r.length).toBeLessThan(6);
  });

  it('con el índice real: cómo cierro un ciclo -> sección del manual de administración', () => {
    const r = searchChunks(sectionsToChunks(index), '¿Cómo cierro un ciclo?', 'ADMIN');
    expect(r.map((c) => c.id).join()).toMatch(/admin#c[oó]mo-cierro-un-ciclo/);
  });
});
