# Conductor

A small subway intercom for “Conductor, we have a problem.”

Press the red button to start the supplied eight-second recording from the beginning. Keep holding to hear the full clip; releasing stops it immediately. Each new press starts over. Space works anywhere on the page, and Enter works while the button is focused. Screen-reader activation toggles playback.

The button depresses and springs back, with short press/release vibration pulses when the browser and device support the Vibration API. Unsupported devices still get the animated button and green playback indicator. Reduced-motion preferences remove the spring animation.

## Development

Requires Node.js 20 or newer. No dependencies, database, secrets, or framework are needed.

```sh
npm run dev
npm test
npm run build
```

The local preview runs at http://127.0.0.1:4173. Vercel serves `public/` using the configuration in `vercel.json`.

## Implementation

The original WAV is preloaded and decoded with Web Audio. Each press creates a fresh buffer source, which avoids media seeking delays during rapid retriggering. A generation token prevents delayed loading or audio-context startup from playing after release. Pointer capture, pointer cancellation, window blur, and page visibility changes prevent stuck playback. The sample plays once per hold and never loops.

On iPhone, the app requests the `playback` audio-session type so the ring/silent switch does not mute the clip on Safari versions supporting that API. Native touch events start and stop the hold; touch release also unlocks the audio context for Safari versions that require a completed tap before playback. Device media volume still controls the sound level.

The metal, screws, holes, indicator, and button are CSS and a small procedural SVG texture. The reference photograph is not shipped. The audio is the user-provided recording, unchanged.

## Deployment

Production: https://conductor-button.vercel.app/

GitHub: https://github.com/mjamrst/conductor-button

The existing Vercel project is `conductor-button` in `mjamrsts-projects`. Link a new checkout explicitly with `vercel link --project conductor-button --scope mjamrsts-projects` before deploying. Local `.vercel/` and environment files must stay untracked.
