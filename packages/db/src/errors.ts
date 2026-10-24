export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new AppError(404, "not_found", `${what} not found`);
export const conflict = (code: string, message: string) => new AppError(409, code, message);
export const badRequest = (message: string) => new AppError(400, "bad_request", message);
export const forbidden = (message = "Not allowed") => new AppError(403, "forbidden", message);
export const tooMany = () => new AppError(429, "rate_limited", "Slow down a little and try again");
