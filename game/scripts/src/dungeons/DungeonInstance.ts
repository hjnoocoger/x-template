import { DungeonMapData, TriggerData } from './types';
import { DungeonGenerator } from './DungeonGenerator';

/**
 * 副本实例状态
 */
export enum DungeonInstanceState {
    WAITING = 0,      // 等待玩家
    RUNNING = 1,      // 进行中
    COMPLETED = 2,    // 已完成
    FAILED = 3,       // 失败
}

/**
 * 副本实例
 * 代表一个正在运行的副本
 */
export class DungeonInstance {
    private instanceId: string;
    private generator: DungeonGenerator;
    private state: DungeonInstanceState;
    private players: PlayerID[] = [];
    private triggeredEvents: Set<string> = new Set();
    private startTime: number = 0;
    private spawnedUnitsByTrigger: Map<string, CDOTA_BaseNPC[]> = new Map(); // 记录每个触发器生成的单位
    
    constructor(instanceId: string, centerPosition: Vector, mapData: DungeonMapData) {
        this.instanceId = instanceId;
        this.generator = new DungeonGenerator(centerPosition, mapData);
        this.state = DungeonInstanceState.WAITING;
    }
    
    /**
     * 初始化副本
     */
    public Initialize(): void {
        print(`[DungeonInstance] 初始化副本实例: ${this.instanceId}`);
        this.generator.Generate();
        this.SetupTriggerListeners();
    }
    
    /**
     * 开始副本
     */
    public Start(): void {
        this.state = DungeonInstanceState.RUNNING;
        this.startTime = GameRules.GetGameTime();
        print(`[DungeonInstance] 副本开始: ${this.instanceId}`);
    }
    
    /**
     * 添加玩家到副本
     */
    public AddPlayer(playerId: PlayerID): void {
        if (! this.players.includes(playerId)) {
            this.players.push(playerId);
            print(`[DungeonInstance] 玩家 ${playerId} 加入副本`);
        }
    }
    
    /**
     * 移除玩家
     */
    public RemovePlayer(playerId: PlayerID): void {
        const index = this.players.indexOf(playerId);
        if (index > -1) {
            this.players.splice(index, 1);
            print(`[DungeonInstance] 玩家 ${playerId} 离开副本`);
        }
        
        // 如果没有玩家了，可以考虑清理副本
        if (this.players.length === 0) {
            this.OnAllPlayersLeft();
        }
    }
    
    /**
     * 设置触发器监听
     */
    private SetupTriggerListeners(): void {
        // 每0.5秒检查一次触发器
        Timers.CreateTimer(0.5, () => {
            if (this.state === DungeonInstanceState.RUNNING) {
                this.CheckTriggers();
                return 0.5;  // 继续循环
            }
            return undefined;  // 停止计时器
        });
    }
    
    /**
     * 检查所有触发器
     */
    private CheckTriggers(): void {
        const mapData = this.generator.GetMapData();
        
        for (const trigger of mapData.triggers) {
            // 如果是一次性触发器且已触发，跳过
            if (trigger.oneTime && this.triggeredEvents.has(trigger.id)) {
                continue;
            }
            
            const worldPos = this.generator.GridToWorld(trigger.x, trigger.y);
            
            switch (trigger.event) {
                case 'enter':
                    this.CheckEnterTrigger(worldPos, trigger);
                    break;
                case 'kill':
                    this.CheckKillTrigger(worldPos, trigger);
                    break;
                // 其他触发器类型...
            }
        }
    }
    
