export interface SecretStore {
  getToken(): Promise<string | null>;
  setToken(token: string): Promise<{ persisted: boolean }>;
  clearToken(): Promise<void>;
}

export interface Platform {
  secrets: SecretStore;
}
