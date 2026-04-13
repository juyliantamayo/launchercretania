/**
 * setup-hardrock.js — Script maestro
 * Ejecutar: cd my-modpack && node setup-hardrock.js
 */
const fs = require("fs");
const path = require("path");
const AdmZip = require(path.join(__dirname, "..", "mc-launcher", "node_modules", "adm-zip"));
const { encryptManifestObject } = require("../mc-launcher/manifest-crypto");

function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }

const ROOT = __dirname;
const MANIFEST_PATH = path.join(ROOT, "manifest.json");
const ENC_PATH = path.join(ROOT, "manifest.enc");

console.log("🔧 HardRock TFC4 — Setup Script\n================================\n");

const HEAVY_CLIENT_MODS = new Set([
  "cretania-physics-mod-3-0-17-mc-1-20-1-forge",
  "cretania-ambientsounds-forge-v6-3-4-mc1-20-1",
  "cretania-enhancedvisuals-forge-v1-8-2-mc1-20-1",
  "cretania-oculus-mc1-20-1-1-8-0",
  "cretania-exposure-1-20-1-1-7-16-forge",
  "cretania-weather2-1-20-1-2-8-3",
  "cretania-auroras-1-20-1-1-6-2",
  "cretania-itemphysic-forge-v1-8-9-mc1-20-1",
  "cretania-sodiumdynamiclights-forge-1-0-10-1-20-1",
  "cretania-reblured-1-20-1-1-3-0",
  "cretania-seamless-loading-screen-2-0-3-1-20-1-forge",
  "cretania-betterthirdperson-forge-1-20-1-9-0",
  "cretania-auto-third-person-forge-1-20-1-2-1",
  "cretania-darkmodeeverywhere-1-20-1-1-2-4",
  "cretania-stylisheffects-v8-0-2-1-20-1-forge",
  "cretania-travelerstitles-1-20-forge-4-0-2",
  "cretania-cleanswing-1-20-1-8",
  "cretania-betterf3-7-0-2-forge-1-20-1",
  "cretania-nof3",
  "cretania-coroutil-forge-1-20-1-1-3-7",
]);

const data = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf-8"));
const orig = data.modpacks[0];

fs.writeFileSync(path.join(ROOT, "manifest.backup.json"), JSON.stringify(data, null, 2));
console.log("✓ Backup: manifest.backup.json");

// --- NORMAL ---
const normalPack = JSON.parse(JSON.stringify(orig));
normalPack.id = "hardrock-normal";
normalPack.name = "HardRock TFC4 — Experiencia Completa";
normalPack.subtitle = "Supervivencia extrema con TerraFirmaCraft + Create + Forge 1.20.1";
normalPack.description = "Modpack hardcore: TFC4, Create, Mekanism, IE y 300+ mods. Shaders y física. Mín 8 GB RAM.";
normalPack.public = true; normalPack.allowedUuids = []; normalPack.allowUserMods = false; normalPack.version = "1.0.0";
normalPack.optionalMods = [];
normalPack.patchNotes = [{ version:"1.0.0", date:"13 de Abril, 2026", categories:[
  { type:"added",title:"Nuevo",icon:"+",entries:[{text:"Lanzamiento oficial en Lucerion"},{text:"Optimizado para 100 jugadores"},{text:"Traducción al español"},{text:"330 mods"}]},
  { type:"improved",title:"Mejorado",icon:"⬆",entries:[{text:"FerriteCore y ModernFix máxima optimización"},{text:"Entity culling para servidores poblados"}]}
]}];

// --- LITE ---
const liteReq = [], liteOpt = [];
for (const mod of orig.mods) {
  if (HEAVY_CLIENT_MODS.has(mod.id)) {
    liteOpt.push({ ...mod,
      name: mod.id.replace(/^cretania-/,"").replace(/-/g," ").replace(/\b\w/g,c=>c.toUpperCase()),
      description: "Visual — desactivado en Lite para ahorrar RAM", default: false
    });
  } else { liteReq.push(mod); }
}

