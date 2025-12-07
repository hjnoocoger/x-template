import { DungeonMapData, TileData, SpawnerData, TriggerData, DecorationData } from './types';

/**
 * 副本生成器
 * 负责根据配置数据在DOTA2中动态生成副本地图
 */
export class DungeonGenerator {
    private basePosition: Vector;
    private mapData: DungeonMapData;
    private spawnedUnits: CDOTA_BaseNPC[] = [];
    private spawnedProps: any[] = [];
    
    constructor(centerPosition: Vector, mapData: DungeonMapData) {
        this.basePosition = centerPosition;
        this.mapData = mapData;
    }
    
    /**
     * 生成整个副本
     */
    public Generate(): void {
        print(`[DungeonGenerator] 开始生成副本: ${this.mapData.mapName}`);
        
        // 1.生成地形
        this.GenerateTiles();
        
        // 2.生成装饰物
        if (this.mapData.decorations) {
            this.GenerateDecorations();
        }
        
        // 3.创建刷怪点
        this.GenerateSpawners();
        
        // 4.设置触发器
        this.GenerateTriggers();
        
        print(`[DungeonGenerator] 副本生成完成! `);
    }
    
    /**
     * 生成地形
     */
    private GenerateTiles(): void {
        const tiles = this.mapData.tiles;
        print(`[DungeonGenerator] 生成地块数量: ${tiles.length}`);
        
        for (const tile of tiles) {
            const worldPos = this.GridToWorld(tile.x, tile.y);
            
            switch (tile.type) {
                case 'floor':
                    // 地板不生成任何东西
                    break;
                case 'wall':
                    this.CreateWallTile(worldPos);
                    break;
            }
        }
    }
    
/**
 * 创建墙壁格子 - 使用多个建筑物形成更大的阻挡
 */
private CreateWallTile(position: Vector): void {
    // 1. 创建视觉效果（石柱）
    const prop = SpawnEntityFromTableSynchronous('prop_dynamic', {
        origin: position,
        model: 'models/props_structures/tower_dragon_blk_dest_lvl3.vmdl',
        modelscale: 0.8,
        DefaultAnim: 'idle',
    }) as any;
    
    if (prop) {
        this. spawnedProps.push(prop);
    }
    
    // 2. 创建 9 个建筑物形成 3x3 网格阻挡（覆盖更大范围）
    const blockerPositions = [
        position,  // 中心
        Vector(position.x + 64, position.y, position.z),       // 右
        Vector(position.x - 64, position.y, position. z),       // 左
        Vector(position.x, position. y + 64, position.z),       // 上
        Vector(position.x, position.y - 64, position.z),       // 下
        Vector(position.x + 64, position.y + 64, position.z),  // 右上
        Vector(position.x - 64, position.y + 64, position. z),  // 左上
        Vector(position.x + 64, position.y - 64, position.z),  // 右下
        Vector(position.x - 64, position. y - 64, position.z),  // 左下
    ];
    
    for (const blockPos of blockerPositions) {
        const blocker = CreateUnitByName(
            'npc_dota_building',
            blockPos,
            false,
            null,
            null,
            DotaTeam. NEUTRALS
        );
        
        if (blocker) {
            // 设置为无敌、隐身
            blocker. AddNewModifier(blocker, null, 'modifier_invulnerable', {});
            blocker.AddNoDraw();
            blocker.SetAbsOrigin(blockPos);
            
            // 建筑物属性
            blocker.SetMoveCapability(UnitMoveCapability.NONE);
            blocker.SetAttackCapability(UnitAttackCapability. NO_ATTACK);
            
            this.spawnedProps. push(blocker as any);
        }
    }
}
    
    /**
     * 生成装饰物
     */
    private GenerateDecorations(): void {
        if (!this.mapData.decorations) return;
        
        print(`[DungeonGenerator] 生成装饰物: ${this.mapData.decorations.length} 个`);
        
        for (const deco of this.mapData.decorations) {
            const worldPos = this.GridToWorld(deco.x, deco.y);
            this.CreateDecoration(worldPos, deco);
        }
    }
    
    /**
     * 创建装饰物
     */
    private CreateDecoration(position: Vector, deco: DecorationData): void {
        const prop = SpawnEntityFromTableSynchronous('prop_dynamic', {
            origin: position,
            model: deco.model,
            modelscale: deco.scale || 1.0,
            DefaultAnim: 'idle',
        }) as any;
        
        if (prop) {
            if (deco.rotation !== undefined) {
                prop.SetAngles(0, deco.rotation, 0);
            }
            this.spawnedProps.push(prop);
            print(`[DungeonGenerator] ✅ 装饰物: ${deco.model}`);
        } else {
            print(`[DungeonGenerator] ❌ 装饰物失败: ${deco.model}`);
        }
    }
    
