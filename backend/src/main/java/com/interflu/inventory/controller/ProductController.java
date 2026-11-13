package com.interflu.inventory.controller;

import com.interflu.inventory.dto.ProductDto;
import com.interflu.inventory.model.User;
import com.interflu.inventory.security.CurrentUserHelper;
import com.interflu.inventory.service.AuditService;
import com.interflu.inventory.service.ProductService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/products")
public class ProductController {

    private final ProductService productService;
    private final CurrentUserHelper userHelper;
    private final AuditService auditService;

    public ProductController(ProductService productService, CurrentUserHelper userHelper, AuditService auditService) {
        this.productService = productService;
        this.userHelper = userHelper;
        this.auditService = auditService;
    }

    @GetMapping("/search")
    public List<ProductDto> search(@RequestParam("q") String query) {
        return productService.search(query, false);
    }

    @GetMapping("/by-code")
    public ResponseEntity<?> getByCode(@RequestParam("code") String code) {
        return productService.findByCode(code, false)
                .<ResponseEntity<?>>map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @GetMapping("/count")
    public Map<String, Long> count() {
        return Map.of("total", productService.countProducts());
    }

    @PostMapping("/import")
    public ResponseEntity<?> importCatalog(@RequestParam("file") MultipartFile file) {
        User currentUser = userHelper.getCurrentUser();
        try {
            Map<String, Object> result = productService.importCatalogCsv(file);
            auditService.log(null, null, currentUser.getUsername(), currentUser.getFullName(),
                    "IMPORTAR_CATALOGO", "Product", null, null, String.valueOf(result.get("totalProcessed")),
                    "Importación de catálogo desde archivo " + file.getOriginalFilename());
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("message", "Error al importar archivo: " + e.getMessage()));
        }
    }
}
