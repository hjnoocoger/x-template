import { 
    SPAWN_POINT, 
    ROOM1_ENTRANCE, 
    ROOM2_ENTRANCE,
    ROOM3_ENTRANCE,
    ROOM1_MONSTERS, 
    ROOM2_MONSTERS,
    ROOM3_BOSS
} from "./simple_config";
import { ShadowFiendBoss } from "./boss/shadow_fiend_boss";
import { LootSystem } from "./loot_system";
import { DungeonDifficulty, DIFFICULTY_NAMES, DIFFICULTY_MULTIPLIERS } from "./reward_config";
import { EXTERNAL_REWARD_POOL, ExternalRewardItem } from "./external_reward_pool";
import { EquipmentVaultSystem } from "../systems/equipment_vault_system";
export class SimpleDungeon {
    private monsters: CDOTA_BaseNPC[] = [];
    private currentRoom: number = 0;
    private playerId: PlayerID | undefined;
    private bossManager: ShadowFiendBoss | undefined;
    private currentDifficulty: DungeonDifficulty = DungeonDifficulty.NORMAL_1;  // ⭐ 默认普通1星
    
    // ⭐ 新增：缓存当前生成的奖励，供客户端选择后使用
    private currentRewards: ExternalRewardItem[] = [];


    
    constructor() {
        print("=". repeat(50));
        print("[SimpleDungeon] Constructor called!");
        print("=".repeat(50));
        
        this.RegisterCommand();
        this.ListenToEvents();
        this.ListenToChatCommand();
        this.RegisterRewardSelectionListener(); // ⭐ 新增
        
        print("[SimpleDungeon] Ready!   Type -start in chat");
    }

    private ListenToChatCommand(): void {
        ListenToGameEvent("player_chat", (event) => {
            const text = event.text;
            print(`[SimpleDungeon] Received chat: "${text}"`);
            
            if (text === "-start" || text === "start") {
                const playerId = event.playerid as PlayerID;
                print(`[SimpleDungeon] Start command triggered by player ${playerId}`);
                this.StartDungeon(playerId);
            }
        }, this);
        
        print("[SimpleDungeon] Chat listener registered");
    }

    private RegisterCommand(): void {
        Convars.RegisterCommand("start", () => {
            print("[SimpleDungeon] Console command triggered!");
            const playerController = Convars.GetCommandClient();
            if (playerController) {
                const playerId = playerController.GetPlayerID();
                this.StartDungeon(playerId);
            }
        }, "Start dungeon", 0);
        
        print("[SimpleDungeon] Console command registered");
    }

    private ListenToEvents(): void {
        ListenToGameEvent("entity_killed", (event) => {
            this.OnEntityKilled(event);
        }, this);
        
        print("[SimpleDungeon] Death event listener registered");
    }

    public StartDungeon(playerId: PlayerID, difficulty?: string): void {
        const diff = difficulty || "normal_1";
        print(`[SimpleDungeon] ========== START DUNGEON ==========`);
        print(`[SimpleDungeon] Player ID: ${playerId}, Difficulty: ${diff}`);
        
        // ⭐ 映射难度字符串到枚举
        const difficultyMap: Record<string, DungeonDifficulty> = {
            "easy_1": DungeonDifficulty.EASY_1,
            "easy_2": DungeonDifficulty. EASY_2,
            "easy_3": DungeonDifficulty.EASY_3,
            "normal_1": DungeonDifficulty.NORMAL_1,
            "normal_2": DungeonDifficulty. NORMAL_2,
            "normal_3": DungeonDifficulty.NORMAL_3,
            "hard_1": DungeonDifficulty. HARD_1,
            "hard_2": DungeonDifficulty.HARD_2,
            "hard_3": DungeonDifficulty. HARD_3
        };
        
        this.currentDifficulty = difficultyMap[diff] || DungeonDifficulty.NORMAL_1;
        
        this.playerId = playerId;
        this.currentRoom = 1;
        
        const hero = PlayerResource.GetSelectedHeroEntity(playerId);
        if (! hero) {
            print("[SimpleDungeon] ERROR: No hero found!");
            return;
        }

        print(`[SimpleDungeon] Hero: ${hero.GetUnitName()}`);

        // 传送到房间1
        this.TeleportToRoom(hero, 1);
        
        // 刷房间1的怪
        this.SpawnMonstersForRoom(1);
        
        // ⭐ 显示难度名称
        const diffName = DIFFICULTY_NAMES[this.currentDifficulty];
         GameRules.SendCustomMessage(
        `<font color='#00FF00'>副本开始！房间 1/3 - ${diffName}</font>`, 
        playerId, 
        0
        );
    }

