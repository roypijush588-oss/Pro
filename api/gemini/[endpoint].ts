import { handleGeminiRequest } from '../../server/geminiHandler.ts';
import type { ApiRequest, ApiResponse } from '../../server/httpUtils.ts';

function extractEndpoint(req: ApiRequest): string {
  const param = req.query?.endpoint;
  if (typeof param === 'string' && param.trim()) {
    return param.trim();
  }
  if (Array.isArray(param) && param.length > 0) {
    return param.join('/');
  }

  const rawUrl = req.url || '';
  const pathname = rawUrl.split('?')[0];
  const match = pathname.match(/\/api\/gemini\/([^/]+)\/?$/);
  return match?.[1] || '';
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  const endpoint = extractEndpoint(req);
  await handleGeminiRequest(req, res, endpoint);
}
