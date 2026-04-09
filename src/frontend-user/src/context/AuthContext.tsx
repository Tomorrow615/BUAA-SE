import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { fetchCurrentUser } from "../lib/auth";
import {
  buildApiSession,
  clearSessionStorage,
  isSessionExpired,
  loadSession,
  saveSession,
  type AuthSession,
  type AuthTokenResponse,
  type ApiUserProfile,
} from "../lib/session-storage";

interface AuthContextValue {
  status: "checking" | "anonymous" | "authenticated";
  session: AuthSession | null;
  setSession: (nextSession: AuthSession) => void;
  clearSession: () => void;
  authenticate: (payload: AuthTokenResponse) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function mapCurrentUserToSession(
  session: AuthSession,
  payload: ApiUserProfile,
): AuthSession {
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<"checking" | "anonymous" | "authenticated">(
    "checking",
  );
  const [session, setSessionState] = useState<AuthSession | null>(null);

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

  function setSession(nextSession: AuthSession) {
    saveSession(nextSession);
    setSessionState(nextSession);
    setStatus("authenticated");
  }

  function authenticate(payload: AuthTokenResponse) {
    setSession(buildApiSession(payload));
  }

  function clearSession() {
    clearSessionStorage();
    setSessionState(null);
    setStatus("anonymous");
  }

  return (
    <AuthContext.Provider
      value={{
        status,
        session,
        setSession,
        clearSession,
        authenticate,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }

  return context;
}