    private TeleportToRoom(hero: CDOTA_BaseNPC_Hero, roomNumber: number): void {
        let position: Vector;
        
        if (roomNumber === 1) {
            position = ROOM1_ENTRANCE;
        } else if (roomNumber === 2) {
            position = ROOM2_ENTRANCE;
        } else if (roomNumber === 3) {
            position = ROOM3_ENTRANCE;
        } else {
            print(`[SimpleDungeon] Invalid room number: ${roomNumber}`);
            return;
        }

        FindClearSpaceForUnit(hero, position, true);
        print(`[SimpleDungeon] Teleported to room ${roomNumber} at ${position}`);
    }

    private SpawnMonstersForRoom(roomNumber: number): void {
        print(`[SimpleDungeon] ========== SPAWN ROOM ${roomNumber} ==========`);
        
        // 清空旧怪物
        this.monsters = [];

        let spawnPoints: Vector[];
        let monsterCount: number;
        let unitName: string;

        if (roomNumber === 1) {
            spawnPoints = ROOM1_MONSTERS;
            monsterCount = 3;
            unitName = "npc_dota_creep_badguys_melee";
        } else if (roomNumber === 2) {
            spawnPoints = ROOM2_MONSTERS;
            monsterCount = 5;
            unitName = "npc_dota_creep_badguys_melee";
        } else if (roomNumber === 3) {
            spawnPoints = ROOM3_BOSS;
            monsterCount = 1;
            unitName = "npc_dota_hero_nevermore";
        } else {
            print(`[SimpleDungeon] Invalid room: ${roomNumber}`);
            return;
        }

        for (let i = 0; i < spawnPoints.length && i < monsterCount; i++) {
            const pos = spawnPoints[i];
            print(`[SimpleDungeon] Spawning ${unitName} ${i+1} at ${pos}`);
            
            const monster = CreateUnitByName(
                unitName,
                pos,
                true,
                undefined,
                undefined,
                DotaTeam.BADGUYS
            );

            if (monster) {
                if (roomNumber === 3) {
                    this.EnhanceBoss(monster);
                }
                
                this.monsters.push(monster);
                print(`[SimpleDungeon] ✓ ${unitName} ${i+1} created`);
            } else {
                print(`[SimpleDungeon] ✗ Failed to create ${unitName} ${i+1}`);
            }
        }

        print(`[SimpleDungeon] Room ${roomNumber}: ${this.monsters.length} monsters spawned`);
    }

