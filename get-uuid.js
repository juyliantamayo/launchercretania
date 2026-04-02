// Uso: node get-uuid.js <NombreDeCuenta>
// Ejemplo: node get-uuid.js Notch

const nombre = process.argv[2];

if (!nombre) {
  console.error("Uso: node get-uuid.js <NombreDeCuenta>");
  process.exit(1);
}

fetch(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(nombre)}`)
  .then(async res => {
    if (res.status === 404) {
      console.error(`No se encontró ninguna cuenta con el nombre: ${nombre}`);
      process.exit(1);
    }
    if (!res.ok) {
      console.error(`Error de la API de Mojang: ${res.status}`);
      process.exit(1);
    }
    const data = await res.json();
    // El UUID viene sin guiones, lo formateamos
    const raw = data.id;
    const uuid = `${raw.slice(0,8)}-${raw.slice(8,12)}-${raw.slice(12,16)}-${raw.slice(16,20)}-${raw.slice(20)}`;
    console.log(`Nombre : ${data.name}`);
    console.log(`UUID   : ${uuid}`);
    console.log(`(raw)  : ${raw}`);
  })
  .catch(err => {
    console.error("Error de red:", err.message);
    process.exit(1);
  });
