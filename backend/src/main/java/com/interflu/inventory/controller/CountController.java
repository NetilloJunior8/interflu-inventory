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
                                               @RequestParam(defaultValue = "SMART_MERGE") String mode,
                                               @RequestParam(defaultValue = "true", required = false) boolean filterObsolete,
                                               @RequestParam(required = false) String targetFamily,
                                               @RequestParam("file") MultipartFile file) {
        User currentUser = userHelper.getCurrentUser();
        try {
            Map<String, Object> result = countService.importExcelCounts(sessionId, shelfId, mode, filterObsolete, targetFamily, file, currentUser);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            e.printStackTrace();
            return ResponseEntity.badRequest().body(Map.of("message", "Error al importar Excel: " + e.getMessage()));
        }
    }

    @PostMapping("/session/{sessionId}/purge-obsolete")
    @DeleteMapping("/session/{sessionId}/obsolete")
    public ResponseEntity<?> purgeObsoleteCounts(@PathVariable Long sessionId) {
        User currentUser = userHelper.getCurrentUser();
        try {
            Map<String, Object> result = countService.purgeObsoleteCounts(sessionId, currentUser);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        }
    }

    @GetMapping("/session/{sessionId}/pending-codes")
    public ResponseEntity<?> getPendingCodes(@PathVariable Long sessionId) {
        try {
            List<Map<String, Object>> result = countService.getPendingUnassignedCodes(sessionId);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        }
    }

    @DeleteMapping("/session/{sessionId}/pending-codes")
    public ResponseEntity<?> clearPendingCodes(@PathVariable Long sessionId) {
        User currentUser = userHelper.getCurrentUser();
        try {
            Map<String, Object> result = countService.clearPendingUnassignedCodes(sessionId, currentUser);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        }
    }

    @PostMapping("/session/{sessionId}/auto-assign-master")
    public ResponseEntity<?> autoAssignMasterCatalog(@PathVariable Long sessionId,
                                                     @RequestParam(defaultValue = "ACERO") String family) {
        User currentUser = userHelper.getCurrentUser();
        try {
            Map<String, Object> result = countService.autoAssignFromMasterCatalog(sessionId, family, currentUser);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        }
    }

    @GetMapping("/import-template")
    public ResponseEntity<byte[]> downloadImportTemplate() {
        try {
            byte[] data = countService.generateImportTemplateXlsx();
            return ResponseEntity.ok()
                    .header(org.springframework.http.HttpHeaders.CONTENT_DISPOSITION,
                            "attachment; filename=\"Plantilla_Interflu_Conteo_Por_Nivel.xlsx\"")
                    .contentType(org.springframework.http.MediaType.parseMediaType(
                            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                    .body(data);
        } catch (Exception e) {
            return ResponseEntity.internalServerError().build();
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

    @DeleteMapping("/session/{sessionId}")
    public ResponseEntity<?> clearSessionCounts(@PathVariable Long sessionId) {
        User currentUser = userHelper.getCurrentUser();
        try {
            Map<String, Object> result = countService.clearSessionCounts(sessionId, currentUser);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        }
    }

    @PutMapping("/{id}/section")
    public ResponseEntity<?> updateSection(@PathVariable Long id, @RequestParam(required = false) String section) {
        User currentUser = userHelper.getCurrentUser();
        try {
            CountRecord updated = countService.updateSection(id, section, currentUser);
            return ResponseEntity.ok(toDto(updated));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        }
    }

    @PutMapping("/{id}/location")
    public ResponseEntity<?> updateLocation(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        User currentUser = userHelper.getCurrentUser();
        try {
            Long shelfId = body.containsKey("shelfId") && body.get("shelfId") != null
                    ? ((Number) body.get("shelfId")).longValue() : null;
            String section = body.containsKey("section") && body.get("section") != null
                    ? String.valueOf(body.get("section")) : null;
            String locationCode = body.containsKey("locationCode") && body.get("locationCode") != null
                    ? String.valueOf(body.get("locationCode")) : null;
            Double quantity = body.containsKey("quantity") && body.get("quantity") != null
                    ? ((Number) body.get("quantity")).doubleValue() : null;

            CountRecord updated = countService.updateLocation(id, shelfId, section, locationCode, quantity, currentUser);
            return ResponseEntity.ok(toDto(updated));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        }
    }

    @PutMapping("/batch-location")
    public ResponseEntity<?> batchUpdateLocation(@RequestBody List<Map<String, Object>> items) {
        User currentUser = userHelper.getCurrentUser();
        try {
            List<CountRecord> updated = countService.batchUpdateLocations(items, currentUser);
            return ResponseEntity.ok(updated.stream().map(this::toDto).toList());
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        }
    }

    @GetMapping("/stock-alerts")
    public ResponseEntity<?> getStockAlerts(@RequestParam(required = false) Long sessionId) {
        return ResponseEntity.ok(countService.getStockAlerts(sessionId));
    }

    @PutMapping("/stock-alerts/thresholds")
    public ResponseEntity<?> updateStockThresholds(@RequestBody Map<String, Object> req) {
        User currentUser = userHelper.getCurrentUser();
        try {
            String code = req.get("code") != null ? String.valueOf(req.get("code")) : null;
            Double minStock = req.get("minStock") != null ? ((Number) req.get("minStock")).doubleValue() : null;
            Double reorderPoint = req.get("reorderPoint") != null ? ((Number) req.get("reorderPoint")).doubleValue() : null;
            Double maxStock = req.get("maxStock") != null ? ((Number) req.get("maxStock")).doubleValue() : null;

            Map<String, Object> res = countService.updateStockThresholds(code, minStock, reorderPoint, maxStock, currentUser);
            return ResponseEntity.ok(res);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        }
    }

    @GetMapping("/purchase-order-excel")
    public ResponseEntity<byte[]> downloadPurchaseOrderExcel(@RequestParam(required = false) Long sessionId) {
        try {
            byte[] data = countService.generatePurchaseOrderXlsx(sessionId);
            return ResponseEntity.ok()
                    .header(org.springframework.http.HttpHeaders.CONTENT_DISPOSITION,
                            "attachment; filename=\"Orden_De_Compra_Interflu.xlsx\"")
                    .contentType(org.springframework.http.MediaType.parseMediaType(
                            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                    .body(data);
        } catch (Exception e) {
            return ResponseEntity.internalServerError().build();
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
        map.put("section", r.getSection() != null ? r.getSection() : "");
        map.put("description", r.getProduct() != null ? r.getProduct().getDescription() : r.getCapturedCode());
        map.put("unit", r.getProduct() != null ? r.getProduct().getUnit() : "PZA");
        map.put("existsInCatalog", r.getProduct() != null);
        map.put("quantity", r.getQuantity());
        map.put("previousQuantity", r.getPreviousQuantity());
        map.put("stockSaE", r.getProduct() != null ? r.getProduct().getStockSaE() : 0.0);
        map.put("userName", r.getUser().getFullName());
        map.put("validationStatus", r.getValidationStatus().name());
        map.put("notes", r.getNotes());
        map.put("isSaeExtra", r.getNotes() != null && r.getNotes().contains("SAE_EXTRA"));
        map.put("isUnlocated", (r.getShelf() != null && "PB-PEN-01".equalsIgnoreCase(r.getShelf().getCode()))
                || (r.getNotes() != null && (r.getNotes().contains("SIN_UBICAR") || r.getNotes().contains("SIN_DEFINIR"))));
        map.put("countedAt", r.getCountedAt());
        map.put("updatedAt", r.getUpdatedAt());
        return map;
    }
}
