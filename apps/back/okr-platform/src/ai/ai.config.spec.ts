import { ConfigService } from '@nestjs/config';
import { AiConfig } from './ai.config';

const make = (env: Record<string, string | undefined>) =>
  new AiConfig({ get: (k: string) => env[k] } as unknown as ConfigService);

describe('AiConfig', () => {
  it('defaults', () => {
    const c = make({});
    expect(c.enabled).toBe(false);
    expect(c.agentUrl).toBe('http://localhost:8088');
    expect(c.sharedSecret).toBe('');
    expect(c.timeoutMs).toBe(125_000);
    expect(c.throttleLimit).toBe(20);
    expect(c.promptsTtlMs).toBe(60_000);
  });
  it('lee valores y normaliza la URL', () => {
    const c = make({
      AI_ENABLED: 'true',
      AGENT_URL: 'http://agent:8088//',
      AGENT_SHARED_SECRET: 's',
      AGENT_TIMEOUT_MS: '1500',
      AI_THROTTLE_LIMIT: '3',
    });
    expect(c).toMatchObject({
      enabled: true,
      agentUrl: 'http://agent:8088',
      sharedSecret: 's',
      timeoutMs: 1500,
      throttleLimit: 3,
    });
  });
  it('valores inválidos caen al default', () => {
    const c = make({ AI_ENABLED: 'yes', AGENT_TIMEOUT_MS: 'abc', AI_THROTTLE_LIMIT: '-2' });
    expect(c.enabled).toBe(false);
    expect(c.timeoutMs).toBe(125_000);
    expect(c.throttleLimit).toBe(20);
  });
});
