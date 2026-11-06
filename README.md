---
title: Big Brother 3D
emoji: 👁️
colorFrom: blue
colorTo: pink
sdk: docker
app_port: 7860
pinned: false
---

# 👁️ האח הגדול – Big Brother 3D

A first-person multiplayer reality-show game that runs in the browser: 3–16 players, proximity voice chat, a live intro cutscene in the studio, and one human player as Big Brother who watches every camera.

Everything is generated in code. There are no external 3D or audio assets: the house, the studio, the avatars, textures, sound effects and music are all procedural. The only image file is the supplied logo (`client/public/logo.png`).

---

## Quick start (local)

```bash
npm install
npm run dev            # game server :3000 + Vite :5173 (auto-reload)
```

Open `http://localhost:5173` in a few tabs or browsers. The microphone works on `localhost` without HTTPS.
To test alone, lower the minimum player count: `BB_MIN_PLAYERS=1 npm run dev:server` and `npx vite` in a separate terminal.

Production build:

```bash
npm run build && npm start   # http://localhost:3000 (the server also serves dist/)
```

Tests:

```bash
npm test               # unit tests (physics, layout, occlusion, security, timeline) + full season with 7 bot clients
npm run test:e2e       # 3 real Chromium browsers with fake mics: lobby → WebRTC voice → intro → Big Brother
npm run test:e2e:full  # 4 browsers play a full season (accelerated time) through the UI
```

---

## Architecture

```
shared/            ← one source of truth for client and server
  layout.js        house: rooms, walls, doors, furniture, colliders, cameras, interactables, spawn points
  physics.js       character physics (client prediction = server validation)
  tasks.js         library of 44 tasks + 14 secret missions + trivia + ingredients
  constants.js     phases, durations, powers, shop, emotes
  intro.js         intro timing (keeps server and clients in sync)
server/
  index.js         HTTP (static + CSP) + WebSocket (ws), rate limiting, create/join/resume
  voice.js         LiveKit tokens / TURN credentials (coturn REST)
  game/Room.js     authoritative state machine, movement validation, combat, votes, Big Brother commands
  game/tasks.js    20 task "kinds" (gather, relay, code, race, hide-and-seek, lava, pillows, trivia, cooking...)
  game/items.js    pick up / throw / ballistic simulation of objects
  game/events.js   random events, Big Brother twists, the dog, mystery package, letters
  game/diary.js    drama diary + end-of-season awards from real game data
client/src/
  app.js           orchestration: screens → connection → world → game loop
  world/           House (geometry merged per material), Studio, Avatar, Players (interpolation), Items/FX/Dog
  world/materials.js  "room lighting" shader: per-room light level/tint + fake baked AO (no real lights → fast)
  player/          FPS controller + keyboard/mouse/touch (virtual joystick)
  voice/           Voice (spatial mix), MeshTransport (P2P), LiveKitTransport (SFU), pitch-shift worklet
  cutscene/        intro.json (data) + timeline.js (pure builder) + Intro.js (player)
  bb/ControlRoom.js  camera wall (render targets + CRT shader), single view, free camera
  ui/              screens (menu / avatar creator / mic gate), hud (HUD, modals, Big Brother panel)
  audio/Audio.js   SFX synthesis, adaptive music sequencer, reverb, Hebrew TTS
```

### Server state machine (per day)

```
LOBBY ─start→ INTRO ─(all clients ready → shared startAt)→ MORNING → TASK → FREE → CONFESSION
   ↑                                                            (≤2 houseguests → FINALE_TASK → FINAL_VOTE → GAME_OVER)
   └─ host "rematch" ← GAME_OVER ← … SUMMARY ← EVICTION ← EVICTION_VOTE(tiebreak) ← REVEAL ← NOMINATION(fallback)
```

