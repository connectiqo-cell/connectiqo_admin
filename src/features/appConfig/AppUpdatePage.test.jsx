// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ getAppConfig: vi.fn(), saveAppConfig: vi.fn() }));
const addToast = vi.hoisted(() => vi.fn());
const environment = vi.hoisted(() => ({ config: {} }));

vi.mock("../../services/adminApi.js", () => api);
vi.mock("../../app/providers/EnvironmentProvider.jsx", () => ({ useEnvironment: () => environment }));
vi.mock("../../app/providers/ToastProvider.jsx", () => ({ useToast: () => ({ addToast }) }));

import { AppUpdatePage } from "./AppUpdatePage.jsx";

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("AppUpdatePage", () => {
  it("shows the saved values and saves changes", async () => {
    api.getAppConfig.mockResolvedValue({ min_android_version: "120", min_ios_version: "45", update_message: "Please update" });
    api.saveAppConfig.mockResolvedValue();
    render(<AppUpdatePage />);

    const android = await screen.findByLabelText("Minimum Android versionCode");
    expect(android.value).toBe("120");
    expect(screen.getByLabelText("Minimum iOS build number").value).toBe("45");
    expect(screen.getByLabelText("Message shown to users").value).toBe("Please update");

    fireEvent.change(android, { target: { value: "121" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(api.saveAppConfig).toHaveBeenCalledWith({}, { min_android_version: 121, min_ios_version: 45, update_message: "Please update" })
    );
  });

  it("offers no way to save when the saved values couldn't be loaded, and can retry", async () => {
    api.getAppConfig.mockRejectedValueOnce(new Error("Network down")).mockResolvedValue({ min_android_version: "120" });
    render(<AppUpdatePage />);

    expect(await screen.findByText("Network down")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    expect(screen.queryByLabelText("Minimum Android versionCode")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect((await screen.findByLabelText("Minimum Android versionCode")).value).toBe("120");
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
  });

  it("keeps what was typed when saving fails", async () => {
    api.getAppConfig.mockResolvedValue({ min_android_version: "120" });
    api.saveAppConfig.mockRejectedValue(new Error("Not allowed"));
    render(<AppUpdatePage />);
    const android = await screen.findByLabelText("Minimum Android versionCode");
    fireEvent.change(android, { target: { value: "121" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Not allowed")).toBeTruthy();
    expect(screen.getByLabelText("Minimum Android versionCode").value).toBe("121");
  });
});
