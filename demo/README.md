# Real-footage launch demo

Target: 24 seconds, 1920×1080, 60 fps; real application footage, English AI narration, no music or sound effects. Editing cuts may omit model waiting time. Never substitute fixture replies or redraw the product UI.

## Record

On the prepared Mac, double-click **Record-PromiseGraph.command**. It starts a temporary local application for each take, records both resolutions, encodes each unedited source as `real-app-source.mp4`, and saves timestamp/stream metadata under `.data/demo/<timestamp>/`. It uses isolated embedded graphs even when remote database settings exist. It uses the existing server-side DeepSeek configuration and can consume model credits. This is source capture only; it does not claim to create the finished narrated edit.

Install the independent demo dependencies with `npm ci` in this directory. Start the application from its parent directory using a new, disposable graph path:

```sh
DATA_DIR=.data/demo-recording-1080 PORT=4175 npm start
```

Then run from this directory:

```sh
DEMO_URL=http://127.0.0.1:4175 node capture.mjs
```

For the second take, use a second empty graph and port, then set `DEMO_SCALE=2`. The viewport remains 1920×1080 CSS pixels while the source pixels are 3840×2160. `CHROME_PATH` can select an installed Chromium executable. `--inspect` captures one preflight image without importing or generating anything.

The script imports explicitly fictional source text, makes real extraction/drafting requests through the application, confirms each fact through the UI, saves the reviewed draft and reloads persisted state. It adds only a visible cursor as recording instrumentation. Its compositor timestamps, measured delivered frame rate and visual beat anchors are written to `.data/demo/<take>/capture.json`. CDP screencasting has no guaranteed 60-fps setting: the exported movie can be 60 fps, but source delivery must be measured rather than claimed.

## Narration and submission gates

Inspect the captured frames before mapping narration. Generate one ChatCut voice clip per actual visual beat after the user selects a live catalog voice. Do not generate one long clip and stretch it over different states. Confirm each audio duration fits its visual slot, and check the composed render after placement.

The final video must use H.264 CRF 16, AAC, faststart, voice loudness around −16 LUFS with true peak below −1 dBTP. Verify stream metadata, narration synchronization, legibility and frame boundaries before publishing a demo URL or submitting the hackathon form.

Current session: recording has not succeeded yet. The installed Google Chrome exits before a page opens; ChatCut OAuth could not save its credential lock because filesystem access was denied. No voice, finished render or demo URL is claimed by these scripts.
