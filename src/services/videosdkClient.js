import axios from "axios";

const tokenCache = new Map(); // authServerUrl -> { token, expiresAt }
const EXPIRY_BUFFER_MS = 30_000;

/** Reads the `exp` claim off a JWT without verifying it; returns ms epoch, or null if undecodable. */
function decodeJwtExpiry(token) {
  try {
    const payload = token.split(".")[1];
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
    const { exp } = JSON.parse(atob(padded));
    return typeof exp === "number" ? exp * 1000 : null;
  } catch {
    return null;
  }
}

async function getVideoToken(authServerUrl) {
  if (!authServerUrl) {
    throw new Error("Auth server URL is not configured");
  }

  const cached = tokenCache.get(authServerUrl);
  if (cached && cached.expiresAt > Date.now() + EXPIRY_BUFFER_MS) {
    return cached.token;
  }

  const tokenResponse = await axios.get(`${authServerUrl}/get-token`);
  const token = tokenResponse?.data?.token;
  if (!token) {
    throw new Error("Auth server did not return VideoSDK token");
  }

  const expiresAt = decodeJwtExpiry(token);
  if (expiresAt) {
    tokenCache.set(authServerUrl, { token, expiresAt });
  } else {
    tokenCache.delete(authServerUrl);
  }

  return token;
}

export async function listVideoSdkRecordings(config) {
  const token = await getVideoToken(config.authServerUrl);
  const response = await axios.get(`${config.videoSdkBaseUrl}/recordings`, {
    headers: { Authorization: token },
  });
  return response?.data?.data || [];
}

export async function listVideoSdkSessions(config, roomId) {
  const token = await getVideoToken(config.authServerUrl);
  const response = await axios.get(`${config.videoSdkBaseUrl}/sessions`, {
    headers: { Authorization: token },
    params: roomId ? { roomId } : undefined,
  });
  return response?.data?.data || [];
}

export async function getVideoSdkRecording(config, recordingId) {
  const token = await getVideoToken(config.authServerUrl);
  const response = await axios.get(`${config.videoSdkBaseUrl}/recordings/${recordingId}`, {
    headers: { Authorization: token },
  });
  return response?.data?.data ?? response?.data ?? null;
}

export async function deleteVideoSdkRecording(config, recordingId) {
  const token = await getVideoToken(config.authServerUrl);
  await axios.delete(`${config.videoSdkBaseUrl}/recordings/${recordingId}`, {
    headers: { Authorization: token },
  });
}