- **Server-authoritative:** the client sends its position at 15Hz. The server re-runs the shared physics from the last valid position (speed + walls + doors), and if they diverge it sends `correct`. Teleports carry an epoch (`tp`), so stale messages are dropped.
- **Per-client filtering:** each client gets a `stateFor(player)`. Houseguests never receive ghost positions, other players' votes, secret missions, who the spy is, or the nominations (only Big Brother does).
- **Snapshots:** 15Hz, client-side interpolation with a 110ms buffer (no teleport jitter).
- **Edge cases:** reconnect with a token (sessionStorage) and full state restore; a disconnected player shows an "offline" tag and doesn't block votes; if Big Brother disconnects the house switches to autopilot, and the host can hand the role to an evicted player; the host role passes on automatically; ties are broken by Big Brother (or randomly if they're absent); a late joiner waits in the secret room until Big Brother releases them.
- **Security:** a token bucket per connection, per IP, and on chat/actions; all input is validated (names, colors, values from fixed lists only); text is stripped of HTML/bidi/control characters and escaped on render; CSP; WS `maxPayload`.

---

## 🎙️ Voice: setup (the most important part)

Proximity voice runs on the client in Web Audio, on top of either transport:

```
mic → high-pass → pitch shift (AudioWorklet: Big Brother's deep voice / chipmunk punishment) → gate (mute/PTT) → VAD → WebRTC
speaker: source → occlusion gain → low-pass (walls: 2.4k/1.1k/520Hz) → HRTF Panner → bus
         + PA branch (Big Brother / megaphone / farewell speech) → reverb, non-spatial
```

Hearing radius is 20m (4m in the "whispers" punishment). An open door counts as a gap, a closed door as half a wall.

### Option A: LiveKit (recommended for 6–16 players)

1. LiveKit Cloud (free tier) **or** self-hosted: `docker compose up` (includes LiveKit in dev mode).
2. Set:
   ```bash
   LIVEKIT_URL=wss://xxx.livekit.cloud
   LIVEKIT_API_KEY=...
   LIVEKIT_API_SECRET=...
   ```
3. The server issues a token per player (room `bb_<CODE>`, microphone publish only). The client subscribes **only to players within hearing range** (saves bandwidth) and mixes the audio itself.
   LiveKit ships an embedded TURN server. For self-hosting, enable `turn.enabled: true` with a domain and TLS on 443/5349, otherwise corporate and cellular networks won't connect.

### Option B: P2P mesh (automatic fallback, good up to about 6)

When LiveKit isn't configured, the game server relays WebRTC signaling (perfect negotiation, automatic reconnect for stuck connections). To work behind NAT/firewalls you need TURN, for example coturn:
```bash
TURN_URLS=turn:turn.example.com:3478?transport=udp,turns:turn.example.com:5349
TURN_SECRET=<static-auth-secret from turnserver.conf>   # time-limited credentials, generated per player
```

### HTTPS

Browsers only allow the microphone on HTTPS (or localhost). In production, put a reverse proxy in front (Caddy: `bb.example.com { reverse_proxy localhost:3000 }`) and make sure it passes WebSocket on `/ws`.

## Cloud deployment

- **Docker:** `docker build -t bb . && docker run -p 3000:3000 --env-file .env bb`
- **Fly.io / Render / Railway:** deploy the Dockerfile, set the environment variables, enable HTTPS (they provide it), use a single instance (rooms live in memory).
- Recommended: LiveKit Cloud + a single Node instance (one instance handles dozens of houses).

---

## What's in the game

