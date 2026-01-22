import { AuctionModel, IAuction } from '../models/Auction';
import { BidModel } from '../models/Bid';
import { TransactionModel } from '../models/Transaction';
import { UserModel } from '../models/User';
import { WinnerModel } from '../models/Winner';
import { BankModel, BankTransactionModel } from '../models/Bank';
import { websocketService } from './websocketService';
import { redis } from '../config/database';
import mongoose from 'mongoose';

const USER_AUCTION_TOTAL_KEY = 'user_auction_total:';

export class AuctionService {
  async createAuction(data: {
    title: string;
    description?: string;
    rounds: number;
    roundDuration: number;
    winnersPerRound: number;
    prizes: string[];
    minBid: number;
    createdBy: string;
    antiSnipingConfig?: {
      enabled: boolean;
      thresholdMinutes: number;
      stepMultiplier: number;
    };
  }): Promise<IAuction> {
    const auction = await AuctionModel.create({
      title: data.title,
      description: data.description || '',
      rounds: data.rounds,
      round_duration: data.roundDuration,
      winners_per_round: data.winnersPerRound,
      prizes: data.prizes,
      min_bid: data.minBid,
      created_by: data.createdBy,
      anti_sniping_enabled: data.antiSnipingConfig?.enabled ?? true,
      anti_sniping_threshold_minutes: data.antiSnipingConfig?.thresholdMinutes ?? 10,
      anti_sniping_step_multiplier: data.antiSnipingConfig?.stepMultiplier ?? 2
    });

    return auction;
  }

  async getAuctions(filter: Partial<IAuction> = {}): Promise<IAuction[]> {
    const query: any = {};

    if (filter.status) {
      query.status = filter.status;
    }

    const auctions = await AuctionModel.find(query).sort({ created_at: -1 });
    return auctions;
  }

  async getAuctionById(id: string): Promise<IAuction | null> {
    const auction = await AuctionModel.findById(id);
    return auction;
  }

  async startAuction(auctionId: string): Promise<IAuction> {
    const auction = await this.getAuctionById(auctionId);
    if (!auction) {
      throw new Error('Auction not found');
    }

    if (auction.status !== 'pending') {
      throw new Error('Auction already started or completed');
    }

    const now = new Date();
    const roundEndTime = new Date(now.getTime() + auction.round_duration * 1000);

    auction.status = 'active';
    auction.current_round = 1;
    auction.round_start_time = now;
    auction.round_end_time = roundEndTime;

    await auction.save();
    return auction;
  }

  async getCurrentMinBid(auctionId: string): Promise<number> {
    const auction = await this.getAuctionById(auctionId);
    if (!auction) {
      throw new Error('Auction not found');
    }

    if (!auction.anti_sniping_enabled) {
      return auction.min_bid;
    }

    if (!auction.round_end_time) {
      return auction.min_bid;
    }

    const now = new Date();
    const timeRemaining = (new Date(auction.round_end_time).getTime() - now.getTime()) / 1000;
    const thresholdSeconds = auction.anti_sniping_threshold_minutes * 60;

    if (timeRemaining <= thresholdSeconds) {
      return auction.min_bid * auction.anti_sniping_step_multiplier;
    }

    return auction.min_bid;
  }

