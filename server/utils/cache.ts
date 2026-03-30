export let settingsCache: any | null = null;

export function getSettingsCache(): any | null {
    return settingsCache;
}

export function setSettingsCache(settings: any): void {
    settingsCache = settings;
}

export function clearSettingsCache(): void {
    settingsCache = null;
}
