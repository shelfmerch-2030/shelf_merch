import base from '../../../apps/api/vitest.config.js';
export default {...base,test:{...base.test,include:['tests/copilot-swag-artwork.browser-check.js']}};
