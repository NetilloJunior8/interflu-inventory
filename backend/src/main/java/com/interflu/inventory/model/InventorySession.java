package com.interflu.inventory.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "inventory_sessions", indexes = {
    @Index(name = "idx_inv_folio", columnList = "folio", unique = true)
})
public class InventorySession {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 30)
    private String folio;

    @Column(nullable = false, length = 150)
    private String title;

    @Column(nullable = false, length = 20)
    private String warehouseCode = "1";

    @Column(length = 80)
    private String warehouseName = "Almacén Principal";

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private Status status = Status.EN_CONTEO;

    @Column(length = 500)
    private String notes;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "created_by_id")
    private User createdBy;

    private LocalDateTime createdAt = LocalDateTime.now();

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "closed_by_id")
    private User closedBy;

    private LocalDateTime closedAt;

    @Column(length = 300)
    private String closeNotes;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "reopened_by_id")
    private User reopenedBy;

    private LocalDateTime reopenedAt;

    @Column(length = 300)
    private String reopenReason;

    public enum Status {
        BORRADOR,
        EN_CONTEO,
        POR_VALIDAR,
        CERRADO_EXITO,
        CERRADO_NO_EXITO,
        REABIERTO
    }

    public InventorySession() {}

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getFolio() { return folio; }
    public void setFolio(String folio) { this.folio = folio; }

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public String getWarehouseCode() { return warehouseCode; }
    public void setWarehouseCode(String warehouseCode) { this.warehouseCode = warehouseCode; }

    public String getWarehouseName() { return warehouseName; }
    public void setWarehouseName(String warehouseName) { this.warehouseName = warehouseName; }

    public Status getStatus() { return status; }
    public void setStatus(Status status) { this.status = status; }

    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }

    public User getCreatedBy() { return createdBy; }
    public void setCreatedBy(User createdBy) { this.createdBy = createdBy; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public User getClosedBy() { return closedBy; }
    public void setClosedBy(User closedBy) { this.closedBy = closedBy; }

    public LocalDateTime getClosedAt() { return closedAt; }
    public void setClosedAt(LocalDateTime closedAt) { this.closedAt = closedAt; }

    public String getCloseNotes() { return closeNotes; }
    public void setCloseNotes(String closeNotes) { this.closeNotes = closeNotes; }

    public User getReopenedBy() { return reopenedBy; }
    public void setReopenedBy(User reopenedBy) { this.reopenedBy = reopenedBy; }

    public LocalDateTime getReopenedAt() { return reopenedAt; }
    public void setReopenedAt(LocalDateTime reopenedAt) { this.reopenedAt = reopenedAt; }

    public String getReopenReason() { return reopenReason; }
    public void setReopenReason(String reopenReason) { this.reopenReason = reopenReason; }

    public boolean isEditable() {
        return status == Status.BORRADOR || status == Status.EN_CONTEO || status == Status.REABIERTO;
    }
}
