/**
 * Hosts from the OpenAI Measurement Pixel CSP guide:
 * https://developers.openai.com/ads/measurement-pixel
 * Listing them does not load the pixel. The browser snippet stays off until
 * consent is granted, VITE_OPENAI_PIXEL_ID is set, and automatic advanced
 * matching has been reviewed.
 *
 * script-src-elem is left unset so it inherits script-src. connect-src already
 * allows https:, which covers these hosts and the existing GA4 and Meta
 * collection endpoints. script-src is still 'self' plus the OpenAI script host.
 * Enforcing that policy would block the GTM, GA4, and Meta scripts. CSP_MODE
 * stays report-only until those hosts are included and tested.
 */
export const OPENAI_MEASUREMENT_PIXEL_CSP = {
  scriptSrc: ['https://bzrcdn.openai.com'],
  connectSrc: ['https://bzr.openai.com', 'https://bzrcdn.openai.com'],
  imgSrc: ['https://bzr.openai.com'],
};

export function mergeOpenAiPixelCsp(directives) {
  return {
    ...directives,
    scriptSrc: [...directives.scriptSrc, ...OPENAI_MEASUREMENT_PIXEL_CSP.scriptSrc],
    connectSrc: [...directives.connectSrc, ...OPENAI_MEASUREMENT_PIXEL_CSP.connectSrc],
    imgSrc: [...directives.imgSrc, ...OPENAI_MEASUREMENT_PIXEL_CSP.imgSrc],
  };
}
