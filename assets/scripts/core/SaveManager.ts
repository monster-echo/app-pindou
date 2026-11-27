import { sys } from 'cc';
import {
    BeadFinishId,
    ECONOMY,
    LevelData,
    LevelSave,
    PegboardStyleId,
    PlayerSave,
} from './Types';

const STORAGE_KEY = 'pindou_cocos_save_v2';

export class SaveManager {
    private static _ins: SaveManager | null = null;
    public static get ins(): SaveManager {
        if (!this._ins) {
            this._ins = new SaveManager();
        }
        return this._ins;
    }

    private _data: PlayerSave = {
        soundOn: true,
        language: 'zh',
        xp: 0,
        coins: 120,
        nickname: '拼豆主理人',
        currentStageIndex: 0,
        floodCharges: 3,
        magicCharges: 2,
        unlockedChallenges: [],
        unlockedBeadFinishes: ['classic'],
        activeBeadFinish: 'classic',
        unlockedPegboards: ['acrylic'],
        activePegboard: 'acrylic',
        dailyGiftClaimedDay: '',
        dailyShareDay: '',
        dailyShareCount: 0,
        levels: {},
    };

    public load(): void {
        try {
            const raw = sys.localStorage.getItem(STORAGE_KEY) || sys.localStorage.getItem('pindou_cocos_save_v1');
            if (raw) {
                const parsed = JSON.parse(raw) as Partial<PlayerSave>;
                const sysLang = (sys.languageCode || '').toLowerCase().startsWith('en') ? 'en' : 'zh';
                const validFinishes = new Set<BeadFinishId>(['classic', 'jelly', 'pearl', 'sparkle']);
                const validBoards = new Set<PegboardStyleId>(['acrylic', 'sakura', 'mint', 'night']);
                const unlockedBeadFinishes: BeadFinishId[] = Array.isArray(parsed.unlockedBeadFinishes)
                    ? parsed.unlockedBeadFinishes.filter((id): id is BeadFinishId => validFinishes.has(id))
                    : ['classic'];
                if (unlockedBeadFinishes.indexOf('classic') < 0) unlockedBeadFinishes.unshift('classic');
                const unlockedPegboards: PegboardStyleId[] = Array.isArray(parsed.unlockedPegboards)
                    ? parsed.unlockedPegboards.filter((id): id is PegboardStyleId => validBoards.has(id))
                    : ['acrylic'];
                if (unlockedPegboards.indexOf('acrylic') < 0) unlockedPegboards.unshift('acrylic');

                this._data = {
                    soundOn: parsed.soundOn ?? true,
                    language: parsed.language === 'en' || parsed.language === 'zh' ? parsed.language : sysLang,
                    xp: typeof parsed.xp === 'number' ? parsed.xp : 0,
                    coins: typeof parsed.coins === 'number' ? parsed.coins : 120,
                    nickname: typeof parsed.nickname === 'string' && parsed.nickname.trim() ? parsed.nickname : '拼豆主理人',
                    currentStageIndex: typeof parsed.currentStageIndex === 'number' ? Math.max(0, parsed.currentStageIndex) : 0,
                    floodCharges: typeof parsed.floodCharges === 'number' ? Math.max(0, parsed.floodCharges) : 3,
                    magicCharges: typeof parsed.magicCharges === 'number' ? Math.max(0, parsed.magicCharges) : 2,
                    unlockedChallenges: Array.isArray(parsed.unlockedChallenges) ? parsed.unlockedChallenges : [],
                    unlockedBeadFinishes,
                    activeBeadFinish: parsed.activeBeadFinish && validFinishes.has(parsed.activeBeadFinish)
                        ? parsed.activeBeadFinish
                        : 'classic',
                    unlockedPegboards,
                    activePegboard: parsed.activePegboard && validBoards.has(parsed.activePegboard)
                        ? parsed.activePegboard
                        : 'acrylic',
                    dailyGiftClaimedDay: typeof parsed.dailyGiftClaimedDay === 'string' ? parsed.dailyGiftClaimedDay : '',
                    dailyShareDay: typeof parsed.dailyShareDay === 'string' ? parsed.dailyShareDay : '',
                    dailyShareCount: typeof parsed.dailyShareCount === 'number' ? Math.max(0, parsed.dailyShareCount) : 0,
                    levels: parsed.levels && typeof parsed.levels === 'object' ? parsed.levels : {},
                };
            }
        } catch (e) {
            console.warn('[SaveManager] load failed, using default', e);
        }
    }

