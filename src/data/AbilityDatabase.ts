// ==============================================================================
// SKILL TREE DATA
// ==============================================================================

export const SKILL_TREE_DATA: Record<string, Record<string, Record<string, any>>> = {
    shadow: {
        mobility: {
            "reaper_step": { 
                name: "Reaper's Step", icon: "👣", desc: "Meld into the shadows and instantly teleport to a target location.", cooldownTime: 5.0, color: "#5500aa", 
                upgrades: { 
                    "blood_clone": { 
                        name: "Blood Clone", maxRank: 3,
                        rankDescs: [
                            "Iron Rank: Leaves a blood decoy at your starting location that draws enemy aggro.",
                            "Bronze Rank: If the decoy is destroyed or expires, it explodes, applying Bleed to nearby enemies.",
                            "Silver Rank: [EVOLUTION] Teleporting directly through an enemy tears their soul, instantly applying 2 stacks of Necrosis."
                        ]
                    } 
                } 
            },
            "shadow_step": {
                name: "Shadow Step", 
                icon: "🌑", 
                desc: "Target any location in range to instantly dissolve into shadows and reappear.", 
                cooldownTime: 4.0, 
                color: "#440088",
                upgrades: {
                    "way_of_the_night": {
                        name: "Way of the Night", 
                        maxRank: 3,
                        rankDescs: [
                            "Iron Rank: Targeted teleportation. Dissolve into a shadow and reappear at any location within 15 units.",
                            "Bronze Rank: Use your ability to leave a Shadow Anchor. You can target this anchor from any distance to warp back to it.",
                            "Silver Rank: [EVOLUTION] Tear open a shadow rift. Unlocks the 'Town Recall' ability to open a portal back to the Town of Beginnings."
                        ]
                    }
                }
            }
        },
        tactical: {
            "blood_harvest": { 
                name: "Blood Harvest", icon: "🩸", desc: "A vicious shadowy dagger strike that inflicts Bleed.", cooldownTime: 4.0, color: "#aa0000", 
                upgrades: { 
                    "sanguine_feast": { 
                        name: "Sanguine Feast", maxRank: 3,
                        rankDescs: [
                            "Iron Rank: Heals you for 50% of the initial damage dealt.",
                            "Bronze Rank: If the target dies while bleeding, the affliction jumps to 2 nearby enemies.",
                            "Silver Rank: [EVOLUTION] Consumes all Bleed stacks on the target to deal massive instant Execution damage."
                        ]
                    } 
                } 
            },
            "umbral_snare": {
                name: "Umbral Snare",
                icon: "🕸️",
                color: "#7700cc",
                desc: "Trap. Place a hidden shadow rune on the ground (lasts 60s). Triggers when an enemy walks over it, rooting them for 3 seconds.",
                cooldownTime: 12.0,
                upgrades: {
                    "abyssal_binding": {
                        name: "Abyssal Binding",
                        maxRank: 3,
                        rankDescs: [
                            "Iron Rank: Trapped enemies are afflicted with Necrosis (DoT).",
                            "Bronze Rank: When triggered, violent gravity pulls all enemies within 8 units into the center of the trap.",
                            "Silver Rank: [EVOLUTION] The trap explodes into a blinding cloud, silencing all pulled enemies for 4 seconds."
                        ]
                    }
                }
            },
            "veil_of_shadows": {
                name: "Veil of Shadows",
                icon: "🥷",
                color: "#222244",
                desc: "Drop aggro and fade into absolute invisibility for 5 seconds. Movement speed is heavily increased.",
                cooldownTime: 15.0,
                upgrades: {
                    "phantom_assassin": {
                        name: "Phantom Assassin",
                        maxRank: 3,
                        rankDescs: [
                            "Iron Rank: Your first attack out of stealth deals 50% bonus damage.",
                            "Bronze Rank: Passively regenerate 5% of your Max HP per second while stealthed.",
                            "Silver Rank: [EVOLUTION] Leaving stealth unleashes a burst of shadowy blades, dealing damage and silencing enemies within 6 units."
                        ]
                    }
                }
            }
        },
        aoe: {
            "feast_of_absolution": { 
                name: "Feast of Absolution", icon: "🦇", desc: "Release a swarm of shadowy leeches that drain nearby enemies.", cooldownTime: 8.0, color: "#8800ff", 
                upgrades: { 
                    "creeping_doom": { 
                        name: "Creeping Doom", maxRank: 3,
                        rankDescs: [
                            "Iron Rank: Applies Necrosis to all enemies hit, reducing their speed and dealing damage over time.",
                            "Bronze Rank: The swarm lingers in the area for 4 seconds, continually biting enemies inside.",
                            "Silver Rank: [EVOLUTION] Enemies that die to the swarm violently explode into a burst of healing blood for you."
                        ]
                    } 
                } 
            },
            "void_eruption": { 
                name: "Void Eruption", icon: "🌋", desc: "A massive explosion of dark energy from the earth.", cooldownTime: 12.0, color: "#330066", 
                upgrades: { 
                    "abyssal_cataclysm": { 
                        name: "Abyssal Cataclysm", maxRank: 3,
                        rankDescs: [
                            "Iron Rank: Enemies hit are violently afflicted with Necrosis.",
                            "Bronze Rank: Creates a gravitational pull, dragging enemies to the center before exploding.",
                            "Silver Rank: [EVOLUTION] The eruption tears a Dark Singularity that lingers for 3 seconds, constantly Silencing enemies caught inside."
                        ]
                    } 
                } 
            }
        },
        ultimate: {
            "avatar_of_doom": { 
                name: "Avatar of Doom", icon: "👁️", desc: "Summon a massive executioner's scythe to cleave the battlefield.", cooldownTime: 30.0, color: "#111111", 
                upgrades: { 
                    "gaze_of_the_abyss": { 
                        name: "Gaze of the Abyss", maxRank: 3,
                        rankDescs: [
                            "Iron Rank: Damage increases by 15% for every Affliction (Bleed/Necrosis) on the target.",
                            "Bronze Rank: Silences all surviving enemies for 3 seconds, canceling active telegraphs.",
                            "Silver Rank: [EVOLUTION] Tears a rift that summons a Doom Familiar. It floats behind you and shoots eye-beams at afflicted enemies for 10s."
                        ]
                    } 
                } 
            },
            "nightfall": { 
                name: "Nightfall", icon: "🌘", desc: "Plunge the area into absolute darkness, becoming untargetable and unleashing a flurry of rapid shadow strikes.", cooldownTime: 40.0, color: "#220044", 
                upgrades: { 
                    "blade_of_the_eclipse": { 
                        name: "Blade of the Eclipse", maxRank: 3,
                        rankDescs: [
                            "Iron Rank: Heals you for 20% of the total damage dealt by the strikes.",
                            "Bronze Rank: Enemies caught in the darkness are heavily staggered, stunning them for 3 seconds.",
                            "Silver Rank: [EVOLUTION] Ruthless execution. Any enemy caught in the darkness with less than 30% HP is instantly killed."
                        ]
                    } 
                } 
            }
        }
    },
    light: {
        mobility: {
            "radiant_dash": { 
                name: "Radiant Dash", icon: "🛡️", desc: "Dash forward, passing harmlessly through enemies.", cooldownTime: 6.0, color: "#ffaa00", 
                upgrades: {
                    "blinding_trail": {
                        name: "Blinding Trail", maxRank: 3,
                        rankDescs: [
                            "Iron Rank: Leaves a trail of light that grants allies +20% movement speed when they walk on it.",
                            "Bronze Rank: Enemies caught in the trail are Blinded for 1.5 seconds.",
                            "Silver Rank: [EVOLUTION] The dash becomes a teleport of pure light, instantly healing any allies you phase through."
                        ]
                    }
                } 
            },
            "wings_of_dawn": { 
                name: "Wings of Dawn", icon: "🕊️", desc: "Leap into the air, evading all ground Area of Effect damage.", cooldownTime: 8.0, color: "#ffcc00", 
                upgrades: {
                    "solar_flare": {
                        name: "Solar Flare", maxRank: 3,
                        rankDescs: [
                            "Iron Rank: Deals minor holy damage to enemies when you take off and land.",
                            "Bronze Rank: Grants brief crowd-control immunity while in the air.",
                            "Silver Rank: [EVOLUTION] Landing unleashes a blinding solar flare, stunning all enemies in a 6-unit radius."
                        ]
                    }
                } 
            }
        },
        tactical: {
            "divine_smite": { 
                name: "Divine Smite", icon: "⚡", desc: "Strike a single enemy with pure holy energy.", cooldownTime: 4.0, color: "#ffffaa", 
                upgrades: {
                    "chain_lightning": {
                        name: "Chain Lightning", maxRank: 3,
                        rankDescs: [
                            "Iron Rank: The smite arcs to 2 additional nearby enemies for 50% damage.",
                            "Bronze Rank: Arcs prioritize the lowest-health enemies and execute them if below 10% health.",
                            "Silver Rank: [EVOLUTION] Lightning leaves a static charge on targets; attacking them detonates it for holy AoE damage."
                        ]
                    }
                } 
            },
            "blinding_flare": { 
                name: "Blinding Flare", icon: "☀️", desc: "Release a flash that stuns a target for 3 seconds.", cooldownTime: 10.0, color: "#ffee88", 
                upgrades: {
                    "searing_light": {
                        name: "Searing Light", maxRank: 3,
                        rankDescs: [
                            "Iron Rank: Strips all magical buffs from the stunned target.",
                            "Bronze Rank: Reduces the target's damage output by 30% for 5 seconds after the stun wears off.",
                            "Silver Rank: [EVOLUTION] Flare permanently sears armor, increasing all physical damage taken by 20%."
                        ]
                    }
                } 
            }
        },
        aoe: {
            "aura_of_purity": { 
                name: "Aura of Purity", icon: "✨", desc: "Heal yourself and damage nearby enemies.", cooldownTime: 10.0, color: "#ffdd00", 
                upgrades: {
                    "cleansing_fire": {
                        name: "Cleansing Fire", maxRank: 3,
                        rankDescs: [
                            "Iron Rank: Automatically cleanses one negative status effect from allies every 3 seconds.",
                            "Bronze Rank: Enemies inside the aura have their healing received reduced by 50%.",
                            "Silver Rank: [EVOLUTION] When aura expires, it detonates, healing allies based on damage mitigated."
                        ]
                    }
                } 
            },
            "holy_nova": { 
                name: "Holy Nova", icon: "🌟", desc: "Expand a ring of light that pushes enemies away.", cooldownTime: 12.0, color: "#ffff00", 
                upgrades: {
                    "repelling_force": {
                        name: "Repelling Force", maxRank: 3,
                        rankDescs: [
                            "Iron Rank: The knockback distance is doubled.",
                            "Bronze Rank: Enemies knocked into walls or solid obstacles are stunned for 2 seconds.",
                            "Silver Rank: [EVOLUTION] Leaves a lingering ring of holy fire that damages enemies crossing it."
                        ]
                    }
                } 
            },
            "consecrated_ground": { 
                name: "Consecrated Ground", icon: "💮", desc: "Sanctify the earth beneath you, burning enemies and empowering allies for 6 seconds.", cooldownTime: 15.0, color: "#ffffcc", 
                upgrades: { 
                    "hallowed_domain": { 
                        name: "Hallowed Domain", maxRank: 3,
                        rankDescs: [
                            "Iron Rank: Allies standing in the zone gain +20% movement speed.",
                            "Bronze Rank: Undead and Shadow enemies take double damage from the holy flames.",
                            "Silver Rank: [EVOLUTION] The zone becomes a true Sanctuary. Allies inside cannot be reduced below 1 HP."
                        ]
                    } 
                } 
            }
        },
        ultimate: {
            "grand_cross": { 
                name: "Grand Cross", icon: "✝️", desc: "Summon a massive cross of light to smite an entire zone.", cooldownTime: 30.0, color: "#ffffff", 
                upgrades: {
                    "divine_execution": {
                        name: "Divine Execution", maxRank: 3,
                        rankDescs: [
                            "Iron Rank: Heals all allies standing inside the cross for a massive amount.",
                            "Bronze Rank: Enemies killed by the cross turn into pillars of salt (physical obstacles).",
                            "Silver Rank: [EVOLUTION] The cross persists for 8 seconds, continually firing beams of light."
                        ]
                    }
                } 
            },
            "heavenly_judgment": { 
                name: "Heavenly Judgment", icon: "⚖️", desc: "Call down a massive pillar of light that persists for 10 seconds.", cooldownTime: 40.0, color: "#ffffee", 
                upgrades: {
                    "orbital_strike": {
                        name: "Orbital Strike", maxRank: 3,
                        rankDescs: [
                            "Iron Rank: The pillar slowly tracks the nearest enemy.",
                            "Bronze Rank: Beam grows 20% wider and deals 20% more damage every second it strikes a target.",
                            "Silver Rank: [EVOLUTION] The pillar splits into four smaller pillars that autonomously hunt separate targets."
                        ]
                    }
                } 
            }
        }
    },
    berserker: {
        mobility: {
            "bull_rush": { 
                name: "Bull Rush", icon: "🐗", desc: "Charge forward, knocking back any enemies in your path.", cooldownTime: 6.0, color: "#cc0000", 
                upgrades: {
                    "unstoppable_force": {
                        name: "Unstoppable Force", maxRank: 3,
                        rankDescs: [
                            "Iron Rank: You are immune to all crowd control while charging.",
                            "Bronze Rank: Leaves a trail of fire in your wake that burns enemies.",
                            "Silver Rank: [EVOLUTION] Colliding with a wall creates a shockwave that knocks down all nearby enemies."
                        ]
                    }
                } 
            },
            "heroic_leap": { 
                name: "Heroic Leap", icon: "🦘", desc: "Jump to a target location, crashing down heavily.", cooldownTime: 8.0, color: "#dd2222", 
                upgrades: {
                    "crater_impact": {
                        name: "Crater Impact", maxRank: 3,
                        rankDescs: [
                            "Iron Rank: The impact destroys enemy armor, reducing defense by 10%.",
                            "Bronze Rank: Pull enemies slightly toward the center of the impact zone.",
                            "Silver Rank: [EVOLUTION] Ground shatters, leaving a permanent crater that slows enemies walking through it."
                        ]
                    }
                } 
            }
        },
        tactical: {
            "sunder": { 
                name: "Sunder", icon: "🪓", desc: "A heavy strike that causes severe bleeding over time.", cooldownTime: 3.0, color: "#ff4444", 
                upgrades: {
                    "deep_wounds": {
                        name: "Deep Wounds", maxRank: 3,
                        rankDescs: [
                            "Iron Rank: The bleed effect stacks up to 3 times on a single target.",
                            "Bronze Rank: Hitting a bleeding target restores a small amount of Health Points.",
                            "Silver Rank: [EVOLUTION] At 3 stacks, targets hemorrhage for burst damage based on Max HP."
                        ]
                    }
                } 
            },
            "intimidating_shout": { 
                name: "Intimidating Shout", icon: "🗣️", desc: "Reduce the damage of all enemies in front of you.", cooldownTime: 12.0, color: "#bb0000", 
                upgrades: {
                    "shattering_roar": {
                        name: "Shattering Roar", maxRank: 3,
                        rankDescs: [
                            "Iron Rank: Also reduces enemy movement speed by 40%.",
                            "Bronze Rank: Allies in the cone gain an Attack Speed buff.",
                            "Silver Rank: [EVOLUTION] Physical force that instantly destroys enemy shields and barriers."
                        ]
                    }
                } 
            }
        },
        aoe: {
            "seismic_slam": { 
                name: "Seismic Slam", icon: "💥", desc: "Slam the ground, dealing Area of Effect physical damage.", cooldownTime: 8.0, color: "#ffaa00", 
                upgrades: {
                    "aftershock": {
                        name: "Aftershock", maxRank: 3,
                        rankDescs: [
                            "Iron Rank: A second, smaller tremor hits 1 second after the initial slam.",
                            "Bronze Rank: Enemies hit by both the slam and the aftershock are stunned.",
                            "Silver Rank: [EVOLUTION] Pillars of jagged earth erupt from the ground, blocking enemy movement."
                        ]
                    }
                } 
            },
            "whirlwind": { 
                name: "Whirlwind", icon: "🌪️", desc: "Spin rapidly, damaging all nearby enemies repeatedly.", cooldownTime: 10.0, color: "#ff6600", 
                upgrades: {
                    "cyclone_pull": {
                        name: "Cyclone Pull", maxRank: 3,
                        rankDescs: [
                            "Iron Rank: You can move at 150% speed while channeling Whirlwind.",
                            "Bronze Rank: Continuously pulls enemies toward your weapon.",
                            "Silver Rank: [EVOLUTION] Generates a wind barrier, reflecting all incoming projectiles."
                        ]
                    }
                } 
            },
            "devastating_cleave": { 
                name: "Devastating Cleave", icon: "🌪️", desc: "A massive 360-degree swing that decimates surrounding enemies.", cooldownTime: 8.0, color: "#cc0000", 
                upgrades: { 
                    "reapers_toll": { 
                        name: "Reaper's Toll", maxRank: 3,
                        rankDescs: [
                            "Iron Rank: Inflicts 2 stacks of deep Bleed on all enemies hit.",
                            "Bronze Rank: The cooldown is instantly reset if this ability kills an enemy.",
                            "Silver Rank: [EVOLUTION] The swing fires a circular shockwave of blood outward, doubling the AoE radius."
                        ]
                    } 
                } 
            }
        },
        ultimate: {
            "meteor_strike": { 
                name: "Meteor Strike", icon: "☄️", desc: "Crash down from above like a meteor, decimating the area.", cooldownTime: 30.0, color: "#ff0000", 
                upgrades: {
                    "extinction_event": {
                        name: "Extinction Event", maxRank: 3,
                        rankDescs: [
                            "Iron Rank: The radius of the explosion increases by 50%.",
                            "Bronze Rank: Enemies in the center of the impact take triple damage.",
                            "Silver Rank: [EVOLUTION] Leaves a pool of molten magma that deals massive damage over time."
                        ]
                    }
                } 
            },
            "wrath_of_the_berserker": { 
                name: "Wrath of the Berserker", icon: "🔥", desc: "Increase all stats and movement speed massively for 15 seconds.", cooldownTime: 45.0, color: "#ff3300", 
                upgrades: {
                    "undying_rage": {
                        name: "Undying Rage", maxRank: 3,
                        rankDescs: [
                            "Iron Rank: Every kill extends the duration of the Wrath by 2 seconds.",
                            "Bronze Rank: You are immune to all crowd control while active.",
                            "Silver Rank: [EVOLUTION] Cannot be killed while active. Restore to 25% HP when effect ends."
                        ]
                    }
                } 
            }
        }
    },
    nature: {
        mobility: {
            "spirit_animal": { 
                name: "Spirit Animal", icon: "🐺", desc: "Transform into a swift spirit wolf for 5 seconds, gaining massive movement speed and ignoring collision.", cooldownTime: 8.0, color: "#22cc44", 
                upgrades: { 
                    "pack_leader": { 
                        name: "Pack Leader", maxRank: 3,
                        rankDescs: [
                            "Iron Rank: Nearby allies also gain a 20% movement speed boost.",
                            "Bronze Rank: Dashing through enemies inflicts Bleed and slows them.",
                            "Silver Rank: [EVOLUTION] Exiting the form unleashes a feral howl, fearing nearby enemies for 2 seconds."
                        ]
                    } 
                } 
            }
        },
        tactical: {
            "earth_spike": { 
                name: "Earth Spike", icon: "🏔️", desc: "Command the earth to erupt under a target, dealing physical damage and rooting them.", cooldownTime: 5.0, color: "#885522", 
                upgrades: { 
                    "jagged_stone": { 
                        name: "Jagged Stone", maxRank: 3,
                        rankDescs: [
                            "Iron Rank: Leaves behind a jagged rock that slows enemies who walk near it.",
                            "Bronze Rank: Hitting an enemy grants you a temporary stone shield absorbing 50 damage.",
                            "Silver Rank: [EVOLUTION] The spike shatters on impact, sending piercing shrapnel to hit up to 3 additional nearby enemies."
                        ]
                    } 
                } 
            }
        },
        aoe: {
            "healing_blossom": { 
                name: "Healing Blossom", icon: "🌸", desc: "Grow a radiant magical flower that pulses healing to all nearby allies over 6 seconds.", cooldownTime: 12.0, color: "#ff66cc", 
                upgrades: { 
                    "natures_bounty": { 
                        name: "Nature's Bounty", maxRank: 3,
                        rankDescs: [
                            "Iron Rank: Cleanses one negative status effect from allies upon sprouting.",
                            "Bronze Rank: Emits toxic spores that Poison enemies inside the radius.",
                            "Silver Rank: [EVOLUTION] When the blossom expires, it leaves behind a fruit that instantly restores 30% Max HP to whoever picks it up."
                        ]
                    } 
                } 
            }
        },
        ultimate: {
            "wrath_of_the_forest": { 
                name: "Wrath of the Forest", icon: "🌳", desc: "Summon massive roots over a huge area, rooting enemies and constantly draining their health to heal your team.", cooldownTime: 40.0, color: "#00aa22", 
                upgrades: {
                    "world_tree": {
                        name: "World Tree", maxRank: 3,
                        rankDescs: [
                            "Iron Rank: Damage dealt by the roots bypasses 50% of enemy armor.",
                            "Bronze Rank: Revives any fallen allies within the roots' radius with 20% HP.",
                            "Silver Rank: [EVOLUTION] Transforms the center of the area into a World Tree Sapling that persists, providing a permanent defensive aura until destroyed."
                        ]
                    }
                } 
            }
        }
    }
};