  async endRound(auctionId: string): Promise<void> {
    const auction = await this.getAuctionById(auctionId);
    if (!auction) {
      throw new Error('Auction not found');
    }

    const allBids = await BidModel.find({
      auction_id: auctionId,
      round: auction.current_round,
      status: { $ne: 'replaced' }
    }).sort({ amount: -1, timestamp_microseconds: 1 });

    const uniqueBidderCount = new Set(allBids.map((bid) => bid.user_id.toString())).size;
    if (uniqueBidderCount < auction.winners_per_round) {
      const now = new Date();
      const newEndTime = new Date(now.getTime() + auction.round_duration * 1000);
      auction.round_start_time = now;
      auction.round_end_time = newEndTime;
      await auction.save();

      await redis.publish('auction_time_extended', JSON.stringify({
        auctionId: auctionId,
        newEndTime: newEndTime.toISOString(),
        extensionSeconds: auction.round_duration
      }));
      return;
    }

    const winners = allBids.slice(0, auction.winners_per_round);
    const winnerIds = winners.map((w) => w.user_id.toString());

    let bank = await BankModel.findOne();
    if (!bank) {
      bank = await BankModel.create({ total_collected: 0 });
    }

    if (winnerIds.length > 0) {
      await BidModel.updateMany(
        {
          auction_id: auctionId,
          round: auction.current_round,
          user_id: { $in: winnerIds }
        },
        { status: 'won' }
      );

      for (let i = 0; i < winners.length; i++) {
        const winner = winners[i];
        const prizeIndex = (auction.current_round - 1) * auction.winners_per_round + i;
        const prize = auction.prizes[prizeIndex] || 'Prize';

        const totalBidAmount = await BidModel.aggregate([
          {
            $match: {
              auction_id: new mongoose.Types.ObjectId(auctionId),
              round: auction.current_round,
              user_id: winner.user_id,
              status: { $ne: 'replaced' }
            }
          },
          {
            $group: {
              _id: null,
              total: { $sum: '$amount' }
            }
          }
        ]);

        const totalBid = totalBidAmount.length > 0 ? totalBidAmount[0].total : winner.amount;

        await WinnerModel.create({
          auction_id: auctionId,
          user_id: winner.user_id,
          round: auction.current_round,
          rank: i + 1,
          prize: prize,
          winning_bid: winner.amount,
          total_bid: totalBid
        });

        bank.total_collected += winner.amount;
        await BankTransactionModel.create({
          auction_id: auctionId,
          user_id: winner.user_id,
          round: auction.current_round,
          amount: winner.amount,
          type: 'collected'
        });

        winner.status = 'collected';
        await winner.save();

        websocketService.broadcast(auctionId, {
          type: 'winner_notification',
          data: {
            userId: winner.user_id.toString(),
            prize: prize,
            round: auction.current_round,
            rank: i + 1,
            amount: winner.amount
          }
        });
      }

      bank.last_updated = new Date();
      await bank.save();
    }

    const losingBids = allBids.filter((bid) => !winnerIds.includes(bid.user_id.toString()) && bid.status === 'pending');

    for (const bid of losingBids) {
      const user = await UserModel.findById(bid.user_id);
      const trackingKey = `${USER_AUCTION_TOTAL_KEY}${bid.user_id}:${auctionId}:${auction.current_round}`;
      const trackedAmount = await redis.get(trackingKey);

      if (user) {
        const refundAmount = trackedAmount ? parseInt(trackedAmount, 10) : bid.amount;
        user.balance = Math.round(user.balance + refundAmount);
        await user.save();

        await TransactionModel.create({
          user_id: bid.user_id,
          type: 'bid_refunded',
          amount: refundAmount,
          auction_id: auctionId,
          bid_id: bid._id
        });

        await redis.del(trackingKey);

        await redis.publish(`balance_update:${bid.user_id}`, JSON.stringify({
          userId: bid.user_id.toString(),
          balance: user.balance,
          refunded: refundAmount,
          timestamp: new Date().toISOString()
        }));
      }

      bid.status = 'refunded';
      await bid.save();
    }

    for (const winnerId of winnerIds) {
      const trackingKey = `${USER_AUCTION_TOTAL_KEY}${winnerId}:${auctionId}:${auction.current_round}`;
      await redis.del(trackingKey);
    }

    if (auction.current_round < auction.rounds) {
      auction.current_round += 1;
      const now = new Date();
      auction.round_start_time = now;
      auction.round_end_time = new Date(now.getTime() + auction.round_duration * 1000);
      await auction.save();

      await redis.publish('round_started', JSON.stringify({
        auctionId: auctionId,
        currentRound: auction.current_round,
        totalRounds: auction.rounds,
        roundEndTime: auction.round_end_time
      }));
    } else {
      auction.status = 'completed';
      auction.round_start_time = null;
      auction.round_end_time = null;
      await auction.save();

      await redis.publish('auction_completed', JSON.stringify({
        auctionId: auctionId
      }));
    }
  }

  async getLeaderboard(auctionId: string, round?: number): Promise<any[]> {
    const auction = await this.getAuctionById(auctionId);
    if (!auction) {
      throw new Error('Auction not found');
    }

    const targetRound = round || auction.current_round;

    const bids = await BidModel.find({
      auction_id: auctionId,
      round: targetRound,
      status: { $ne: 'replaced' }
    })
      .populate('user_id', 'username')
      .sort({ amount: -1, timestamp_microseconds: 1 });

    const userBestBids = new Map();
    for (const bid of bids) {
      const userId = bid.user_id.toString();
      if (!userBestBids.has(userId)) {
        userBestBids.set(userId, {
          userId: userId,
          username: (bid.user_id as any).username,
          amount: bid.amount,
          timestamp: bid.timestamp,
          isBot: bid.is_bot
        });
      }
    }

    return Array.from(userBestBids.values()).slice(0, 10);
  }

  async getBankInfo(): Promise<{ total: number; transactions: any[] }> {
    let bank = await BankModel.findOne();
    if (!bank) {
      bank = await BankModel.create({ total_collected: 0 });
    }

    const transactions = await BankTransactionModel.find()
      .populate('user_id', 'username')
      .populate('auction_id', 'title')
      .sort({ created_at: -1 })
      .limit(50);

    return {
      total: bank.total_collected,
      transactions: transactions.map((t) => ({
        id: t._id,
        auction: (t.auction_id as any).title,
        user: (t.user_id as any).username,
        round: t.round,
        amount: t.amount,
        type: t.type,
        createdAt: t.created_at
      }))
    };
  }
}

export const auctionService = new AuctionService();
