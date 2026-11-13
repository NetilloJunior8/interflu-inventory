package com.interflu.inventory.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "shelf_assignments", uniqueConstraints = {
    @UniqueConstraint(columnNames = {"session_id", "shelf_id"})
})
public class ShelfAssignment {

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
    @JoinColumn(name = "user_id")
    private User assignedUser;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Status status = Status.PENDIENTE;

    private LocalDateTime assignedAt = LocalDateTime.now();
    private LocalDateTime completedAt;

    public enum Status {
        PENDIENTE,
        EN_CONTEO,
        COMPLETADO
    }

    public ShelfAssignment() {}

    public ShelfAssignment(InventorySession session, Shelf shelf, User assignedUser) {
        this.session = session;
        this.shelf = shelf;
        this.assignedUser = assignedUser;
        this.status = Status.PENDIENTE;
        this.assignedAt = LocalDateTime.now();
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public InventorySession getSession() { return session; }
    public void setSession(InventorySession session) { this.session = session; }

    public Shelf getShelf() { return shelf; }
    public void setShelf(Shelf shelf) { this.shelf = shelf; }

    public User getAssignedUser() { return assignedUser; }
    public void setAssignedUser(User assignedUser) { this.assignedUser = assignedUser; }

    public Status getStatus() { return status; }
    public void setStatus(Status status) { this.status = status; }

    public LocalDateTime getAssignedAt() { return assignedAt; }
    public void setAssignedAt(LocalDateTime assignedAt) { this.assignedAt = assignedAt; }

    public LocalDateTime getCompletedAt() { return completedAt; }
    public void setCompletedAt(LocalDateTime completedAt) { this.completedAt = completedAt; }
}