    private _flush(): void {
        try {
            sys.localStorage.setItem(STORAGE_KEY, JSON.stringify(this._data));
        } catch (e) {
            console.warn('[SaveManager] save failed', e);
        }
    }

    public get soundOn(): boolean {
        return this._data.soundOn;
    }

    public setSoundOn(v: boolean): void {
        this._data.soundOn = v;
        this._flush();
    }

    public get language(): 'zh' | 'en' {
        return this._data.language === 'en' ? 'en' : 'zh';
    }

    public setLanguage(lang: 'zh' | 'en'): void {
        this._data.language = lang;
        this._flush();
    }

    public get xp(): number {
        return this._data.xp;
    }

    public get coins(): number {
        return this._data.coins;
    }

    public get nickname(): string {
        return this._data.nickname;
    }

    public setNickname(name: string): void {
        const clean = name.trim().slice(0, 12);
        if (clean) {
            this._data.nickname = clean;
            this._flush();
        }
    }

    public get currentStageIndex(): number {
        return this._data.currentStageIndex;
    }

    public get floodCharges(): number {
        return this._data.floodCharges;
    }

    public get magicCharges(): number {
        return this._data.magicCharges;
    }

    public addFloodCharges(n: number): void {
        this._data.floodCharges = Math.max(0, this._data.floodCharges + n);
        this._flush();
    }

    public consumeFloodCharge(): boolean {
        if (this._data.floodCharges <= 0) return false;
        this._data.floodCharges--;
        this._flush();
        return true;
    }

    public addMagicCharges(n: number): void {
        this._data.magicCharges = Math.max(0, this._data.magicCharges + n);
        this._flush();
    }

    public consumeMagicCharge(): boolean {
        if (this._data.magicCharges <= 0) return false;
        this._data.magicCharges--;
        this._flush();
        return true;
    }

    public get playerLevel(): number {
        return Math.floor(this._data.xp / 200) + 1;
    }

    public addXp(amount: number): void {
        if (amount <= 0) return;
        this._data.xp += amount;
        this._flush();
    }

    public addCoins(amount: number): void {
        this._data.coins = Math.max(0, this._data.coins + amount);
        this._flush();
    }

    public spendCoins(amount: number): boolean {
        if (amount <= 0 || this._data.coins < amount) return false;
        this._data.coins -= amount;
        this._flush();
        return true;
    }

    public buyFloodPackWithCoins(): boolean {
        if (!this.spendCoins(ECONOMY.FLOOD_PACK_COINS)) return false;
        this._data.floodCharges += ECONOMY.FLOOD_PACK_CHARGES;
        this._flush();
        return true;
    }

    public buyMagicPackWithCoins(): boolean {
        if (!this.spendCoins(ECONOMY.MAGIC_PACK_COINS)) return false;
        this._data.magicCharges += ECONOMY.MAGIC_PACK_CHARGES;
        this._flush();
        return true;
    }

    public unlockChallengeWithCoins(levelId: string): boolean {
        if (this._data.unlockedChallenges.indexOf(levelId) >= 0) return true;
        if (!this.spendCoins(ECONOMY.CHALLENGE_UNLOCK_COINS)) return false;
        this._data.unlockedChallenges.push(levelId);
        this._flush();
        return true;
    }

    public get activeBeadFinish(): BeadFinishId {
        return 'classic';
    }

    public get activePegboard(): PegboardStyleId {
        return 'acrylic';
    }

    public isChallengeUnlocked(levelId: string, requiredMainCompletedCount = 3): boolean {
        return this._data.currentStageIndex >= requiredMainCompletedCount
            || this._data.unlockedChallenges.indexOf(levelId) >= 0;
    }

