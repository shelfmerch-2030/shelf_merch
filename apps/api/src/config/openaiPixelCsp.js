/**
 * Hosts from the OpenAI Measurement Pixel CSP guide:
 * https://developers.openai.com/ads/measurement-pixel
 * Listing them does not load the pixel. The browser snippet stays off until
 * consent exists and VITE_OPENAI_PIXEL_ID is set at build time.
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
