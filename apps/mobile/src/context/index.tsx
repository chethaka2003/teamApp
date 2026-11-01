import React, { createContext, useCallback, useContext, useState } from 'react';
import { authApi, setAccessToken, usersApi } from '../api/client';
import { Permission, UserProfile, UserRole } from '../types';

interface AuthContextValue {
  user: UserProfile | null;
  token: string | null;
  role: UserRole;
  permissions: Permission[];
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  hasPermission: (permission: Permission) => boolean;
  isAdmin: boolean;
  isManagerOrAbove: boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [role, setRole] = useState<UserRole>('GUEST');
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const tokenRes = await authApi.login(email, password);
      setAccessToken(tokenRes.access_token);
      setToken(tokenRes.access_token);
      setRefreshToken(tokenRes.refresh_token);
      setRole(tokenRes.role);
      setPermissions(tokenRes.permissions);

      const profile = await usersApi.getCurrentUser();
      setUser(profile);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Authentication failed';
      setError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    setIsLoading(true);
    try {
      if (token) {
        await authApi.logout(refreshToken);
      }
    } catch {
      // Ignore network errors on logout and clear local session state
    } finally {
      setAccessToken(null);
      setToken(null);
      setRefreshToken(null);
      setUser(null);
      setRole('GUEST');
      setPermissions([]);
      setIsLoading(false);
    }
  }, [token, refreshToken]);

  const hasPermission = useCallback(
    (permission: Permission) => permissions.includes(permission),
    [permissions]
  );

  const isAdmin = role === 'ORGANIZER' || role === 'ADMIN';
  const isManagerOrAbove =
    isAdmin || role === 'MENTOR' || role === 'MANAGER';

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        role,
        permissions,
        isLoading,
        error,
        login,
        logout,
        hasPermission,
        isAdmin,
        isManagerOrAbove,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
