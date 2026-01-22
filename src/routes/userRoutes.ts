import { FastifyInstance } from 'fastify';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { UserModel } from '../models/User';
import { TransactionModel } from '../models/Transaction';
import { WinnerModel } from '../models/Winner';

export const userRoutes = async (fastify: FastifyInstance) => {
  fastify.get('/me', {
    preHandler: authMiddleware
  }, async (request: AuthRequest, reply) => {
    try {
      const user = await UserModel.findById(request.user!.id).select('username role balance created_at');

      if (!user) {
        return reply.status(404).send({ error: 'User not found' });
      }

      return reply.send(user);
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  });

  fastify.post('/balance/add', {
    preHandler: authMiddleware
  }, async (request: AuthRequest, reply) => {
    try {
      const { amount } = request.body as any;

      if (!amount || amount <= 0) {
        return reply.status(400).send({ error: 'Invalid amount' });
      }

      if (amount > 1000000) {
        return reply.status(400).send({ error: 'Amount must not exceed 1000000' });
      }

      const currentUser = await UserModel.findById(request.user!.id);

      if (!currentUser) {
        return reply.status(404).send({ error: 'User not found' });
      }

      currentUser.balance = Math.round(currentUser.balance + amount);
      await currentUser.save();

      await TransactionModel.create({
        user_id: request.user!.id,
        type: 'balance_added',
        amount,
        auction_id: null,
        bid_id: null
      });

      const user = await UserModel.findById(request.user!.id).select('username role balance created_at');

      return reply.send(user);
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  });

  fastify.get('/transactions', {
    preHandler: authMiddleware
  }, async (request: AuthRequest, reply) => {
    try {
      const transactions = await TransactionModel.find({ user_id: request.user!.id })
        .populate('auction_id', 'title')
        .sort({ created_at: -1 })
        .limit(50);

      return reply.send(transactions);
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  });

  fastify.get('/prizes', {
    preHandler: authMiddleware
  }, async (request: AuthRequest, reply) => {
    try {
      const winners = await WinnerModel.find({ user_id: request.user!.id })
        .populate('auction_id', 'title prize_description')
        .sort({ created_at: -1 });

      return reply.send(winners);
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  });
};
