package com.interflu.inventory.controller;

import com.interflu.inventory.model.AuditLog;
import com.interflu.inventory.service.AuditService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/audit")
public class AuditController {

    private final AuditService auditService;

    public AuditController(AuditService auditService) {
        this.auditService = auditService;
    }

    @GetMapping
    public ResponseEntity<?> getLogs(@RequestParam(required = false) Long sessionId,
                                     @RequestParam(defaultValue = "100") int limit) {
        List<AuditLog> logs = (sessionId != null)
                ? auditService.getLogsBySession(sessionId, limit)
                : auditService.getRecentLogs(limit);
        return ResponseEntity.ok(logs);
    }
}
