# Changelog

What changed, newest first. Dates are when the work landed on the development branch.

## 2026-10-08: Hardening and docs

- **Fixes.** The browser toolbar colour now follows day/night (it was stuck on the retired
  Black theme's colour); a theme switch in one tab is followed by every other open tab;
  videos without a usable file name are labelled "Video", not "Image".
- **Tests.** Display formatters, pre-upload media checks, custom colours against the new
  palettes, served-video byte ranges, Google Drive video imports, upload-ticket expiry,
  the cursor preference, and a check that JS and CSS motion tokens never drift apart.
- **Docs.** A [contributing guide](CONTRIBUTING.md); deployment and `.env.example` now cover
  the bucket CORS rule video uploads need, and the smoke test covers themes and video.

## 2026-10-07: Day and night, depth and motion

- **Two themes, one switch.** Black + Orange (night) and White + Blue (day). A single
  sun/moon icon morphs as it switches and the new theme spreads out from it. First visits
  follow the system setting. The old Blue theme becomes night, in stored quizzes too.
- **A living cursor.** Spring-physics magnetic buttons, a link arrow, VIEW / PLAY / EDIT on
  media, a drag grip, a loading ring, click sparks and a theme-coloured trail.
- **Depth.** 3D tilt on media and cards, a parallax landing hero with 3D string art, walkers
  in three depth rows, a lobby crowd on a perspective floor.
- **The stage.** Questions assemble in layered 3D; the timer escalates through 10, 5, 3, 2
  and 1 seconds to an impact at zero; distribution bars have depth; big leaderboard climbs
  lift as they overtake; the podium has solid blocks and a moving camera.
- **Media library.** Attach any image or video straight to a question; upload dates on tiles.
- See [docs/DESIGN.md](docs/DESIGN.md).

## 2026-10-06: Video questions and the V4 visual system

- **Video questions** from the device, the library or Google Drive. Direct-to-bucket
  uploads with real progress, a server check of the file's bytes and a poster frame. The
  projector plays them muted; the host can replay or unmute. See
  [docs/MEDIA.md](docs/MEDIA.md#question-videos).
- Editorial type (Space Grotesk and Geist), motion tokens, the first custom cursor, walking
  competitors in the lobby, a new landing page, word-by-word question entrances and a
  scene-change curtain on the projector.

## 2026-10-03: Teams and live-game polish

- **Team accounts.** Admins add organisers with a shareable email and password, reset
  passwords, disable or remove accounts, and can't lock themselves out.
- Smoother live games: the main button no longer changes under the host's finger, an early
  lock says "Everyone's in", and the podium and leaderboard crossfade reliably.

## Earlier

- The control room and projector split, with a live preview of exactly what the room sees.
- Reading periods, answer distribution, a host-paced podium and timer adjustments.
- Image uploads with optimisation, a media library and Google Drive import.
- Spreadsheet and Google Sheets import, a question bank and arena customisation.
- The realtime engine, admin portal, projector and phone experience.
