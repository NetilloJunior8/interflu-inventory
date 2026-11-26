package com.interflu.inventory.repository;

import com.interflu.inventory.model.ShelfAssignment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;
import java.util.Optional;

public interface ShelfAssignmentRepository extends JpaRepository<ShelfAssignment, Long> {
    @Query("SELECT sa FROM ShelfAssignment sa JOIN FETCH sa.shelf s LEFT JOIN FETCH sa.assignedUser u WHERE sa.session.id = :sessionId AND s.active = true ORDER BY s.code ASC")
    List<ShelfAssignment> findBySessionIdOrderByShelfCodeAsc(@Param("sessionId") Long sessionId);

    @Query("SELECT sa FROM ShelfAssignment sa JOIN FETCH sa.shelf s LEFT JOIN FETCH sa.assignedUser u WHERE sa.session.id = :sessionId AND sa.assignedUser.id = :userId AND s.active = true ORDER BY s.code ASC")
    List<ShelfAssignment> findBySessionIdAndAssignedUserIdOrderByShelfCodeAsc(@Param("sessionId") Long sessionId, @Param("userId") Long userId);

    @Query("SELECT sa FROM ShelfAssignment sa WHERE sa.session.id = :sessionId AND sa.shelf.id = :shelfId ORDER BY sa.id ASC")
    List<ShelfAssignment> findAllBySessionIdAndShelfId(@Param("sessionId") Long sessionId, @Param("shelfId") Long shelfId);

    default Optional<ShelfAssignment> findBySessionIdAndShelfId(Long sessionId, Long shelfId) {
        List<ShelfAssignment> list = findAllBySessionIdAndShelfId(sessionId, shelfId);
        return list.isEmpty() ? Optional.empty() : Optional.of(list.get(0));
    }

    default Optional<ShelfAssignment> findFirstBySessionIdAndShelfId(Long sessionId, Long shelfId) {
        return findBySessionIdAndShelfId(sessionId, shelfId);
    }

    @Query("SELECT sa FROM ShelfAssignment sa WHERE sa.shelf.id = :shelfId")
    List<ShelfAssignment> findByShelfId(@Param("shelfId") Long shelfId);

    @Modifying
    @Transactional
    @Query("UPDATE ShelfAssignment sa SET sa.status = com.interflu.inventory.model.ShelfAssignment.Status.PENDIENTE, sa.completedAt = null WHERE sa.session.id = :sessionId")
    int resetAllBySessionId(@Param("sessionId") Long sessionId);

    @Modifying
    @Transactional
    @Query("DELETE FROM ShelfAssignment sa WHERE sa.shelf.id = :shelfId")
    int deleteByShelfId(@Param("shelfId") Long shelfId);
}

