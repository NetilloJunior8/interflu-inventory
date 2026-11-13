package com.interflu.inventory.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "sae_export_logs")
public class SaeExportLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "session_id", nullable = false)
    private InventorySession session;

    @Column(nullable = false, length = 10)
    private String format; // CSV or TXT

    @Column(nullable = false, length = 150)
    private String fileName;

    private Integer totalRows;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private ImportStatus importStatus = ImportStatus.GENERADO;

    @Column(length = 400)
    private String reconciliationNotes;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "exported_by_id")
    private User exportedBy;

    private LocalDateTime exportedAt = LocalDateTime.now();
    private LocalDateTime reconciledAt;

    public enum ImportStatus {
        GENERADO,
        IMPORTADO_EXITO,
        IMPORTADO_CON_ERROR
    }

    public SaeExportLog() {}

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public InventorySession getSession() { return session; }
    public void setSession(InventorySession session) { this.session = session; }

    public String getFormat() { return format; }
    public void setFormat(String format) { this.format = format; }

    public String getFileName() { return fileName; }
    public void setFileName(String fileName) { this.fileName = fileName; }

    public Integer getTotalRows() { return totalRows; }
    public void setTotalRows(Integer totalRows) { this.totalRows = totalRows; }

    public ImportStatus getImportStatus() { return importStatus; }
    public void setImportStatus(ImportStatus importStatus) { this.importStatus = importStatus; }

    public String getReconciliationNotes() { return reconciliationNotes; }
    public void setReconciliationNotes(String reconciliationNotes) { this.reconciliationNotes = reconciliationNotes; }

    public User getExportedBy() { return exportedBy; }
    public void setExportedBy(User exportedBy) { this.exportedBy = exportedBy; }

    public LocalDateTime getExportedAt() { return exportedAt; }
    public void setExportedAt(LocalDateTime exportedAt) { this.exportedAt = exportedAt; }

    public LocalDateTime getReconciledAt() { return reconciledAt; }
    public void setReconciledAt(LocalDateTime reconciledAt) { this.reconciledAt = reconciledAt; }
}
