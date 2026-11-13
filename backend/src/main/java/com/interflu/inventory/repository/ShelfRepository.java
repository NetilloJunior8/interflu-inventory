package com.interflu.inventory.repository;

import com.interflu.inventory.model.Shelf;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface ShelfRepository extends JpaRepository<Shelf, Long> {
    Optional<Shelf> findByCodeIgnoreCase(String code);
    List<Shelf> findByActiveTrueOrderByCodeAsc();
    List<Shelf> findByPlantAndActiveTrueOrderByCodeAsc(String plant);
}
