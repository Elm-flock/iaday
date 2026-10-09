import { readFileSync } from 'fs';
import { buildOpenApiDocument, OPENAPI_PATH, serializeOpenApi } from './openapi';

describe('openapi.json', () => {
  it('está al día con el código (si falla: npm run openapi:emit y commitear)', async () => {
    const generado = serializeOpenApi(await buildOpenApiDocument());
    const commiteado = readFileSync(OPENAPI_PATH, 'utf8').replace(/\r\n/g, '\n');
    expect(commiteado).toBe(generado);
  });
});
