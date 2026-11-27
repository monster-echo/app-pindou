import { JsonAsset, resources } from 'cc';
import { LevelData } from './Types';
import { SaveManager } from './SaveManager';

interface LevelsPayload {
    version: number;
    count: number;
    levels: LevelData[];
}

export class LevelManager {
    private static _ins: LevelManager | null = null;
    public static get ins(): LevelManager {
        if (!this._ins) {
            this._ins = new LevelManager();
        }
        return this._ins;
    }

    private _levels: LevelData[] = [];
    private _loaded = false;

    public get levels(): LevelData[] {
        return this._levels;
    }

    public get mainLevels(): LevelData[] {
        return this._levels.filter((lv) => lv.mode !== 'challenge');
    }

    public get challengeLevels(): LevelData[] {
        return this._levels.filter((lv) => lv.mode === 'challenge');
    }

    public loadAll(): Promise<void> {
        if (this._loaded) return Promise.resolve();
        return new Promise((resolve) => {
            resources.load('levels/levels', JsonAsset, (err, asset) => {
                if (!err && asset && asset.json) {
                    const payload = asset.json as LevelsPayload;
                    if (Array.isArray(payload.levels)) {
                        this._levels = payload.levels;
                    }
                } else {
                    console.error('[LevelManager] failed to load levels/levels.json', err);
                }
                console.log(`[LevelManager] loaded ${this._levels.length} levels (main=${this.mainLevels.length}, challenge=${this.challengeLevels.length})`);
                this._loaded = true;
                resolve();
            });
        });
    }

    /** Current active sequential stage for Home & Play CTA (cannot jump ahead of unlocked stage). */
    public getCurrentMainStage(): LevelData | null {
        const mains = this.mainLevels;
        if (mains.length === 0) return null;
        // Prefer sequential index recorded in SaveManager; advance past any already-completed stages
        let idx = Math.min(mains.length - 1, SaveManager.ins.currentStageIndex);
        for (let i = idx; i < mains.length; i++) {
            if (!SaveManager.ins.isCompleted(mains[i])) {
                return mains[i];
            }
        }
        return mains[mains.length - 1];
    }

    public getMainStageIndex(levelId: string): number {
        return this.mainLevels.findIndex((lv) => lv.id === levelId);
    }

    public getCompletedWorks(): LevelData[] {
        return this._levels.filter((lv) => SaveManager.ins.isCompleted(lv));
    }

    public getNextSequentialStage(currentId: string): LevelData | null {
        const mains = this.mainLevels;
        const idx = mains.findIndex((lv) => lv.id === currentId);
        if (idx >= 0) {
            if (idx + 1 < mains.length) return mains[idx + 1];
            return mains[mains.length - 1];
        }
        // If current was a challenge stage, return next challenge or current main stage
        const challenges = this.challengeLevels;
        const cIdx = challenges.findIndex((lv) => lv.id === currentId);
        if (cIdx >= 0 && cIdx + 1 < challenges.length) {
            return challenges[cIdx + 1];
        }
        return this.getCurrentMainStage();
    }
}
