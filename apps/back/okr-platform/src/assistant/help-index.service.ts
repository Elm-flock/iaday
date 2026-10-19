import { Injectable, Logger } from '@nestjs/common';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { searchChunks, type HelpChunk } from './domain/bm25';
import {
  SUPPORTED_SCHEMA_VERSION,
  sectionsToChunks,
  type HelpIndexFile,
} from './domain/help-sections';

/**
 * Índice de ayuda (copia de `okr-platform-front/docs/manuales/help-index.json`; se sincroniza con
 * `npm run assistant:help-index`). Se carga una vez al iniciar; si falta o tiene otra versión de esquema,
 * el asistente sigue funcionando sin fragmentos de manual (HOW_TO responde "no lo encuentro").
 */
@Injectable()
export class HelpIndexService {
  private readonly logger = new Logger(HelpIndexService.name);
  private readonly chunks: HelpChunk[];
  readonly sourceHash: string | null;

  constructor() {
    const loaded = this.load();
    this.chunks = loaded ? sectionsToChunks(loaded) : [];
    this.sourceHash = loaded?.sourceHash ?? null;
  }

  get size(): number {
    return this.chunks.length;
  }

  /** Fragmentos relevantes (BM25, top 6) para la audiencia: el manual de administración es solo para ADMIN. */
  search(question: string, audience: 'ADMIN' | 'LEADER' | 'MEMBER'): HelpChunk[] {
    return searchChunks(this.chunks, question, audience);
  }

  private load(): HelpIndexFile | null {
    const candidates = [
      join(__dirname, 'help', 'help-index.json'),
      join(process.cwd(), 'src', 'assistant', 'help', 'help-index.json'),
    ];
    const file = candidates.find((p) => existsSync(p));
    if (!file) {
      this.logger.error('No se encontró help-index.json: el asistente responderá sin manuales.');
      return null;
    }
    try {
      const parsed = JSON.parse(readFileSync(file, 'utf8')) as HelpIndexFile;
      if (parsed.schemaVersion !== SUPPORTED_SCHEMA_VERSION || !Array.isArray(parsed.sections)) {
        this.logger.error(
          `help-index.json con esquema ${String(parsed.schemaVersion)} (se soporta ${SUPPORTED_SCHEMA_VERSION}).`,
        );
        return null;
      }
      return parsed;
    } catch (error) {
      this.logger.error(`help-index.json ilegible: ${(error as Error).message}`);
      return null;
    }
  }
}
