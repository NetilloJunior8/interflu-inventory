# Interflu Inventory — Sistema Corporativo de Control de Inventario Físico

Sistema integral de gestión, croquis digitalizado interactivo y control físico de inventarios para **Interflu (Internacional de Fluidos, S.A. de C.V.)**, diseñado para reemplazar capturas manuales en papel o Excel, digitalizar el croquis arquitectónico de la nave y conectar con **Aspel SAE** mediante exportaciones oficiales en formato **Excel (`.xlsx`) "Existencia Física"**, `.csv` y `.txt`.

---

## Arquitectura y Tecnologías

- **Backend:** Java 21 + Spring Boot 3.4.5 (REST API, Spring Security 6, JWT, Spring Data JPA, Apache POI 5.3 para generación de hojas de cálculo con estilos corporativos).
- **Frontend:** Angular 17+ (Standalone Components, Signals, Reactive Forms, diseño industrial ultra-responsivo, JSZip, QRCode).
- **Base de Datos:** SQLite con soporte WAL (Write-Ahead Logging), índices en `code` y `description`. Benchmark probado con **más de 22,000 artículos** con búsquedas en tiempo real (< 15 ms).
- **Integración Aspel SAE y Excel Oficial:** 
  - **Formato Oficial Excel (`.xlsx`):** Genera la plantilla de **Existencia Física** (`ESTATUS`, `TIPO DE ELEMENTO`, `CLAVE`, `CLAVE ESQ`, `EXISTENCIA FÍSICA`) con cabeceras a color (Azul Marino, Amarillo y Cyan) e incluye una segunda hoja con auditoría detallada por anaquel, fecha y capturista.
  - **Exportadores CSV y TXT:** Formato directo `CVE_ART,ALMACEN,CANTIDAD` con codificación UTF-8 BOM.
- **Centro de Rotulación QR Dinámico por Material:** Generación automática de códigos QR para cada material y refacción física contabilizada por anaquel (si un anaquel tiene 55 partidas, genera exactamente sus 55 etiquetas QR para etiquetar los contenedores/cajas del anaquel). Inicia completamente limpio y se alimenta en tiempo real conforme se registran conteos o importan hojas de Excel. Incluye descarga masiva en `.zip` e impresión en hojas de etiquetas.
- **Despliegue Docker:** Empaquetado multi-etapa listo para producción en contenedores Linux con persistencia de base de datos en volumen.

---

## Distribución de Anaqueles Físicos Digitalizados (171 Totales)

Basado fielmente en los croquis y planos oficiales del almacén:

### Planta Baja (87 Anaqueles Físicos)
* **Pasillo Kuriyama:** 14 anaqueles (`PB-KUR-A01..A07` y `PB-KUR-B01..B07`)
* **Anaqueles Pendientes / Piloto:** 9 anaqueles (`PB-PEN-01..09`)
* **Pasillo Acero:** 19 anaqueles (`PB-ACE-01` en el fondo + `PB-ACE-02..19` en doble bahía)
* **Pasillo YPC:** 9 anaqueles (`PB-YPC-01..09`)
* **Estantería YPC:** 12 anaqueles (`PB-EST-01..12`)
* **Cybermatics:** 3 anaqueles (`PB-CYB-01..03`)
* **Universal:** 3 anaqueles (`PB-UNI-01..03`)
* **Dixon:** 2 anaqueles (`PB-DIX-01..02`)
* **Conexiones Hidráulicas (Columna Central):** 10 anaqueles (`PB-CHID-A01..A05` y `PB-CHID-B01..B05`)
* **Parker Inox (Muro Norte):** 1 anaquel (`PB-INOX-01`)
* **Conexiones Hidráulicas (Muro Este Inclinado):** 5 anaqueles (`PB-CHID-W01..W05`)

### Planta Alta (84 Anaqueles Físicos)
* **Lateral Oeste:** 5 anaqueles (`PA-LAT-01..05`: FNH, HTM, HCO, ENP, DOC)
* **Reserva de Acero:** 8 anaqueles (`PA-RES-01..03` + `PA-RES-A01..A05`)
* **Área PVC:** 5 anaqueles (`PA-PVC-01..05`)
* **Pasillo 1 a Pasillo 5:** 60 anaqueles (12 por pasillo: `PA-PAS1-01..12` a `PA-PAS5-01..12`)
* **Muro Este Diagonal:** 6 anaqueles (`PA-SEL-W-01..06`)

---

## Usuarios y Credenciales del Sistema

| Usuario | Contraseña | Rol | Descripción y Permisos |
| :--- | :--- | :--- | :--- |
| `Osiris` | `220704` | **OPERADOR** | Operador de almacén: Cédula de conteo, croquis, captura física e importación Excel. |
| `Alexis` | `888888` | **OPERADOR** | Operador de almacén: Cédula de conteo, croquis, captura física e importación Excel. |
| `sistemas` | `admin8888` | **SISTEMAS** | Administrador TI: Gestión de usuarios, contraseñas, eliminar inventarios y soporte técnico. |

---

## Módulos del Sistema

1. **Dashboard Corporativo:**
   - Avance físico global (171 anaqueles).
   - Avance por nivel: **Planta Baja (87 anaqueles)** y **Planta Alta (84 anaqueles)** en tiempo real.
   - Total de piezas contadas, partidas registradas y códigos únicos.
   - Enlace directo a todos los módulos operativos.
