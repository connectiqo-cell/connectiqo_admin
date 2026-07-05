import { useEffect, useRef, useState } from "react";
import { useModalAnimation } from "../../hooks/useModalAnimation.js";
import { getRecordingFileUrl, getRecordingMediaType } from "../../utils/recording.js";

export function RecordingPlayerModal({ open, recording, onClose }) {
  const [playbackError, setPlaybackError] = useState("");
  const { isRendered, backdropRef, dialogRef } = useModalAnimation(open);
  const mediaRef = useRef(null);

  const fileUrl = getRecordingFileUrl(recording);
  const mediaType = getRecordingMediaType(recording);
  const isAudio = mediaType === "audio";

  useEffect(() => {
    if (!open) {
      setPlaybackError("");
      if (mediaRef.current) {
        mediaRef.current.pause();
        mediaRef.current.removeAttribute("src");
        mediaRef.current.load();
      }
    }
  }, [open]);

  if (!isRendered) return null;

  const title = recording?.id ? `Recording ${recording.id}` : "Play recording";

  return (
    <div
      className="modal modal-futuristic d-block recording-player-modal"
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="recording-player-title"
      ref={backdropRef}
      onClick={(e) => {
        if (e.target === backdropRef.current) onClose();
      }}
    >
      <div className="modal-dialog modal-dialog-centered modal-lg" role="document" ref={dialogRef}>
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title" id="recording-player-title">
              {title}
            </h5>
            <button type="button" className="btn-close" onClick={onClose} aria-label="Close" />
          </div>
          <div className="modal-body p-0">
            {fileUrl ? (
              <div className="recording-player-wrap">
                {isAudio ? (
                  <audio
                    key={fileUrl}
                    ref={mediaRef}
                    className="recording-player-audio w-100"
                    controls
                    autoPlay
                    preload="metadata"
                    src={fileUrl}
                    onError={() =>
                      setPlaybackError("Could not play this audio. Try opening the file in a new tab.")
                    }
                  >
                    <track kind="captions" />
                  </audio>
                ) : (
                  <video
                    key={fileUrl}
                    ref={mediaRef}
                    className="recording-player-video w-100"
                    controls
                    autoPlay
                    preload="metadata"
                    playsInline
                    src={fileUrl}
                    onError={() =>
                      setPlaybackError("Could not play this video. Try opening the file in a new tab.")
                    }
                  >
                    <track kind="captions" />
                  </video>
                )}
                {playbackError ? (
                  <div className="alert alert-warning m-3 mb-0 py-2 small">{playbackError}</div>
                ) : null}
              </div>
            ) : (
              <div className="p-4 text-center text-muted">
                <span className="material-icons d-block mb-2" style={{ fontSize: 40, opacity: 0.5 }}>
                  hourglass_empty
                </span>
                <p className="mb-1">Recording file is not ready yet.</p>
                <small>
                  Status: {recording?.status || "unknown"}
                  {recording?.roomId ? ` · Room: ${recording.roomId}` : ""}
                </small>
              </div>
            )}
          </div>
          <div className="modal-footer flex-wrap gap-2">
            {fileUrl ? (
              <a
                href={fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-outline-primary btn-sm"
              >
                <span className="material-icons align-middle me-1" style={{ fontSize: 16 }}>
                  open_in_new
                </span>
                Open in new tab
              </a>
            ) : null}
            <button type="button" className="btn btn-secondary btn-sm ms-auto" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
