import type { ShimRequest as FastifyRequest } from "../fastify-shim";

export function currentUserId(req: FastifyRequest): string {
  const payload = req.user as { sub: string };
  return payload.sub;
}
