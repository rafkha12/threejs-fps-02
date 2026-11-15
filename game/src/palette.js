// The look plan, in one place. Duskline's palette is a foundry yard at dusk:
// deep blue ground and sky, warm ember orange as the single accent, pale
// ink for markings, and one cold blue for the Frost team. Every colour in the
// game and the HUD is one of these eight names.
export const PALETTE = {
  canvas: '#0e1118', // dusk sky / ground haze
  surface: '#1b212c', // concrete and steel
  hairline: '#2f3847', // crates, pipes, wall trim
  ink: '#ece7db', // markings, view-model metal
  muted: '#8b95a5', // distant steel, dim text
  accent: '#ff9a2e', // ember orange: Ember team, tracers, spike
  ember: '#ff9a2e', // Ember team colour
  frost: '#4cc2ff', // Frost team colour
};

export function shade(name) {
  return PALETTE[name];
}
