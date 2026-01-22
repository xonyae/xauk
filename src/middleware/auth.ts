import { FastifyRequest, FastifyReply } from 'fastify';
import { authService } from '../services/authService';

export interface AuthRequest extends FastifyRequest {
  user?: {
    id: string;
    username: string;
    role: string;
  };
}

export const authMiddleware = async (request: AuthRequest, reply: FastifyReply) => {
  try {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const token = authHeader.substring(7);
    const decoded = authService.verifyToken(token);
    request.user = decoded;
  } catch (error) {
    return reply.status(401).send({ error: 'Invalid token' });
  }
};