const litePack = JSON.parse(JSON.stringify(orig));
litePack.id = "hardrock-lite";
litePack.name = "HardRock TFC4 — Lite";
litePack.subtitle = "TFC para PCs modestos — Forge 1.20.1";
litePack.description = "Sin shaders, efectos reducidos. Compatible con servidor. 4-6 GB RAM.";
litePack.public = true; litePack.allowedUuids = []; litePack.allowUserMods = false; litePack.version = "1.0.0";
litePack.mods = liteReq; litePack.optionalMods = liteOpt;
litePack.zips = (orig.zips || []).filter(z => z.id !== "shaderpacks");
litePack.patchNotes = [{ version:"1.0.0", date:"13 de Abril, 2026", categories:[
  { type:"added",title:"Nuevo",icon:"+",entries:[{text:"Versión Lite"},{text:"Sin shaders (4-6 GB RAM)"},{text:"100% compatible con servidor"}]},
  { type:"improved",title:"Optimizaciones",icon:"⬆",entries:[{text:"Physics/Weather2/AmbientSounds opcionales"},{text:"Embeddium y EntityCulling en modo rendimiento"}]}
]}];

const newManifest = { formatVersion:2, launcher:data.launcher, modpacks:[normalPack, litePack] };
fs.writeFileSync(MANIFEST_PATH, JSON.stringify(newManifest, null, 2) + "\n");
fs.writeFileSync(ENC_PATH, JSON.stringify(encryptManifestObject(newManifest), null, 2) + "\n");
console.log(`✓ Manifest: Normal=${normalPack.mods.length} mods, Lite=${liteReq.length}+${liteOpt.length} opt`);
console.log("✓ manifest.enc regenerado\n");

