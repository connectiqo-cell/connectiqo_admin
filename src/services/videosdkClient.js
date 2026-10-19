import axios from "axios";

const TOKEN_TTL_MS = 10 * 60 * 1000;
const TOKEN_TIMEOUT_MS = 20000;
const VIDEOSDK_TIMEOUT_MS = 60000;

let cachedToken = null;
let cachedTokenAt = 0;
let cachedTokenKey = "";

function axiosErrorMessage(error, fallback) {
  if (error?.code === "ECONNABORTED" || /timeout/i.test(error?.message || "")) {
    return `${fallback}: request timed out — VideoSDK is slow or unreachable from this network`;
  }
  const status = error?.response?.status;
  const data = error?.response?.data;
  const apiMsg =
    (typeof data === "string" && data) ||
    data?.error ||
    data?.message ||
    data?.msg ||
    null;
  if (status && apiMsg) return `${fallback} (HTTP ${status}: ${apiMsg})`;
  if (status) return `${fallback} (HTTP ${status})`;
  if (error?.code === "ERR_NETWORK") {
    return `${fallback}: network error — check auth/token server is reachable from the browser`;
  }
  return error?.message || fallback;
}

/**
 * Prefer Supabase edge function (same as the mobile app).
 * Fall back to legacy VITE_AUTH_SERVER_URL /get-token if configured.
 */
async function getVideoToken(config) {
  const cacheKey = `${config?.supabaseUrl || ""}|${config?.authServerUrl || ""}`;
  if (
    cachedToken &&
    cachedTokenKey === cacheKey &&
    Date.now() - cachedTokenAt < TOKEN_TTL_MS
  ) {
    return cachedToken;
  }

  const errors = [];

  if (config?.supabaseUrl && config?.supabaseAnonKey) {
    try {
      const response = await axios.get(
        `${config.supabaseUrl}/functions/v1/get-videosdk-token`,
        {
          headers: {
            apikey: config.supabaseAnonKey,
            Authorization: `Bearer ${config.supabaseAnonKey}`,
          },
          timeout: TOKEN_TIMEOUT_MS,
        }
      );
      const token = response?.data?.token;
      if (token) {
        cachedToken = token;
        cachedTokenAt = Date.now();
        cachedTokenKey = cacheKey;
        return token;
      }
      errors.push("Supabase get-videosdk-token returned no token");
    } catch (error) {
      errors.push(axiosErrorMessage(error, "Supabase token endpoint failed"));
    }
  } else {
    errors.push("Supabase URL / anon key missing for selected environment");
  }

  if (config?.authServerUrl) {
    try {
      const tokenResponse = await axios.get(`${config.authServerUrl}/get-token`, {
        timeout: TOKEN_TIMEOUT_MS,
      });
      const token = tokenResponse?.data?.token;
      if (token) {
        cachedToken = token;
        cachedTokenAt = Date.now();
        cachedTokenKey = cacheKey;
        return token;
      }
      errors.push("Auth server did not return VideoSDK token");
    } catch (error) {
      errors.push(axiosErrorMessage(error, "Auth server /get-token failed"));
    }
  } else {
    errors.push("Auth server URL is not configured");
  }

  throw new Error(errors.join(" | "));
}

function authHeaders(token) {
  return { Authorization: token };
}

/** List shape only — strip file URLs; fetch full recording on Play. */
function normalizeSdkRecordingListItem(row) {
  if (!row || typeof row !== "object") return row;
  const status =
    row.status ||
    row.recordingStatus ||
    row.state ||
    row.file?.status ||
    (row.file?.fileUrl || row.fileUrl ? "completed" : row.file || row.end ? "processing" : "unknown");

  return {
    id: row.id,
    source: "sdk",
    status: String(status).toLowerCase(),
    roomId: row.roomId || row.room_id || row.meetingId || null,
    sessionId: row.sessionId || row.session_id || null,
    // Keep duration for the table; drop heavy file / URL payloads
    duration: row?.file?.meta?.duration ?? row?.duration ?? null,
  };
}

function normalizeSdkRecording(row) {
  if (!row || typeof row !== "object") return row;
  const status =
    row.status ||
    row.recordingStatus ||
    row.state ||
    row.file?.status ||
    (row.file?.fileUrl || row.fileUrl ? "completed" : row.file || row.end ? "processing" : "unknown");

  return {
    ...row,
    source: "sdk",
    status: String(status).toLowerCase(),
    roomId: row.roomId || row.room_id || row.meetingId || null,
  };
}

function extractRecordingList(payload) {
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.recordings)) return payload.recordings;
  if (Array.isArray(payload)) return payload;
  return [];
}

/** Single-page fetch — VideoSDK list is slow; avoid multi-page loops that time out. */
export async function listVideoSdkRecordings(config, { page = 1, perPage = 50 } = {}) {
  try {
    const token = await getVideoToken(config);
    const response = await axios.get(`${config.videoSdkBaseUrl}/recordings`, {
      headers: authHeaders(token),
      params: { page, perPage },
      timeout: VIDEOSDK_TIMEOUT_MS,
    });
    return extractRecordingList(response?.data).map(normalizeSdkRecordingListItem);
  } catch (error) {
    if (error?.message?.includes(" | ")) throw error;
    throw new Error(axiosErrorMessage(error, "Failed to list VideoSDK recordings"));
  }
}

export async function listVideoSdkSessions(config, roomId, { page = 1, perPage = 50 } = {}) {
  try {
    const token = await getVideoToken(config);
    const response = await axios.get(`${config.videoSdkBaseUrl}/sessions`, {
      headers: authHeaders(token),
      params: {
        ...(roomId ? { roomId } : {}),
        page,
        perPage,
      },
      timeout: VIDEOSDK_TIMEOUT_MS,
    });
    const body = response?.data;
    return Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : [];
  } catch (error) {
    if (error?.message?.includes(" | ")) throw error;
    throw new Error(axiosErrorMessage(error, "Failed to list VideoSDK sessions"));
  }
}

export async function getVideoSdkRecording(config, recordingId) {
  try {
    const token = await getVideoToken(config);
    const response = await axios.get(
      `${config.videoSdkBaseUrl}/recordings/${recordingId}`,
      {
        headers: authHeaders(token),
        timeout: VIDEOSDK_TIMEOUT_MS,
      }
    );
    const raw = response?.data?.data ?? response?.data ?? null;
    return raw ? normalizeSdkRecording(raw) : null;
  } catch (error) {
    if (error?.message?.includes(" | ")) throw error;
    throw new Error(axiosErrorMessage(error, "Failed to load VideoSDK recording"));
  }
}

export async function deleteVideoSdkRecording(config, recordingId) {
  try {
    const token = await getVideoToken(config);
    await axios.delete(`${config.videoSdkBaseUrl}/recordings/${recordingId}`, {
      headers: authHeaders(token),
      timeout: VIDEOSDK_TIMEOUT_MS,
    });
  } catch (error) {
    if (error?.message?.includes(" | ")) throw error;
    throw new Error(axiosErrorMessage(error, "Failed to delete VideoSDK recording"));
  }
}