export const UTILITY_TREE_DATA: Record<string, Record<string, Record<string, any>>> = {
    wayfinder: {
        core: {
            "wayfinder_base": {
                name: "Wayfinder Core", icon: "🧭", desc: "Enhance your map, navigation, and spatial awareness systems.", cooldownTime: 0.0, color: "#00aaff",
                upgrades: {
                    "core_progression": {
                        name: "Core Navigation", maxRank: 5,
                        rankDescs: [
                            "Tier 1 (Mini Map): [Passive] Displays nearby area. Fog of war enabled.",
                            "Tier 2 (Expanded Map): [Passive] Increased radius + Points of Interest.",
                            "Tier 3 (World Map): [Active] Access full region map with exploration tracking.",
                            "Tier 4 (Custom Markers): [Active] Store custom coordinates and icon types on the map.",
                            "Tier 5 (Route Guidance): [Active] Generates a pathfinding line to a selected marker."
                        ]
                    }
                }
            }
        },
        branches: {
            "explorer_branch": {
                name: "Explorer", icon: "🌍", desc: "Discovery System: Master the art of uncovering the hidden world.", cooldownTime: 30.0, color: "#00ffaa",
                upgrades: {
                    "branch_progression": {
                        name: "World Discovery", maxRank: 5,
                        rankDescs: [
                            "Tier 6 (Hidden Path Reveal): [Passive] Automatically highlight hidden objects in a radius.",
                            "Tier 7 (Secret Scan): [Active] Pulse reveals hidden areas with a temporary visibility overlay.",
                            "Tier 8 (Resource Mapping): [Passive] Resource nodes permanently appear on your map layer.",
                            "Tier 9 (Domain Scan): [Active] Reveal all POIs in the current region chunk.",
                            "Tier 10 (Omniscient Survey): [Active] Permanently removes fog of war and shows all secrets in the region."
                        ]
                    }
                }
            },
            "tactical_branch": {
                name: "Tactical", icon: "⚔️", desc: "Combat Intelligence System: Total battlefield awareness.", cooldownTime: 0.0, color: "#ff4444",
                upgrades: {
                    "branch_progression": {
                        name: "Combat Intel", maxRank: 5,
                        rankDescs: [
                            "Tier 6 (Enemy Tracking): [Passive] Enemies appear on the minimap.",
                            "Tier 7 (Threat Zones): [Passive] Color-coded danger heatmap overlay based on enemy density/level.",
                            "Tier 8 (Boss Locator): [Passive] Unique icons mark Elite/Boss enemies from afar.",
                            "Tier 9 (Ambush Warning): [Passive] UI alert and sound cue triggers when an off-screen enemy attacks.",
                            "Tier 10 (Battlefield Awareness): [Passive] Live combat overlay tracking real-time enemy positioning and attack directions."
                        ]
                    }
                }
            },
            "traveler_branch": {
                name: "Traveler", icon: "🌀", desc: "Teleportation System: Bend space to traverse the world instantly.", cooldownTime: 120.0, color: "#aa44ff",
                upgrades: {
                    "branch_progression": {
                        name: "Spatial Traversal", maxRank: 5,
                        rankDescs: [
                            "Tier 6 (Fast Travel Nodes): [Active] Teleport between discovered fast-travel nodes via the map.",
                            "Tier 7 (Recall Beacon): [Active] Place a physical beacon in the world and teleport back to it at will.",
                            "Tier 8 (Teleport Markers): [Active] Convert any custom map marker into a valid teleport destination.",
                            "Tier 9 (Portal Link): [Active] Permanently link two locations together with a stored node connection.",
                            "Tier 10 (Instant Relocation): [Active] Free-target teleport to any visible location (Range limited, High Cooldown)."
                        ]
                    }
                }
            }
        }
    },
    perception: {
        core: {
            "perception_base": {
                name: "Perception Core", icon: "👁️", desc: "Enhance information visibility and entity detection systems.", cooldownTime: 15.0, color: "#ff00ff",
                upgrades: {
                    "core_progression": {
                        name: "Core Senses", maxRank: 5,
                        rankDescs: [
                            "Tier 1 (Highlight Objects): [Passive] Interactable objects glow softly.",
                            "Tier 2 (Aura Sight): [Active] Reveal enemies through walls for a short duration.",
                            "Tier 3 (Weakness Insight): [Passive] Visually highlights weak points on enemies.",
                            "Tier 4 (Loot Highlight): [Passive] Dropped loot glows brightly.",
                            "Tier 5 (Scan Pulse): [Active] Release a massive pulse revealing all nearby entities."
                        ]
                    }
                }
            }
        },
        branches: {
            "hunter_branch": {
                name: "Hunter", icon: "🎯", desc: "Combat Prediction: Read your enemies before they strike.", cooldownTime: 0.0, color: "#ff5500",
                upgrades: {
                    "branch_progression": {
                        name: "Predatory Instincts", maxRank: 5,
                        rankDescs: [
                            "Tier 6 (Movement Trails): [Passive] Render past movement paths of moving targets.",
                            "Tier 7 (Stealth Reveal): [Passive] Automatically detect and highlight invisible enemies.",
                            "Tier 8 (Critical Windows): [Passive] Highlight specific vulnerability frames during enemy attacks.",
                            "Tier 9 (Predictive Marker): [Passive] Renders a ghost marker showing an enemy's future position.",
                            "Tier 10 (True Sight): [Passive] Ignore all enemy concealment, illusions, and line-of-sight blockers."
                        ]
                    }
                }
            },
            "treasure_branch": {
                name: "Treasure", icon: "💰", desc: "Loot System: Maximize your economic and item gains.", cooldownTime: 0.0, color: "#ffd700",
                upgrades: {
                    "branch_progression": {
                        name: "Treasure Hunter", maxRank: 5,
                        rankDescs: [
                            "Tier 6 (Rare Ping): [Passive] Audio/Visual notification when rare loot is nearby.",
                            "Tier 7 (Hidden Loot): [Passive] Reveal buried caches and invisible chests.",
                            "Tier 8 (Rarity Colors): [Passive] Loot models are color-coded in the world based on rarity.",
                            "Tier 9 (Legendary Sense): [Passive] Detect high-tier (Gold/Diamond) items through solid walls.",
                            "Tier 10 (Drop Prediction): [Passive] View the exact loot drop table and chances above an enemy's head before killing them."
                        ]
                    }
                }
            },
            "arcane_branch": {
                name: "Arcane", icon: "🔮", desc: "Environment System: See the magical threads holding the world together.", cooldownTime: 45.0, color: "#8800ff",
                upgrades: {
                    "branch_progression": {
                        name: "Arcane Vision", maxRank: 5,
                        rankDescs: [
                            "Tier 6 (Magic Detection): [Passive] Highlight magical objects, wards, and spells.",
                            "Tier 7 (Trap Vision): [Passive] Clearly outlines the hitboxes of all traps.",
                            "Tier 8 (Illusion Break): [Passive] Reveal fake terrain and dispel visual illusions.",
                            "Tier 9 (Energy Mapping): [Passive] Show system connections (e.g., wires connecting a lever to a door).",
                            "Tier 10 (Reality Layer): [Active] Shift your vision to reveal a hidden dimensional layer of the world."
                        ]
                    }
                }
            }
        }
    },
    tinkerer: {
        core: {
            "tinkerer_base": {
                name: "Tinkerer Core", icon: "🧰", desc: "Control devices, traps, and environmental tools.", cooldownTime: 5.0, color: "#ff8800",
                upgrades: {
                    "core_progression": {
                        name: "Core Engineering", maxRank: 5,
                        rankDescs: [
                            "Tier 1 (Fast Interaction): [Passive] 50% faster use/interaction speed with the world.",
                            "Tier 2 (Basic Traps): [Active] Deploy a basic trap entity.",
                            "Tier 3 (Devices): [Active] Deploy simple automated machines (e.g., decoys).",
                            "Tier 4 (Efficiency): [Passive] Reduced material cost for crafting and deploying.",
                            "Tier 5 (Multi Deploy): [Passive] Allows multiple active devices to be deployed simultaneously."
                        ]
                    }
                }
            }
        },
        branches: {
            "engineer_branch": {
                name: "Engineer", icon: "🏗️", desc: "Construct System: Build automated defenses and assistants.", cooldownTime: 25.0, color: "#aaaaaa",
                upgrades: {
                    "branch_progression": {
                        name: "Heavy Constructs", maxRank: 5,
                        rankDescs: [
                            "Tier 6 (Turret): [Active] Deploy an auto-targeting defensive unit.",
                            "Tier 7 (Shield Dome): [Active] Deploy a generator that projects a large area-protection shield.",
                            "Tier 8 (Drone): [Active] Deploy a floating AI assistant that follows and helps you.",
                            "Tier 9 (Linked Grid): [Passive] Deployed devices share power, buffing each other when placed nearby.",
                            "Tier 10 (Mobile Base): [Active] Deploy a massive, slowly moving structure with heavy utility."
                        ]
                    }
                }
            },
            "saboteur_branch": {
                name: "Saboteur", icon: "💣", desc: "Disruption System: Control the battlefield through destruction.", cooldownTime: 15.0, color: "#ff2222",
                upgrades: {
                    "branch_progression": {
                        name: "Demolitions", maxRank: 5,
                        rankDescs: [
                            "Tier 6 (Remote Trigger): [Active] Detonate traps manually from a distance.",
                            "Tier 7 (Chain Reaction): [Passive] Explosions spread to nearby traps or volatile environment objects.",
                            "Tier 8 (Disable): [Active] Shoot a scrambler that shuts down enemy technology/magic.",
                            "Tier 9 (Hazard Control): [Active] Convert regular terrain into hazardous traps.",
                            "Tier 10 (Shutdown Field): [Active] Drop an EMP field that disables all enemy systems and abilities."
                        ]
                    }
                }
            }
        }
    },
    agrarian: {
        core: {
            "agrarian_base": {
                name: "Agrarian Core", icon: "🌾", desc: "Master the earth to control crop growth and foraging yields.", cooldownTime: 5.0, color: "#33aa33",
                upgrades: {
                    "core_progression": {
                        name: "Core Farming", maxRank: 5,
                        rankDescs: [
                            "Tier 1 (Green Thumb): [Passive] Gather wild plants and wood 50% faster.",
                            "Tier 2 (Sower): [Active] Unlocks the ability to plant seeds in claimed land.",
                            "Tier 3 (Seed Recovery): [Passive] Harvesting crops guarantees a seed is returned.",
                            "Tier 4 (Cross-Pollination): [Active] Combine different seeds to grow hybrid or rare crops.",
                            "Tier 5 (Nature's Rhythm): [Passive] Radiate an aura that accelerates crop growth around you."
                        ]
                    }
                }
            }
        },
        branches: {
            "harvester_branch": {
                name: "Harvester", icon: "🌿", desc: "Foraging System: Plunder the wild for rare organic materials.", cooldownTime: 0.0, color: "#55cc55",
                upgrades: {
                    "branch_progression": {
                        name: "Wild Gathering", maxRank: 5,
                        rankDescs: [
                            "Tier 6 (Bountiful Forage): [Passive] Higher chance for rare drops from trees and bushes.",
                            "Tier 7 (Herb Tracking): [Passive] Rare herbs permanently appear on your minimap.",
                            "Tier 8 (Double Yield): [Passive] Gathering in the wild yields twice as many materials.",
                            "Tier 9 (Hidden Groves): [Passive] Reveal hidden nature grottos on the world map.",
                            "Tier 10 (Auto-Harvest Aura): [Passive] Automatically collect nearby wild forageables as you walk."
                        ]
                    }
                }
            },
            "cultivator_branch": {
                name: "Cultivator", icon: "🚜", desc: "Domestic Farming System: Automate and maximize crop production.", cooldownTime: 0.0, color: "#aaff00",
                upgrades: {
                    "branch_progression": {
                        name: "Agriculture", maxRank: 5,
                        rankDescs: [
                            "Tier 6 (Automated Sprinklers): [Active] Craft and deploy sprinklers to water adjacent tiles.",
                            "Tier 7 (Giant Crops): [Passive] Planting 3x3 grids of identical seeds merges them into massive, high-yield crops.",
                            "Tier 8 (Disease Immunity): [Passive] Your crops can no longer decay or catch blight.",
                            "Tier 9 (Instant Fertilizer): [Active] Apply specialized compost that forces immediate crop maturation.",
                            "Tier 10 (Bountiful Harvest): [Passive] Base farm yields are permanently tripled."
                        ]
                    }
                }
            },
            "ranger_branch": {
                name: "Ranger", icon: "🏹", desc: "Flora Combat System: Weaponize your crops against enemies.", cooldownTime: 12.0, color: "#228822",
                upgrades: {
                    "branch_progression": {
                        name: "Wild Combat", maxRank: 5,
                        rankDescs: [
                            "Tier 6 (Spore Pods): [Active] Throw an explosive mushroom that poisons enemies.",
                            "Tier 7 (Tangleweeds): [Active] Summon grasping vines to root enemies in place.",
                            "Tier 8 (Raw Consumption): [Active] Eat raw crops instantly for massive burst healing.",
                            "Tier 9 (Briar Trap): [Active] Place permanent thorny traps that bleed enemies.",
                            "Tier 10 (Summon Treant): [Active] Awaken a massive tree to fight alongside you for 30 seconds."
                        ]
                    }
                }
            }
        }
    },
    forgemaster: {
        core: {
            "forgemaster_base": {
                name: "Forgemaster Core", icon: "⚒️", desc: "Master metalwork to enhance weapons, armor, and mining.", cooldownTime: 0.0, color: "#888888",
                upgrades: {
                    "core_progression": {
                        name: "Core Smithing", maxRank: 5,
                        rankDescs: [
                            "Tier 1 (Miner's Eye): [Passive] Double ore yields from mining rocks.",
                            "Tier 2 (Basic Repair): [Active] Repair equipped items using raw materials anywhere in the field.",
                            "Tier 3 (Smelting Efficiency): [Passive] Refine ores into ingots instantly with no failure rate.",
                            "Tier 4 (Tempering): [Active] Temporarily buff a weapon's damage by sharpening it.",
                            "Tier 5 (Masterwork): [Passive] Crafting any item has a 10% chance to roll an extra stat line."
                        ]
                    }
                }
            }
        },
        branches: {
            "armorer_branch": {
                name: "Armorer", icon: "🛡️", desc: "Defense System: Craft impenetrable barriers.", cooldownTime: 30.0, color: "#aaaacc",
                upgrades: {
                    "branch_progression": {
                        name: "Heavy Plating", maxRank: 5,
                        rankDescs: [
                            "Tier 6 (Heavy Plating): [Passive] Craft armor that grants immunity to knockbacks.",
                            "Tier 7 (Shield Block): [Passive] Upgrade shield block values permanently.",
                            "Tier 8 (Reinforced Walls): [Passive] Town structures you build have triple health.",
                            "Tier 9 (Heavy Armor Master): [Passive] Removes the movement speed penalty from heavy armor.",
                            "Tier 10 (Invulnerable Plating): [Active] Briefly render your armor completely impenetrable."
                        ]
                    }
                }
            },
            "weaponsmith_branch": {
                name: "Weaponsmith", icon: "⚔️", desc: "Offense System: Forge lethal instruments of war.", cooldownTime: 0.0, color: "#ff6666",
                upgrades: {
                    "branch_progression": {
                        name: "Lethal Edges", maxRank: 5,
                        rankDescs: [
                            "Tier 6 (Honed Edge): [Passive] Weapons you craft have +10% Critical Strike Chance.",
                            "Tier 7 (Elemental Coat): [Active] Coat your weapon in fire or ice for elemental damage.",
                            "Tier 8 (Armor Piercer): [Passive] Your crafted weapons ignore 25% of enemy armor.",
                            "Tier 9 (Bleeding Edge): [Passive] Your crafted weapons apply permanent Bleed stacks.",
                            "Tier 10 (Forged Relic): [Passive] Crafting weapons guarantees a high-tier stat roll."
                        ]
                    }
                }
            },
            "scrapper_branch": {
                name: "Scrapper", icon: "♻️", desc: "Salvage System: Reduce the world to base materials.", cooldownTime: 0.0, color: "#cc9955",
                upgrades: {
                    "branch_progression": {
                        name: "Recycling", maxRank: 5,
                        rankDescs: [
                            "Tier 6 (Deconstruct): [Active] Break down old weapons and armor into raw materials.",
                            "Tier 7 (Salvage): [Passive] Chance to salvage rare ingots from defeated mechanical enemies.",
                            "Tier 8 (Free Repair): [Passive] Your equipment repairs itself slowly over time.",
                            "Tier 9 (Recycled Traps): [Passive] Pick up and reuse traps placed by other players or enemies.",
                            "Tier 10 (Jury-Rigged Mech): [Active] Assemble a temporary, rideable combat suit from scrap."
                        ]
                    }
                }
            }
        }
    },
    artisan: {
        core: {
            "artisan_base": {
                name: "Artisan Core", icon: "🧵", desc: "Manipulate trade, inventory, and non-combat wearable stats.", cooldownTime: 0.0, color: "#ff88ff",
                upgrades: {
                    "core_progression": {
                        name: "Core Tailoring", maxRank: 5,
                        rankDescs: [
                            "Tier 1 (Expanded Pockets): [Passive] Unlocks 10 extra inventory slots.",
                            "Tier 2 (Lightweight Weave): [Passive] Equipped armor no longer reduces stamina regeneration.",
                            "Tier 3 (Dyeing): [Active] Change the color of gear (certain colors subtly reduce enemy aggro).",
                            "Tier 4 (Haggler): [Passive] NPC shops sell for 10% less and buy for 10% more.",
                            "Tier 5 (Pocket Dimension): [Active] Access your town storage chest remotely from the wilderness."
                        ]
                    }
                }
            }
        },
        branches: {
            "merchant_branch": {
                name: "Merchant", icon: "⚖️", desc: "Trade System: Control the flow of coins across the server.", cooldownTime: 0.0, color: "#ffcc00",
                upgrades: {
                    "branch_progression": {
                        name: "Commerce", maxRank: 5,
                        rankDescs: [
                            "Tier 6 (Player Shop): [Passive] Set up automated player-shops that don't charge tax.",
                            "Tier 7 (Market History): [Active] See server-wide price histories for specific items.",
                            "Tier 8 (NPC Hire): [Active] Hire an NPC to sell your goods while you are offline.",
                            "Tier 9 (Global Trade): [Passive] Sell items globally from any location.",
                            "Tier 10 (Monopoly): [Passive] Receive a percentage of all NPC shop transactions in your region."
                        ]
                    }
                }
            },
            "shadow_weaver_branch": {
                name: "Shadow-Weaver", icon: "🥷", desc: "Stealth Fabric System: Become the wind.", cooldownTime: 0.0, color: "#444466",
                upgrades: {
                    "branch_progression": {
                        name: "Invisibility", maxRank: 5,
                        rankDescs: [
                            "Tier 6 (Muffled Steps): [Passive] Craft boots that completely silence your footsteps.",
                            "Tier 7 (Still Concealment): [Passive] Craft cloaks that grant invisibility when standing perfectly still.",
                            "Tier 8 (Trap Immune): [Passive] Your woven fabrics no longer trigger pressure plates.",
                            "Tier 9 (Shadow Cloak): [Active] Activate a woven cloak to instantly drop all enemy aggro.",
                            "Tier 10 (Intangible Weave): [Passive] Ignore physical collision with non-boss enemies."
                        ]
                    }
                }
            },
            "enchanter_branch": {
                name: "Enchanter", icon: "✨", desc: "Magic Thread System: Sew power directly into garments.", cooldownTime: 0.0, color: "#ee88ff",
                upgrades: {
                    "branch_progression": {
                        name: "Magical Garments", maxRank: 5,
                        rankDescs: [
                            "Tier 6 (HP Thread): [Passive] Sew magical threads into clothing to grant extra Max HP.",
                            "Tier 7 (MP Thread): [Passive] Sew magical threads to grant massive Mana regeneration.",
                            "Tier 8 (Resist Thread): [Passive] Grant immunity to specific elemental statuses (Fire/Ice/Poison).",
                            "Tier 9 (Reflect Thread): [Passive] Craft cloaks that passively reflect 20% of incoming damage.",
                            "Tier 10 (Soulbound Gear): [Passive] Craft items that can never be dropped on death."
                        ]
                    }
                }
            }
        }
    },
    publican: {
        core: {
            "publican_base": {
                name: "Publican Core", icon: "🍻", desc: "Control food, stamina regeneration, and social hub mechanics.", cooldownTime: 0.0, color: "#cc7722",
                upgrades: {
                    "core_progression": {
                        name: "Core Hospitality", maxRank: 5,
                        rankDescs: [
                            "Tier 1 (Iron Stomach): [Passive] Raw or uncooked food no longer causes sickness.",
                            "Tier 2 (Basic Cooking): [Active] Combine raw ingredients to make meals that restore massive Hunger/Stamina.",
                            "Tier 3 (Preservation): [Passive] Food in your inventory degrades and spoils 90% slower.",
                            "Tier 4 (Rested Buff): [Passive] Sleeping in a bed grants a 1-hour XP and damage buff.",
                            "Tier 5 (Tavern Hearth): [Passive] Standing idle in town passively regenerates health and mana for you and nearby allies."
                        ]
                    }
                }
            }
        },
        branches: {
            "brewmaster_branch": {
                name: "Brewmaster", icon: "🍺", desc: "Liquid Buff System: Brew potent, high-risk concoctions.", cooldownTime: 0.0, color: "#ddaa33",
                upgrades: {
                    "branch_progression": {
                        name: "Brewing", maxRank: 5,
                        rankDescs: [
                            "Tier 6 (Stat Brews): [Active] Craft drinks that give massive, short-term combat buffs (e.g., +50% attack speed).",
                            "Tier 7 (Speed Brews): [Active] Craft drinks that grant insane movement speed with a subsequent hangover debuff.",
                            "Tier 8 (Party Keg): [Active] Drop a keg that buffs the entire party simultaneously.",
                            "Tier 9 (Element Brew): [Active] Drink to gain total immunity to elemental damage for 30 seconds.",
                            "Tier 10 (Liquid Courage): [Passive] While under the effect of alcohol, you cannot be staggered or knocked down."
                        ]
                    }
                }
            },
            "chef_branch": {
                name: "Chef", icon: "🍲", desc: "Feast System: Craft meals that alter permanent state.", cooldownTime: 0.0, color: "#ff8855",
                upgrades: {
                    "branch_progression": {
                        name: "Culinary Arts", maxRank: 5,
                        rankDescs: [
                            "Tier 6 (Banquet): [Active] Lay out a feast that completely restores the party's vitals.",
                            "Tier 7 (Max HP Meal): [Passive] Craft high-tier meals that permanently increase a player's Max HP until they die.",
                            "Tier 8 (Max Stamina Meal): [Passive] Craft meals that permanently increase Max Stamina.",
                            "Tier 9 (Hero's Feast): [Active] Provide a meal granting 24-hour immunity to all debuffs.",
                            "Tier 10 (Ambrosia): [Active] Craft the food of the gods, granting instant leveling and max stats."
                        ]
                    }
                }
            },
            "information_broker_branch": {
                name: "Info Broker", icon: "📜", desc: "Social Economy System: Rule the rumor mill.", cooldownTime: 0.0, color: "#55bbff",
                upgrades: {
                    "branch_progression": {
                        name: "Networking", maxRank: 5,
                        rankDescs: [
                            "Tier 6 (Patrons): [Passive] Running a tavern attracts NPC Patrons who generate passive coin income.",
                            "Tier 7 (Boss Rumors): [Active] Pay Patrons to reveal active boss locations on your world map.",
                            "Tier 8 (Loot Rumors): [Active] Pay Patrons to reveal the location of legendary dropped items.",
                            "Tier 9 (Hidden Quests): [Passive] Access exclusive, highly lucrative quests from shady NPCs.",
                            "Tier 10 (Black Market): [Active] Access an exclusive shop selling illegal, overpowered server items."
                        ]
                    }
                }
            }
        }
    },
    architect: {
        core: {
            "architect_base": {
                name: "Architect Core", icon: "🏛️", desc: "Dominate town building, land ownership, and passive income.", cooldownTime: 0.0, color: "#aa88cc",
                upgrades: {
                    "core_progression": {
                        name: "Core Infrastructure", maxRank: 5,
                        rankDescs: [
                            "Tier 1 (Surveyor): [Passive] Buying land plots costs 25% less.",
                            "Tier 2 (Quick Build): [Passive] Contributing materials to a construction site fills the progress bar twice as fast.",
                            "Tier 3 (Resource Silo): [Passive] Buildings you own have a shared, massive resource storage pool.",
                            "Tier 4 (Sturdy Foundations): [Passive] Buildings you own have 2x maximum Health Points.",
                            "Tier 5 (Advanced Blueprints): [Passive] Unlocks the ability to build multi-story structures or specialized guild halls."
                        ]
                    }
                }
            }
        },
        branches: {
            "landlord_branch": {
                name: "Landlord", icon: "📜", desc: "Property System: Monetize the town's expansion.", cooldownTime: 0.0, color: "#ffd700",
                upgrades: {
                    "branch_progression": {
                        name: "Real Estate", maxRank: 5,
                        rankDescs: [
                            "Tier 6 (Tax Collection): [Passive] Passively collect property tax (coins) from players who buy land next to yours.",
                            "Tier 7 (Merge Plots): [Active] Merge adjacent owned plots into single, massive mega-plots.",
                            "Tier 8 (Eviction Notice): [Active] Forcefully buy out abandoned plots at half market value.",
                            "Tier 9 (Town Portal): [Active] Build permanent fast-travel nodes on your properties.",
                            "Tier 10 (Mayor Status): [Passive] Receive a percentage of all land sales in the server."
                        ]
                    }
                }
            },
            "fortifier_branch": {
                name: "Fortifier", icon: "🧱", desc: "Defense System: Turn the town into a fortress.", cooldownTime: 0.0, color: "#777777",
                upgrades: {
                    "branch_progression": {
                        name: "Strongholds", maxRank: 5,
                        rankDescs: [
                            "Tier 6 (Defense Tower): [Active] Build automated defense towers that shoot hostile mobs.",
                            "Tier 7 (Reinforced Gate): [Active] Build massive gates with 10x standard wall HP.",
                            "Tier 8 (Safe Zone Expansion): [Passive] Expand the PvP/PvE 'Safe Zone' radius to cover your properties.",
                            "Tier 9 (Artillery): [Active] Build long-range cannons to bombard field bosses from town.",
                            "Tier 10 (Impenetrable Fortress): [Passive] Your structures become entirely immune to siege damage."
                        ]
                    }
                }
            },
            "industrialist_branch": {
                name: "Industrialist", icon: "⚙️", desc: "Automation System: Let the machines do the work.", cooldownTime: 0.0, color: "#aaaaaa",
                upgrades: {
                    "branch_progression": {
                        name: "Industry", maxRank: 5,
                        rankDescs: [
                            "Tier 6 (Lumber Mill): [Active] Build a structure that automatically generates wood over time.",
                            "Tier 7 (Mine Shaft): [Active] Build a structure that automatically generates stone and ore.",
                            "Tier 8 (Conveyor Belt): [Active] Automatically move items from mills/mines directly into your storage.",
                            "Tier 9 (Auto-Crafter): [Active] Set a building to automatically craft base materials into complex items.",
                            "Tier 10 (Factory Complex): [Passive] All industrial buildings work 300% faster."
                        ]
                    }
                }
            }
        }
    }
};

