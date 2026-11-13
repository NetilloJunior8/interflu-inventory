package com.interflu.inventory.controller;

import com.interflu.inventory.service.ValidationService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/validation")
public class ValidationController {

    private final ValidationService validationService;

    public ValidationController(ValidationService validationService) {
        this.validationService = validationService;
    }

    @GetMapping("/{sessionId}")
    public ResponseEntity<?> validate(@PathVariable Long sessionId) {
        return ResponseEntity.ok(validationService.validateSession(sessionId));
    }
}
