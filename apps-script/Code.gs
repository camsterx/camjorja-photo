const TARGET_FOLDER_ID = '1XUbvnILCrkP9QsPwseU3xu0OUAsY6BxH';
const DRIVE_RESUMABLE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable';

/**
 * Starts a Google Drive resumable upload. The browser sends the media bytes
 * directly to the returned Drive session URI; Apps Script never relays them.
 */
function doPost(e) {
  try {
    const data = JSON.parse(e && e.postData && e.postData.contents || '{}');
    if (data.action !== 'initiateUpload') {
      throw new Error('Unsupported request.');
    }

    const name = String(data.name || '').replace(/[\u0000-\u001F\u007F]/g, '_').trim().slice(0, 180);
    const mimeType = String(data.mimeType || '').toLowerCase();
    const size = Number(data.size);

    if (!name) throw new Error('The file needs a name.');
    if (!/^(image|video)\/[a-z0-9.+-]+$/.test(mimeType)) {
      throw new Error('Please choose a supported photo or video.');
    }
    if (!Number.isSafeInteger(size) || size <= 0) {
      throw new Error('The selected file has an invalid size.');
    }

    const metadata = {
      name: name,
      mimeType: mimeType,
      parents: [TARGET_FOLDER_ID]
    };
    const response = UrlFetchApp.fetch(DRIVE_RESUMABLE_UPLOAD_URL, {
      method: 'post',
      contentType: 'application/json; charset=UTF-8',
      headers: {
        Authorization: 'Bearer ' + ScriptApp.getOAuthToken(),
        'X-Upload-Content-Type': mimeType,
        'X-Upload-Content-Length': String(size)
      },
      payload: JSON.stringify(metadata),
      muteHttpExceptions: true
    });

    const status = response.getResponseCode();
    if (status < 200 || status >= 300) {
      throw new Error('Google Drive could not start the upload (HTTP ' + status + '): ' + response.getContentText());
    }

    const headers = response.getAllHeaders();
    const sessionUri = headers.Location || headers.location;
    if (!sessionUri) throw new Error('Google Drive did not return an upload session.');

    return jsonResponse({ result: 'success', sessionUri: sessionUri });
  } catch (error) {
    return jsonResponse({ result: 'error', error: error && error.message ? error.message : String(error) });
  }
}

function jsonResponse(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
