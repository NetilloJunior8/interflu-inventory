package com.interflu.inventory.controller;

import com.interflu.inventory.model.InventorySession;
import com.interflu.inventory.model.Shelf;
import com.interflu.inventory.model.ShelfAssignment;
import com.interflu.inventory.model.User;
import com.interflu.inventory.repository.CountRecordRepository;
import com.interflu.inventory.repository.InventorySessionRepository;
import com.interflu.inventory.repository.ShelfAssignmentRepository;
import com.interflu.inventory.repository.ShelfRepository;
import com.interflu.inventory.security.CurrentUserHelper;
import com.interflu.inventory.service.AuditService;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/shelves")
public class ShelfController {

    private final ShelfRepository shelfRepo;
    private final ShelfAssignmentRepository assignmentRepo;
    private final InventorySessionRepository sessionRepo;
    private final CountRecordRepository countRepo;
    private final CurrentUserHelper userHelper;
    private final AuditService auditService;

    public ShelfController(ShelfRepository shelfRepo,
                           ShelfAssignmentRepository assignmentRepo,
                           InventorySessionRepository sessionRepo,
                           CountRecordRepository countRepo,
                           CurrentUserHelper userHelper,
                           AuditService auditService) {
        this.shelfRepo = shelfRepo;
        this.assignmentRepo = assignmentRepo;
        this.sessionRepo = sessionRepo;
        this.countRepo = countRepo;
        this.userHelper = userHelper;
        this.auditService = auditService;
    }

    @GetMapping
    public List<Shelf> listAll(@RequestParam(required = false) String plant) {
        if (plant != null && !plant.isBlank()) {
            return shelfRepo.findByPlantAndActiveTrueOrderByCodeAsc(plant);
        }
        return shelfRepo.findByActiveTrueOrderByCodeAsc();
    }

    @PostMapping
    @Transactional
    public ResponseEntity<?> createShelf(@RequestBody Shelf shelf) {
        User currentUser = userHelper.getCurrentUser();
        if (shelf.getCode() == null || shelf.getCode().isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("message", "El código de anaquel es obligatorio."));
        }
        shelf.setCode(shelf.getCode().trim().toUpperCase());
        if (shelfRepo.findByCodeIgnoreCase(shelf.getCode()).isPresent()) {
            return ResponseEntity.badRequest().body(Map.of("message", "Ya existe un anaquel con el código " + shelf.getCode()));
        }
        if (shelf.getPlant() == null || shelf.getPlant().isBlank()) {
            shelf.setPlant("Planta Baja");
        }
        if (shelf.getWarehouseCode() == null || shelf.getWarehouseCode().isBlank()) {
            shelf.setWarehouseCode("1");
        }
        if (shelf.getWidth() == null || shelf.getWidth() <= 0) {
            shelf.setWidth(25.0);
        }
        if (shelf.getHeight() == null || shelf.getHeight() <= 0) {
            shelf.setHeight(54.0);
        }
        if (shelf.getPosX() == null) shelf.setPosX(900.0);
        if (shelf.getPosY() == null) shelf.setPosY(200.0);
        shelf.setActive(true);

        Shelf saved = shelfRepo.save(shelf);

        // Automatically assign this new shelf to any active / non-closed inventory sessions
        List<InventorySession> openSessions = sessionRepo.findAll().stream()
                .filter(s -> s.getStatus() != InventorySession.Status.CERRADO_EXITO && s.getStatus() != InventorySession.Status.CERRADO_NO_EXITO)
                .collect(Collectors.toList());
        for (InventorySession s : openSessions) {
            if (assignmentRepo.findBySessionIdAndShelfId(s.getId(), saved.getId()).isEmpty()) {
                ShelfAssignment sa = new ShelfAssignment(s, saved, currentUser);
                sa.setStatus(ShelfAssignment.Status.PENDIENTE);
                assignmentRepo.save(sa);
            }
        }

