export const USER_SETTINGS_KEY = 'userSettings'

export type ChromeUserSettingsStoragePort = {
  get: (key: string) => Promise<Record<string, unknown>>
  set: (value: Record<string, unknown>) => Promise<void>
}

export class UserSettingsRepositoryUnavailableError extends Error {
  public constructor(message: string) {
    super(message)
    this.name = 'UserSettingsRepositoryUnavailableError'
  }
}
