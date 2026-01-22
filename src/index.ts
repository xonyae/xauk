import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import { authRoutes } from './routes/authRoutes';
import { auctionRoutes } from './routes/auctionRoutes';
import { userRoutes } from './routes/userRoutes';
import { bankRoutes } from './routes/bankRoutes';
import { websocketService } from './services/websocketService';
import { botService } from './services/botService';
import { auctionLifecycleService } from './services/auctionLifecycleService';
import { connectDatabase } from './config/database';
import { rateLimiterMiddleware } from './middleware/rateLimiter';
import path from 'path';

const PORT = parseInt(process.env.PORT || '3000');

const fastify = Fastify({
  logger: true
});

async function start() {
  try {
    await connectDatabase();

    await botService.initializeBots();

    await fastify.register(cors, {
      origin: true
    });

    await fastify.register(fastifyWebsocket);

    await fastify.register(fastifyStatic, {
      root: path.join(__dirname, '../public'),
      prefix: '/'
    });

    fastify.addHook('onRequest', rateLimiterMiddleware);

    await websocketService.initialize(fastify);

    await fastify.register(authRoutes, { prefix: '/api/auth' });
    await fastify.register(auctionRoutes, { prefix: '/api' });
    await fastify.register(userRoutes, { prefix: '/api/user' });
    await fastify.register(bankRoutes, { prefix: '/api' });

    auctionLifecycleService.start();

    await fastify.listen({ port: PORT, host: '0.0.0.0' });

    console.log(`Server running on http://localhost:${PORT}`);
  } catch (error) {
    console.error('Error starting server:', error);
    process.exit(1);
  }
}

process.on('SIGINT', async () => {
  console.log('\nShutting down gracefully...');
  auctionLifecycleService.stop();
  botService.stopAllBots();
  await websocketService.close();
  await fastify.close();
  process.exit(0);
});

start();
