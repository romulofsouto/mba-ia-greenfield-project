// Object layout keyed by the internal video id (never the public id).
export function videoPrefix(videoId: string): string {
  return `videos/${videoId}/`;
}

export function videoObjectKey(videoId: string): string {
  return `${videoPrefix(videoId)}original`;
}

export function thumbnailPrefix(videoId: string): string {
  return `thumbnails/${videoId}/`;
}

export function thumbnailObjectKey(videoId: string): string {
  return `${thumbnailPrefix(videoId)}default.jpg`;
}
