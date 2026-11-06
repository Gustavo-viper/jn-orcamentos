export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = 'error',
  ) {
    super(message);
  }
}
export const badRequest = (m: string) => new HttpError(400, m, 'bad_request');
export const unauthorized = (m = 'Sessão expirada. Entre novamente.') => new HttpError(401, m, 'unauthorized');
export const forbidden = (m = 'Você não tem permissão para esta operação.') => new HttpError(403, m, 'forbidden');
export const notFound = (m = 'Registro não encontrado.') => new HttpError(404, m, 'not_found');
export const conflict = (m: string) => new HttpError(409, m, 'conflict');
