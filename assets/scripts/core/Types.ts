export type CategoryId =
    | 'all'
    | 'trendy'
    | 'animals'
    | 'food'
    | 'things'
    | 'guochao'
    | 'challenge'
    | 'completed';

export type LevelMode = 'main' | 'challenge';

export interface LevelData {
    id: string;
    name: string;
    nameEn: string;
    category: string;
    mode: LevelMode;
    stage: number;
    difficulty?: number;
    boardSpec?: string;
    offlineHours?: number;
    estimatedMinutes: number;
    width: number;
    height: number;
    total: number;
    colors: string[];
    rows: string[];
}

export function difficultyStars(difficulty?: number): string {
    const d = Math.max(1, Math.min(6, Math.round(difficulty || 2)));
    return '★'.repeat(d);
}

export type EditorPhase = 'coloring' | 'ironing' | 'reveal' | 'done';

export type BeadFinishId = 'classic' | 'jelly' | 'pearl' | 'sparkle';
export type PegboardStyleId = 'acrylic' | 'sakura' | 'mint' | 'night';

export const ECONOMY = {
    FLOOD_PACK_CHARGES: 3,
    FLOOD_PACK_COINS: 80,
    MAGIC_PACK_CHARGES: 2,
    MAGIC_PACK_COINS: 100,
    CHALLENGE_UNLOCK_COINS: 200,
    DAILY_SHARE_COINS: 30,
    DAILY_SHARE_MAX: 2,
} as const;

export function calcStageCoinReward(level: LevelData, isRepeat = false): number {
    const base = level.stage === 1 && level.mode === 'main'
        ? 80
        : (() => {
            if (typeof level.difficulty === 'number' && level.difficulty > 0) {
                const diff = Math.max(1, Math.min(6, Math.round(level.difficulty)));
                return 80 + diff * 70 + (level.mode === 'challenge' ? 40 : 0);
            }
            const raw = 60 + Math.round(level.total * 0.055) + (level.mode === 'challenge' ? 40 : 0);
            const rounded = Math.round(raw / 10) * 10;
            const maxCap = level.mode === 'challenge' ? 520 : 480;
            return Math.max(90, Math.min(maxCap, rounded));
        })();
    if (!isRepeat) return base;
    return Math.max(30, Math.round((base * 0.25) / 5) * 5);
}

export function calcStageXpReward(level: LevelData, isRepeat = false): number {
    const base = level.stage === 1 && level.mode === 'main'
        ? 60
        : (() => {
            if (typeof level.difficulty === 'number' && level.difficulty > 0) {
                const diff = Math.max(1, Math.min(6, Math.round(level.difficulty)));
                return 60 + diff * 55;
            }
            const coins = calcStageCoinReward(level, false);
            return Math.min(420, Math.max(80, Math.round((coins * 0.85) / 10) * 10));
        })();
    if (!isRepeat) return base;
    return Math.max(20, Math.round((base * 0.25) / 5) * 5);
}

export function requiredStageForChallengeIndex(challengeIndex: number): number {
    return (challengeIndex + 1) * 3;
}

export interface BeadFinishCatalogItem {
    id: BeadFinishId;
    price: number;
    swatchHex: string;
}

export interface PegboardCatalogItem {
    id: PegboardStyleId;
    price: number;
}

export const BEAD_FINISH_CATALOG: BeadFinishCatalogItem[] = [
    { id: 'classic', price: 0, swatchHex: '#FF6B8B' },
    { id: 'jelly', price: 150, swatchHex: '#FF85A1' },
    { id: 'pearl', price: 260, swatchHex: '#B8A9FF' },
    { id: 'sparkle', price: 480, swatchHex: '#FFB347' },
];

export const PEGBOARD_STYLE_CATALOG: PegboardCatalogItem[] = [
    { id: 'acrylic', price: 0 },
    { id: 'sakura', price: 180 },
    { id: 'mint', price: 300 },
    { id: 'night', price: 560 },
];

export interface LevelSave {
    filled: number[];
    ironed: boolean;
    completedAt?: number;
    bestSeconds?: number;
}

export interface PlayerSave {
    soundOn: boolean;
    language?: 'zh' | 'en';
    xp: number;
    coins: number;
    nickname: string;
    currentStageIndex: number;
    floodCharges: number;
    magicCharges: number;
    unlockedChallenges: string[];
    unlockedBeadFinishes?: BeadFinishId[];
    activeBeadFinish?: BeadFinishId;
    unlockedPegboards?: PegboardStyleId[];
    activePegboard?: PegboardStyleId;
    dailyGiftClaimedDay: string;
    dailyShareDay?: string;
    dailyShareCount?: number;
    levels: Record<string, LevelSave>;
}

export interface RGB {
    r: number;
    g: number;
    b: number;
}

export function hexToRgb(hex: string): RGB {
    const clean = hex.replace('#', '');
    const n = parseInt(clean, 16);
    return {
        r: (n >> 16) & 255,
        g: (n >> 8) & 255,
        b: n & 255,
    };
}

/** Decode base-36 bead color index from row character: '0'=empty, '1'..'9'=1..9, 'a'..'z'=10..35 */
export function cellColorIndex(level: LevelData, x: number, y: number): number {
    if (y < 0 || y >= level.height || x < 0 || x >= level.width) return 0;
    const row = level.rows[y];
    if (!row || x >= row.length) return 0;
    const code = row.charCodeAt(x);
    let idx = 0;
    if (code >= 49 && code <= 57) {
        idx = code - 48;
    } else if (code >= 97 && code <= 122) {
        idx = code - 97 + 10;
    } else if (code >= 65 && code <= 90) {
        idx = code - 65 + 10;
    }
    return idx >= 1 && idx <= level.colors.length ? idx : 0;
}