- **The house:** living room (U-shaped sofas, eye-shaped light ring, eye screen above the eviction door), kitchen with an island and the shop machine, an 8-bed bedroom, bathrooms and showers, the diary room (iconic chair, camera, blue LED walls), isolation room, secret room (round bed, disco ball), exit corridor, and a yard with a pool, deck, jacuzzi, garden stage, gym, fire pit, bar, gossip corner and studio-style LED walls. The eye logo appears on screens, doors and signs.
- **Movement:** WASD/mouse or joystick/touch, running with stamina, jumping onto furniture, crouching, swimming, sitting, sleeping in bed, footsteps.
- **Fights:** push (F), cartoon punch (click), pillow, throwing a glass of water / tomato / objects, comic tumble with flailing limbs, splash/splat screen effects. Big Brother gets an alert for every fight and the "who started it" stat is tracked.
- **Intro cutscene** in a studio recreated from the photo: eye-shaped stage with stairs, LED walls, moving lights, a crowd with phone lights, two hosts, entrant cards and spoken announcements, random entry order, each entrant's chosen entrance move, a shared start time, waiting for everyone to load, host skip, and jumping to the end on reconnect.
- **Big Brother:** a 12-camera wall (REC/time/CRT), single camera, free camera, listening per room, push-to-talk to the whole house or to the diary room with a deep processed voice, text announcements with narration, task selection or custom tasks with judging, instant punishments, 7 twists, 7 events, lights/music/doors/secret room control, phase control, per-houseguest actions (isolation, warning, coins, immunity, confirming secret missions), drama meter, room heat, who-talks-to-whom, and a feed of confessions and fights.
- **Systems:** 44 tasks in 20 mechanics, 14 secret missions, a spy with sabotage and a target, accusing the spy from the diary room, alliances (🤝 visible to members only), gifts, reputation and relationships, a shop with 8 items, 6 powers (immunity, veto, peek, swap, x-ray, megaphone), ghosts (free fly, reactions, audience vote, ghost-only chat), a daily drama diary, awards, and easter eggs (the golden eye behind the bar, the eye poster in the bathroom, a message on the bedroom ceiling, the piano, "האח הגדול?" in chat).

## What's new in season 2
- **Big Brother decides:** the houseguests vote, but Big Brother makes the final call (the votes only guide them). If Big Brother is offline, the votes decide.
- **Not every day is an eviction:** "season length" in the lobby (short/normal/long = an eviction every 1/2/3 days; one more day when there are few houseguests).
- **Studio exit:** the evicted player climbs the stairs in the exit corridor, comes out of the eye door in the studio, walks down the stairs, says goodbye to the hosts, and leaves down the runway.
- **SAVE button** next to the exit door: once per season, only during the eviction. It takes ₪100,000 off the prize and brings the evicted player back.
- **Fake eviction** (once per season): the player "is evicted," secretly watches the cameras and hears the house, and returns after two days or when Big Brother decides.
- **Evicted players** watch through the camera wall (grid/single/free) with listening per room.
- **Life in the house:** budget meetings on a shared tablet, deliveries that arrive the next morning and get unloaded into the fridge, cooking 10 recipes at the stove, hunger, sunbathing (and sunburn 🦞), a wardrobe room for changing clothes.
- **Big Brother events:** a night party in the yard with fireworks, a pajama party, and a barbecue grill that lands by parachute.
- **"Under the blanket" 🙈:** only with both players' consent and the lights off; shown only as a moving blanket and hearts.
- 86 tasks, 40 trivia questions.

## Known limitations

- The "ragdoll" is a procedural comic animation, not a physics simulation.
- Social tasks (a secret word, impressions) are judged by Big Brother. There is no speech recognition.
- With LiveKit, sound gating is done on the client. A technical user who modifies the code could hear everyone. A full fix uses LiveKit server-side subscription permissions (idea #1 below).
- Hebrew narration depends on a Hebrew voice in the operating system (Web Speech). Without one, captions only.
- Rooms are in memory: a server restart ends active games.

## 10 ideas for expansion

1. Server-side audio permissions in LiveKit (`UpdateSubscriptionPermission`) so privacy is enforced on the server.
2. A highlight clip at the end of each day: recording the "hot" moments from the cameras (MediaRecorder) and playing them on the house TV.
3. A live public vote over the web: spectators with a link vote (QR on the house screen).
4. Speech-to-text (Whisper) to verify "make them say a word" tasks automatically and to fill the drama diary with quotes.
5. Real lightmaps baked in Blender plus GLTF models (Kenney) with LOD for an even richer look.
6. Seasons and save: player profiles, winner history and an "all-time champions" leaderboard.
7. An AI Big Brother (LLM) that picks twists based on the drama meter and writes custom announcements in Hebrew.
8. A "partner" mode where two players share one character (one walks, one talks).
9. A layout editor: a JSON editor that changes the house (the layout is already shared by server and client).
10. Spectator mode with Twitch/YouTube output: a director camera that cuts automatically to the room with the highest drama.
