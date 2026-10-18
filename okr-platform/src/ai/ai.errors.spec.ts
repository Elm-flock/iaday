import { aiDisabledError, aiDomainError, mapAgentFailure } from './ai.errors';

describe('aiDomainError', () => {
  it.each([
    ['AI_DISABLED', 503],
    ['AI_UNAVAILABLE', 503],
    ['AI_RATE_LIMITED', 429],
    ['AI_INPUT_REJECTED', 422],
    ['AI_OUTPUT_INVALID', 502],
    ['AI_NOTHING_TO_ADAPT', 422],
    ['AI_NOTHING_TO_SUMMARIZE', 422],
    ['AI_VALIDATION_NOT_ALLOWED', 422],
    ['AI_ADAPTATION_STATE_CONFLICT', 409],
    ['AI_SUGGESTION_ALREADY_DECIDED', 409],
    ['AI_ADAPTATION_NOT_FOUND', 404],
    ['OTRO', 422],
  ])('%s -> %i con forma { statusCode, message, code }', (code, status) => {
    const e = aiDomainError({ code, message: 'm' });
    expect(e.getStatus()).toBe(status);
    expect(e.getResponse()).toEqual({ statusCode: status, message: 'm', code });
  });
});

describe('mapAgentFailure / aiDisabledError', () => {
  it('mapea código y mensaje en español', () => {
    const e = mapAgentFailure({ code: 'AI_RATE_LIMITED' });
    expect(e.getStatus()).toBe(429);
    expect(e.getResponse()).toMatchObject({ code: 'AI_RATE_LIMITED' });
    expect(aiDisabledError().getResponse()).toMatchObject({ code: 'AI_DISABLED', statusCode: 503 });
  });
});
