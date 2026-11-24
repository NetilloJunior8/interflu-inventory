package com.interflu.inventory.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "count_records", indexes = {
    @Index(name = "idx_count_session_shelf", columnList = "session_id, shelf_id"),
    @Index(name = "idx_count_session_code", columnList = "session_id, captured_code")
})
public class CountRecord {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "session_id", nullable = false)
    private InventorySession session;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "shelf_id", nullable = false)
    private Shelf shelf;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "product_id")
    private Product product;

    @Column(name = "captured_code", nullable = false, length = 50)
    private String capturedCode;

    @Column(nullable = false)
    private Double quantity;

    private Double previousQuantity;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private ValidationStatus validationStatus = ValidationStatus.VALIDO;

    @Column(name = "section_level", length = 10)
    private String section;

    @Column(length = 300)
    private String notes;

    private LocalDateTime countedAt = LocalDateTime.now();
    private LocalDateTime updatedAt = LocalDateTime.now();

    @Version
    private Long version = 0L;

    @PrePersist
    @PreUpdate
    public void ensureVersion() {
        if (this.version == null) {
            this.version = 0L;
        }
    }

    public enum ValidationStatus {
        VALIDO,
        REPETIDO_SUMADO,
        REPETIDO_REEMPLAZADO,
        CODIGO_INEXISTENTE,
        VALIDADO_SUPERVISOR
    }

    public CountRecord() {}

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public InventorySession getSession() { return session; }
    public void setSession(InventorySession session) { this.session = session; }

    public Shelf getShelf() { return shelf; }
    public void setShelf(Shelf shelf) { this.shelf = shelf; }

    public Product getProduct() { return product; }
    public void setProduct(Product product) { this.product = product; }

    public String getCapturedCode() { return capturedCode; }
    public void setCapturedCode(String capturedCode) { this.capturedCode = capturedCode; }

    public Double getQuantity() { return quantity; }
    public void setQuantity(Double quantity) { this.quantity = quantity; }

    public Double getPreviousQuantity() { return previousQuantity; }
    public void setPreviousQuantity(Double previousQuantity) { this.previousQuantity = previousQuantity; }

    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }

    public ValidationStatus getValidationStatus() { return validationStatus; }
    public void setValidationStatus(ValidationStatus validationStatus) { this.validationStatus = validationStatus; }

    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }

    public LocalDateTime getCountedAt() { return countedAt; }
    public void setCountedAt(LocalDateTime countedAt) { this.countedAt = countedAt; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }

    public String getSection() { return section; }
    public void setSection(String section) { this.section = normalizeSection(section); }

    public static String normalizeSection(String sec) {
        if (sec == null) return null;
        String clean = sec.trim().toUpperCase();
        if (clean.equals("SUPERIOR") || clean.equals("COPETE") || clean.equals("S0") || clean.equals("S-SUPERIOR")) {
            return "S";
        }
        if (clean.matches("^[SA-J]$")) {
            return clean;
        }
        return null;
    }

    public Long getVersion() { return version; }
    public void setVersion(Long version) { this.version = version; }
}
