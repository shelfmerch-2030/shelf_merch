import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    env: {
      NODE_ENV: 'test',
      RAZORPAY_KEY_ID: 'rzp_test_key',
      RAZORPAY_KEY_SECRET: 'rzp_test_secret',
      RAZORPAY_WEBHOOK_SECRET: 'test-webhook-secret',
      // Force stub email so suite never hangs on real SMTP from root .env.
      EMAIL_USER: '',
      EMAIL_PASSWORD: '',
      EMAIL_FROM: '',
    },
    // Test files share one database — run them sequentially.
    fileParallelism: false,
    hookTimeout: 120_000,
    testTimeout: 30_000,
  },
});
