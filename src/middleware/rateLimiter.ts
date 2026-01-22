import { FastifyRequest, FastifyReply } from 'fastify';
import { redis } from '../config/database';

const GLOBAL_RATE_LIMIT_KEY = 'global_rate_limit:';
const IP_RATE_LIMIT_WINDOW = 60;
const IP_MAX_REQUESTS = 100;

export async function rateLimiterMiddleware(request: FastifyRequest, reply: FastifyReply) {
  const ip = request.ip || 'unknown';
  const rateLimitKey = `${GLOBAL_RATE_LIMIT_KEY}${ip}`;
  const currentTime = Date.now();

  try {
    const pipeline = redis.pipeline();
    pipeline.zremrangebyscore(rateLimitKey, 0, currentTime - (IP_RATE_LIMIT_WINDOW * 1000));
    pipeline.zcard(rateLimitKey);

    const results = await pipeline.exec();
    const requestCount = results?.[1]?.[1] as number || 0;

    if (requestCount >= IP_MAX_REQUESTS) {
      return reply.status(429).send({
        error: 'Too many requests. Please slow down',
        retryAfter: IP_RATE_LIMIT_WINDOW
      });
    }

    await redis.zadd(rateLimitKey, currentTime, `${currentTime}-${Math.random()}`);
    await redis.expire(rateLimitKey, IP_RATE_LIMIT_WINDOW + 10);
  } catch (error) {
    console.error('Rate limiter error:', error);
  }
}
