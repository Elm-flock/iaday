import { readFileSync } from 'fs';
import { buildOpenApiDocument, OPENAPI_PATH, serializeOpenApi } from './openapi';

describe('openapi.json', () => {
  it('está al día con el código (si falla: npm run openapi:emit y commitear)', async () => {
    const generado = serializeOpenApi(await buildOpenApiDocument());
    // Se compara el contenido parseado: prettier (lint-staged) reformatea el JSON sin cambiar su significado.
    const commiteado = JSON.parse(readFileSync(OPENAPI_PATH, 'utf8')) as unknown;
    expect(commiteado).toEqual(JSON.parse(generado));
  });
});
