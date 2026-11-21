package com.interflu.inventory.repository;

import com.interflu.inventory.model.Shelf;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;
import java.util.Optional;

public interface ShelfRepository extends JpaRepository<Shelf, Long> {
    @Query("SELECT s FROM Shelf s WHERE UPPER(TRIM(s.code)) = UPPER(TRIM(:code)) ORDER BY s.id ASC")
    List<Shelf> findAllByCodeIgnoreCase(@Param("code") String code);

    default Optional<Shelf> findByCodeIgnoreCase(String code) {
        List<Shelf> list = findAllByCodeIgnoreCase(code);
        return list.isEmpty() ? Optional.empty() : Optional.of(list.get(0));
    }

    List<Shelf> findByActiveTrueOrderByCodeAsc();
    List<Shelf> findByPlantAndActiveTrueOrderByCodeAsc(String plant);
}