    /**
     * 生成刷怪点
     */
    private GenerateSpawners(): void {
        print(`[DungeonGenerator] 设置刷怪点: ${this.mapData.spawners.length} 个`);
        
        for (const spawner of this.mapData.spawners) {
            const worldPos = this.GridToWorld(spawner.x, spawner.y);
            
            // 根据刷怪模式决定是否立即生成
            if (spawner.spawnMode === 'instant' || ! spawner.spawnMode) {
                this.SpawnUnits(worldPos, spawner);
            }
        }
    }
    
    /**
     * 在指定位置刷怪
     */
    public SpawnUnits(position: Vector, spawner: SpawnerData): CDOTA_BaseNPC[] {
        const units: CDOTA_BaseNPC[] = [];
        
        print(`[DungeonGenerator] ======= 开始刷怪 =======`);
        print(`[DungeonGenerator] 单位类型: ${spawner.unitType}`);
        print(`[DungeonGenerator] 数量: ${spawner.count}`);
        print(`[DungeonGenerator] 位置: (${position.x.toFixed(1)}, ${position.y.toFixed(1)}, ${position.z.toFixed(1)})`);
        
        for (let i = 0; i < spawner.count; i++) {
            const offset = RandomVector(100);
            const spawnPos = Vector(
                position.x + offset.x,
                position.y + offset.y,
                position.z
            );
            
            print(`[DungeonGenerator] 尝试生成第 ${i+1}/${spawner.count} 个单位...`);
            
            const unit = CreateUnitByName(
                spawner.unitType,
                spawnPos,
                true,
                null,
                null,
                DotaTeam.NEUTRALS
            );
            
            if (unit) {
                units.push(unit);
                this.spawnedUnits.push(unit);
                print(`[DungeonGenerator] ✅ 成功: ${unit.GetUnitName()} at (${spawnPos.x.toFixed(1)}, ${spawnPos.y.toFixed(1)})`);
            } else {
                print(`[DungeonGenerator] ❌ 失败: ${spawner.unitType} - 单位名称可能错误或未预加载`);
            }
        }
        
        print(`[DungeonGenerator] ======= 刷怪完成: ${units.length}/${spawner.count} =======`);
        return units;
    }
    
    /**
     * 生成触发器
     */
    private GenerateTriggers(): void {
        print(`[DungeonGenerator] 设置触发器: ${this.mapData.triggers.length} 个`);
    }
    
    /**
     * 网格坐标转世界坐标
     */
    public GridToWorld(gridX: number, gridY: number): Vector {
        return Vector(
            this.basePosition.x + (gridX - this.mapData.width / 2) * this.mapData.tileSize,
            this.basePosition.y + (gridY - this.mapData.height / 2) * this.mapData.tileSize,
            128  // 使用固定的 Z 轴高度，确保墙壁正确贴地
        );
    }
    
    /**
     * 世界坐标转网格坐标
     */
    public WorldToGrid(worldPos: Vector): { x: number; y: number } {
        return {
            x: Math.floor((worldPos.x - this.basePosition.x) / this.mapData.tileSize + this.mapData.width / 2),
            y: Math.floor((worldPos.y - this.basePosition.y) / this.mapData.tileSize + this.mapData.height / 2),
        };
    }
    
    /**
     * 清理副本
     */
    public Cleanup(): void {
        print(`[DungeonGenerator] 清理副本: ${this.mapData.mapName}`);
        
        // 清理单位
        for (const unit of this.spawnedUnits) {
            if (unit && IsValidEntity(unit) && unit.IsAlive()) {
                unit.ForceKill(false);  
            }
        }
        
        // 清理模型和阻挡单位
        for (const prop of this.spawnedProps) {
            if (prop && IsValidEntity(prop)) {
                UTIL_Remove(prop);
            }
        }
        
        this.spawnedUnits = [];
        this.spawnedProps = [];
    }
    
    /**
     * 获取已生成的单位列表
     */
    public GetSpawnedUnits(): CDOTA_BaseNPC[] {
        return this.spawnedUnits;
    }
    
    /**
     * 获取地图数据
     */
    public GetMapData(): DungeonMapData {
        return this.mapData;
    }
}