// ═══ 2. TRADUCCIONES ═══
const T = {
  "assets/tfc/lang/es_es.json": {"tfc.creative_tab.earth":"TFC: Tierra","tfc.creative_tab.ores":"TFC: Minerales","tfc.creative_tab.rock":"TFC: Roca","tfc.creative_tab.metal":"TFC: Metales","tfc.creative_tab.wood":"TFC: Madera","tfc.creative_tab.food":"TFC: Comida","tfc.creative_tab.flora":"TFC: Flora","tfc.creative_tab.decorations":"TFC: Decoraciones","tfc.creative_tab.misc":"TFC: Varios","tfc.tooltip.temperature":"Temperatura: %s","tfc.tooltip.temperature_celsius":"%s°C","tfc.tooltip.food_expiry_date":"Caduca: %s","tfc.tooltip.food_expiry_never":"Nunca caduca","tfc.tooltip.food_expiry_soon":"¡Caduca pronto!","tfc.tooltip.food_hunger":"Saciedad: %s","tfc.tooltip.food_saturation":"Saturación: %s","tfc.tooltip.food_water":"Agua: %s","tfc.tooltip.nutrition":"Nutrición:","tfc.tooltip.nutrition_grain":"  Granos: %s%%","tfc.tooltip.nutrition_fruit":"  Frutas: %s%%","tfc.tooltip.nutrition_vegetables":"  Verduras: %s%%","tfc.tooltip.nutrition_protein":"  Proteínas: %s%%","tfc.tooltip.nutrition_dairy":"  Lácteos: %s%%","tfc.tooltip.hold_shift_for_nutrition":"Mantén Shift para ver nutrición","tfc.tooltip.item_melts_into":"Se funde en %s a %s°C","tfc.tooltip.fuel_burns_at":"Se quema a %s°C durante %s","tfc.tooltip.metal":"Metal: %s","tfc.tooltip.units":"Unidades: %s","tfc.tooltip.heat":"Calor: %s","tfc.tooltip.very_hot":"§c¡Muy Caliente!","tfc.tooltip.hot":"§eCaliente","tfc.tooltip.warm":"Templado","tfc.tooltip.cold":"Frío","tfc.tooltip.very_cold":"§9Muy Frío","tfc.tooltip.sealed":"§6Sellado","tfc.tooltip.unsealed":"Abierto","tfc.tooltip.anvil":"Yunque","tfc.tooltip.chisel":"Cincel","tfc.tooltip.hammer":"Martillo","tfc.tooltip.saw":"Sierra","tfc.tooltip.knife":"Cuchillo","tfc.tooltip.scythe":"Guadaña","tfc.tooltip.propick":"Pico prospector","tfc.tooltip.javelin":"Jabalina","tfc.tooltip.mace":"Maza","tfc.tooltip.sword":"Espada","tfc.tooltip.axe":"Hacha","tfc.tooltip.pickaxe":"Pico","tfc.tooltip.shovel":"Pala","tfc.tooltip.hoe":"Azada","tfc.jade.bellows":"Fuelle","tfc.jade.bloomery":"Horno de Floración","tfc.jade.blast_furnace":"Alto Horno","tfc.jade.crucible":"Crisol","tfc.jade.firepit":"Fogata","tfc.jade.pit_kiln":"Horno de Pozo","tfc.jade.nest_box":"Nido","tfc.jade.crop":"Cultivo","tfc.jade.anvil":"Yunque","tfc.jade.barrel":"Barril","tfc.jade.loom":"Telar","tfc.jei.category.heating":"Calentamiento","tfc.jei.category.quern":"Molino Manual","tfc.jei.category.scraping":"Raspado","tfc.jei.category.clay_knapping":"Tallado de Arcilla","tfc.jei.category.leather_knapping":"Tallado de Cuero","tfc.jei.category.rock_knapping":"Tallado de Piedra","tfc.jei.category.anvil_working":"Trabajo en Yunque","tfc.jei.category.welding":"Soldadura","tfc.jei.category.casting":"Fundición","tfc.jei.category.loom":"Telar","tfc.jei.category.pot_simple":"Olla (Simple)","tfc.jei.category.pot_soup":"Olla (Sopa)","tfc.jei.category.barrel_sealed":"Barril (Sellado)","tfc.jei.category.bloomery":"Horno de Floración","tfc.jei.category.blast_furnace":"Alto Horno","tfc.jei.category.chisel":"Cincel","tfc.enum.season.january":"Enero","tfc.enum.season.february":"Febrero","tfc.enum.season.march":"Marzo","tfc.enum.season.april":"Abril","tfc.enum.season.may":"Mayo","tfc.enum.season.june":"Junio","tfc.enum.season.july":"Julio","tfc.enum.season.august":"Agosto","tfc.enum.season.september":"Septiembre","tfc.enum.season.october":"Octubre","tfc.enum.season.november":"Noviembre","tfc.enum.season.december":"Diciembre","tfc.enum.season.spring":"Primavera","tfc.enum.season.summer":"Verano","tfc.enum.season.fall":"Otoño","tfc.enum.season.winter":"Invierno","tfc.enum.day.monday":"Lunes","tfc.enum.day.tuesday":"Martes","tfc.enum.day.wednesday":"Miércoles","tfc.enum.day.thursday":"Jueves","tfc.enum.day.friday":"Viernes","tfc.enum.day.saturday":"Sábado","tfc.enum.day.sunday":"Domingo","tfc.enum.heat.warming":"Calentando","tfc.enum.heat.hot":"Caliente","tfc.enum.heat.very_hot":"Muy Caliente","tfc.enum.heat.faint_red":"Rojo Tenue","tfc.enum.heat.dark_red":"Rojo Oscuro","tfc.enum.heat.bright_red":"Rojo Brillante","tfc.enum.heat.orange":"Naranja","tfc.enum.heat.yellow":"Amarillo","tfc.enum.heat.white":"Blanco","tfc.enum.heat.brilliant_white":"Blanco Brillante","tfc.screen.calendar":"Calendario","tfc.screen.nutrition":"Nutrición","tfc.screen.climate":"Clima","tfc.screen.anvil":"Yunque","tfc.screen.barrel":"Barril","tfc.screen.crucible":"Crisol","tfc.screen.firepit":"Fogata","tfc.screen.grill":"Parrilla","tfc.screen.pot":"Olla","tfc.screen.large_vessel":"Vasija Grande","tfc.screen.small_vessel":"Vasija Pequeña","tfc.screen.charcoal_forge":"Fragua de Carbón","tfc.screen.log_pile":"Pila de Troncos","tfc.thirst":"Sed: %s","tfc.field_guide.book_name":"Guía de Campo TFC"},
  "assets/create/lang/es_es.json": {"create.tooltip.holdForDescription":"Mantén [§6SHIFT§r] para más info","create.tooltip.stressImpact":"Impacto de estrés:","create.tooltip.stressImpact.low":"Bajo","create.tooltip.stressImpact.medium":"Medio","create.tooltip.stressImpact.high":"Alto","create.tooltip.stressImpact.overstressed":"§c¡SOBRECARGADO!","create.tooltip.capacity":"Capacidad de estrés:","create.gui.goggles.at_current_speed":"A velocidad actual","create.gui.goggles.too_slow":"Demasiado lento","create.mechanical_press":"Prensa Mecánica","create.mechanical_mixer":"Mezclador Mecánico","create.mechanical_drill":"Taladro Mecánico","create.mechanical_saw":"Sierra Mecánica","create.mechanical_pump":"Bomba Mecánica","create.mechanical_piston":"Pistón Mecánico","create.mechanical_bearing":"Rodamiento Mecánico","create.mechanical_crafter":"Ensamblador Mecánico","create.mechanical_arm":"Brazo Mecánico","create.deployer":"Desplegador","create.basin":"Cuenco","create.depot":"Depósito","create.funnel":"Embudo","create.cogwheel":"Engranaje","create.shaft":"Eje","create.water_wheel":"Rueda Hidráulica","create.steam_engine":"Motor de Vapor","create.belt":"Cinta Transportadora","create.fluid_pipe":"Tubería de Fluido","create.fluid_tank":"Tanque de Fluido","create.spout":"Grifo","create.train_station":"Estación de Tren","create.track":"Vía de Tren","create.wrench":"Llave Inglesa","create.goggles":"Gafas de Ingeniero","create.blaze_burner":"Quemador de Blaze","create.crushing_wheel":"Rueda Trituradora","create.millstone":"Molino de Piedra","create.encased_fan":"Ventilador","create.schematicannon":"Esquemacañón","create.jei.category.mixing":"Mezclado","create.jei.category.pressing":"Prensado","create.jei.category.milling":"Molienda","create.jei.category.crushing":"Triturado","create.jei.category.washing":"Lavado","create.jei.category.filling":"Llenado","create.jei.category.cutting":"Corte","create.jei.category.packing":"Compactado","create.jei.category.sequenced_assembly":"Ensamblaje Secuencial"},
  "assets/mekanism/lang/es_es.json": {"gui.mekanism.energy":"Energía: %s","gui.mekanism.capacity":"Capacidad: %s","gui.mekanism.stored":"Almacenado: %s","gui.mekanism.temperature":"Temperatura: %s","gui.mekanism.on":"Encendido","gui.mekanism.off":"Apagado","gui.mekanism.progress":"Progreso: %s%%","gui.mekanism.input":"Entrada","gui.mekanism.output":"Salida","gui.mekanism.configuration":"Configuración","gui.mekanism.upgrade":"Mejoras","block.mekanism.metallurgic_infuser":"Infusor Metalúrgico","block.mekanism.crusher":"Triturador","block.mekanism.enrichment_chamber":"Cámara de Enriquecimiento","block.mekanism.energized_smelter":"Fundidor Energizado","block.mekanism.purification_chamber":"Cámara de Purificación","block.mekanism.digital_miner":"Minero Digital","block.mekanism.teleporter":"Teletransportador","block.mekanismgenerators.heat_generator":"Generador de Calor","block.mekanismgenerators.solar_generator":"Generador Solar","block.mekanismgenerators.wind_generator":"Generador Eólico","block.mekanismgenerators.fusion_reactor_controller":"Controlador del Reactor de Fusión"},
  "assets/immersiveengineering/lang/es_es.json": {"block.immersiveengineering.coke_oven":"Horno de Coque","block.immersiveengineering.blast_furnace":"Alto Horno","block.immersiveengineering.crusher":"Trituradora","block.immersiveengineering.sawmill":"Aserradero","block.immersiveengineering.refinery":"Refinería","block.immersiveengineering.diesel_generator":"Generador Diésel","block.immersiveengineering.excavator":"Excavadora","block.immersiveengineering.metal_press":"Prensa de Metal","block.immersiveengineering.arc_furnace":"Horno de Arco","block.immersiveengineering.cloche":"Campana de Cultivo","item.immersiveengineering.hammer":"Martillo de Ingeniero","item.immersiveengineering.manual":"Manual del Ingeniero","item.immersiveengineering.revolver":"Revólver","item.immersiveengineering.drill":"Taladro Minero"},
  "assets/farmersdelight/lang/es_es.json": {"block.farmersdelight.stove":"Estufa","block.farmersdelight.cooking_pot":"Olla de Cocina","block.farmersdelight.skillet":"Sartén","block.farmersdelight.cutting_board":"Tabla de Cortar","item.farmersdelight.cabbage":"Repollo","item.farmersdelight.tomato":"Tomate","item.farmersdelight.onion":"Cebolla","item.farmersdelight.rice":"Arroz","item.farmersdelight.vegetable_soup":"Sopa de Verduras","item.farmersdelight.chicken_soup":"Sopa de Pollo","item.farmersdelight.beef_stew":"Estofado de Res","item.farmersdelight.hamburger":"Hamburguesa","item.farmersdelight.roast_chicken":"Pollo Asado","farmersdelight.jei.category.cooking":"Cocina (Olla)","farmersdelight.jei.category.cutting":"Corte (Tabla)"},
  "assets/ftbquests/lang/es_es.json": {"ftbquests.title":"Misiones","ftbquests.gui.accept":"Aceptar","ftbquests.gui.claim":"Reclamar","ftbquests.gui.reward":"Recompensa","ftbquests.gui.task":"Tarea","ftbquests.gui.progress":"Progreso","ftbquests.gui.completed":"Completado","ftbquests.gui.locked":"Bloqueado","ftbquests.gui.chapter":"Capítulo","ftbquests.gui.quest":"Misión","ftbquests.gui.quest_completed":"¡Misión completada!","ftbquests.gui.reward_claimed":"¡Recompensa reclamada!","ftbquests.task.item":"Obtener ítem","ftbquests.task.kill":"Matar","ftbquests.task.location":"Ir a ubicación","ftbquests.reward.item":"Ítem","ftbquests.reward.xp":"Experiencia","ftbquests.reward.loot":"Botín","ftbquests.reward.choice":"Elección"},
  "assets/firmalife/lang/es_es.json": {"block.firmalife.oven_top":"Parte Superior del Horno","block.firmalife.drying_mat":"Esterilla de Secado","block.firmalife.beehive":"Colmena","block.firmalife.mixing_bowl":"Cuenco Mezclador","block.firmalife.vat":"Cuba","block.firmalife.greenhouse_wall":"Pared de Invernadero","block.firmalife.sprinkler":"Aspersor","item.firmalife.butter":"Mantequilla","item.firmalife.cheese":"Queso","item.firmalife.dark_chocolate":"Chocolate Negro","item.firmalife.raw_pizza":"Pizza Cruda","item.firmalife.cooked_pizza":"Pizza Cocida","item.firmalife.tofu":"Tofu"},
  "assets/coldsweat/lang/es_es.json": {"cold_sweat.tooltip.temperature":"Temperatura corporal: %s","cold_sweat.message.too_cold":"¡Tienes demasiado frío!","cold_sweat.message.too_hot":"¡Tienes demasiado calor!","block.cold_sweat.boiler":"Caldera","block.cold_sweat.hearth":"Hogar","block.cold_sweat.thermometer":"Termómetro","item.cold_sweat.waterskin":"Odre"},
  "assets/voicechat/lang/es_es.json": {"message.voicechat.muted":"Micrófono silenciado","message.voicechat.unmuted":"Micrófono activado","gui.voicechat.title":"Chat de Voz","gui.voicechat.settings":"Configuración","gui.voicechat.mute":"Silenciar","gui.voicechat.group":"Grupo","gui.voicechat.create_group":"Crear Grupo"},
  "assets/supplementaries/lang/es_es.json": {"block.supplementaries.safe":"Caja Fuerte","block.supplementaries.pedestal":"Pedestal","block.supplementaries.notice_board":"Tablón de Anuncios","block.supplementaries.cage":"Jaula","block.supplementaries.jar":"Tarro","block.supplementaries.faucet":"Grifo","block.supplementaries.flag":"Bandera","block.supplementaries.globe":"Globo Terráqueo","block.supplementaries.hourglass":"Reloj de Arena","block.supplementaries.rope":"Cuerda","block.supplementaries.sack":"Saco","item.supplementaries.quiver":"Carcaj","item.supplementaries.bomb":"Bomba","item.supplementaries.key":"Llave"},
  "assets/refinedstorage/lang/es_es.json": {"block.refinedstorage.controller":"Controlador","block.refinedstorage.grid":"Cuadrícula","block.refinedstorage.crafting_grid":"Cuadrícula de Fabricación","block.refinedstorage.disk_drive":"Unidad de Discos","block.refinedstorage.importer":"Importador","block.refinedstorage.exporter":"Exportador","block.refinedstorage.crafter":"Fabricador","gui.refinedstorage.grid.search":"Buscar...","gui.refinedstorage.stored":"Almacenado: %s / %s"},
  "assets/pvp_flagging/lang/es_es.json": {"pvp_flagging.enabled":"§c¡PVP ACTIVADO!","pvp_flagging.disabled":"§aPVP desactivado","pvp_flagging.toggle_on":"Has activado el PVP","pvp_flagging.toggle_off":"Has desactivado el PVP","pvp_flagging.attack_denied":"¡Este jugador tiene el PVP desactivado!"},
  "assets/corpse/lang/es_es.json": {"block.corpse.corpse":"Cadáver","corpse.death_message":"%s murió aquí","corpse.tooltip.items":"Ítems: %s"},
  "assets/hardcorerevival/lang/es_es.json": {"hardcorerevival.knocked_out":"¡Has caído! Espera a que te revivan.","hardcorerevival.reviving":"Reviviendo...","hardcorerevival.revived":"¡Has sido revivido!"},
  "assets/firstaid/lang/es_es.json": {"firstaid.gui.head":"Cabeza","firstaid.gui.body":"Torso","firstaid.gui.left_arm":"Brazo Izq.","firstaid.gui.right_arm":"Brazo Der.","firstaid.gui.left_leg":"Pierna Izq.","firstaid.gui.right_leg":"Pierna Der.","item.firstaid.bandage":"Vendaje","item.firstaid.morphine":"Morfina"},
  "assets/solcarrot/lang/es_es.json": {"gui.solcarrot.food_book":"Libro de Comidas","gui.solcarrot.food_book.header":"Alimentos Consumidos","item.solcarrot.food_book":"Libro de Comidas"},
  "assets/waterflasks/lang/es_es.json": {"item.waterflasks.leather_flask":"Cantimplora de Cuero","item.waterflasks.iron_flask":"Cantimplora de Hierro","waterflasks.tooltip.water":"Agua: %s/%s"},
  "assets/lithiccoins/lang/es_es.json": {"item.lithiccoins.copper_coin":"Moneda de Cobre","item.lithiccoins.bronze_coin":"Moneda de Bronce","item.lithiccoins.silver_coin":"Moneda de Plata","item.lithiccoins.gold_coin":"Moneda de Oro"},
  "assets/spartanweaponry/lang/es_es.json": {"item.spartanweaponry.dagger":"Daga","item.spartanweaponry.longsword":"Espada Larga","item.spartanweaponry.katana":"Katana","item.spartanweaponry.greatsword":"Mandoble","item.spartanweaponry.halberd":"Alabarda","item.spartanweaponry.lance":"Lanza","item.spartanweaponry.longbow":"Arco Largo","item.spartanweaponry.javelin":"Jabalina","item.spartanweaponry.battleaxe":"Hacha de Batalla","item.spartanweaponry.mace":"Maza","item.spartanweaponry.spear":"Lanza"},
  "assets/tfmg/lang/es_es.json": {"block.tfmg.distillation_controller":"Controlador de Destilación","block.tfmg.steel_casing":"Carcasa de Acero","block.tfmg.coal_generator":"Generador de Carbón","block.tfmg.electric_motor":"Motor Eléctrico","block.tfmg.cement":"Cemento","item.tfmg.steel_ingot":"Lingote de Acero","item.tfmg.coal_coke":"Coque de Carbón"},
  "assets/createaddition/lang/es_es.json": {"block.createaddition.electric_motor":"Motor Eléctrico","block.createaddition.alternator":"Alternador","block.createaddition.rolling_mill":"Laminadora","block.createaddition.tesla_coil":"Bobina Tesla","item.createaddition.copper_wire":"Cable de Cobre"},
  "assets/vintageimprovements/lang/es_es.json": {"block.vintageimprovements.vacuum_chamber":"Cámara de Vacío","block.vintageimprovements.centrifuge":"Centrífuga","block.vintageimprovements.helve_hammer":"Martillo Pilón","block.vintageimprovements.grinder":"Amoladora","item.vintageimprovements.spring":"Resorte"},
  "assets/musketmod/lang/es_es.json": {"item.musketmod.musket":"Mosquete","item.musketmod.pistol":"Pistola","item.musketmod.bayonet":"Bayoneta","musketmod.tooltip.loaded":"Cargado","musketmod.tooltip.empty":"Vacío"},
  "assets/pneumaticcraft/lang/es_es.json": {"pneumaticcraft.gui.tab.pressure":"Presión: %s bar","block.pneumaticcraft.air_compressor":"Compresor de Aire","block.pneumaticcraft.refinery":"Refinería","block.pneumaticcraft.programmer":"Programador","item.pneumaticcraft.drone":"Dron","item.pneumaticcraft.minigun":"Minigun"},
  "assets/ad_astra/lang/es_es.json": {"block.ad_astra.solar_panel":"Panel Solar","block.ad_astra.nasa_workbench":"Banco de Trabajo NASA","block.ad_astra.launch_pad":"Plataforma de Lanzamiento","item.ad_astra.space_helmet":"Casco Espacial","item.ad_astra.rocket":"Cohete","item.ad_astra.rover":"Rover"},
  "assets/createbigcannons/lang/es_es.json": {"block.createbigcannons.cannon_mount":"Montura de Cañón","item.createbigcannons.shot":"Proyectil","item.createbigcannons.he_shot":"Proyectil Explosivo","item.createbigcannons.powder_charge":"Carga de Pólvora"},
  "assets/car/lang/es_es.json": {"block.car.gas_station":"Gasolinera","block.car.car_workshop":"Taller de Coches","item.car.car_key":"Llave del Coche","car.gui.fuel":"Combustible: %s","car.gui.speed":"Velocidad: %s km/h"},
  "assets/butchersdelight/lang/es_es.json": {"block.butchersdelight.butcher_table":"Mesa de Carnicero","item.butchersdelight.cleaver":"Cuchilla de Carnicero","item.butchersdelight.ham":"Jamón","item.butchersdelight.jerky":"Carne Seca"},
  "assets/letsdo-brewery/lang/es_es.json": {"item.brewery.beer":"Cerveza","item.brewery.whiskey":"Whiskey","item.brewery.wine":"Vino","item.brewery.mead":"Hidromiel","item.brewery.rum":"Ron"},
  "assets/letsdo-vinery/lang/es_es.json": {"block.vinery.wine_press":"Prensa de Vino","item.vinery.red_wine":"Vino Tinto","item.vinery.white_wine":"Vino Blanco"},
  "assets/exposure/lang/es_es.json": {"item.exposure.camera":"Cámara","item.exposure.photograph":"Fotografía","exposure.message.photo_taken":"¡Foto tomada!"},
  "assets/lootr/lang/es_es.json": {"block.lootr.lootr_chest":"Cofre de Botín","block.lootr.lootr_barrel":"Barril de Botín"},
  "assets/constructionwand/lang/es_es.json": {"item.constructionwand.stone_wand":"Varita de Construcción (Piedra)","item.constructionwand.iron_wand":"Varita de Construcción (Hierro)","constructionwand.mode.line":"Línea","constructionwand.mode.wall":"Pared","constructionwand.mode.floor":"Suelo"},
  "assets/sanitydim/lang/es_es.json": {"sanitydim.sanity":"Cordura: %s%%","sanitydim.insane":"¡Estás perdiendo la cordura!"},
  "assets/gliders/lang/es_es.json": {"item.gliders.glider":"Planeador"},
  "assets/comforts/lang/es_es.json": {"item.comforts.sleeping_bag":"Saco de Dormir","item.comforts.hammock":"Hamaca"},
  "assets/compactmachines/lang/es_es.json": {"block.compactmachines.machine_tiny":"Máquina Compacta (Pequeña)","block.compactmachines.machine_normal":"Máquina Compacta (Normal)","item.compactmachines.personal_shrinking_device":"Dispositivo de Miniaturización"},
  "assets/spartanshields/lang/es_es.json": {"item.spartanshields.shield_basic_wood":"Escudo de Madera","item.spartanshields.shield_basic_iron":"Escudo de Hierro"}
};

