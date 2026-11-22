import { handlePdfRequest } from '../server/pdfHandler';
import type { ApiRequest, ApiResponse } from '../server/httpUtils.ts';

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  await handlePdfRequest(req, res);
}
