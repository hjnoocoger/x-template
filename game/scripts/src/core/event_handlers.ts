/**
 * 事件处理器 - 从 addon_game_mode.ts 分离
 */

import { EquipmentVaultSystem } from '../systems/equipment/vault_system';
import { ClassSystem } from '../systems/player/class_system';
import { ExternalRewardItem, ExternalItemType, EquipmentAttribute } from '../dungeon/external_reward_pool';
import { GetAllDungeonIds, GetDungeonConfig } from '../dungeons/configs/index';
import { GetDungeonManager } from '../dungeons/DungeonManager';
import { BATTLE_ROOM_SPAWN } from '../systems/camera/camera_zones';

// 最后菜单触发时间记录
const lastMenuTriggerTime: { [key: number]: number } = {};

export class EventHandlers {
    private static dungeonPortalInstance: CDOTA_BaseNPC | undefined = undefined;

    /**
     * 注册所有事件监听器
     */
    public static RegisterAllEvents(): void {
        print("[EventHandlers] 开始注册事件监听器...");

        this.RegisterPlayerConnectEvent();
        this.RegisterHeroSpawnEvent();
        this.RegisterDungeonEvents();
        this.RegisterEquipmentEvents();
        this.RegisterChatCommands();

        print("[EventHandlers] ✓ 所有事件监听器已注册");
    }

    /**
     * 生成副本传送门
     */
    public static SpawnDungeonPortal(): void {
        const portalLocation = Vector(-0, 500, 192);

        const portal = CreateUnitByName(
            "npc_dota_portal_to_dungeon",
            portalLocation,
            false,
            undefined,
            undefined,
            DotaTeam.GOODGUYS
        );
        
        if (portal) {
            print("[EventHandlers] 传送门已生成");
            portal.SetMoveCapability(UnitMoveCapability.NONE);
            portal.SetForwardVector(Vector(0, 1, 0));
            this.dungeonPortalInstance = portal;
            this.MonitorPortalTrigger();
        } else {
            print("[EventHandlers] 传送门创建失败");
        }
    }

