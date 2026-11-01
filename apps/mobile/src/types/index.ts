export type UserRole =
  | 'ORGANIZER'
  | 'MENTOR'
  | 'PARTICIPANT'
  | 'GUEST'
  | 'ADMIN'
  | 'MANAGER'
  | 'MEMBER';

export type Permission =
  | 'MANAGE_USERS'
  | 'VIEW_USERS'
  | 'CREATE_RESOURCES'
  | 'UPDATE_RESOURCES'
  | 'DELETE_RESOURCES'
  | 'ALLOCATE_TEAMS'
  | 'AWARD_POINTS'
  | 'MANAGE_BADGES'
  | 'CREATE_POLLS'
  | 'VOTE_POLLS'
  | 'VIEW_PUBLIC_RESOURCES';

export type PointCategory =
  | 'MILESTONE'
  | 'MENTOR_BONUS'
  | 'CHALLENGE'
  | 'PENALTY'
  | 'POLL_PARTICIPATION';

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  avatar_url?: string | null;
  department_or_track?: string | null;
  individual_points: number;
  is_active: boolean;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_at: string;
  jti: string;
  role: UserRole;
  permissions: Permission[];
}

export interface TeamMember {
  id: string;
  team_id: string;
  user_id: string;
  is_team_lead: boolean;
  allocation_method: 'MANUAL' | 'AUTO_ASSIGNED' | 'INVITE_CODE';
  joined_at: string;
  user_full_name?: string | null;
  user_email?: string | null;
  individual_points: number;
}

export interface TeamMentor {
  id: string;
  team_id: string;
  mentor_id: string;
  joined_at: string;
  mentor_full_name?: string | null;
  mentor_email?: string | null;
}

export interface Team {
  id: string;
  name: string;
  invite_code: string;
  qr_payload: string;
  description?: string | null;
  mentor_id?: string | null;
  created_by: string;
  max_capacity: number;
  total_points: number;
  is_locked: boolean;
  created_at: string;
  member_count: number;
  mentor_count: number;
  members: TeamMember[];
  mentors: TeamMentor[];
}

export interface TeamCreatePayload {
  name: string;
  description?: string;
  max_capacity?: number;
  mentor_id?: string | null;
}

export interface UserCreatePayload {
  email: string;
  password: string;
  full_name: string;
  role: UserRole;
  department_or_track?: string;
}

export interface SummitEvent {
  id: string;
  title: string;
  description?: string | null;
  location?: string | null;
  default_points: number;
  starts_at?: string | null;
  ends_at?: string | null;
  is_active: boolean;
  created_by: string;
  created_at: string;
  participant_count: number;
  is_joined: boolean;
}

export interface EventCreatePayload {
  title: string;
  description?: string;
  location?: string;
  default_points?: number;
}

export interface TeamLeaderboardEntry {
  rank: number;
  team_id: string;
  team_name: string;
  invite_code: string;
  total_points: number;
  member_count: number;
}

export interface ParticipantLeaderboardEntry {
  rank: number;
  user_id: string;
  full_name: string;
  department_or_track?: string | null;
  individual_points: number;
}

export interface PointAwardPayload {
  target_team_id?: string;
  target_user_id?: string;
  event_id?: string;
  points_delta: number;
  category: PointCategory;
  reason: string;
}

export interface ScheduleEventItem {
  id: string;
  title: string;
  description: string;
  location: string;
  track: string;
  starts_at: string;
  ends_at: string;
  speaker?: string | null;
}
