# Images: uploads, storage and Google Drive

Question images can come from three places:

1. **Upload from device.** PNG, JPG or WEBP. Drag and drop works too.
2. **Media library.** Reuse anything you've uploaded before.
3. **Google Drive.** Real OAuth, read-only. Shown only when the server has it configured.

Pasting an `https://` image link still works as well.

## What happens to an upload

1. **Before upload (in the browser):** the file type is checked, and photos bigger than
   2560px or 3 MB are shrunk. A 12 MB phone photo uploads in about a second.
2. **The upload itself:** an ordinary HTTP `multipart/form-data` request, with a progress
   bar. Images never go over the game WebSocket.
3. **On the server:** the image is judged by its **bytes**, not its file name or claimed
   type. Then it is:
   - EXIF-rotated, with all metadata stripped;
   - re-encoded as WebP at 1920px (full size), plus 960px and 480px versions;
   - given a tiny blurred placeholder (about 300 bytes).

   SVG, GIF, HEIC, scripts renamed to `.png`, files over 8 MB, images under 64px, and
   decompression bombs are all refused.

4. **Stored:** the files go to object storage. Postgres keeps only metadata in the
   `MediaAsset` table: name, URL, size, dimensions, source, and which questions use it.
   No base64 blobs are stored.

The projector shows each image in a fixed 2:1 frame, so the layout never jumps. The
blurred placeholder appears first, then the image fades in. During the reveal and
leaderboard, the projector loads the next question's image in the background. Organisers
choose **Fit** (whole image, or fill the frame) and **Position** (center, top, bottom).

## Storage providers

Pick a provider with `MEDIA_STORAGE`:

| Value   | Use                                                                                                      |
| ------- | -------------------------------------------------------------------------------------------------------- |
| `local` | Development. Files go to `MEDIA_LOCAL_DIR` (default `./uploads`) and are served at `/api/media/files/…`. |
| `s3`    | Production. Works with any S3-compatible bucket.                                                         |
| `none`  | Uploads off. The UI says so, and image links still work.                                                 |

Do not use `local` in production on Render, Railway or Fly: their disks are wiped on every
deploy. In production the server never falls back to disk. Without `S3_*` set, uploads are
off and the admin shows the reason.

### Cloudflare R2 (recommended: 10 GB free, no egress fees)

1. In the Cloudflare dashboard, go to **R2**, then **Create bucket**. Example name:
   `quizarena-media`.
2. In the bucket's **Settings**, find **Public access** and enable the `r2.dev` subdomain (or
   attach a custom domain). That URL is your `S3_PUBLIC_URL`.
3. Under **R2**, choose **Manage API tokens**, then **Create API token** with _Object Read &
   Write_ on that bucket. Copy the access key ID and secret.
4. Set these on the game server (Render, under **Environment**):

   ```
   S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
   S3_REGION=auto
   S3_BUCKET=quizarena-media
   S3_ACCESS_KEY_ID=…
   S3_SECRET_ACCESS_KEY=…
   S3_PUBLIC_URL=https://pub-xxxxxxxx.r2.dev
   ```

### Supabase Storage (1 GB free)

1. Go to **Storage**, then **New bucket**. Name it `quizarena-media` and mark it **Public**.
2. Go to **Project Settings**, then **Storage**, then **S3 Connection**. Enable it and
   create an access key.
3. Set these on the game server:

   ```
   S3_ENDPOINT=https://<project-ref>.supabase.co/storage/v1/s3
   S3_REGION=<your project region, e.g. ap-south-1>
   S3_BUCKET=quizarena-media
   S3_ACCESS_KEY_ID=…
   S3_SECRET_ACCESS_KEY=…
   S3_PUBLIC_URL=https://<project-ref>.supabase.co/storage/v1/object/public/quizarena-media
   ```

### AWS S3 / MinIO

Use `S3_ENDPOINT=https://s3.<region>.amazonaws.com` with `S3_REGION=<region>` (MinIO: your
server URL). Make the bucket's objects publicly readable, or put a CDN in front of it, and use
that URL as `S3_PUBLIC_URL`.

Objects are written with `Cache-Control: public, max-age=31536000, immutable`, so they sit
on the CDN or in browsers. That matters on free tiers: images never pass through the game
server's bandwidth after upload.

## Google Drive

Organisers can pick images from their own Google Drive:

1. Click **Google Drive**. The first time, a Google consent popup asks for **read-only**
   access (`drive.readonly`).
2. The picker lists their PNG, JPG and WEBP files, with search.
3. Picking one makes the server download it and run it through the same validation and
   optimization as an upload. It lands in the media library.

The browser never sees a Google token. The refresh token is stored AES-256-GCM encrypted.
`state` is signed and tied to the signed-in organiser and to a one-time cookie.
Disconnecting revokes the grant at Google.

### Set up the OAuth client

1. Open the [Google Cloud console](https://console.cloud.google.com/) and create or select
   a project.
2. **Enable the API:** go to **APIs & Services**, then **Library**, and enable the
   **Google Drive API**.
3. **Configure the consent screen** (**APIs & Services**, then **OAuth consent screen**):
   - User type **External**, app name "QuizArena", your support email.
   - Scopes: `openid`, `email`, `…/auth/drive.readonly`.
   - **Test users:** add the Google accounts of everyone who will pick images.

   While the app is in **Testing**, only those accounts can connect, and Google expires
   their grants after 7 days. They just click "Google Drive" again to reconnect. Taking
   the app to production with `drive.readonly` needs Google's verification.

4. **Create the client** (**APIs & Services**, then **Credentials**, then **Create
   credentials**, then **OAuth client ID**):
   - Application type: **Web application**.
   - **Authorized redirect URIs:** your web app's domain plus `/api/google/callback`,
     for example:
     - `https://quiz-arena-six-alpha.vercel.app/api/google/callback`
     - `http://localhost:3000/api/google/callback` (development)

   The callback goes to the **web** domain, not the game server. Vercel proxies `/api/*`
   to the game server, so the organiser's session cookie comes along.

5. **Set these on the game server** (Render, under **Environment**):

   ```
   GOOGLE_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=…
   GOOGLE_REDIRECT_URI=https://quiz-arena-six-alpha.vercel.app/api/google/callback
   ```

   The secret lives only on the game server. If any of the three is missing, the Google
   Drive button is hidden. It is never shown without working.
