package com.interflu.inventory.controller;

import com.interflu.inventory.dto.SessionDto;
import com.interflu.inventory.model.ShelfAssignment;
import com.interflu.inventory.model.User;
import com.interflu.inventory.security.CurrentUserHelper;
import com.interflu.inventory.service.InventorySessionService;
import com.interflu.inventory.service.SaeExportService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/sessions")
public class InventorySessionController {

    private final InventorySessionService sessionService;
    private final CurrentUserHelper userHelper;

    public InventorySessionController(InventorySessionService sessionService, CurrentUserHelper userHelper) {
        this.sessionService = sessionService;
        this.userHelper = userHelper;
    }

    @GetMapping
    public List<Map<String, Object>> listSessions() {
        return sessionService.getAllSessions();
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> getSession(@PathVariable Long id) {
        return sessionService.getById(id)
                .<ResponseEntity<?>>map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @PostMapping
    public ResponseEntity<?> createSession(@RequestBody SessionDto.CreateSessionRequest req) {
        User currentUser = userHelper.getCurrentUser();
        return ResponseEntity.ok(sessionService.createSession(req, currentUser));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> deleteSession(@PathVariable Long id) {
        User currentUser = userHelper.getCurrentUser();
        try {
            sessionService.deleteSession(id, currentUser);
            return ResponseEntity.ok(Map.of("message", "Inventario eliminado exitosamente"));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        }
    }

    @PostMapping("/{id}/close")
    public ResponseEntity<?> closeSession(@PathVariable Long id, @RequestBody SessionDto.CloseSessionRequest req) {
        User currentUser = userHelper.getCurrentUser();
        return ResponseEntity.ok(sessionService.closeSession(id, req, currentUser));
    }

    @PostMapping("/{id}/reopen")
    public ResponseEntity<?> reopenSession(@PathVariable Long id, @RequestBody SessionDto.ReopenSessionRequest req) {
        User currentUser = userHelper.getCurrentUser();
        try {
            return ResponseEntity.ok(sessionService.reopenSession(id, req, currentUser));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        }
    }

    @PostMapping("/{id}/status")
    public ResponseEntity<?> updateStatus(@PathVariable Long id, @RequestBody Map<String, String> body) {
        User currentUser = userHelper.getCurrentUser();
        try {
            String status = body.get("status");
            String notes = body.getOrDefault("notes", "");
            return ResponseEntity.ok(sessionService.updateStatus(id, status, notes, currentUser));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        }
    }

    @GetMapping("/{id}/shelves")
    public List<Map<String, Object>> getShelves(@PathVariable Long id) {
        User currentUser = userHelper.getCurrentUser();
        return sessionService.getShelfAssignments(id, currentUser);
    }

    @PostMapping("/{id}/shelves/assign")
    public ResponseEntity<?> assignShelf(@PathVariable Long id, @RequestBody SessionDto.AssignShelfRequest req) {
        User currentUser = userHelper.getCurrentUser();
        sessionService.assignShelfToUser(id, req.getShelfId(), req.getUserId(), currentUser);
        return ResponseEntity.ok(Map.of("status", "ok"));
    }

    @PostMapping("/{id}/shelves/{shelfId}/status")
    public ResponseEntity<?> updateShelfStatus(@PathVariable Long id,
                                               @PathVariable Long shelfId,
                                               @RequestBody Map<String, String> body) {
        User currentUser = userHelper.getCurrentUser();
        ShelfAssignment.Status status = ShelfAssignment.Status.valueOf(body.get("status"));
        sessionService.updateShelfStatus(id, shelfId, status, currentUser);
        return ResponseEntity.ok(Map.of("status", "ok"));
    }

    @PostMapping("/{id}/shelves/{shelfId}/reset")
    public ResponseEntity<?> resetShelf(@PathVariable Long id,
                                        @PathVariable Long shelfId,
                                        @RequestBody(required = false) Map<String, Boolean> body) {
        User currentUser = userHelper.getCurrentUser();
        boolean clearRecords = body != null && Boolean.TRUE.equals(body.get("clearRecords"));
        sessionService.resetShelf(id, shelfId, clearRecords, currentUser);
        return ResponseEntity.ok(Map.of("status", "ok", "shelfStatus", "PENDIENTE"));
    }

    @GetMapping("/{id}/export-stats-excel")
    public ResponseEntity<byte[]> exportDashboardStatsExcel(@PathVariable Long id) {
        User currentUser = userHelper.getCurrentUser();
        SaeExportService.ExportResult result = sessionService.generateDashboardStatsExcel(id, currentUser);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + result.getFileName() + "\"")
                .header(HttpHeaders.CONTENT_TYPE, result.getContentType())
                .body(result.getContent());
    }
}
