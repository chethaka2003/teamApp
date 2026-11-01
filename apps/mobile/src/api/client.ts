import {
  EventCreatePayload,
  ParticipantLeaderboardEntry,
  PointAwardPayload,
  ScheduleEventItem,
  SummitEvent,
  Team,
  TeamCreatePayload,
  TeamLeaderboardEntry,
  TokenResponse,
  UserCreatePayload,
  UserProfile,
  UserRole,
} from '../types';

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ?? 'https://team.codesolutiontech.com/api/v1';

let activeAccessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  activeAccessToken = token;
}

export function getAccessToken(): string | null {
  return activeAccessToken;
}

async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };

  if (activeAccessToken) {
    headers.Authorization = `Bearer ${activeAccessToken}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errorMessage =
      typeof data?.detail === 'string'
        ? data.detail
        : `Request failed with status ${response.status}`;
    throw new Error(errorMessage);
  }

  return data as T;
}

// --- Auth API ---
export const authApi = {
  login: (email: string, password: string) =>
    apiRequest<TokenResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  register: (payload: UserCreatePayload) =>
    apiRequest<UserProfile>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  logout: (refreshToken?: string | null) =>
    apiRequest<{ status: string; revoked_jti: string }>('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: refreshToken ?? null }),
    }),
};

// --- Teams CRUD & Mentor QR API ---
export const teamsApi = {
  listTeams: (scope: 'accessible' | 'all' = 'accessible') =>
    apiRequest<Team[]>(`/teams?scope=${scope}`),

  getTeam: (teamId: string) => apiRequest<Team>(`/teams/${teamId}`),

  createTeam: (payload: TeamCreatePayload) =>
    apiRequest<Team>('/teams', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateTeam: (
    teamId: string,
    payload: Partial<TeamCreatePayload & { is_locked: boolean }>
  ) =>
    apiRequest<Team>(`/teams/${teamId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  deleteTeam: (teamId: string) =>
    apiRequest<void>(`/teams/${teamId}`, {
      method: 'DELETE',
    }),

  joinByInviteCode: (inviteCode: string) =>
    apiRequest<Team>('/teams/join', {
      method: 'POST',
      body: JSON.stringify({ invite_code: inviteCode }),
    }),

  mentorJoinByQrCode: (inviteCodeOrQr: string) =>
    apiRequest<Team>('/teams/mentor/join', {
      method: 'POST',
      body: JSON.stringify({ invite_code: inviteCodeOrQr }),
    }),
};

// --- Users & Role Management API ---
export const usersApi = {
  getCurrentUser: () => apiRequest<UserProfile>('/users/me'),

  getUserById: (userId: string) => apiRequest<UserProfile>(`/users/${userId}`),

  listUsers: (params?: { role?: UserRole; search?: string }) => {
    const query = new URLSearchParams();
    if (params?.role) query.set('role', params.role);
    if (params?.search) query.set('search', params.search);
    const qs = query.toString();
    return apiRequest<UserProfile[]>(qs ? `/users?${qs}` : '/users');
  },

  createUser: (payload: UserCreatePayload) =>
    apiRequest<UserProfile>('/users', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateUserRole: (userId: string, role: UserRole) =>
    apiRequest<UserProfile>(`/users/${userId}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    }),

  deleteUser: (userId: string) =>
    apiRequest<void>(`/users/${userId}`, {
      method: 'DELETE',
    }),
};

// --- Events System CRUD & Join API ---
export const eventsApi = {
  listEvents: () => apiRequest<SummitEvent[]>('/events'),

  createEvent: (payload: EventCreatePayload) =>
    apiRequest<SummitEvent>('/events', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  deleteEvent: (eventId: string) =>
    apiRequest<void>(`/events/${eventId}`, {
      method: 'DELETE',
    }),

  joinEvent: (eventId: string) =>
    apiRequest<SummitEvent>(`/events/${eventId}/join`, {
      method: 'POST',
    }),
};

// --- Gamification, Leaderboard & Dynamic Schedule API ---
export const gamificationApi = {
  getTeamLeaderboard: () =>
    apiRequest<TeamLeaderboardEntry[]>('/gamification/leaderboard/teams'),

  getParticipantLeaderboard: () =>
    apiRequest<ParticipantLeaderboardEntry[]>(
      '/gamification/leaderboard/participants'
    ),

  awardPoints: (payload: PointAwardPayload) =>
    apiRequest<{ id: string; points_delta: number; reason: string }>(
      '/gamification/points/award',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),

  getSchedule: () => apiRequest<ScheduleEventItem[]>('/gamification/schedule'),
};