    /**
     * 监控传送门触发
     */
    private static MonitorPortalTrigger(): void {
        Timers.CreateTimer(0.25, () => {
            if (!this.dungeonPortalInstance || this.dungeonPortalInstance.IsNull()) {
                return 0.25;
            }

            const currentTime = GameRules.GetGameTime();
            const playerCount = PlayerResource.GetPlayerCount();

            for (let i = 0; i < playerCount; i++) {
                if (!PlayerResource.IsValidPlayerID(i)) continue;
                
                if (!ClassSystem.HasSelectedClass(i as PlayerID)) continue;
                
                const hero = PlayerResource.GetSelectedHeroEntity(i);
                if (!hero || !hero.IsAlive()) continue;

                const portalPos = this.dungeonPortalInstance.GetAbsOrigin();
                const heroPos = hero.GetAbsOrigin();
                const dx = portalPos.x - heroPos.x;
                const dy = portalPos.y - heroPos.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance <= 200) {
                    const lastTrigger = lastMenuTriggerTime[i] || 0;
                    if (currentTime - lastTrigger < 3.0) {
                        continue;
                    }
                    
                    lastMenuTriggerTime[i] = currentTime;
                    
                    // 发送副本列表到客户端
                    const dungeonList = GetAllDungeonIds().map(id => {
                        const config = GetDungeonConfig(id);
                        return {
                            id: id,
                            name: config?.mapName || id,
                            description: `副本ID: ${id}`
                        };
                    });
                    
                    CustomGameEventManager.Send_ServerToPlayer(
                        PlayerResource.GetPlayer(i)!,
                        "show_dungeon_menu",
                        { dungeons: dungeonList }
                    );
                }
            }
            
            return 0.25;
        });
    }

    /**
     * 注册玩家连接事件
     */
    private static RegisterPlayerConnectEvent(): void {
        ListenToGameEvent("player_connect_full", (event) => {
            const playerId = event.PlayerID as PlayerID;
            print(`[EventHandlers] 玩家${playerId}连接`);
        }, undefined);
    }

    /**
     * 注册英雄生成事件
     */
    private static RegisterHeroSpawnEvent(): void {
        ListenToGameEvent("npc_spawned", (event) => {
            const spawnedUnit = EntIndexToHScript(event.entindex) as CDOTA_BaseNPC;
            
            if (!spawnedUnit || !spawnedUnit.IsRealHero()) {
                return;
            }
            
            const playerId = spawnedUnit.GetPlayerOwnerID();
            if (playerId === -1) return;
            
            if (!ClassSystem.HasSelectedClass(playerId)) {
                print(`[EventHandlers] 玩家${playerId}尚未选择职业，跳过装备初始化`);
                return;
            }
            
            const equipment = (EquipmentVaultSystem as any).playerEquipment[playerId];
            if (equipment) {
                return;
            }
            
            print(`[EventHandlers] 玩家${playerId}的英雄已生成，初始化装备系统...`);
            
            EquipmentVaultSystem.InitializePlayer(playerId, spawnedUnit as CDOTA_BaseNPC_Hero);
            
            const vault = EquipmentVaultSystem.GetVault(playerId);
            if (vault.length === 0) {
                print(`[EventHandlers] 仓库为空，添加测试装备...`);
                this.AddTestEquipmentToVault(playerId);
            } else {
                print(`[EventHandlers] 仓库已有 ${vault.length} 件装备`);
            }
        }, undefined);
    }

    /**
     * 注册副本相关事件
     */
    private static RegisterDungeonEvents(): void {
        // 监听传送门进入副本请求
        CustomGameEventManager.RegisterListener("request_enter_dungeon", (userId, event: any) => {
            const playerId = event.PlayerID as PlayerID;
            const dungeonId = event.dungeonId as string;
            
            print(`[EventHandlers] 玩家 ${playerId} 请求进入副本: ${dungeonId}`);
            
            // 使用固定的战斗区域位置创建副本
            const manager = GetDungeonManager();
            const instanceId = manager.CreateDungeon(dungeonId, BATTLE_ROOM_SPAWN);
            
            if (instanceId) {
                manager.EnterDungeon(playerId, instanceId);
                print(`[EventHandlers] 玩家 ${playerId} 成功进入副本 ${instanceId}`);
            } else {
                print(`[EventHandlers] 副本创建失败: ${dungeonId}`);
                GameRules.SendCustomMessage(
                    `<font color='#FF0000'>❌ 副本创建失败</font>`,
                    playerId,
                    0
                );
            }
        });
        
        CustomGameEventManager.RegisterListener("select_dungeon", (userId, event: any) => {
            const playerId = event.PlayerID as PlayerID;
            const dungeonType = event.dungeon_type as string;
            const difficulty = event.difficulty as string;
            
            const hero = PlayerResource.GetSelectedHeroEntity(playerId);
            if (!hero) return;
            
            print(`[EventHandlers] 玩家 ${playerId} 选择副本: ${dungeonType}, 难度: ${difficulty}`);
            
            if (dungeonType === "A") {
                if (GameRules.SimpleDungeon) {
                    (GameRules.SimpleDungeon as any).StartDungeon(playerId, difficulty);
                }
                
                let difficultyText = "";
                if (difficulty === "easy") {
                    difficultyText = "简单";
                } else if (difficulty === "normal") {
                    difficultyText = "普通";
                } else if (difficulty === "hard") {
                    difficultyText = "困难";
                }
                
                GameRules.SendCustomMessage(
                    `<font color='#00FF00'>正在进入副本A (${difficultyText}难度)...</font>`,
                    playerId,
                    0
                );
                
            } else if (dungeonType === "B") {
                if (GameRules.ZoneDungeon) {
                    GameRules.ZoneDungeon.EnterFromPortal(playerId, 0);
                } else {
                    GameRules.SendCustomMessage(
                        `<font color='#FF0000'>❌ 刷怪区域系统未初始化</font>`,
                        playerId,
                        0
                    );
                }
            } else if (dungeonType === "C") {
                GameRules.SendCustomMessage(
                    `<font color='#FFAA00'>副本C开发中，敬请期待！</font>`,
                    playerId,
                    0
                );
            }
        });
    }

    /**
     * 注册装备相关事件
     */
    private static RegisterEquipmentEvents(): void {
        // 请求仓库数据
        CustomGameEventManager.RegisterListener("request_vault_data", (userId, event: any) => {
            const playerId = event.PlayerID as PlayerID;
            
            print(`[EventHandlers] ========== 响应仓库数据请求：${playerId} ==========`);
            
            const vault = EquipmentVaultSystem.GetVault(playerId);
            const serializedItems: any[] = [];
            
            vault.forEach((item, index) => {
                print(`[EventHandlers] === 装备 ${index}: ${item.name} ===`);
                print(`[EventHandlers]   rarity: ${item.rarity}`);
                
                const serialized: any = {
                    name: item.name,
                    type: item.type,
                    icon: item.icon,
                    stats: item.stats,
                    rarity: item.rarity,
                };
                
                if (item.affixDetails) {
                    print(`[EventHandlers]   affixDetails 存在`);
                    const affixArray: any[] = [];
                    const entries = Object.entries(item.affixDetails as any);
                    
                    for (let i = 0; i < entries.length; i++) {
                        const [_, affix] = entries[i];
                        if (affix && typeof affix === 'object') {
                            print(`[EventHandlers]     [${i}] ${(affix as any).name} (T${(affix as any).tier}): ${(affix as any).description}`);
                            affixArray.push({
                                position: (affix as any).position || 'prefix',
                                tier: (affix as any).tier || 1,
                                name: (affix as any).name || '',
                                description: (affix as any).description || '',
                                color: (affix as any).color || '#ffffff',
                            });
                        }
                    }
                    
                    if (affixArray.length > 0) {
                        serialized.affixDetails = affixArray;
                        print(`[EventHandlers]   序列化后长度: ${affixArray.length}`);
                    }
                } else {
                    print(`[EventHandlers]   无 affixDetails`);
                }
                
                serializedItems.push(serialized);
            });
            
            print(`[EventHandlers] ========== 准备发送 ${serializedItems.length} 件装备 ==========`);
            
            const player = PlayerResource.GetPlayer(playerId);
            if (player) {
                (CustomGameEventManager.Send_ServerToPlayer as any)(player, 'update_vault_ui', {
                    items: serializedItems
                });
                print(`[EventHandlers] ✓ 已发送数据到客户端`);
            }
        });

        // 请求装备数据
        CustomGameEventManager.RegisterListener("request_equipment_data", (userId, event: any) => {
            const playerId = event.PlayerID as PlayerID;
            
            print(`[EventHandlers] 响应装备界面数据请求：${playerId}`);
            
            const equipment = EquipmentVaultSystem.GetEquipment(playerId);
            
            const serializedEquipment: any = {};
            for (const slot in equipment) {
                const item = equipment[slot];
                if (item) {
                    const itemData: any = {
                        name: item.name,
                        type: item.type,
                        icon: item.icon,
                        stats: item.stats.map(stat => ({
                            attribute: stat.attribute,
                            value: stat.value
                        })),
                        rarity: item.rarity,
                    };
                    
                    if (item.affixDetails) {
                        const affixArray: any[] = [];
                        const entries = Object.entries(item.affixDetails as any);
                        
                        for (let i = 0; i < entries.length; i++) {
                            const [_, affix] = entries[i];
                            if (affix && typeof affix === 'object') {
                                affixArray.push({
                                    position: (affix as any).position || 'prefix',
                                    tier: (affix as any).tier || 1,
                                    name: (affix as any).name || '',
                                    description: (affix as any).description || '',
                                    color: (affix as any).color || '#ffffff',
                                });
                            }
                        }
                        
                        if (affixArray.length > 0) {
                            itemData.affixDetails = affixArray;
                        }
                    }
                    
                    serializedEquipment[slot] = itemData;
                } else {
                    serializedEquipment[slot] = null;
                }
            }
            
            const player = PlayerResource.GetPlayer(playerId);
            if (player) {
                (CustomGameEventManager.Send_ServerToPlayer as any)(player, 'update_equipment_ui', {
                    equipment: serializedEquipment
                });
                print(`[EventHandlers] 发送装备界面数据`);
            }
        });

        // 卸下装备
        CustomGameEventManager.RegisterListener("unequip_item", (userId, event: any) => {
            const playerId = event.PlayerID as PlayerID;
            const slot = event.slot as string;
            
            print(`[EventHandlers] 玩家${playerId}卸下槽位${slot}的装备`);
            
            if (EquipmentVaultSystem.UnequipItem(playerId, slot)) {
                const player = PlayerResource.GetPlayer(playerId);
                if (player) {
                    // 序列化仓库数据
                    const vault = EquipmentVaultSystem.GetVault(playerId);
                    const serializedVault: any[] = [];
                    vault.forEach((item) => {
                        const serialized: any = {
                            name: item.name,
                            type: item.type,
                            icon: item.icon,
                            stats: item.stats,
                            rarity: item.rarity,
                        };
                        
                        if (item.affixDetails) {
                            const affixArray: any[] = [];
                            const entries = Object.entries(item.affixDetails as any);
                            
                            for (let i = 0; i < entries.length; i++) {
                                const [_, affix] = entries[i];
                                if (affix && typeof affix === 'object') {
                                    affixArray.push({
                                        position: (affix as any).position || 'prefix',
                                        tier: (affix as any).tier || 1,
                                        name: (affix as any).name || '',
                                        description: (affix as any).description || '',
                                        color: (affix as any).color || '#ffffff',
                                    });
                                }
                            }
                            
                            if (affixArray.length > 0) {
                                serialized.affixDetails = affixArray;
                            }
                        }
                        
                        serializedVault.push(serialized);
                    });
                    
                    // 序列化装备数据
                    const equipment = EquipmentVaultSystem.GetEquipment(playerId);
                    const serializedEquipment: any = {};
                    for (const slot in equipment) {
                        const item = equipment[slot];
                        if (item) {
                            const itemData: any = {
                                name: item.name,
                                type: item.type,
                                icon: item.icon,
                                stats: item.stats,
                                rarity: item.rarity,
                            };
                            
                            if (item.affixDetails) {
                                const affixArray: any[] = [];
                                const entries = Object.entries(item.affixDetails as any);
                                
                                for (let i = 0; i < entries.length; i++) {
                                    const [_, affix] = entries[i];
                                    if (affix && typeof affix === 'object') {
                                        affixArray.push({
                                            position: (affix as any).position || 'prefix',
                                            tier: (affix as any).tier || 1,
                                            name: (affix as any).name || '',
                                            description: (affix as any).description || '',
                                            color: (affix as any).color || '#ffffff',
                                        });
                                    }
                                }
                                
                                if (affixArray.length > 0) {
                                    itemData.affixDetails = affixArray;
                                }
                            }
                            
                            serializedEquipment[slot] = itemData;
                        } else {
                            serializedEquipment[slot] = null;
                        }
                    }
                    
                    (CustomGameEventManager.Send_ServerToPlayer as any)(player, 'update_vault_ui', {
                        items: serializedVault
                    });
                    
                    (CustomGameEventManager.Send_ServerToPlayer as any)(player, 'update_equipment_ui', {
                        equipment: serializedEquipment
                    });
                    
                    print(`[EventHandlers] ✓ 卸下成功，已推送更新数据`);
                }
            } else {
                print(`[EventHandlers] ❌ 卸下失败`);
            }
        });

        print("[EventHandlers] 装备系统事件监听已注册");
    }

    /**
     * 注册聊天命令
     */
    private static RegisterChatCommands(): void {
        ListenToGameEvent('player_chat', (event: any) => {
            const playerId = event.playerid as PlayerID;
            const text = event.text as string;
            
            if (text === '-testequip') {
                this.AddTestEquipmentToVault(playerId);
                GameRules.SendCustomMessage(`<font color='#0f0'>✓ 添加了 7 件测试装备到仓库，按 B 打开仓库查看</font>`, playerId, 0);
            }
            
            if (text === '-clearequip') {
                (EquipmentVaultSystem as any).playerVaults[playerId] = [];
                (EquipmentVaultSystem as any).SaveToPersistentStorage(playerId);
                GameRules.SendCustomMessage(`<font color='#f80'>✓ 已清空仓库</font>`, playerId, 0);
            }
        }, null);

        print("[EventHandlers] 聊天命令已注册 (-testequip, -clearequip)");
    }

    /**
     * 添加测试装备到仓库
     */
    private static AddTestEquipmentToVault(playerId: PlayerID): void {
        print(`[EventHandlers] 为玩家${playerId}添加测试装备...`);
        
        const testEquipments: ExternalRewardItem[] = [
            {
                name: "新手头盔",
                type: ExternalItemType.HELMET,
                icon: "file://{images}/items/helm_of_iron_will.png",
                stats: [
                    { attribute: EquipmentAttribute.STRENGTH, value: 3 },
                    { attribute: EquipmentAttribute.ARMOR, value: 2 }
                ]
            },
            {
                name: "战士头盔",
                type: ExternalItemType.HELMET,
                icon: "file://{images}/items/helm_of_the_dominator.png",
                stats: [
                    { attribute: EquipmentAttribute.STRENGTH, value: 10 },
                    { attribute: EquipmentAttribute.ARMOR, value: 5 },
                    { attribute: EquipmentAttribute.HEALTH, value: 150 }
                ]
            },
            {
                name: "生锈的剑",
                type: ExternalItemType.WEAPON,
                icon: "file://{images}/items/lesser_crit.png",
                stats: [
                    { attribute: EquipmentAttribute.AGILITY, value: 5 },
                    { attribute: EquipmentAttribute.ATTACK_DAMAGE, value: 12 }
                ]
            },
            {
                name: "精钢之剑",
                type: ExternalItemType.WEAPON,
                icon: "file://{images}/items/greater_crit.png",
                stats: [
                    { attribute: EquipmentAttribute.AGILITY, value: 10 },
                    { attribute: EquipmentAttribute.ATTACK_DAMAGE, value: 25 },
                    { attribute: EquipmentAttribute.ATTACK_SPEED, value: 15 }
                ]
            },
            {
                name: "布甲",
                type: ExternalItemType.ARMOR,
                icon: "file://{images}/items/ring_of_protection.png",
                stats: [
                    { attribute: EquipmentAttribute.ARMOR, value: 3 },
                    { attribute: EquipmentAttribute.HEALTH, value: 100 }
                ]
            },
            {
                name: "力量戒指",
                type: ExternalItemType.RING,
                icon: "file://{images}/items/ring_of_regen.png",
                stats: [
                    { attribute: EquipmentAttribute.STRENGTH, value: 6 },
                    { attribute: EquipmentAttribute.HEALTH, value: 150 }
                ]
            },
            {
                name: "草鞋",
                type: ExternalItemType.BOOTS,
                icon: "file://{images}/items/boots.png",
                stats: [
                    { attribute: EquipmentAttribute.AGILITY, value: 4 },
                    { attribute: EquipmentAttribute.MOVE_SPEED, value: 25 }
                ]
            },
        ];
        
        testEquipments.forEach(item => {
            EquipmentVaultSystem.SaveToVault(playerId, item);
        });
        
        print(`[EventHandlers] ✓ 已添加 ${testEquipments.length} 件测试装备到仓库`);
    }
}