export const FAMILIAR_TREE_DATA: Record<string, Record<string, Record<string, any>>> = {
    apocalyptic_swarm: {
        core: {
            "swarm_base": {
                name: "Apocalyptic Swarm", icon: "🩸", desc: "Summon a permanent swarm of blood-leeches.", cooldownTime: 0.0, color: "#aa0000",
                upgrades: {
                    "endless_hunger": {
                        name: "Endless Hunger", maxRank: 5,
                        rankDescs: [
                            "Tier 1: [Passive] The swarm bites enemies within 3 units, applying minor Bleed.",
                            "Tier 2: [Passive] You heal for 20% of all Bleed damage dealt by the swarm.",
                            "Tier 3: [Passive] The swarm's passive radius increases to 5 units.",
                            "Tier 4: [Passive] Enemies affected by the swarm have their healing received reduced by 50%.",
                            "Tier 5: [Passive] The swarm grants you a permanent lifesteal aura."
                        ]
                    }
                }
            }
        },
        branches: {
            "devour_branch": {
                name: "Devour", icon: "🌪️", desc: "Command the swarm to devour a target area.", cooldownTime: 20.0, color: "#ff0000",
                upgrades: {
                    "feast_of_blood": {
                        name: "Feast of Blood", maxRank: 5,
                        rankDescs: [
                            "Tier 6 (Command): [Active] Detach the swarm to a target area for 8s, heavily Slowing enemies inside.",
                            "Tier 7 (Shred): [Active] Enemies inside the Devour zone have their armor continuously shredded.",
                            "Tier 8 (Gluttony): [Active] The Slow effect inside the Devour zone becomes a Root if enemies stay for 3s.",
                            "Tier 9 (Siphon): [Active] Devour zone drains mana from enemies, feeding it back to you.",
                            "Tier 10 (Carnage): [EVOLUTION] Enemies killed inside the Devour zone explode into a massive burst of healing for you and your allies."
                        ]
                    }
                }
            }
        }
    },
    orbital_arbiter: {
        core: {
            "arbiter_base": {
                name: "Orbital Arbiter", icon: "👁️", desc: "A floating eye that executes cosmic authority.", cooldownTime: 0.0, color: "#00aaff",
                upgrades: {
                    "cosmic_judgment": {
                        name: "Cosmic Judgment", maxRank: 5,
                        rankDescs: [
                            "Tier 1: [Passive] The Arbiter fires a laser at your target every 5 seconds.",
                            "Tier 2: [Passive] Laser damage ignores 30% of enemy armor.",
                            "Tier 3: [Passive] Fire rate increased to every 3.5 seconds.",
                            "Tier 4: [Passive] The laser arcs to one additional nearby enemy.",
                            "Tier 5: [Passive] Arbiter lasers interrupt and silence targets for 0.5s."
                        ]
                    }
                }
            }
        },
        branches: {
            "annihilation_branch": {
                name: "Annihilation", icon: "☄️", desc: "Channel absolute destruction.", cooldownTime: 30.0, color: "#0055ff",
                upgrades: {
                    "focused_beam": {
                        name: "Focused Beam", maxRank: 5,
                        rankDescs: [
                            "Tier 6 (Lock-on): [Active] The Arbiter fires a continuous, heavy beam for 3s, tracking the target.",
                            "Tier 7 (Scorched Earth): [Active] The beam leaves a trail of cosmic fire on the ground.",
                            "Tier 8 (Vulnerability): [Active] Targets hit by the continuous beam take 20% more damage from all sources.",
                            "Tier 9 (Width Increase): [Active] The beam's radius is tripled, hitting multiple enemies in a line.",
                            "Tier 10 (Erased): [EVOLUTION] If the beam reduces an enemy below 10% HP, they are instantly disintegrated."
                        ]
                    }
                }
            }
        }
    },
    void_servant: {
        core: {
            "shade_base": {
                name: "Void Servant", icon: "🌌", desc: "A shade that melds with your shadow.", cooldownTime: 0.0, color: "#440088",
                upgrades: {
                    "shadow_meld": {
                        name: "Shadow Meld", maxRank: 5,
                        rankDescs: [
                            "Tier 1: [Passive] The servant grants you +10% movement speed while out of combat.",
                            "Tier 2: [Passive] Completely muffles your footsteps.",
                            "Tier 3: [Passive] Passively grants a 15% dodge chance against physical attacks.",
                            "Tier 4: [Passive] If you stand still for 3 seconds, you turn completely invisible.",
                            "Tier 5: [Passive] The servant automatically absorbs the first instance of fatal damage every 5 minutes."
                        ]
                    }
                }
            }
        },
        branches: {
            "legion_branch": {
                name: "Legion of Shadows", icon: "👥", desc: "Split your presence across the battlefield.", cooldownTime: 25.0, color: "#8800ff",
                upgrades: {
                    "decoy_master": {
                        name: "Decoy Master", maxRank: 5,
                        rankDescs: [
                            "Tier 6 (Split): [Active] The Shade steps out and splits into 3 decoys that grab enemy aggro.",
                            "Tier 7 (Explosive Fakes): [Active] Decoys explode for void damage when destroyed.",
                            "Tier 8 (Mirror Strike): [Active] Decoys mimic your basic attacks at 10% damage.",
                            "Tier 9 (Mass Confusion): [Active] Spawns 5 decoys instead of 3, and applying Blindness when they explode.",
                            "Tier 10 (Omnipresence): [EVOLUTION] You can instantly swap places with any active decoy without breaking stealth."
                        ]
                    }
                }
            }
        }
    },
    shadow_monarch: {
        core: {
            "monarch_base": {
                name: "Sovereign's Legion", icon: "👑", desc: "Extract the souls of the slain to build your army.", cooldownTime: 0.0, color: "#111111",
                upgrades: {
                    "shadow_capacity": {
                        name: "Shadow Capacity", maxRank: 5,
                        rankDescs: [
                            "Tier 1: [Passive] Unlocks the ability to hold 3 Shadow Capacity.",
                            "Tier 2: [Passive] Shadow Capacity increased to 5.",
                            "Tier 3: [Passive] Shadow Capacity increased to 10.",
                            "Tier 4: [Passive] Shadow Capacity increased to 20.",
                            "Tier 5: [Passive] Unlocks the ability to extract Elite and Boss enemies."
                        ]
                    }
                }
            }
        },
        branches: {
            "arise_branch": {
                name: "Arise", icon: "🧟", desc: "Summon your stored shadows to overwhelm the enemy.", cooldownTime: 60.0, color: "#330066",
                upgrades: {
                    "necromancy": {
                        name: "Necromancy", maxRank: 5,
                        rankDescs: [
                            "Tier 6 (Extract): [Active] Extract the soul of a recently slain enemy to add it to your legion.",
                            "Tier 7 (Summon): [Active] Summons your stored army for 15 seconds to fight for you.",
                            "Tier 8 (Vanguard): [Passive] Summoned shadows inherit 50% of their original HP and damage.",
                            "Tier 9 (Bloodlust): [Active] Summoned shadows gain +100% attack speed and movement speed.",
                            "Tier 10 (Absolute Command): [EVOLUTION] Shadow duration is doubled, and they heal you for a portion of the damage they deal."
                        ]
                    }
                }
            }
        }
    },
    dragon_hoarder: {
        core: {
            "stash_base": {
                name: "Polymorphic Hoarder", icon: "🐉", desc: "A shape-shifting dragon with an infinite stomach.", cooldownTime: 0.0, color: "#ff8800",
                upgrades: {
                    "infinite_pockets": {
                        name: "Infinite Pockets", maxRank: 5,
                        rankDescs: [
                            "Tier 1: [Passive] The familiar acts as a portable chest with 20 slots.",
                            "Tier 2: [Passive] Automatically loots nearby dropped items into its stomach.",
                            "Tier 3: [Passive] Inventory size increased to 50 slots.",
                            "Tier 4: [Passive] Allows remote access to your Town Storage chest from anywhere.",
                            "Tier 5: [Passive] Items stored inside the dragon never spoil or degrade."
                        ]
                    }
                }
            }
        },
        branches: {
            "true_form_branch": {
                name: "True Form", icon: "🔥", desc: "The hoarder sheds its disguise.", cooldownTime: 120.0, color: "#ffaa00",
                upgrades: {
                    "dragon_wrath": {
                        name: "Dragon Wrath", maxRank: 5,
                        rankDescs: [
                            "Tier 6 (Unleash): [Active] The familiar transforms into a massive Dragon for 15 seconds.",
                            "Tier 7 (Scales): [Active] The Dragon form draws all enemy aggro and has massive defense.",
                            "Tier 8 (Tail Swipe): [Active] Replaces your hotbar with Dragon controls. Unlocks an AoE Tail Swipe knockback.",
                            "Tier 9 (Breath Weapon): [Active] Unlocks Dragon Breath, dealing massive continuous fire damage.",
                            "Tier 10 (Hoarder's Greed): [EVOLUTION] If the Dragon kills an enemy, it permanently increases its Breath Weapon damage by 1% (Caps at 100%)."
                        ]
                    }
                }
            }
        }
    },
    symbiotic_spirit: {
        core: {
            "pixie_base": {
                name: "Symbiotic Spirit", icon: "🧚", desc: "A glowing orb of pure natural energy that supports you.", cooldownTime: 0.0, color: "#00ffaa",
                upgrades: {
                    "cleansing_light": {
                        name: "Cleansing Light", maxRank: 5,
                        rankDescs: [
                            "Tier 1: [Passive] Passively restores a small amount of MP every 5 seconds.",
                            "Tier 2: [Passive] Automatically removes one negative status effect every 10 seconds.",
                            "Tier 3: [Passive] MP restoration doubled.",
                            "Tier 4: [Passive] The cleanse effect is upgraded to an AoE, affecting nearby allies.",
                            "Tier 5: [Passive] Grants a constant +15% boost to all healing received."
                        ]
                    }
                }
            }
        },
        branches: {
            "lifeline_branch": {
                name: "Lifeline", icon: "💖", desc: "The spirit sacrifices itself to save you.", cooldownTime: 90.0, color: "#ff66cc",
                upgrades: {
                    "ultimate_sacrifice": {
                        name: "Ultimate Sacrifice", maxRank: 5,
                        rankDescs: [
                            "Tier 6 (Sacrifice): [Active] The spirit dissipates, instantly restoring 50% of your Max HP.",
                            "Tier 7 (Over-shield): [Active] Also grants a shield equal to 30% of your Max HP.",
                            "Tier 8 (Clean Slate): [Active] Instantly wipes all cooldowns for your utility skills.",
                            "Tier 9 (Rebirth): [Passive] If you take fatal damage, the Lifeline triggers automatically.",
                            "Tier 10 (Phoenix): [EVOLUTION] The spirit revives itself after only 30 seconds instead of the full cooldown, and restores you to 100% HP."
                        ]
                    }
                }
            }
        }
    },
    astral_reflection: {
        core: {
            "gemini_base": {
                name: "Astral Reflection", icon: "🪞", desc: "A perfect, translucent clone of yourself.", cooldownTime: 0.0, color: "#aaddff",
                upgrades: {
                    "mimicry": {
                        name: "Mimicry", maxRank: 5,
                        rankDescs: [
                            "Tier 1: [Passive] The clone mimics your basic attacks, dealing 10% of your damage.",
                            "Tier 2: [Passive] The clone mimics your equipped weapon and armor visuals.",
                            "Tier 3: [Passive] Clone damage increased to 20%.",
                            "Tier 4: [Passive] The clone also mimics your non-ultimate combat skills.",
                            "Tier 5: [Passive] Clone damage increased to 30%."
                        ]
                    }
                }
            }
        },
        branches: {
            "transposition_branch": {
                name: "Transposition", icon: "🔁", desc: "Instantly swap positions with your reflection.", cooldownTime: 15.0, color: "#00aaff",
                upgrades: {
                    "spatial_swap": {
                        name: "Spatial Swap", maxRank: 5,
                        rankDescs: [
                            "Tier 6 (Swap): [Active] Instantly swap places with your clone. Drops all enemy aggro.",
                            "Tier 7 (Confusion): [Active] Swapping stuns all enemies near the clone's previous location for 2s.",
                            "Tier 8 (Vanish): [Active] You turn invisible for 2 seconds after swapping.",
                            "Tier 9 (Twin Strike): [Active] Your next attack after a swap is guaranteed to Critical Hit.",
                            "Tier 10 (Quantum Entanglement): [EVOLUTION] You can swap while crowd-controlled, instantly transferring the stun/root to the clone."
                        ]
                    }
                }
            }
        }
    },
    primal_beast: {
        core: {
            "beast_base": {
                name: "Primal Beast", icon: "🐻", desc: "A physical animal companion that tanks and distracts.", cooldownTime: 0.0, color: "#884422",
                upgrades: {
                    "wild_companion": {
                        name: "Wild Companion", maxRank: 5,
                        rankDescs: [
                            "Tier 1: [Passive] Summons a Wolf. It has its own HP and attacks enemies automatically.",
                            "Tier 2: [Passive] The beast gains a Taunt aura, pulling aggro from you.",
                            "Tier 3: [Passive] Evolves into a Dire Wolf. HP and Damage doubled.",
                            "Tier 4: [Passive] The beast gains 50% damage reduction against AoE attacks.",
                            "Tier 5: [Passive] Evolves into an Armored Bear. Max HP tripled, gains massive knockback immunity."
                        ]
                    }
                }
            }
        },
        branches: {
            "kill_command_branch": {
                name: "Kill Command", icon: "🎯", desc: "Direct your beast to eliminate a specific threat.", cooldownTime: 12.0, color: "#cc2222",
                upgrades: {
                    "hunters_mark": {
                        name: "Hunter's Mark", maxRank: 5,
                        rankDescs: [
                            "Tier 6 (Sic 'Em): [Active] The beast leaps to your target, dealing heavy physical damage.",
                            "Tier 7 (Maim): [Active] The leap attack applies a deep Bleed stack.",
                            "Tier 8 (Throat Bite): [Active] The leap attack Silence the target for 3 seconds.",
                            "Tier 9 (Frenzy): [Active] The beast attacks 50% faster for 5 seconds after a Kill Command.",
                            "Tier 10 (Alpha Predator): [EVOLUTION] If Kill Command kills the target, the cooldown is reset and the beast heals for 100% of its Max HP."
                        ]
                    }
                }
            }
        }
    },
    radiant_seraph: {
        core: {
            "seraph_base": {
                name: "Radiant Seraph", icon: "👼", desc: "An angelic guardian of pure light.", cooldownTime: 0.0, color: "#ffffee",
                upgrades: {
                    "holy_presence": {
                        name: "Holy Presence", maxRank: 5,
                        rankDescs: [
                            "Tier 1: [Passive] Projects a constant 4-unit aura. Undead/Shadow enemies inside burn.",
                            "Tier 2: [Passive] Allies inside the aura gain +10% defense.",
                            "Tier 3: [Passive] Aura radius increased to 8 units.",
                            "Tier 4: [Passive] Undead/Shadow enemies inside the aura are heavily slowed.",
                            "Tier 5: [Passive] Allies inside the aura cannot be reduced below 1 HP by non-boss attacks."
                        ]
                    }
                }
            }
        },
        branches: {
            "aegis_branch": {
                name: "Aegis", icon: "🛡️", desc: "The Seraph transforms into an impenetrable shield.", cooldownTime: 25.0, color: "#ffffaa",
                upgrades: {
                    "divine_wall": {
                        name: "Divine Wall", maxRank: 5,
                        rankDescs: [
                            "Tier 6 (Wall of Light): [Active] The Seraph turns into a wide wall of light for 5s, blocking projectiles.",
                            "Tier 7 (Repel): [Active] Enemies that touch the wall are violently knocked back.",
                            "Tier 8 (Refraction): [Active] Blocked projectiles are reflected back at the attacker.",
                            "Tier 9 (Enduring Faith): [Active] Wall duration increased to 10 seconds.",
                            "Tier 10 (Bulwark of the Heavens): [EVOLUTION] While the wall is active, you and allies behind it regenerate 10% Max HP per second."
                        ]
                    }
                }
            }
        }
    },
    storm_gryphon: {
        core: {
            "gryphon_base": {
                name: "Storm Gryphon", icon: "🦅", desc: "A majestic avian familiar that controls the wind.", cooldownTime: 0.0, color: "#aaddff",
                upgrades: {
                    "wind_weaver": {
                        name: "Wind Weaver", maxRank: 5,
                        rankDescs: [
                            "Tier 1: [Passive] The Gryphon occasionally shoots razor-wind projectiles at enemies.",
                            "Tier 2: [Passive] Increases your base movement speed by 10% while orbiting.",
                            "Tier 3: [Passive] Razor-wind projectiles now pierce through multiple enemies.",
                            "Tier 4: [Passive] The Gryphon's wings constantly deflect small incoming projectiles.",
                            "Tier 5: [Passive] Unlocks the 'Saddle' mechanic. You can now mount the Gryphon for ground travel."
                        ]
                    }
                }
            }
        },
        branches: {
            "sky_lord_branch": {
                name: "Sky Lord", icon: "🌪️", desc: "Take to the skies and rain down destruction.", cooldownTime: 10.0, color: "#bbddff",
                upgrades: {
                    "aerial_superiority": {
                        name: "Aerial Superiority", maxRank: 5,
                        rankDescs: [
                            "Tier 6 (Liftoff): [Active] While mounted, press Jump to take flight. You ignore all ground hazards and collision.",
                            "Tier 7 (Tailwind): [Passive] Flying speed increases the longer you fly in a straight line.",
                            "Tier 8 (Divebomb): [Active] Crash down to the ground, dealing massive AoE damage and dismounting.",
                            "Tier 9 (Updraft): [Active] Flap wings to push all nearby enemies away and apply Stun.",
                            "Tier 10 (Eye of the Storm): [EVOLUTION] While flying, you generate a massive hurricane below you that constantly sucks in and damages enemies."
                        ]
                    }
                }
            }
        }
    },
    ironclad_behemoth: {
        core: {
            "behemoth_base": {
                name: "Ironclad Behemoth", icon: "🦏", desc: "A massive, heavily armored rhino-construct.", cooldownTime: 0.0, color: "#888888",
                upgrades: {
                    "walking_fortress": {
                        name: "Walking Fortress", maxRank: 5,
                        rankDescs: [
                            "Tier 1: [Passive] The Behemoth blocks enemy pathing, acting as a physical wall.",
                            "Tier 2: [Passive] Grants you a permanent +15% armor buff while orbiting.",
                            "Tier 3: [Passive] The Behemoth automatically counter-attacks enemies that hit it in melee.",
                            "Tier 4: [Passive] Immune to all crowd control and knockback effects.",
                            "Tier 5: [Passive] Unlocks the 'Howdah' mechanic. You can now mount the Behemoth, sharing its massive health pool."
                        ]
                    }
                }
            }
        },
        branches: {
            "siege_engine_branch": {
                name: "Siege Engine", icon: "💥", desc: "Turn your mount into a weapon of mass destruction.", cooldownTime: 15.0, color: "#ff4400",
                upgrades: {
                    "juggernaut": {
                        name: "Juggernaut", maxRank: 5,
                        rankDescs: [
                            "Tier 6 (Trample): [Passive] While mounted, walking over smaller enemies deals heavy physical damage.",
                            "Tier 7 (Battering Ram): [Active] Charge forward, instantly destroying enemy shields and barriers.",
                            "Tier 8 (Passenger Seat): [Passive] Allows one ally to ride the Behemoth with you.",
                            "Tier 9 (Earthshaker): [Active] Stomp the ground, rooting all enemies in a huge radius.",
                            "Tier 10 (Mobile Artillery): [EVOLUTION] The Behemoth equips dual cannons. Your basic attacks while mounted are replaced with explosive AoE shells."
                        ]
                    }
                }
            }
        }
    }
};


