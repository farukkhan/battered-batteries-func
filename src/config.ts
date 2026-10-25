export type Config = {
  readonly apiBaseUrl: string;
  readonly apiKey: string;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    apiBaseUrl: getRequiredString(env, "BATBAT_API_BASE_URL"),
    apiKey: getRequiredString(env, "BATBAT_API_KEY"),
  };
}

function getRequiredString(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];

  if (!value?.trim()) {
    throw new Error(`Missing setting '${name}'.`);
  }

  return value.trim();
}
