/** Default for a new Send Points draft; explicit and saved scopes take precedence. */
export function defaultPointsScope(shop) {
  return shop?.pointsConversionEnabled ? 'stadium' : 'shop';
}
