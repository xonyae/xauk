import { FastifyInstance } from 'fastify';
import { authService } from '../services/authService';

export const authRoutes = async (fastify: FastifyInstance) => {
  fastify.post('/register', async (request, reply) => {
    try {
      const { username, password, role } = request.body as any;

      if (!username || !password) {
        return reply.status(400).send({ error: 'Username and password required' });
      }

      const result = await authService.register(username, password, role);

      return reply.send({
        user: {
          id: result.user.id,
          username: result.user.username,
          role: result.user.role,
          balance: result.user.balance
        },
        token: result.token
      });
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  });

  fastify.post('/login', async (request, reply) => {
    try {
      const { username, password } = request.body as any;

      if (!username || !password) {
        return reply.status(400).send({ error: 'Username and password required' });
      }

      const result = await authService.login(username, password);

      return reply.send({
        user: {
          id: result.user.id,
          username: result.user.username,
          role: result.user.role,
          balance: result.user.balance
        },
        token: result.token
      });
    } catch (error: any) {
      return reply.status(401).send({ error: error.message });
    }
  });
};