2. **Cédula de Conteo:** Registro ágil por código o descripción con teclado táctil rápido (`+1`, `+5`, `+10`, `+25`, `+50`, `C`), detección de códigos duplicados con alertas preventivas e importación masiva desde Excel (`.xlsx` / `.csv`).
3. **Croquis Digital PB y PA:** Plano digital interactivo con actualización en tiempo real:
   - Verde: Anaquel completado/contabilizado.
   - Naranja: Anaquel en proceso.
   - Gris neutro: Anaquel pendiente / sin iniciar.
   - Click directo sobre cualquier anaquel para ver detalle, reabrir o comenzar conteo.
4. **Centro de Etiquetas QR (Dinámico por Materiales de Anaqueles):**
   - **Estado Inicial 100% Vacío:** No pre-genera etiquetas ficticias para anaqueles sin conteo.
   - **Generación On-Demand por Partida:** Conforme se contabiliza o importa un anaquel, se generan sus etiquetas QR exactas (ej. si un anaquel tiene 55 partidas distintas, genera 55 códigos QR únicos con formato industrial).
   - **Filtro por Anaquel Contabilizado:** Selector directo para aislar e imprimir las etiquetas de un anaquel específico (ej. `PB-ACE-01 · Acero`).
   - **Etiquetas de Alta Definición:** Incluyen logo oficial de Interflu, clave/SKU, descripción del material, anaquel asignado, conteo registrado y código QR de alta resolución.
   - **Descarga Masiva en ZIP:** Descarga en un solo clic el archivo `QR_Materiales_<Anaquel>_<Fecha>.zip` con todas las imágenes PNG.
   - **Impresión Directa:** Vista optimizada de impresión para hojas de stickers adhesivos (3 columnas estándar).
5. **Control de Calidad y Validación:** Comparación automática contra existencias teóricas de Aspel SAE (Sobrantes, Faltantes, Cuadrados e Inexistentes).
6. **Exportación Oficial (Excel Existencia Física & SAE):**
   - **Libro Excel (`.xlsx`):** Formato `ESTATUS, TIPO DE ELEMENTO, CLAVE, CLAVE ESQ, EXISTENCIA FÍSICA` con cabeceras coloreadas y hoja de auditoría detallada.
   - Archivos CSV y TXT delimitados con UTF-8 BOM.
7. **Soporte TI y Gestión de Usuarios:** Cola de tickets para soporte técnico y panel exclusivo para que el usuario de sistemas administre credenciales y permisos.

---

## Despliegue con Docker en Servidor Linux

El proyecto incluye configuración completa para ejecutarse en cualquier servidor Linux (Ubuntu, Debian, CentOS, AlmaLinux, etc.) con Docker y Docker Compose.

### Paso 1: Clonar o Copiar el Repositorio en el Servidor
```bash
git clone https://github.com/TU_USUARIO/interflu-inventory.git
cd interflu-inventory
```

### Paso 2: Iniciar con Docker Compose
```bash
docker compose up -d --build
```

Esto ejecutará una construcción multi-etapa optimizada:
1. Compila la aplicación Angular en un contenedor Node 20.
2. Compila el JAR Spring Boot en un contenedor Maven + Java 21 integrando los recursos del frontend.
3. Despliega la aplicación sobre una imagen ligera `eclipse-temurin:21-jre-alpine` en el puerto `8080`.
4. Los datos de la base de datos SQLite se guardan de forma persistente en el volumen Docker `interflu-inventory-sqlite-data` (ubicado en `/app/data/interflu_inventory.db`), por lo que nunca se perderán al reiniciar o actualizar el contenedor.

### Comandos de Mantenimiento en Linux:
```bash
# Ver estado del contenedor y healthcheck
docker compose ps

# Ver registros en tiempo real
docker compose logs -f

# Detener el servicio
docker compose down

# Reiniciar el servicio
docker compose restart
```

Acceso en el servidor: **`http://IP_DEL_SERVIDOR:8080/`**

---

## Ejecución Local sin Docker (Modo Desarrollo)

### Requisitos
- Java 21 JDK (`java -version`).
- Node.js 18+ y npm (`node -v`).
- Maven 3.8+ (`mvn -version`).

### Ejecución Directa del JAR:
```bash
cd backend
java -jar target/interflu-inventory-0.1.0-SNAPSHOT.jar
```
Abre tu navegador en: **`http://localhost:8080/`**

### Recompilación Completa:
1. **Frontend:**
   ```bash
   cd frontend
   npm install
   npm run build
   ```
2. **Copiar estáticos:**
   ```powershell
   Copy-Item -Path "frontend\dist\frontend\browser\*" -Destination "backend\src\main\resources\static\" -Recurse -Force
   ```
3. **Backend:**
   ```bash
   cd backend
   mvn package -DskipTests
   java -jar target/interflu-inventory-0.1.0-SNAPSHOT.jar
   ```

---

## Subir a GitHub

Para subir el proyecto limpio y listo a GitHub:

```bash
git init
git add .
git commit -m "feat: interflu inventory - clean production release with excel format & docker support"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/interflu-inventory.git
git push -u origin main
```
