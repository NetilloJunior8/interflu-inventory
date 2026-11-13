package com.interflu.inventory.dto;

import com.interflu.inventory.model.Product;

public class ProductDto {
    private Long id;
    private String code;
    private String description;
    private String unit;
    private String line;
    private String locationSaE;
    private Double stockSaE; // Nullified for CONTADOR role

    public static ProductDto from(Product p, boolean hideSaeStock) {
        ProductDto dto = new ProductDto();
        dto.id = p.getId();
        dto.code = p.getCode();
        dto.description = p.getDescription();
        dto.unit = p.getUnit();
        dto.line = p.getLine();
        dto.locationSaE = p.getLocationSaE();
        dto.stockSaE = hideSaeStock ? null : p.getStockSaE();
        return dto;
    }

    public Long getId() { return id; }
    public String getCode() { return code; }
    public String getDescription() { return description; }
    public String getUnit() { return unit; }
    public String getLine() { return line; }
    public String getLocationSaE() { return locationSaE; }
    public Double getStockSaE() { return stockSaE; }
}
