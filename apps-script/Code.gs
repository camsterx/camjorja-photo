const TARGET_FOLDER_ID = '1XUbvnILCrkP9QsPwseU3xu0OUAsY6BxH';
const DRIVE_RESUMABLE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable';
const DRIVE_FILES_LIST_URL = 'https://www.googleapis.com/drive/v3/files';

/**
 * Creates a Drive resumable-upload session or checks an existing session.
 * Media bytes travel directly from the guest's browser to Google Drive.
 */
function doPost(e) {
  try {
    const data = JSON.parse(e && e.postData && e.postData.contents || '{}');
    if (data.action === 'initiateUpload') return initiateUpload(data);
    if (data.action === 'checkUpload') return checkUpload(data);
    throw new Error('Unsupported request.');
  } catch (error) {
    return jsonResponse({ result: 'error', error: error && error.message ? error.message : String(error) });
  }
}

function initiateUpload(data) {
  const name = String(data.name || '').replace(/[\u0000-\u001F\u007F]/g, '_').trim().slice(0, 180);
  const mimeType = String(data.mimeType || '').toLowerCase();
  const size = Number(data.size);
  const uploadId = validateUploadId(data.uploadId);

  if (!name) throw new Error('The file needs a name.');
  if (!/^(image|video)\/[a-z0-9.+-]+$/.test(mimeType)) {
    throw new Error('Please choose a supported photo or video.');
  }
  if (!Number.isSafeInteger(size) || size <= 0) {
    throw new Error('The selected file has an invalid size.');
  }

  // A repeated request for a completed upload returns the existing file instead
  // of creating a duplicate after a lost browser response or expired session.
  if (data.checkExisting === true) {
    const existingFile = findCompletedUpload(uploadId);
    if (existingFile) {
      return jsonResponse({ result: 'success', complete: true, file: existingFile });
    }
  }

  const metadata = {
    name: name,
    mimeType: mimeType,
    parents: [TARGET_FOLDER_ID],
    appProperties: { guestUploadId: uploadId }
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

  const sessionUri = getHeader(response.getAllHeaders(), 'Location');
  if (!sessionUri) throw new Error('Google Drive did not return an upload session.');
  return jsonResponse({ result: 'success', complete: false, sessionUri: sessionUri });
}

function checkUpload(data) {
  const sessionUri = String(data.sessionUri || '');
  const uploadId = validateUploadId(data.uploadId);
  const size = Number(data.size);

  if (!isDriveSessionUri(sessionUri)) throw new Error('The upload session is not valid.');
  if (!Number.isSafeInteger(size) || size <= 0) throw new Error('The selected file has an invalid size.');

  const response = UrlFetchApp.fetch(sessionUri, {
    method: 'put',
    contentType: 'application/octet-stream',
    headers: {
      Authorization: 'Bearer ' + ScriptApp.getOAuthToken(),
      'Content-Range': 'bytes */' + size
    },
    payload: '',
    followRedirects: false,
    muteHttpExceptions: true
  });

  const status = response.getResponseCode();
  if (status === 200 || status === 201) {
    return jsonResponse({
      result: 'success',
      complete: true,
      file: parseJson(response.getContentText())
    });
  }
  if (status === 308) {
    return jsonResponse({
      result: 'success',
      complete: false,
      nextOffset: getNextOffset(getHeader(response.getAllHeaders(), 'Range'))
    });
  }
  if (status === 404 || status === 410) {
    const completedFile = findCompletedUpload(uploadId);
    if (completedFile) {
      return jsonResponse({ result: 'success', complete: true, file: completedFile });
    }
    return jsonResponse({ result: 'success', complete: false, expired: true, nextOffset: 0 });
  }

  return jsonResponse({
    result: 'error',
    status: status,
    error: 'Google Drive could not check this upload (HTTP ' + status + ').'
  });
}

function findCompletedUpload(uploadId) {
  const query = "'" + TARGET_FOLDER_ID + "' in parents and appProperties has { key='guestUploadId' and value='" + uploadId + "' } and trashed = false";
  const fields = 'files(id,name,mimeType,size,webViewLink)';
  const url = DRIVE_FILES_LIST_URL
    + '?q=' + encodeURIComponent(query)
    + '&spaces=drive&pageSize=1&fields=' + encodeURIComponent(fields);
  const response = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  });

  const status = response.getResponseCode();
  if (status < 200 || status >= 300) {
    throw new Error('Google Drive could not check the album for this upload (HTTP ' + status + ').');
  }
  const result = parseJson(response.getContentText()) || {};
  const files = result.files || [];
  return files.length ? files[0] : null;
}

function validateUploadId(value) {
  const uploadId = String(value || '').toLowerCase();
  if (!/^[a-f0-9]{32}$/.test(uploadId)) throw new Error('The upload reference is not valid.');
  return uploadId;
}

function isDriveSessionUri(uri) {
  const match = uri.match(/^https:\/\/www\.googleapis\.com\/upload\/drive\/v3\/files\?([^#]+)$/i);
  return Boolean(match && /(?:^|&)upload_id=[^&]+/.test(match[1]));
}

function getNextOffset(range) {
  const match = String(range || '').match(/bytes=0-(\d+)/i);
  return match ? Number(match[1]) + 1 : 0;
}

function getHeader(headers, name) {
  const target = name.toLowerCase();
  const key = Object.keys(headers || {}).find(header => header.toLowerCase() === target);
  return key ? headers[key] : '';
}

function parseJson(text) {
  try { return text ? JSON.parse(text) : null; } catch (error) { return null; }
}

function jsonResponse(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
