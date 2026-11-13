package com.interflu.inventory.controller;

import com.interflu.inventory.model.Shelf;
import com.interflu.inventory.model.User;
import com.interflu.inventory.repository.ShelfRepository;
import com.interflu.inventory.security.CurrentUserHelper;
import com.interflu.inventory.service.AuditService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/shelves")
public class ShelfController {

    private final ShelfRepository shelfRepo;
    private final CurrentUserHelper userHelper;
    private final AuditService auditService;

    public ShelfController(ShelfRepository shelfRepo, CurrentUserHelper userHelper, AuditService auditService) {
        this.shelfRepo = shelfRepo;
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
            shelf.setPlant("Planta 1");
        }
        Shelf saved = shelfRepo.save(shelf);
        auditService.log(null, null, currentUser.getUsername(), currentUser.getFullName(),
                "CREAR_ANAQUEL", "Shelf", saved.getId(), null, saved.getCode(),
                "Creado anaquel " + saved.getCode() + " en " + saved.getPlant() + " (" + saved.getZone() + ")");
        return ResponseEntity.ok(saved);
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
