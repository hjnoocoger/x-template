import { DungeonMapData } from './types';
import { DungeonInstance, DungeonInstanceState } from './DungeonInstance';
import { GetDungeonConfig } from './configs/index';
import { CameraSystem } from '../systems/camera/camera_system';
import { DUNGEON_SPAWN_CENTER, DUNGEON_INSTANCE_OFFSET_X } from './configs/dungeon_constants';

/**
 * 副本管理器
 * 全局单例，管理所有副本实例
 */
export class DungeonManager {
    private static instance: DungeonManager;
    private instances: Map<string, DungeonInstance> = new Map();
    private playerDungeonMap: Map<PlayerID, string> = new Map();
    private nextInstanceId: number = 1;
    
    private constructor() {
        print('[DungeonManager] 副本管理器初始化');
    }
    
    /**
     * 获取单例实例
     */
    public static GetInstance(): DungeonManager {
        if (!DungeonManager.instance) {
            DungeonManager.instance = new DungeonManager();
        }
        return DungeonManager.instance;
    }
    
    /**
     * 创建新的副本实例
     * 所有副本在固定的 BATTLE_ROOM 区域创建，多个实例在X轴上偏移避免重叠
     */
    public CreateDungeon(dungeonId: string): string | null {
        const config = GetDungeonConfig(dungeonId);
        if (!config) {
            print(`[DungeonManager] 错误：找不到副本配置 ${dungeonId}`);
            return null;
        }
        
        const instanceId = `${dungeonId}_${this.nextInstanceId++}`;
        
        // 计算副本生成位置：使用固定中心点，多个实例在X轴偏移
        const instanceCount = this.instances.size;
        const offsetX = instanceCount * DUNGEON_INSTANCE_OFFSET_X;
        const spawnPosition = Vector(
            DUNGEON_SPAWN_CENTER.x + offsetX,
            DUNGEON_SPAWN_CENTER.y,
            DUNGEON_SPAWN_CENTER.z
        );
        
        const instance = new DungeonInstance(instanceId, spawnPosition, config);
        instance.Initialize();
        
        this.instances.set(instanceId, instance);
        
        print(`[DungeonManager] 创建副本实例: ${instanceId} at (${spawnPosition.x}, ${spawnPosition.y}, ${spawnPosition.z})`);
        
        return instanceId;
    }
    
    /**
     * 玩家进入副本
     */
    public EnterDungeon(playerId: PlayerID, instanceId: string): boolean {
        const instance = this.instances.get(instanceId);
        if (!instance) {
            print(`[DungeonManager] 错误：副本实例不存在 ${instanceId}`);
            return false;
        }
        
        const currentInstanceId = this.playerDungeonMap.get(playerId);
        if (currentInstanceId) {
            print(`[DungeonManager] 警告：玩家 ${playerId} 已经在副本 ${currentInstanceId} 中`);
            return false;
        }
        
        instance.AddPlayer(playerId);
        this.playerDungeonMap.set(playerId, instanceId);
        
        if (instance.GetState() === DungeonInstanceState.WAITING) {
            instance.Start();
        }
        
        this.TeleportPlayerToDungeon(playerId, instanceId);
        
        print(`[DungeonManager] 玩家 ${playerId} 进入副本 ${instanceId}`);
        
        return true;
    }
    
    /**
     * 玩家离开副本
     */
    public LeaveDungeon(playerId: PlayerID): boolean {
        const instanceId = this.playerDungeonMap.get(playerId);
        if (! instanceId) {
            print(`[DungeonManager] 警告：玩家 ${playerId} 不在任何副本中`);
            return false;
        }
        
        const instance = this.instances.get(instanceId);
        if (instance) {
            instance.RemovePlayer(playerId);
        }
        
        this.playerDungeonMap.delete(playerId);
        
        // 返回主城并切换摄像头
        CameraSystem.ReturnToTown(playerId);
        
        print(`[DungeonManager] 玩家 ${playerId} 离开副本 ${instanceId}`);
        
        return true;
    }
    
    /**
     * 传送玩家到副本入口
     */
    private TeleportPlayerToDungeon(playerId: PlayerID, instanceId: string): void {
        const instance = this.instances.get(instanceId);
        if (! instance) return;
        
        const hero = PlayerResource.GetSelectedHeroEntity(playerId);
        if (!hero) return;
        
        // 获取副本配置和入口位置
        const config = (instance as any).config;
        const generator = (instance as any).generator;
        
        let entrancePos: Vector;
        
        // 优先使用配置的 entryPoints
        if (config.entryPoints && config.entryPoints.length > 0) {
            const entryPoint = config.entryPoints[0];
            entrancePos = generator.GridToWorld(entryPoint.x, entryPoint.y);
            print(`[DungeonManager] 使用配置的入口点 (${entryPoint.x}, ${entryPoint.y})`);
        } else {
            // 降级方案：在地图左侧外面，Y轴中央
            entrancePos = generator.GridToWorld(-2, 10);
            print(`[DungeonManager] 使用默认入口点`);
        }
        
        // 使用摄像头系统进行切换和传送
        CameraSystem.EnterDungeon(playerId, entrancePos);
        
        print(`[DungeonManager] 传送玩家 ${playerId} 到副本入口 (${entrancePos.x.toFixed(1)}, ${entrancePos.y.toFixed(1)})`);
    }
    
    /**
     * 清理副本实例
     */
    public CleanupDungeon(instanceId: string): void {
        const instance = this.instances.get(instanceId);
        if (!instance) return;
        
        instance.Cleanup();
        
        for (const [playerId, dungeonId] of this.playerDungeonMap.entries()) {
            if (dungeonId === instanceId) {
                this.playerDungeonMap.delete(playerId);
            }
        }
        
        this.instances.delete(instanceId);
        
        print(`[DungeonManager] 清理副本实例: ${instanceId}`);
    }
    
    /**
     * 获取玩家当前所在的副本ID
     */
    public GetPlayerDungeon(playerId: PlayerID): string | null {
        return this.playerDungeonMap.get(playerId) || null;
    }
    
    /**
     * 获取副本实例
     */
    public GetDungeonInstance(instanceId: string): DungeonInstance | null {
        return this.instances.get(instanceId) || null;
    }
    
    /**
     * 获取所有副本实例
     */
    public GetAllInstances(): DungeonInstance[] {
        return Array.from(this.instances.values());
    }
    
    /**
     * 清理所有副本
     */
    public CleanupAll(): void {
        print('[DungeonManager] 清理所有副本实例');
        
        for (const instanceId of this.instances.keys()) {
            this.CleanupDungeon(instanceId);
        }
        
        this.instances.clear();
        this.playerDungeonMap.clear();
    }
}

/**
 * 获取副本管理器的便捷函数
 */
export function GetDungeonManager(): DungeonManager {
    return DungeonManager.GetInstance();
}