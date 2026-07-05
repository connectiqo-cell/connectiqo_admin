export function getRecordingFileUrl(recording) {
  if (!recording) return null;
  const url =
    recording?.file?.fileUrl ||
    recording?.fileUrl ||
    recording?.file?.url ||
    recording?.url ||
    null;
  return typeof url === "string" && url.trim() ? url.trim() : null;
}

export function getRecordingMediaType(recording) {
  const type = recording?.file?.type || recording?.type || "";
  if (String(type).toLowerCase() === "audio") return "audio";
  return "video";
}

export function canPlayRecording(recording) {
  return Boolean(getRecordingFileUrl(recording));
}
