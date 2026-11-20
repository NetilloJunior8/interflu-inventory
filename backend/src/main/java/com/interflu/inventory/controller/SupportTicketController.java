package com.interflu.inventory.controller;

import com.interflu.inventory.model.SupportTicket;
import com.interflu.inventory.model.User;
import com.interflu.inventory.repository.SupportTicketRepository;
import com.interflu.inventory.security.CurrentUserHelper;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/support/tickets")
public class SupportTicketController {

    private final SupportTicketRepository ticketRepo;
    private final CurrentUserHelper userHelper;

    public SupportTicketController(SupportTicketRepository ticketRepo, CurrentUserHelper userHelper) {
        this.ticketRepo = ticketRepo;
        this.userHelper = userHelper;
    }

    @PostMapping
    public ResponseEntity<?> createTicket(@RequestBody Map<String, String> body) {
        User author = userHelper.getCurrentUser();
        String subject = body.getOrDefault("subject", "").trim();
        String description = body.getOrDefault("description", "").trim();
        String category = body.getOrDefault("category", "GENERAL").trim();
        String priorityStr = body.getOrDefault("priority", "MEDIA").toUpperCase();

        if (subject.isBlank() || description.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("message", "El asunto y la descripción son obligatorios."));
        }

        long count = ticketRepo.count() + 1;
        String folio = String.format("TCK-%04d", count);

        SupportTicket.Priority priority;
        try {
            priority = SupportTicket.Priority.valueOf(priorityStr);
        } catch (Exception e) {
            priority = SupportTicket.Priority.MEDIA;
        }

        SupportTicket ticket = new SupportTicket(folio, author, category, subject, description, priority);
        ticket = ticketRepo.save(ticket);

        return ResponseEntity.ok(mapTicket(ticket));
    }

    @GetMapping("/pending-count")
    public ResponseEntity<?> getPendingCount() {
        long count = ticketRepo.countByStatus(SupportTicket.Status.PENDIENTE);
        return ResponseEntity.ok(Map.of(
                "pendingCount", count,
                "hasPending", count > 0
        ));
    }

    @GetMapping
    public ResponseEntity<?> listTickets() {
        User currentUser = userHelper.getCurrentUser();
        boolean isSistemas = isSistemasOrAdmin(currentUser);

        List<SupportTicket> list = isSistemas
                ? ticketRepo.findAllByOrderByCreatedAtDesc()
                : ticketRepo.findByAuthorIdOrderByCreatedAtDesc(currentUser.getId());

        return ResponseEntity.ok(list.stream().map(this::mapTicket).toList());
    }

    @PutMapping("/{id}/status")
    public ResponseEntity<?> updateStatus(@PathVariable Long id, @RequestBody Map<String, String> body) {
        User admin = userHelper.getCurrentUser();
        boolean isSistemas = isSistemasOrAdmin(admin);
        if (!isSistemas) {
            return ResponseEntity.status(403).body(Map.of("message", "Acceso denegado. Solo personal de Sistemas o Administradores pueden atender o actualizar el estado de tickets."));
        }

        SupportTicket ticket = ticketRepo.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Ticket no encontrado."));

        String statusStr = body.getOrDefault("status", "EN_ATENCION");
        String notes = body.getOrDefault("adminNotes", "");

        try {
            ticket.setStatus(SupportTicket.Status.valueOf(statusStr));
        } catch (Exception ignored) {}

        if (notes != null && !notes.isBlank()) {
            ticket.setAdminNotes(notes);
        }
        ticket.setAssignedAdmin(admin);

        if (ticket.getStatus() == SupportTicket.Status.RESUELTO) {
            ticket.setResolvedAt(LocalDateTime.now());
        }

        ticket = ticketRepo.save(ticket);
        return ResponseEntity.ok(mapTicket(ticket));
    }

    private boolean isSistemasOrAdmin(User u) {
        if (u == null) return false;
        String r = u.getRole() != null ? u.getRole().toUpperCase().trim() : "";
        String uname = u.getUsername() != null ? u.getUsername().toLowerCase().trim() : "";
        return r.contains("SISTEMA") || r.contains("ADMIN") || uname.equals("sistemas") || uname.equals("admin") || uname.equals("aaron");
    }

    private Map<String, Object> mapTicket(SupportTicket t) {
        Map<String, Object> map = new HashMap<>();
        map.put("id", t.getId());
        map.put("folio", t.getFolio());
        map.put("category", t.getCategory());
        map.put("subject", t.getSubject());
        map.put("description", t.getDescription());
        map.put("status", t.getStatus().name());
        map.put("priority", t.getPriority().name());
        map.put("adminNotes", t.getAdminNotes());
        map.put("authorId", t.getAuthor().getId());
        map.put("authorName", t.getAuthor().getFullName());
        map.put("authorFullName", t.getAuthor().getFullName());
        map.put("authorUsername", t.getAuthor().getUsername());
        map.put("assignedAdminName", t.getAssignedAdmin() != null ? t.getAssignedAdmin().getFullName() : null);
        map.put("createdAt", t.getCreatedAt());
        map.put("resolvedAt", t.getResolvedAt());
        return map;
    }
}
