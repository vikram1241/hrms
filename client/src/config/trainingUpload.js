/** Keep in sync with server/middleware/uploadVideo.js + client/nginx.conf. */
export const MAX_TRAINING_VIDEO_MB = 200;
export const MAX_TRAINING_VIDEO_BYTES = MAX_TRAINING_VIDEO_MB * 1024 * 1024;
export const TRAINING_VIDEO_ACCEPT = 'video/mp4,video/webm,video/quicktime';
export const TRAINING_VIDEO_FORMAT_LABEL = 'MP4, WEBM, or MOV';
export const TRAINING_VIDEO_MIME = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime'
]);
