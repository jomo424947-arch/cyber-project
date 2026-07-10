/** Custom HTTP error with status code + optional machine code. */
export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

export const badRequest = (msg: string, code = 'BAD_REQUEST') => new ApiError(400, msg, code);
export const unauthorized = (msg = 'Unauthorized') => new ApiError(401, msg, 'UNAUTHORIZED');
export const forbidden = (msg = 'Forbidden') => new ApiError(403, msg, 'FORBIDDEN');
export const notFound = (msg = 'Not found') => new ApiError(404, msg, 'NOT_FOUND');
export const conflict = (msg: string, code = 'CONFLICT') => new ApiError(409, msg, code);
