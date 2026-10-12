# camjorja-photo

Guest photo and video uploader for Jorja and Cameron's wedding, styled in navy and pale pastel yellow with floral artwork inspired by their invitation. Photos are optimised in the guest's browser, while videos retain their original quality. The browser uploads media directly to Google Drive using resumable upload sessions, with up to four files uploading at once.

## Deploy the Apps Script endpoint

The website's `SCRIPT_URL` must point to a Google Apps Script web app that runs as the Drive owner. The source for that endpoint is in [`apps-script/Code.gs`](apps-script/Code.gs).

1. Open the Apps Script project currently used by the website.
2. Replace `Code.gs` with `apps-script/Code.gs`.
3. In **Project Settings**, enable **Show "appsscript.json" manifest file in editor**, then replace the manifest with [`apps-script/appsscript.json`](apps-script/appsscript.json).
4. Save and authorize the requested Drive and external-request scopes as the Drive owner.
5. In **Deploy → Manage deployments**, edit the existing web app deployment, select **New version**, and deploy it as the owner with access for anyone. Keeping the existing deployment preserves the URL already set in `index.html`.
6. Publish `index.html`, `styles.css` and the complete `assets/` directory together to the website host. The page uses the stylesheet and both image assets, so keep their relative paths intact.

The endpoint only creates an upload session and returns its URI. File contents go from the guest's browser directly to Drive, so Apps Script does not sit in the media-transfer path. The browser shows per-file progress, sends chunks that can resume after an interrupted connection, and retries only files that did not complete.

## Upload behaviour

- Photos are optimised locally to a maximum 2000 px edge and JPEG quality 84% before transfer. If the browser cannot decode a photo format, it uploads the original file.
- Videos are uploaded without re-encoding.
- Up to four files upload concurrently.
- Uploads are placed in the Drive folder configured by `TARGET_FOLDER_ID` in `apps-script/Code.gs`.

The endpoint deliberately accepts anonymous photo and video uploads, as the previous endpoint did. Anyone who can reach the endpoint can request an upload session; this setup does not add guest authentication or abuse controls.
