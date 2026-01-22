import { AuctionModel } from '../models/Auction';
import { auctionService } from './auctionService';
import { botService } from './botService';
import { redis } from '../config/database';

export class AuctionLifecycleService {
  private checkInterval: NodeJS.Timeout | null = null;
  private timerInterval: NodeJS.Timeout | null = null;

  start() {
    this.checkInterval = setInterval(async () => {
      await this.checkAuctions();
    }, 2000);

    this.timerInterval = setInterval(async () => {
      await this.broadcastTimers();
    }, 1000);
  }

  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  private async broadcastTimers() {
    try {
      const activeAuctions = await AuctionModel.find({ status: 'active' });

      for (const auction of activeAuctions) {
        if (auction.round_end_time) {
          const remaining = Math.max(0, new Date(auction.round_end_time).getTime() - Date.now());

          await redis.publish(`timer_update:${auction._id}`, JSON.stringify({
            auctionId: auction._id.toString(),
            remaining,
            endTime: auction.round_end_time
          }));
        }
      }
    } catch (error) {
      console.error('Error broadcasting timers:', error);
    }
  }

  private async checkAuctions() {
    try {
      const activeAuctions = await AuctionModel.find({ status: 'active' });

      if (!activeAuctions) {
        return;
      }

      for (const auction of activeAuctions) {
        if (!auction.round_end_time) {
          continue;
        }

        const now = new Date();
        if (now >= new Date(auction.round_end_time)) {
          await auctionService.endRound(auction._id.toString());

          const updatedAuction = await auctionService.getAuctionById(auction._id.toString());
          if (updatedAuction?.status === 'active') {
            await botService.startBotsForAuction(auction._id.toString());
          } else {
            botService.stopBotsForAuction(auction._id.toString());
          }
        }
      }
    } catch (error) {
      console.error('Error checking auctions:', error);
    }
  }
}

export const auctionLifecycleService = new AuctionLifecycleService();
