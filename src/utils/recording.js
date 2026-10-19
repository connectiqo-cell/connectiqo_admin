export function getRecordingFileUrl(recording) {
  if (!recording) return null;
  const url =
    recording?.file?.fileUrl ||
    recording?.fileUrl ||
    recording?.file?.url ||
    recording?.url ||
    recording?.recording_playback_url ||
    recording?.recording_url ||
    recording?.video_url ||
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

/** Normalize VideoSDK / app recording status for display. */
export function getRecordingStatus(recording) {
  const raw =
    recording?.status ||
    recording?.recordingStatus ||
    recording?.state ||
    recording?.file?.status ||
    null;

  if (typeof raw === "string" && raw.trim()) {
    return raw.trim().toLowerCase();
  }

  if (canPlayRecording(recording)) return "completed";
  if (recording?.file || recording?.end) return "processing";
  return "unknown";
}

export function getRecordingStatusBadgeClass(status) {
  const value = String(status || "").toLowerCase();
  if (value === "completed" || value === "ready") return "text-bg-success";
  if (value === "failed" || value === "error") return "text-bg-danger";
  if (value === "processing" || value === "recording" || value === "pending") {
    return "text-bg-warning";
  }
  return "text-bg-secondary";
}
