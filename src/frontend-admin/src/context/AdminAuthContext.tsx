import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { checkAdminPermission, fetchCurrentUser } from "../lib/auth";
import {
  buildApiSession,
  clearSessionStorage,
  isSessionExpired,
  loadSession,
  saveSession,
  type AdminSession,
  type ApiUserProfile,
  type AuthTokenResponse,
} from "../lib/session-storage";

interface AdminAuthContextValue {
  status: "checking" | "anonymous" | "authenticated";
  session: AdminSession | null;
  setSession: (nextSession: AdminSession) => void;
  clearSession: () => void;
  authenticate: (payload: AuthTokenResponse) => void;
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

function mapCurrentUserToSession(
  session: AdminSession,
  payload: ApiUserProfile,
): AdminSession {
  return {
    ...session,
    source: "api",
    user: {
      id: payload.id,
      username: payload.username,
      email: payload.email,
      displayName: payload.display_name,
      status: payload.status,
      roles: payload.roles,
    },
  };
}

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<"checking" | "anonymous" | "authenticated">(
    "checking",
  );
  const [session, setSessionState] = useState<AdminSession | null>(null);

  useEffect(() => {
    const storedSession = loadSession();
    if (!storedSession) {
      setStatus("anonymous");
      return;
    }

    if (isSessionExpired(storedSession)) {
      clearSessionStorage();
      setStatus("anonymous");
      return;
    }

    if (storedSession.source !== "api") {
      clearSessionStorage();
      setSessionState(null);
      setStatus("anonymous");
      return;
    }

    const sessionToRestore = storedSession;
    let cancelled = false;

    async function bootstrap() {
      try {
        await checkAdminPermission(sessionToRestore.accessToken);
        const currentUser = await fetchCurrentUser(sessionToRestore.accessToken);

        if (cancelled) {
          return;
        }

        const nextSession = mapCurrentUserToSession(
          sessionToRestore,
          currentUser,
        );
        saveSession(nextSession);
        setSessionState(nextSession);
        setStatus("authenticated");
      } catch {
        if (cancelled) {
          return;
        }

        clearSessionStorage();
        setSessionState(null);
        setStatus("anonymous");
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, []);

  function setSession(nextSession: AdminSession) {
    saveSession(nextSession);
    setSessionState(nextSession);
    setStatus("authenticated");
  }

  function clearSession() {
    clearSessionStorage();
    setSessionState(null);
    setStatus("anonymous");
  }

  function authenticate(payload: AuthTokenResponse) {
    setSession(buildApiSession(payload));
  }

  return (
    <AdminAuthContext.Provider
      value={{
        status,
        session,
        setSession,
        clearSession,
        authenticate,
      }}
    >
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const context = useContext(AdminAuthContext);
  if (!context) {
    throw new Error("useAdminAuth must be used inside AdminAuthProvider.");
  }

  return context;
}
