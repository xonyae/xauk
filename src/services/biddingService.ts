import { BidModel, IBid } from '../models/Bid';
import { AuctionModel, IAuction } from '../models/Auction';
import { TransactionModel } from '../models/Transaction';
import { UserModel } from '../models/User';
import { redis } from '../config/database';

const BID_QUEUE_KEY = 'bid_queue';
const PROCESSING_LOCK_KEY = 'bid_processing_lock';
const USER_RATE_LIMIT_KEY = 'rate_limit:';
const USER_AUCTION_TOTAL_KEY = 'user_auction_total:';
const RATE_LIMIT_WINDOW = 60;
const RATE_LIMIT_MAX_REQUESTS = 10;
const MAX_QUEUE_SIZE = 100;
const WEBSOCKET_BATCH_KEY = 'ws_batch:';
const WEBSOCKET_BATCH_INTERVAL = 100;

export class BiddingService {
  private isProcessing = false;
  private batchTimer: NodeJS.Timeout | null = null;
  private pendingNotifications: Map<string, any[]> = new Map();

  async placeBid(auctionId: string, userId: string, amount: number, isBot: boolean = false, idempotencyKey?: string): Promise<any> {
    if (idempotencyKey) {
      const existingBid = await BidModel.findOne({ idempotency_key: idempotencyKey });
      if (existingBid) {
        return existingBid;
      }
    }

    const auction = await AuctionModel.findById(auctionId);

    if (!auction) {
      throw new Error('Auction not found');
    }

    if (auction.status !== 'active') {
      throw new Error('Auction is not active');
    }

    if (!auction.round_end_time) {
      throw new Error('Round has no end time');
    }

    const now = Date.now();
    const roundEndMs = new Date(auction.round_end_time).getTime();

    if (now >= roundEndMs) {
      throw new Error('Round has ended');
    }

    const queueSize = await redis.llen(BID_QUEUE_KEY);
    if (queueSize >= MAX_QUEUE_SIZE) {
      throw new Error('System is under heavy load. Please try again in a few seconds');
    }

    if (!isBot) {
      const rateLimitKey = `${USER_RATE_LIMIT_KEY}${userId}:${auctionId}`;
      const currentTime = Date.now();

      const pipeline = redis.pipeline();
      pipeline.zremrangebyscore(rateLimitKey, 0, currentTime - (RATE_LIMIT_WINDOW * 1000));
      pipeline.zcard(rateLimitKey);

      const results = await pipeline.exec();
      const requestCount = results?.[1]?.[1] as number || 0;

      if (requestCount >= RATE_LIMIT_MAX_REQUESTS) {
        throw new Error(`Rate limit exceeded. Maximum ${RATE_LIMIT_MAX_REQUESTS} bids per minute`);
      }

      await redis.zadd(rateLimitKey, currentTime, `${currentTime}-${Math.random()}`);
      await redis.expire(rateLimitKey, RATE_LIMIT_WINDOW);
    }

    const minBid = await this.getEffectiveMinBid(auction);

    const highestBid = await BidModel.findOne({
      auction_id: auctionId,
      round: auction.current_round,
      status: { $nin: ['replaced', 'refunded'] }
    }).sort({ amount: -1, timestamp_microseconds: 1 }).limit(1);

    const requiredAmount = highestBid ? highestBid.amount + minBid : minBid;

    if (amount < requiredAmount) {
      throw new Error(`Minimum bid is ${requiredAmount}`);
    }

    const user = await UserModel.findById(userId);

    if (!user) {
      throw new Error('User not found');
    }

    const existingBid = await BidModel.findOne({
      auction_id: auctionId,
      user_id: userId,
      round: auction.current_round,
      status: 'pending'
    }).sort({ timestamp: -1 });

    const effectiveAmount = existingBid ? amount - existingBid.amount : amount;

    if (user.balance < effectiveAmount) {
      throw new Error('Insufficient balance');
    }

    const timestampMs = Date.now();
    const timestampMicroseconds = timestampMs * 1000 + Math.floor(Math.random() * 1000);

    const bidData = {
      auction_id: auctionId,
      user_id: userId,
      amount,
      round: auction.current_round,
      is_bot: isBot,
      timestamp: new Date(timestampMs).toISOString(),
      timestamp_microseconds: timestampMicroseconds,
      idempotency_key: idempotencyKey
    };

    await redis.rpush(BID_QUEUE_KEY, JSON.stringify(bidData));

    this.startProcessing();

    const tempBid: any = {
      ...bidData,
      id: 'pending',
      status: 'pending'
    };
    return tempBid;
  }

  private async startProcessing() {
    if (this.isProcessing) {
      return;
    }

    const lock = await redis.set(PROCESSING_LOCK_KEY, '1', 'EX', 30, 'NX');
    if (!lock) {
      return;
    }

    this.isProcessing = true;

    try {
      while (true) {
        const bidDataStr = await redis.lpop(BID_QUEUE_KEY);
        if (!bidDataStr) {
          break;
        }

        const bidData = JSON.parse(bidDataStr);
        await this.processBid(bidData);
      }
    } finally {
      this.isProcessing = false;
      await redis.del(PROCESSING_LOCK_KEY);
    }
  }

