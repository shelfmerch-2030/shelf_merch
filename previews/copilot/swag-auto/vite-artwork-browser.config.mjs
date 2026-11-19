import base from '../../../apps/web/vite.config.ts';
const origin=process.env.SWAG_BROWSER_API_ORIGIN;
if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin||'')) throw Error('Isolated API origin required');
export default {...base,server:{...base.server,proxy:Object.fromEntries(Object.keys(base.server.proxy).map(prefix=>[prefix,{target:origin,changeOrigin:true,timeout:0,proxyTimeout:0}]))}};
