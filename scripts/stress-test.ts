import dotenv from 'dotenv';
import { performance } from 'perf_hooks';

dotenv.config();

const API_URL = process.env.API_URL || 'http://localhost:3000';

interface TestConfig {
  auctionId: string;
  concurrentBids: number;
  bidAmount: number;
  intervalMs: number;
  durationSeconds: number;
  token: string;
}

interface TestResults {
  totalBids: number;
  successfulBids: number;
  failedBids: number;
  averageResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  errors: { [key: string]: number };
}

async function placeBid(auctionId: string, amount: number, token: string): Promise<{ success: boolean; time: number; error?: string }> {
  const startTime = performance.now();

  try {
    const response = await fetch(`${API_URL}/api/auctions/${auctionId}/bid`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ amount })
    });

    const endTime = performance.now();
    const responseTime = endTime - startTime;

    if (response.ok) {
      return { success: true, time: responseTime };
    } else {
      const error = await response.json();
      return { success: false, time: responseTime, error: error.error || 'Unknown error' };
    }
  } catch (error: any) {
    const endTime = performance.now();
    const responseTime = endTime - startTime;
    return { success: false, time: responseTime, error: error.message };
  }
}

async function runStressTest(config: TestConfig): Promise<void> {
  console.log('\n=== Starting Stress Test ===');
  console.log(`Auction ID: ${config.auctionId}`);
  console.log(`Initial Bid Amount: ${config.bidAmount} (increases by 50 each attempt)`);
  console.log(`Concurrent Bids: ${config.concurrentBids}`);
  console.log(`Interval: ${config.intervalMs}ms`);
  console.log(`Duration: ${config.durationSeconds}s`);
  console.log('===========================\n');

  const results: TestResults = {
    totalBids: 0,
    successfulBids: 0,
    failedBids: 0,
    averageResponseTime: 0,
    minResponseTime: Infinity,
    maxResponseTime: 0,
    errors: {}
  };

  const responseTimes: number[] = [];
  const startTime = Date.now();
  const endTime = startTime + (config.durationSeconds * 1000);
  let attemptCounter = 0;

  const interval = setInterval(async () => {
    if (Date.now() >= endTime) {
      clearInterval(interval);
      printResults(results);
      process.exit(0);
    }

    const currentBidAmount = config.bidAmount + (attemptCounter * 50);
    attemptCounter++;

    const promises = [];
    for (let i = 0; i < config.concurrentBids; i++) {
      promises.push(placeBid(config.auctionId, currentBidAmount, config.token));
    }

    const bidResults = await Promise.all(promises);

    bidResults.forEach(result => {
      results.totalBids++;
      responseTimes.push(result.time);

      if (result.success) {
        results.successfulBids++;
      } else {
        results.failedBids++;
        const errorKey = result.error || 'Unknown';
        results.errors[errorKey] = (results.errors[errorKey] || 0) + 1;
      }

      if (result.time < results.minResponseTime) {
        results.minResponseTime = result.time;
      }
      if (result.time > results.maxResponseTime) {
        results.maxResponseTime = result.time;
      }
    });

    results.averageResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;

    console.log(`[${new Date().toISOString()}] Total: ${results.totalBids} | Success: ${results.successfulBids} | Failed: ${results.failedBids} | Avg Time: ${results.averageResponseTime.toFixed(2)}ms`);

    // Show top 3 errors every 1000 bids
    if (results.totalBids % 1000 === 0 && Object.keys(results.errors).length > 0) {
      const topErrors = Object.entries(results.errors)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3);
      console.log(`  Top errors: ${topErrors.map(([err, count]) => `${err} (${count})`).join(', ')}`);
    }
  }, config.intervalMs);
}

function printResults(results: TestResults): void {
  console.log('\n=== Test Results ===');
  console.log(`Total Bids: ${results.totalBids}`);
  console.log(`Successful: ${results.successfulBids} (${((results.successfulBids / results.totalBids) * 100).toFixed(2)}%)`);
  console.log(`Failed: ${results.failedBids} (${((results.failedBids / results.totalBids) * 100).toFixed(2)}%)`);
  console.log(`\nResponse Times:`);
  console.log(`  Average: ${results.averageResponseTime.toFixed(2)}ms`);
  console.log(`  Min: ${results.minResponseTime.toFixed(2)}ms`);
  console.log(`  Max: ${results.maxResponseTime.toFixed(2)}ms`);

  if (Object.keys(results.errors).length > 0) {
    console.log(`\nError Breakdown:`);
    Object.entries(results.errors).forEach(([error, count]) => {
      console.log(`  ${error}: ${count}`);
    });
  }
  console.log('====================\n');
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: npm run stress-test <token> <auctionId> [concurrentBids] [bidAmount] [intervalMs] [durationSeconds]');
    console.error('Example: npm run stress-test eyJhbG... 507f1f77bcf86cd799439011 10 100 1000 60');
    process.exit(1);
  }

  const config: TestConfig = {
    token: args[0],
    auctionId: args[1],
    concurrentBids: args[2] ? parseInt(args[2]) : 10,
    bidAmount: args[3] ? parseInt(args[3]) : 100,
    intervalMs: args[4] ? parseInt(args[4]) : 1000,
    durationSeconds: args[5] ? parseInt(args[5]) : 60
  };

  await runStressTest(config);
}

main();