    private EnhanceBoss(boss: CDOTA_BaseNPC): void {
        print("[SimpleDungeon] Enhancing Boss...");
        
        // ⭐ 获取难度系数
        const multiplier = DIFFICULTY_MULTIPLIERS[this.currentDifficulty];
        print(`[SimpleDungeon] Difficulty multiplier: ${multiplier}`);
        
        if (boss.IsHero()) {
            const heroBoss = boss as CDOTA_BaseNPC_Hero;
            
            heroBoss.SetTeam(DotaTeam. BADGUYS);
            
            heroBoss.SetAbilityPoints(0);
            for (let i = 1; i <= 10; i++) {
                heroBoss.HeroLevelUp(false);
            }
            
            // ⭐ 应用难度系数
            heroBoss.SetBaseStrength(Math.floor(500 * multiplier));
            heroBoss.SetBaseAgility(Math.floor(50 * multiplier));
            heroBoss.SetBaseIntellect(Math.floor(50 * multiplier));
            
            heroBoss.SetHealth(heroBoss.GetMaxHealth());
            heroBoss.SetMana(heroBoss.GetMaxMana());
            
            if (boss.GetUnitName() === "npc_dota_hero_nevermore") {
                print("[SimpleDungeon] Setting up Shadow Fiend Boss...");
                
                boss.SetMoveCapability(UnitMoveCapability.NONE);
                boss.AddNewModifier(boss, undefined, "modifier_invulnerable", {});
                
                Timers.CreateTimer(1, () => {
                    if (! boss.IsAlive()) return undefined;
                    
                    print("[SimpleDungeon] Boss model loaded, processing abilities...");
                    
                    const abilitiesToRemove = [
                        "nevermore_shadowraze1",
                        "nevermore_shadowraze2",
                        "nevermore_shadowraze3",
                        "nevermore_necromastery",
                        "nevermore_dark_lord",
                        "nevermore_requiem"
                    ];
                    
                    for (const abilityName of abilitiesToRemove) {
                        const ability = boss.FindAbilityByName(abilityName);
                        if (ability) {
                            boss. RemoveAbility(abilityName);
                        }
                    }
                    
                    Timers.CreateTimer(0.3, () => {
                        if (!boss.IsAlive()) return undefined;
                        
                        print("[SimpleDungeon] Adding shadow_explosion ability...");
                        
                        let explosionAbility = boss.FindAbilityByName("shadow_explosion");
                        if (!explosionAbility) {
                            explosionAbility = boss.AddAbility("shadow_explosion");
                        }
                        
                        if (explosionAbility) {
                            explosionAbility.SetLevel(1);
                            print("[SimpleDungeon] ✓ Shadow Explosion ability ready!");
                        } else {
                            print("[SimpleDungeon] ✗ Failed to add shadow_explosion!");
                        }
                        
                        Timers.CreateTimer(0.3, () => {
                            if (!boss.IsAlive() || this.playerId === undefined) return undefined;
                            
                            print("[SimpleDungeon] Initializing Boss Manager...");
                            this.bossManager = new ShadowFiendBoss(boss, this.playerId);
                            print("[SimpleDungeon] ✓ Boss Manager initialized!");
                            
                            Timers.CreateTimer(1, () => {
                                if (!boss.IsAlive()) return undefined;
                                
                                boss.RemoveModifierByName("modifier_invulnerable");
                                print("[SimpleDungeon] ✓ Boss is now vulnerable!  Fight begins!");
                                
                                if (this.playerId !== undefined) {
                                    GameRules.SendCustomMessage(
                                        "<font color='#FF0000'>暗影领主苏醒了！战斗开始！</font>",
                                        this.playerId,
                                        0
                                    );
                                }
                                
                                return undefined;
                            });

                            return undefined;
                        });
                        
                        return undefined;
                    });
                    
                    return undefined;
                });
                
            } else {
                Timers.CreateTimer(0.5, () => {
                    if (this.playerId !== undefined) {
                        const hero = PlayerResource.GetSelectedHeroEntity(this.playerId);
                        if (hero && heroBoss.IsAlive()) {
                            heroBoss.MoveToTargetToAttack(hero);
                        }
                    }
                    return undefined;
                });
            }
            
        } else {
            // ⭐ 非英雄Boss也应用难度系数
            boss.SetTeam(DotaTeam. BADGUYS);
            boss.SetAttackCapability(UnitAttackCapability.MELEE_ATTACK);
            boss.RemoveModifierByName("modifier_invulnerable");
            
            const maxHealth = boss.GetMaxHealth();
            boss.SetBaseMaxHealth(Math.floor(maxHealth * 5 * multiplier));
            boss.SetHealth(boss.GetMaxHealth());
            
            const baseAttack = boss.GetBaseDamageMax();
            boss.SetBaseDamageMin(Math.floor(baseAttack * 2 * multiplier));
            boss.SetBaseDamageMax(Math.floor(baseAttack * 2 * multiplier));
            
            boss.SetBaseMoveSpeed(350);
        }
        
        const particle = ParticleManager.CreateParticle(
            "particles/items2_fx/smoke_of_deceit_buff.vpcf",
            ParticleAttachment.ABSORIGIN_FOLLOW,
            boss
        );
        ParticleManager.SetParticleControl(particle, 0, boss. GetAbsOrigin());
        
        print(`[SimpleDungeon] Boss enhanced!  HP: ${boss.GetMaxHealth()}`);
    }

