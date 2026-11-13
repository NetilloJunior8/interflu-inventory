package com.interflu.inventory.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "products", indexes = {
    @Index(name = "idx_product_code", columnList = "code", unique = true),
    @Index(name = "idx_product_desc", columnList = "description"),
    @Index(name = "idx_product_line", columnList = "line")
})
public class Product {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // Clave de artículo en Aspel SAE (CVE_ART)
    @Column(nullable = false, unique = true, length = 40)
    private String code;

    // Descripción del producto (DESCR)
    @Column(nullable = false, length = 250)
    private String description;

    // Unidad de medida (UNI_MED, e.g., PZA, MTO, KGS, LT, JGO)
    @Column(length = 20)
    private String unit = "PZA";

    // Línea o categoría de producto (LIN_PROD)
    @Column(length = 50)
    private String line;

    // Control de almacén / ubicación sugerida en SAE (CTRL_ALM)
    @Column(length = 50)
    private String locationSaE;

    // Existencia teórica en Aspel SAE (para cálculo de diferencias)
    @Column(nullable = false)
    private Double stockSaE = 0.0;

    // Código de barras / QR si existe
    @Column(length = 50)
    private String barcode;

    private boolean active = true;

    private LocalDateTime updatedAt = LocalDateTime.now();

    public Product() {}

    public Product(String code, String description, String unit, String line, String locationSaE, Double stockSaE) {
        this.code = code;
        this.description = description;
        this.unit = unit != null ? unit : "PZA";
        this.line = line;
        this.locationSaE = locationSaE;
        this.stockSaE = stockSaE != null ? stockSaE : 0.0;
        this.active = true;
        this.updatedAt = LocalDateTime.now();
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getCode() { return code; }
    public void setCode(String code) { this.code = code; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public String getUnit() { return unit; }
    public void setUnit(String unit) { this.unit = unit; }

    public String getLine() { return line; }
    public void setLine(String line) { this.line = line; }

    public String getLocationSaE() { return locationSaE; }
    public void setLocationSaE(String locationSaE) { this.locationSaE = locationSaE; }

    public Double getStockSaE() { return stockSaE; }
    public void setStockSaE(Double stockSaE) { this.stockSaE = stockSaE; }

    public String getBarcode() { return barcode; }
    public void setBarcode(String barcode) { this.barcode = barcode; }

    public boolean isActive() { return active; }
    public void setActive(boolean active) { this.active = active; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
