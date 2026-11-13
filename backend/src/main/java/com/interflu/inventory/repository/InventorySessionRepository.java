package com.interflu.inventory.repository;

import com.interflu.inventory.model.InventorySession;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface InventorySessionRepository extends JpaRepository<InventorySession, Long> {
    Optional<InventorySession> findByFolio(String folio);
    List<InventorySession> findAllByOrderByCreatedAtDesc();
}