   private TriggerRewardSelection(): void {
    print("[SimpleDungeon] Triggering reward selection!");

    const playerId = this.playerId;
    if (!playerId) return;

    // 生成奖励并缓存
    this.currentRewards = this.GenerateRewards();
    print(`[SimpleDungeon] Generated rewards: ${this.currentRewards.map(r => r.name).join(", ")}`);

    // 发送奖励数据到客户端
    CustomGameEventManager.Send_ServerToPlayer(
        PlayerResource.GetPlayer(playerId)!,
        "show_reward_selection",
        { rewards: this.currentRewards }
    );
}

// 方法：从 EXTERNAL_REWARD_POOL 中随机选择 3 件装备
private GenerateRewards(): ExternalRewardItem[] {
    const rewards: ExternalRewardItem[] = [];
    const pool = [...EXTERNAL_REWARD_POOL]; // 深拷贝池子，避免被修改

    for (let i = 0; i < 3; i++) {
        if (pool.length === 0) break;

        const randomIndex = Math.floor(Math.random() * pool.length);
        rewards.push(pool[randomIndex]);
        pool.splice(randomIndex, 1); // 确保同一奖励不重复
    }

    return rewards;
}

// ⭐ 新增：注册奖励选择事件监听
private RegisterRewardSelectionListener(): void {
    CustomGameEventManager.RegisterListener("player_select_reward", (userId, event) => {
        const playerId = event.PlayerID as PlayerID;
        const rewardIndex = event.rewardIndex as number;
        
        print(`[SimpleDungeon] 玩家${playerId}选择了奖励索引：${rewardIndex}`);
        
        // ⭐ 验证是否为当前副本的玩家
        if (playerId !== this.playerId) {
            print(`[SimpleDungeon] ❌ 玩家${playerId}不是当前副本的玩家（应为${this.playerId}）`);
            return;
        }
        
        // 验证索引有效性
        if (rewardIndex < 0 || rewardIndex >= this.currentRewards.length) {
            print(`[SimpleDungeon] ❌ 无效的奖励索引：${rewardIndex}`);
            return;
        }
        
        // 验证奖励是否已被选择
        if (this.currentRewards.length === 0) {
            print(`[SimpleDungeon] ❌ 奖励已被选择或不存在`);
            return;
        }
        
        const selectedReward = this.currentRewards[rewardIndex];
        
        // ⭐ 保存到装备仓库
        EquipmentVaultSystem.SaveToVault(playerId, selectedReward);
        
        // 通知玩家
        GameRules.SendCustomMessage(
            `<font color='#FFD700'>✓ 获得局外装备：${selectedReward.name} (${selectedReward.attribute} +${selectedReward.value})</font>`,
            playerId,
            0
        );
        
        // 清空缓存（单人副本，选择后立即清空）
        this.currentRewards = [];
    });
}

// 在 OnEntityKilled 方法中触发奖励逻辑：击败 Boss 后调用 TriggerRewardSelection
private OnEntityKilled(event: EntityKilledEvent): void {
    const killedUnit = EntIndexToHScript(event.entindex_killed);
    if (!killedUnit) return;

    const index = this.monsters.indexOf(killedUnit as CDOTA_BaseNPC);
    if (index !== -1) {
        this.monsters.splice(index, 1);
        print(`[SimpleDungeon] Monster killed! Remaining: ${this.monsters.length}`);

        if (this.monsters.length === 0) {
            print(`[SimpleDungeon] 所有怪物已被击杀，房间 ${this.currentRoom} 清空`);
            
            // ⭐ Boss 房间特殊处理
            if (this.currentRoom === 3 && this.playerId !== undefined) {
                // 1. 触发 Boss 掉落（物品掉落到地面 + 金币）
                LootSystem.DropBossLoot(
                    killedUnit as CDOTA_BaseNPC, 
                    this.currentDifficulty, 
                    this.playerId
                );
                
                // 2. 触发奖励选择界面（局外装备奖励）
                this.TriggerRewardSelection();
            }
            
            this.OnRoomCleared();
        }
    }
}

