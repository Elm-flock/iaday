import { validate } from 'class-validator';
import { ExactlyOneOf } from './exactly-one-of';

class Dto {
  @ExactlyOneOf(['a', 'b'])
  a?: string | null;
  b?: string | null;
}

const run = async (a?: string | null, b?: string | null) => {
  const dto = Object.assign(new Dto(), { a, b });
  return validate(dto);
};

describe('ExactlyOneOf', () => {
  it('solo a -> ok', async () => expect(await run('x', undefined)).toHaveLength(0));
  it('solo b -> ok', async () => expect(await run(undefined, 'y')).toHaveLength(0));
  it('null cuenta como ausente', async () => expect(await run(null, 'y')).toHaveLength(0));
  it('ambos -> error', async () => {
    const errors = await run('x', 'y');
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toHaveProperty('exactlyOneOf');
  });
  it('ninguno -> error', async () => expect(await run(undefined, undefined)).toHaveLength(1));
});
