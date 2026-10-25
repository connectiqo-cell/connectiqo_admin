import { useCallback, useEffect, useState } from "react";
import { listTableRows, saveAppConfig } from "../../services/adminApi.js";
import { useEnvironment } from "../../app/providers/EnvironmentProvider.jsx";
import { useToast } from "../../app/providers/ToastProvider.jsx";

const DEFAULT_MESSAGE = "A newer version is required to continue.";

export function AppUpdatePage() {
  const { config } = useEnvironment();
  const { addToast } = useToast();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState("");

  const [minAndroid, setMinAndroid] = useState("0");
  const [minIos, setMinIos]         = useState("0");
  const [message, setMessage]       = useState(DEFAULT_MESSAGE);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await listTableRows(config, "app_config", { limit: 500 });
      const value = (key) => (result.rows || []).find((r) => r.key === key)?.value;
      setMinAndroid(value("min_android_version") ?? "0");
      setMinIos(value("min_ios_version") ?? "0");
      setMessage(value("update_message") || DEFAULT_MESSAGE);
    } catch (err) {
      setError(err.message || "Failed to load app config.");
    } finally {
      setLoading(false);
    }
  }, [config]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await saveAppConfig(config, {
        min_android_version: Math.max(0, parseInt(minAndroid, 10) || 0),
        min_ios_version:     Math.max(0, parseInt(minIos, 10) || 0),
        update_message:      message.trim() || DEFAULT_MESSAGE,
      });
      addToast("Force update settings saved");
      await load();
    } catch (err) {
      setError(err.message || "Failed to save");
      addToast(err.message || "Save failed", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="d-grid gap-3">
      <div className="admin-card p-3 p-md-4">
        <h4 className="mb-1">Force update</h4>
        <p className="text-muted small mb-4">
          Any app whose build number is <strong>below</strong> the value here is blocked at launch
          with an "Update required" screen and a link to the store. Takes effect the next time the
          app is opened — no app release needed. Set to <code>0</code> to force nobody.
        </p>

        {error   ? <div className="alert alert-danger">{error}</div> : null}
        {loading ? <div className="d-flex align-items-center gap-2 text-muted"><div className="spinner-border spinner-border-sm" />Loading...</div> : null}

        {!loading && (
          <>
            <div className="row g-3">
              <div className="col-12 col-sm-4">
                <label className="form-label fw-semibold">Minimum Android versionCode</label>
                <input
                  type="number"
                  className="form-control"
                  min="0"
                  step="1"
                  value={minAndroid}
                  onChange={(e) => setMinAndroid(e.target.value)}
                />
                <div className="form-text">From <code>android/app/build.gradle</code></div>
              </div>

              <div className="col-12 col-sm-4">
                <label className="form-label fw-semibold">Minimum iOS build number</label>
                <input
                  type="number"
                  className="form-control"
                  min="0"
                  step="1"
                  value={minIos}
                  onChange={(e) => setMinIos(e.target.value)}
                />
                <div className="form-text">Xcode <code>CURRENT_PROJECT_VERSION</code></div>
              </div>

              <div className="col-12">
                <label className="form-label fw-semibold">Message shown to users</label>
                <textarea
                  className="form-control"
                  rows={2}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </div>
            </div>

            <div className="alert alert-warning mt-4 mb-0 small">
              Set these to a build that is already live on the store. A number higher than the
              newest published build locks every user out until that build ships.
            </div>

            <div className="d-flex gap-2 mt-3">
              <button className="btn btn-primary" onClick={save} disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </button>
              <button className="btn btn-outline-secondary" onClick={load} disabled={saving}>
                Reset
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
