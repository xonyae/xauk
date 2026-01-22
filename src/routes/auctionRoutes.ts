import { FastifyInstance } from 'fastify';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { auctionService } from '../services/auctionService';
import { biddingService } from '../services/biddingService';
import { botService } from '../services/botService';
import { WinnerModel } from '../models/Winner';

export const auctionRoutes = async (fastify: FastifyInstance) => {
  fastify.post('/auctions', {
    preHandler: authMiddleware
  }, async (request: AuthRequest, reply) => {
    try {
      const { title, description, rounds, roundDuration, winnersPerRound, prizes, minBid, antiSnipingConfig } = request.body as any;

      if (!title || !rounds || !roundDuration || !winnersPerRound || !prizes || !minBid) {
        return reply.status(400).send({ error: 'Missing required fields' });
      }

      if (title.length > 50) {
        return reply.status(400).send({ error: 'Title must be max 50 characters' });
      }

      if (description && description.length > 100) {
        return reply.status(400).send({ error: 'Description must be max 100 characters' });
      }

      if (rounds > 1000 || rounds < 1) {
        return reply.status(400).send({ error: 'Rounds must be between 1 and 1000' });
      }

      if (roundDuration > 259200 || roundDuration < 60) {
        return reply.status(400).send({ error: 'Round duration must be between 60 and 259200 seconds' });
      }

      if (winnersPerRound > 10 || winnersPerRound < 1) {
        return reply.status(400).send({ error: 'Winners per round must be between 1 and 10' });
      }

      if (minBid > 10000000 || minBid < 1) {
        return reply.status(400).send({ error: 'Minimum bid must be between 1 and 10000000' });
      }

      if (Array.isArray(prizes)) {
        for (const prize of prizes) {
          if (prize.length > 100) {
            return reply.status(400).send({ error: 'Each prize must be max 100 characters' });
          }
        }
      }

      if (antiSnipingConfig) {
        if (antiSnipingConfig.thresholdMinutes > 1440 || antiSnipingConfig.thresholdMinutes < 1) {
          return reply.status(400).send({ error: 'Anti-sniping threshold must be between 1 and 1440 minutes' });
        }

        if (antiSnipingConfig.stepMultiplier > 100000 || antiSnipingConfig.stepMultiplier < 1) {
          return reply.status(400).send({ error: 'Anti-sniping multiplier must be between 1 and 100000' });
        }
      }

      const auction = await auctionService.createAuction({
        title,
        description,
        rounds,
        roundDuration,
        winnersPerRound,
        prizes,
        minBid,
        createdBy: request.user!.id,
        antiSnipingConfig
      });

      return reply.send(auction.toJSON());
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  });

  fastify.get('/auctions', async (request, reply) => {
    try {
      const auctions = await auctionService.getAuctions();
      return reply.send(auctions.map(a => a.toJSON()));
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  });

  fastify.get('/auctions/:id', async (request, reply) => {
    try {
      const { id } = request.params as any;
      const auction = await auctionService.getAuctionById(id);

      if (!auction) {
        return reply.status(404).send({ error: 'Auction not found' });
      }

      return reply.send(auction.toJSON());
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  });

  fastify.post('/auctions/:id/start', {
    preHandler: authMiddleware
  }, async (request: AuthRequest, reply) => {
    try {
      const { id } = request.params as any;

      const auction = await auctionService.getAuctionById(id);
      if (!auction) {
        return reply.status(404).send({ error: 'Auction not found' });
      }

      if (auction.created_by.toString() !== request.user!.id) {
        return reply.status(403).send({ error: 'Only auction creator can start the auction' });
      }

      const startedAuction = await auctionService.startAuction(id);

      await botService.startBotsForAuction(id);

      return reply.send(auction.toJSON());
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  });

  fastify.post('/auctions/:id/bid', {
    preHandler: authMiddleware
  }, async (request: AuthRequest, reply) => {
    try {
      const { id } = request.params as any;
      const { amount } = request.body as any;

      if (!amount || amount <= 0) {
        return reply.status(400).send({ error: 'Invalid bid amount' });
      }

      const bid = await biddingService.placeBid(id, request.user!.id, amount, false);

      return reply.send(bid);
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  });

  fastify.get('/auctions/:id/leaderboard', async (request, reply) => {
    try {
      const { id } = request.params as any;
      const { round } = request.query as any;

      const leaderboard = await auctionService.getLeaderboard(id, round ? parseInt(round) : undefined);

      return reply.send(leaderboard);
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  });

  fastify.get('/auctions/:id/bids', async (request, reply) => {
    try {
      const { id } = request.params as any;
      const { round } = request.query as any;

      const bids = await biddingService.getBidsForAuction(id, round ? parseInt(round) : undefined);

      return reply.send(bids);
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  });

  fastify.get('/auctions/:id/min-bid', async (request, reply) => {
    try {
      const { id } = request.params as any;
      const minBid = await auctionService.getCurrentMinBid(id);

      return reply.send({ minBid });
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  });

  fastify.get('/auctions/:id/results', async (request, reply) => {
    try {
      const { id } = request.params as any;
      const winners = await WinnerModel.find({ auction_id: id })
        .populate('user_id', 'username')
        .sort({ round: 1, rank: 1 });

      const groupedByRound = winners.reduce((acc: any, winner: any) => {
        const round = winner.round;
        if (!acc[round]) {
          acc[round] = [];
        }
        acc[round].push({
          rank: winner.rank,
          username: winner.user_id.username,
          prize: winner.prize,
          total_bid: winner.total_bid,
          created_at: winner.created_at
        });
        return acc;
      }, {});

      return reply.send(groupedByRound);
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  });
};
