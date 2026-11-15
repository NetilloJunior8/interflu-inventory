package com.interflu.inventory.repository;

import com.interflu.inventory.model.ShelfAssignment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;
import java.util.Optional;

public interface ShelfAssignmentRepository extends JpaRepository<ShelfAssignment, Long> {
    @Query("SELECT sa FROM ShelfAssignment sa JOIN FETCH sa.shelf s LEFT JOIN FETCH sa.assignedUser u WHERE sa.session.id = :sessionId AND s.active = true ORDER BY s.code ASC")
    List<ShelfAssignment> findBySessionIdOrderByShelfCodeAsc(@Param("sessionId") Long sessionId);

    @Query("SELECT sa FROM ShelfAssignment sa JOIN FETCH sa.shelf s LEFT JOIN FETCH sa.assignedUser u WHERE sa.session.id = :sessionId AND sa.assignedUser.id = :userId AND s.active = true ORDER BY s.code ASC")
    List<ShelfAssignment> findBySessionIdAndAssignedUserIdOrderByShelfCodeAsc(@Param("sessionId") Long sessionId, @Param("userId") Long userId);

    Optional<ShelfAssignment> findBySessionIdAndShelfId(Long sessionId, Long shelfId);
}

