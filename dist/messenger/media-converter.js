import { PassThrough } from "stream";
const MIME_TO_EXT = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
    "audio/mpeg": ".mp3",
    "audio/ogg": ".ogg",
    "audio/wav": ".wav",
    "audio/webm": ".webm",
    "application/pdf": ".pdf",
    "application/octet-stream": ".bin",
    "text/plain": ".txt",
};
export function bufferToReadStream(data, mimetype) {
    const buffer = typeof data === "string" ? Buffer.from(data, "base64") : data;
    const ext = MIME_TO_EXT[mimetype] || "";
    const filename = `media${ext}`;
    const pt = new PassThrough();
    pt.end(buffer);
    return { stream: pt, filename };
}
//# sourceMappingURL=media-converter.js.map