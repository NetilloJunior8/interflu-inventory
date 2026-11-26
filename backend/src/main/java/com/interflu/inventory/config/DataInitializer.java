package com.interflu.inventory.config;

import com.interflu.inventory.model.*;
import com.interflu.inventory.repository.*;
import com.interflu.inventory.service.ProductService;
import org.springframework.boot.CommandLineRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.*;

@Component
public class DataInitializer implements CommandLineRunner {

    private final JdbcTemplate jdbcTemplate;
    private final UserRepository userRepo;
    private final ShelfRepository shelfRepo;
    private final InventorySessionRepository sessionRepo;
    private final ShelfAssignmentRepository assignmentRepo;
    private final CountRecordRepository countRepo;
    private final ProductRepository productRepo;
    private final ProductService productService;
    private final PasswordEncoder passwordEncoder;

    public DataInitializer(JdbcTemplate jdbcTemplate,
                           UserRepository userRepo,
                           ShelfRepository shelfRepo,
                           InventorySessionRepository sessionRepo,
                           ShelfAssignmentRepository assignmentRepo,
                           CountRecordRepository countRepo,
                           ProductRepository productRepo,
                           ProductService productService,
                           PasswordEncoder passwordEncoder) {
        this.jdbcTemplate = jdbcTemplate;
        this.userRepo = userRepo;
        this.shelfRepo = shelfRepo;
        this.sessionRepo = sessionRepo;
        this.assignmentRepo = assignmentRepo;
        this.countRepo = countRepo;
        this.productRepo = productRepo;
        this.productService = productService;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    public void run(String... args) {
        // Configure SQLite WAL mode for fast concurrent operations
        try {
            jdbcTemplate.queryForObject("PRAGMA journal_mode=WAL;", String.class);
            jdbcTemplate.update("UPDATE count_records SET version = 0 WHERE version IS NULL;");
            try { jdbcTemplate.execute("ALTER TABLE products ADD COLUMN min_stock REAL;"); } catch (Exception ignored) {}
            try { jdbcTemplate.execute("ALTER TABLE products ADD COLUMN reorder_point REAL;"); } catch (Exception ignored) {}
            try { jdbcTemplate.execute("ALTER TABLE products ADD COLUMN max_stock REAL;"); } catch (Exception ignored) {}
        } catch (Exception ignored) {}

        // Sanitize any legacy SQLite string timestamps to epoch milliseconds for Hibernate SQLiteDialect compatibility
        try {
            sanitizeSqliteTimestamps();
        } catch (Exception ignored) {}

        // 1. Seed Authorized Users: Osiris (220704), Alexis (888888), and Sistemas (admin8888)
        User osiris = userRepo.findByUsername("Osiris").orElse(null);
        if (osiris == null) {
            osiris = userRepo.findByUsername("osiris").orElse(null);
        }
        if (osiris == null) {
            osiris = new User("Osiris", passwordEncoder.encode("220704"), "Osiris");
            osiris.setRole("OPERADOR");
            osiris = userRepo.save(osiris);
        } else if (osiris.getRole() == null) {
            osiris.setRole("OPERADOR");
            userRepo.save(osiris);
        }

        User alexis = userRepo.findByUsername("Alexis").orElse(null);
        if (alexis == null) {
            alexis = userRepo.findByUsername("alexis").orElse(null);
        }
        if (alexis == null) {
            alexis = new User("Alexis", passwordEncoder.encode("888888"), "Alexis");
            alexis.setRole("OPERADOR");
            alexis = userRepo.save(alexis);
        } else if (alexis.getRole() == null) {
            alexis.setRole("OPERADOR");
            userRepo.save(alexis);
        }

        User sistemas = userRepo.findByUsername("sistemas").orElse(null);
        if (sistemas == null) {
            sistemas = new User("sistemas", passwordEncoder.encode("admin8888"), "Administrador de Sistemas TI");
            sistemas.setRole("SISTEMAS");
            userRepo.save(sistemas);
        } else if (sistemas.getRole() == null) {
            sistemas.setRole("SISTEMAS");
            userRepo.save(sistemas);
        }

        // 2. Clean up obsolete dummy shelves and dummy counts if present
        boolean hasOldDummy = shelfRepo.findByCodeIgnoreCase("P1-VAL-01").isPresent();
        if (hasOldDummy) {
            countRepo.deleteAll();
            assignmentRepo.deleteAll();
            shelfRepo.deleteAll();
            sessionRepo.deleteAll();
        }

        // 3. Ensure all 170 real blueprint shelves exist and migrate any legacy codes (e.g. PB-ACE-01 -> PB3-01)
        List<Shelf> blueprintShelves = buildRealBlueprintShelves();
        for (Shelf official : blueprintShelves) {
            String canonicalCode = official.getCode().toUpperCase();
            Optional<Shelf> existing = shelfRepo.findByCodeIgnoreCase(canonicalCode);
            if (existing.isEmpty()) {
                // Check if a legacy code exists in db (e.g. PB-ACE-01, PB-3-01, PB3-1 for PB3-01)
                Optional<Shelf> legacyShelf = Optional.empty();
                if (canonicalCode.startsWith("PB3-")) {
                    try {
                        int num = Integer.parseInt(canonicalCode.replace("PB3-", ""));
                        for (String cand : List.of(
                                String.format("PB-ACE-%02d", num),
                                String.format("PB-ACE-%d", num),
                                String.format("PB-3-%02d", num),
                                String.format("PB3-%d", num),
                                String.format("PB-3-%d", num),
                                String.format("ACE-%02d", num),
                                String.format("ACE-%d", num))) {
                            legacyShelf = shelfRepo.findByCodeIgnoreCase(cand);
                            if (legacyShelf.isPresent()) break;
                        }
                    } catch (Exception ignored) {}
                }
                if (legacyShelf.isPresent()) {
                    Shelf s = legacyShelf.get();
                    s.setCode(official.getCode());
                    s.setZone(official.getZone());
                    s.setDescription(official.getDescription());
                    s.setPlant(official.getPlant());
                    s.setWarehouseCode(official.getWarehouseCode());
                    s.setPosX(official.getPosX());
                    s.setPosY(official.getPosY());
                    s.setWidth(official.getWidth());
                    s.setHeight(official.getHeight());
                    s.setActive(true);
                    shelfRepo.save(s);
                } else {
                    shelfRepo.save(official);
                }
            }
        }

        // Migrate any leftover PB-ACE-* or ACE-* shelves to canonical PB3-*
        try {
            List<Shelf> allShelves = shelfRepo.findAll();
            for (Shelf sh : allShelves) {
                String sc = sh.getCode().toUpperCase();
                java.util.regex.Matcher m = java.util.regex.Pattern.compile("^(?:PB-ACE-|ACE-)0*(\\d+)$").matcher(sc);
                if (m.find()) {
                    int num = Integer.parseInt(m.group(1));
                    String targetCode = String.format("PB3-%02d", num);
                    Optional<Shelf> target = shelfRepo.findByCodeIgnoreCase(targetCode);
                    if (target.isPresent() && !target.get().getId().equals(sh.getId())) {
                        Long oldId = sh.getId();
                        Long newId = target.get().getId();
                        jdbcTemplate.update("UPDATE count_records SET shelf_id = ? WHERE shelf_id = ?", newId, oldId);
                        jdbcTemplate.update("DELETE FROM shelf_assignments WHERE shelf_id = ?", oldId);
                        jdbcTemplate.update("DELETE FROM shelves WHERE id = ?", oldId);
                    } else if (target.isEmpty()) {
                        sh.setCode(targetCode);
                        sh.setZone("Acero");
                        shelfRepo.save(sh);
                    }
                }
            }
        } catch (Exception ignored) {}

        // Purge any rogue / unmapped shelves created by older test imports (so PB has strictly 87 shelves and PA has 83)
        try {
            java.util.Set<String> blueprintCodes = blueprintShelves.stream()
                    .map(s -> s.getCode().toUpperCase())
                    .collect(java.util.stream.Collectors.toSet());
            Optional<Shelf> penShelfOpt = shelfRepo.findByCodeIgnoreCase("PB-PEN-01");
            Long fallbackPenId = penShelfOpt.map(Shelf::getId).orElse(null);

            List<Shelf> currentShelves = shelfRepo.findAll();
            for (Shelf sh : currentShelves) {
                String sc = sh.getCode().toUpperCase();
                if (!blueprintCodes.contains(sc)) {
                    Long rogueId = sh.getId();
                    if (fallbackPenId != null && !rogueId.equals(fallbackPenId)) {
                        jdbcTemplate.update("UPDATE count_records SET shelf_id = ? WHERE shelf_id = ?", fallbackPenId, rogueId);
                    }
                    jdbcTemplate.update("DELETE FROM shelf_assignments WHERE shelf_id = ?", rogueId);
                    jdbcTemplate.update("DELETE FROM shelves WHERE id = ?", rogueId);
                }
            }
        } catch (Exception ignored) {}

        // Guarantee that all sessions have assignments for all shelves without altering shelf data
        try {
            // Clean up any duplicate shelf_assignments and enforce unique index
            jdbcTemplate.update("DELETE FROM shelf_assignments WHERE id NOT IN (SELECT MIN(id) FROM shelf_assignments GROUP BY session_id, shelf_id);");
            jdbcTemplate.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_shelf_assign_sess_shelf ON shelf_assignments(session_id, shelf_id);");

            List<Long> allSessionIds = jdbcTemplate.queryForList("SELECT id FROM inventory_sessions", Long.class);
            List<Long> allShelfIds = jdbcTemplate.queryForList("SELECT id FROM shelves", Long.class);
            for (Long sessId : allSessionIds) {
                for (Long shelfId : allShelfIds) {
                    jdbcTemplate.update(
                        "INSERT OR IGNORE INTO shelf_assignments (session_id, shelf_id, status) VALUES (?, ?, 'PENDIENTE')",
                        sessId, shelfId
                    );
                }
            }
        } catch (Exception ignored) {}

        // 4. Seed 22,000+ SKU catalog for high-speed benchmark and search auto-completion
        productService.seed22kCatalogIfEmpty();

        // 5. Seed Real Operational Session (INV-2026-001) without dummy counts
        if (sessionRepo.count() == 0) {
            InventorySession session = new InventorySession();
            session.setFolio("INV-2026-001");
            session.setTitle("Inventario Físico General Planta Baja y Planta Alta");
            session.setWarehouseCode("1");
            session.setWarehouseName("Almacén Principal Interflu");
            session.setStatus(InventorySession.Status.EN_CONTEO);
            session.setNotes("Control físico digital por anaqueles según croquis oficial de planta.");
            session.setCreatedBy(osiris);
            session.setCreatedAt(LocalDateTime.now());
            session = sessionRepo.save(session);

            List<Shelf> allShelves = shelfRepo.findByActiveTrueOrderByCodeAsc();
            for (Shelf shelf : allShelves) {
                // Initial status PENDIENTE (uncounted) -> starts neutral/sin color on croquis, user is NULL (-- Por Asignar --)
                ShelfAssignment sa = new ShelfAssignment(session, shelf, null);
                sa.setStatus(ShelfAssignment.Status.PENDIENTE);
                assignmentRepo.save(sa);
            }
        }
    }

    private List<Shelf> buildRealBlueprintShelves() {
        return List.of(
            // === PLANTA BAJA (91 Anaqueles Reales) ===
            new Shelf("PB-KUR-A01", "Kuriyama", "Kuriyama Pasillo A M1", "1", "Planta Baja", 686.6, 263.1, 25.0, 54.0),
            new Shelf("PB-KUR-B01", "Kuriyama", "Kuriyama Pasillo B M1", "1", "Planta Baja", 714.5, 263.1, 25.0, 54.0),
            new Shelf("PB-KUR-A02", "Kuriyama", "Kuriyama Pasillo A M2", "1", "Planta Baja", 686.6, 321.9, 25.0, 54.0),
            new Shelf("PB-KUR-B02", "Kuriyama", "Kuriyama Pasillo B M2", "1", "Planta Baja", 714.5, 321.9, 25.0, 54.0),
            new Shelf("PB-KUR-A03", "Kuriyama", "Kuriyama Pasillo A M3", "1", "Planta Baja", 686.6, 380.7, 25.0, 54.0),
            new Shelf("PB-KUR-B03", "Kuriyama", "Kuriyama Pasillo B M3", "1", "Planta Baja", 714.5, 380.7, 25.0, 54.0),
            new Shelf("PB-KUR-A04", "Kuriyama", "Kuriyama Pasillo A M4", "1", "Planta Baja", 686.6, 439.5, 25.0, 54.0),
            new Shelf("PB-KUR-B04", "Kuriyama", "Kuriyama Pasillo B M4", "1", "Planta Baja", 714.5, 439.5, 25.0, 54.0),
            new Shelf("PB-KUR-A05", "Kuriyama", "Kuriyama Pasillo A M5", "1", "Planta Baja", 686.6, 498.3, 25.0, 54.0),
            new Shelf("PB-KUR-B05", "Kuriyama", "Kuriyama Pasillo B M5", "1", "Planta Baja", 714.5, 498.3, 25.0, 54.0),
            new Shelf("PB-KUR-A06", "Kuriyama", "Kuriyama Pasillo A M6", "1", "Planta Baja", 686.6, 557.1, 25.0, 54.0),
            new Shelf("PB-KUR-B06", "Kuriyama", "Kuriyama Pasillo B M6", "1", "Planta Baja", 714.5, 557.1, 25.0, 54.0),
            new Shelf("PB-KUR-A07", "Kuriyama", "Kuriyama Pasillo A M7", "1", "Planta Baja", 686.6, 615.9, 25.0, 54.0),
            new Shelf("PB-KUR-B07", "Kuriyama", "Kuriyama Pasillo B M7", "1", "Planta Baja", 714.5, 615.9, 25.0, 54.0),
            new Shelf("PB-PEN-01", "Pendiente", "Bahía Pendiente 1", "1", "Planta Baja", 783.3, 144.0, 25.0, 54.0),
            new Shelf("PB3-01", "Acero", "Acero 1 - Fondo Pasillo", "1", "Planta Baja", 810.0, 104.0, 95.4, 34.0),
            new Shelf("PB3-02", "Acero", "Pasillo Acero 2", "1", "Planta Baja", 810.0, 144.0, 25.0, 54.0),
            new Shelf("PB-PEN-02", "Pendiente", "Bahía Pendiente 2", "1", "Planta Baja", 783.3, 203.4, 25.0, 54.0),
            new Shelf("PB3-03", "Acero", "Pasillo Acero 3", "1", "Planta Baja", 810.0, 203.4, 25.0, 54.0),
            new Shelf("PB-PEN-03", "Pendiente", "Bahía Pendiente 3", "1", "Planta Baja", 783.3, 263.1, 25.0, 54.0),
            new Shelf("PB3-04", "Acero", "Pasillo Acero 4", "1", "Planta Baja", 810.0, 263.1, 25.0, 54.0),
            new Shelf("PB-PEN-04", "Pendiente", "Bahía Pendiente 4", "1", "Planta Baja", 783.3, 321.8, 25.0, 54.0),
            new Shelf("PB3-05", "Acero", "Pasillo Acero 5", "1", "Planta Baja", 810.0, 321.8, 25.0, 54.0),
            new Shelf("PB-PEN-05", "Pendiente", "Bahía Pendiente 5", "1", "Planta Baja", 783.3, 381.3, 25.0, 54.0),
            new Shelf("PB3-06", "Acero", "Pasillo Acero 6", "1", "Planta Baja", 810.0, 381.3, 25.0, 54.0),
            new Shelf("PB-PEN-06", "Pendiente", "Bahía Pendiente 6", "1", "Planta Baja", 783.3, 440.2, 25.0, 54.0),
            new Shelf("PB3-07", "Acero", "Pasillo Acero 7", "1", "Planta Baja", 810.0, 440.2, 25.0, 54.0),
            new Shelf("PB-PEN-07", "Pendiente", "Bahía Pendiente 7", "1", "Planta Baja", 783.3, 499.5, 25.0, 54.0),
            new Shelf("PB3-08", "Acero", "Pasillo Acero 8", "1", "Planta Baja", 810.0, 499.5, 25.0, 54.0),
            new Shelf("PB-PEN-08", "Pendiente", "Bahía Pendiente 8", "1", "Planta Baja", 783.3, 558.9, 25.0, 54.0),
            new Shelf("PB3-09", "Acero", "Pasillo Acero 9", "1", "Planta Baja", 810.0, 558.9, 25.0, 54.0),
            new Shelf("PB-PEN-09", "Pendiente", "Bahía Pendiente 9", "1", "Planta Baja", 783.3, 618.3, 25.0, 54.0),
            new Shelf("PB3-10", "Acero", "Pasillo Acero 10", "1", "Planta Baja", 810.0, 618.3, 25.0, 54.0),
            new Shelf("PB3-11", "Acero", "Pasillo Acero 11", "1", "Planta Baja", 880.4, 618.3, 25.0, 54.0),
            new Shelf("PB-YPC-01", "YPC", "Estantería YPC A1", "1", "Planta Baja", 907.0, 144.0, 25.0, 54.0),
            new Shelf("PB3-12", "Acero", "Pasillo Acero 12", "1", "Planta Baja", 880.4, 558.9, 25.0, 54.0),
            new Shelf("PB-YPC-02", "YPC", "Estantería YPC A2", "1", "Planta Baja", 907.0, 203.4, 25.0, 54.0),
            new Shelf("PB3-13", "Acero", "Pasillo Acero 13", "1", "Planta Baja", 880.4, 499.5, 25.0, 54.0),
            new Shelf("PB-YPC-03", "YPC", "Estantería YPC A3", "1", "Planta Baja", 907.0, 261.6, 25.0, 54.0),
            new Shelf("PB3-14", "Acero", "Pasillo Acero 14", "1", "Planta Baja", 880.4, 440.2, 25.0, 54.0),
            new Shelf("PB-YPC-04", "YPC", "Estantería YPC A4", "1", "Planta Baja", 907.0, 321.3, 25.0, 54.0),
            new Shelf("PB3-15", "Acero", "Pasillo Acero 15", "1", "Planta Baja", 880.4, 381.3, 25.0, 54.0),
            new Shelf("PB-YPC-05", "YPC", "Estantería YPC A5", "1", "Planta Baja", 907.0, 381.3, 25.0, 54.0),
            new Shelf("PB3-16", "Acero", "Pasillo Acero 16", "1", "Planta Baja", 880.4, 321.3, 25.0, 54.0),
            new Shelf("PB-YPC-06", "YPC", "Estantería YPC A6", "1", "Planta Baja", 907.0, 440.2, 25.0, 54.0),
            new Shelf("PB3-17", "Acero", "Pasillo Acero 17", "1", "Planta Baja", 880.4, 261.6, 25.0, 54.0),
            new Shelf("PB-YPC-07", "YPC", "Estantería YPC A7", "1", "Planta Baja", 907.0, 499.5, 25.0, 54.0),
            new Shelf("PB3-18", "Acero", "Pasillo Acero 18", "1", "Planta Baja", 880.4, 203.4, 25.0, 54.0),
            new Shelf("PB-YPC-08", "YPC", "Estantería YPC A8", "1", "Planta Baja", 907.0, 558.9, 25.0, 54.0),
            new Shelf("PB3-19", "Acero", "Pasillo Acero 19", "1", "Planta Baja", 880.4, 144.0, 25.0, 54.0),
            new Shelf("PB-YPC-09", "YPC", "Estantería YPC A9", "1", "Planta Baja", 907.0, 618.3, 25.0, 54.0),
            new Shelf("PB-YPC-10", "YPC", "Estantería YPC B0 - Fondo Pasillo", "1", "Planta Baja", 948.0, 104.0, 76.0, 34.0),
            new Shelf("PB-YPC-11", "YPC", "Estantería YPC B1", "1", "Planta Baja", 1001.2, 145.1, 25.0, 54.0),
            new Shelf("PB-YPC-16", "YPC", "Estantería YPC C1", "1", "Planta Baja", 1028.0, 145.1, 25.0, 54.0),
            new Shelf("PB-YPC-12", "YPC", "Estantería YPC B2", "1", "Planta Baja", 1001.2, 204.8, 25.0, 54.0),
            new Shelf("PB-YPC-17", "YPC", "Estantería YPC C2", "1", "Planta Baja", 1028.0, 204.8, 25.0, 54.0),
            new Shelf("PB-YPC-13", "YPC", "Estantería YPC B3", "1", "Planta Baja", 1001.2, 263.0, 25.0, 54.0),
            new Shelf("PB-YPC-18", "YPC", "Estantería YPC C3", "1", "Planta Baja", 1028.0, 263.0, 25.0, 54.0),
            new Shelf("PB-YPC-14", "YPC", "Estantería YPC B4", "1", "Planta Baja", 1001.2, 321.7, 25.0, 54.0),
            new Shelf("PB-YPC-19", "YPC", "Estantería YPC C4", "1", "Planta Baja", 1028.0, 321.7, 25.0, 54.0),
            new Shelf("PB-YPC-15", "YPC", "Estantería YPC B5", "1", "Planta Baja", 1001.2, 381.2, 25.0, 54.0),
            new Shelf("PB-YPC-20", "YPC", "Estantería YPC C5", "1", "Planta Baja", 1028.0, 381.2, 25.0, 54.0),
            new Shelf("PB-YPC-21", "YPC", "Estantería YPC C6", "1", "Planta Baja", 1028.0, 440.1, 25.0, 54.0),
            // Columna Vertical: Nivel 1 Dixon, Niveles 2 a 6 Conexiones Hidráulicas
            new Shelf("PB-DIX-01", "Dixon", "Dixon Bahía 1", "1", "Planta Baja", 1195.1, 141.8, 25.0, 54.0),
            new Shelf("PB-DIX-02", "Dixon", "Dixon Bahía 2", "1", "Planta Baja", 1222.0, 141.8, 25.0, 54.0),
            new Shelf("PB-CHID-A01", "Conexiones Hidráulicas", "Conexiones Hidráulicas A1", "1", "Planta Baja", 1195.1, 201.4, 25.0, 54.0),
            new Shelf("PB-CHID-B01", "Conexiones Hidráulicas", "Conexiones Hidráulicas B1", "1", "Planta Baja", 1222.0, 201.4, 25.0, 54.0),
            new Shelf("PB-CHID-A02", "Conexiones Hidráulicas", "Conexiones Hidráulicas A2", "1", "Planta Baja", 1195.1, 261.1, 25.0, 54.0),
            new Shelf("PB-CHID-B02", "Conexiones Hidráulicas", "Conexiones Hidráulicas B2", "1", "Planta Baja", 1222.0, 261.1, 25.0, 54.0),
            new Shelf("PB-CHID-A03", "Conexiones Hidráulicas", "Conexiones Hidráulicas A3", "1", "Planta Baja", 1195.1, 320.4, 25.0, 54.0),
            new Shelf("PB-CHID-B03", "Conexiones Hidráulicas", "Conexiones Hidráulicas B3", "1", "Planta Baja", 1222.0, 320.4, 25.0, 54.0),
            new Shelf("PB-CHID-A04", "Conexiones Hidráulicas", "Conexiones Hidráulicas A4", "1", "Planta Baja", 1195.1, 380.1, 25.0, 54.0),
            new Shelf("PB-CHID-B04", "Conexiones Hidráulicas", "Conexiones Hidráulicas B4", "1", "Planta Baja", 1222.0, 380.1, 25.0, 54.0),
            new Shelf("PB-CHID-A05", "Conexiones Hidráulicas", "Conexiones Hidráulicas A5", "1", "Planta Baja", 1195.1, 440.1, 25.0, 54.0),
            new Shelf("PB-CHID-B05", "Conexiones Hidráulicas", "Conexiones Hidráulicas B5", "1", "Planta Baja", 1222.0, 440.1, 25.0, 54.0),

            // Muro Norte: Parker Inox (Horizontal)
            new Shelf("PB-INOX-01", "Parker Inox", "Parker Inox - Muro Norte", "1", "Planta Baja", 1258.0, 96.0, 68.0, 42.0),

            // Muro Este Inclinado: Conexiones Hidráulicas (PB-CHID-W01..W05)
            new Shelf("PB-CHID-W01", "Conexiones Hidráulicas", "Conex. Hidráulicas Muro Este 1", "1", "Planta Baja", 1308.0, 175.0, 54.0, 60.0),
            new Shelf("PB-CHID-W02", "Conexiones Hidráulicas", "Conex. Hidráulicas Muro Este 2", "1", "Planta Baja", 1299.0, 242.0, 54.0, 60.0),
            new Shelf("PB-CHID-W03", "Conexiones Hidráulicas", "Conex. Hidráulicas Muro Este 3", "1", "Planta Baja", 1290.0, 309.0, 54.0, 60.0),
            new Shelf("PB-CHID-W04", "Conexiones Hidráulicas", "Conex. Hidráulicas Muro Este 4", "1", "Planta Baja", 1281.0, 376.0, 54.0, 60.0),
            new Shelf("PB-CHID-W05", "Conexiones Hidráulicas", "Conex. Hidráulicas Muro Este 5", "1", "Planta Baja", 1272.0, 443.0, 54.0, 60.0),
            new Shelf("PB-CYB-01", "Cybermatics", "Gabinete Cybermatics 1", "1", "Planta Baja", 500.3, 721.4, 54.0, 48.0),
            new Shelf("PB-CYB-02", "Cybermatics", "Gabinete Cybermatics 2", "1", "Planta Baja", 559.4, 721.4, 54.0, 48.0),
            new Shelf("PB-CYB-03", "Cybermatics", "Gabinete Cybermatics 3", "1", "Planta Baja", 619.0, 721.4, 54.0, 48.0),
            new Shelf("PB-UNI-01", "Universal", "Universal 1", "1", "Planta Baja", 677.9, 721.4, 54.0, 48.0),
            new Shelf("PB-UNI-02", "Universal", "Universal 2", "1", "Planta Baja", 737.5, 721.4, 54.0, 48.0),
            new Shelf("PB-UNI-03", "Universal", "Universal 3", "1", "Planta Baja", 796.5, 721.4, 54.0, 48.0),

            // === PLANTA ALTA (83 Anaqueles Reales: Total 170 anaqueles oficiales sin Documentos) ===
            new Shelf("PA-FNH-01", "FNH", "FNH Estante 1", "1", "Planta Alta", 260.0, 195.1, 54.0, 54.0),
            new Shelf("PA-HTM-01", "HTM", "HTM Estante 1", "1", "Planta Alta", 260.0, 254.5, 54.0, 54.0),
            new Shelf("PA-ABR-01", "Abrazaderas", "Abrazaderas Estante 1", "1", "Planta Alta", 260.0, 313.6, 54.0, 54.0),
            new Shelf("PA-ENP-01", "ENPA", "ENPA Estante 1", "1", "Planta Alta", 260.0, 372.9, 54.0, 54.0),

            // Reserva Acero Noroeste, Noreste y Sur (Cajas horizontales sobre contorno arquitectonico exacto)
            new Shelf("PA-RES-01", "Reserva Acero", "Reserva Acero Noroeste", "1", "Planta Alta", 380.0, 107.0, 74.0, 42.0),
            new Shelf("PA-RES-02", "Reserva Acero", "Reserva Acero Noreste", "1", "Planta Alta", 494.0, 107.0, 86.0, 42.0),
            new Shelf("PA-RES-03", "Reserva Acero", "Reserva Acero Sur", "1", "Planta Alta", 454.5, 405.0, 39.5, 36.0),

            // Columna Vertical Dividida: Izquierda Reserva Acero (454.5) | Derecha PVC (474.0) - Encastre 100% Plano
            new Shelf("PA-RES-A01", "Reserva Acero", "Reserva Acero Vertical 1", "1", "Planta Alta", 454.5, 107.0, 19.5, 57.0),
            new Shelf("PA-PVC-01", "PVC", "PVC Anaquel 1", "1", "Planta Alta", 474.0, 107.0, 20.0, 57.0),
            new Shelf("PA-RES-A02", "Reserva Acero", "Reserva Acero Vertical 2", "1", "Planta Alta", 454.5, 166.5, 19.5, 57.0),
            new Shelf("PA-PVC-02", "PVC", "PVC Anaquel 2", "1", "Planta Alta", 474.0, 166.5, 20.0, 57.0),
            new Shelf("PA-RES-A03", "Reserva Acero", "Reserva Acero Vertical 3", "1", "Planta Alta", 454.5, 226.0, 19.5, 57.0),
            new Shelf("PA-PVC-03", "PVC", "PVC Anaquel 3", "1", "Planta Alta", 474.0, 226.0, 20.0, 57.0),
            new Shelf("PA-RES-A04", "Reserva Acero", "Reserva Acero Vertical 4", "1", "Planta Alta", 454.5, 285.5, 19.5, 57.0),
            new Shelf("PA-PVC-04", "PVC", "PVC Anaquel 4", "1", "Planta Alta", 474.0, 285.5, 20.0, 57.0),
            new Shelf("PA-RES-A05", "Reserva Acero", "Reserva Acero Vertical 5", "1", "Planta Alta", 454.5, 345.0, 19.5, 57.0),
            new Shelf("PA-PVC-05", "PVC", "PVC Anaquel 5", "1", "Planta Alta", 474.0, 345.0, 20.0, 57.0),

            // Pasillo 1 (P1): Izquierda Sin Asignar (603.5) | Derecha HCO Gen & Parker Hidraulico (623.0)
            new Shelf("PA-SIN-01", "Sin Asignar", "Sin Asignar 1-1", "1", "Planta Alta", 603.5, 107.0, 18.5, 57.0),
            new Shelf("PA-HCO-01", "HCO Gen", "HCO GEN 1", "1", "Planta Alta", 623.0, 107.0, 18.5, 57.0),
            new Shelf("PA-SIN-02", "Sin Asignar", "Sin Asignar 1-2", "1", "Planta Alta", 603.5, 166.5, 18.5, 57.0),
            new Shelf("PA-PHID-01", "Parker Hidráulico", "Parker Hidráulico 1", "1", "Planta Alta", 623.0, 166.5, 18.5, 57.0),
            new Shelf("PA-SIN-03", "Sin Asignar", "Sin Asignar 1-3", "1", "Planta Alta", 603.5, 226.0, 18.5, 57.0),
            new Shelf("PA-PHID-02", "Parker Hidráulico", "Parker Hidráulico 2", "1", "Planta Alta", 623.0, 226.0, 18.5, 57.0),
            new Shelf("PA-SIN-04", "Sin Asignar", "Sin Asignar 1-4", "1", "Planta Alta", 603.5, 285.5, 18.5, 57.0),
            new Shelf("PA-PHID-03", "Parker Hidráulico", "Parker Hidráulico 3", "1", "Planta Alta", 623.0, 285.5, 18.5, 57.0),
            new Shelf("PA-SIN-05", "Sin Asignar", "Sin Asignar 1-5", "1", "Planta Alta", 603.5, 345.0, 18.5, 57.0),
            new Shelf("PA-PHID-04", "Parker Hidráulico", "Parker Hidráulico 4", "1", "Planta Alta", 623.0, 345.0, 18.5, 57.0),
            new Shelf("PA-SIN-06", "Sin Asignar", "Sin Asignar 1-6", "1", "Planta Alta", 603.5, 404.5, 18.5, 57.0),
            new Shelf("PA-PHID-05", "Parker Hidráulico", "Parker Hidráulico 5", "1", "Planta Alta", 623.0, 404.5, 18.5, 57.0),

            // Pasillo 2 (P2): Izquierda Sin Asignar (857.0) | Derecha Parker Neumatico (877.5)
            new Shelf("PA-SIN-07", "Sin Asignar", "Sin Asignar 2-1", "1", "Planta Alta", 857.0, 107.0, 19.5, 57.0),
            new Shelf("PA-PNEU-01", "Parker Neumático", "Parker Neumático 1", "1", "Planta Alta", 877.5, 107.0, 19.5, 57.0),
            new Shelf("PA-SIN-08", "Sin Asignar", "Sin Asignar 2-2", "1", "Planta Alta", 857.0, 166.5, 19.5, 57.0),
            new Shelf("PA-PNEU-02", "Parker Neumático", "Parker Neumático 2", "1", "Planta Alta", 877.5, 166.5, 19.5, 57.0),
            new Shelf("PA-SIN-09", "Sin Asignar", "Sin Asignar 2-3", "1", "Planta Alta", 857.0, 226.0, 19.5, 57.0),
            new Shelf("PA-PNEU-03", "Parker Neumático", "Parker Neumático 3", "1", "Planta Alta", 877.5, 226.0, 19.5, 57.0),
            new Shelf("PA-SIN-10", "Sin Asignar", "Sin Asignar 2-4", "1", "Planta Alta", 857.0, 285.5, 19.5, 57.0),
            new Shelf("PA-PNEU-04", "Parker Neumático", "Parker Neumático 4", "1", "Planta Alta", 877.5, 285.5, 19.5, 57.0),
            new Shelf("PA-SIN-11", "Sin Asignar", "Sin Asignar 2-5", "1", "Planta Alta", 857.0, 345.0, 19.5, 57.0),
            new Shelf("PA-PNEU-05", "Parker Neumático", "Parker Neumático 5", "1", "Planta Alta", 877.5, 345.0, 19.5, 57.0),
            new Shelf("PA-SIN-12", "Sin Asignar", "Sin Asignar 2-6", "1", "Planta Alta", 857.0, 404.5, 19.5, 57.0),
            new Shelf("PA-PNEU-06", "Parker Neumático", "Parker Neumático 6", "1", "Planta Alta", 877.5, 404.5, 19.5, 57.0),

            // Pasillo 3 (P3): Izquierda Vacio (954.0) | Derecha Asco Festo / SMC (973.5)
            new Shelf("PA-VAC-01", "Vacío", "Vacío Anaquel 1", "1", "Planta Alta", 954.0, 107.0, 19.0, 57.0),
            new Shelf("PA-FEST-01", "Asco Festo / SMC", "Asco Festo / SMC 1", "1", "Planta Alta", 973.5, 107.0, 19.0, 57.0),
            new Shelf("PA-VAC-02", "Vacío", "Vacío Anaquel 2", "1", "Planta Alta", 954.0, 166.5, 19.0, 57.0),
            new Shelf("PA-FEST-02", "Asco Festo / SMC", "Asco Festo / SMC 2", "1", "Planta Alta", 973.5, 166.5, 19.0, 57.0),
            new Shelf("PA-VAC-03", "Vacío", "Vacío Anaquel 3", "1", "Planta Alta", 954.0, 226.0, 19.0, 57.0),
            new Shelf("PA-FEST-03", "Asco Festo / SMC", "Asco Festo / SMC 3", "1", "Planta Alta", 973.5, 226.0, 19.0, 57.0),
            new Shelf("PA-VAC-04", "Vacío", "Vacío Anaquel 4", "1", "Planta Alta", 954.0, 285.5, 19.0, 57.0),
            new Shelf("PA-FEST-04", "Asco Festo / SMC", "Asco Festo / SMC 4", "1", "Planta Alta", 973.5, 285.5, 19.0, 57.0),
            new Shelf("PA-VAC-05", "Vacío", "Vacío Anaquel 5", "1", "Planta Alta", 954.0, 345.0, 19.0, 57.0),
            new Shelf("PA-FEST-05", "Asco Festo / SMC", "Asco Festo / SMC 5", "1", "Planta Alta", 973.5, 345.0, 19.0, 57.0),
            new Shelf("PA-VAC-06", "Vacío", "Vacío Anaquel 6", "1", "Planta Alta", 954.0, 404.5, 19.0, 57.0),
            new Shelf("PA-FEST-06", "Asco Festo / SMC", "Asco Festo / SMC 6", "1", "Planta Alta", 973.5, 404.5, 19.0, 57.0),

            // Pasillo 4 (P4): Sellos Pasillo 1-A (1050.5) | Sellos Pasillo 1-B (1070.5)
            new Shelf("PA-SEL-1A-01", "Sellos", "Sellos Pasillo 1-A 1", "1", "Planta Alta", 1050.5, 107.0, 19.0, 57.0),
            new Shelf("PA-SEL-1B-01", "Sellos", "Sellos Pasillo 1-B 1", "1", "Planta Alta", 1070.5, 107.0, 19.5, 57.0),
            new Shelf("PA-SEL-1A-02", "Sellos", "Sellos Pasillo 1-A 2", "1", "Planta Alta", 1050.5, 166.5, 19.0, 57.0),
            new Shelf("PA-SEL-1B-02", "Sellos", "Sellos Pasillo 1-B 2", "1", "Planta Alta", 1070.5, 166.5, 19.5, 57.0),
            new Shelf("PA-SEL-1A-03", "Sellos", "Sellos Pasillo 1-A 3", "1", "Planta Alta", 1050.5, 226.0, 19.0, 57.0),
            new Shelf("PA-SEL-1B-03", "Sellos", "Sellos Pasillo 1-B 3", "1", "Planta Alta", 1070.5, 226.0, 19.5, 57.0),
            new Shelf("PA-SEL-1A-04", "Sellos", "Sellos Pasillo 1-A 4", "1", "Planta Alta", 1050.5, 285.5, 19.0, 57.0),
            new Shelf("PA-SEL-1B-04", "Sellos", "Sellos Pasillo 1-B 4", "1", "Planta Alta", 1070.5, 285.5, 19.5, 57.0),
            new Shelf("PA-SEL-1A-05", "Sellos", "Sellos Pasillo 1-A 5", "1", "Planta Alta", 1050.5, 345.0, 19.0, 57.0),
            new Shelf("PA-SEL-1B-05", "Sellos", "Sellos Pasillo 1-B 5", "1", "Planta Alta", 1070.5, 345.0, 19.5, 57.0),
            new Shelf("PA-SEL-1A-06", "Sellos", "Sellos Pasillo 1-A 6", "1", "Planta Alta", 1050.5, 404.5, 19.0, 57.0),
            new Shelf("PA-SEL-1B-06", "Sellos", "Sellos Pasillo 1-B 6", "1", "Planta Alta", 1070.5, 404.5, 19.5, 57.0),

            // Pasillo 5 (P5): Sellos Pasillo 2-A (1169.5) | Sellos Pasillo 2-B (1189.5)
            new Shelf("PA-SEL-2A-01", "Sellos", "Sellos Pasillo 2-A 1", "1", "Planta Alta", 1169.5, 107.0, 19.5, 57.0),
            new Shelf("PA-SEL-2B-01", "Sellos", "Sellos Pasillo 2-B 1", "1", "Planta Alta", 1189.5, 107.0, 19.5, 57.0),
            new Shelf("PA-SEL-2A-02", "Sellos", "Sellos Pasillo 2-A 2", "1", "Planta Alta", 1169.5, 166.5, 19.5, 57.0),
            new Shelf("PA-SEL-2B-02", "Sellos", "Sellos Pasillo 2-B 2", "1", "Planta Alta", 1189.5, 166.5, 19.5, 57.0),
            new Shelf("PA-SEL-2A-03", "Sellos", "Sellos Pasillo 2-A 3", "1", "Planta Alta", 1169.5, 226.0, 19.5, 57.0),
            new Shelf("PA-SEL-2B-03", "Sellos", "Sellos Pasillo 2-B 3", "1", "Planta Alta", 1189.5, 226.0, 19.5, 57.0),
            new Shelf("PA-SEL-2A-04", "Sellos", "Sellos Pasillo 2-A 4", "1", "Planta Alta", 1169.5, 285.5, 19.5, 57.0),
            new Shelf("PA-SEL-2B-04", "Sellos", "Sellos Pasillo 2-B 4", "1", "Planta Alta", 1189.5, 285.5, 19.5, 57.0),
            new Shelf("PA-SEL-2A-05", "Sellos", "Sellos Pasillo 2-A 5", "1", "Planta Alta", 1169.5, 345.0, 19.5, 57.0),
            new Shelf("PA-SEL-2B-05", "Sellos", "Sellos Pasillo 2-B 5", "1", "Planta Alta", 1189.5, 345.0, 19.5, 57.0),
            new Shelf("PA-SEL-2A-06", "Sellos", "Sellos Pasillo 2-A 6", "1", "Planta Alta", 1169.5, 404.5, 19.5, 57.0),
            new Shelf("PA-SEL-2B-06", "Sellos", "Sellos Pasillo 2-B 6", "1", "Planta Alta", 1189.5, 404.5, 19.5, 57.0),

            // Sellos Muro Este (Diagonal siguiendo la inclinación del muro hacia escaleras)
            new Shelf("PA-SEL-W-01", "Sellos", "Sellos Muro Este 1", "1", "Planta Alta", 1317.0, 107.0, 54.0, 52.0),
            new Shelf("PA-SEL-W-02", "Sellos", "Sellos Muro Este 2", "1", "Planta Alta", 1309.0, 166.5, 54.0, 52.0),
            new Shelf("PA-SEL-W-03", "Sellos", "Sellos Muro Este 3", "1", "Planta Alta", 1301.0, 226.0, 54.0, 52.0),
            new Shelf("PA-SEL-W-04", "Sellos", "Sellos Muro Este 4", "1", "Planta Alta", 1292.0, 285.5, 54.0, 52.0),
            new Shelf("PA-SEL-W-05", "Sellos", "Sellos Muro Este 5", "1", "Planta Alta", 1284.0, 345.0, 54.0, 52.0),
            new Shelf("PA-SEL-W-06", "Sellos", "Sellos Muro Este 6", "1", "Planta Alta", 1276.0, 404.5, 54.0, 52.0)
        );
    }

    private void sanitizeSqliteTimestamps() {
        String[] tables = {"count_records", "shelf_assignments", "products", "inventory_sessions", "audit_logs"};
        for (String table : tables) {
            try {
                List<Map<String, Object>> columns = jdbcTemplate.queryForList("PRAGMA table_info(" + table + ")");
                for (Map<String, Object> col : columns) {
                    String colName = (String) col.get("name");
                    if (colName != null && (colName.endsWith("_at") || colName.contains("time") || colName.contains("date"))) {
                        List<Map<String, Object>> textRows = jdbcTemplate.queryForList(
                                "SELECT id, " + colName + " FROM " + table + " WHERE typeof(" + colName + ") = 'text'");
                        for (Map<String, Object> row : textRows) {
                            Object id = row.get("id");
                            Object val = row.get(colName);
                            if (val != null) {
                                Long epochMs = parseToEpochMs(val.toString());
                                if (epochMs != null) {
                                    jdbcTemplate.update("UPDATE " + table + " SET " + colName + " = ? WHERE id = ?", epochMs, id);
                                }
                            }
                        }
                    }
                }
            } catch (Exception ignored) {}
        }
    }

    private Long parseToEpochMs(String str) {
        if (str == null || str.isBlank()) return null;
        try {
            return Long.parseLong(str.trim());
        } catch (NumberFormatException ignored) {}

        String s = str.trim().replace(' ', 'T');
        try {
            return java.time.LocalDateTime.parse(s).atZone(java.time.ZoneId.systemDefault()).toInstant().toEpochMilli();
        } catch (Exception ignored) {}
        try {
            if (!s.contains(".")) {
                return java.time.LocalDateTime.parse(s, java.time.format.DateTimeFormatter.ISO_LOCAL_DATE_TIME)
                        .atZone(java.time.ZoneId.systemDefault()).toInstant().toEpochMilli();
            }
        } catch (Exception ignored) {}
        return null;
    }
}

