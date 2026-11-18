import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: {
    id: "00000000-0000-4000-8000-000000000001",
    email: "fixture@example.test",
    email_confirmed_at: "2026-01-01",
    is_anonymous: false,
  },
  state: "change_required",
  complete: vi.fn(),
  update: vi.fn(),
  signout: vi.fn(),
  enabled: true,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: mocks.user } }) },
    rpc: async () => ({ data: mocks.state }),
  }),
}));
vi.mock("@/src/lib/supabase/config", () => ({
  getSupabaseConfig: () => ({
    url: "https://eixbmsethgrtezhdmgsh.supabase.co",
    publishableKey: "sb_publishable_fixture",
  }),
}));
vi.mock("@/src/lib/golden-rose/employee-admin", () => ({
  employeeAdminClient: () => (mocks.enabled ? { rpc: mocks.complete } : null),
  employeeEmailConfirmation: async () => "required",
  employeePublicAuthClient: () => ({
    auth: {
      signInWithPassword: async () => ({
        data: { user: mocks.user, session: { access_token: "fixture" } },
      }),
      getClaims: async () => ({
        data: {
          claims: {
            sub: mocks.user.id,
            session_id: "00000000-0000-4000-8000-000000000002",
          },
        },
      }),
      updateUser: mocks.update,
      signOut: mocks.signout,
    },
    rpc: async () => ({ data: mocks.state }),
  }),
}));

import {
  POST,
  OPTIONS,
} from "../../../app/api/staff/password-enrollment/route";

function request(
  body: object,
  origin = "http://tauri.localhost",
  token = true,
) {
  return new Request(
    "https://workspace.example/api/staff/password-enrollment",
    {
      method: "POST",
      headers: {
        origin,
        "content-type": "application/json",
        ...(token ? { authorization: "Bearer fixture" } : {}),
      },
      body: JSON.stringify(body),
    },
  );
}
const password = {
  currentPassword: "temporary password",
  password: "employee passphrase",
  confirmation: "employee passphrase",
};

beforeEach(() => {
  mocks.state = "change_required";
  mocks.enabled = true;
  mocks.user.email_confirmed_at = "2026-01-01";
  mocks.complete.mockReset().mockResolvedValue({ data: "complete" });
  mocks.update.mockReset().mockResolvedValue({ error: null });
  mocks.signout.mockReset().mockResolvedValue({ error: null });
});

describe("Desktop password-enrollment boundary", () => {
  it("allows the Tauri origin and rejects unapproved origins or missing tokens", async () => {
    expect(OPTIONS(request({}, "http://tauri.localhost")).status).toBe(200);
    expect(OPTIONS(request({}, "https://untrusted.example")).status).toBe(403);
    expect(
      (await POST(request(password, "http://tauri.localhost", false))).status,
    ).toBe(401);
    expect(
      (await POST(request(password, "https://untrusted.example"))).status,
    ).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it.each(["none", "expired", "denied"])(
    "rejects users without an eligible enrollment (%s)",
    async (state) => {
      mocks.state = state;
      expect((await POST(request(password))).status).toBe(403);
      expect(mocks.update).not.toHaveBeenCalled();
      expect(mocks.complete).not.toHaveBeenCalled();
    },
  );
  it("requires a confirmed identity and the trusted server configuration", async () => {
    mocks.user.email_confirmed_at = "";
    expect((await POST(request(password))).status).toBe(401);
    mocks.user.email_confirmed_at = "2026-01-01";
    mocks.enabled = false;
    expect((await POST(request(password))).status).toBe(503);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("finishes eligible password rotation and closes the temporary reauthentication session", async () => {
    const response = await POST(request(password));
    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith({
      password: password.password,
      current_password: password.currentPassword,
    });
    expect(mocks.complete).toHaveBeenCalledWith(
      "gr_employee_password_complete",
      {
        p_actor: mocks.user.id,
        p_session: "00000000-0000-4000-8000-000000000002",
      },
    );
    expect(mocks.signout).toHaveBeenCalledWith({ scope: "local" });
  });
  it("does not report success when membership activation fails after a password update", async () => {
    mocks.complete.mockResolvedValue({
      data: null,
      error: { code: "fixture" },
    });
    const response = await POST(request(password));
    expect(response.status).toBe(503);
    expect((await response.json()).error).toContain("password changed");
    expect(mocks.signout).toHaveBeenCalled();
  });
});
