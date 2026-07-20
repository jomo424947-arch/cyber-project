import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';

/** Validates req.body against a Zod schema, replacing req.body with the parsed result. */
export function validate(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      console.error('[validation] failed parsing body:', JSON.stringify(req.body), 'Issues:', result.error.issues);
      return next(result.error);
    }
    req.body = result.data;
    next();
  };
}
