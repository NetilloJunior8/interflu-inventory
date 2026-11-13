package com.interflu.inventory.controller;

import com.interflu.inventory.model.SaeExportLog;
import com.interflu.inventory.model.User;
import com.interflu.inventory.security.CurrentUserHelper;
import com.interflu.inventory.service.SaeExportService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/export")
public class SaeExportController {

    private final SaeExportService exportService;
    private final CurrentUserHelper userHelper;

    public SaeExportController(SaeExportService exportService, CurrentUserHelper userHelper) {
        this.exportService = exportService;
        this.userHelper = userHelper;
    }

    @GetMapping("/sae/{sessionId}")
    public ResponseEntity<?> downloadSaeFile(@PathVariable Long sessionId,
                                             @RequestParam(required = false) Long shelfId,
                                             @RequestParam(defaultValue = "CSV") String format,
                                             @RequestParam(defaultValue = "IMPORT") String layout) {
        User currentUser = userHelper.getCurrentUser();
        SaeExportService.ExportResult result = exportService.generateExport(sessionId, shelfId, format, layout, currentUser);

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + result.getFileName() + "\"")
                .contentType(MediaType.parseMediaType(result.getContentType()))
                .body(result.getContent());
    }

    @GetMapping("/history")
    public ResponseEntity<?> getHistory(@RequestParam(required = false) Long sessionId) {
        List<SaeExportLog> logs = exportService.getExportHistory(sessionId);
        return ResponseEntity.ok(logs);
    }

    @PostMapping("/{exportId}/status")
    public ResponseEntity<?> updateImportStatus(@PathVariable Long exportId, @RequestBody Map<String, String> body) {
        User currentUser = userHelper.getCurrentUser();
        SaeExportLog.ImportStatus status = SaeExportLog.ImportStatus.valueOf(body.get("status"));
        String notes = body.getOrDefault("notes", "");
        return ResponseEntity.ok(exportService.updateImportStatus(exportId, status, notes, currentUser));
    }
}
