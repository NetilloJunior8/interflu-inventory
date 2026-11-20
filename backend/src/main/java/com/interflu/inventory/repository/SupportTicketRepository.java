package com.interflu.inventory.repository;

import com.interflu.inventory.model.SupportTicket;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface SupportTicketRepository extends JpaRepository<SupportTicket, Long> {
    List<SupportTicket> findAllByOrderByCreatedAtDesc();
    List<SupportTicket> findByAuthorIdOrderByCreatedAtDesc(Long authorId);
    List<SupportTicket> findByStatusOrderByCreatedAtDesc(SupportTicket.Status status);
    long countByStatus(SupportTicket.Status status);
}