    private OnRoomCleared(): void {
        print(`[SimpleDungeon] ========== ROOM ${this.currentRoom} CLEARED ==========`);

        if (this.playerId === undefined) return;

        if (this.currentRoom === 1) {
            GameRules.SendCustomMessage(
                "<font color='#00FF00'>✓ 房间1清空！3秒后传送到房间2... </font>", 
                this.playerId, 
                0
            );

            Timers.CreateTimer(3.0, () => {
                const hero = PlayerResource.GetSelectedHeroEntity(this.playerId! );
                if (hero) {
                    this.currentRoom = 2;
                    this.TeleportToRoom(hero, 2);
                    
                    Timers.CreateTimer(1.0, () => {
                        this.SpawnMonstersForRoom(2);
                        GameRules.SendCustomMessage(
                            "<font color='#FFA500'>房间 2/3 - 击败5个怪物！</font>",
                            this.playerId!, 
                            0
                        );
                        return undefined;
                    });
                }
                return undefined;
            });

        } else if (this.currentRoom === 2) {
            GameRules.SendCustomMessage(
                "<font color='#00FF00'>✓ 房间2清空！准备面对Boss...</font>", 
                this.playerId, 
                0
            );

            Timers.CreateTimer(3.0, () => {
                const hero = PlayerResource.GetSelectedHeroEntity(this.playerId!);
                if (hero) {
                    this.currentRoom = 3;
                    this.TeleportToRoom(hero, 3);
                    
                    Timers.CreateTimer(1.0, () => {
                        this.SpawnMonstersForRoom(3);
                        GameRules.SendCustomMessage(
                            "<font color='#FF0000'>房间 3/3 - ⚔️ Boss战！击败暗影领主！</font>",
                            this.playerId!, 
                            0
                        );
                        return undefined;
                    });
                }
                return undefined;
            });

        } else if (this.currentRoom === 3) {
            this.OnComplete();
        }
    }

    private OnComplete(): void {
        print("=".repeat(50));
        print("[SimpleDungeon] 🎉 DUNGEON COMPLETE! 🎉");
        print("=".repeat(50));
        
        if (this. playerId !== undefined) {
            // ⭐ 使用奖励系统给予通关奖励
            LootSystem.GiveCompletionReward(this.playerId, this.currentDifficulty);

            // 5秒后传送回主城
            Timers.CreateTimer(5.0, () => {
                const hero = PlayerResource. GetSelectedHeroEntity(this. playerId!);
                if (hero) {
                    FindClearSpaceForUnit(hero, SPAWN_POINT, true);
                    GameRules.SendCustomMessage(
                        "<font color='#00FFFF'>已返回主城</font>", 
                        this.playerId!, 
                        0
                    );
                }
                return undefined;
            });
        }

        // 重置状态
        this.currentRoom = 0;
        this.monsters = [];
    }
}