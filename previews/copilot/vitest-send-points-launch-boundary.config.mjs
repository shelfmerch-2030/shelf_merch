import { fileURLToPath } from 'node:url';
import apiConfig from '../../apps/api/vitest.config.js';

export default {
  ...apiConfig,
  root: fileURLToPath(new URL('../../', import.meta.url)),
  test: {
    ...apiConfig.test,
    globalSetup: fileURLToPath(new URL('../../apps/api/tests/globalSetup.js', import.meta.url)),
    include: ['previews/copilot/send-points-launch-boundary-audit.test.js'],
  },
};
