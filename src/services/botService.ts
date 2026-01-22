import { biddingService } from './biddingService';
import { UserModel, IUser } from '../models/User';
import { AuctionModel, IAuction } from '../models/Auction';
import { BidModel } from '../models/Bid';

export class BotService {
  private activeBots: Map<string, NodeJS.Timeout> = new Map();
  private botUsers: IUser[] = [];

  async initializeBots() {
    const botUsernames = ['bot_alpha', 'bot_beta', 'bot_gamma', 'bot_delta', 'bot_epsilon'];

    for (const username of botUsernames) {
      const existingBot = await UserModel.findOne({ username });

      if (!existingBot) {
        const bot = await UserModel.create({
          username,
          password: 'bot_password',
          role: 'user' as const,
          balance: 1000000
        });

        if (bot) {
          this.botUsers.push(bot);
        }
      } else {
        this.botUsers.push(existingBot);
      }
    }
  }

  async startBotsForAuction(auctionId: string) {
    if (this.activeBots.has(auctionId)) {
      return;
    }

    const auction = await AuctionModel.findById(auctionId);

    if (!auction || auction.status !== 'active') {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const currentAuction = await AuctionModel.findById(auctionId);

        if (!currentAuction || currentAuction.status !== 'active' || !currentAuction.round_end_time) {
          this.stopBotsForAuction(auctionId);
          return;
        }

        if (new Date() >= new Date(currentAuction.round_end_time)) {
          return;
        }

        if (Math.random() < 0.3) {
          await this.placeBotBid(auctionId);
        }
      } catch (error) {
        console.error('Bot bidding error:', error);
      }
    }, 8000 + Math.random() * 7000);

    this.activeBots.set(auctionId, interval);
  }

  private async placeBotBid(auctionId: string) {
    try {
      const auction = await AuctionModel.findById(auctionId);

      if (!auction || auction.status !== 'active') {
        return;
      }

      const highestBid = await BidModel.findOne({
        auction_id: auctionId,
        round: auction.current_round
      }).sort({ amount: -1, timestamp: 1 }).limit(1);

      const minBid = await this.getEffectiveMinBid(auction);
      const baseAmount = highestBid ? highestBid.amount : 0;
      const bidAmount = baseAmount + minBid + Math.floor(Math.random() * minBid * 2);

      const randomBot = this.botUsers[Math.floor(Math.random() * this.botUsers.length)];

      await biddingService.placeBid(
        auctionId,
        randomBot._id.toString(),
        bidAmount,
        true
      );
    } catch (error) {
    }
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

  stopBotsForAuction(auctionId: string) {
    const interval = this.activeBots.get(auctionId);
    if (interval) {
      clearInterval(interval);
      this.activeBots.delete(auctionId);
    }
  }

  stopAllBots() {
    for (const [auctionId, interval] of this.activeBots.entries()) {
      clearInterval(interval);
    }
    this.activeBots.clear();
  }
}

export const botService = new BotService();
