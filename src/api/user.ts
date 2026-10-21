import type { HttpClient } from './http';
import type { ApiTeam, ApiUser } from './types';

type UserBody = Omit<ApiUser, 'weekStartDay'> & { week_start_day?: number | null };

export async function getCurrentUser(http: HttpClient): Promise<ApiUser> {
  const { user } = await http.get<{ user: UserBody }>('/user');
  const { id, username, email, color, initials, profilePicture, timezone } = user;
  return {
    id,
    username,
    email,
    color,
    initials,
    profilePicture,
    timezone,
    weekStartDay: user.week_start_day ?? 0,
  };
}

/** O `/team` traz a lista completa de membros (dezenas de KB); só os dados do workspace ficam. */
export async function getWorkspaces(http: HttpClient): Promise<ApiTeam[]> {
  const { teams } = await http.get<{ teams: ApiTeam[] }>('/team');
  return teams.map(({ id, name, color, avatar }) => ({ id, name, color, avatar }));
}