const rpZip = new AdmZip();
rpZip.addFile("pack.mcmeta", Buffer.from(JSON.stringify({ pack:{pack_format:15,description:"§6HardRock TFC4§r — §aTraducción Español§r"} },null,2)));
let totalE = 0;
for (const [fp, ld] of Object.entries(T)) { rpZip.addFile(fp, Buffer.from(JSON.stringify(ld,null,2))); totalE += Object.keys(ld).length; }

const rpN = path.join(ROOT,"..","modpacks","hardrock-normal","resourcepacks");
const rpL = path.join(ROOT,"..","modpacks","hardrock-lite","resourcepacks");
ensureDir(rpN); ensureDir(rpL);
rpZip.writeZip(path.join(rpN,"HardRock-TFC4-Espanol.zip"));
rpZip.writeZip(path.join(rpL,"HardRock-TFC4-Espanol.zip"));
console.log(`✓ Resource pack: ${totalE} traducciones → ambos modpacks\n`);

// ═══ 3. CONFIGS ═══
const cN = path.join(ROOT,"..","modpacks","hardrock-normal","config"); ensureDir(cN);
const cL = path.join(ROOT,"..","modpacks","hardrock-lite","config"); ensureDir(cL);

fs.writeFileSync(path.join(cN,"embeddium-options.json"),JSON.stringify({quality:{weather_quality:"FANCY",leaves_quality:"FANCY",enable_vignette:true},performance:{chunk_builder_threads:0,always_defer_chunk_updates_v2:true,animate_only_visible_textures:true,use_entity_culling:true,use_fog_occlusion:true,use_block_face_culling:true,use_compact_vertex_format:true,use_no_error_g_l_context:true},notifications:{force_disable_donation_prompts:true}},null,2));
fs.writeFileSync(path.join(cN,"ferritecore-mixin.toml"),"compactFastMap = true\ncacheMultipartPredicates = true\nmultipartDeduplication = true\nblockstateCacheDeduplication = true\nmodelResourceLocations = true\nmodelSides = true\nreplaceNeighborLookup = true\nreplacePropertyMap = true\nbakedQuadDeduplication = true\n");
fs.writeFileSync(path.join(cN,"entityculling.json"),JSON.stringify({configVersion:7,tracingDistance:96,hitboxLimit:40,tickCulling:true,blockEntityFrustumCulling:true},null,2));