  private async processBid(bidData: any): Promise<void> {
    try {
      const auction = await AuctionModel.findById(bidData.auction_id);

      if (!auction || auction.status !== 'active') {
        return;
      }

      if (!auction.round_end_time) {
        return;
      }

      const now = Date.now();
      const roundEndMs = new Date(auction.round_end_time).getTime();

      if (now >= roundEndMs) {
        return;
      }

      const user = await UserModel.findById(bidData.user_id);

      if (!user) {
        return;
      }

      const trackingKey = `${USER_AUCTION_TOTAL_KEY}${bidData.user_id}:${bidData.auction_id}:${bidData.round}`;

      const existingBid = await BidModel.findOne({
        auction_id: bidData.auction_id,
        user_id: bidData.user_id,
        round: bidData.round,
        status: 'pending'
      }).sort({ timestamp: -1 });

      let amountToDeduct = bidData.amount;

      if (existingBid) {
        amountToDeduct = bidData.amount - existingBid.amount;

        existingBid.status = 'replaced';
        await existingBid.save();

        await redis.set(trackingKey, bidData.amount.toString());
      } else {
        await redis.set(trackingKey, bidData.amount.toString());
      }

      if (user.balance < amountToDeduct) {
        return;
      }

      const originalBalance = user.balance;
      user.balance = Math.round(user.balance - amountToDeduct);

      try {
        await user.save();
      } catch (error) {
        console.error('Error updating user balance:', error);
        return;
      }

      let bid;
      try {
        bid = await BidModel.create(bidData);
      } catch (error) {
        user.balance = originalBalance;
        await user.save();
        console.error('Error creating bid:', error);
        return;
      }

      await TransactionModel.create({
        user_id: bidData.user_id,
        type: 'bid_placed',
        amount: bidData.amount,
        auction_id: bidData.auction_id,
        bid_id: bid._id
      });

      this.queueNotification('bid_placed', {
        auctionId: bidData.auction_id,
        bid
      });

      this.queueNotification(`balance_update:${bidData.user_id}`, {
        userId: bidData.user_id,
        balance: user.balance,
        previousBalance: originalBalance,
        deducted: amountToDeduct,
        timestamp: new Date().toISOString()
      });

      if (auction.anti_sniping_enabled) {
        const timeRemainingSeconds = (roundEndMs - Date.now()) / 1000;
        if (timeRemainingSeconds <= 5 && timeRemainingSeconds > 0) {
          const newEndTime = new Date(roundEndMs + 30000);
          auction.round_end_time = newEndTime;
          await auction.save();

          this.queueNotification('auction_time_extended', {
            auctionId: bidData.auction_id,
            newEndTime: newEndTime.toISOString(),
            extensionSeconds: 30
          });
        }
      }
    } catch (error) {
      console.error('Error processing bid:', error);
    }
  }

  private queueNotification(channel: string, data: any): void {
    if (!this.pendingNotifications.has(channel)) {
      this.pendingNotifications.set(channel, []);
    }
    this.pendingNotifications.get(channel)!.push(data);

    if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => this.flushNotifications(), WEBSOCKET_BATCH_INTERVAL);
    }
  }

  private async flushNotifications(): Promise<void> {
    if (this.pendingNotifications.size === 0) {
      this.batchTimer = null;
      return;
    }

    const pipeline = redis.pipeline();

    for (const [channel, notifications] of this.pendingNotifications.entries()) {
      if (channel.startsWith('balance_update:')) {
        const latestNotification = notifications[notifications.length - 1];
        pipeline.publish(channel, JSON.stringify(latestNotification));
      } else if (channel === 'bid_placed') {
        for (const notification of notifications) {
          pipeline.publish(channel, JSON.stringify(notification));
        }
      } else {
        const latestNotification = notifications[notifications.length - 1];
        pipeline.publish(channel, JSON.stringify(latestNotification));
      }
    }

    try {
      await pipeline.exec();
    } catch (error) {
      console.error('Error flushing notifications:', error);
    }

    this.pendingNotifications.clear();
    this.batchTimer = null;
  }

  private async getEffectiveMinBid(auction: IAuction): Promise<number> {
    if (!auction.anti_sniping_enabled) {
      return Math.round(auction.min_bid);
    }

    if (!auction.round_end_time) {
      return Math.round(auction.min_bid);
    }

    const now = new Date();
    const timeRemaining = (new Date(auction.round_end_time).getTime() - now.getTime()) / 1000;
    const thresholdSeconds = auction.anti_sniping_threshold_minutes * 60;

    if (timeRemaining <= thresholdSeconds) {
      return Math.round(auction.min_bid * auction.anti_sniping_step_multiplier);
    }

    return Math.round(auction.min_bid);
  }

  async getBidsForAuction(auctionId: string, round?: number): Promise<IBid[]> {
    const auction = await AuctionModel.findById(auctionId);

    if (!auction) {
      throw new Error('Auction not found');
    }

    const targetRound = round || auction.current_round;

    const bids = await BidModel.find({
      auction_id: auctionId,
      round: targetRound,
      status: { $ne: 'replaced' }
    })
      .sort({ amount: -1, timestamp_microseconds: 1 })
      .limit(50);

    return bids;
  }
}

export const biddingService = new BiddingService();
