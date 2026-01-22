import { FastifyInstance } from 'fastify';
import { auctionService } from '../services/auctionService';

export async function bankRoutes(fastify: FastifyInstance) {
  fastify.get('/bank', async (request, reply) => {
    try {
      const bankInfo = await auctionService.getBankInfo();
      return bankInfo;
    } catch (error: any) {
      reply.status(500).send({ error: error.message });
    }
  });
}
