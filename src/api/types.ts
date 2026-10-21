// Apenas os campos que o app usa; o resto da resposta da API é descartado na leitura.

export interface ApiUser {
  id: number;
  username: string;
  email: string;
  color: string | null;
  initials: string;
  profilePicture: string | null;
  timezone?: string;
}

export interface ApiTeam {
  id: string;
  name: string;
  color: string | null;
  avatar: string | null;
}