export const CATEGORY_MAP: Record<string, { name: string, slot: number }> = {
    "mobility": { name: "Mobility", slot: 2 },
    "tactical": { name: "Tactical", slot: 3 },
    "aoe": { name: "Area of Effect", slot: 4 },
    "ultimate": { name: "Confluence", slot: 5 }
};

export const UTILITY_CATEGORY_MAP: Record<string, { name: string, slot: number }> = {
    "core": { name: "Core Progression", slot: 6 },
    "branches": { name: "Specializations", slot: 7 }
};

export const FAMILIAR_CATEGORY_MAP: Record<string, { name: string, slot: number }> = {
    "core": { name: "Familiar Core", slot: 8 },
    "branches": { name: "Companion Commands", slot: 9 }
};

// --- OPTIMIZATION: FLAT CACHING ---
const FLAT_SKILL_DB: Record<string, any> = {};
const FLAT_CATEGORY_MAP: Record<string, string> = {};

function buildSkillCache() {
    for (const essence in SKILL_TREE_DATA) {
        for (const category in SKILL_TREE_DATA[essence]) {
            for (const skillId in SKILL_TREE_DATA[essence][category]) {
                FLAT_SKILL_DB[skillId] = SKILL_TREE_DATA[essence][category][skillId];
                FLAT_CATEGORY_MAP[skillId] = category;
            }
        }
    }
    
    for (const pathway in UTILITY_TREE_DATA) {
        for (const category in UTILITY_TREE_DATA[pathway]) {
            for (const skillId in UTILITY_TREE_DATA[pathway][category]) {
                FLAT_SKILL_DB[skillId] = UTILITY_TREE_DATA[pathway][category][skillId];
                FLAT_CATEGORY_MAP[skillId] = category;
            }
        }
    }

    for (const familiar in FAMILIAR_TREE_DATA) {
        for (const category in FAMILIAR_TREE_DATA[familiar]) {
            for (const skillId in FAMILIAR_TREE_DATA[familiar][category]) {
                FLAT_SKILL_DB[skillId] = FAMILIAR_TREE_DATA[familiar][category][skillId];
                FLAT_CATEGORY_MAP[skillId] = category;
            }
        }
    }
}

buildSkillCache();

export const getSkillDef = (id: string) => {
    return FLAT_SKILL_DB[id] || null;
};

export const getAbilityCategory = (id: string) => {
    return FLAT_CATEGORY_MAP[id] || null;
};