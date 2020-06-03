import {RedisModule} from '../redis/redis.module';
import { Test } from "@nestjs/testing";
import {RedisProviderId} from '../constants';
import Redis from 'ioredis';
import {MemoLock} from './memo-lock';

describe('MemoLock', () => {
  let redis: Redis.Redis;
  let module: MemoLock;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        RedisModule,
      ]
    }).compile();
    redis = module.get<Redis.Redis>(RedisProviderId)
  });

  beforeEach(async () => {
    await redis.flushall();
    module = new MemoLock(redis, 5, 1000, 100);
    await module.setupSubs();
  });

  afterEach(async () => {
    await module.stopSubs();
  });

  it('should allow locking to occur', async () => {
    const lock = await module.acquireLock('foo');
    const start = Date.now();
    setTimeout(() => {
      module.releaseLock('foo', lock);
    }, 100);
    const nextLock = await module.acquireLock('foo');
    expect(Date.now() - start).toBeGreaterThan(100);
    await module.releaseLock('foo', nextLock);
  });

  it('should enforce the queue size', async () => {
    await module.acquireLock('foo');
    for (let i = 0; i < 4; i++) {
      module.acquireLock('foo').catch(console.error.bind(console, 'Error acquiring lock:'));
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
    try {
      await module.acquireLock('foo');
    } catch (e) {
      expect(e.message).toContain('is full');
      return;
    }
    throw new Error('expected an error');
  });

  it('should handle deadlocks', async () => {
    await module.acquireLock('foo');
    await new Promise((resolve) => setTimeout(resolve, 800));
    const lock = await module.acquireLock('foo');
    await module.releaseLock('foo', lock);
  });

  it('should expire locks in TTL order', async () => {
    await module.acquireLock('foo');
    let err: Error;
    let done = false;
    setTimeout(() => module.acquireLock('foo').catch((e) => {
      err = e;
    }), 0);
    setTimeout(() => module.acquireLock('foo').then(() => {
      done = true
    }), 800);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(err!.message).toContain("expired after");
    expect(done).toBeTruthy();
  });
});