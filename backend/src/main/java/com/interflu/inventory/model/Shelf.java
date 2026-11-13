package com.interflu.inventory.model;

import jakarta.persistence.*;

@Entity
@Table(name = "shelves", indexes = {
    @Index(name = "idx_shelf_code", columnList = "code", unique = true),
    @Index(name = "idx_shelf_plant", columnList = "plant")
})
public class Shelf {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 30)
    private String code;

    @Column(nullable = false, length = 100)
    private String zone;

    @Column(length = 200)
    private String description;

    @Column(nullable = false, length = 20)
    private String warehouseCode = "1";

    @Column(nullable = false, length = 30)
    private String plant = "Planta 1"; // "Planta 1" or "Planta 2"

    // Coordinates for visual croquis / blueprint layout (0% to 100%)
    private Double posX = 10.0;
    private Double posY = 10.0;
    private Double width = 12.0;
    private Double height = 8.0;

    private boolean active = true;

    public Shelf() {}

    public Shelf(String code, String zone, String description, String warehouseCode, String plant,
                 Double posX, Double posY, Double width, Double height) {
        this.code = code;
        this.zone = zone;
        this.description = description;
        this.warehouseCode = warehouseCode != null ? warehouseCode : "1";
        this.plant = plant != null ? plant : "Planta 1";
        this.posX = posX != null ? posX : 10.0;
        this.posY = posY != null ? posY : 10.0;
        this.width = width != null ? width : 12.0;
        this.height = height != null ? height : 8.0;
        this.active = true;
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getCode() { return code; }
    public void setCode(String code) { this.code = code; }

    public String getZone() { return zone; }
    public void setZone(String zone) { this.zone = zone; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public String getWarehouseCode() { return warehouseCode; }
    public void setWarehouseCode(String warehouseCode) { this.warehouseCode = warehouseCode; }

    public String getPlant() { return plant; }
    public void setPlant(String plant) { this.plant = plant; }

    public Double getPosX() { return posX; }
    public void setPosX(Double posX) { this.posX = posX; }

    public Double getPosY() { return posY; }
    public void setPosY(Double posY) { this.posY = posY; }

    public Double getWidth() { return width; }
    public void setWidth(Double width) { this.width = width; }

    public Double getHeight() { return height; }
    public void setHeight(Double height) { this.height = height; }

    public boolean isActive() { return active; }
    public void setActive(boolean active) { this.active = active; }
}