    /**
     * 检查进入触发器
     */
    private CheckEnterTrigger(position: Vector, trigger: TriggerData): void {
        // 检查是否有玩家英雄在范围内
        for (const playerId of this.players) {
            const hero = PlayerResource.GetSelectedHeroEntity(playerId);
            if (hero && hero.IsAlive()) {
                const heroPos = hero.GetAbsOrigin();
                const dx = heroPos.x - position.x;
                const dy = heroPos.y - position.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance <= trigger.radius) {
                    this.ExecuteTrigger(trigger);
                    return;
                }
            }
        }
    }
    
    /**
     * 检查击杀触发器
     */
    private CheckKillTrigger(position: Vector, trigger: TriggerData): void {
        // 检查这个触发器是否已经生成过单位
        const spawnedUnits = this.spawnedUnitsByTrigger.get(trigger.id);
        if (! spawnedUnits || spawnedUnits.length === 0) {
            // 还没有生成单位，不检查
            return;
        }
        
        // 检查生成的单位是否都已经死亡
        let allDead = true;
        for (const unit of spawnedUnits) {
            if (unit && IsValidEntity(unit) && unit.IsAlive()) {
                allDead = false;
                break;
            }
        }
        
        // 如果所有单位都死了，触发
        if (allDead) {
            this.ExecuteTrigger(trigger);
        }
    }
    
    /**
     * 执行触发器动作
     */
    private ExecuteTrigger(trigger: TriggerData): void {
        print(`[DungeonInstance] 触发器激活: ${trigger.id} - ${trigger.action}`);
        
        // 标记为已触发
        this.triggeredEvents.add(trigger.id);
        
        // 根据动作类型执行
        switch (trigger.action) {
            case 'spawn_room1':
                this.SpawnByTrigger('trigger_room1_enter', trigger.id);
                break;
            case 'spawn_corridor':
                this.SpawnByTrigger('trigger_corridor_enter', trigger.id);
                break;
            case 'spawn_boss':
                this.SpawnByTrigger('trigger_boss_room_enter', trigger.id);
                break;
            case 'dungeon_complete':
                this.CompleteDungeon();
                break;
        }
    }
    
    /**
     * 根据触发器ID生成怪物
     */
    private SpawnByTrigger(triggerConditionId: string, parentTriggerId: string): void {
        const mapData = this.generator.GetMapData();
        const allSpawnedUnits: CDOTA_BaseNPC[] = [];
        
        for (const spawner of mapData.spawners) {
            if (spawner.triggerCondition === triggerConditionId) {
                const worldPos = this.generator.GridToWorld(spawner.x, spawner.y);
                const units = this.generator.SpawnUnits(worldPos, spawner);
                allSpawnedUnits.push(...units);
            }
        }
        
        // 记录生成的单位，用于 kill 触发器检查
        if (allSpawnedUnits.length > 0) {
            this.spawnedUnitsByTrigger.set(parentTriggerId, allSpawnedUnits);
        }
    }
    
    /**
     * 完成副本
     */
    private CompleteDungeon(): void {
        this.state = DungeonInstanceState.COMPLETED;
        const duration = GameRules.GetGameTime() - this.startTime;
        
        print(`[DungeonInstance] 副本完成!   用时: ${duration.toFixed(2)}秒`);
        
        // 给所有玩家奖励
        for (const playerId of this.players) {
            this.GiveReward(playerId, duration);
        }
    }
    
    /**
     * 给玩家奖励
     */
    private GiveReward(playerId: PlayerID, duration: number): void {
        const hero = PlayerResource.GetSelectedHeroEntity(playerId);
        if (! hero) return;
        
        const goldReward = 500;
        const expReward = 1000;
        
        // 给经验和金币
        hero.AddExperience(expReward, ModifyXpReason.UNSPECIFIED, false, true);
        PlayerResource.ModifyGold(playerId, goldReward, true, ModifyGoldReason.UNSPECIFIED);
        
        // 发送完成事件到客户端 - 直接调用，使用 as any 绕过类型检查
        const player = PlayerResource.GetPlayer(playerId);
        if (player) {
            (CustomGameEventManager.Send_ServerToPlayer as any)(
                player,
                'dungeon_completed',
                {
                    dungeon_name: this.generator.GetMapData().mapName,
                    duration: duration,
                    rewards: {
                        gold: goldReward,
                        experience: expReward,
                    },
                }
            );
        }
        
        print(`[DungeonInstance] 玩家 ${playerId} 获得奖励: ${goldReward}金币, ${expReward}经验`);
    }
    
    /**
     * 所有玩家离开时
     */
    private OnAllPlayersLeft(): void {
        print(`[DungeonInstance] 所有玩家已离开，准备清理副本`);
        // 延迟30秒后清理
        Timers.CreateTimer(30, () => {
            this.Cleanup();
            return undefined;
        });
    }
    
    /**
     * 清理副本
     */
    public Cleanup(): void {
        print(`[DungeonInstance] 清理副本实例: ${this.instanceId}`);
        this.generator.Cleanup();
    }
    
    /**
     * 获取副本状态
     */
    public GetState(): DungeonInstanceState {
        return this.state;
    }
    
    /**
     * 获取实例ID
     */
    public GetInstanceId(): string {
        return this.instanceId;
    }
    
    /**
     * 获取玩家列表
     */
    public GetPlayers(): PlayerID[] {
        return this.players;
    }
    
    /**
     * 获取地图数据
     */
    public GetMapData(): DungeonMapData {
        return this.generator.GetMapData();
    }
    
    /**
     * 网格坐标转世界坐标
     */
    public GridToWorld(gridX: number, gridY: number): Vector {
        return this.generator.GridToWorld(gridX, gridY);
    }
}