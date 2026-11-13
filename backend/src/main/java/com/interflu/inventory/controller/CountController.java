package com.interflu.inventory.controller;

import com.interflu.inventory.dto.CountDto;
import com.interflu.inventory.model.CountRecord;
import com.interflu.inventory.model.User;
import com.interflu.inventory.security.CurrentUserHelper;
import com.interflu.inventory.service.CountService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.*;

@RestController
@RequestMapping("/api/counts")
public class CountController {

    private final CountService countService;
    private final CurrentUserHelper userHelper;

    public CountController(CountService countService, CurrentUserHelper userHelper) {
        this.countService = countService;
        this.userHelper = userHelper;
    }

    @GetMapping("/check-duplicate")
    public ResponseEntity<?> checkDuplicate(@RequestParam Long sessionId,
                                            @RequestParam Long shelfId,
                                            @RequestParam String code) {
        User currentUser = userHelper.getCurrentUser();
        return ResponseEntity.ok(countService.checkDuplicate(sessionId, shelfId, code, currentUser));
    }

    @PostMapping
    public ResponseEntity<?> saveCount(@RequestBody CountDto.CountRequest req) {
        User currentUser = userHelper.getCurrentUser();
        try {
            CountRecord saved = countService.saveCount(req, currentUser);
            return ResponseEntity.ok(toDto(saved));
        } catch (IllegalStateException e) {
            if (e.getMessage() != null && e.getMessage().startsWith("DUPLICATE_CODE:")) {
                String existingQty = e.getMessage().substring("DUPLICATE_CODE:".length());
                return ResponseEntity.status(409).body(Map.of(
                        "code", "DUPLICATE_IN_SHELF",
                        "existingQuantity", Double.parseDouble(existingQty),
                        "message", "Este código ya fue capturado en este anaquel con " + existingQty + " unidades."
                ));
            }
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        }
    }

    @PostMapping("/batch-sheet")
    public ResponseEntity<?> batchSaveSheet(@RequestBody CountDto.BatchSheetRequest req) {
        User currentUser = userHelper.getCurrentUser();
        try {
            List<CountRecord> saved = countService.batchSaveSheet(req, currentUser);
            return ResponseEntity.ok(saved.stream().map(this::toDto).toList());
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        }
    }

    @PostMapping("/import-excel")
    public ResponseEntity<?> importExcelCounts(@RequestParam Long sessionId,
                                               @RequestParam(required = false) Long shelfId,
                                               @RequestParam("file") MultipartFile file) {
        User currentUser = userHelper.getCurrentUser();
        try {
            Map<String, Object> result = countService.importExcelCounts(sessionId, shelfId, file, currentUser);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("message", "Error al importar Excel: " + e.getMessage()));
        }
    }

    @GetMapping
    public List<Map<String, Object>> listCounts(@RequestParam Long sessionId,
                                                @RequestParam(required = false) Long shelfId) {
        return countService.getCounts(sessionId, shelfId).stream()
                .map(this::toDto)
                .toList();
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> deleteCount(@PathVariable Long id) {
        User currentUser = userHelper.getCurrentUser();
        try {
            countService.deleteCount(id, currentUser);
            return ResponseEntity.ok(Map.of("deleted", true));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        }
    }

    private Map<String, Object> toDto(CountRecord r) {
        Map<String, Object> map = new HashMap<>();
        map.put("id", r.getId());
        map.put("sessionId", r.getSession().getId());
        map.put("shelfId", r.getShelf().getId());
        map.put("shelfCode", r.getShelf().getCode());
        map.put("shelfZone", r.getShelf().getZone());
        map.put("capturedCode", r.getCapturedCode());
        map.put("description", r.getProduct() != null ? r.getProduct().getDescription() : r.getCapturedCode());
        map.put("unit", r.getProduct() != null ? r.getProduct().getUnit() : "PZA");
        map.put("existsInCatalog", r.getProduct() != null);
        map.put("quantity", r.getQuantity());
        map.put("previousQuantity", r.getPreviousQuantity());
        map.put("stockSaE", r.getProduct() != null ? r.getProduct().getStockSaE() : 0.0);
        map.put("userName", r.getUser().getFullName());
        map.put("validationStatus", r.getValidationStatus().name());
        map.put("notes", r.getNotes());
        map.put("countedAt", r.getCountedAt());
        map.put("updatedAt", r.getUpdatedAt());
        return map;
    }
}