        auditService.log(null, null, currentUser.getUsername(), currentUser.getFullName(),
                "CREAR_ANAQUEL", "Shelf", saved.getId(), null, saved.getCode(),
                "Creado anaquel " + saved.getCode() + " en " + saved.getPlant() + " (" + saved.getZone() + ")");
        return ResponseEntity.ok(saved);
    }

    @PutMapping("/{id}")
    @Transactional
    public ResponseEntity<?> updateShelf(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        User currentUser = userHelper.getCurrentUser();
        Shelf s = shelfRepo.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Anaquel no encontrado"));

        String oldCode = s.getCode();
        if (body.containsKey("code")) {
            String newCode = String.valueOf(body.get("code")).trim().toUpperCase();
            if (newCode.isBlank()) {
                return ResponseEntity.badRequest().body(Map.of("message", "El código no puede estar vacío."));
            }
            if (!newCode.equalsIgnoreCase(oldCode)) {
                if (shelfRepo.findByCodeIgnoreCase(newCode).isPresent()) {
                    return ResponseEntity.badRequest().body(Map.of("message", "Ya existe otro anaquel con el código " + newCode));
                }
                s.setCode(newCode);
            }
        }
        if (body.containsKey("zone") && body.get("zone") != null) {
            s.setZone(String.valueOf(body.get("zone")).trim());
        }
        if (body.containsKey("description")) {
            s.setDescription(body.get("description") != null ? String.valueOf(body.get("description")).trim() : "");
        }
        if (body.containsKey("plant") && body.get("plant") != null) {
            s.setPlant(String.valueOf(body.get("plant")).trim());
        }
        if (body.containsKey("warehouseCode") && body.get("warehouseCode") != null) {
            s.setWarehouseCode(String.valueOf(body.get("warehouseCode")).trim());
        }

        Shelf saved = shelfRepo.save(s);
        auditService.log(null, null, currentUser.getUsername(), currentUser.getFullName(),
                "EDITAR_ANAQUEL", "Shelf", saved.getId(),
                oldCode, saved.getCode(),
                String.format("Anaquel actualizado: %s -> %s | Zona: %s | Planta: %s",
                        oldCode, saved.getCode(), saved.getZone(), saved.getPlant()));

        return ResponseEntity.ok(saved);
    }

    @DeleteMapping("/{id}")
    @Transactional
    public ResponseEntity<?> deleteShelf(@PathVariable Long id) {
        User currentUser = userHelper.getCurrentUser();
        Shelf s = shelfRepo.findById(id).orElseThrow(() -> new IllegalArgumentException("Anaquel no encontrado"));

        long countRecords = countRepo.findByShelfId(id).size();
        if (countRecords > 0) {
            return ResponseEntity.badRequest().body(Map.of(
                    "message", "No se puede eliminar el anaquel " + s.getCode() + " porque tiene " + countRecords + " partidas contadas registradas en el inventario. Desaloje o reasigne los materiales primero."
            ));
        }

        List<ShelfAssignment> assignments = assignmentRepo.findByShelfId(id);
        assignmentRepo.deleteAll(assignments);

        s.setActive(false);
        shelfRepo.delete(s);

        auditService.log(null, null, currentUser.getUsername(), currentUser.getFullName(),
                "ELIMINAR_ANAQUEL", "Shelf", id, s.getCode(), null,
                "Anaquel eliminado: " + s.getCode());
        return ResponseEntity.ok(Map.of("status", "ok", "message", "Anaquel " + s.getCode() + " eliminado exitosamente."));
    }

    @PutMapping("/batch-update")
    @Transactional
    public ResponseEntity<?> batchUpdateShelves(@RequestBody List<Map<String, Object>> items) {
        User currentUser = userHelper.getCurrentUser();
        if (items == null || items.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("message", "Lista vacía"));
        }

        List<Shelf> updatedList = new ArrayList<>();
        // Phase 1: temporary codes to avoid unique constraint collisions during batch swap
        for (Map<String, Object> map : items) {
            if (!map.containsKey("id") || map.get("id") == null) continue;
            Long id = ((Number) map.get("id")).longValue();
            Shelf s = shelfRepo.findById(id).orElse(null);
            if (s != null && map.containsKey("code")) {
                String targetCode = String.valueOf(map.get("code")).trim().toUpperCase();
                if (!targetCode.equalsIgnoreCase(s.getCode())) {
                    s.setCode("TMP_" + id + "_" + targetCode);
                    shelfRepo.save(s);
                }
            }
        }

        // Phase 2: apply final codes and fields
        for (Map<String, Object> map : items) {
            if (!map.containsKey("id") || map.get("id") == null) continue;
            Long id = ((Number) map.get("id")).longValue();
            Shelf s = shelfRepo.findById(id).orElse(null);
            if (s == null) continue;

            if (map.containsKey("code")) {
                String targetCode = String.valueOf(map.get("code")).trim().toUpperCase();
                if (!targetCode.isBlank()) s.setCode(targetCode);
            }
            if (map.containsKey("description")) {
                s.setDescription(map.get("description") != null ? String.valueOf(map.get("description")).trim() : "");
            }
            if (map.containsKey("zone") && map.get("zone") != null) {
                s.setZone(String.valueOf(map.get("zone")).trim());
            }
            if (map.containsKey("plant") && map.get("plant") != null) {
                s.setPlant(String.valueOf(map.get("plant")).trim());
            }
            if (map.containsKey("posX")) s.setPosX(((Number) map.get("posX")).doubleValue());
            if (map.containsKey("posY")) s.setPosY(((Number) map.get("posY")).doubleValue());
            if (map.containsKey("width")) s.setWidth(((Number) map.get("width")).doubleValue());
            if (map.containsKey("height")) s.setHeight(((Number) map.get("height")).doubleValue());

            updatedList.add(shelfRepo.save(s));
        }

        auditService.log(null, null, currentUser.getUsername(), currentUser.getFullName(),
                "ACTUALIZACION_MASIVA_ANAQUELES", "Shelf", null, null, String.valueOf(updatedList.size()),
                "Actualización masiva de nombres/propiedades de " + updatedList.size() + " anaqueles.");

        return ResponseEntity.ok(Map.of("status", "ok", "updated", updatedList.size()));
    }

    @PutMapping("/{id}/layout")
    public ResponseEntity<?> updateLayout(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        Shelf s = shelfRepo.findById(id).orElseThrow(() -> new IllegalArgumentException("Anaquel no encontrado"));
        if (body.containsKey("posX")) s.setPosX(((Number) body.get("posX")).doubleValue());
        if (body.containsKey("posY")) s.setPosY(((Number) body.get("posY")).doubleValue());
        if (body.containsKey("width")) s.setWidth(((Number) body.get("width")).doubleValue());
        if (body.containsKey("height")) s.setHeight(((Number) body.get("height")).doubleValue());
        if (body.containsKey("plant")) s.setPlant(String.valueOf(body.get("plant")));
        shelfRepo.save(s);
        return ResponseEntity.ok(s);
    }

    @PutMapping("/batch-layout")
    public ResponseEntity<?> batchUpdateLayout(@RequestBody List<Map<String, Object>> items) {
        User currentUser = userHelper.getCurrentUser();
        for (Map<String, Object> body : items) {
            if (body.containsKey("id")) {
                Long id = ((Number) body.get("id")).longValue();
                shelfRepo.findById(id).ifPresent(s -> {
                    if (body.containsKey("posX")) s.setPosX(((Number) body.get("posX")).doubleValue());
                    if (body.containsKey("posY")) s.setPosY(((Number) body.get("posY")).doubleValue());
                    if (body.containsKey("width")) s.setWidth(((Number) body.get("width")).doubleValue());
                    if (body.containsKey("height")) s.setHeight(((Number) body.get("height")).doubleValue());
                    if (body.containsKey("plant")) s.setPlant(String.valueOf(body.get("plant")));
                    shelfRepo.save(s);
                });
            }
        }
        auditService.log(null, null, currentUser.getUsername(), currentUser.getFullName(),
                "AJUSTE_PLANO_CROQUIS", "Shelf", null, null, String.valueOf(items.size()),
                "Ajuste manual de coordenadas de " + items.size() + " anaqueles en croquis.");
        return ResponseEntity.ok(Map.of("status", "ok", "updated", items.size()));
    }
}
