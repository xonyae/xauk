import { FastifyInstance } from 'fastify';
import { redis } from '../config/database';

export class WebSocketService {
  private connections: Map<string, Set<any>> = new Map();
  private userConnections: Map<string, Set<any>> = new Map();
  private subscriber: any;

  async initialize(fastify: FastifyInstance) {
    this.subscriber = redis.duplicate();

    this.subscriber.on('message', (channel: string, message: string) => {
      if (channel === 'bid_placed') {
        const data = JSON.parse(message);
        this.broadcast(data.auctionId, {
          type: 'bid_placed',
          data: data.bid
        });
      } else if (channel === 'auction_time_extended') {
        const data = JSON.parse(message);
        this.broadcast(data.auctionId, {
          type: 'time_extended',
          data: {
            newEndTime: data.newEndTime,
            extensionSeconds: data.extensionSeconds
          }
        });
      } else if (channel === 'round_started') {
        const data = JSON.parse(message);
        this.broadcast(data.auctionId, {
          type: 'round_started',
          data: {
            currentRound: data.currentRound,
            totalRounds: data.totalRounds,
            roundEndTime: data.roundEndTime
          }
        });
      } else if (channel === 'auction_completed') {
        const data = JSON.parse(message);
        this.broadcast(data.auctionId, {
          type: 'auction_completed',
          data: {}
        });
      }
    });

    this.subscriber.on('pmessage', (pattern: string, channel: string, message: string) => {
      if (channel.startsWith('balance_update:')) {
        const userId = channel.split(':')[1];
        const data = JSON.parse(message);
        this.broadcastToUser(userId, {
          type: 'balance_update',
          data: data
        });
      } else if (channel.startsWith('timer_update:')) {
        const auctionId = channel.split(':')[1];
        const data = JSON.parse(message);
        this.broadcast(auctionId, {
          type: 'timer_update',
          data: {
            remaining: data.remaining,
            endTime: data.endTime
          }
        });
      }
    });

    await this.subscriber.subscribe('bid_placed');
    await this.subscriber.subscribe('auction_time_extended');
    await this.subscriber.subscribe('round_started');
    await this.subscriber.subscribe('auction_completed');
    await this.subscriber.psubscribe('balance_update:*');
    await this.subscriber.psubscribe('timer_update:*');

    fastify.get('/ws/:auctionId', { websocket: true }, (socket: any, request: any) => {
      const { auctionId } = request.params;
      const userId = (request.query as any)?.userId || (request as any).user?.id;

      if (!this.connections.has(auctionId)) {
        this.connections.set(auctionId, new Set());
      }

      this.connections.get(auctionId)!.add(socket);

      if (userId) {
        if (!this.userConnections.has(userId)) {
          this.userConnections.set(userId, new Set());
        }
        this.userConnections.get(userId)!.add(socket);
      }

      socket.on('close', () => {
        const auctionConnections = this.connections.get(auctionId);
        if (auctionConnections) {
          auctionConnections.delete(socket);
          if (auctionConnections.size === 0) {
            this.connections.delete(auctionId);
          }
        }

        if (userId) {
          const userConns = this.userConnections.get(userId);
          if (userConns) {
            userConns.delete(socket);
            if (userConns.size === 0) {
              this.userConnections.delete(userId);
            }
          }
        }
      });

      socket.send(JSON.stringify({
        type: 'connected',
        auctionId
      }));
    });
  }

  broadcast(auctionId: string, message: any) {
    const connections = this.connections.get(auctionId);
    if (!connections) {
      return;
    }

    const messageStr = JSON.stringify(message);
    for (const socket of connections) {
      try {
        socket.send(messageStr);
      } catch (error) {
        console.error('Error broadcasting to connection:', error);
      }
    }
  }

  broadcastToUser(userId: string, message: any) {
    const connections = this.userConnections.get(userId);
    if (!connections) {
      return;
    }

    const messageStr = JSON.stringify(message);
    for (const socket of connections) {
      try {
        socket.send(messageStr);
      } catch (error) {
        console.error('Error broadcasting to user:', error);
      }
    }
  }

  async close() {
    if (this.subscriber) {
      await this.subscriber.quit();
    }
  }
}

export const websocketService = new WebSocketService();