fs.writeFileSync(path.join(cL,"embeddium-options.json"),JSON.stringify({quality:{weather_quality:"FAST",leaves_quality:"FAST",enable_vignette:false},performance:{chunk_builder_threads:0,always_defer_chunk_updates_v2:true,animate_only_visible_textures:true,use_entity_culling:true,use_fog_occlusion:true,use_block_face_culling:true,use_compact_vertex_format:true,use_no_error_g_l_context:true},notifications:{force_disable_donation_prompts:true}},null,2));
fs.writeFileSync(path.join(cL,"ferritecore-mixin.toml"),"compactFastMap = true\nuseSmallThreadingDetector = true\ncacheMultipartPredicates = true\nmultipartDeduplication = true\nblockstateCacheDeduplication = true\nmodelResourceLocations = true\nmodelSides = true\nreplaceNeighborLookup = true\nreplacePropertyMap = true\nbakedQuadDeduplication = true\n");
fs.writeFileSync(path.join(cL,"entityculling.json"),JSON.stringify({configVersion:7,tracingDistance:64,hitboxLimit:30,captureRate:8,tickCulling:true,blockEntityFrustumCulling:true,forceDisplayCulling:true},null,2));
fs.writeFileSync(path.join(cL,"oculus.properties"),"maxShadowRenderDistance=4\nenableShaders=false\n");

console.log("✓ Configs Normal: embeddium FANCY, ferritecore, entityculling");
console.log("✓ Configs Lite: embeddium FAST, ferritecore MAX, entityculling agresivo, shaders OFF\n");

console.log("╔══════════════════════════════════════════════════╗");
console.log("║   ✅ ¡TODO LISTO!                               ║");
console.log("╠══════════════════════════════════════════════════╣");
console.log(`║  Manifest: 2 modpacks + .enc                    ║`);
console.log(`║  Traducciones: ${totalE} entradas / ${Object.keys(T).length} mods             ║`);
console.log("║  Configs Normal + Lite                          ║");
console.log("║  Resource pack en ambos modpacks                ║");
console.log("╚══════════════════════════════════════════════════╝");