    public unlockChallenge(levelId: string): void {
        if (this._data.unlockedChallenges.indexOf(levelId) < 0) {
            this._data.unlockedChallenges.push(levelId);
            this._flush();
        }
    }

    public canClaimDailyGift(): boolean {
        const today = new Date().toISOString().slice(0, 10);
        return this._data.dailyGiftClaimedDay !== today;
    }

    public markDailyGiftClaimed(): void {
        this._data.dailyGiftClaimedDay = new Date().toISOString().slice(0, 10);
        this._flush();
    }

    public getDailyShareRemaining(): number {
        const today = new Date().toISOString().slice(0, 10);
        if (this._data.dailyShareDay !== today) return ECONOMY.DAILY_SHARE_MAX;
        return Math.max(0, ECONOMY.DAILY_SHARE_MAX - (this._data.dailyShareCount || 0));
    }

    public claimDailyShareReward(): number {
        const today = new Date().toISOString().slice(0, 10);
        if (this._data.dailyShareDay !== today) {
            this._data.dailyShareDay = today;
            this._data.dailyShareCount = 0;
        }
        if ((this._data.dailyShareCount || 0) >= ECONOMY.DAILY_SHARE_MAX) {
            return 0;
        }
        this._data.dailyShareCount = (this._data.dailyShareCount || 0) + 1;
        this._data.coins += ECONOMY.DAILY_SHARE_COINS;
        this._flush();
        return ECONOMY.DAILY_SHARE_COINS;
    }

    public advanceStageIfCurrent(completedMainIndex: number, totalMainCount: number): void {
        if (completedMainIndex >= this._data.currentStageIndex) {
            this._data.currentStageIndex = Math.min(totalMainCount - 1, completedMainIndex + 1);
            this._flush();
        }
    }

    public getLevelSave(levelId: string): LevelSave {
        const existing = this._data.levels[levelId];
        if (existing) {
            return {
                filled: Array.isArray(existing.filled) ? [...existing.filled] : [],
                ironed: !!existing.ironed,
                completedAt: existing.completedAt,
                bestSeconds: existing.bestSeconds,
            };
        }
        return { filled: [], ironed: false };
    }

    public saveProgress(levelId: string, filled: Set<number>, ironed: boolean, elapsedSeconds?: number): void {
        const prev = this._data.levels[levelId];
        let bestSeconds = prev?.bestSeconds;
        if (ironed && typeof elapsedSeconds === 'number' && elapsedSeconds > 0) {
            bestSeconds = bestSeconds ? Math.min(bestSeconds, Math.round(elapsedSeconds)) : Math.round(elapsedSeconds);
        }
        const next: LevelSave = {
            filled: Array.from(filled),
            ironed,
            completedAt: ironed ? (prev?.completedAt ?? Date.now()) : prev?.completedAt,
            bestSeconds,
        };
        this._data.levels[levelId] = next;
        this._flush();
    }

    public isCompleted(level: LevelData): boolean {
        const s = this._data.levels[level.id];
        return !!s && s.ironed && s.filled.length >= level.total;
    }

    public isInProgress(level: LevelData): boolean {
        const s = this._data.levels[level.id];
        return !!s && s.filled.length > 0 && !(s.ironed && s.filled.length >= level.total);
    }

    public getCompletedCount(levels: LevelData[]): number {
        let count = 0;
        for (const lv of levels) {
            if (this.isCompleted(lv)) count++;
        }
        return count;
    }

    public getTotalPlacedBeads(levels: LevelData[]): number {
        let total = 0;
        const valid = new Set(levels.map((l) => l.id));
        for (const id of Object.keys(this._data.levels)) {
            if (valid.has(id)) {
                total += this._data.levels[id].filled.length;
            }
        }
        return total;
    }

    public getBestClearSeconds(levels: LevelData[]): number | null {
        let best: number | null = null;
        for (const lv of levels) {
            const s = this._data.levels[lv.id];
            if (s && s.ironed && typeof s.bestSeconds === 'number' && s.bestSeconds > 0) {
                best = best === null ? s.bestSeconds : Math.min(best, s.bestSeconds);
            }
        }
        return best;
    }
}
